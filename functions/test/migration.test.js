const { test } = require("node:test");
const assert = require("node:assert/strict");
const { migrate } = require("../scripts/migrate-event-storage");

function memoryDatabase(events) {
  const original = { app: { profiles: { A: { babyId: "A" }, B: { babyId: "B" } }, events }, updatedBy: "original" };
  const rows = new Map([["families/test/app/state", structuredClone(original)]]);
  let batches = 0;
  let failBatch = 0;
  const snapshot = (path) => ({ id: path.split("/").pop(), exists: rows.has(path), data: () => structuredClone(rows.get(path)) });
  const ref = (path) => ({ path, doc: (id) => ref(`${path}/${id}`), collection: (id) => ref(`${path}/${id}`),
    get: async () => {
      if (path.endsWith("/events")) {
        const docs = [...rows.keys()].filter((key) => key.startsWith(`${path}/`)).map(snapshot);
        return { docs, size: docs.length };
      }
      return snapshot(path);
    } });
  const transaction = () => {
    const staged = [];
    return {
      get: async (reference) => snapshot(reference.path),
      create: (reference, value) => staged.push(() => rows.set(reference.path, structuredClone(value))),
      set: (reference, value) => staged.push(() => rows.set(reference.path, value)),
      update: (reference, value) => staged.push(() => rows.set(reference.path, { ...rows.get(reference.path), ...value })),
      commit: async () => { staged.forEach((write) => write()); },
    };
  };
  const db = {
    collection: ref,
    runTransaction: async (action) => { const tx = transaction(); await action(tx); await tx.commit(); },
    batch: () => { const tx = transaction(); return { ...tx, commit: async () => {
      batches++; if (batches === failBatch) throw new Error("interrupted"); await tx.commit();
    } }; },
  };
  return { db, rows, original, failOnBatch: (n) => { failBatch = n; } };
}
const event = (id) => ({ id: String(id), babyId: "A", type: "milk", timestamp: 1000 + id, milkMl: 120 });

test("dry run leaves the source byte-for-byte unchanged", async () => {
  const context = memoryDatabase([event(1)]);
  assert.deepEqual(await migrate(context.db, "test"), { dryRun: true, events: 1 });
  assert.equal(context.rows.size, 1);
  assert.deepEqual(context.rows.get("families/test/app/state"), context.original);
});
test("migration resumes after an interrupted batch and verifies all records", async () => {
  const context = memoryDatabase(Array.from({ length: 501 }, (_, i) => event(i)));
  context.failOnBatch(2);
  await assert.rejects(migrate(context.db, "test", true), /interrupted/);
  assert.equal(context.rows.get("families/test/app/state").app.events.length, 501);
  assert.equal(context.rows.get("families/test/app/state").migrationState, "copying");
  const result = await migrate(context.db, "test", true);
  assert.equal(result.events, 501);
  assert.equal(context.rows.get("families/test/app/state").schemaVersion, 2);
  assert.equal(context.rows.get("families/test/app/state").app.events, undefined);
  assert.deepEqual(context.rows.get("families/test/storageBackups/before-events-v2"), context.original);
  assert.deepEqual(await migrate(context.db, "test", true), { migrated: false, alreadyMigrated: true });
});
test("invalid duplicate IDs stop migration before any writes", async () => {
  const context = memoryDatabase([event(1), event(1)]);
  await assert.rejects(migrate(context.db, "test", true), /duplicate/);
  assert.equal(context.rows.size, 1);
  assert.deepEqual(context.rows.get("families/test/app/state"), context.original);
});
test("unmatched existing event documents keep the original locked and intact", async () => {
  const context = memoryDatabase([event(1)]);
  context.rows.set("families/test/events/unknown", event(2));
  await assert.rejects(migrate(context.db, "test", true), /Verification failed/);
  assert.equal(context.rows.get("families/test/app/state").migrationState, "copying");
  assert.deepEqual(context.rows.get("families/test/app/state").app, context.original.app);
});
