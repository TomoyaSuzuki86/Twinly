import { describe, expect, it, vi } from "vitest";
import type { AppState, LogEvent } from "@/types";
import { createInitialAppState } from "@/lib/app-state";
import { appendEvents } from "@/lib/event-mutations";
import { AppStore, type StoreStatus } from "./app-store";
import type { AppMutation, AppRepository, AppSnapshot, CommitResult } from "./app-repository";

const shared: LogEvent = { id: "shared", babyId: "A", type: "milk", timestamp: 1_000, milkMl: 120 };
const later: LogEvent = { id: "later", babyId: "B", type: "diaper", timestamp: 2_000, diaperKind: "pee" };

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

function setup() {
  const initial = appendEvents(createInitialAppState(), [shared]);
  let remote = initial;
  let listener: (snapshot: AppSnapshot) => void = () => {};
  let releaseFirst: ((result: CommitResult) => void) | undefined;
  let calls = 0;
  const commit = vi.fn((mutation: AppMutation) => {
    calls += 1;
    if (calls === 1) {
      return new Promise<AppMutation | CommitResult>((resolve) => { releaseFirst = resolve; });
    }
    remote = appendEvents(remote, mutation.events.flatMap((change) => change.after ? [change.after] : []));
    return Promise.resolve(mutation);
  });
  const repository: AppRepository = {
    subscribe: (next) => {
      listener = next;
      next({ app: remote, fromCache: false, completeHistory: true });
      return () => {};
    },
    commit,
    loadAll: async () => remote,
  };
  const persistence = memoryStorage();
  let view: AppState = initial;
  let status: StoreStatus = { pending: 0, error: null, ready: false, fromCache: true, conflicts: [] };
  const store = new AppStore(repository, initial, persistence.storage, "conflict-test", (next, nextStatus) => {
    view = next;
    status = nextStatus;
  });
  return {
    store,
    commit,
    listener: () => listener,
    releaseFirst: (result: CommitResult) => releaseFirst?.(result),
    view: () => view,
    status: () => status,
    initial,
  };
}

describe("AppStore conflict isolation", () => {
  it("keeps later saves moving while one field waits for a user choice", async () => {
    const context = setup();
    const stop = context.store.start();

    context.store.update((app) => ({ ...app, events: app.events.map((event) => event.id === "shared" ? { ...event, milkMl: 140 } : event) }));
    await vi.waitFor(() => expect(context.commit).toHaveBeenCalledTimes(1));
    const firstMutation = context.commit.mock.calls[0][0];

    context.store.update((app) => appendEvents(app, [later]));
    expect(context.status().pending).toBe(2);

    const remoteShared = { ...shared, milkMl: 160 };
    const unresolved: AppMutation = {
      id: firstMutation.id,
      queuedAt: firstMutation.queuedAt,
      events: [{ id: "shared", before: remoteShared, after: { ...remoteShared, milkMl: 140 } }],
      settings: [],
    };
    context.releaseFirst({
      confirmed: { id: firstMutation.id, queuedAt: firstMutation.queuedAt, events: [], settings: [] },
      conflicts: [{
        id: `${firstMutation.id}:event:shared:milkMl`,
        mutationId: firstMutation.id,
        kind: "event",
        field: "milkMl",
        eventId: "shared",
        babyId: "A",
        eventType: "milk",
        localValue: 140,
        remoteValue: 160,
      }],
      unresolved,
    });

    context.listener()({ app: appendEvents(createInitialAppState(), [remoteShared]), fromCache: false, completeHistory: true });
    await vi.waitFor(() => expect(context.commit).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(context.status().pending).toBe(0));

    expect(context.status().conflicts).toHaveLength(1);
    expect(context.view().events.find((event) => event.id === "shared")?.milkMl).toBe(140);
    expect(context.view().events.some((event) => event.id === "later")).toBe(true);
    stop();
  });

  it("choosing the other device removes only the conflicting local field", async () => {
    const context = setup();
    const stop = context.store.start();

    context.store.update((app) => ({ ...app, events: app.events.map((event) => event.id === "shared" ? { ...event, milkMl: 140 } : event) }));
    await vi.waitFor(() => expect(context.commit).toHaveBeenCalledTimes(1));
    const firstMutation = context.commit.mock.calls[0][0];
    const remoteShared = { ...shared, milkMl: 160 };
    const conflictId = `${firstMutation.id}:event:shared:milkMl`;
    context.releaseFirst({
      confirmed: { id: firstMutation.id, queuedAt: firstMutation.queuedAt, events: [], settings: [] },
      conflicts: [{
        id: conflictId,
        mutationId: firstMutation.id,
        kind: "event",
        field: "milkMl",
        eventId: "shared",
        babyId: "A",
        eventType: "milk",
        localValue: 140,
        remoteValue: 160,
      }],
      unresolved: {
        id: firstMutation.id,
        queuedAt: firstMutation.queuedAt,
        events: [{ id: "shared", before: remoteShared, after: { ...remoteShared, milkMl: 140 } }],
        settings: [],
      },
    });
    context.listener()({ app: appendEvents(createInitialAppState(), [remoteShared]), fromCache: false, completeHistory: true });
    await vi.waitFor(() => expect(context.status().conflicts).toHaveLength(1));

    context.store.resolveConflict(conflictId, "remote");

    expect(context.status().conflicts).toHaveLength(0);
    expect(context.view().events.find((event) => event.id === "shared")?.milkMl).toBe(160);
    stop();
  });
});
