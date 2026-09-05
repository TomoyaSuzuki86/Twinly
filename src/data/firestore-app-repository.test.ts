import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Firestore } from "firebase/firestore";
import { createInitialAppState, toSharedAppState } from "@/lib/app-state";
import { appendEvents } from "@/lib/event-mutations";
import { createMutation } from "./app-repository";

const memory = vi.hoisted(() => ({ docs: new Map<string, any>(), reads: [] as string[], writes: [] as string[], queries: [] as any[] }));
vi.mock("firebase/firestore", () => {
  const ref = (...parts: any[]) => ({ path: parts.map((part) => typeof part === "string" ? part : part.path || "").filter(Boolean).join("/") });
  const snapshot = (path: string) => ({ id: path.split("/").pop(), exists: () => memory.docs.has(path),
    data: () => structuredClone(memory.docs.get(path)), metadata: { fromCache: false } });
  return {
    doc: ref, collection: ref, serverTimestamp: () => 123,
    where: (...args: any[]) => ({ kind: "where", args }), orderBy: (...args: any[]) => ({ kind: "order", args }),
    limit: (value: number) => ({ kind: "limit", value }), startAfter: (value: any) => ({ kind: "cursor", value }),
    query: (reference: any, ...constraints: any[]) => { const q = { ...reference, constraints }; memory.queries.push(q); return q; },
    getDocFromServer: async (reference: any) => snapshot(reference.path),
    getDocs: async () => ({ docs: [], size: 0, metadata: { fromCache: false } }),
    onSnapshot: (reference: any, options: any, listener?: any) => {
      const callback = typeof options === "function" ? options : listener;
      callback(reference.constraints ? { docs: [], metadata: { fromCache: false } } : snapshot(reference.path));
      return () => {};
    },
    runTransaction: async (_db: any, action: any) => {
      const staged: (() => void)[] = [];
      const result = await action({
        get: async (reference: any) => { memory.reads.push(reference.path); return snapshot(reference.path); },
        set: (reference: any, value: any, options: any) => staged.push(() => {
          memory.writes.push(reference.path);
          memory.docs.set(reference.path, options?.merge ? { ...memory.docs.get(reference.path), ...value } : value);
        }),
        delete: (reference: any) => staged.push(() => { memory.writes.push(reference.path); memory.docs.delete(reference.path); }),
      });
      staged.forEach((write) => write());
      return result;
    },
  };
});
import { createFirestoreAppRepository } from "./firestore-app-repository";

const statePath = "families/family/app/state";
const record = { id: "event", babyId: "A" as const, type: "milk" as const, timestamp: Date.now(), milkMl: 120 };
const repository = () => createFirestoreAppRepository({} as Firestore, "family", "user");
beforeEach(() => { memory.docs.clear(); memory.reads = []; memory.writes = []; memory.queries = []; });

describe("Firestore adapter contract", () => {
  it("writes just one event and receipt in v2 without rewriting shared state", async () => {
    const initial = createInitialAppState();
    memory.docs.set(statePath, { schemaVersion: 2, app: { ...toSharedAppState(initial), events: undefined } });
    await repository().commit(createMutation(initial, appendEvents(initial, [record]), "op"));
    expect(memory.writes).toEqual(["families/family/events/event", "families/family/mutations/op"]);
    expect(memory.reads).toHaveLength(3);
  });
  it("uses a receipt to make repeated stock consumption idempotent", async () => {
    const initial = createInitialAppState();
    memory.docs.set(statePath, { schemaVersion: 2, app: { ...toSharedAppState(initial), events: undefined } });
    const operation = createMutation(initial, appendEvents(initial, [{ ...record, type: "diaper" }]), "op");
    await repository().commit(operation);
    const writeCount = memory.writes.length;
    await repository().commit(operation);
    expect(memory.writes).toHaveLength(writeCount);
    expect(memory.docs.get(statePath).app.profiles.A.diaperStockBySize.新生児).toBe(79);
  });
  it("preserves legacy history without silently migrating or truncating it", async () => {
    const initial = appendEvents(createInitialAppState(), [{ ...record, id: "old" }]);
    memory.docs.set(statePath, { app: toSharedAppState(initial) });
    await repository().commit(createMutation(initial, appendEvents(initial, [record]), "op"));
    expect(memory.docs.get(statePath).app.events).toHaveLength(2);
    expect(memory.docs.get(statePath).schemaVersion).toBeUndefined();
  });
  it("does not write during a migration or after a conflicting remote edit", async () => {
    const initial = createInitialAppState();
    memory.docs.set(statePath, { schemaVersion: 2, migrationState: "copying", app: toSharedAppState(initial) });
    await expect(repository().commit(createMutation(initial, appendEvents(initial, [record]), "op"))).rejects.toThrow("更新中");
    expect(memory.writes).toEqual([]);
  });
  it("bounds normal history and uses only limit-one queries for prior state", () => {
    memory.docs.set(statePath, { schemaVersion: 2, app: toSharedAppState(createInitialAppState()) });
    repository().subscribe(() => {}, () => {});
    expect(memory.queries).toHaveLength(15);
    const window = memory.queries.filter((q) => q.constraints.some((c: any) => c.kind === "where" && c.args[1] === ">="));
    expect(window).toHaveLength(1);
    expect(memory.queries.filter((q) => q.constraints.some((c: any) => c.kind === "limit" && c.value === 1))).toHaveLength(14);
  });
  it("reconciles simultaneous consumption of the last diaper", async () => {
    const initial = createInitialAppState();
    initial.profiles.A.diaperStockBySize.新生児 = 1;
    initial.profiles.B.diaperStockBySize.新生児 = 1;
    memory.docs.set(statePath, { schemaVersion: 2, app: toSharedAppState(initial) });
    const first = createMutation(initial, appendEvents(initial, [{ ...record, type: "diaper" }]), "first");
    const second = createMutation(initial, appendEvents(initial, [{ ...record, id: "second", type: "diaper" }]), "second");
    await repository().commit(first);
    await repository().commit(second);
    expect(memory.docs.get("families/family/events/second").diaperStockConsumed).toBe(0);
    expect(memory.docs.get(statePath).app.profiles.A.diaperStockBySize.新生児).toBe(0);
  });
});
