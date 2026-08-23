import { describe, expect, it } from "vitest";
import {
  analyzeSleepEvents,
  buildSleepDaySummary,
  buildSleepGauge,
  createAutoWakeTimestamp,
  getDefaultSleepTargetHours,
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

  it("uses age-based default sleep targets", () => {
    const birthDate = "2026-04-02";
    expect(getDefaultSleepTargetHours(birthDate, new Date("2026-08-01T12:00:00+09:00"))).toBe(15);
    expect(getDefaultSleepTargetHours(birthDate, new Date("2026-08-02T12:00:00+09:00"))).toBe(13);
    expect(getDefaultSleepTargetHours(birthDate, new Date("2027-04-02T12:00:00+09:00"))).toBe(12);
  });

  it("empties the daily sleep gauge from the target and resets at midnight", () => {
    const firstStart = new Date("2026-08-23T00:30:00+09:00").getTime();
    const firstWake = new Date("2026-08-23T03:30:00+09:00").getTime();
    const analysis = analyzeSleepEvents(
      [event("start", "sleepStart", firstStart), event("wake", "wake", firstWake)],
      "A"
    );

    expect(
      buildSleepGauge(
        analysis,
        new Date("2026-08-23T12:00:00+09:00"),
        new Date("2026-08-23T12:00:00+09:00"),
        15
      ).remainingPercent
    ).toBe(80);
    expect(
      buildSleepGauge(
        analysis,
        new Date("2026-08-24T00:05:00+09:00"),
        new Date("2026-08-24T00:05:00+09:00"),
        15
      ).remainingPercent
    ).toBe(100);
  });
});
