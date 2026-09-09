import { describe, expect, it, vi } from "vitest";
import type { AppState, LogEvent } from "@/types";
import { createInitialAppState } from "@/lib/app-state";
import { appendEvents } from "@/lib/event-mutations";
import { AppStore, type StoreStatus } from "./app-store";
import type { AppMutation, AppRepository, AppSnapshot } from "./app-repository";

const localMilk: LogEvent = { id: "local", babyId: "A", type: "milk", timestamp: 2_000, milkMl: 120 };
const remoteMilk: LogEvent = { id: "remote", babyId: "B", type: "milk", timestamp: 3_000, milkMl: 160 };

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    values,
    storage: {
      get length() { return values.size; },
      key: (index: number) => [...values.keys()][index] ?? null,
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
      removeItem: (key: string) => { values.delete(key); },
    },
  };
}

function deferredCommit() {
  let resolve: ((mutation: AppMutation) => void) | undefined;
  const commit = vi.fn((mutation: AppMutation) => new Promise<AppMutation>((done) => {
    resolve = () => done(mutation);
  }));
  return { commit, resolve: () => resolve?.(commit.mock.calls[0][0]) };
}

function createStore(repository: AppRepository, initial = createInitialAppState()) {
  const persistence = memoryStorage();
  let view: AppState = initial;
  let status: StoreStatus = { pending: 0, error: null, ready: false, fromCache: true };
  const store = new AppStore(repository, initial, persistence.storage, "sync-test", (next, nextStatus) => {
    view = next;
    status = nextStatus;
  });
  return { store, persistence, view: () => view, status: () => status };
}

describe("AppStore resilient synchronization", () => {
  it("shows remote updates immediately while a local save is still in flight", async () => {
    const initial = createInitialAppState();
    let listener: (snapshot: AppSnapshot) => void = () => {};
    const pending = deferredCommit();
    const repository: AppRepository = {
      subscribe: (next) => {
        listener = next;
        next({ app: initial, fromCache: false, completeHistory: true });
        return () => {};
      },
      commit: pending.commit,
      loadAll: async () => initial,
    };
    const context = createStore(repository, initial);
    const stop = context.store.start();

    context.store.update((app) => appendEvents(app, [localMilk]));
    await vi.waitFor(() => expect(pending.commit).toHaveBeenCalledTimes(1));

    listener({ app: appendEvents(initial, [remoteMilk]), fromCache: false, completeHistory: true });
    expect(context.view().events.map((event) => event.id)).toEqual(expect.arrayContaining(["local", "remote"]));
    expect(context.status().pending).toBe(1);

    pending.resolve();
    await vi.waitFor(() => expect(context.status().pending).toBe(0));
    expect(context.view().events.map((event) => event.id)).toEqual(expect.arrayContaining(["local", "remote"]));
    stop();
  });

  it("re-subscribes on resume without clearing the rendered state", () => {
    const initial = appendEvents(createInitialAppState(), [remoteMilk]);
    const subscribe = vi.fn((next: (snapshot: AppSnapshot) => void) => {
      next({ app: initial, fromCache: false, completeHistory: true });
      return () => {};
    });
    const repository: AppRepository = {
      subscribe,
      commit: vi.fn(async (mutation) => mutation),
      loadAll: async () => initial,
    };
    const context = createStore(repository, initial);
    const stop = context.store.start();
    expect(context.view().events).toEqual([remoteMilk]);

    context.store.recheck("visibility");
    expect(subscribe).toHaveBeenCalledTimes(2);
    expect(context.view().events).toEqual([remoteMilk]);
    expect(context.status().ready).toBe(true);
    stop();
  });

  it("reconnects a failed listener with backoff", async () => {
    vi.useFakeTimers();
    try {
      const initial = createInitialAppState();
      let fail: (error: unknown) => void = () => {};
      const subscribe = vi.fn((next: (snapshot: AppSnapshot) => void, onError: (error: unknown) => void) => {
        fail = onError;
        next({ app: initial, fromCache: false, completeHistory: true });
        return () => {};
      });
      const repository: AppRepository = {
        subscribe,
        commit: vi.fn(async (mutation) => mutation),
        loadAll: async () => initial,
      };
      const context = createStore(repository, initial);
      const stop = context.store.start();

      fail(new Error("listener down"));
      expect(context.status().connection).toBe("retrying");
      await vi.advanceTimersByTimeAsync(1_000);
      expect(subscribe).toHaveBeenCalledTimes(2);
      expect(context.status().connection).toBe("online");
      stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps diagnostics metadata-only", async () => {
    const initial = createInitialAppState();
    const repository: AppRepository = {
      subscribe: (next) => {
        next({ app: initial, fromCache: false, completeHistory: true });
        return () => {};
      },
      commit: vi.fn(async (mutation) => mutation),
      loadAll: async () => initial,
    };
    const context = createStore(repository, initial);
    const stop = context.store.start();
    context.store.update((app) => appendEvents(app, [localMilk]));
    await vi.waitFor(() => expect(context.status().pending).toBe(0));

    const diagnosticText = JSON.stringify(context.store.exportDiagnostics());
    expect(diagnosticText).toContain("server-confirmed");
    expect(diagnosticText).not.toContain("milkMl");
    expect(diagnosticText).not.toContain("babyId");
    expect(diagnosticText).not.toContain("120");
    stop();
  });
});
