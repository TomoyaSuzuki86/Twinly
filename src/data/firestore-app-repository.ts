import {
  collection, doc, getDocFromServer, getDocs, limit, onSnapshot, orderBy,
  query, runTransaction, serverTimestamp, startAfter, where,
  type Firestore, type QueryDocumentSnapshot,
} from "firebase/firestore";
import type { AppState, EventType, LogEvent } from "@/types";
import { createInitialAppState, stripLegacyCalendarFields, toSharedAppState } from "@/lib/app-state";
import { removeUndefined } from "@/lib/utils";
import {
  applyMutation,
  reconcileStockConsumption,
  sameValue,
  type AppMutation,
  type AppRepository,
  type CommitResult,
  type EventChange,
  type SettingChange,
  type SyncConflict,
} from "./app-repository";

export const RECENT_DAYS = 30;
const PAGE_SIZE = 400;
const EVENT_FIELDS: (keyof LogEvent)[] = [
  "babyId", "type", "timestamp", "milkMl", "milkMethod", "diaperKind", "diaperSizeUsed",
  "temperature", "weight", "height", "note",
];

const decode = (data: Record<string, unknown> | undefined): AppState => {
  if (!data?.app) return createInitialAppState();
  const stored = data.app as AppState;
  return stripLegacyCalendarFields({ ...stored, events: stored.events ?? [], ui: createInitialAppState().ui });
};

const conflictValue = (value: unknown) => value === undefined ? null : value;
const setEventValue = (event: LogEvent, field: keyof LogEvent, value: unknown) => {
  const target = event as unknown as Record<string, unknown>;
  if (value === undefined) delete target[field as string];
  else target[field as string] = value;
};
const getPathValue = (state: AppState, path: string[]) => {
  let value: unknown = state;
  for (const key of path) value = (value as Record<string, unknown> | undefined)?.[key];
  return value;
};
const mutationHasChanges = (mutation: AppMutation | undefined) => Boolean(mutation && (mutation.events.length || mutation.settings.length));

function mergeEventChange(change: EventChange, remote: LogEvent | undefined, mutationId: string) {
  const conflicts: SyncConflict[] = [];
  const before = change.before;
  const local = change.after;
  const identity = local ?? remote ?? before;
  const addRecordConflict = () => {
    conflicts.push({
      id: `${mutationId}:event:${change.id}:__record__`,
      mutationId,
      kind: "event",
      field: "__record__",
      eventId: change.id,
      babyId: identity?.babyId,
      eventType: identity?.type,
      localValue: conflictValue(local),
      remoteValue: conflictValue(remote),
    });
  };

  if (!before && local) {
    if (!remote) return { confirmed: change, conflicts };
    if (sameValue(remote, local)) return { conflicts };
    addRecordConflict();
    return { unresolved: { id: change.id, before: remote, after: local }, conflicts };
  }

  if (before && !local) {
    if (!remote) return { conflicts };
    if (sameValue(remote, before)) return { confirmed: { id: change.id, before: remote }, conflicts };
    addRecordConflict();
    return { unresolved: { id: change.id, before: remote }, conflicts };
  }

  if (!before || !local) return { conflicts };
  if (!remote) {
    addRecordConflict();
    return { unresolved: { id: change.id, after: local }, conflicts };
  }

  const merged = structuredClone(remote);
  const unresolvedValues = new Map<keyof LogEvent, unknown>();
  let mergedChanged = false;

  for (const field of EVENT_FIELDS) {
    const beforeValue = before[field];
    const localValue = local[field];
    const remoteValue = remote[field];
    if (sameValue(beforeValue, localValue)) continue;

    const remoteChanged = !sameValue(beforeValue, remoteValue);
    if (remoteChanged && !sameValue(localValue, remoteValue)) {
      conflicts.push({
        id: `${mutationId}:event:${change.id}:${String(field)}`,
        mutationId,
        kind: "event",
        field: String(field),
        eventId: change.id,
        babyId: identity?.babyId,
        eventType: identity?.type,
        localValue: conflictValue(localValue),
        remoteValue: conflictValue(remoteValue),
      });
      unresolvedValues.set(field, localValue);
      continue;
    }

    if (!sameValue(remoteValue, localValue)) {
      setEventValue(merged, field, localValue);
      mergedChanged = true;
    }
  }

  if (mergedChanged) {
    if (local.updatedByUid !== undefined) merged.updatedByUid = local.updatedByUid;
    if (local.updatedAt !== undefined) merged.updatedAt = local.updatedAt;
  }

  const confirmed = mergedChanged ? { id: change.id, before: remote, after: merged } : undefined;
  if (!unresolvedValues.size) return { confirmed, conflicts };

  const unresolvedAfter = structuredClone(merged);
  unresolvedValues.forEach((value, field) => setEventValue(unresolvedAfter, field, value));
  if (local.updatedByUid !== undefined) unresolvedAfter.updatedByUid = local.updatedByUid;
  if (local.updatedAt !== undefined) unresolvedAfter.updatedAt = local.updatedAt;
  return { confirmed, unresolved: { id: change.id, before: merged, after: unresolvedAfter }, conflicts };
}

