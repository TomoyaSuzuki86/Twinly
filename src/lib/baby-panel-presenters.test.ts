import { describe, expect, it } from "vitest";
import type { DiaperStockEstimate } from "./diaper-stock";
import type { MilkProgressComparison } from "./milk-progress";
import type { LogEvent } from "@/types";
import {
  adjustNumber,
  buildDiaperProgressComparison,
  formatDiaperEstimateSummary,
  formatDiaperProgressDifference,
  formatMilkProgressDifference,
  formatMilkProgressSummary,
  formatSleepProgressDifference,
  roundMilkAmountUp,
  summarizeBabyPanelLogEvents,
} from "./baby-panel-presenters";

const event = (
  overrides: Partial<LogEvent> & Pick<LogEvent, "id" | "babyId" | "type" | "timestamp">
): LogEvent => ({ ...overrides });

const diaperEstimate = (overrides: Partial<DiaperStockEstimate>): DiaperStockEstimate => ({
  size: "M",
  remaining: 20,
  dailyAverage: 4,
  daysRemaining: 5,
  estimatedRunOutDate: "2026-09-19",
  level: "caution",
  ...overrides,
});

const milkProgress = (overrides: Partial<MilkProgressComparison>): MilkProgressComparison => ({
  currentAmount: 600,
  trailingAverage: 550,
  trailingDailyAmounts: [550, 550, 550, 550, 550, 550, 550],
  difference: 50,
  status: "higher",
  ...overrides,
});

describe("BabyPanel presenters", () => {
  it("summarizes milk, solid food, and diaper logs in one pass while counting mix as both", () => {
    const events: LogEvent[] = [
      event({ id: "milk-1", babyId: "A", type: "milk", timestamp: 1, milkMl: 120 }),
      event({ id: "milk-2", babyId: "A", type: "milk", timestamp: 2, milkMl: 80 }),
      event({ id: "food", babyId: "A", type: "solidFood", timestamp: 3 }),
      event({ id: "pee", babyId: "A", type: "diaper", timestamp: 4, diaperKind: "pee" }),
      event({ id: "mix", babyId: "A", type: "diaper", timestamp: 5, diaperKind: "mix" }),
      event({ id: "wake", babyId: "A", type: "wake", timestamp: 6 }),
    ];

    expect(summarizeBabyPanelLogEvents(events)).toEqual({
      milkTotal: 200,
      milkCount: 2,
      solidFoodCount: 1,
      peeCount: 2,
      poopCount: 1,
      diaperCount: 3,
    });
  });

  it("keeps numeric stepping behavior including the invalid-input fallback", () => {
    expect(adjustNumber("36.0", 0.5, 1)).toBe("36.5");
    expect(adjustNumber("", 0.5, 2)).toBe("0.00");
  });

  it("compares diaper counts with the previous seven days at the same cutoff time", () => {
    const now = new Date("2026-04-18T10:20:00+09:00");
    const history = Array.from({ length: 7 }, (_, index) =>
      event({
        id: `diaper-history-${index}`,
        babyId: "A",
        type: "diaper",
        timestamp: new Date(`2026-04-${String(17 - index).padStart(2, "0")}T09:00:00+09:00`).getTime(),
        diaperKind: "pee",
      })
    );
    const today = [
      event({ id: "diaper-today-1", babyId: "A", type: "diaper", timestamp: new Date("2026-04-18T09:00:00+09:00").getTime(), diaperKind: "pee" }),
      event({ id: "diaper-today-2", babyId: "A", type: "diaper", timestamp: new Date("2026-04-18T09:30:00+09:00").getTime(), diaperKind: "poop" }),
    ];

    const comparison = buildDiaperProgressComparison({
      events: [...today, ...history],
      babyId: "A",
      targetDate: new Date("2026-04-18T00:00:00+09:00"),
      now,
    });

    expect(comparison.currentCount).toBe(2);
    expect(comparison.trailingAverage).toBe(1);
    expect(formatDiaperProgressDifference(comparison)).toBe("+1回");
  });

  it("formats diaper forecast states without changing their wording", () => {
    expect(formatDiaperEstimateSummary(null)).toBeNull();
    expect(formatDiaperEstimateSummary(diaperEstimate({ level: "unknown", daysRemaining: null, estimatedRunOutDate: null }))).toEqual({
      title: "在庫予測は準備中",
      detail: "記録が増えると、在庫切れの予測を表示します。",
    });
    expect(formatDiaperEstimateSummary(diaperEstimate({ level: "urgent", estimatedRunOutDate: "2026-09-14" }))).toEqual({
      title: "今日中になくなりそう",
      detail: "在庫切れ予測: 2026-09-14",
    });
    expect(formatDiaperEstimateSummary(diaperEstimate({ daysRemaining: 4.1 }))).toEqual({
      title: "このペースだとあと約5日",
      detail: "在庫切れ予測: 2026-09-19",
    });
  });

  it("formats milk progress for no history, higher, lower, and effectively equal values", () => {
    expect(formatMilkProgressSummary(milkProgress({ status: "no-history", trailingAverage: 0, difference: 600 }))).toEqual({
      title: "600ml / 平均なし",
      detail: "過去7日分の記録がまだありません",
    });
    expect(formatMilkProgressSummary(milkProgress({ trailingAverage: 550.4, difference: 49.6 }))).toEqual({
      title: "600ml / 平均550ml",
      detail: "平均より 50ml 多め",
    });
    expect(formatMilkProgressSummary(milkProgress({ currentAmount: 500, trailingAverage: 550.4, difference: -50.4, status: "lower" }))).toEqual({
      title: "500ml / 平均550ml",
      detail: "平均より 50ml 少なめ",
    });
    expect(formatMilkProgressSummary(milkProgress({ currentAmount: 550, trailingAverage: 550.4, difference: -0.4, status: "lower" }))).toEqual({
      title: "550ml / 平均550ml",
      detail: "過去7日平均とほぼ同じ",
    });
  });

  it("formats compact signed differences for summary cards", () => {
    expect(formatMilkProgressDifference(milkProgress({ difference: 49.6, status: "higher" }))).toBe("+50ml");
    expect(formatMilkProgressDifference(milkProgress({ difference: -50.4, status: "lower" }))).toBe("-50ml");
    expect(formatMilkProgressDifference(milkProgress({ difference: 0.4, status: "same" }))).toBe("0ml");
    expect(formatMilkProgressDifference(milkProgress({ status: "no-history" }))).toBeNull();

    expect(formatSleepProgressDifference({
      currentMinutes: 510,
      trailingAverageMinutes: 480,
      differenceMinutes: 30,
      status: "higher",
    })).toBe("+30分");
    expect(formatSleepProgressDifference({
      currentMinutes: 450,
      trailingAverageMinutes: 480,
      differenceMinutes: -30,
      status: "lower",
    })).toBe("-30分");
  });

  it("rounds required milk upward to 5ml and never below zero", () => {
    expect(roundMilkAmountUp(121)).toBe(125);
    expect(roundMilkAmountUp(120)).toBe(120);
    expect(roundMilkAmountUp(-2)).toBe(0);
  });
});
