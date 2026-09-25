import { describe, expect, it } from "vitest";
import {
  buildBreastfeedingChartData,
  buildDiaperChartData,
  buildMilkChartData,
  buildSolidFoodChartData,
  filterEventsForTimeRange,
  getDefaultHistoryRange,
  summarizeBreastfeedingEvents,
  summarizeDiaperEvents,
  summarizeMilkEvents,
  summarizeSolidFoodEvents,
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
      breastLeftMinutes: 15,
      breastRightMinutes: 10,
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

  it("keeps breastfeeding separate from bottle milk totals", () => {
    const summary = summarizeMilkEvents([
      ...milkEvents,
      {
        id: "food",
        babyId: "A",
        type: "solidFood",
        timestamp: now.getTime(),
      },
    ]);

    expect(summary.total.count).toBe(2);
    expect(summary.total.amount).toBe(220);
    expect(summary.total.average).toBe(110);
    expect(summary.breastCount).toBe(1);
    expect(summary.solidFoodCount).toBe(1);
  });

  it("filters events by the active range", () => {
    const visibleEvents = filterEventsForTimeRange(milkEvents, "1W", now);

    expect(visibleEvents.map((event) => event.id)).toEqual(["milk-1", "milk-2"]);
  });

  it("builds milk chart data with range-based totals", () => {
    const chartData = buildMilkChartData(
      [
        ...milkEvents,
        {
          id: "food",
          babyId: "A",
          type: "solidFood",
          timestamp: new Date("2026-04-21T10:00:00+09:00").getTime(),
        },
      ],
      "1W",
      now
    );

    expect(chartData).toHaveLength(2);
    expect(chartData[0]).toMatchObject({
      label: "04-20",
      total: { count: 0, amount: 0, average: 0 },
      breastCount: 1,
    });
    expect(chartData[1]).toMatchObject({
      label: "04-21",
      total: { count: 1, amount: 120, average: 120 },
      breastCount: 0,
      solidFoodCount: 1,
    });
  });

  it("keeps the three-month history grouped by Monday-based weeks", () => {
    expect(buildMilkChartData(milkEvents, "3M", now)).toEqual([
      {
        key: "2026-04-06",
        label: "04-06",
        total: { count: 1, amount: 100, average: 100 },
        breastCount: 0,
        solidFoodCount: 0,
      },
      {
        key: "2026-04-20",
        label: "04-20",
        total: { count: 1, amount: 120, average: 120 },
        breastCount: 1,
        solidFoodCount: 0,
      },
    ]);
  });

  it("summarizes breastfeeding minutes by side", () => {
    const summary = summarizeBreastfeedingEvents(milkEvents, 7);

    expect(summary.count).toBe(1);
    expect(summary.leftMinutes).toBe(15);
    expect(summary.rightMinutes).toBe(10);
    expect(summary.totalMinutes).toBe(25);
    expect(summary.dailyAverageMinutes).toBeCloseTo(25 / 7);
  });

  it("builds dense breastfeeding trend data including days without records", () => {
    const data = buildBreastfeedingChartData(milkEvents, "1W", now);

    expect(data).toHaveLength(7);
    expect(data.find((datum) => datum.key === "2026-04-20")).toMatchObject({
      leftMinutes: 15,
      rightMinutes: 10,
      count: 1,
    });
    expect(data.find((datum) => datum.key === "2026-04-19")).toMatchObject({
      leftMinutes: 0,
      rightMinutes: 0,
      count: 0,
    });
  });

  it("summarizes and charts solid food counts independently", () => {
    const foodEvents: LogEvent[] = [
      {
        id: "food-1",
        babyId: "A",
        type: "solidFood",
        timestamp: new Date("2026-04-21T10:00:00+09:00").getTime(),
        note: "10倍がゆ",
      },
    ];

    expect(summarizeSolidFoodEvents(foodEvents, 7)).toEqual({
      count: 1,
      dailyAverage: 1 / 7,
    });
    const data = buildSolidFoodChartData(foodEvents, "1W", now);
    expect(data).toHaveLength(7);
    expect(data.at(-1)).toMatchObject({ key: "2026-04-21", count: 1 });
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
