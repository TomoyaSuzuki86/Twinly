import type { AppState, BabyId, LogEvent } from "@/types";
import { endOfDayMs, startOfDayMs } from "./utils";
import { estimateDiaperStockBySize } from "./diaper-stock";
import { buildMilkProgressComparison } from "./milk-progress";
import { buildCareGauges } from "./care-gauges";
import { DEFAULT_DIAPER_WINDOW_MINUTES } from "./diaper-window-policy";
import {
  analyzeSleepEvents,
  buildActivityGauge,
  getAverageActivityMinutes,
  getDefaultActivityLimitMinutes,
} from "./sleep";

type BabyDashboardSlice = {
  currentEvents: LogEvent[];
  logEvents: LogEvent[];
  latestEvents: LogEvent[];
  lastWeight: number | null;
  lastHeight: number | null;
  lowStock: { size: string; remaining: number } | null;
  diaperEstimate: ReturnType<typeof estimateDiaperStockBySize> | null;
  milkProgress: ReturnType<typeof buildMilkProgressComparison>;
  sleeping: boolean;
  tabGaugePercents: { milk: number; diaper: number; activity: number };
};

export type DashboardSelectors = Record<BabyId, BabyDashboardSlice>;

const BABY_IDS: readonly BabyId[] = ["A", "B"];

const groupByBaby = (events: LogEvent[]): Record<BabyId, LogEvent[]> => {
  const grouped: Record<BabyId, LogEvent[]> = { A: [], B: [] };
  for (const event of events) grouped[event.babyId].push(event);
  return grouped;
};

const eventsInDay = (events: LogEvent[], isoDate: string) => {
  const date = new Date(`${isoDate}T00:00:00`);
  const from = startOfDayMs(date);
  const to = endOfDayMs(date);
  return events
    .filter((event) => event.timestamp >= from && event.timestamp <= to)
    .sort((a, b) => b.timestamp - a.timestamp);
};

export const buildDashboardSelectors = (
  app: AppState,
  activeDate: string,
  todayDate: string,
  now: Date
): DashboardSelectors => {
  const currentEvents = groupByBaby(eventsInDay(app.events, todayDate));
  const logEvents = groupByBaby(eventsInDay(app.events, activeDate));
  const latestEvents = groupByBaby(app.events);

  return Object.fromEntries(
    BABY_IDS.map((babyId) => {
      const profile = app.profiles[babyId];
      const babyEvents = latestEvents[babyId];
      const lastWeightEvent = babyEvents.find(
        (event) => event.type === "weight" && event.weight !== undefined
      );
      const lastHeightEvent = babyEvents.find(
        (event) => event.type === "height" && event.height !== undefined
      );
      const remaining = profile.diaperStockBySize[profile.diaperSize] ?? 0;
      const lowStock =
        app.diaperStockManagementEnabled && remaining <= 10
          ? { size: profile.diaperSize, remaining }
          : null;
      const diaperEstimate = app.diaperStockManagementEnabled
        ? estimateDiaperStockBySize({
            profiles: app.profiles,
            events: app.events,
            size: profile.diaperSize,
            now,
          })
        : null;
      const milkProgress = buildMilkProgressComparison({
        events: app.events,
        babyId,
        targetDate: activeDate,
        now,
      });
      const careGauges = buildCareGauges({
        events: babyEvents,
        babyId,
        now,
        milkWindowHours: profile.milkGaugeWindowHours ?? 3,
        milkTargetMlOverride: profile.milkTargetMlOverride ?? null,
        diaperWindowMinutes: profile.diaperGaugeWindowMinutes ?? DEFAULT_DIAPER_WINDOW_MINUTES,
      });
      const hasDiaperRecord = babyEvents.some((event) => event.type === "diaper");
      const sleepAnalysis = analyzeSleepEvents(babyEvents, babyId);
      const activityLimitMinutes =
        profile.activityLimitMinutesOverride ??
        getAverageActivityMinutes(sleepAnalysis, now) ??
        getDefaultActivityLimitMinutes(profile.birthDate, now);
      const sleeping = Boolean(sleepAnalysis.currentSleepStart);

      const slice: BabyDashboardSlice = {
        currentEvents: currentEvents[babyId],
        logEvents: logEvents[babyId],
        latestEvents: babyEvents,
        lastWeight: lastWeightEvent?.weight ?? null,
        lastHeight: lastHeightEvent?.height ?? null,
        lowStock,
        diaperEstimate,
        milkProgress,
        sleeping,
        tabGaugePercents: {
          milk: Math.round((1 - (careGauges.milk?.level ?? 0)) * 100),
          diaper: Math.round(
            (1 - (careGauges.diaper?.level ?? (hasDiaperRecord ? 1 : 0))) * 100
          ),
          activity: sleeping
            ? 0
            : buildActivityGauge(sleepAnalysis, now, activityLimitMinutes).elapsedPercent,
        },
      };

      return [babyId, slice];
    })
  ) as DashboardSelectors;
};