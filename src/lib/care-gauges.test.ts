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
  it("does not treat a small recent milk top-up as a full feed", () => {
    const now = new Date("2026-04-08T12:10:00+09:00");
    const events = Array.from({ length: 7 }, (_, index) =>
      milk(`normal-${index}`, `2026-04-0${index + 1}T09:00:00+09:00`, 140)
    );
    events.push(milk("top-up", "2026-04-08T12:00:00+09:00", 5));

    const gauge = buildMilkGauge({ events, babyId: "A", now });

    expect(gauge?.capacityMl).toBe(140);
    expect(gauge?.level).toBeLessThan(0.1);
  });

  it("fills the milk gauge after a normal feed and drains it over time", () => {
    const history = Array.from({ length: 7 }, (_, index) =>
      milk(`history-${index}`, `2026-04-0${index + 1}T09:00:00+09:00`, 140)
    );
    const justFed = buildMilkGauge({
      events: [...history, milk("current", "2026-04-08T12:00:00+09:00", 140)],
      babyId: "A",
      now: new Date("2026-04-08T12:00:00+09:00"),
    });
    const later = buildMilkGauge({
      events: [...history, milk("current", "2026-04-08T12:00:00+09:00", 140)],
      babyId: "A",
      now: new Date("2026-04-08T14:00:00+09:00"),
    });

    expect(justFed?.level).toBe(1);
    expect(later?.level).toBeLessThan(justFed?.level ?? 0);
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

  it("returns no estimate until enough history exists", () => {
    expect(
      buildMilkGauge({
        events: [milk("only", "2026-04-08T12:00:00+09:00", 140)],
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
