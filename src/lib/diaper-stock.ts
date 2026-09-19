import type { BabyId, BabyProfile, LogEvent } from "@/types";
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

export type BabyProfiles = Record<BabyId, BabyProfile>;

const BABY_IDS: readonly BabyId[] = ["A", "B"];

type EstimateDiaperStockBySizeParams = {
  profiles: BabyProfiles;
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

export const getSharedDiaperStock = (profiles: BabyProfiles, size: string) =>
  BABY_IDS.map((babyId) => profiles[babyId])
    .find((profile) => Object.prototype.hasOwnProperty.call(profile.diaperStockBySize, size))
    ?.diaperStockBySize[size] ?? 0;

export const setSharedDiaperStock = (
  profiles: BabyProfiles,
  size: string,
  stock: number
): BabyProfiles => {
  const nextStock = Math.max(0, stock);
  return Object.fromEntries(
    BABY_IDS.map((babyId) => [
      babyId,
      {
        ...profiles[babyId],
        diaperStockBySize: {
          ...profiles[babyId].diaperStockBySize,
          [size]: nextStock,
        },
      },
    ])
  ) as BabyProfiles;
};

export const adjustSharedDiaperStock = (
  profiles: BabyProfiles,
  size: string,
  delta: number
) => setSharedDiaperStock(profiles, size, getSharedDiaperStock(profiles, size) + delta);

const getBabyIdsUsingSize = (profiles: BabyProfiles, size: string) =>
  new Set(BABY_IDS.filter((babyId) => profiles[babyId].diaperSize === size));

const countRecentDiaperEvents = (
  events: LogEvent[],
  babyIds: Set<BabyId>,
  rangeStart: number,
  rangeEnd: number
) => {
  let count = 0;
  for (const event of events) {
    if (
      event.type === "diaper" &&
      babyIds.has(event.babyId) &&
      event.timestamp >= rangeStart &&
      event.timestamp <= rangeEnd
    ) {
      count += 1;
    }
  }
  return count;
};

const createUnknownEstimate = (size: string, remaining: number, dailyAverage = 0): DiaperStockEstimate => ({
  size,
  remaining,
  dailyAverage,
  daysRemaining: null,
  estimatedRunOutDate: null,
  level: "unknown",
});

export const estimateDiaperStockBySize = ({
  profiles,
  events,
  size,
  now,
  lookbackDays = 7,
  minimumEvents = 3,
}: EstimateDiaperStockBySizeParams): DiaperStockEstimate => {
  const remaining = getSharedDiaperStock(profiles, size);

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

  const rangeEnd = now.getTime();
  const rangeStart = rangeEnd - lookbackDays * MS_PER_DAY;
  const babyIdsUsingSize = getBabyIdsUsingSize(profiles, size);
  const diaperEventCount = countRecentDiaperEvents(events, babyIdsUsingSize, rangeStart, rangeEnd);

  if (diaperEventCount < minimumEvents) {
    return createUnknownEstimate(size, remaining);
  }

  const dailyAverage = diaperEventCount / lookbackDays;
  if (dailyAverage <= 0) {
    return createUnknownEstimate(size, remaining, dailyAverage);
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