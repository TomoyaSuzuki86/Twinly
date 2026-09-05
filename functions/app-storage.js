// Provider boundary shared by Watch endpoints and scheduled reminders.
const assertWritable = (snapshot) => {
  if (snapshot.data()?.migrationState === "copying") throw new Error("Family data migration is in progress");
};

async function readApp(ref) {
  const snapshot = await ref.get();
  assertWritable(snapshot);
  const app = snapshot.data()?.app;
  if (!app || snapshot.data()?.schemaVersion !== 2) return app || null;
  const eventsRef = ref.parent.parent.collection("events");
  // Consumers need recent feeds for gauges, plus the last feed/diaper if older.
  const since = Date.now() - 3 * 86400000;
  const queries = [eventsRef.where("timestamp", ">=", since).orderBy("timestamp", "desc")];
  for (const babyId of ["A", "B"]) for (const type of ["milk", "diaper"]) {
    queries.push(eventsRef.where("babyId", "==", babyId).where("type", "==", type)
      .where("timestamp", "<", since).orderBy("timestamp", "desc").limit(1));
  }
  const snapshots = await Promise.all(queries.map((query) => query.get()));
  const events = new Map(snapshots.flatMap((rows) => rows.docs.map((row) => [row.id, { ...row.data(), id: row.id }])));
  return { ...app, events: [...events.values()].sort((a, b) => b.timestamp - a.timestamp) };
}

function writeApp(transaction, ref, snapshot, next, changedEvents, deletedIds, fieldValue, actor) {
  assertWritable(snapshot);
  if (snapshot.data()?.schemaVersion === 2) {
    const eventsRef = ref.parent.parent.collection("events");
    for (const event of changedEvents) transaction.set(eventsRef.doc(event.id), event);
    for (const id of deletedIds) transaction.delete(eventsRef.doc(id));
    const { events: _events, ...settings } = next;
    transaction.set(ref, { schemaVersion: 2, app: settings, updatedAt: fieldValue.serverTimestamp(), updatedBy: actor });
  } else {
    transaction.set(ref, { app: next, updatedAt: fieldValue.serverTimestamp(), updatedBy: actor }, { merge: true });
  }
}
module.exports = { readApp, writeApp, assertWritable };
