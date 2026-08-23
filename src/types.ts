export type BabyId = "A" | "B";
export type EventType =
  | "milk"
  | "solidFood"
  | "diaper"
  | "sleepStart"
  | "wake"
  | "daily"
  | "temperature"
  | "weight"
  | "height";
export type DiaperKind = "pee" | "poop" | "mix";
export type MilkMethod = "bottle" | "breast";

export type LogEvent = {
  id: string;
  babyId: BabyId;
  type: EventType;
  timestamp: number;
  milkMl?: number;
  milkMethod?: MilkMethod;
  diaperKind?: DiaperKind;
  temperature?: number;
  weight?: number;
  height?: number;
  note?: string;
};

export type BabyProfile = {
  babyId: BabyId;
  displayName: string;
  birthDate: string;
  diaperSize: string;
  diaperStockBySize: Record<string, number>;
  diaperPurchaseUrl?: string;
  iconEmoji?: string;
  iconGradient?: string;
  voiceAliases?: string[];
  milkGaugeWindowHours?: number;
  milkTargetMlOverride?: number | null;
  sleepTargetHoursOverride?: number | null;
};

export type AppState = {
  profiles: Record<BabyId, BabyProfile>;
  events: LogEvent[];
  diaperStockManagementEnabled: boolean;
  sleepManagementEnabled: boolean;
  ui: {
    lastViewedDate: string;
  };
};
