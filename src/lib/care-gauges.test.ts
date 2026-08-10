import { describe, expect, it } from "vitest";
import { buildDiaperGauge, buildMilkGauge } from "./care-gauges";
import { LogEvent } from "@/types";

const milk = (id: string, timestamp: string, milkMl: number): LogEvent => ({
  id,
  babyId: "A",
  type: "milk",
  timestamp: new Date(timestamp).getTime(),
  milkMl,
  milkMethod: "bottle",
});

const diaper = (id: string, timestamp: string): LogEvent => ({
  id,
  babyId: "A",
  type: "diaper",
  timestamp: new Date(timestamp).getTime(),
  diaperKind: "pee",
});

describe("care gauges", () => {
  const weeklyHistory = Array.from({ length: 56 }, (_, index) => {
    const timestamp = new Date("2026-04-01T12:00:00+09:00");
    timestamp.setHours(timestamp.getHours() + index * 3);
    return milk(`history-${index}`, timestamp.toISOString(), 140);
  });

  it("uses the past week average amount per three hours as the fullness baseline", () => {
    const gauge = buildMilkGauge({
      events: weeklyHistory,
      babyId: "A",
      now: new Date("2026-04-08T12:00:00+09:00"),
    });

    expect(gauge?.typicalThreeHourMl).toBeCloseTo(140);
  });

  it("does not treat a small recent milk top-up as a full feed", () => {
    const gauge = buildMilkGauge({
      events: [...weeklyHistory, milk("top-up", "2026-04-08T11:50:00+09:00", 5)],
      babyId: "A",
      now: new Date("2026-04-08T12:00:00+09:00"),
    });

    expect(gauge?.level).toBeLessThan(0.1);
  });

  it("fills after a normal feed and becomes empty exactly three hours later", () => {
    const current = milk("current", "2026-04-08T12:00:00+09:00", 140);
    const justFed = buildMilkGauge({
      events: [...weeklyHistory, current],
      babyId: "A",
      now: new Date("2026-04-08T12:00:00+09:00"),
    });
    const halfDigested = buildMilkGauge({
      events: [...weeklyHistory, current],
      babyId: "A",
      now: new Date("2026-04-08T13:30:00+09:00"),
    });
    const threeHoursLater = buildMilkGauge({
      events: [...weeklyHistory, current],
      babyId: "A",
      now: new Date("2026-04-08T15:00:00+09:00"),
    });

    expect(justFed?.level).toBe(1);
    expect(halfDigested?.level).toBeCloseTo(0.5, 1);
    expect(threeHoursLater?.level).toBe(0);
  });

  it("updates immediately even when the first milk record is the only history", () => {
    const gauge = buildMilkGauge({
      events: [milk("only", "2026-04-08T12:00:00+09:00", 140)],
      babyId: "A",
      now: new Date("2026-04-08T12:00:00+09:00"),
    });

    expect(gauge?.typicalThreeHourMl).toBe(140);
    expect(gauge?.level).toBe(1);
  });

  it("combines all diaper entries and reaches empty at the usual interval", () => {
    const events = [
      diaper("d1", "2026-04-08T06:00:00+09:00"),
      { ...diaper("d2", "2026-04-08T09:00:00+09:00"), diaperKind: "poop" as const },
      diaper("d3", "2026-04-08T12:00:00+09:00"),
    ];

    const justChanged = buildDiaperGauge({
      events,
      babyId: "A",
      now: new Date("2026-04-08T12:00:00+09:00"),
    });
    const due = buildDiaperGauge({
      events,
      babyId: "A",
      now: new Date("2026-04-08T15:00:00+09:00"),
    });

    expect(justChanged?.expectedIntervalMinutes).toBe(180);
    expect(justChanged?.level).toBe(1);
    expect(due?.level).toBe(0);
  });

  it("returns no estimate only when there are no records", () => {
    expect(
      buildMilkGauge({
        events: [],
        babyId: "A",
        now: new Date("2026-04-08T12:10:00+09:00"),
      })
    ).toBeNull();
    expect(
      buildDiaperGauge({
        events: [diaper("only", "2026-04-08T12:00:00+09:00")],
        babyId: "A",
        now: new Date("2026-04-08T12:10:00+09:00"),
      })
    ).toBeNull();
  });
});
