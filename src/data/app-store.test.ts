import { describe, expect, it, vi } from "vitest";
import { AppStore } from "./app-store";
import { applyMutation, createMutation, type AppRepository, type AppSnapshot } from "./app-repository";
import { createInitialAppState } from "@/lib/app-state";
import { appendEvents, removeEvents } from "@/lib/event-mutations";
import type { AppState, LogEvent } from "@/types";

const milk: LogEvent = { id: "milk-1", babyId: "A", type: "milk", timestamp: 1000, milkMl: 120 };
function setup() {
  let remote = createInitialAppState();
  let callback: (snapshot: AppSnapshot) => void = () => {};
  const storage = new Map<string, string>();
  const persistence = { get length() { return storage.size; }, key: (i: number) => [...storage.keys()][i] ?? null,
    removeItem: (key: string) => { storage.delete(key); }, getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, value); } };
  const repository: AppRepository = {
    subscribe: (listener) => { callback = listener; listener({ app: remote, fromCache: false, completeHistory: true }); return () => {}; },
    commit: vi.fn(async (mutation) => { remote = applyMutation(remote, mutation, true); return mutation; }),
    loadAll: async () => remote,
  };
  let view = remote;
  const listener = (app: AppState) => { view = app; };
  const store = new AppStore(repository, remote, persistence, "user:family", listener);
  return { store, repository, persistence, storage, listener, callback: () => callback, view: () => view };
}

describe("durable app storage", () => {
  it("keeps create/edit/delete in order across an offline reload", async () => {
    const context = setup();
    vi.mocked(context.repository.commit).mockRejectedValue(new Error("offline"));
    const stop = context.store.start();
    context.store.update((app) => appendEvents(app, [milk]));
    await vi.waitFor(() => expect(context.repository.commit).toHaveBeenCalled());
    await context.store.flush();
    context.store.update((app) => ({ ...app, events: app.events.map((event) => ({ ...event, milkMl: 140 })) }));
    context.store.update((app) => removeEvents(app, new Set([milk.id])));
    expect(context.view().events).toEqual([]);
    stop();
    let remote = createInitialAppState();
    vi.mocked(context.repository.commit).mockImplementation(async (mutation) => {
      remote = applyMutation(remote, mutation, true); return mutation;
    });
    const restored = new AppStore(context.repository, remote, context.persistence, "user:family", context.listener);
    restored.start();
    await vi.waitFor(() => expect(restored.hasPending).toBe(false));
    expect(remote.events).toEqual([]);
  });
  it("rejects local quota failure before showing or sending a record", () => {
    const context = setup();
    const store = new AppStore(context.repository, createInitialAppState(), {
      length: 0, key: () => null, removeItem: () => {}, getItem: () => null, setItem: () => { throw new Error("quota"); },
    }, "scope", context.listener);
    store.start();
    expect(() => store.update((app) => appendEvents(app, [milk]))).toThrow("quota");
    expect(context.repository.commit).not.toHaveBeenCalled();
    expect(context.view().events).toEqual([]);
  });
  it("does not mix outboxes between families", () => {
    const context = setup();
    context.storage.set("different-family", JSON.stringify([createMutation(createInitialAppState(), appendEvents(createInitialAppState(), [milk]), "change")]));
    context.store.start();
    expect(context.view().events).toEqual([]);
  });
  it("keeps both tabs' offline additions instead of replacing their shared queue", async () => {
    const context = setup();
    vi.mocked(context.repository.commit).mockRejectedValue(new Error("offline"));
    const otherTab = new AppStore(context.repository, createInitialAppState(), context.persistence, "user:family", () => {});
    const stop = context.store.start();
    const stopOther = otherTab.start();
    context.store.update((app) => appendEvents(app, [milk]));
    otherTab.update((app) => appendEvents(app, [{ ...milk, id: "other-tab" }]));
    expect([...context.storage.keys()].filter((key) => key.startsWith("user:family:"))).toHaveLength(2);
    expect(otherTab.exportPending().app.events).toHaveLength(2);
    await vi.waitFor(() => expect(context.repository.commit).toHaveBeenCalledTimes(2));
    stop(); stopOther();
  });
  it("preserves unrelated remote edits and rejects conflicting event edits", () => {
    const initial = appendEvents(createInitialAppState(), [milk]);
    const change = createMutation(initial, { ...initial, events: [{ ...milk, milkMl: 140 }] }, "edit");
    const other = { ...initial, events: [{ ...milk, milkMl: 180 }] };
    expect(() => applyMutation(other, change, true)).toThrow("別の端末");
    const added = appendEvents(initial, [{ ...milk, id: "other", babyId: "B" }]);
    expect(applyMutation(added, change, true).events).toHaveLength(2);
  });
  it("emits a constant-sized event change with ten thousand historical entries", () => {
    const initial = { ...createInitialAppState(), events: Array.from({ length: 10000 }, (_, i) => ({ ...milk, id: `old-${i}` })) };
    const mutation = createMutation(initial, appendEvents(initial, [milk]), "one");
    expect(mutation.events).toHaveLength(1);
    expect(JSON.stringify(mutation).length).toBeLessThan(500);
  });
  it("restores the consumed diaper size atomically, and never restores an unconsumed unit", () => {
    const initial = createInitialAppState();
    const diaper: LogEvent = { id: "diaper", babyId: "A", type: "diaper", timestamp: 10, diaperSizeUsed: "新生児" };
    const after = appendEvents(initial, [diaper]);
    expect(after.profiles.B.diaperStockBySize.新生児).toBe(79);
    after.profiles.A.diaperSize = "M";
    expect(removeEvents(after, new Set([diaper.id])).profiles.A.diaperStockBySize.新生児).toBe(80);
    initial.profiles.A.diaperStockBySize.新生児 = 0;
    initial.profiles.B.diaperStockBySize.新生児 = 0;
    expect(removeEvents(appendEvents(initial, [diaper]), new Set([diaper.id])).profiles.B.diaperStockBySize.新生児).toBe(0);
  });
  it("does not consume inventory when the setting is disabled or a creation is replayed", () => {
    const initial = createInitialAppState(); initial.diaperStockManagementEnabled = false;
    const diaper: LogEvent = { ...milk, type: "diaper" };
    const once = appendEvents(initial, [diaper]);
    expect(appendEvents(once, [diaper]).events).toHaveLength(1);
    expect(once.profiles.A.diaperStockBySize.新生児).toBe(80);
  });
  it("can encode backup inventory as absolute values beside event changes", () => {
    const initial = createInitialAppState();
    const imported = appendEvents(initial, [{ ...milk, id: "imported" }]);
    imported.profiles.A.diaperStockBySize.新生児 = 12;
    imported.profiles.B.diaperStockBySize.新生児 = 12;
    const mutation = createMutation(initial, imported, "backup", { relativeStock: false });
    const stockChange = mutation.settings.find((change) => change.path[change.path.length - 1] === "新生児");
    expect(stockChange?.after).toBe(12);
    expect(stockChange?.delta).toBeUndefined();
  });
});
