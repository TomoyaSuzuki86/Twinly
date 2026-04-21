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
  bottle: MilkStats;
  breast: MilkStats;
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
  const bottleEvents = events.filter((event) => event.milkMethod === "bottle");
  const breastEvents = events.filter((event) => event.milkMethod === "breast");

  return {
    total: buildMilkStats(events),
    bottle: buildMilkStats(bottleEvents),
    breast: buildMilkStats(breastEvents),
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

export const filterEventsForTimeRange = (events: LogEvent[], timeRange: TimeRange, now: Date) => {
  const rangeStart = getRangeStart(timeRange, now).getTime();
  const rangeEnd = now.getTime();

  return events.filter((event) => event.timestamp >= rangeStart && event.timestamp <= rangeEnd);
};

export const buildMilkChartData = (events: LogEvent[], timeRange: TimeRange, now: Date): MilkChartDatum[] => {
  const visibleEvents = filterEventsForTimeRange(events, timeRange, now);
  const buckets = new Map<string, LogEvent[]>();

  for (const event of visibleEvents) {
    const key = getPeriodKey(new Date(event.timestamp), timeRange);
    const current = buckets.get(key) ?? [];
    current.push(event);
    buckets.set(key, current);
  }

  return Array.from(buckets.entries())
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
    .map(([key, bucketEvents]) => ({
      key,
      label: getPeriodLabel(key),
      ...summarizeMilkEvents(bucketEvents),
    }));
};

export const buildDiaperChartData = (events: LogEvent[], timeRange: TimeRange, now: Date): DiaperChartDatum[] => {
  const visibleEvents = filterEventsForTimeRange(events, timeRange, now);
  const buckets = new Map<string, LogEvent[]>();
  const daySpan = getPeriodDaySpan(timeRange);

  for (const event of visibleEvents) {
    const key = getPeriodKey(new Date(event.timestamp), timeRange);
    const current = buckets.get(key) ?? [];
    current.push(event);
    buckets.set(key, current);
  }

  return Array.from(buckets.entries())
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
    .map(([key, bucketEvents]) => ({
      key,
      label: getPeriodLabel(key),
      ...summarizeDiaperEvents(bucketEvents, daySpan),
    }));
};

export const getDefaultHistoryRange = (_historyType: "milk" | "diaper"): TimeRange => "1W";

export const formatAverageMilkAmount = (average: number) => `${Math.round(average)}ml`;
export const formatAverageDiaperCount = (average: number) => `${average.toFixed(1)}回/日`;
