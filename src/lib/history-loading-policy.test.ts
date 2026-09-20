import { describe, expect, it } from "vitest";
import { shouldLoadCompleteHistory } from "./history-loading-policy";

const closed = {
  chartOpen: false,
  dailyReportOpen: false,
  timelineOpen: false,
  historyOpen: false,
  settingsOpen: false,
};

describe("history loading policy", () => {
  it("loads complete history when a history-dependent surface is open", () => {
    expect(shouldLoadCompleteHistory({
      activeDate: "2026-09-20",
      now: new Date("2026-09-20T12:00:00+09:00"),
      overlays: { ...closed, historyOpen: true },
    })).toBe(true);
  });

  it("keeps the existing 30 day window with 4 day prefetch margin", () => {
    const now = new Date("2026-09-20T12:00:00+09:00");
    expect(shouldLoadCompleteHistory({
      activeDate: "2026-09-10",
      now,
      overlays: closed,
    })).toBe(false);
    expect(shouldLoadCompleteHistory({
      activeDate: "2026-08-01",
      now,
      overlays: closed,
    })).toBe(true);
  });
});
