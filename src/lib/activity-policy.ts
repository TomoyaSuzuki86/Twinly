export type ActivityInterval = {
  start: number;
  end: number;
};

export const MIN_ACTIVITY_LIMIT_MINUTES = 30;
export const MAX_ACTIVITY_LIMIT_MINUTES = 12 * 60;
export const DEFAULT_ACTIVITY_LIMIT_MINUTES = 180;
export const FULL_ACTIVITY_RECOVERY_MINUTES = 30;

const parseLocalDate = (value: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
};

export const clampActivityLimitMinutes = (value: number) =>
  Math.max(MIN_ACTIVITY_LIMIT_MINUTES, Math.min(MAX_ACTIVITY_LIMIT_MINUTES, value));

export const getDefaultActivityLimitMinutes = (birthDate: string, now: Date) => {
  const birth = parseLocalDate(birthDate);
  if (!birth || birth.getTime() > now.getTime()) return DEFAULT_ACTIVITY_LIMIT_MINUTES;

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

const clampPercent = (value: number) => Math.max(0, Math.min(100, value));

export const buildActivityPercentAt = ({
  intervals,
  currentSleepStartAt,
  atMs,
  limitMinutes,
}: {
  intervals: ActivityInterval[];
  currentSleepStartAt?: number | null;
  atMs: number;
  limitMinutes: number;
}) => {
  const normalizedLimitMinutes = clampActivityLimitMinutes(limitMinutes);
  const completedIntervals = intervals
    .filter((interval) => interval.end > interval.start && interval.end <= atMs)
    .sort((left, right) => left.start - right.start);

  if (completedIntervals.length === 0) return 0;

  let activityPercent = 100;
  let cursor = completedIntervals[0].start;

  for (const interval of completedIntervals) {
    if (interval.start > cursor) {
      const awakeMinutes = (interval.start - cursor) / (60 * 1000);
      activityPercent = clampPercent(
        activityPercent + (awakeMinutes / normalizedLimitMinutes) * 100
      );
    }

    const sleepMinutes = (interval.end - interval.start) / (60 * 1000);
    activityPercent = clampPercent(
      activityPercent - (sleepMinutes / FULL_ACTIVITY_RECOVERY_MINUTES) * 100
    );
    cursor = interval.end;
  }

  if (typeof currentSleepStartAt === "number" && currentSleepStartAt <= atMs) {
    if (currentSleepStartAt > cursor) {
      const awakeMinutes = (currentSleepStartAt - cursor) / (60 * 1000);
      activityPercent = clampPercent(
        activityPercent + (awakeMinutes / normalizedLimitMinutes) * 100
      );
    }

    const currentSleepMinutes = (atMs - currentSleepStartAt) / (60 * 1000);
    return clampPercent(
      activityPercent - (currentSleepMinutes / FULL_ACTIVITY_RECOVERY_MINUTES) * 100
    );
  }

  if (atMs > cursor) {
    const awakeMinutes = (atMs - cursor) / (60 * 1000);
    activityPercent = clampPercent(
      activityPercent + (awakeMinutes / normalizedLimitMinutes) * 100
    );
  }

  return activityPercent;
};
