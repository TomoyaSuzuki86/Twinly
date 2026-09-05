import type { AppState } from "@/types";
import { applyMutation, createMutation, type AppMutation, type AppRepository, type AppSnapshot } from "./app-repository";

export type StoreStatus = { pending: number; error: string | null; fromCache: boolean; ready: boolean };

// Durable, ordered changes include edits/deletes/settings, not only added events.
// Persistence MUST succeed before the UI claims to accept a change.
export class AppStore {
  private queue: AppMutation[];
  private base: AppState;
  private running = false;
  private stopped = false;
  private buffered: AppSnapshot | null = null;
  private status: StoreStatus = { pending: 0, error: null, fromCache: true, ready: false };
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
  refresh() { this.queue = this.readQueue(); this.emit(); if (!this.status.error) void this.flush(); }
  private view() { return this.queue.reduce((state, mutation) => applyMutation(state, mutation), this.base); }
  private emit() {
    if (!this.stopped) this.onChange(this.view(), { ...this.status, pending: this.queue.length });
  }
  start() {
    const stop = this.repository.subscribe((snapshot: AppSnapshot) => {
      if (this.running) { this.buffered = snapshot; return; }
      this.base = snapshot.app;
      this.status = { ...this.status, ready: true, fromCache: snapshot.fromCache };
      if (!this.queue.length) this.status.error = null;
      this.emit();
      if (!this.status.error) void this.flush();
    }, (error) => {
      this.status.error = error instanceof Error ? error.message : "記録を取得できませんでした。再読み込みしてください。";
      this.emit();
    });
    return () => { this.stopped = true; stop(); };
  }
  update(updater: (state: AppState) => AppState) {
    if (!this.status.ready) throw new Error("記録を読み込んでいます。");
    this.queue = this.readQueue();
    const before = this.view();
    const mutation = createMutation(before, updater(before), crypto.randomUUID());
    if (!mutation.events.length && !mutation.settings.length) return;
    this.repository.validate?.(mutation);
    mutation.queuedAt = Math.max(Date.now(), ...this.queue.map((item) => (item.queuedAt ?? 0) + 1));
    // Each operation owns a key: tabs cannot overwrite each other's entire queue.
    this.storage.setItem(`${this.key}:${mutation.id}`, JSON.stringify(mutation));
    this.queue = this.readQueue();
    this.emit();
    void this.flush();
  }
  async flush() {
    if (this.running || this.stopped || !this.status.ready) return;
    this.running = true;
    this.status.error = null;
    this.emit();
    try {
      while (this.queue.length && !this.stopped) {
        const mutation = this.queue[0];
        const confirmed = await this.repository.commit(mutation);
        if (this.stopped) return;
        if (this.buffered) {
          this.base = this.buffered.app;
          this.status.fromCache = this.buffered.fromCache;
          this.buffered = null;
        }
        // Absolute values returned by the transaction avoid applying inventory deltas twice.
        this.base = applyMutation(this.base, confirmed);
        this.storage.removeItem(`${this.key}:${mutation.id}`);
        this.queue = this.readQueue();
        this.emit();
      }
    } catch (error) {
      this.status.error = error instanceof Error ? error.message : "保存できませんでした。通信回復後に再試行してください。";
      this.emit();
    } finally { this.running = false; }
  }
  async exportAll() {
    // Include unsynced changes in an explicit user backup, without losing remote history.
    return this.queue.reduce((state, mutation) => applyMutation(state, mutation), await this.repository.loadAll());
  }
  get hasPending() { return this.queue.length > 0; }
  exportPending() { return { app: this.view(), pendingMutations: this.queue }; }
  discardPending() {
    if (this.running) throw new Error("同期処理が完了してから再度お試しください。");
    for (const mutation of this.readQueue()) this.storage.removeItem(`${this.key}:${mutation.id}`);
    this.queue = [];
    if (this.buffered) { this.base = this.buffered.app; this.buffered = null; }
    this.status.error = null;
    this.emit();
  }
}
