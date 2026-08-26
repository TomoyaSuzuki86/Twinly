import { BabyId, LogEvent } from "@/types";

export type SleepInterval = {
  start: number;
  end: number;
  startEventId: string;
  wakeEventId: string;
};

export type SleepAnalysis = {
  intervals: SleepInterval[];
  currentSleepStart: LogEvent | null;
  invalidWakeIds: Set<string>;
  invalidSleepStartIds: Set<string>;
};

export type SleepDaySummary = {
  segments: Array<{ start: number; end: number; complete: boolean }>;
  totalMinutes: number;
};

export type SleepLogSummary = {
  totalMinutes: number;
  sleepCount: number;
  averageActivityMinutes: number | null;
};

export type ActivityGauge = {
  limitMinutes: number;
  elapsedMinutes: number;
  remainingMinutes: number;
  elapsedPercent: number;
};

const parseLocalDate = (value: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
};

export const getDefaultActivityLimitMinutes = (birthDate: string, now: Date) => {
  const birth = parseLocalDate(birthDate);
  if (!birth || birth.getTime() > now.getTime()) return 180;

  let completedMonths =
    (now.getFullYear() - birth.getFullYear()) * 12 + now.getMonth() - birth.getMonth();
  if (now.getDate() < birth.getDate()) completedMonths -= 1;

  if (completedMonths < 1) return 60;
  if (completedMonths < 2) return 90;
  if (completedMonths < 3) return 120;
  if (completedMonths < 5) return 150;
  if (completedMonths < 6) return 180;
  if (completedMonths < 9) return 240;
  if (completedMonths < 10) return 270;
  if (completedMonths < 15) return 300;
  return 360;
};

export const analyzeSleepEvents = (events: LogEvent[], babyId: BabyId): SleepAnalysis => {
  const markers = events
    .filter(
      (event) =>
        event.babyId === babyId && (event.type === "sleepStart" || event.type === "wake")
    )
    .sort((a, b) => a.timestamp - b.timestamp);

  const intervals: SleepInterval[] = [];
  const invalidWakeIds = new Set<string>();
  const invalidSleepStartIds = new Set<string>();
  let currentSleepStart: LogEvent | null = null;

  for (const marker of markers) {
    if (marker.type === "sleepStart") {
      if (!currentSleepStart) {
        currentSleepStart = marker;
      } else {
        invalidSleepStartIds.add(marker.id);
      }
      continue;
    }

    if (!currentSleepStart || marker.timestamp <= currentSleepStart.timestamp) {
      invalidWakeIds.add(marker.id);
      continue;
    }

    intervals.push({
      start: currentSleepStart.timestamp,
      end: marker.timestamp,
      startEventId: currentSleepStart.id,
      wakeEventId: marker.id,
    });
    currentSleepStart = null;
  }

  return { intervals, currentSleepStart, invalidWakeIds, invalidSleepStartIds };
};

export const isBabySleeping = (events: LogEvent[], babyId: BabyId) =>
  Boolean(analyzeSleepEvents(events, babyId).currentSleepStart);

export type AutoWakeActivityType = "milk" | "solidFood" | "diaper";

const autoWakeLeadMinutes: Record<AutoWakeActivityType, number> = {
  milk: 15,
  solidFood: 15,
  diaper: 1,
};

export const createAutoWakeTimestamp = (
  sleepStartedAt: number,
  activityTimestamp: number,
  leadMinutes: number
) =>
  Math.min(
    activityTimestamp,
    Math.max(sleepStartedAt + 1000, activityTimestamp - leadMinutes * 60 * 1000)
  );

export const getAutoWakeTimestampForActivity = (
  events: LogEvent[],
  babyId: BabyId,
  activityTimestamp: number,
  activityType: AutoWakeActivityType
) => {
  const sleepState = analyzeSleepEvents(
    events.filter((event) => event.timestamp < activityTimestamp),
    babyId
  );
  return sleepState.currentSleepStart
    ? createAutoWakeTimestamp(
        sleepState.currentSleepStart.timestamp,
        activityTimestamp,
        autoWakeLeadMinutes[activityType]
      )
    : null;
};

