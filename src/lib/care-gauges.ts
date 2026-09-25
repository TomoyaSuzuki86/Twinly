import { BabyId, LogEvent } from "@/types";
import {
  clampMilkWindowHours,
  DEFAULT_MILK_WINDOW_HOURS,
} from "@/lib/milk-window-policy";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const MILK_LOOKBACK_MS = 3 * DAY_MS;
const DIAPER_LOOKBACK_MS = 7 * DAY_MS;
const MILK_SESSION_GAP_MS = 30 * 60 * 1000;
const MILK_TARGET_SAMPLE_COUNT = 3;
export const DEFAULT_DIAPER_GAUGE_WINDOW_MINUTES = 120;

export type MilkGauge = {
  level: number;
  targetMilkMl: number;
  digestingMl: number;
  neededMl: number;
  mode: "amount" | "interval";
  remainingMinutes: number | null;
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
  windowHours = DEFAULT_MILK_WINDOW_HOURS,
  targetMilkMlOverride = null,
}: {
  events: LogEvent[];
  babyId: BabyId;
  now: Date;
  windowHours?: number;
  targetMilkMlOverride?: number | null;
}): MilkGauge | null => {
  const nowMs = now.getTime();
  const cutoffMs = nowMs - MILK_LOOKBACK_MS;
  const feedingEvents = events
    .filter((event) => event.babyId === babyId && event.type === "milk" && event.timestamp >= cutoffMs && event.timestamp <= nowMs)
    .sort((a, b) => a.timestamp - b.timestamp);

  if (feedingEvents.length === 0) return null;

  const bottleEvents = feedingEvents.filter((event) => event.milkMethod !== "breast" && typeof event.milkMl === "number" && event.milkMl > 0);
  const bottleSessions = bottleEvents.reduce<Array<{ lastTimestamp: number; totalMl: number }>>((result, event) => {
    const latest = result[result.length - 1];
    if (!latest || event.timestamp - latest.lastTimestamp > MILK_SESSION_GAP_MS) result.push({ lastTimestamp: event.timestamp, totalMl: event.milkMl ?? 0 });
    else { latest.lastTimestamp = event.timestamp; latest.totalMl += event.milkMl ?? 0; }
    return result;
  }, []);
  const largestSessions = bottleSessions.map((session) => session.totalMl).sort((a, b) => b - a).slice(0, MILK_TARGET_SAMPLE_COUNT);
  const calculatedTargetMilkMl = largestSessions.length ? largestSessions.reduce((sum, amount) => sum + amount, 0) / largestSessions.length : 0;
  const targetMilkMl = typeof targetMilkMlOverride === "number" && targetMilkMlOverride > 0 ? targetMilkMlOverride : calculatedTargetMilkMl;
  const milkWindowMs = clampMilkWindowHours(windowHours) * HOUR_MS;

  const feedingSessions = feedingEvents.reduce<Array<{ lastTimestamp: number; hasBreast: boolean }>>((result, event) => {
    const latest = result[result.length - 1];
    if (!latest || event.timestamp - latest.lastTimestamp > MILK_SESSION_GAP_MS) result.push({ lastTimestamp: event.timestamp, hasBreast: event.milkMethod === "breast" });
    else { latest.lastTimestamp = event.timestamp; latest.hasBreast = latest.hasBreast || event.milkMethod === "breast"; }
    return result;
  }, []);
  const latestFeedingSession = feedingSessions[feedingSessions.length - 1];

  // Breastfeeding is a timing signal, not an estimated ml amount. Mixed feeds
  // within 30 minutes use the same interval mode.
  if (latestFeedingSession?.hasBreast) {
    const elapsedMs = Math.max(0, nowMs - latestFeedingSession.lastTimestamp);
    const remainingMs = Math.max(0, milkWindowMs - elapsedMs);
    return { level: clampLevel(remainingMs / milkWindowMs), targetMilkMl, digestingMl: 0, neededMl: 0, mode: "interval", remainingMinutes: Math.ceil(remainingMs / (60 * 1000)) };
  }

  if (targetMilkMl <= 0) return null;
  const digestingMl = bottleEvents.reduce((sum, event) => {
    const ageMs = nowMs - event.timestamp;
    if (ageMs < 0 || ageMs >= milkWindowMs) return sum;
    return sum + (event.milkMl ?? 0) * (1 - ageMs / milkWindowMs);
  }, 0);

  return { level: clampLevel(digestingMl / targetMilkMl), targetMilkMl, digestingMl, neededMl: Math.max(0, targetMilkMl - digestingMl), mode: "amount", remainingMinutes: null };
};

export const buildDiaperGauge = ({
  events,
  babyId,
  now,
  intervalMinutes = DEFAULT_DIAPER_GAUGE_WINDOW_MINUTES,
}: {
  events: LogEvent[];
  babyId: BabyId;
  now: Date;
  intervalMinutes?: number;
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
  const normalizedIntervalMinutes = Math.min(720, Math.max(30, intervalMinutes));
  const intervalMs = normalizedIntervalMinutes * 60 * 1000;

  return {
    level: clampLevel(1 - elapsedMs / intervalMs),
    expectedIntervalMinutes: normalizedIntervalMinutes,
    elapsedMinutes: elapsedMs / (60 * 1000),
  };
};

export const buildCareGauges = ({
  events,
  babyId,
  now,
  milkWindowHours,
  milkTargetMlOverride,
  diaperWindowMinutes,
}: {
  events: LogEvent[];
  babyId: BabyId;
  now: Date;
  milkWindowHours?: number;
  milkTargetMlOverride?: number | null;
  diaperWindowMinutes?: number;
}): CareGauges => ({
  milk: buildMilkGauge({
    events,
    babyId,
    now,
    windowHours: milkWindowHours,
    targetMilkMlOverride: milkTargetMlOverride,
  }),
  diaper: buildDiaperGauge({ events, babyId, now, intervalMinutes: diaperWindowMinutes }),
});