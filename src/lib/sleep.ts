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
};

export type SleepDaySummary = {
  segments: Array<{ start: number; end: number; complete: boolean }>;
  totalMinutes: number;
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
  let currentSleepStart: LogEvent | null = null;

  for (const marker of markers) {
    if (marker.type === "sleepStart") {
      if (!currentSleepStart) currentSleepStart = marker;
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

  return { intervals, currentSleepStart, invalidWakeIds };
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

export const formatSleepDuration = (minutes: number) => {
  const rounded = Math.max(0, Math.round(minutes));
  const hours = Math.floor(rounded / 60);
  const rest = rounded % 60;
  if (hours === 0) return `${rest}分`;
  if (rest === 0) return `${hours}時間`;
  return `${hours}時間${rest}分`;
};
