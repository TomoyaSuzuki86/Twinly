import { describe, expect, it } from "vitest";
import {
  formatClockMinutes,
  getAverageAwakeMinutes,
  getNightWindowEndingOn,
  getOverlapMinutes,
  toBedtimeClockMinutes,
  type SleepHistoryEntry,
} from "./sleep-history";

describe("sleep history calculations", () => {
  it("uses the 19:00 through 06:00 night window", () => {
    const now = new Date("2026-04-18T12:00:00+09:00");
    const window = getNightWindowEndingOn(now, now);
    expect(new Date(window.start).getHours()).toBe(19);
    expect(new Date(window.start).getDate()).toBe(17);
    expect(new Date(window.end).getHours()).toBe(6);
    expect(new Date(window.end).getDate()).toBe(18);
  });

  it("counts only overlap inside the requested window", () => {
    const entry: SleepHistoryEntry = { key: "x", start: 1000, end: 5000, complete: true };
    expect(getOverlapMinutes(entry, 2000, 4000)).toBeCloseTo(2000 / 60000);
  });

  it("calculates awake gaps chronologically", () => {
    const entries: SleepHistoryEntry[] = [
      { key: "b", start: 120 * 60000, end: 150 * 60000, complete: true },
      { key: "a", start: 0, end: 60 * 60000, complete: true },
    ];
    expect(getAverageAwakeMinutes(entries)).toBe(60);
  });

  it("normalizes after-midnight bedtime clocks", () => {
    expect(toBedtimeClockMinutes(new Date("2026-04-18T01:30:00+09:00").getTime())).toBe(25 * 60 + 30);
    expect(formatClockMinutes(25 * 60 + 30)).toBe("01:30");
  });
});
