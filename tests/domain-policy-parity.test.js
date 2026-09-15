import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import {
  analyzeSleepEvents as analyzeClientSleepEvents,
  buildActivityGauge,
  getAverageActivityMinutes as getClientAverageActivityMinutes,
  getDefaultActivityLimitMinutes as getClientDefaultActivityLimitMinutes,
} from "../src/lib/sleep";

const require = createRequire(import.meta.url);
const {
  analyzeSleepEvents: analyzeServerSleepEvents,
  buildActivityPercentAt,
  getAverageActivityMinutes: getServerAverageActivityMinutes,
  getDefaultActivityLimitMinutes: getServerDefaultActivityLimitMinutes,
} = require("../functions/care-reminders.js");

const minute = 60 * 1000;
const event = (id, type, timestamp) => ({ id, babyId: "A", type, timestamp });

const normalizeAnalysis = (analysis) => ({
  intervals: analysis.intervals.map(({ start, end, startEventId, wakeEventId }) => ({
    start,
    end,
    startEventId,
    wakeEventId,
  })),
  currentSleepStartId: analysis.currentSleepStart?.id ?? null,
});

describe("client/server sleep policy parity", () => {
  it("keeps age-based activity limits identical at month boundaries", () => {
    const birthDate = "2026-04-02";
    const cases = [
      ["2026-04-15T12:00:00+09:00", 60],
      ["2026-05-01T12:00:00+09:00", 60],
      ["2026-05-02T12:00:00+09:00", 90],
      ["2026-06-02T12:00:00+09:00", 120],
      ["2026-07-02T12:00:00+09:00", 150],
      ["2026-09-02T12:00:00+09:00", 180],
      ["2026-10-02T12:00:00+09:00", 240],
      ["2027-01-02T12:00:00+09:00", 270],
      ["2027-02-02T12:00:00+09:00", 300],
      ["2027-07-02T12:00:00+09:00", 360],
    ];

    for (const [nowIso, expected] of cases) {
      const now = new Date(nowIso);
      const client = getClientDefaultActivityLimitMinutes(birthDate, now);
      const server = getServerDefaultActivityLimitMinutes(birthDate, now.getTime());
      expect(client).toBe(expected);
      expect(server).toBe(expected);
      expect(server).toBe(client);
    }
  });

  it("keeps sleep pairing identical for the reminder-relevant state", () => {
    const events = [
      event("invalid-wake", "wake", 50 * minute),
      event("sleep-1", "sleepStart", 100 * minute),
      event("duplicate-sleep", "sleepStart", 110 * minute),
      event("wake-1", "wake", 130 * minute),
      event("sleep-2", "sleepStart", 200 * minute),
      event("wake-2", "wake", 230 * minute),
    ];

    expect(normalizeAnalysis(analyzeServerSleepEvents(events, "A"))).toEqual(
      normalizeAnalysis(analyzeClientSleepEvents(events, "A"))
    );
  });

  it("keeps recent completed activity averages identical", () => {
    const events = [
      event("sleep-1", "sleepStart", 0),
      event("wake-1", "wake", 60 * minute),
      event("sleep-2", "sleepStart", 180 * minute),
      event("wake-2", "wake", 240 * minute),
      event("sleep-3", "sleepStart", 420 * minute),
      event("wake-3", "wake", 480 * minute),
    ];
    const now = new Date(500 * minute);
    const clientAnalysis = analyzeClientSleepEvents(events, "A");
    const serverAnalysis = analyzeServerSleepEvents(events, "A");

    const client = getClientAverageActivityMinutes(clientAnalysis, now);
    const server = getServerAverageActivityMinutes(serverAnalysis, now.getTime());
    expect(client).toBe(150);
    expect(server).toBe(client);
  });

  it("keeps awake-state activity gauge recovery identical", () => {
    const cases = [
      {
        name: "15 minutes sleep recovers half",
        events: [event("sleep", "sleepStart", 0), event("wake", "wake", 15 * minute)],
        atMs: 15 * minute,
        limitMinutes: 120,
        expectedPercent: 50,
      },
      {
        name: "30 minutes sleep fully recovers",
        events: [event("sleep", "sleepStart", 0), event("wake", "wake", 30 * minute)],
        atMs: 30 * minute,
        limitMinutes: 120,
        expectedPercent: 0,
      },
      {
        name: "sleep and awake segments are applied chronologically",
        events: [
          event("reset-sleep", "sleepStart", 0),
          event("reset-wake", "wake", 30 * minute),
          event("nap-1-start", "sleepStart", 150 * minute),
          event("nap-1-wake", "wake", 165 * minute),
          event("nap-2-start", "sleepStart", 170 * minute),
          event("nap-2-wake", "wake", 185 * minute),
        ],
        atMs: 185 * minute,
        limitMinutes: 120,
        expectedPercent: 4,
      },
      {
        name: "activity limit is clamped to 30 minutes",
        events: [event("sleep", "sleepStart", 0), event("wake", "wake", 30 * minute)],
        atMs: 45 * minute,
        limitMinutes: 10,
        expectedPercent: 50,
      },
    ];

    for (const testCase of cases) {
      const clientAnalysis = analyzeClientSleepEvents(testCase.events, "A");
      const serverAnalysis = analyzeServerSleepEvents(testCase.events, "A");
      const clientPercent = buildActivityGauge(
        clientAnalysis,
        new Date(testCase.atMs),
        testCase.limitMinutes
      ).elapsedPercent;
      const serverPercent = Math.round(
        buildActivityPercentAt(serverAnalysis, testCase.atMs, testCase.limitMinutes)
      );

      expect(clientPercent, testCase.name).toBe(testCase.expectedPercent);
      expect(serverPercent, testCase.name).toBe(testCase.expectedPercent);
      expect(serverPercent, testCase.name).toBe(clientPercent);
    }
  });
});