export function createFirestoreAppRepository(db: Firestore, familyId: string, userId: string, allHistory = false): AppRepository {
  const familyRef = doc(db, "families", familyId);
  const stateRef = doc(familyRef, "app", "state");
  const eventsRef = collection(familyRef, "events");
  let storageVersion = 1;
  const validate = (mutation: AppMutation) => {
    if (storageVersion === 2 && mutation.events.length > 450) {
      throw new Error("一括変更は450件までです。全件の復元・削除は管理者による作業が必要です。");
    }
  };
  return {
    validate,
    subscribe(onChange, onError) {
      let stopped = false;
      let version = 0;
      let stopEvents = () => {};
      let current = createInitialAppState();
      let recent: LogEvent[] = [];
      let seeds: LogEvent[] = [];
      let ready = false;
      let fromCache = true;
      let stateFromCache = true;
      let expectedEventSources = 0;
      const eventSourceCache = new Map<string, boolean>();
      const refreshCacheStatus = () => {
        if (!expectedEventSources) {
          fromCache = stateFromCache;
          return;
        }
        fromCache = stateFromCache || eventSourceCache.size < expectedEventSources ||
          [...eventSourceCache.values()].some(Boolean);
      };
      const emit = () => {
        if (stopped || !ready) return;
        refreshCacheStatus();
        const byId = new Map([...seeds, ...recent].map((event) => [event.id, event]));
        onChange({ app: { ...current, events: [...byId.values()].sort((a, b) => b.timestamp - a.timestamp) },
          fromCache, completeHistory: allHistory });
      };
      const stopState = onSnapshot(stateRef, { includeMetadataChanges: true }, (snapshot) => {
        if (stopped) return;
        stateFromCache = snapshot.metadata.fromCache;
        const data = snapshot.data();
        storageVersion = !snapshot.exists() || data?.schemaVersion === 2 ? 2 : 1;
        if (data?.migrationState === "copying") {
          onError(new Error("記録の保存方式を更新しています。少し待ってから再読み込みしてください。"));
          return;
        }
        current = decode(data);
        if (data?.schemaVersion !== 2) {
          onChange({ app: current, fromCache: stateFromCache, completeHistory: true });
          return;
        }
        if (version === 2) { emit(); return; }
        version = 2;
        if (allHistory) {
          expectedEventSources = 1;
          stopEvents = onSnapshot(query(eventsRef, orderBy("timestamp", "desc")), { includeMetadataChanges: true }, (rows) => {
            if (stopped) return;
            recent = rows.docs.map((row) => ({ ...row.data(), id: row.id }) as LogEvent);
            eventSourceCache.set("all", rows.metadata.fromCache);
            ready = true;
            emit();
          }, onError);
          return;
        }
        const since = Date.now() - RECENT_DAYS * 86400000;
        const types: EventType[] = ["milk", "solidFood", "diaper", "sleepStart", "wake", "weight", "height"];
        expectedEventSources = types.length * 2 + 1;
        const seedRows = new Map<string, LogEvent[]>();
        const stops: (() => void)[] = [];
        let windowReady = false;
        const finish = () => {
          ready = windowReady && seedRows.size === types.length * 2;
          seeds = [...seedRows.values()].flat();
          emit();
        };
        for (const babyId of ["A", "B"] as const) for (const type of types) {
          const sourceKey = `${babyId}:${type}`;
          stops.push(onSnapshot(query(eventsRef, where("babyId", "==", babyId), where("type", "==", type),
            where("timestamp", "<", since), orderBy("timestamp", "desc"), limit(1)), { includeMetadataChanges: true }, (rows) => {
              seedRows.set(sourceKey, rows.docs.map((row) => ({ ...row.data(), id: row.id }) as LogEvent));
              eventSourceCache.set(sourceKey, rows.metadata.fromCache);
              finish();
            }, onError));
        }
        stops.push(onSnapshot(query(eventsRef, where("timestamp", ">=", since), orderBy("timestamp", "desc")),
          { includeMetadataChanges: true }, (rows) => {
            recent = rows.docs.map((item) => ({ ...item.data(), id: item.id }) as LogEvent);
            eventSourceCache.set("window", rows.metadata.fromCache);
            windowReady = true;
            finish();
          }, onError));
        stopEvents = () => stops.forEach((stop) => stop());
      }, onError);
      return () => { stopped = true; stopState(); stopEvents(); };
    },
    async commit(mutation: AppMutation) {
      const receiptRef = doc(familyRef, "mutations", mutation.id);
      return runTransaction(db, async (transaction) => {
        const [receipt, snapshot] = await Promise.all([transaction.get(receiptRef), transaction.get(stateRef)]);
        if (receipt.exists()) {
          const storedResult = receipt.data().result as CommitResult | undefined;
          if (storedResult) return storedResult;
          return { ...mutation, settings: receipt.data().settings,
            events: mutation.events.map((change) => ({ ...change, after: change.after && receipt.data().consumption?.[change.id] !== undefined
              ? { ...change.after, diaperStockConsumed: receipt.data().consumption[change.id] } : change.after })) };
        }

        const data = snapshot.data();
        if (data?.migrationState === "copying") throw new Error("保存方式の更新中です。完了後に再試行してください。");
        let current = decode(data);
        const v2 = !snapshot.exists() || data?.schemaVersion === 2;
        if (v2 && mutation.events.length > 450) throw new Error("一度に変更できる記録は450件までです。大量の復元・削除は管理用移行手順を利用してください。");

        const remoteEvents = new Map<string, LogEvent>();
        if (v2) {
          const rows = await Promise.all(mutation.events.map((change) => transaction.get(doc(eventsRef, change.id))));
          rows.forEach((row) => {
            if (row.exists()) remoteEvents.set(row.id, { ...row.data(), id: row.id } as LogEvent);
          });
          current = { ...current, events: [...remoteEvents.values()] };
        } else {
          current.events.forEach((event) => remoteEvents.set(event.id, event));
        }

        const confirmedEvents: EventChange[] = [];
        const unresolvedEvents: EventChange[] = [];
        const conflicts: SyncConflict[] = [];
        for (const change of mutation.events) {
          const merged = mergeEventChange(change, remoteEvents.get(change.id), mutation.id);
          if (merged.confirmed) confirmedEvents.push(merged.confirmed);
          if (merged.unresolved) unresolvedEvents.push(merged.unresolved);
          conflicts.push(...merged.conflicts);
        }

        const confirmedSettings: SettingChange[] = [];
        const unresolvedSettings: SettingChange[] = [];
        for (const change of mutation.settings) {
          if (change.delta !== undefined) {
            if (unresolvedEvents.length) unresolvedSettings.push(change);
            else if (confirmedEvents.length) confirmedSettings.push(change);
            continue;
          }
          const remoteValue = getPathValue(current, change.path);
          const remoteChanged = !sameValue(remoteValue, change.before);
          if (remoteChanged && !sameValue(remoteValue, change.after)) {
            conflicts.push({
              id: `${mutation.id}:setting:${change.path.join(".")}`,
              mutationId: mutation.id,
              kind: "setting",
              field: change.path[change.path.length - 1] ?? "setting",
              path: change.path,
              localValue: conflictValue(change.after),
              remoteValue: conflictValue(remoteValue),
            });
            unresolvedSettings.push({ ...change, before: remoteValue });
          } else if (!sameValue(remoteValue, change.after)) {
            confirmedSettings.push({ ...change, before: remoteValue });
          }
        }

        const candidate: AppMutation = {
          id: mutation.id,
          queuedAt: mutation.queuedAt,
          events: confirmedEvents,
          settings: confirmedSettings,
        };
        const resolved = reconcileStockConsumption(current, candidate);
        const next = applyMutation(current, resolved);

        if (v2) {
          for (const change of resolved.events) {
            if (change.after) transaction.set(doc(eventsRef, change.id), removeUndefined(change.after));
            else transaction.delete(doc(eventsRef, change.id));
          }
          if (resolved.settings.length || !snapshot.exists()) {
            const { events: _events, ...settings } = toSharedAppState(next);
            transaction.set(stateRef, { app: removeUndefined(settings), schemaVersion: 2,
              updatedAt: serverTimestamp(), updatedBy: userId });
          }
        } else if (resolved.events.length || resolved.settings.length) {
          transaction.set(stateRef, { app: removeUndefined(toSharedAppState(next)),
            updatedAt: serverTimestamp(), updatedBy: userId }, { merge: true });
        }

        const confirmed: AppMutation = { ...resolved, settings: resolved.settings.map((change) => {
          let value: unknown = next;
          for (const key of change.path) value = (value as Record<string, unknown>)[key];
          const { delta: _delta, ...rest } = change;
          return { ...rest, after: value };
        }) };
        const unresolved: AppMutation | undefined = unresolvedEvents.length || unresolvedSettings.length ? {
          id: mutation.id,
          queuedAt: mutation.queuedAt,
          events: unresolvedEvents,
          settings: unresolvedSettings,
        } : undefined;
        const result: CommitResult = {
          confirmed,
          conflicts,
          ...(mutationHasChanges(unresolved) ? { unresolved } : {}),
        };
        transaction.set(receiptRef, removeUndefined({ uid: userId, result, createdAt: serverTimestamp() }));
        return conflicts.length ? result : confirmed;
      });
    },
    async loadAll() {
      const snapshot = await getDocFromServer(stateRef);
      if (snapshot.data()?.migrationState === "copying") throw new Error("保存方式の更新中です。");
      const current = decode(snapshot.data());
      if (snapshot.data()?.schemaVersion !== 2) return current;
      const events: LogEvent[] = [];
      let cursor: QueryDocumentSnapshot | undefined;
      for (;;) {
        const page = await getDocs(query(eventsRef, orderBy("timestamp", "desc"),
          ...(cursor ? [startAfter(cursor)] : []), limit(PAGE_SIZE)));
        if (page.metadata.fromCache) throw new Error("全履歴の取得には通信が必要です。");
        events.push(...page.docs.map((row) => ({ ...row.data(), id: row.id }) as LogEvent));
        if (page.size < PAGE_SIZE) break;
        cursor = page.docs[page.docs.length - 1];
      }
      return { ...current, events };
    },
  };
}
