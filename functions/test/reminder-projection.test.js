const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildProjectedReminderCandidates,
  projectionStateKey,
  queueDocId,
  reconcileReminderState,
} = require("../reminder-projection");

const hour = 60 * 60 * 1000;
const minute = 60 * 1000;

const stateData = {
  schemaVersion: 2,
  app: {
    sleepManagementEnabled: true,
    profiles: {
      A: {
        displayName: "奏汰",
        birthDate: "2026-04-02",
        milkGaugeWindowHours: 3,
        diaperGaugeWindowMinutes: 120,
        activityLimitMinutesOverride: 180,
      },
      B: {
        displayName: "日向",
        birthDate: "2026-04-02",
      },
    },
  },
};

test("projects milk and diaper nextReminderAt from the latest event", () => {
  const now = Date.UTC(2026, 8, 25, 0, 0);
  const events = [
    { id: "milk-old", babyId: "A", type: "milk", timestamp: now - 4 * hour },
    { id: "milk-new", babyId: "A", type: "milk", timestamp: now - hour },
    { id: "diaper-new", babyId: "A", type: "diaper", timestamp: now - 30 * minute },
  ];

  const projected = buildProjectedReminderCandidates({
    stateData,
    events,
    babyId: "A",
    nowMs: now,
  });

  assert.equal(projected.milk.eventId, "milk-new");
  assert.equal(projected.milk.dueAt, now + 2 * hour);
  assert.equal(projected.diaper.eventId, "diaper-new");
  assert.equal(projected.diaper.dueAt, now + 90 * minute);
});

test("handled events are not re-queued by an unrelated projection", () => {
  const candidate = {
    eventId: "milk-1",
    occurredAt: 1000,
    dueAt: 2000,
  };
  const existing = {
    eventId: "milk-1",
    scheduledFor: 2000,
    lastHandledEventId: "milk-1",
    lastHandledOccurredAt: 1000,
    projectionRevision: "2026-09-25T00:00:00.000Z",
  };

  const next = reconcileReminderState({
    existing,
    candidate,
    revision: "2026-09-25T00:01:00.000Z",
  });
  assert.equal(next.status, "handled");
  assert.equal(next.nextReminderAt, null);
});

test("a newer care event gets a new nextReminderAt", () => {
  const existing = {
    eventId: "milk-1",
    scheduledFor: 2000,
    lastHandledEventId: "milk-1",
    lastHandledOccurredAt: 1000,
    projectionRevision: "2026-09-25T00:00:00.000Z",
  };
  const candidate = {
    eventId: "milk-2",
    occurredAt: 3000,
    dueAt: 4000,
  };

  const next = reconcileReminderState({
    existing,
    candidate,
    revision: "2026-09-25T00:01:00.000Z",
  });
  assert.equal(next.status, "pending");
  assert.equal(next.nextReminderAt, 4000);
});

test("deleting a newer event does not resurrect an older already-handled reminder", () => {
  const existing = {
    lastHandledEventId: "milk-new",
    lastHandledOccurredAt: 5000,
    projectionRevision: "2026-09-25T00:00:00.000Z",
  };
  const fallback = {
    eventId: "milk-old",
    occurredAt: 3000,
    dueAt: 4000,
  };

  const next = reconcileReminderState({
    existing,
    candidate: fallback,
    revision: "2026-09-25T00:01:00.000Z",
  });
  assert.equal(next.status, "handled");
  assert.equal(next.nextReminderAt, null);
});

test("older out-of-order projections cannot overwrite a newer projection", () => {
  const next = reconcileReminderState({
    existing: {
      projectionRevision: "2026-09-25T00:02:00.000Z",
      eventId: "milk-new",
      scheduledFor: 5000,
      nextReminderAt: 5000,
    },
    candidate: { eventId: "milk-old", occurredAt: 1000, dueAt: 2000 },
    revision: "2026-09-25T00:01:00.000Z",
  });
  assert.equal(next, null);
});

test("projection settings key ignores unrelated state metadata", () => {
  const base = projectionStateKey(stateData);
  const changedMetadata = projectionStateKey({
    ...stateData,
    updatedBy: "someone-else",
    updatedAt: 123,
  });
  assert.equal(base, changedMetadata);
});

test("queue document id is stable per family, baby and care kind", () => {
  assert.equal(queueDocId("family-1", "A", "milk"), "family-1__A__milk");
});
