const { buildSleepReminderCandidate } = require("./care-reminders");
const { resolveMilkWindowHours } = require("./milk-window-policy");
const { resolveDiaperWindowMinutes } = require("./diaper-window-policy");

const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
const QUEUE_COLLECTION = "careReminderQueue";
const BACKFILL_MARKER = "careReminderQueueV1";

let backfillKnownComplete = false;

const queueDocId = (familyId, babyId, kind) => `${familyId}__${babyId}__${kind}`;

const latestEvent = (events, babyId, type) =>
  events
    .filter((event) =>
      event?.babyId === babyId &&
      event?.type === type &&
      typeof event.timestamp === "number"
    )
    .sort((left, right) => right.timestamp - left.timestamp)[0] || null;

const buildSimpleCandidate = ({ events, profile, babyId, kind, nowMs }) => {
  const event = latestEvent(events, babyId, kind === "milk" ? "milk" : "diaper");
  if (!event) return null;

  const diaperWindowMinutes = resolveDiaperWindowMinutes(profile?.diaperGaugeWindowMinutes);
  const intervalMs = kind === "milk"
    ? resolveMilkWindowHours(profile?.milkGaugeWindowHours) * 60 * 60 * 1000
    : diaperWindowMinutes * MINUTE_MS;
  const dueAt = event.timestamp + intervalMs;

  return {
    babyId,
    kind,
    reminderKey: `${babyId}:${kind}`,
    displayName: profile?.displayName ?? `赤ちゃん${babyId}`,
    eventId: event.id,
    occurredAt: event.timestamp,
    dueAt,
    dueNow: dueAt <= nowMs,
  };
};

const buildProjectedReminderCandidates = ({ stateData, events, babyId, nowMs = Date.now() }) => {
  const app = stateData?.app;
  if (!app) return { milk: null, diaper: null, sleep: null };
  const profile = app.profiles?.[babyId] ?? {};
  const appState = { ...app, events };

  return {
    milk: buildSimpleCandidate({ events, profile, babyId, kind: "milk", nowMs }),
    diaper: buildSimpleCandidate({ events, profile, babyId, kind: "diaper", nowMs }),
    // Client timestamps may be up to roughly a minute ahead. Include that tiny skew now,
    // because the projection is event-driven and will not be re-run merely because time passed.
    sleep: buildSleepReminderCandidate({
      appState,
      babyId,
      lastSentByKey: {},
      nowMs: nowMs + 2 * MINUTE_MS,
    }),
  };
};

const projectionStateKey = (stateData) => {
  const app = stateData?.app ?? {};
  const profiles = app.profiles ?? {};
  const pick = (babyId) => {
    const profile = profiles[babyId] ?? {};
    return {
      displayName: profile.displayName ?? null,
      birthDate: profile.birthDate ?? null,
      milkGaugeWindowHours: profile.milkGaugeWindowHours ?? null,
      diaperGaugeWindowMinutes: profile.diaperGaugeWindowMinutes ?? null,
      activityLimitMinutesOverride: profile.activityLimitMinutesOverride ?? null,
    };
  };
  return JSON.stringify({
    schemaVersion: stateData?.schemaVersion ?? 1,
    sleepManagementEnabled: app.sleepManagementEnabled === true,
    A: pick("A"),
    B: pick("B"),
  });
};

const reconcileReminderState = ({ existing = {}, candidate, revision }) => {
  const previousRevision = String(existing.projectionRevision || "");
  if (previousRevision && revision && previousRevision > revision) return null;

  const lastHandledOccurredAt = Number(existing.lastHandledOccurredAt || 0);
  if (!candidate) {
    return {
      status: "inactive",
      projectionRevision: revision,
      nextReminderAt: null,
      candidate: null,
    };
  }

  const alreadyHandled =
    existing.lastHandledEventId === candidate.eventId ||
    candidate.occurredAt <= lastHandledOccurredAt;
  const samePendingSchedule =
    existing.eventId === candidate.eventId &&
    Number(existing.scheduledFor) === candidate.dueAt &&
    Number.isFinite(existing.nextReminderAt);

  return {
    status: alreadyHandled ? "handled" : "pending",
    projectionRevision: revision,
    nextReminderAt: alreadyHandled
      ? null
      : (samePendingSchedule ? Number(existing.nextReminderAt) : candidate.dueAt),
    candidate,
  };
};