export const buildSleepDaySummary = (
  analysis: SleepAnalysis,
  date: Date,
  now: Date
): SleepDaySummary => {
  const dayStartDate = new Date(date);
  dayStartDate.setHours(0, 0, 0, 0);
  const dayEndDate = new Date(dayStartDate);
  dayEndDate.setDate(dayEndDate.getDate() + 1);
  const dayStart = dayStartDate.getTime();
  const dayEnd = dayEndDate.getTime();

  const completedSegments = analysis.intervals
    .filter((interval) => interval.end > dayStart && interval.start < dayEnd)
    .map((interval) => ({
      start: Math.max(dayStart, interval.start),
      end: Math.min(dayEnd, interval.end),
      complete: true,
    }));
  const activeStart = analysis.currentSleepStart?.timestamp;
  const activeSegments =
    typeof activeStart === "number" && activeStart < dayEnd && now.getTime() > dayStart
      ? [
          {
            start: Math.max(dayStart, activeStart),
            end: Math.min(dayEnd, now.getTime()),
            complete: false,
          },
        ].filter((segment) => segment.end > segment.start)
      : [];

  return {
    segments: [...completedSegments, ...activeSegments],
    totalMinutes: completedSegments.reduce(
      (sum, segment) => sum + (segment.end - segment.start) / (60 * 1000),
      0
    ),
  };
};

export const buildSleepLogSummary = (
  analysis: SleepAnalysis,
  date: Date,
  now: Date
): SleepLogSummary => {
  const daySummary = buildSleepDaySummary(analysis, date, now);
  const dayStartDate = new Date(date);
  dayStartDate.setHours(0, 0, 0, 0);
  const dayEndDate = new Date(dayStartDate);
  dayEndDate.setDate(dayEndDate.getDate() + 1);
  const dayStart = dayStartDate.getTime();
  const dayEnd = dayEndDate.getTime();

  const validSleepStarts = [
    ...analysis.intervals.map((interval) => interval.start),
    ...(analysis.currentSleepStart ? [analysis.currentSleepStart.timestamp] : []),
  ].sort((a, b) => a - b);
  const completedActivityMinutes = analysis.intervals
    .map((interval) => {
      const nextSleepStart = validSleepStarts.find((start) => start > interval.end);
      if (nextSleepStart === undefined || nextSleepStart < dayStart || nextSleepStart >= dayEnd) {
        return null;
      }
      return (nextSleepStart - interval.end) / (60 * 1000);
    })
    .filter((minutes): minutes is number => minutes !== null);

  return {
    totalMinutes: daySummary.segments.reduce(
      (sum, segment) => sum + (segment.end - segment.start) / (60 * 1000),
      0
    ),
    sleepCount: daySummary.segments.length,
    averageActivityMinutes:
      completedActivityMinutes.length > 0
        ? completedActivityMinutes.reduce((sum, minutes) => sum + minutes, 0) /
          completedActivityMinutes.length
        : null,
  };
};

export const buildActivityGauge = (
  analysis: SleepAnalysis,
  now: Date,
  limitMinutes: number
): ActivityGauge => {
  const normalizedLimitMinutes = Math.max(30, Math.min(12 * 60, limitMinutes));
  const latestWakeAt = analysis.intervals.reduce<number | null>(
    (latest, interval) => (latest === null || interval.end > latest ? interval.end : latest),
    null
  );
  const activityEndedAt = analysis.currentSleepStart?.timestamp ?? now.getTime();
  const elapsedMinutes =
    latestWakeAt === null
      ? 0
      : Math.max(0, (activityEndedAt - latestWakeAt) / (60 * 1000));
  const remainingMinutes = Math.max(0, normalizedLimitMinutes - elapsedMinutes);

  return {
    limitMinutes: normalizedLimitMinutes,
    elapsedMinutes,
    remainingMinutes,
    elapsedPercent: Math.min(100, Math.round((elapsedMinutes / normalizedLimitMinutes) * 100)),
  };
};

export const formatSleepDuration = (minutes: number) => {
  const rounded = Math.max(0, Math.round(minutes));
  const hours = Math.floor(rounded / 60);
  const rest = rounded % 60;
  if (hours === 0) return `${rest}分`;
  if (rest === 0) return `${hours}時間`;
  return `${hours}時間${rest}分`;
};
