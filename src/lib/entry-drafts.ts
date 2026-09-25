import { BabyId, DiaperKind, LogEvent } from "@/types";
import { pad2 } from "./utils";

export type MilkDraft = {
  milkMl: number;
  breastLeftMinutes?: number;
  breastRightMinutes?: number;
  note: string;
  timestamp: number;
};

export type DiaperDraft = {
  diaperKind: DiaperKind;
  note: string;
  selectedDiaperSize: string;
  timestamp: number;
};


export const createDefaultMilkDraft = (
  events: LogEvent[],
  babyId: BabyId,
  now: Date = new Date()
): MilkDraft => {
  const lastMilkEvent = events.reduce<LogEvent | undefined>((latest, event) => {
    if (event.babyId !== babyId || event.type !== "milk" || event.milkMethod === "breast" || typeof event.milkMl !== "number") return latest;
    if (!latest || event.timestamp > latest.timestamp) return event;
    return latest;
  }, undefined);
  const lastBreastEvent = events.reduce<LogEvent | undefined>((latest, event) => {
    if (event.babyId !== babyId || event.type !== "milk" || event.milkMethod !== "breast") return latest;
    if (!latest || event.timestamp > latest.timestamp) return event;
    return latest;
  }, undefined);

  return {
    milkMl: lastMilkEvent?.milkMl ?? 140,
    breastLeftMinutes: lastBreastEvent?.breastLeftMinutes ?? 10,
    breastRightMinutes: lastBreastEvent?.breastRightMinutes ?? 10,
    note: "",
    timestamp: now.getTime(),
  };
};

export const createDefaultDiaperDraft = (
  selectedDiaperSize: string,
  now: Date = new Date()
): DiaperDraft => ({
  diaperKind: "poop",
  note: "",
  selectedDiaperSize,
  timestamp: now.getTime(),
});

export const formatDateTimeLocalValue = (timestamp: number) => {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}T${pad2(
    date.getHours()
  )}:${pad2(date.getMinutes())}`;
};

export const parseDateTimeLocalValue = (value: string) => new Date(value).getTime();
