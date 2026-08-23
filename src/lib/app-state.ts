import { AppState, BabyId, LogEvent } from "@/types";
import { fmtDate } from "./utils";

export type SharedAppState = Pick<AppState, "profiles" | "events"> & {
  diaperStockManagementEnabled?: boolean;
};

type LegacyLogEvent = LogEvent & {
  calendarStatus?: "pending" | "synced" | "error";
  calendarEventId?: string;
};

type LegacyProfile = AppState["profiles"][BabyId] & {
  calendarName?: string;
  calendarId?: string;
};

type LegacyAppState = Omit<AppState, "profiles" | "events" | "diaperStockManagementEnabled"> & {
  profiles: Record<BabyId, LegacyProfile>;
  events: LegacyLogEvent[];
  diaperStockManagementEnabled?: boolean;
};

const demoBirthDate = (now: Date, daysAgo: number) => {
  const date = new Date(now);
  date.setDate(date.getDate() - daysAgo);
  return fmtDate(date);
};

const createBaseProfiles = (now: Date) =>
  ({
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
      sleepTargetHoursOverride: null,
    },
  }) as AppState["profiles"];

export const createInitialAppState = (now: Date = new Date()): AppState =>
  ({
    profiles: createBaseProfiles(now),
    events: [],
    diaperStockManagementEnabled: true,
    ui: {
      lastViewedDate: fmtDate(now),
    },
  }) as AppState;

export const toSharedAppState = (app: AppState): SharedAppState => ({
  profiles: app.profiles,
  events: app.events,
  diaperStockManagementEnabled: app.diaperStockManagementEnabled,
});

export const mergeSharedAppState = (shared: SharedAppState, ui: AppState["ui"]): AppState => ({
  ...shared,
  profiles: Object.fromEntries(
    (Object.entries(shared.profiles) as [BabyId, AppState["profiles"][BabyId]][]).map(([babyId, profile]) => [
      babyId,
      {
        ...profile,
        milkGaugeWindowHours: profile.milkGaugeWindowHours ?? 3,
        milkTargetMlOverride: profile.milkTargetMlOverride ?? null,
        sleepTargetHoursOverride: profile.sleepTargetHoursOverride ?? null,
      },
    ])
  ) as AppState["profiles"],
  diaperStockManagementEnabled: shared.diaperStockManagementEnabled ?? true,
  ui,
});

export const stripLegacyCalendarFields = (app: LegacyAppState): AppState => {
  const profiles = Object.fromEntries(
    (Object.entries(app.profiles) as [BabyId, LegacyProfile][]).map(([babyId, profile]) => {
      const { calendarId: _calendarId, calendarName: _calendarName, ...rest } = profile;
      return [
        babyId,
        {
          ...rest,
          milkGaugeWindowHours: rest.milkGaugeWindowHours ?? 3,
          milkTargetMlOverride: rest.milkTargetMlOverride ?? null,
          sleepTargetHoursOverride: rest.sleepTargetHoursOverride ?? null,
        },
      ];
    })
  ) as AppState["profiles"];

  const events = app.events.map((event) => {
    const {
      calendarEventId: _calendarEventId,
      calendarStatus: _calendarStatus,
      ...rest
    } = event;
    return rest;
  }) as AppState["events"];

  return {
    ...app,
    diaperStockManagementEnabled: app.diaperStockManagementEnabled ?? true,
    profiles,
    events,
  };
};
