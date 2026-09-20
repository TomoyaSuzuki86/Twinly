import type { BabyProfile, LogEvent } from "@/types";
import type { DiaperStockEstimate } from "./diaper-stock";
import type { MilkProgressComparison } from "./milk-progress";
import {
  formatDiaperEstimateSummary,
  formatMilkProgressSummary,
  roundMilkAmountUp,
  summarizeBabyPanelLogEvents,
} from "./baby-panel-presenters";
import {
  analyzeSleepEvents,
  buildActivityGauge,
  buildSleepGauge,
  buildSleepLogSummary,
  formatSleepDuration,
  getAverageActivityMinutes,
  getDefaultActivityLimitMinutes,
  getDefaultSleepTargetHours,
} from "./sleep";
import { buildCareGauges } from "./care-gauges";
import { fmtTime, minutesSince } from "./utils";

type Params = {
  profile: BabyProfile;
  latestEvents: LogEvent[];
  logEvents: LogEvent[];
  logDate?: string;
  now: Date;
  diaperStockManagementEnabled: boolean;
  stockForecastEnabled: boolean;
  diaperEstimate: DiaperStockEstimate | null;
  milkProgress: MilkProgressComparison | null;
};

export const buildBabyPanelViewModel = ({
  profile,
  latestEvents,
  logEvents,
  logDate,
  now,
  diaperStockManagementEnabled,
  stockForecastEnabled,
  diaperEstimate,
  milkProgress,
}: Params) => {
  const babyId = profile.babyId;
  const logSummary = summarizeBabyPanelLogEvents(logEvents);
  const remainingDiapers = profile.diaperStockBySize[profile.diaperSize] ?? 0;
  const diaperEstimateSummary =
    diaperStockManagementEnabled && stockForecastEnabled
      ? formatDiaperEstimateSummary(diaperEstimate)
      : null;
  const milkProgressSummary = formatMilkProgressSummary(milkProgress);

  const sleepAnalysis = analyzeSleepEvents(latestEvents, babyId);
  const sleeping = Boolean(sleepAnalysis.currentSleepStart);
  const averageGaugeActivityMinutes = getAverageActivityMinutes(sleepAnalysis, now);
  const activityLimitMinutes =
    profile.activityLimitMinutesOverride ??
    averageGaugeActivityMinutes ??
    getDefaultActivityLimitMinutes(profile.birthDate, now);
  const activityGauge = buildActivityGauge(sleepAnalysis, now, activityLimitMinutes);
  const sleepTargetHours =
    profile.sleepTargetHoursOverride ?? getDefaultSleepTargetHours(profile.birthDate, now);
  const sleepGauge = buildSleepGauge(sleepAnalysis, now, now, sleepTargetHours);
  const sleepButtonGaugePercent = sleeping
    ? sleepGauge.remainingPercent
    : activityGauge.elapsedPercent;

  const latestCompletedSleep = sleepAnalysis.intervals.reduce(
    (latest, interval) => (!latest || interval.end > latest.end ? interval : latest),
    null as (typeof sleepAnalysis.intervals)[number] | null
  );
  const previousSleepDuration = latestCompletedSleep
    ? formatSleepDuration((latestCompletedSleep.end - latestCompletedSleep.start) / 60000)
    : "未記録";
  const activityElapsed = `活動 ${
    latestCompletedSleep
      ? `${formatSleepDuration(activityGauge.elapsedMinutes)} / ${formatSleepDuration(activityGauge.limitMinutes)}`
      : "未記録"
  }`;
  const currentSleepDuration = sleepAnalysis.currentSleepStart
    ? formatSleepDuration((now.getTime() - sleepAnalysis.currentSleepStart.timestamp) / 60000)
    : null;

  const selectedLogDate = logDate ? new Date(`${logDate}T00:00:00`) : now;
  const sleepLogSummary = buildSleepLogSummary(sleepAnalysis, selectedLogDate, now);
  const sleepLogTotal = formatSleepDuration(sleepLogSummary.totalMinutes);
  const averageActivityDuration =
    sleepLogSummary.averageActivityMinutes === null
      ? "未記録"
      : formatSleepDuration(sleepLogSummary.averageActivityMinutes);
  const sleepDurationByWakeId = new Map(
    sleepAnalysis.intervals.map((interval) => [
      interval.wakeEventId,
      (interval.end - interval.start) / 60000,
    ])
  );

  const lastMilkEvent = latestEvents.find((event) => event.type === "milk") ?? null;
  const lastMilkTime = lastMilkEvent ? fmtTime(new Date(lastMilkEvent.timestamp)) : "-";
  const lastMilkElapsed = lastMilkEvent
    ? `${minutesSince(lastMilkEvent.timestamp, now)}分前`
    : "未記録";

  const lastDiaperEvent = latestEvents.find((event) => event.type === "diaper") ?? null;
  const lastDiaperTime = lastDiaperEvent ? fmtTime(new Date(lastDiaperEvent.timestamp)) : "-";
  const lastDiaperElapsed = lastDiaperEvent
    ? `${minutesSince(lastDiaperEvent.timestamp, now)}分前`
    : "未記録";

  const careGauges = buildCareGauges({
    events: latestEvents,
    babyId,
    now,
    milkWindowHours: profile.milkGaugeWindowHours ?? 3,
    milkTargetMlOverride: profile.milkTargetMlOverride ?? null,
    diaperWindowMinutes: profile.diaperGaugeWindowMinutes ?? 120,
  });
  const milkGaugePercent = Math.round((1 - (careGauges.milk?.level ?? 0)) * 100);
  const milkNeededMl = careGauges.milk ? roundMilkAmountUp(careGauges.milk.neededMl) : null;
  const milkTargetMl = careGauges.milk ? roundMilkAmountUp(careGauges.milk.targetMilkMl) : null;
  const diaperGaugePercent = Math.round(
    (1 - (careGauges.diaper?.level ?? (lastDiaperEvent ? 1 : 0))) * 100
  );

  return {
    ...logSummary,
    remainingDiapers,
    diaperEstimateSummary,
    milkProgressSummary,
    sleepAnalysis,
    sleeping,
    activityGauge,
    sleepGauge,
    sleepButtonGaugePercent,
    previousSleepDuration,
    activityElapsed,
    currentSleepDuration,
    sleepLogSummary,
    sleepLogTotal,
    averageActivityDuration,
    sleepDurationByWakeId,
    lastMilkEvent,
    lastMilkTime,
    lastMilkElapsed,
    lastDiaperEvent,
    lastDiaperTime,
    lastDiaperElapsed,
    milkGaugePercent,
    milkNeededMl,
    milkTargetMl,
    diaperGaugePercent,
  };
};
