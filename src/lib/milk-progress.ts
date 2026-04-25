import { BabyId, LogEvent } from "@/types";

export type MilkProgressComparison = {
  currentAmount: number;
  trailingAverage: number;
  trailingDailyAmounts: number[];
  difference: number;
  status: "higher" | "lower" | "same" | "no-history";
};

const startOfDay = (date: Date) => {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
};

const endOfCutoff = (date: Date, now: Date) => {
  const value = startOfDay(date);
  value.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
  return value;
};

const sumMilkAmount = (events: LogEvent[], babyId: BabyId, startMs: number, endMs: number) =>
  events.reduce((sum, event) => {
    if (event.babyId !== babyId || event.type !== "milk") return sum;
    if (event.timestamp < startMs || event.timestamp > endMs) return sum;
    return sum + (event.milkMl ?? 0);
  }, 0);

export const buildMilkProgressComparison = ({
  events,
  babyId,
  targetDate,
  now,
}: {
  events: LogEvent[];
  babyId: BabyId;
  targetDate: string;
  now: Date;
}): MilkProgressComparison => {
  const target = new Date(`${targetDate}T00:00:00`);
  const targetStart = startOfDay(target);
  const targetEnd = endOfCutoff(target, now);
  const currentAmount = sumMilkAmount(events, babyId, targetStart.getTime(), targetEnd.getTime());

  const trailingDailyAmounts = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(targetStart);
    day.setDate(day.getDate() - (index + 1));
    const start = startOfDay(day);
    const end = endOfCutoff(day, now);
    return sumMilkAmount(events, babyId, start.getTime(), end.getTime());
  });

  const total = trailingDailyAmounts.reduce((sum, amount) => sum + amount, 0);
  const trailingAverage = total / trailingDailyAmounts.length;
  const difference = currentAmount - trailingAverage;
  const hasHistory = trailingDailyAmounts.some((amount) => amount > 0);

  return {
    currentAmount,
    trailingAverage,
    trailingDailyAmounts,
    difference,
    status: !hasHistory ? "no-history" : difference > 0 ? "higher" : difference < 0 ? "lower" : "same",
  };
};
