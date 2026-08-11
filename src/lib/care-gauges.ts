import { BabyId, LogEvent } from "@/types";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const MILK_LOOKBACK_MS = 3 * DAY_MS;
const DIAPER_LOOKBACK_MS = 7 * DAY_MS;
const MILK_WINDOW_MS = 3 * HOUR_MS;
const MILK_SESSION_GAP_MS = 30 * 60 * 1000;
const MILK_TARGET_SAMPLE_COUNT = 3;
const DIAPER_INTERVAL_MS = 2 * HOUR_MS;

export type MilkGauge = {
  level: number;
  targetMilkMl: number;
  digestingMl: number;
  neededMl: number;
};

export type DiaperGauge = {
  level: number;
  expectedIntervalMinutes: number;
  elapsedMinutes: number;
};

export type CareGauges = {
  milk: MilkGauge | null;
  diaper: DiaperGauge | null;
};

const clampLevel = (value: number) => Math.min(1, Math.max(0, value));

export const buildMilkGauge = ({
  events,
  babyId,
  now,
}: {
  events: LogEvent[];
  babyId: BabyId;
  now: Date;
}): MilkGauge | null => {
  const nowMs = now.getTime();
  const cutoffMs = nowMs - MILK_LOOKBACK_MS;
  const milkEvents = events
    .filter(
      (event) =>
        event.babyId === babyId &&
        event.type === "milk" &&
        event.timestamp >= cutoffMs &&
        event.timestamp <= nowMs &&
        typeof event.milkMl === "number" &&
        event.milkMl > 0
    )
    .sort((a, b) => a.timestamp - b.timestamp);

  if (milkEvents.length === 0) return null;

  // Records no more than 30 minutes apart are treated as one feeding session.
  // The average of the three largest sessions adapts to growth while avoiding
  // the day/night dilution caused by averaging every three-hour clock block.
  const sessions = milkEvents.reduce<Array<{ lastTimestamp: number; totalMl: number }>>(
    (result, event) => {
      const latest = result[result.length - 1];
      if (!latest || event.timestamp - latest.lastTimestamp > MILK_SESSION_GAP_MS) {
        result.push({ lastTimestamp: event.timestamp, totalMl: event.milkMl ?? 0 });
      } else {
        latest.lastTimestamp = event.timestamp;
        latest.totalMl += event.milkMl ?? 0;
      }
      return result;
    },
    []
  );
  const largestSessions = sessions
    .map((session) => session.totalMl)
    .sort((a, b) => b - a)
    .slice(0, MILK_TARGET_SAMPLE_COUNT);
  const targetMilkMl = largestSessions.reduce((sum, amount) => sum + amount, 0) / largestSessions.length;

  // Only the latest three hours contribute to fullness. Each feed is treated
  // as fully undigested at first and linearly reaches zero after three hours.
  // This lets the UI increase hunger smoothly instead of dropping all at once.
  const digestingMl = milkEvents.reduce((sum, event) => {
    const ageMs = nowMs - event.timestamp;
    if (ageMs < 0 || ageMs >= MILK_WINDOW_MS) return sum;
    const undigestedRatio = 1 - ageMs / MILK_WINDOW_MS;
    return sum + (event.milkMl ?? 0) * undigestedRatio;
  }, 0);

  return {
    level: clampLevel(digestingMl / targetMilkMl),
    targetMilkMl,
    digestingMl,
    neededMl: Math.max(0, targetMilkMl - digestingMl),
  };
};

export const buildDiaperGauge = ({
  events,
  babyId,
  now,
}: {
  events: LogEvent[];
  babyId: BabyId;
  now: Date;
}): DiaperGauge | null => {
  const nowMs = now.getTime();
  const cutoffMs = nowMs - DIAPER_LOOKBACK_MS;
  const diaperEvents = events
    .filter(
      (event) =>
        event.babyId === babyId &&
        event.type === "diaper" &&
        event.timestamp >= cutoffMs &&
        event.timestamp <= nowMs
    )
    .sort((a, b) => a.timestamp - b.timestamp);

  if (diaperEvents.length === 0) return null;

  const elapsedMs = Math.max(0, nowMs - diaperEvents[diaperEvents.length - 1].timestamp);

  return {
    level: clampLevel(1 - elapsedMs / DIAPER_INTERVAL_MS),
    expectedIntervalMinutes: DIAPER_INTERVAL_MS / (60 * 1000),
    elapsedMinutes: elapsedMs / (60 * 1000),
  };
};

export const buildCareGauges = ({
  events,
  babyId,
  now,
}: {
  events: LogEvent[];
  babyId: BabyId;
  now: Date;
}): CareGauges => ({
  milk: buildMilkGauge({ events, babyId, now }),
  diaper: buildDiaperGauge({ events, babyId, now }),
});
