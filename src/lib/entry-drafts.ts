import { BabyId, DiaperKind, LogEvent } from "@/types";
import { clamp, pad2 } from "./utils";

export type MilkDraft = {
  milkMl: number;
  note: string;
  timestamp: number;
};

export type DiaperDraft = {
  diaperKind: DiaperKind;
  note: string;
  selectedDiaperSize: string;
  timestamp: number;
};

export const stepMilkAmount = (current: number, direction: 1 | -1) => clamp(current + direction * 5, 0, 999);

export const createDefaultMilkDraft = (
  events: LogEvent[],
  babyId: BabyId,
  now: Date = new Date()
): MilkDraft => {
  const milkEvents = [...events]
    .filter((event) => event.babyId === babyId && event.type === "milk")
    .sort((a, b) => b.timestamp - a.timestamp);
  const lastMilkEvent = milkEvents[0];

  return {
    milkMl: lastMilkEvent?.milkMl ?? 140,
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
