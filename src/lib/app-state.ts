import { AppState, BabyProfile, CustomMemoPreset, LogEvent } from "@/types";
import { fmtDate } from "./utils";

export type SharedAppState = Pick<AppState, "profiles" | "events"> & {
  customMemoPresets?: CustomMemoPreset[];
  diaperStockManagementEnabled?: boolean;
  sleepManagementEnabled?: boolean;
};

type LegacyLogEvent = LogEvent & {
  calendarStatus?: "pending" | "synced" | "error";
  calendarEventId?: string;
};

type StoredProfile = BabyProfile;

type LegacyProfile = StoredProfile & {
  calendarName?: string;
  calendarId?: string;
};

type LegacyAppState = Omit<AppState, "profiles" | "events" | "customMemoPresets" | "diaperStockManagementEnabled" | "sleepManagementEnabled"> & {
  profiles: {
    A: LegacyProfile;
    B: LegacyProfile;
  };
  events: LegacyLogEvent[];
  customMemoPresets?: CustomMemoPreset[];
  diaperStockManagementEnabled?: boolean;
  sleepManagementEnabled?: boolean;
};

const demoBirthDate = (now: Date, daysAgo: number) => {
  const date = new Date(now);
  date.setDate(date.getDate() - daysAgo);
  return fmtDate(date);
};

const createBaseProfiles = (now: Date): AppState["profiles"] => ({
  A: {
    babyId: "A",
    displayName: "赤ちゃんA",
    birthDate: demoBirthDate(now, 103),
    diaperSize: "新生児",
    diaperStockBySize: { 新生児: 80, S: 0, M: 0, L: 0 },
    diaperPurchaseUrl: "",
    iconEmoji: "A",
    iconGradient: "from-violet-500 to-fuchsia-500",
    voiceAliases: [],
    milkGaugeWindowHours: 3,
    milkTargetMlOverride: null,
    diaperGaugeWindowMinutes: 120,
    activityLimitMinutesOverride: null,
    activityLimitMinutesCustom: null,
    sleepTargetHoursOverride: null,
    sleepTargetHoursCustom: null,
  },
  B: {
    babyId: "B",
    displayName: "赤ちゃんB",
    birthDate: demoBirthDate(now, 103),
    diaperSize: "新生児",
    diaperStockBySize: { 新生児: 80, S: 0, M: 0, L: 0 },
    diaperPurchaseUrl: "",
    iconEmoji: "B",
    iconGradient: "from-sky-500 to-cyan-400",
    voiceAliases: [],
    milkGaugeWindowHours: 3,
    milkTargetMlOverride: null,
    diaperGaugeWindowMinutes: 120,
    activityLimitMinutesOverride: null,
    activityLimitMinutesCustom: null,
    sleepTargetHoursOverride: null,
    sleepTargetHoursCustom: null,
  },
});

export const createInitialAppState = (now: Date = new Date()): AppState => ({
  profiles: createBaseProfiles(now),
  events: [],
  customMemoPresets: [],
  diaperStockManagementEnabled: true,
  sleepManagementEnabled: true,
  ui: {
    lastViewedDate: fmtDate(now),
  },
});

export const toSharedAppState = (app: AppState): SharedAppState => ({
  profiles: app.profiles,
  events: app.events,
  customMemoPresets: app.customMemoPresets,
  diaperStockManagementEnabled: app.diaperStockManagementEnabled,
  sleepManagementEnabled: app.sleepManagementEnabled,
});

const normalizeStoredProfile = (profile: StoredProfile): BabyProfile => ({
  ...profile,
  milkGaugeWindowHours: profile.milkGaugeWindowHours ?? 3,
  milkTargetMlOverride: profile.milkTargetMlOverride ?? null,
  diaperGaugeWindowMinutes: profile.diaperGaugeWindowMinutes ?? 120,
  activityLimitMinutesOverride: profile.activityLimitMinutesOverride ?? null,
  activityLimitMinutesCustom:
    profile.activityLimitMinutesCustom ?? profile.activityLimitMinutesOverride ?? null,
  sleepTargetHoursOverride: profile.sleepTargetHoursOverride ?? null,
  sleepTargetHoursCustom:
    profile.sleepTargetHoursCustom ?? profile.sleepTargetHoursOverride ?? null,
});

const normalizeProfiles = (profiles: AppState["profiles"]): AppState["profiles"] => ({
  A: normalizeStoredProfile(profiles.A),
  B: normalizeStoredProfile(profiles.B),
});

const stripLegacyProfile = (profile: LegacyProfile): BabyProfile => {
  const { calendarId: _calendarId, calendarName: _calendarName, ...storedProfile } = profile;
  return normalizeStoredProfile(storedProfile);
};

const stripLegacyEvent = (event: LegacyLogEvent): LogEvent => {
  const { calendarEventId: _calendarEventId, calendarStatus: _calendarStatus, ...storedEvent } = event;
  return storedEvent;
};

const normalizeCustomMemoPresets = (value: unknown): CustomMemoPreset[] => {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is CustomMemoPreset =>
      Boolean(item) &&
      typeof item === "object" &&
      typeof (item as CustomMemoPreset).id === "string" &&
      typeof (item as CustomMemoPreset).emoji === "string" &&
      typeof (item as CustomMemoPreset).text === "string"
    )
    .map((item) => ({
      id: item.id.trim(),
      emoji: item.emoji.trim(),
      text: item.text.trim(),
    }))
    .filter((item) => item.id && item.emoji && item.text)
    .slice(0, 50);
};

export const mergeSharedAppState = (shared: SharedAppState, ui: AppState["ui"]): AppState => ({
  ...shared,
  profiles: normalizeProfiles(shared.profiles),
  customMemoPresets: normalizeCustomMemoPresets(shared.customMemoPresets),
  diaperStockManagementEnabled: shared.diaperStockManagementEnabled ?? true,
  sleepManagementEnabled: shared.sleepManagementEnabled ?? true,
  ui,
});

export const stripLegacyCalendarFields = (app: LegacyAppState): AppState => ({
  ...app,
  customMemoPresets: normalizeCustomMemoPresets(app.customMemoPresets),
  diaperStockManagementEnabled: app.diaperStockManagementEnabled ?? true,
  sleepManagementEnabled: app.sleepManagementEnabled ?? true,
  profiles: {
    A: stripLegacyProfile(app.profiles.A),
    B: stripLegacyProfile(app.profiles.B),
  },
  events: app.events.map(stripLegacyEvent),
});