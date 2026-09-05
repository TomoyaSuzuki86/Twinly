import {
  collection, doc, getDocFromServer, getDocs, limit, onSnapshot, orderBy,
  query, runTransaction, serverTimestamp, startAfter, where,
  type Firestore, type QueryDocumentSnapshot,
} from "firebase/firestore";
import type { AppState, EventType, LogEvent } from "@/types";
import { createInitialAppState, stripLegacyCalendarFields, toSharedAppState } from "@/lib/app-state";
import { removeUndefined } from "@/lib/utils";
import { applyMutation, reconcileStockConsumption, type AppMutation, type AppRepository } from "./app-repository";

export const RECENT_DAYS = 30;
const PAGE_SIZE = 400;
const decode = (data: Record<string, unknown> | undefined): AppState => {
  if (!data?.app) return createInitialAppState();
  const stored = data.app as AppState;
  return stripLegacyCalendarFields({ ...stored, events: stored.events ?? [], ui: createInitialAppState().ui });
};

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
      const emit = () => {
        if (stopped || !ready) return;
        const byId = new Map([...seeds, ...recent].map((event) => [event.id, event]));
        onChange({ app: { ...current, events: [...byId.values()].sort((a, b) => b.timestamp - a.timestamp) },
          fromCache, completeHistory: allHistory });
      };
      const stopState = onSnapshot(stateRef, { includeMetadataChanges: true }, (snapshot) => {
        if (stopped) return;
        const data = snapshot.data();
        storageVersion = !snapshot.exists() || data?.schemaVersion === 2 ? 2 : 1;
        if (data?.migrationState === "copying") {
          onError(new Error("記録の保存方式を更新しています。少し待ってから再読み込みしてください。"));
          return;
        }
        current = decode(data);
        if (data?.schemaVersion !== 2) {
          onChange({ app: current, fromCache: snapshot.metadata.fromCache, completeHistory: true });
          return;
        }
        if (version === 2) { emit(); return; }
        version = 2;
        if (allHistory) {
          stopEvents = onSnapshot(query(eventsRef, orderBy("timestamp", "desc")), { includeMetadataChanges: true }, (rows) => {
            if (stopped) return;
            recent = rows.docs.map((row) => ({ ...row.data(), id: row.id }) as LogEvent);
            fromCache = rows.metadata.fromCache; ready = true; emit();
          }, onError);
          return;
        }
        const since = Date.now() - RECENT_DAYS * 86400000;
        // One latest record per baby/type preserves defaults and sleep state across the boundary.
        // Restrict seeds to before the window so recent deletes cannot resurrect stale copies.
        const types: EventType[] = ["milk", "solidFood", "diaper", "sleepStart", "wake", "weight", "height"];
        const seedRows = new Map<string, LogEvent[]>();
        const stops: (() => void)[] = [];
        let windowReady = false;
        const finish = () => { ready = windowReady && seedRows.size === types.length * 2; seeds = [...seedRows.values()].flat(); emit(); };
        for (const babyId of ["A", "B"] as const) for (const type of types) {
          stops.push(onSnapshot(query(eventsRef, where("babyId", "==", babyId), where("type", "==", type),
            where("timestamp", "<", since), orderBy("timestamp", "desc"), limit(1)), (rows) => {
              seedRows.set(`${babyId}:${type}`, rows.docs.map((row) => ({ ...row.data(), id: row.id }) as LogEvent));
              finish();
            }, onError));
        }
        stops.push(onSnapshot(query(eventsRef, where("timestamp", ">=", since), orderBy("timestamp", "desc")),
          { includeMetadataChanges: true }, (rows) => {
            recent = rows.docs.map((item) => ({ ...item.data(), id: item.id }) as LogEvent);
            fromCache = rows.metadata.fromCache;
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
        if (receipt.exists()) return { ...mutation, settings: receipt.data().settings,
          events: mutation.events.map((change) => ({ ...change, after: change.after && receipt.data().consumption?.[change.id] !== undefined
            ? { ...change.after, diaperStockConsumed: receipt.data().consumption[change.id] } : change.after })) };
        const data = snapshot.data();
        if (data?.migrationState === "copying") throw new Error("保存方式の更新中です。完了後に再試行してください。");
        let current = decode(data);
        const v2 = !snapshot.exists() || data?.schemaVersion === 2;
        if (v2 && mutation.events.length > 450) throw new Error("一度に変更できる記録は450件までです。大量の復元・削除は管理用移行手順を利用してください。");
        if (v2) {
          const rows = await Promise.all(mutation.events.map((change) => transaction.get(doc(eventsRef, change.id))));
          current = { ...current, events: rows.filter((row) => row.exists()).map((row) => ({ ...row.data(), id: row.id }) as LogEvent) };
        }
        const resolved = reconcileStockConsumption(current, mutation);
        const next = applyMutation(current, resolved, true);
        if (v2) {
          for (const change of resolved.events) {
            if (change.after) transaction.set(doc(eventsRef, change.id), removeUndefined(change.after));
            else transaction.delete(doc(eventsRef, change.id));
          }
          if (mutation.settings.length || !snapshot.exists()) {
            const { events: _events, ...settings } = toSharedAppState(next);
            transaction.set(stateRef, { app: removeUndefined(settings), schemaVersion: 2,
              updatedAt: serverTimestamp(), updatedBy: userId });
          }
        } else {
          transaction.set(stateRef, { app: removeUndefined(toSharedAppState(next)),
            updatedAt: serverTimestamp(), updatedBy: userId }, { merge: true });
        }
        const confirmed = { ...resolved, settings: resolved.settings.map((change) => {
          let value: unknown = next;
          for (const key of change.path) value = (value as Record<string, unknown>)[key];
          const { delta: _delta, ...rest } = change;
          return { ...rest, after: value };
        }) };
        const consumption = Object.fromEntries(resolved.events.filter((change) => change.after?.diaperStockConsumed !== undefined)
          .map((change) => [change.id, change.after!.diaperStockConsumed]));
        transaction.set(receiptRef, removeUndefined({ uid: userId, settings: confirmed.settings, consumption, createdAt: serverTimestamp() }));
        return confirmed;
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
