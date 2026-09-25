import { LogEvent } from "@/types";
import { fmtDate } from "@/lib/utils";

export type TimeRange = "1W" | "1M" | "3M";

export type MilkStats = {
  count: number;
  amount: number;
  average: number;
};

export type MilkBreakdown = {
  total: MilkStats;
  breastCount: number;
  solidFoodCount: number;
};

export type BreastfeedingStats = {
  count: number;
  leftMinutes: number;
  rightMinutes: number;
  totalMinutes: number;
  dailyAverageMinutes: number;
};

export type SolidFoodStats = {
  count: number;
  dailyAverage: number;
};

export type DiaperStats = {
  count: number;
  dailyAverage: number;
};

export type DiaperBreakdown = {
  total: DiaperStats;
  pee: DiaperStats;
  poop: DiaperStats;
};

export type MilkChartDatum = MilkBreakdown & {
  key: string;
  label: string;
};

export type DiaperChartDatum = DiaperBreakdown & {
  key: string;
  label: string;
};

export type BreastfeedingChartDatum = BreastfeedingStats & {
  key: string;
  label: string;
};

export type SolidFoodChartDatum = SolidFoodStats & {
  key: string;
  label: string;
};

export const rangeDays: Record<TimeRange, number> = {
  "1W": 7,
  "1M": 30,
  "3M": 90,
};

const startOfDay = (date: Date) => {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
};

const startOfWeek = (date: Date) => {
  const value = startOfDay(date);
  const day = value.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  value.setDate(value.getDate() + diff);
  return value;
};

const buildMilkStats = (events: LogEvent[]): MilkStats => {
  const amount = events.reduce((sum, event) => sum + (event.milkMl ?? 0), 0);
  const count = events.length;
  return {
    count,
    amount,
    average: count === 0 ? 0 : amount / count,
  };
};

const buildDiaperStats = (count: number, daySpan: number): DiaperStats => ({
  count,
  dailyAverage: daySpan === 0 ? 0 : count / daySpan,
});

export const summarizeMilkEvents = (events: LogEvent[]): MilkBreakdown => {
  const milkEvents = events.filter((event) => event.type === "milk" && event.milkMethod !== "breast");
  return {
    total: buildMilkStats(milkEvents),
    breastCount: events.filter((event) => event.type === "milk" && event.milkMethod === "breast").length,
    solidFoodCount: events.filter((event) => event.type === "solidFood").length,
  };
};

export const summarizeBreastfeedingEvents = (
  events: LogEvent[],
  daySpan: number
): BreastfeedingStats => {
  const breastEvents = events.filter(
    (event) => event.type === "milk" && event.milkMethod === "breast"
  );
  const leftMinutes = breastEvents.reduce(
    (sum, event) => sum + Math.max(0, event.breastLeftMinutes ?? 0),
    0
  );
  const rightMinutes = breastEvents.reduce(
    (sum, event) => sum + Math.max(0, event.breastRightMinutes ?? 0),
    0
  );
  const totalMinutes = leftMinutes + rightMinutes;
  return {
    count: breastEvents.length,
    leftMinutes,
    rightMinutes,
    totalMinutes,
    dailyAverageMinutes: daySpan === 0 ? 0 : totalMinutes / daySpan,
  };
};

export const summarizeSolidFoodEvents = (
  events: LogEvent[],
  daySpan: number
): SolidFoodStats => {
  const count = events.filter((event) => event.type === "solidFood").length;
  return {
    count,
    dailyAverage: daySpan === 0 ? 0 : count / daySpan,
  };
};

export const summarizeDiaperEvents = (events: LogEvent[], daySpan: number): DiaperBreakdown => {
  const peeCount = events.reduce(
    (count, event) => count + (event.diaperKind === "pee" || event.diaperKind === "mix" ? 1 : 0),
    0
  );
  const poopCount = events.reduce(
    (count, event) => count + (event.diaperKind === "poop" || event.diaperKind === "mix" ? 1 : 0),
    0
  );

  return {
    total: buildDiaperStats(peeCount + poopCount, daySpan),
    pee: buildDiaperStats(peeCount, daySpan),
    poop: buildDiaperStats(poopCount, daySpan),
  };
};

