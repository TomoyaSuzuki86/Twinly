const MINUTE_MS = 60 * 1000;
const FULL_ACTIVITY_RECOVERY_MINUTES = 30;
const MIN_ACTIVITY_LIMIT_MINUTES = 30;
const MAX_ACTIVITY_LIMIT_MINUTES = 12 * 60;
const DEFAULT_ACTIVITY_LIMIT_MINUTES = 180;

const ACTIVITY_LIMIT_BY_AGE = [
  { beforeMonths: 1, minutes: 60 },
  { beforeMonths: 2, minutes: 90 },
  { beforeMonths: 3, minutes: 120 },
  { beforeMonths: 5, minutes: 150 },
  { beforeMonths: 6, minutes: 180 },
  { beforeMonths: 9, minutes: 240 },
  { beforeMonths: 10, minutes: 270 },
  { beforeMonths: 15, minutes: 300 },
  { beforeMonths: Number.POSITIVE_INFINITY, minutes: 360 },
];

const tokyoDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const clampPercent = (value) => Math.max(0, Math.min(100, value));

const clampActivityLimitMinutes = (value) =>
  Math.max(MIN_ACTIVITY_LIMIT_MINUTES, Math.min(MAX_ACTIVITY_LIMIT_MINUTES, value));

const getTokyoDateParts = (timestamp) => {
  const parts = tokyoDateFormatter.formatToParts(new Date(timestamp));
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(byType.year),
    month: Number(byType.month),
    day: Number(byType.day),
  };
};

const getDefaultActivityLimitMinutes = (birthDate, nowMs) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(birthDate || ""));
  if (!match) return DEFAULT_ACTIVITY_LIMIT_MINUTES;

  const birthYear = Number(match[1]);
  const birthMonth = Number(match[2]);
  const birthDay = Number(match[3]);
  const now = getTokyoDateParts(nowMs);

  let completedMonths = (now.year - birthYear) * 12 + now.month - birthMonth;
  if (now.day < birthDay) completedMonths -= 1;
  if (completedMonths < 0) return DEFAULT_ACTIVITY_LIMIT_MINUTES;

  return (
    ACTIVITY_LIMIT_BY_AGE.find(({ beforeMonths }) => completedMonths < beforeMonths)?.minutes ??
    DEFAULT_ACTIVITY_LIMIT_MINUTES
  );
};

const buildActivityPercentAt = (analysis, atMs, limitMinutes) => {
  const normalizedLimitMinutes = clampActivityLimitMinutes(limitMinutes);
  const completedIntervals = analysis.intervals
    .filter((interval) => interval.end > interval.start && interval.end <= atMs)
    .sort((left, right) => left.start - right.start);

  if (!completedIntervals.length) return 0;

  let activityPercent = 100;
  let cursor = completedIntervals[0].start;

  for (const interval of completedIntervals) {
    if (interval.start > cursor) {
      const awakeMinutes = (interval.start - cursor) / MINUTE_MS;
      activityPercent = clampPercent(
        activityPercent + (awakeMinutes / normalizedLimitMinutes) * 100
      );
    }

    const sleepMinutes = (interval.end - interval.start) / MINUTE_MS;
    activityPercent = clampPercent(
      activityPercent - (sleepMinutes / FULL_ACTIVITY_RECOVERY_MINUTES) * 100
    );
    cursor = interval.end;
  }

  if (atMs > cursor) {
    const awakeMinutes = (atMs - cursor) / MINUTE_MS;
    activityPercent = clampPercent(
      activityPercent + (awakeMinutes / normalizedLimitMinutes) * 100
    );
  }

  return activityPercent;
};

module.exports = {
  ACTIVITY_LIMIT_BY_AGE,
  DEFAULT_ACTIVITY_LIMIT_MINUTES,
  FULL_ACTIVITY_RECOVERY_MINUTES,
  MAX_ACTIVITY_LIMIT_MINUTES,
  MIN_ACTIVITY_LIMIT_MINUTES,
  buildActivityPercentAt,
  clampActivityLimitMinutes,
  getDefaultActivityLimitMinutes,
};
