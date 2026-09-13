import type { AppState, EventType } from "@/types";
import { stripLegacyCalendarFields } from "./app-state";

const EVENT_TYPES = new Set<EventType>([
  "milk",
  "solidFood",
  "diaper",
  "sleepStart",
  "wake",
  "daily",
  "temperature",
  "weight",
  "height",
]);
const BLOCKED_JSON_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const RESERVED_EVENT_ID_PATTERN = /^__.*__$/;

const isValidEventId = (id: unknown, seenIds: Set<string>): id is string =>
  typeof id === "string" &&
  id.length > 0 &&
  id.length <= 500 &&
  !id.includes("/") &&
  id !== "." &&
  id !== ".." &&
  !RESERVED_EVENT_ID_PATTERN.test(id) &&
  !seenIds.has(id);

const isValidProfile = (profile: any, babyId: "A" | "B") =>
  profile?.babyId === babyId &&
  typeof profile.displayName === "string" &&
  typeof profile.diaperSize === "string" &&
  Boolean(profile.diaperStockBySize) &&
  Object.values(profile.diaperStockBySize).every(
    (stock) => typeof stock === "number" && Number.isFinite(stock)
  ) &&
  DATE_PATTERN.test(profile.birthDate || "");

export function parseBackup(text: string): AppState {
  const value = JSON.parse(text, (key, item) => {
    if (BLOCKED_JSON_KEYS.has(key)) throw new Error("不正なバックアップです");
    return item;
  });

  if (
    !value ||
    !Array.isArray(value.events) ||
    !value.profiles?.A ||
    !value.profiles?.B ||
    !DATE_PATTERN.test(value.ui?.lastViewedDate || "")
  ) {
    throw new Error("バックアップの形式が正しくありません");
  }

  const seenIds = new Set<string>();
  for (const event of value.events) {
    if (
      !event ||
      !isValidEventId(event.id, seenIds) ||
      (event.babyId !== "A" && event.babyId !== "B") ||
      !EVENT_TYPES.has(event.type) ||
      !Number.isFinite(event.timestamp) ||
      event.timestamp < 0
    ) {
      throw new Error("記録の形式またはIDが正しくありません");
    }
    seenIds.add(event.id);
  }

  if (!isValidProfile(value.profiles.A, "A") || !isValidProfile(value.profiles.B, "B")) {
    throw new Error("赤ちゃんの設定が正しくありません");
  }

  return stripLegacyCalendarFields(value);
}