const getRangeStart = (timeRange: TimeRange, now: Date) => {
  const start = startOfDay(now);
  start.setDate(start.getDate() - (rangeDays[timeRange] - 1));
  return start;
};

const getPeriodKey = (date: Date, timeRange: TimeRange) => {
  if (timeRange === "3M") {
    return fmtDate(startOfWeek(date));
  }

  return fmtDate(startOfDay(date));
};

const getPeriodLabel = (key: string) => key.slice(5);

const getPeriodDaySpan = (timeRange: TimeRange) => (timeRange === "3M" ? 7 : 1);

const buildPeriodKeys = (timeRange: TimeRange, now: Date) => {
  const keys: string[] = [];
  if (timeRange === "3M") {
    const cursor = startOfWeek(getRangeStart(timeRange, now));
    const end = startOfWeek(now);
    while (cursor.getTime() <= end.getTime()) {
      keys.push(fmtDate(cursor));
      cursor.setDate(cursor.getDate() + 7);
    }
    return keys;
  }

  const cursor = getRangeStart(timeRange, now);
  const end = startOfDay(now);
  while (cursor.getTime() <= end.getTime()) {
    keys.push(fmtDate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return keys;
};

export const filterEventsForTimeRange = (events: LogEvent[], timeRange: TimeRange, now: Date) => {
  const rangeStart = getRangeStart(timeRange, now).getTime();
  const rangeEnd = now.getTime();

  return events.filter((event) => event.timestamp >= rangeStart && event.timestamp <= rangeEnd);
};

const bucketEventsByPeriod = (events: LogEvent[], timeRange: TimeRange, now: Date) => {
  const buckets = new Map<string, LogEvent[]>();

  for (const event of filterEventsForTimeRange(events, timeRange, now)) {
    const key = getPeriodKey(new Date(event.timestamp), timeRange);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(event);
    else buckets.set(key, [event]);
  }

  return Array.from(buckets.entries()).sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey));
};

export const buildMilkChartData = (events: LogEvent[], timeRange: TimeRange, now: Date): MilkChartDatum[] =>
  bucketEventsByPeriod(events, timeRange, now).map(([key, bucketEvents]) => ({
    key,
    label: getPeriodLabel(key),
    ...summarizeMilkEvents(bucketEvents),
  }));

export const buildBreastfeedingChartData = (
  events: LogEvent[],
  timeRange: TimeRange,
  now: Date
): BreastfeedingChartDatum[] => {
  const buckets = new Map(bucketEventsByPeriod(events, timeRange, now));
  const daySpan = getPeriodDaySpan(timeRange);
  return buildPeriodKeys(timeRange, now).map((key) => ({
    key,
    label: getPeriodLabel(key),
    ...summarizeBreastfeedingEvents(buckets.get(key) ?? [], daySpan),
  }));
};

export const buildSolidFoodChartData = (
  events: LogEvent[],
  timeRange: TimeRange,
  now: Date
): SolidFoodChartDatum[] => {
  const buckets = new Map(bucketEventsByPeriod(events, timeRange, now));
  const daySpan = getPeriodDaySpan(timeRange);
  return buildPeriodKeys(timeRange, now).map((key) => ({
    key,
    label: getPeriodLabel(key),
    ...summarizeSolidFoodEvents(buckets.get(key) ?? [], daySpan),
  }));
};

export const buildDiaperChartData = (events: LogEvent[], timeRange: TimeRange, now: Date): DiaperChartDatum[] => {
  const daySpan = getPeriodDaySpan(timeRange);
  return bucketEventsByPeriod(events, timeRange, now).map(([key, bucketEvents]) => ({
    key,
    label: getPeriodLabel(key),
    ...summarizeDiaperEvents(bucketEvents, daySpan),
  }));
};

export const getDefaultHistoryRange = (_historyType: "milk" | "diaper"): TimeRange => "1W";

export const formatAverageMilkAmount = (average: number) => `${Math.round(average)}ml`;
export const formatAverageDiaperCount = (average: number) => `${average.toFixed(1)}回/日`;
