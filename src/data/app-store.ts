import type { AppState } from "@/types";
import { applyMutation, createMutation, sameValue, type AppMutation, type AppRepository, type AppSnapshot } from "./app-repository";

export type SyncConnectionState = "connecting" | "online" | "retrying";
export type StoreStatus = {
  pending: number;
  error: string | null;
  fromCache: boolean;
  ready: boolean;
  checking?: boolean;
  connection?: SyncConnectionState;
  lastServerConfirmedAt?: number | null;
};

type SyncCheckReason = "start" | "online" | "visibility" | "pageshow" | "listener-error" | "server-check-timeout";
type DiagnosticEntry = {
  at: number;
  event: string;
  connection: SyncConnectionState;
  pending: number;
  pendingWaitMs: number;
  fromCache: boolean;
  checking: boolean;
  lastServerConfirmedAt: number | null;
};

const SERVER_CHECK_TIMEOUT_MS = 12_000;
const RECONNECT_MAX_MS = 30_000;
const DIAGNOSTIC_LIMIT = 80;

function mutationAlreadyApplied(state: AppState, mutation: AppMutation) {
  const events = new Map(state.events.map((event) => [event.id, event]));
  if (!mutation.events.every((change) => sameValue(events.get(change.id), change.after))) return false;
  for (const change of mutation.settings) {
    if (change.delta !== undefined) {
      // Relative stock changes are always coupled to an event mutation. If that event is already
      // visible in the authoritative snapshot, the transaction applied the stock delta atomically too.
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
  };

  constructor(private repository: AppRepository, initial: AppState,
    private storage: Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">, private key: string,
    private onChange: (app: AppState, status: StoreStatus) => void) {
    this.base = initial;
    this.queue = this.readQueue();
    if (!Array.isArray(this.queue) || this.queue.some((item) => !item.id || !Array.isArray(item.events) || !Array.isArray(item.settings))) {
      throw new Error("端末の未同期データを読み取れません。ブラウザのデータを消さずにバックアップしてください。");
    }
  }

  private readQueue(): AppMutation[] {
    const mutations: AppMutation[] = [];
    for (let i = 0; i < this.storage.length; i++) {
      const key = this.storage.key(i);
      if (!key?.startsWith(`${this.key}:`)) continue;
      const raw = this.storage.getItem(key);
      if (raw) mutations.push(JSON.parse(raw));
    }
    return mutations.sort((a, b) => (a.queuedAt ?? 0) - (b.queuedAt ?? 0) || a.id.localeCompare(b.id));
  }

  private syncError() { this.status.error = this.saveError ?? this.receiveError; }

  private logDiagnostic(event: string) {
    const oldest = this.queue[0]?.queuedAt;
    const entry: DiagnosticEntry = {
      at: Date.now(),
      event,
      connection: this.status.connection ?? "connecting",
      pending: this.queue.length,
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
    this.emit();
    this.logDiagnostic("outbox-refresh");
    void this.flush();
  }

  private view() {
    const inFlightAlreadyInBase = this.inFlight ? mutationAlreadyApplied(this.base, this.inFlight) : false;
    return this.queue.reduce((state, mutation) => {
      if (inFlightAlreadyInBase && mutation.id === this.inFlight?.id) return state;
      return applyMutation(state, mutation);
    }, this.base);
  }

  private emit() {
    if (!this.stopped) this.onChange(this.view(), { ...this.status, pending: this.queue.length });
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
      // Receiving is deliberately independent from saving. Remote changes update the base
      // immediately; durable local mutations stay overlaid until their commits are confirmed.
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
      this.receiveError = error instanceof Error ? error.message : "記録の受信接続が切れました。自動で再接続します。";
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
    const before = this.view();
    const mutation = createMutation(before, updater(before), crypto.randomUUID(), {
      relativeStock: !options.absoluteSettings,
    });
    if (!mutation.events.length && !mutation.settings.length) return;
    this.repository.validate?.(mutation);
    mutation.queuedAt = Math.max(Date.now(), ...this.queue.map((item) => (item.queuedAt ?? 0) + 1));
    // Each operation owns a key: tabs cannot overwrite each other's entire queue.
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
        const confirmed = await this.repository.commit(mutation);
        if (this.stopped) return;
        // A listener can win the race and already contain this transaction. Avoid re-applying
        // relative stock deltas in that case; otherwise promote the confirmed change locally
        // so the optimistic UI never disappears while waiting for the listener callback.
        if (!mutationAlreadyApplied(this.base, confirmed)) this.base = applyMutation(this.base, confirmed);
        this.storage.removeItem(`${this.key}:${mutation.id}`);
        this.queue = this.readQueue();
        this.inFlight = null;
        this.saveError = null;
        this.syncError();
        this.logDiagnostic("save-confirmed");
        this.emit();
      }
    } catch (error) {
      this.saveError = error instanceof Error ? error.message : "保存できませんでした。通信回復後に再試行してください。";
      this.syncError();
      this.logDiagnostic("save-error");
      this.emit();
    } finally {
      this.running = false;
      this.inFlight = null;
    }
  }

  async exportAll() {
    // Include unsynced changes in an explicit user backup, without losing remote history.
    return this.queue.reduce((state, mutation) => applyMutation(state, mutation), await this.repository.loadAll());
  }

  get hasPending() { return this.queue.length > 0; }
  exportPending() { return { app: this.view(), pendingMutations: this.queue }; }
  exportDiagnostics() {
    try {
      const raw = this.storage.getItem(`${this.key}.diagnostics`);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  }
  discardPending() {
    if (this.running) throw new Error("同期処理が完了してから再度お試しください。");
    for (const mutation of this.readQueue()) this.storage.removeItem(`${this.key}:${mutation.id}`);
    this.queue = [];
    this.saveError = null;
    this.syncError();
    this.emit();
    this.logDiagnostic("pending-discarded");
  }
}
