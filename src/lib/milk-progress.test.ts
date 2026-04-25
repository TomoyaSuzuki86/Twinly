import { describe, expect, it } from "vitest";
import { buildMilkProgressComparison } from "./milk-progress";
import { LogEvent } from "@/types";

const buildMilkEvent = (id: string, timestamp: string, amount: number, babyId: "A" | "B" = "A"): LogEvent => ({
  id,
  babyId,
  type: "milk",
  timestamp: new Date(timestamp).getTime(),
  milkMl: amount,
  milkMethod: "bottle",
});

describe("buildMilkProgressComparison", () => {
  it("compares the selected day against the previous 7 days at the same time of day", () => {
    const now = new Date("2026-04-25T10:30:00+09:00");
    const events: LogEvent[] = [
      buildMilkEvent("current-1", "2026-04-25T08:00:00+09:00", 120),
      buildMilkEvent("current-2", "2026-04-25T10:00:00+09:00", 80),
      buildMilkEvent("ignore-current-late", "2026-04-25T11:00:00+09:00", 999),
      buildMilkEvent("d1", "2026-04-24T09:00:00+09:00", 100),
      buildMilkEvent("d2a", "2026-04-23T08:00:00+09:00", 80),
      buildMilkEvent("d2b", "2026-04-23T10:15:00+09:00", 40),
      buildMilkEvent("d3", "2026-04-22T10:00:00+09:00", 110),
      buildMilkEvent("d4", "2026-04-21T10:20:00+09:00", 90),
      buildMilkEvent("d5", "2026-04-20T09:30:00+09:00", 70),
      buildMilkEvent("d6", "2026-04-19T07:00:00+09:00", 60),
      buildMilkEvent("d7", "2026-04-18T10:25:00+09:00", 50),
      buildMilkEvent("ignore-other-baby", "2026-04-24T09:00:00+09:00", 300, "B"),
      buildMilkEvent("ignore-history-late", "2026-04-24T11:00:00+09:00", 999),
    ];

    const result = buildMilkProgressComparison({
      events,
      babyId: "A",
      targetDate: "2026-04-25",
      now,
    });

    expect(result.currentAmount).toBe(200);
    expect(result.trailingDailyAmounts).toEqual([100, 120, 110, 90, 70, 60, 50]);
    expect(result.trailingAverage).toBeCloseTo(600 / 7);
    expect(result.difference).toBeCloseTo(200 - 600 / 7);
    expect(result.status).toBe("higher");
  });

  it("returns no-history when the previous week has no milk records", () => {
    const result = buildMilkProgressComparison({
      events: [buildMilkEvent("current", "2026-04-25T08:00:00+09:00", 120)],
      babyId: "A",
      targetDate: "2026-04-25",
      now: new Date("2026-04-25T10:30:00+09:00"),
    });

    expect(result.trailingAverage).toBe(0);
    expect(result.trailingDailyAmounts).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(result.status).toBe("no-history");
  });
});
