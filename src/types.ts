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

export type FamilyRelationship = "father" | "mother" | "grandfather" | "grandmother" | "other";
export type FamilyRole = "owner" | "member";

export type FamilyMember = {
  uid: string;
  nickname: string;
  relationship: FamilyRelationship;
  role: FamilyRole;
  status: "active" | "inactive";
  profileCompleted?: boolean;
};

export type FamilyInfo = {
  id: string;
  name: string;
  ownerUid: string;
};

export type LogEvent = {
  id: string;
  babyId: BabyId;
  type: EventType;
  timestamp: number;
  milkMl?: number;
  milkMethod?: MilkMethod;
  diaperKind?: DiaperKind;
  diaperSizeUsed?: string;
  diaperStockConsumed?: number;
  temperature?: number;
  weight?: number;
  height?: number;
  note?: string;
  createdByUid?: string;
  updatedByUid?: string;
  createdAt?: number;
  updatedAt?: number;
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
  activityLimitMinutesOverride?: number | null;
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
