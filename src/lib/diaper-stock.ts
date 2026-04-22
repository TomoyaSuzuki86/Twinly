import { BabyId, BabyProfile, LogEvent } from "@/types";
import { fmtDate } from "@/lib/utils";

export type DiaperStockAlertLevel = "none" | "caution" | "warning" | "urgent" | "unknown";

export type DiaperStockEstimate = {
  size: string;
  remaining: number;
  dailyAverage: number;
  daysRemaining: number | null;
  estimatedRunOutDate: string | null;
  level: DiaperStockAlertLevel;
};

type EstimateDiaperStockBySizeParams = {
  profiles: Record<BabyId, BabyProfile>;
  events: LogEvent[];
  size: string;
  now: Date;
  lookbackDays?: number;
  minimumEvents?: number;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const addDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const resolveAlertLevel = (daysRemaining: number): DiaperStockAlertLevel => {
  if (daysRemaining <= 1) return "urgent";
  if (daysRemaining <= 3) return "warning";
  if (daysRemaining <= 7) return "caution";
  return "none";
};

export const estimateDiaperStockBySize = ({
  profiles,
  events,
  size,
  now,
  lookbackDays = 7,
  minimumEvents = 3,
}: EstimateDiaperStockBySizeParams): DiaperStockEstimate => {
  const remaining =
    Object.values(profiles).find((profile) => Object.prototype.hasOwnProperty.call(profile.diaperStockBySize, size))
      ?.diaperStockBySize[size] ?? 0;

  if (remaining <= 0) {
    return {
      size,
      remaining,
      dailyAverage: 0,
      daysRemaining: 0,
      estimatedRunOutDate: fmtDate(now),
      level: "urgent",
    };
  }

  const babyIdsUsingSize = new Set(
    (Object.entries(profiles) as [BabyId, BabyProfile][])
      .filter(([, profile]) => profile.diaperSize === size)
      .map(([babyId]) => babyId)
  );

  const rangeStart = now.getTime() - lookbackDays * MS_PER_DAY;
  const diaperEvents = events.filter(
    (event) =>
      event.type === "diaper" &&
      babyIdsUsingSize.has(event.babyId) &&
      event.timestamp >= rangeStart &&
      event.timestamp <= now.getTime()
  );

  if (diaperEvents.length < minimumEvents) {
    return {
      size,
      remaining,
      dailyAverage: 0,
      daysRemaining: null,
      estimatedRunOutDate: null,
      level: "unknown",
    };
  }

  const dailyAverage = diaperEvents.length / lookbackDays;

  if (dailyAverage <= 0) {
    return {
      size,
      remaining,
      dailyAverage,
      daysRemaining: null,
      estimatedRunOutDate: null,
      level: "unknown",
    };
  }

  const daysRemaining = remaining / dailyAverage;
  const estimatedRunOutDate = fmtDate(addDays(now, Math.ceil(daysRemaining)));

  return {
    size,
    remaining,
    dailyAverage,
    daysRemaining,
    estimatedRunOutDate,
    level: resolveAlertLevel(daysRemaining),
  };
};
