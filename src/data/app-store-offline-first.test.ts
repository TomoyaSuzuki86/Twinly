import { describe, expect, it, vi } from "vitest";
import { AppStore, type StoreStatus } from "./app-store";
import { applyMutation, type AppRepository, type AppSnapshot } from "./app-repository";
import { createInitialAppState } from "@/lib/app-state";
import { appendEvents } from "@/lib/event-mutations";
import type { AppState, LogEvent } from "@/types";

const milk: LogEvent = {
  id: "offline-milk",
  babyId: "A",
  type: "milk",
  timestamp: 1_000,
  milkMl: 160,
};

const createStorage = () => {
  const data = new Map<string, string>();
  return {
    persistence: {
      get length() { return data.size; },
      key: (index: number) => [...data.keys()][index] ?? null,
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => { data.set(key, value); },
      removeItem: (key: string) => { data.delete(key); },
    },
    data,
  };
};

describe("offline-first app store", () => {
  it("queues a local edit before the first server snapshot and flushes it after confirmation", async () => {
    const cached = createInitialAppState();
    let remote = createInitialAppState();
    let emitSnapshot: (snapshot: AppSnapshot) => void = () => {};
    const commit = vi.fn(async (mutation) => {
      remote = applyMutation(remote, mutation, true);
      return mutation;
    });
    const repository: AppRepository = {
      subscribe: (listener) => {
        emitSnapshot = listener;
        listener({ app: cached, fromCache: true, completeHistory: true });
        return () => {};
      },
      commit,
      loadAll: async () => remote,
    };
    const { persistence } = createStorage();
    let view: AppState = cached;
    let status: StoreStatus = { pending: 0, error: null, ready: false, fromCache: true };
    const store = new AppStore(repository, cached, persistence, "offline-first", (next, nextStatus) => {
      view = next;
      status = nextStatus;
    });

    const stop = store.start();
    expect(status.ready).toBe(false);

    expect(() => store.update((app) => appendEvents(app, [milk]))).not.toThrow();
    expect(view.events).toEqual([milk]);
    expect(status.pending).toBe(1);
    expect(commit).not.toHaveBeenCalled();

    emitSnapshot({ app: remote, fromCache: false, completeHistory: true });

    await vi.waitFor(() => expect(commit).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(store.hasPending).toBe(false));
    expect(remote.events).toEqual([milk]);
    expect(view.events).toEqual([milk]);

    stop();
  });
});
