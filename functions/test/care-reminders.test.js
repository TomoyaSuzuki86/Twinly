const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildCareNotificationPayload,
  buildSleepReminderCandidate,
  prioritizeNotificationGroup,
} = require("../care-reminders");

const minute = 60 * 1000;

const candidate = (overrides = {}) => ({
  babyId: "A",
  kind: "milk",
  reminderKey: "A:milk",
  displayName: "奏汰",
  eventId: "event-1",
  occurredAt: Date.UTC(2026, 8, 14, 0, 0),
  dueAt: Date.UTC(2026, 8, 14, 3, 0),
  dueNow: true,
  ...overrides,
});

test("milk reminder uses natural action-oriented copy", () => {
  const nowMs = Date.UTC(2026, 8, 14, 3, 0);
  const payload = buildCareNotificationPayload([candidate()], nowMs);

  assert.equal(payload.title, "奏汰、そろそろミルクの時間です");
  assert.equal(payload.body, "前回 09:00 ・ 3時間経過");
  assert.equal(payload.tag, "care-reminder-A-milk");
  assert.deepEqual(payload.careReminder, {
    babyId: "A",
    kind: "milk",
    eventId: "event-1",
    occurredAt: candidate().occurredAt,
  });
});

test("diaper reminder uses check wording instead of gauge wording", () => {
  const nowMs = Date.UTC(2026, 8, 14, 2, 0);
  const payload = buildCareNotificationPayload([
    candidate({
      kind: "diaper",
      reminderKey: "A:diaper",
      eventId: "diaper-1",
      dueAt: nowMs,
    }),
  ], nowMs);

  assert.equal(payload.title, "奏汰、そろそろおむつチェック");
  assert.equal(payload.body, "前回交換 09:00 ・ 2時間経過");
  assert.equal(payload.tag, "care-reminder-A-diaper");
});

test("milk suppresses a simultaneous diaper notification for the same baby", () => {
  const milk = candidate();
  const diaper = candidate({
    kind: "diaper",
    reminderKey: "A:diaper",
    eventId: "diaper-1",
    dueAt: milk.dueAt,
  });

  const visible = prioritizeNotificationGroup([diaper, milk]);
  assert.deepEqual(visible.map((item) => item.kind), ["milk"]);

  const payload = buildCareNotificationPayload([diaper, milk], milk.dueAt);
  assert.equal(payload.title, "奏汰、そろそろミルクの時間です");
  assert.doesNotMatch(payload.body, /おむつ/);
});

test("diaper for the other baby remains visible when milk is due", () => {
  const milk = candidate();
  const diaper = candidate({
    babyId: "B",
    kind: "diaper",
    reminderKey: "B:diaper",
    displayName: "日向",
    eventId: "diaper-b",
    dueAt: milk.dueAt,
  });

  const visible = prioritizeNotificationGroup([milk, diaper]);
  assert.equal(visible.length, 2);
  const payload = buildCareNotificationPayload(visible, milk.dueAt);
  assert.equal(payload.title, "奏汰、そろそろミルクの時間です");
  assert.match(payload.body, /奏汰：ミルク/);
  assert.match(payload.body, /日向：おむつ/);
});

test("sleep reminder becomes due when the activity gauge reaches full", () => {
  const wakeAt = Date.UTC(2026, 8, 14, 0, 30);
  const nowMs = wakeAt + 180 * minute;
  const appState = {
    sleepManagementEnabled: true,
    profiles: {
      A: {
        displayName: "奏汰",
        birthDate: "2026-04-02",
        activityLimitMinutesOverride: 180,
      },
    },
    events: [
      { id: "sleep-1", babyId: "A", type: "sleepStart", timestamp: wakeAt - 30 * minute },
      { id: "wake-1", babyId: "A", type: "wake", timestamp: wakeAt },
    ],
  };

  const sleepCandidate = buildSleepReminderCandidate({
    appState,
    babyId: "A",
    lastSentByKey: {},
    nowMs,
  });

  assert.ok(sleepCandidate);
  assert.equal(sleepCandidate.kind, "sleep");
  assert.equal(sleepCandidate.dueAt, nowMs);
  assert.equal(sleepCandidate.dueNow, true);

  const payload = buildCareNotificationPayload([sleepCandidate], nowMs);
  assert.equal(payload.title, "奏汰、そろそろ寝る時間です");
  assert.equal(payload.body, "起床 09:30 ・ 3時間経過");
});

test("partial sleep recovery shortens the next activity window", () => {
  const sleepStart = Date.UTC(2026, 8, 14, 0, 0);
  const wakeAt = sleepStart + 15 * minute;
  const dueAt = wakeAt + 60 * minute;
  const appState = {
    sleepManagementEnabled: true,
    profiles: {
      A: {
        displayName: "奏汰",
        birthDate: "2026-04-02",
        activityLimitMinutesOverride: 120,
      },
    },
    events: [
      { id: "sleep-1", babyId: "A", type: "sleepStart", timestamp: sleepStart },
      { id: "wake-1", babyId: "A", type: "wake", timestamp: wakeAt },
    ],
  };

  const beforeDue = buildSleepReminderCandidate({
    appState,
    babyId: "A",
    lastSentByKey: {},
    nowMs: dueAt - minute,
  });
  assert.ok(beforeDue);
  assert.equal(beforeDue.dueAt, dueAt);
  assert.equal(beforeDue.dueNow, false);

  const atDue = buildSleepReminderCandidate({
    appState,
    babyId: "A",
    lastSentByKey: {},
    nowMs: dueAt,
  });
  assert.equal(atDue.dueNow, true);
});

test("sleep reminder is suppressed while sleeping and after the same wake was notified", () => {
  const wakeAt = Date.UTC(2026, 8, 14, 0, 30);
  const baseState = {
    sleepManagementEnabled: true,
    profiles: {
      A: {
        displayName: "奏汰",
        birthDate: "2026-04-02",
        activityLimitMinutesOverride: 60,
      },
    },
    events: [
      { id: "sleep-1", babyId: "A", type: "sleepStart", timestamp: wakeAt - 30 * minute },
      { id: "wake-1", babyId: "A", type: "wake", timestamp: wakeAt },
    ],
  };

  const alreadySent = buildSleepReminderCandidate({
    appState: baseState,
    babyId: "A",
    lastSentByKey: { "A:sleep": { eventId: "wake-1" } },
    nowMs: wakeAt + 60 * minute,
  });
  assert.equal(alreadySent, null);

  const sleeping = buildSleepReminderCandidate({
    appState: {
      ...baseState,
      events: [
        ...baseState.events,
        { id: "sleep-2", babyId: "A", type: "sleepStart", timestamp: wakeAt + 40 * minute },
      ],
    },
    babyId: "A",
    lastSentByKey: {},
    nowMs: wakeAt + 60 * minute,
  });
  assert.equal(sleeping, null);
});
