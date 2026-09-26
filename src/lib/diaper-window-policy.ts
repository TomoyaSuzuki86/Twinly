export const MIN_DIAPER_WINDOW_MINUTES = 30;
export const MAX_DIAPER_WINDOW_MINUTES = 720;
export const DEFAULT_DIAPER_WINDOW_MINUTES = 120;

export const clampDiaperWindowMinutes = (value: number) =>
  Math.max(MIN_DIAPER_WINDOW_MINUTES, Math.min(MAX_DIAPER_WINDOW_MINUTES, value));

export const resolveDiaperWindowMinutes = (value: unknown) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_DIAPER_WINDOW_MINUTES;
  return clampDiaperWindowMinutes(parsed);
};
