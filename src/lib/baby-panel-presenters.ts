import type { DiaperStockEstimate } from "@/lib/diaper-stock";
import type { MilkProgressComparison } from "@/lib/milk-progress";
import type { SleepProgressComparison } from "@/lib/sleep-history";
import type { LogEvent } from "@/types";

export type BabyPanelLogSummary = {
  milkTotal: number;
  milkCount: number;
  breastCount: number;
  solidFoodCount: number;
  peeCount: number;
  poopCount: number;
  diaperCount: number;
};

export const adjustNumber = (current: string, amount: number, precision: number) => {
  const value = parseFloat(current);
  if (Number.isNaN(value)) return (0).toFixed(precision);
  return (value + amount).toFixed(precision);
};

export const summarizeBabyPanelLogEvents = (events: LogEvent[]): BabyPanelLogSummary => {
  const summary: BabyPanelLogSummary = {
    milkTotal: 0,
    milkCount: 0,
    breastCount: 0,
    solidFoodCount: 0,
    peeCount: 0,
    poopCount: 0,
    diaperCount: 0,
  };

  for (const event of events) {
    if (event.type === "milk") {
      if (event.milkMethod === "breast") summary.breastCount += 1;
      else { summary.milkCount += 1; summary.milkTotal += event.milkMl ?? 0; }
      continue;
    }

    if (event.type === "solidFood") {
      summary.solidFoodCount += 1;
      continue;
    }

    if (event.type !== "diaper") continue;
    if (event.diaperKind === "pee" || event.diaperKind === "mix") summary.peeCount += 1;
    if (event.diaperKind === "poop" || event.diaperKind === "mix") summary.poopCount += 1;
  }

  summary.diaperCount = summary.peeCount + summary.poopCount;
  return summary;
};

const startOfDay = (date: Date) => {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
};

const cutoffOnDay = (date: Date, now: Date) => {
  const value = startOfDay(date);
  value.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
  return value;
};

const diaperCountInRange = (
  events: LogEvent[],
  babyId: LogEvent["babyId"],
  startMs: number,
  endMs: number
) =>
  summarizeBabyPanelLogEvents(
    events.filter(
      (event) =>
        event.babyId === babyId &&
        event.type === "diaper" &&
        event.timestamp >= startMs &&
        event.timestamp <= endMs
    )
  ).diaperCount;

export const buildDiaperProgressComparison = ({
  events,
  babyId,
  targetDate,
  now,
}: {
  events: LogEvent[];
  babyId: LogEvent["babyId"];
  targetDate: Date;
  now: Date;
}) => {
  const targetStart = startOfDay(targetDate);
  const currentCount = diaperCountInRange(
    events,
    babyId,
    targetStart.getTime(),
    cutoffOnDay(targetDate, now).getTime()
  );
  const trailingDailyCounts = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(targetStart);
    day.setDate(day.getDate() - (index + 1));
    return diaperCountInRange(
      events,
      babyId,
      startOfDay(day).getTime(),
      cutoffOnDay(day, now).getTime()
    );
  });
  const trailingAverage =
    trailingDailyCounts.reduce((sum, count) => sum + count, 0) / trailingDailyCounts.length;
  const difference = currentCount - trailingAverage;
  const hasHistory = trailingDailyCounts.some((count) => count > 0);

  return {
    currentCount,
    trailingAverage,
    trailingDailyCounts,
    difference,
    status: !hasHistory
      ? "no-history" as const
      : Math.abs(difference) < 0.5
        ? "same" as const
        : difference > 0
          ? "higher" as const
          : "lower" as const,
  };
};

export const formatDiaperEstimateSummary = (estimate: DiaperStockEstimate | null) => {
  if (!estimate) return null;

  if (estimate.level === "unknown") {
    return {
      title: "在庫予測は準備中",
      detail: "記録が増えると、在庫切れの予測を表示します。",
    };
  }

  if (estimate.level === "urgent") {
    return {
      title: "今日中になくなりそう",
      detail: `在庫切れ予測: ${estimate.estimatedRunOutDate ?? "-"}`,
    };
  }

  const roundedDays = Math.max(1, Math.ceil(estimate.daysRemaining ?? 0));
  return {
    title: `このペースだとあと約${roundedDays}日`,
    detail: `在庫切れ予測: ${estimate.estimatedRunOutDate ?? "-"}`,
  };
};

export const formatMilkProgressSummary = (progress: MilkProgressComparison | null) => {
  if (!progress) return null;

  if (progress.status === "no-history") {
    return {
      title: `${progress.currentAmount}ml / 平均なし`,
      detail: "過去7日分の記録がまだありません",
    };
  }

  const roundedAverage = Math.round(progress.trailingAverage);
  const roundedDifference = Math.round(Math.abs(progress.difference));
  const detail =
    roundedDifference === 0
      ? "過去7日平均とほぼ同じ"
      : progress.difference > 0
        ? `平均より ${roundedDifference}ml 多め`
        : `平均より ${roundedDifference}ml 少なめ`;

  return {
    title: `${progress.currentAmount}ml / 平均${roundedAverage}ml`,
    detail,
  };
};

const formatSignedDifference = (difference: number, unit: string) => {
  const rounded = Math.round(difference);
  if (rounded === 0) return `0${unit}`;
  return `${rounded > 0 ? "+" : ""}${rounded}${unit}`;
};

export const formatMilkProgressDifference = (progress: MilkProgressComparison | null) => {
  if (!progress || progress.status === "no-history") return null;
  return formatSignedDifference(progress.difference, "ml");
};

export const formatDiaperProgressDifference = (
  progress: ReturnType<typeof buildDiaperProgressComparison> | null
) => {
  if (!progress || progress.status === "no-history") return null;
  return formatSignedDifference(progress.difference, "回");
};

export const formatSleepProgressDifference = (progress: SleepProgressComparison | null) => {
  if (!progress || progress.status === "no-history") return null;
  return formatSignedDifference(progress.differenceMinutes, "分");
};

export const roundMilkAmountUp = (amount: number) => Math.ceil(Math.max(0, amount) / 5) * 5;
