export const MIN_MILK_WINDOW_HOURS = 0.5;
export const MAX_MILK_WINDOW_HOURS = 12;
export const DEFAULT_MILK_WINDOW_HOURS = 3;

export const clampMilkWindowHours = (value: number) =>
  Math.max(MIN_MILK_WINDOW_HOURS, Math.min(MAX_MILK_WINDOW_HOURS, value));

/**
 * Preserves the settings input contract: an empty/zero/non-numeric value
 * falls back to the default before applying the domain bounds.
 */
export const normalizeMilkWindowInput = (value: string | number) =>
  clampMilkWindowHours(Number(value) || DEFAULT_MILK_WINDOW_HOURS);
