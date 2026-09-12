import { afterEach, describe, expect, it, vi } from "vitest";
import { AppStore, type StoreStatus } from "./app-store";
import { applyMutation, type AppMutation, type AppRepository, type AppSnapshot } from "./app-repository";
import { createInitialAppState } from "@/lib/app-state";
import { appendEvents, removeEvents } from "@/lib/event-mutations";
import type { AppState, LogEvent } from "@/types";

const milk170: LogEvent = { id: "kanata-170", babyId: "A", type: "milk", timestamp: 1000, milkMl: 170 };
const milk150: LogEvent = { ...milk170, id: "kanata-150", timestamp: 2000, milkMl: 150 };
const stops: Array<() => void> = [];
afterEach(() => { stops.splice(0).forEach((stop) => stop()); vi.useRealTimers(); });
const settle = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

function harness() {
  const values = new Map<string, string>();
  const storage = {
    get length() { return values.size; },
    key: (i: number) => [...values.keys()][i] ?? null,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
  let server = createInitialAppState();
  let cached = createInitialAppState();
  let serveCache = false;
  let listener: (snapshot: AppSnapshot) => void = () => {};
  const repository: AppRepository = {
    subscribe: vi.fn((next) => {
      listener = next;
      next({ app: structuredClone(serveCache ? cached : server), fromCache: serveCache, completeHistory: true });
      return () => {};
    }),
    commit: vi.fn(async (mutation) => { server = applyMutation(server, mutation); return mutation; }),
    loadLatest: vi.fn(async () => structuredClone(server)),
    loadAll: vi.fn(async () => structuredClone(server)),
  };
  let view: AppState = cached;
  let status: StoreStatus = { pending: 0, error: null, ready: false, fromCache: true };
  const makeStore = (initial = createInitialAppState(), initialReady = false) =>
    new AppStore(repository, initial, storage, "incident", (next, nextStatus) => {
      view = next; status = nextStatus;
    }, { initialReady });
  return {
    repository, storage, values, makeStore,
    amounts: () => view.events.filter((event) => event.type === "milk").map((event) => event.milkMl),
    serverAmounts: () => server.events.filter((event) => event.type === "milk").map((event) => event.milkMl),
    status: () => status,
    cacheOnResume: () => { serveCache = true; },
    serverOnResume: () => { serveCache = false; },
    setCache: (app: AppState) => { cached = structuredClone(app); },
    pushCache: () => listener({ app: structuredClone(cached), fromCache: true, completeHistory: true }),
    pushServer: () => listener({ app: structuredClone(server), fromCache: false, completeHistory: true }),
  };
}

describe("sync cache rollback regression", () => {
  it("keeps a saved 170ml record visible when resume first delivers an older empty cache", async () => {
    const h = harness();
    const store = h.makeStore(); stops.push(store.start());
    store.update((app) => appendEvents(app, [milk170])); await settle();
    expect(store.hasPending).toBe(false);
    expect(h.amounts()).toEqual([170]);
    expect(h.serverAmounts()).toEqual([170]);

    h.cacheOnResume();
    store.recheck("visibility");
    expect(h.amounts()).toEqual([170]);
    expect(h.status().ready).toBe(true);
  });

  it("persists a server-acknowledged mutation across store recreation until a read confirms it", async () => {
    const h = harness();
    const store = h.makeStore(); const stop = store.start();
    store.update((app) => appendEvents(app, [milk170])); await settle();
    expect([...h.values.keys()].some((key) => key.includes(".confirmed:"))).toBe(true);
    stop();

    h.cacheOnResume();
    const restored = h.makeStore(); stops.push(restored.start());
    expect(h.amounts()).toEqual([170]);
    h.serverOnResume(); h.pushServer();
    expect(h.amounts()).toEqual([170]);
    expect([...h.values.keys()].some((key) => key.includes(".confirmed:"))).toBe(false);
  });

  it("does not resurrect a successfully deleted record when an old cache still contains it", async () => {
    const h = harness();
    const store = h.makeStore(); stops.push(store.start());
    store.update((app) => appendEvents(app, [milk170])); await settle();
    h.pushServer();
    h.setCache(appendEvents(createInitialAppState(), [milk170]));

    store.update((app) => removeEvents(app, new Set([milk170.id]))); await settle();
    expect(h.amounts()).toEqual([]);
    expect(h.serverAmounts()).toEqual([]);
    h.pushCache();
    expect(h.amounts()).toEqual([]);
  });

  it("arms bounded server recovery if a healthy listener later falls back to cache", async () => {
    vi.useFakeTimers();
    const h = harness();
    const store = h.makeStore(); stops.push(store.start());
    expect(h.status().checking).toBe(false);
    h.pushCache();
    expect(h.status().checking).toBe(true);
    await vi.advanceTimersByTimeAsync(12_000); await settle();
    expect(h.repository.loadLatest).toHaveBeenCalledTimes(1);
    expect(h.status().checking).toBe(false);
    expect(h.status().connection).toBe("online");
  });

  it("does not extend the fixed recovery deadline when cache metadata keeps arriving", async () => {
    vi.useFakeTimers();
    const h = harness();
    const store = h.makeStore(); stops.push(store.start());
    h.pushCache();
    await vi.advanceTimersByTimeAsync(10_000);
    h.pushCache();
    await vi.advanceTimersByTimeAsync(2_000); await settle();
    expect(h.repository.loadLatest).toHaveBeenCalledTimes(1);
  });

  it("retries a rejected save automatically without another user action", async () => {
    vi.useFakeTimers();
    const h = harness();
    const original = vi.mocked(h.repository.commit).getMockImplementation()!;
    vi.mocked(h.repository.commit)
      .mockRejectedValueOnce(new Error("temporary unavailable"))
      .mockImplementation(original);
    const store = h.makeStore(); stops.push(store.start());
    store.update((app) => appendEvents(app, [milk170])); await settle();
    expect(h.status().pending).toBe(1);
    await vi.advanceTimersByTimeAsync(1_000); await settle();
    expect(h.repository.commit).toHaveBeenCalledTimes(2);
    expect(h.status().pending).toBe(0);
    expect(h.serverAmounts()).toEqual([170]);
  });

  it("times out a stuck commit and retries the same operation idempotently", async () => {
    vi.useFakeTimers();
    const h = harness();
    const ids: string[] = [];
    vi.mocked(h.repository.commit)
      .mockImplementationOnce((mutation) => { ids.push(mutation.id); return new Promise<AppMutation>(() => {}); })
      .mockImplementationOnce(async (mutation) => { ids.push(mutation.id); return mutation; });
    const store = h.makeStore(); stops.push(store.start());
    store.update((app) => appendEvents(app, [milk170])); await settle();
    await vi.advanceTimersByTimeAsync(16_000); await settle();
    expect(h.repository.commit).toHaveBeenCalledTimes(2);
    expect(ids).toHaveLength(2);
    expect(ids[0]).toBe(ids[1]);
  });

  it("keeps another tab's saved mutation visible after the shared outbox is cleaned", async () => {
    const h = harness();
    vi.mocked(h.repository.commit)
      .mockImplementationOnce(() => new Promise<AppMutation>(() => {}))
      .mockImplementation(async (mutation) => mutation);
    const first = h.makeStore(); stops.push(first.start());
    first.update((app) => appendEvents(app, [milk170])); await settle();
    expect(h.amounts()).toEqual([170]);

    const second = h.makeStore(); stops.push(second.start());
    await settle();
    first.refresh();
    expect(h.amounts()).toEqual([170]);
    expect([...h.values.keys()].some((key) => key.includes(".confirmed:"))).toBe(true);
  });

  it("keeps distinct legitimate entries distinct instead of deduplicating by nearby time or amount", async () => {
    const h = harness();
    const store = h.makeStore(); stops.push(store.start());
    store.update((app) => appendEvents(app, [milk170])); await settle();
    store.update((app) => appendEvents(app, [milk150])); await settle();
    expect(h.amounts()).toEqual([150, 170]);
    expect(h.serverAmounts()).toEqual([150, 170]);
  });
});