async function loadProjectionEvents(db, root, stateData, babyId, nowMs) {
  const app = stateData?.app;
  if (!app) return [];
  if (stateData?.schemaVersion !== 2) {
    return Array.isArray(app.events) ? app.events : [];
  }

  const eventsRef = root.collection("events");
  const since = nowMs - 8 * DAY_MS;
  const [milkRows, diaperRows, sleepRows, wakeRows] = await Promise.all([
    eventsRef.where("babyId", "==", babyId).where("type", "==", "milk")
      .orderBy("timestamp", "desc").limit(1).get(),
    eventsRef.where("babyId", "==", babyId).where("type", "==", "diaper")
      .orderBy("timestamp", "desc").limit(1).get(),
    eventsRef.where("babyId", "==", babyId).where("type", "==", "sleepStart")
      .where("timestamp", ">=", since).orderBy("timestamp", "desc").get(),
    eventsRef.where("babyId", "==", babyId).where("type", "==", "wake")
      .where("timestamp", ">=", since).orderBy("timestamp", "desc").get(),
  ]);

  const byId = new Map();
  for (const row of [milkRows, diaperRows, sleepRows, wakeRows].flatMap((rows) => rows.docs)) {
    byId.set(row.id, { ...row.data(), id: row.id });
  }
  return [...byId.values()];
}

async function writeProjectedReminder({ db, admin, familyId, babyId, kind, candidate, revision }) {
  const ref = db.collection(QUEUE_COLLECTION).doc(queueDocId(familyId, babyId, kind));
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const existing = snapshot.exists ? snapshot.data() || {} : {};
    const next = reconcileReminderState({ existing, candidate, revision });
    if (!next) return;

    const patch = {
      familyId,
      babyId,
      kind,
      status: next.status,
      projectionRevision: revision,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    if (next.candidate) {
      Object.assign(patch, {
        reminderKey: next.candidate.reminderKey,
        displayName: next.candidate.displayName,
        eventId: next.candidate.eventId,
        occurredAt: next.candidate.occurredAt,
        scheduledFor: next.candidate.dueAt,
      });
    }

    patch.nextReminderAt = Number.isFinite(next.nextReminderAt)
      ? next.nextReminderAt
      : admin.firestore.FieldValue.delete();

    transaction.set(ref, patch, { merge: true });
  });
}

async function projectFamilyReminders({
  db,
  admin,
  familyId,
  babyIds = ["A", "B"],
  revision = new Date().toISOString(),
  stateData,
  nowMs = Date.now(),
}) {
  const root = db.collection("families").doc(familyId);
  let resolvedState = stateData;
  if (!resolvedState) {
    const stateSnapshot = await root.collection("app").doc("state").get();
    if (!stateSnapshot.exists) return;
    resolvedState = stateSnapshot.data();
  }
  if (!resolvedState?.app) return;

  for (const babyId of babyIds) {
    const events = await loadProjectionEvents(db, root, resolvedState, babyId, nowMs);
    const candidates = buildProjectedReminderCandidates({
      stateData: resolvedState,
      events,
      babyId,
      nowMs,
    });
    await Promise.all(["milk", "diaper", "sleep"].map((kind) =>
      writeProjectedReminder({
        db,
        admin,
        familyId,
        babyId,
        kind,
        candidate: candidates[kind],
        revision,
      })
    ));
  }
}

async function ensureCareReminderBackfill({ db, admin, logger }) {
  if (backfillKnownComplete) return;
  const markerRef = db.collection("systemMigrations").doc(BACKFILL_MARKER);
  const marker = await markerRef.get();
  if (marker.exists) {
    backfillKnownComplete = true;
    return;
  }

  const families = await db.collection("families").get();
  for (const family of families.docs) {
    try {
      await projectFamilyReminders({
        db,
        admin,
        familyId: family.id,
        babyIds: ["A", "B"],
        revision: "",
      });
    } catch (error) {
      logger.error("Care reminder backfill failed", {
        familyId: family.id,
        message: error?.message,
      });
      throw error;
    }
  }

  await markerRef.set({
    completedAt: admin.firestore.FieldValue.serverTimestamp(),
    familyCount: families.size,
  });
  backfillKnownComplete = true;
}

module.exports = {
  BACKFILL_MARKER,
  QUEUE_COLLECTION,
  buildProjectedReminderCandidates,
  ensureCareReminderBackfill,
  projectFamilyReminders,
  projectionStateKey,
  queueDocId,
  reconcileReminderState,
};
