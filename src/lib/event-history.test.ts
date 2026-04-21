import { describe, expect, it } from "vitest";
import {
  buildDiaperChartData,
  buildMilkChartData,
  filterEventsForTimeRange,
  getDefaultHistoryRange,
  summarizeDiaperEvents,
  summarizeMilkEvents,
} from "./event-history";
import { LogEvent } from "@/types";

describe("event-history helpers", () => {
  const now = new Date("2026-04-21T12:00:00+09:00");
  const milkEvents: LogEvent[] = [
    {
      id: "milk-1",
      babyId: "A",
      type: "milk",
      timestamp: new Date("2026-04-21T08:00:00+09:00").getTime(),
      milkMl: 120,
      milkMethod: "bottle",
    },
    {
      id: "milk-2",
      babyId: "A",
      type: "milk",
      timestamp: new Date("2026-04-20T09:00:00+09:00").getTime(),
      milkMl: 80,
      milkMethod: "breast",
    },
    {
      id: "milk-3",
      babyId: "A",
      type: "milk",
      timestamp: new Date("2026-04-10T09:00:00+09:00").getTime(),
      milkMl: 100,
      milkMethod: "bottle",
    },
  ];

  it("summarizes milk totals by method and overall", () => {
    const summary = summarizeMilkEvents(milkEvents);

    expect(summary.total.count).toBe(3);
    expect(summary.total.amount).toBe(300);
    expect(summary.total.average).toBe(100);
    expect(summary.bottle.count).toBe(2);
    expect(summary.bottle.amount).toBe(220);
    expect(summary.breast.count).toBe(1);
    expect(summary.breast.amount).toBe(80);
  });

  it("filters events by the active range", () => {
    const visibleEvents = filterEventsForTimeRange(milkEvents, "1W", now);

    expect(visibleEvents.map((event) => event.id)).toEqual(["milk-1", "milk-2"]);
  });

  it("builds milk chart data with range-based totals", () => {
    const chartData = buildMilkChartData(milkEvents, "1W", now);

    expect(chartData).toHaveLength(2);
    expect(chartData[0]).toMatchObject({
      label: "04-20",
      total: { count: 1, amount: 80, average: 80 },
      breast: { count: 1, amount: 80, average: 80 },
      bottle: { count: 0, amount: 0, average: 0 },
    });
    expect(chartData[1]).toMatchObject({
      label: "04-21",
      total: { count: 1, amount: 120, average: 120 },
      breast: { count: 0, amount: 0, average: 0 },
      bottle: { count: 1, amount: 120, average: 120 },
    });
  });

  it("summarizes diaper totals by kind and daily average", () => {
    const diaperEvents: LogEvent[] = [
      {
        id: "diaper-1",
        babyId: "A",
        type: "diaper",
        timestamp: new Date("2026-04-21T08:00:00+09:00").getTime(),
        diaperKind: "pee",
      },
      {
        id: "diaper-2",
        babyId: "A",
        type: "diaper",
        timestamp: new Date("2026-04-21T10:00:00+09:00").getTime(),
        diaperKind: "mix",
      },
    ];

    const summary = summarizeDiaperEvents(diaperEvents, 2);

    expect(summary.total.count).toBe(3);
    expect(summary.total.dailyAverage).toBe(1.5);
    expect(summary.pee.count).toBe(2);
    expect(summary.poop.count).toBe(1);
  });

  it("builds diaper chart data with pee and poop breakdowns", () => {
    const diaperEvents: LogEvent[] = [
      {
        id: "diaper-1",
        babyId: "A",
        type: "diaper",
        timestamp: new Date("2026-04-21T08:00:00+09:00").getTime(),
        diaperKind: "pee",
      },
      {
        id: "diaper-2",
        babyId: "A",
        type: "diaper",
        timestamp: new Date("2026-04-21T10:00:00+09:00").getTime(),
        diaperKind: "poop",
      },
      {
        id: "diaper-3",
        babyId: "A",
        type: "diaper",
        timestamp: new Date("2026-03-01T10:00:00+09:00").getTime(),
        diaperKind: "poop",
      },
    ];

    expect(buildDiaperChartData(diaperEvents, "1W", now)).toEqual([
      {
        key: "2026-04-21",
        label: "04-21",
        total: { count: 2, dailyAverage: 2 },
        pee: { count: 1, dailyAverage: 1 },
        poop: { count: 1, dailyAverage: 1 },
      },
    ]);
  });

  it("uses weekly view as the default history range", () => {
    expect(getDefaultHistoryRange("milk")).toBe("1W");
    expect(getDefaultHistoryRange("diaper")).toBe("1W");
  });
});
