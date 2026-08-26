import { describe, expect, it } from "vitest";
import {
  analyzeSleepEvents,
  buildActivityGauge,
  buildSleepDaySummary,
  createAutoWakeTimestamp,
  getDefaultActivityLimitMinutes,
  getAutoWakeTimestampForActivity,
} from "./sleep";
import { LogEvent } from "@/types";

const event = (id: string, type: "sleepStart" | "wake", timestamp: number): LogEvent => ({
  id,
  babyId: "A",
  type,
  timestamp,
});

describe("sleep helpers", () => {
  it("pairs sleep and wake markers and leaves an active sleep open", () => {
    const analysis = analyzeSleepEvents(
      [event("sleep-2", "sleepStart", 300), event("wake-1", "wake", 200), event("sleep-1", "sleepStart", 100)],
      "A"
    );

    expect(analysis.intervals).toEqual([
      { start: 100, end: 200, startEventId: "sleep-1", wakeEventId: "wake-1" },
    ]);
    expect(analysis.currentSleepStart?.id).toBe("sleep-2");
  });

  it("marks a wake without a preceding sleep as invalid", () => {
    const analysis = analyzeSleepEvents([event("wake", "wake", 200)], "A");
    expect(analysis.invalidWakeIds.has("wake")).toBe(true);
    expect(analysis.intervals).toHaveLength(0);
  });

  it("pairs the next wake across other records and invalidates a duplicate sleep start", () => {
    const analysis = analyzeSleepEvents(
      [
        event("sleep-1", "sleepStart", 100),
        { id: "milk", babyId: "A", type: "milk", timestamp: 120, milkMl: 140 },
        event("sleep-2", "sleepStart", 130),
        { id: "diaper", babyId: "A", type: "diaper", timestamp: 150, diaperKind: "pee" },
        event("wake", "wake", 200),
      ],
      "A"
    );

    expect(analysis.intervals).toEqual([
      { start: 100, end: 200, startEventId: "sleep-1", wakeEventId: "wake" },
    ]);
    expect(analysis.invalidSleepStartIds.has("sleep-2")).toBe(true);
  });

  it("places an automatic wake at the requested lead time without preceding sleep start", () => {
    expect(createAutoWakeTimestamp(100_000, 200_000, 1)).toBe(140_000);
    expect(createAutoWakeTimestamp(190_000, 200_000, 15)).toBe(191_000);
  });

  it("uses 15 minutes for meals and one minute for diapers", () => {
    const sleepStartedAt = new Date("2026-08-23T09:00:00+09:00").getTime();
    const activityAt = new Date("2026-08-23T10:00:00+09:00").getTime();
    const events = [event("sleep", "sleepStart", sleepStartedAt)];
    expect(getAutoWakeTimestampForActivity(events, "A", activityAt, "milk")).toBe(
      new Date("2026-08-23T09:45:00+09:00").getTime()
    );
    expect(getAutoWakeTimestampForActivity(events, "A", activityAt, "solidFood")).toBe(
      new Date("2026-08-23T09:45:00+09:00").getTime()
    );
    expect(getAutoWakeTimestampForActivity(events, "A", activityAt, "diaper")).toBe(
      new Date("2026-08-23T09:59:00+09:00").getTime()
    );
  });

  it("automatically wakes only a baby with an open sleep interval", () => {
    expect(
      getAutoWakeTimestampForActivity(
        [event("sleep", "sleepStart", 100_000), event("wake", "wake", 150_000)],
        "A",
        200_000,
        "milk"
      )
    ).toBeNull();
  });

  it("counts only completed sleep in a day total", () => {
    const start = new Date("2026-08-23T01:00:00+09:00").getTime();
    const wake = new Date("2026-08-23T03:30:00+09:00").getTime();
    const active = new Date("2026-08-23T10:00:00+09:00").getTime();
    const analysis = analyzeSleepEvents(
      [event("start", "sleepStart", start), event("wake", "wake", wake), event("active", "sleepStart", active)],
      "A"
    );
    const summary = buildSleepDaySummary(
      analysis,
      new Date("2026-08-23T12:00:00+09:00"),
      new Date("2026-08-23T11:00:00+09:00")
    );

    expect(summary.totalMinutes).toBe(150);
    expect(summary.segments).toHaveLength(2);
  });

  it("uses the upper end of each age-based activity-time range", () => {
    const birthDate = "2026-04-02";
    const cases: Array<[string, number]> = [
      ["2026-04-15T12:00:00+09:00", 60],
      ["2026-05-02T12:00:00+09:00", 90],
      ["2026-06-02T12:00:00+09:00", 120],
      ["2026-07-02T12:00:00+09:00", 150],
      ["2026-08-02T12:00:00+09:00", 150],
      ["2026-09-02T12:00:00+09:00", 180],
      ["2026-10-02T12:00:00+09:00", 240],
      ["2027-01-02T12:00:00+09:00", 270],
      ["2027-02-02T12:00:00+09:00", 300],
      ["2027-07-02T12:00:00+09:00", 360],
    ];

    cases.forEach(([now, expected]) => {
      expect(getDefaultActivityLimitMinutes(birthDate, new Date(now))).toBe(expected);
    });
  });

  it("empties the activity gauge from the latest wake without resetting at midnight", () => {
    const firstStart = new Date("2026-08-23T22:00:00+09:00").getTime();
    const firstWake = new Date("2026-08-23T23:30:00+09:00").getTime();
    const analysis = analyzeSleepEvents(
      [event("start", "sleepStart", firstStart), event("wake", "wake", firstWake)],
      "A"
    );

    const gauge = buildActivityGauge(analysis, new Date("2026-08-24T00:30:00+09:00"), 150);
    expect(gauge.elapsedMinutes).toBe(60);
    expect(gauge.elapsedPercent).toBe(40);
    expect(buildActivityGauge(analysis, new Date("2026-08-24T03:00:00+09:00"), 150).elapsedPercent).toBe(100);
  });

  it("freezes the activity gauge at sleep start while the baby is sleeping", () => {
    const minute = 60 * 1000;
    const analysis = analyzeSleepEvents(
      [
        event("start", "sleepStart", 0),
        event("wake", "wake", 90 * minute),
        event("sleep-again", "sleepStart", 147 * minute),
      ],
      "A"
    );

    const gauge = buildActivityGauge(analysis, new Date(300 * minute), 120);
    expect(gauge.elapsedMinutes).toBe(57);
    expect(gauge.elapsedPercent).toBe(48);
  });
});
