export type BabyId = "A" | "B";
export type EventType = "milk" | "diaper" | "daily" | "temperature" | "weight";
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
  note?: string;
  calendarStatus?: "pending" | "synced" | "error";
  calendarEventId?: string;
};

export type BabyProfile = {
  babyId: BabyId;
  displayName: string;
  birthDate: string;
  diaperSize: string;
  diaperStockBySize: Record<string, number>;
  diaperPurchaseUrl?: string;
  calendarName: string;
  calendarId?: string;
  iconEmoji?: string;
  iconGradient?: string;
};

export type AppState = {
  profiles: Record<BabyId, BabyProfile>;
  events: LogEvent[];
  ui: {
    lastViewedDate: string;
  };
};
