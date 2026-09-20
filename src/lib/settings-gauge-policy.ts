import type { BabyId, BabyProfile, LogEvent } from "@/types";
import { buildMilkGauge } from "./care-gauges";
import { getDefaultActivityLimitMinutes, getDefaultSleepTargetHours } from "./sleep";

export type BabyProfiles = Record<BabyId, BabyProfile>;
export const BABY_DISPLAY_ORDER: readonly BabyId[] = ["A", "B"];

export const gaugeProfileSnapshot = (profile: BabyProfile) => ({
  milkGaugeWindowHours: profile.milkGaugeWindowHours ?? 3,
  milkTargetMlOverride: profile.milkTargetMlOverride ?? null,
  diaperGaugeWindowMinutes: profile.diaperGaugeWindowMinutes ?? 120,
  activityLimitMinutesOverride: profile.activityLimitMinutesOverride ?? null,
  activityLimitMinutesCustom: profile.activityLimitMinutesCustom ?? null,
  sleepTargetHoursOverride: profile.sleepTargetHoursOverride ?? null,
  sleepTargetHoursCustom: profile.sleepTargetHoursCustom ?? null,
});

export const gaugeProfilesEqual = (left: BabyProfiles, right: BabyProfiles) =>
  JSON.stringify(BABY_DISPLAY_ORDER.map((babyId) => gaugeProfileSnapshot(left[babyId]))) ===
  JSON.stringify(BABY_DISPLAY_ORDER.map((babyId) => gaugeProfileSnapshot(right[babyId])));

export const applyGaugeProfiles = (base: BabyProfiles, source: BabyProfiles): BabyProfiles =>
  Object.fromEntries(
    BABY_DISPLAY_ORDER.map((babyId) => [
      babyId,
      { ...base[babyId], ...gaugeProfileSnapshot(source[babyId]) },
    ])
  ) as BabyProfiles;

export const setSleepCustomValue = (
  profiles: BabyProfiles,
  babyId: BabyId,
  kind: "activity" | "sleep",
  value: number
): BabyProfiles => ({
  ...profiles,
  [babyId]: {
    ...profiles[babyId],
    ...(kind === "activity"
      ? { activityLimitMinutesOverride: value, activityLimitMinutesCustom: value }
      : { sleepTargetHoursOverride: value, sleepTargetHoursCustom: value }),
  },
});

export const setSleepGaugeMode = (
  profiles: BabyProfiles,
  babyId: BabyId,
  mode: "age" | "custom",
  defaultActivityLimitMinutes: number,
  defaultSleepTargetHours: number
): BabyProfiles => {
  const profile = profiles[babyId];
  if (mode === "age") {
    return {
      ...profiles,
      [babyId]: {
        ...profile,
        activityLimitMinutesCustom:
          profile.activityLimitMinutesOverride ??
          profile.activityLimitMinutesCustom ??
          defaultActivityLimitMinutes,
        sleepTargetHoursCustom:
          profile.sleepTargetHoursOverride ??
          profile.sleepTargetHoursCustom ??
          defaultSleepTargetHours,
        activityLimitMinutesOverride: null,
        sleepTargetHoursOverride: null,
      },
    };
  }

  return {
    ...profiles,
    [babyId]: {
      ...profile,
      activityLimitMinutesOverride:
        profile.activityLimitMinutesCustom ??
        profile.activityLimitMinutesOverride ??
        defaultActivityLimitMinutes,
      sleepTargetHoursOverride:
        profile.sleepTargetHoursCustom ??
        profile.sleepTargetHoursOverride ??
        defaultSleepTargetHours,
    },
  };
};

export const copyGaugeSettings = (
  profiles: BabyProfiles,
  sourceBabyId: BabyId
): BabyProfiles => {
  const targetBabyId: BabyId = sourceBabyId === "A" ? "B" : "A";
  return {
    ...profiles,
    [targetBabyId]: {
      ...profiles[targetBabyId],
      ...gaugeProfileSnapshot(profiles[sourceBabyId]),
    },
  };
};


export const buildCareGaugeSettingsModel = ({
  babyId,
  profile,
  displayProfile,
  events,
  now,
}: {
  babyId: BabyId;
  profile: BabyProfile;
  displayProfile: BabyProfile;
  events: LogEvent[];
  now: Date;
}) => {
  const calculatedMilkTarget = buildMilkGauge({
    events,
    babyId,
    now,
    windowHours: profile.milkGaugeWindowHours ?? 3,
    targetMilkMlOverride: null,
  })?.targetMilkMl;
  const autoMilkTarget = calculatedMilkTarget ? Math.round(calculatedMilkTarget) : null;
  const defaultActivityLimitMinutes = getDefaultActivityLimitMinutes(displayProfile.birthDate, now);
  const defaultSleepTargetHours = getDefaultSleepTargetHours(displayProfile.birthDate, now);

  return {
    autoMilkTarget,
    milkTarget: profile.milkTargetMlOverride ?? autoMilkTarget,
    milkWindowHours: profile.milkGaugeWindowHours ?? 3,
    diaperWindowMinutes: profile.diaperGaugeWindowMinutes ?? 120,
    defaultActivityLimitMinutes,
    defaultSleepTargetHours,
    activityLimitMinutes: profile.activityLimitMinutesOverride ?? defaultActivityLimitMinutes,
    sleepTargetHours: profile.sleepTargetHoursOverride ?? defaultSleepTargetHours,
    sleepUsesAgeDefaults:
      profile.activityLimitMinutesOverride == null && profile.sleepTargetHoursOverride == null,
  };
};
