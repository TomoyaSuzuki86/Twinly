import { BabyId, LogEvent } from "@/types";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const LOOKBACK_MS = 7 * DAY_MS;
const MILK_WINDOW_MS = 3 * HOUR_MS;
const MIN_OBSERVATION_HOURS = 24;
const MIN_DIAPER_INTERVAL_MS = 5 * 60 * 1000;
const MAX_DIAPER_INTERVAL_MS = 12 * HOUR_MS;

export type MilkGauge = {
  level: number;
  typicalThreeHourMl: number;
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

const percentile = (values: number[], ratio: number) => {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((sorted.length - 1) * ratio);
  return sorted[index];
};

const trimmedAverage = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const trimCount = sorted.length >= 10 ? Math.floor(sorted.length * 0.1) : 0;
  const trimmed = sorted.slice(trimCount, sorted.length - trimCount);
  return trimmed.reduce((sum, value) => sum + value, 0) / trimmed.length;
};

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
  const cutoffMs = nowMs - LOOKBACK_MS;
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

  const currentWindowStartMs = nowMs - MILK_WINDOW_MS;
  const baselineEvents = milkEvents.filter((event) => event.timestamp < currentWindowStartMs);
  const hasEstablishedHistory =
    baselineEvents.length >= 3 &&
    currentWindowStartMs - baselineEvents[0].timestamp >= MIN_OBSERVATION_HOURS * HOUR_MS;
  const observationHours = Math.min(
    (LOOKBACK_MS - MILK_WINDOW_MS) / HOUR_MS,
    Math.max(MIN_OBSERVATION_HOURS, (currentWindowStartMs - (baselineEvents[0]?.timestamp ?? nowMs)) / HOUR_MS)
  );
  const baselineTotalMl = baselineEvents.reduce((sum, event) => sum + (event.milkMl ?? 0), 0);
  const typicalThreeHourMl = hasEstablishedHistory
    ? baselineTotalMl / (observationHours / 3)
    : percentile(
        milkEvents.map((event) => event.milkMl as number),
        0.75
      );

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
    level: clampLevel(digestingMl / typicalThreeHourMl),
    typicalThreeHourMl,
    digestingMl,
    neededMl: Math.max(0, typicalThreeHourMl - digestingMl),
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
  const cutoffMs = nowMs - LOOKBACK_MS;
  const diaperEvents = events
    .filter(
      (event) =>
        event.babyId === babyId &&
        event.type === "diaper" &&
        event.timestamp >= cutoffMs &&
        event.timestamp <= nowMs
    )
    .sort((a, b) => a.timestamp - b.timestamp);

  if (diaperEvents.length < 2) return null;

  // Pee and poop are deliberately combined. Very close duplicate entries and
  // overnight gaps are excluded so they do not distort the normal interval.
  const intervals = diaperEvents
    .slice(1)
    .map((event, index) => event.timestamp - diaperEvents[index].timestamp)
    .filter((interval) => interval >= MIN_DIAPER_INTERVAL_MS && interval <= MAX_DIAPER_INTERVAL_MS);

  if (intervals.length === 0) return null;

  const expectedIntervalMs = trimmedAverage(intervals);
  const elapsedMs = Math.max(0, nowMs - diaperEvents[diaperEvents.length - 1].timestamp);

  return {
    level: clampLevel(1 - elapsedMs / expectedIntervalMs),
    expectedIntervalMinutes: expectedIntervalMs / (60 * 1000),
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
