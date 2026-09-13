import { AppState, BabyProfile, LogEvent } from "@/types";
import { fmtDate } from "./utils";

export type SharedAppState = Pick<AppState, "profiles" | "events"> & {
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

type LegacyAppState = Omit<AppState, "profiles" | "events" | "diaperStockManagementEnabled" | "sleepManagementEnabled"> & {
  profiles: {
    A: LegacyProfile;
    B: LegacyProfile;
  };
  events: LegacyLogEvent[];
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
    activityLimitMinutesOverride: null,
    sleepTargetHoursOverride: null,
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
    activityLimitMinutesOverride: null,
    sleepTargetHoursOverride: null,
  },
});

export const createInitialAppState = (now: Date = new Date()): AppState => ({
  profiles: createBaseProfiles(now),
  events: [],
  diaperStockManagementEnabled: true,
  sleepManagementEnabled: true,
  ui: {
    lastViewedDate: fmtDate(now),
  },
});

export const toSharedAppState = (app: AppState): SharedAppState => ({
  profiles: app.profiles,
  events: app.events,
  diaperStockManagementEnabled: app.diaperStockManagementEnabled,
  sleepManagementEnabled: app.sleepManagementEnabled,
});

const normalizeStoredProfile = (profile: StoredProfile): BabyProfile => ({
  ...profile,
  milkGaugeWindowHours: profile.milkGaugeWindowHours ?? 3,
  milkTargetMlOverride: profile.milkTargetMlOverride ?? null,
  activityLimitMinutesOverride: profile.activityLimitMinutesOverride ?? null,
  sleepTargetHoursOverride: profile.sleepTargetHoursOverride ?? null,
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

export const mergeSharedAppState = (shared: SharedAppState, ui: AppState["ui"]): AppState => ({
  ...shared,
  profiles: normalizeProfiles(shared.profiles),
  diaperStockManagementEnabled: shared.diaperStockManagementEnabled ?? true,
  sleepManagementEnabled: shared.sleepManagementEnabled ?? true,
  ui,
});

export const stripLegacyCalendarFields = (app: LegacyAppState): AppState => ({
  ...app,
  diaperStockManagementEnabled: app.diaperStockManagementEnabled ?? true,
  sleepManagementEnabled: app.sleepManagementEnabled ?? true,
  profiles: {
    A: stripLegacyProfile(app.profiles.A),
    B: stripLegacyProfile(app.profiles.B),
  },
  events: app.events.map(stripLegacyEvent),
});
