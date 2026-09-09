import type { AppState, LogEvent } from "@/types";
import {
  applyMutation,
  createMutation,
  isCommitResult,
  sameValue,
  type AppMutation,
  type AppRepository,
  type AppSnapshot,
  type SyncConflict,
} from "./app-repository";

export type SyncConnectionState = "connecting" | "online" | "retrying";
export type StoreStatus = {
  pending: number;
  error: string | null;
  fromCache: boolean;
  ready: boolean;
  checking?: boolean;
  connection?: SyncConnectionState;
  lastServerConfirmedAt?: number | null;
  conflicts?: SyncConflict[];
};

type SyncCheckReason = "start" | "online" | "visibility" | "pageshow" | "listener-error" | "server-check-timeout";
type DiagnosticEntry = {
  at: number;
  event: string;
  connection: SyncConnectionState;
  pending: number;
  conflictCount: number;
  pendingWaitMs: number;
  fromCache: boolean;
  checking: boolean;
  lastServerConfirmedAt: number | null;
};
type ConflictRecord = {
  id: string;
  mutation: AppMutation;
  conflicts: SyncConflict[];
  createdAt: number;
};

const SERVER_CHECK_TIMEOUT_MS = 12_000;
const RECONNECT_MAX_MS = 30_000;
const DIAGNOSTIC_LIMIT = 80;
const USER_EVENT_FIELDS: (keyof LogEvent)[] = [
  "babyId", "type", "timestamp", "milkMl", "milkMethod", "diaperKind", "diaperSizeUsed",
  "temperature", "weight", "height", "note",
];

const mutationHasChanges = (mutation: AppMutation | undefined) => Boolean(mutation && (mutation.events.length || mutation.settings.length));
const setEventValue = (event: LogEvent, field: string, value: unknown) => {
  const target = event as unknown as Record<string, unknown>;
  if (value === undefined || value === null) delete target[field];
  else target[field] = value;
};
const userEventChanged = (before: LogEvent, after: LogEvent) =>
  USER_EVENT_FIELDS.some((field) => !sameValue(before[field], after[field]));

function mutationReflected(state: AppState, mutation: AppMutation) {
  const events = new Map(state.events.map((event) => [event.id, event]));
  for (const change of mutation.events) {
    const current = events.get(change.id);
    if (!change.before && change.after) {
      if (!current) return false;
    } else if (change.before && !change.after) {
      if (current) return false;
    } else if (!sameValue(current, change.after)) return false;
  }
  for (const change of mutation.settings) {
    if (change.delta !== undefined) {
      if (!mutation.events.length) return false;
      continue;
    }
    let value: unknown = state;
    for (const key of change.path) value = (value as Record<string, unknown>)?.[key];
    if (!sameValue(value, change.after)) return false;
  }
  return true;
}

// Durable, ordered changes include edits/deletes/settings, not only added events.
// Persistence MUST succeed before the UI claims to accept a change.
export class AppStore {
  private queue: AppMutation[];
  private conflicts: ConflictRecord[];
  private base: AppState;
  private running = false;
  private stopped = false;
  private inFlight: AppMutation | null = null;
  private stopSubscription: (() => void) | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private serverCheckTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private lastCheckStartedAt = 0;
  private saveError: string | null = null;
  private receiveError: string | null = null;
  private status: StoreStatus = {
    pending: 0,
    error: null,
    fromCache: true,
    ready: false,
    checking: true,
    connection: "connecting",
    lastServerConfirmedAt: null,
    conflicts: [],
  };

  constructor(private repository: AppRepository, initial: AppState,
    private storage: Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">, private key: string,
    private onChange: (app: AppState, status: StoreStatus) => void) {
    this.base = initial;
    this.queue = this.readQueue();
    this.conflicts = this.readConflictRecords();
    if (!Array.isArray(this.queue) || this.queue.some((item) => !item.id || !Array.isArray(item.events) || !Array.isArray(item.settings))) {
      throw new Error("端末の未保存データを読み取れません。ブラウザのデータを消さずに再度お試しください。");
    }
  }

