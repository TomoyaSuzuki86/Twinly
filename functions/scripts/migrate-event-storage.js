/* Run with Application Default Credentials in a trusted admin environment.
 * Dry-run: node functions/scripts/migrate-event-storage.js PROJECT_ID FAMILY_ID
 * Apply:   node functions/scripts/migrate-event-storage.js PROJECT_ID FAMILY_ID --apply
 * Deploy compatible clients, rules, indexes and ALL backend consumers first.
 */
const admin = require("firebase-admin");
const { isDeepStrictEqual } = require("node:util");

async function migrate(db, familyId, apply = false) {
  const family = db.collection("families").doc(familyId);
  const ref = family.collection("app").doc("state");
  const backup = family.collection("storageBackups").doc("before-events-v2");
  let source = await ref.get();
  if (source.data()?.schemaVersion === 2) return { migrated: false, alreadyMigrated: true };
  const validate = (data) => {
    if (!data?.app?.profiles?.A || !data?.app?.profiles?.B || !Array.isArray(data.app.events)) {
      throw new Error("Valid existing app state required; refusing to initialize or discard data");
    }
    const ids = new Set();
    for (const event of data.app.events) {
      if (!event.id || typeof event.id !== "string" || event.id.includes("/") || [".", ".."].includes(event.id) ||
        /^__.*__$/.test(event.id) || Buffer.byteLength(event.id) > 1500 || ids.has(event.id) ||
        !["A", "B"].includes(event.babyId) || !Number.isFinite(event.timestamp)) {
        throw new Error("Invalid/duplicate event; migration stopped without removing source data");
      }
      ids.add(event.id);
    }
    return data.app.events;
  };
  validate(source.data());
  if (!apply) return { dryRun: true, events: source.data().app.events.length };

  // Lock old clients out, and create a byte-for-byte backup atomically.
  await db.runTransaction(async (transaction) => {
    source = await transaction.get(ref);
    const saved = await transaction.get(backup);
    if (source.data()?.schemaVersion === 2) throw new Error("Already migrated by another administrator");
    validate(source.data());
    if (saved.exists && source.data()?.migrationState !== "copying") throw new Error("Unexpected prior backup; manual review required");
    if (!saved.exists) transaction.create(backup, source.data());
    transaction.update(ref, { migrationState: "copying" });
  });
  const events = validate(source.data());
  // Stable IDs and the frozen source make retrying any interrupted batch safe.
  for (let offset = 0; offset < events.length; offset += 400) {
    const batch = db.batch();
    for (const event of events.slice(offset, offset + 400)) batch.set(family.collection("events").doc(event.id), event);
    await batch.commit();
  }
  const copied = await family.collection("events").get();
  const original = new Map(events.map((event) => [event.id, event]));
  if (copied.size !== original.size || copied.docs.some((row) => !isDeepStrictEqual(row.data(), original.get(row.id)))) {
    throw new Error("Verification failed; original and backup retained, writes remain locked");
  }
  await db.runTransaction(async (transaction) => {
    const locked = await transaction.get(ref);
    if (locked.data()?.migrationState !== "copying" || !isDeepStrictEqual(locked.data().app, source.data().app)) {
      throw new Error("Source changed; refusing to finish migration");
    }
    const { events: _events, ...settings } = source.data().app;
    transaction.set(ref, { app: settings, schemaVersion: 2, updatedAt: admin.firestore.FieldValue.serverTimestamp(), updatedBy: "storage-migration" });
  });
  return { migrated: true, events: events.length, backupPath: backup.path };
}

module.exports = { migrate };
if (require.main === module) {
  const [projectId, familyId, flag] = process.argv.slice(2);
  if (!projectId || !familyId || (flag && flag !== "--apply")) {
    console.error("Usage: node functions/scripts/migrate-event-storage.js PROJECT_ID FAMILY_ID [--apply]");
    process.exitCode = 1;
  } else {
    admin.initializeApp({ projectId });
    migrate(admin.firestore(), familyId, flag === "--apply").then(console.log).catch((error) => {
      console.error(error.message); process.exitCode = 1;
    });
  }
}
