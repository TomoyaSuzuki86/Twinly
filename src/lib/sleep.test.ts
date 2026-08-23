import { describe, expect, it } from "vitest";
import {
  analyzeSleepEvents,
  buildSleepDaySummary,
  createAutoWakeTimestamp,
  getAutoWakeTimestampForMilk,
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

  it("places an automatic wake one minute before activity without preceding sleep start", () => {
    expect(createAutoWakeTimestamp(100_000, 200_000)).toBe(140_000);
    expect(createAutoWakeTimestamp(190_000, 200_000)).toBe(191_000);
  });

  it("automatically wakes only a baby with an open sleep interval", () => {
    expect(getAutoWakeTimestampForMilk([event("sleep", "sleepStart", 100_000)], "A", 200_000)).toBe(140_000);
    expect(
      getAutoWakeTimestampForMilk(
        [event("sleep", "sleepStart", 100_000), event("wake", "wake", 150_000)],
        "A",
        200_000
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
});
