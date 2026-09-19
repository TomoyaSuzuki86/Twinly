import { rangeDays, type TimeRange } from "./event-history";
import { analyzeSleepEvents, formatSleepDuration } from "./sleep";

export type SleepHistoryEntry = {
  key: string;
  start: number;
  end: number;
  complete: boolean;
};

export type SleepProgressComparison = {
  currentMinutes: number;
  trailingAverageMinutes: number;
  differenceMinutes: number;
  status: "higher" | "lower" | "same" | "no-history";
};

const NIGHT_START_HOUR = 19;
const NIGHT_END_HOUR = 6;
const NEXT_NIGHT_START_HOUR = 19;
const MINUTE_MS = 60 * 1000;

export const startOfDay = (date: Date) => {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
};

export const getRangeStart = (timeRange: TimeRange, now: Date) => {
  const start = startOfDay(now);
  start.setDate(start.getDate() - (rangeDays[timeRange] - 1));
  return start.getTime();
};

export const getRangeDayStarts = (timeRange: TimeRange, now: Date) => {
  const start = new Date(getRangeStart(timeRange, now));
  return Array.from({ length: rangeDays[timeRange] }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
};

export const buildRangeEntries = (
  analysis: ReturnType<typeof analyzeSleepEvents>,
  rangeStart: number,
  rangeEnd: number
): SleepHistoryEntry[] => {
  const completed = analysis.intervals.map((interval) => ({
    key: interval.wakeEventId,
    start: interval.start,
    end: interval.end,
    complete: true,
  }));
  const active = analysis.currentSleepStart
    ? [{
        key: analysis.currentSleepStart.id,
        start: analysis.currentSleepStart.timestamp,
        end: rangeEnd,
        complete: false,
      }]
    : [];
  return [...completed, ...active]
    .filter((entry) => entry.end > rangeStart && entry.start <= rangeEnd)
    .sort((left, right) => right.start - left.start);
};

export const getOverlapMinutes = (entry: SleepHistoryEntry, windowStart: number, windowEnd: number) =>
  Math.max(0, Math.min(entry.end, windowEnd) - Math.max(entry.start, windowStart)) / MINUTE_MS;

const sumSleepMinutes = (
  analysis: ReturnType<typeof analyzeSleepEvents>,
  windowStart: number,
  windowEnd: number
) => buildRangeEntries(analysis, windowStart, windowEnd)
  .reduce((sum, entry) => sum + getOverlapMinutes(entry, windowStart, windowEnd), 0);

export const getAverageAwakeMinutes = (entries: SleepHistoryEntry[]) => {
  const chronological = [...entries].sort((left, right) => left.start - right.start);
  const awakeMinutes: number[] = [];
  for (let index = 1; index < chronological.length; index += 1) {
    const previous = chronological[index - 1];
    const current = chronological[index];
    if (current.start > previous.end) awakeMinutes.push((current.start - previous.end) / MINUTE_MS);
  }
  return awakeMinutes.length
    ? awakeMinutes.reduce((sum, minutes) => sum + minutes, 0) / awakeMinutes.length
    : null;
};

export const getNightWindowEndingOn = (day: Date, now: Date) => {
  const end = new Date(day);
  end.setHours(NIGHT_END_HOUR, 0, 0, 0);
  const start = new Date(day);
  start.setDate(start.getDate() - 1);
  start.setHours(NIGHT_START_HOUR, 0, 0, 0);
  return { start: start.getTime(), end: Math.min(end.getTime(), now.getTime()) };
};

export const getNightRoutineWindowEndingOn = (day: Date) => {
  const bedtimeStart = new Date(day);
  bedtimeStart.setDate(bedtimeStart.getDate() - 1);
  bedtimeStart.setHours(NIGHT_START_HOUR, 0, 0, 0);
  const bedtimeEnd = new Date(day);
  bedtimeEnd.setHours(NIGHT_END_HOUR, 0, 0, 0);
  const wakeStart = new Date(day);
  wakeStart.setHours(NIGHT_END_HOUR, 0, 0, 0);
  const wakeEnd = new Date(day);
  wakeEnd.setHours(NEXT_NIGHT_START_HOUR, 0, 0, 0);
  return {
    bedtimeStart: bedtimeStart.getTime(),
    bedtimeEnd: bedtimeEnd.getTime(),
    wakeStart: wakeStart.getTime(),
    wakeEnd: wakeEnd.getTime(),
  };
};

export const getAverageClockMinutes = (values: number[]) =>
  values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;

export const toBedtimeClockMinutes = (timestamp: number) => {
  const date = new Date(timestamp);
  const minutes = date.getHours() * 60 + date.getMinutes();
  return date.getHours() < NIGHT_END_HOUR ? minutes + 24 * 60 : minutes;
};

export const toClockMinutes = (timestamp: number) => {
  const date = new Date(timestamp);
  return date.getHours() * 60 + date.getMinutes();
};

export const formatClockMinutes = (minutes: number | null) => {
  if (minutes === null) return "—";
  const rounded = Math.round(minutes) % (24 * 60);
  const hours = Math.floor(rounded / 60);
  const rest = rounded % 60;
  return `${String(hours).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
};

export const getSleepProgressComparison = (
  analysis: ReturnType<typeof analyzeSleepEvents>,
  now: Date
): SleepProgressComparison => {
  const currentStart = startOfDay(now);
  const currentMinutes = sumSleepMinutes(analysis, currentStart.getTime(), now.getTime());
  const trailingDailyMinutes = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(currentStart);
    day.setDate(day.getDate() - (index + 1));
    const cutoff = new Date(day);
    cutoff.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
    return sumSleepMinutes(analysis, day.getTime(), cutoff.getTime());
  });
  const trailingAverageMinutes =
    trailingDailyMinutes.reduce((sum, minutes) => sum + minutes, 0) / trailingDailyMinutes.length;
  const differenceMinutes = currentMinutes - trailingAverageMinutes;
  const hasHistory = trailingDailyMinutes.some((minutes) => minutes > 0);
  return {
    currentMinutes,
    trailingAverageMinutes,
    differenceMinutes,
    status: !hasHistory
      ? "no-history"
      : Math.abs(differenceMinutes) < 0.5
        ? "same"
        : differenceMinutes > 0
          ? "higher"
          : "lower",
  };
};

export const formatSleepComparison = (differenceMinutes: number) => {
  const rounded = Math.round(Math.abs(differenceMinutes));
  if (rounded === 0) return "過去7日平均とほぼ同じペースです";
  return differenceMinutes > 0
    ? `過去7日平均より ${formatSleepDuration(rounded)} 多めです`
    : `過去7日平均より ${formatSleepDuration(rounded)} 少なめです`;
};

export const formatShortDate = (timestamp: number) => {
  const date = new Date(timestamp);
  return `${date.getMonth() + 1}/${date.getDate()}`;
};