  private readQueue(): AppMutation[] {
    const mutations: AppMutation[] = [];
    for (let i = 0; i < this.storage.length; i++) {
      const storageKey = this.storage.key(i);
      if (!storageKey?.startsWith(`${this.key}:`)) continue;
      const raw = this.storage.getItem(storageKey);
      if (raw) mutations.push(JSON.parse(raw));
    }
    return mutations.sort((a, b) => (a.queuedAt ?? 0) - (b.queuedAt ?? 0) || a.id.localeCompare(b.id));
  }

  private readConflictRecords(): ConflictRecord[] {
    const records: ConflictRecord[] = [];
    const prefix = `${this.key}.conflict:`;
    for (let i = 0; i < this.storage.length; i++) {
      const storageKey = this.storage.key(i);
      if (!storageKey?.startsWith(prefix)) continue;
      const raw = this.storage.getItem(storageKey);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as ConflictRecord;
      if (parsed?.id && parsed.mutation && Array.isArray(parsed.conflicts)) records.push(parsed);
    }
    return records.sort((a, b) => a.createdAt - b.createdAt);
  }

  private conflictKey(id: string) { return `${this.key}.conflict:${id}`; }
  private syncError() { this.status.error = this.saveError ?? this.receiveError; }
  private flattenedConflicts() { return this.conflicts.flatMap((record) => record.conflicts); }

  private logDiagnostic(event: string) {
    const oldest = this.queue[0]?.queuedAt;
    const entry: DiagnosticEntry = {
      at: Date.now(),
      event,
      connection: this.status.connection ?? "connecting",
      pending: this.queue.length,
      conflictCount: this.flattenedConflicts().length,
      pendingWaitMs: oldest ? Math.max(0, Date.now() - oldest) : 0,
      fromCache: this.status.fromCache,
      checking: Boolean(this.status.checking),
      lastServerConfirmedAt: this.status.lastServerConfirmedAt ?? null,
    };
    try {
      const diagnosticsKey = `${this.key}.diagnostics`;
      const raw = this.storage.getItem(diagnosticsKey);
      const previous = raw ? JSON.parse(raw) : [];
      const entries = Array.isArray(previous) ? previous : [];
      entries.push(entry);
      this.storage.setItem(diagnosticsKey, JSON.stringify(entries.slice(-DIAGNOSTIC_LIMIT)));
    } catch {
      // Diagnostics must never block recording or synchronization.
    }
  }

  refresh() {
    this.queue = this.readQueue();
    this.conflicts = this.readConflictRecords();
    this.emit();
    this.logDiagnostic("outbox-refresh");
    void this.flush();
  }

  private view() {
    const reflectedInFlight = this.inFlight && mutationReflected(this.base, this.inFlight) ? this.inFlight.id : null;
    const overlays = [
      ...this.conflicts.map((record) => record.mutation),
      ...this.queue.filter((mutation) => mutation.id !== reflectedInFlight),
    ].sort((a, b) => (a.queuedAt ?? 0) - (b.queuedAt ?? 0) || a.id.localeCompare(b.id));
    return overlays.reduce((state, mutation) => applyMutation(state, mutation), this.base);
  }

  private emit() {
    if (!this.stopped) this.onChange(this.view(), {
      ...this.status,
      pending: this.queue.length,
      conflicts: this.flattenedConflicts(),
    });
  }

  private clearReconnectTimer() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private clearServerCheckTimer() {
    if (this.serverCheckTimer) clearTimeout(this.serverCheckTimer);
    this.serverCheckTimer = null;
  }

  private armServerCheckTimeout() {
    this.clearServerCheckTimer();
    if (!this.status.checking || this.stopped) return;
    this.serverCheckTimer = setTimeout(() => {
      if (this.stopped || !this.status.checking) return;
      this.logDiagnostic("server-check-timeout");
      this.connect("server-check-timeout");
    }, SERVER_CHECK_TIMEOUT_MS);
  }

