const MIN_DIAPER_WINDOW_MINUTES = 30;
const MAX_DIAPER_WINDOW_MINUTES = 720;
const DEFAULT_DIAPER_WINDOW_MINUTES = 120;

const clampDiaperWindowMinutes = value =>
  Math.max(MIN_DIAPER_WINDOW_MINUTES, Math.min(MAX_DIAPER_WINDOW_MINUTES, value));

const resolveDiaperWindowMinutes = value => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_DIAPER_WINDOW_MINUTES;
  return clampDiaperWindowMinutes(parsed);
};

module.exports = {
  MIN_DIAPER_WINDOW_MINUTES,
  MAX_DIAPER_WINDOW_MINUTES,
  DEFAULT_DIAPER_WINDOW_MINUTES,
  clampDiaperWindowMinutes,
  resolveDiaperWindowMinutes,
};
