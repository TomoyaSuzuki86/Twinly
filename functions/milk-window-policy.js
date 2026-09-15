const MIN_MILK_WINDOW_HOURS = 0.5;
const MAX_MILK_WINDOW_HOURS = 12;
const DEFAULT_MILK_WINDOW_HOURS = 3;

const clampMilkWindowHours = (value) =>
  Math.max(MIN_MILK_WINDOW_HOURS, Math.min(MAX_MILK_WINDOW_HOURS, value));

const resolveMilkWindowHours = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_MILK_WINDOW_HOURS;
  return clampMilkWindowHours(parsed);
};

module.exports = {
  DEFAULT_MILK_WINDOW_HOURS,
  MAX_MILK_WINDOW_HOURS,
  MIN_MILK_WINDOW_HOURS,
  clampMilkWindowHours,
  resolveMilkWindowHours,
};