  private scheduleReconnect() {
    if (this.stopped || this.reconnectTimer) return;
    const delay = Math.min(RECONNECT_MAX_MS, 1_000 * (2 ** Math.min(this.reconnectAttempt, 5)));
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect("listener-error");
    }, delay);
  }

  private connect(reason: SyncCheckReason) {
    if (this.stopped) return;
    this.clearReconnectTimer();
    this.clearServerCheckTimer();
    this.stopSubscription?.();
    this.stopSubscription = null;
    this.status.checking = true;
    this.status.connection = this.reconnectAttempt ? "retrying" : "connecting";
    this.syncError();
    this.emit();
    this.logDiagnostic(`connect:${reason}`);

    const stop = this.repository.subscribe((snapshot: AppSnapshot) => {
      if (this.stopped) return;
      this.base = snapshot.app;
      this.status.ready = this.status.ready || !snapshot.fromCache;
      this.status.fromCache = snapshot.fromCache;
      if (!snapshot.fromCache) {
        this.receiveError = null;
        this.reconnectAttempt = 0;
        this.status.checking = false;
        this.status.connection = "online";
        this.status.lastServerConfirmedAt = Date.now();
        this.clearServerCheckTimer();
        this.logDiagnostic("server-confirmed");
      } else {
        this.status.connection = this.reconnectAttempt ? "retrying" : "connecting";
        this.armServerCheckTimeout();
      }
      this.syncError();
      this.emit();
      if (!this.saveError) void this.flush();
    }, (error) => {
      if (this.stopped) return;
      this.receiveError = error instanceof Error ? error.message : "通信が切れました。自動で再接続します。";
      this.status.checking = true;
      this.status.connection = "retrying";
      this.syncError();
      this.emit();
      this.logDiagnostic("listener-error");
      this.scheduleReconnect();
    });
    if (this.stopped) stop();
    else this.stopSubscription = stop;
    this.armServerCheckTimeout();
  }

  start() {
    this.stopped = false;
    this.connect("start");
    return () => this.stop();
  }

  private stop() {
    this.stopped = true;
    this.clearReconnectTimer();
    this.clearServerCheckTimer();
    this.stopSubscription?.();
    this.stopSubscription = null;
  }

  recheck(reason: Exclude<SyncCheckReason, "start" | "listener-error" | "server-check-timeout">) {
    if (this.stopped) return;
    const now = Date.now();
    if (this.status.checking && now - this.lastCheckStartedAt < 1_000) return;
    this.lastCheckStartedAt = now;
    this.receiveError = null;
    this.status.checking = true;
    this.status.connection = "connecting";
    this.syncError();
    this.emit();
    this.logDiagnostic(`recheck:${reason}`);
    this.connect(reason);
    void this.flush();
  }

  update(updater: (state: AppState) => AppState, options: { absoluteSettings?: boolean } = {}) {
    if (!this.status.ready) throw new Error("記録を読み込んでいます。");
    this.queue = this.readQueue();
    this.conflicts = this.readConflictRecords();
    const before = this.view();
    const mutation = createMutation(before, updater(before), crypto.randomUUID(), {
      relativeStock: !options.absoluteSettings,
    });
    if (!mutation.events.length && !mutation.settings.length) return;
    this.repository.validate?.(mutation);
    const allQueuedAt = [...this.queue.map((item) => item.queuedAt ?? 0), ...this.conflicts.map((item) => item.mutation.queuedAt ?? 0)];
    mutation.queuedAt = Math.max(Date.now(), ...allQueuedAt.map((value) => value + 1));
    this.storage.setItem(`${this.key}:${mutation.id}`, JSON.stringify(mutation));
    this.queue = this.readQueue();
    this.emit();
    this.logDiagnostic("queued");
    void this.flush();
  }

  async flush() {
    if (this.running || this.stopped || !this.status.ready) return;
    this.running = true;
    this.saveError = null;
    this.syncError();
    this.emit();
    try {
      this.queue = this.readQueue();
      while (this.queue.length && !this.stopped) {
        const mutation = this.queue[0];
        this.inFlight = mutation;
        this.logDiagnostic("save-start");
        const response = await this.repository.commit(mutation);
        if (this.stopped) return;
        const result = isCommitResult(response) ? response : { confirmed: response, conflicts: [] as SyncConflict[] };
        if (mutationHasChanges(result.confirmed) && !mutationReflected(this.base, result.confirmed)) {
          this.base = applyMutation(this.base, result.confirmed);
        }
        this.storage.removeItem(`${this.key}:${mutation.id}`);
        if (result.conflicts.length && mutationHasChanges(result.unresolved)) {
          const record: ConflictRecord = {
            id: mutation.id,
            mutation: { ...result.unresolved!, queuedAt: mutation.queuedAt },
            conflicts: result.conflicts,
            createdAt: Date.now(),
          };
          this.storage.setItem(this.conflictKey(record.id), JSON.stringify(record));
          this.logDiagnostic("conflict-isolated");
        }
        this.queue = this.readQueue();
        this.conflicts = this.readConflictRecords();
        this.inFlight = null;
        this.saveError = null;
        this.syncError();
        this.logDiagnostic("save-confirmed");
        this.emit();
      }
    } catch (error) {
      this.saveError = error instanceof Error ? error.message : "保存できませんでした。通信回復後に自動で再試行します。";
      this.syncError();
      this.logDiagnostic("save-error");
      this.emit();
    } finally {
      this.running = false;
      this.inFlight = null;
    }
  }

  resolveConflict(conflictId: string, choice: "local" | "remote") {
    this.conflicts = this.readConflictRecords();
    const record = this.conflicts.find((item) => item.conflicts.some((conflict) => conflict.id === conflictId));
    if (!record) return;
    const conflict = record.conflicts.find((item) => item.id === conflictId)!;
    const mutation = structuredClone(record.mutation);

    if (choice === "remote") {
      if (conflict.kind === "event" && conflict.eventId) {
        const index = mutation.events.findIndex((change) => change.id === conflict.eventId);
        if (index >= 0) {
          const change = mutation.events[index];
          if (conflict.field === "__record__") {
            mutation.events.splice(index, 1);
          } else if (change.before && change.after) {
            setEventValue(change.after, conflict.field, (change.before as unknown as Record<string, unknown>)[conflict.field]);
            if (!userEventChanged(change.before, change.after)) mutation.events.splice(index, 1);
          } else {
            mutation.events.splice(index, 1);
          }
        }
      } else if (conflict.kind === "setting" && conflict.path) {
        mutation.settings = mutation.settings.filter((change) => change.path.join(".") !== conflict.path!.join("."));
      }
    }

    const remaining = record.conflicts.filter((item) => item.id !== conflictId);
    if (remaining.length) {
      const updated: ConflictRecord = { ...record, mutation, conflicts: remaining };
      this.storage.setItem(this.conflictKey(record.id), JSON.stringify(updated));
    } else {
      this.storage.removeItem(this.conflictKey(record.id));
      if (mutationHasChanges(mutation)) {
        const next: AppMutation = { ...mutation, id: crypto.randomUUID(), queuedAt: Math.max(Date.now(), (mutation.queuedAt ?? 0) + 1) };
        this.storage.setItem(`${this.key}:${next.id}`, JSON.stringify(next));
      }
    }

    this.queue = this.readQueue();
    this.conflicts = this.readConflictRecords();
    this.emit();
    this.logDiagnostic(`conflict-resolved:${choice}`);
    void this.flush();
  }

  async exportAll() {
    const remote = await this.repository.loadAll();
    const overlays = [...this.conflicts.map((record) => record.mutation), ...this.queue]
      .sort((a, b) => (a.queuedAt ?? 0) - (b.queuedAt ?? 0) || a.id.localeCompare(b.id));
    return overlays.reduce((state, mutation) => applyMutation(state, mutation), remote);
  }

  get hasPending() { return this.queue.length > 0 || this.conflicts.length > 0; }
  exportPending() { return { app: this.view(), pendingMutations: this.queue, conflicts: this.conflicts }; }
  exportDiagnostics() {
    try {
      const raw = this.storage.getItem(`${this.key}.diagnostics`);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  }
  discardPending() {
    if (this.running) throw new Error("保存処理が完了してから再度お試しください。");
    for (const mutation of this.readQueue()) this.storage.removeItem(`${this.key}:${mutation.id}`);
    for (const conflict of this.readConflictRecords()) this.storage.removeItem(this.conflictKey(conflict.id));
    this.queue = [];
    this.conflicts = [];
    this.saveError = null;
    this.syncError();
    this.emit();
    this.logDiagnostic("pending-discarded");
  }
}
