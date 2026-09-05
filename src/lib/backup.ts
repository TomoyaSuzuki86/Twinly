import type { AppState, EventType } from "@/types";
import { stripLegacyCalendarFields } from "./app-state";
const types = new Set<EventType>(["milk", "solidFood", "diaper", "sleepStart", "wake", "daily", "temperature", "weight", "height"]);

export function parseBackup(text: string): AppState {
  const value = JSON.parse(text, (key, item) => {
    if (["__proto__", "constructor", "prototype"].includes(key)) throw new Error("不正なバックアップです");
    return item;
  });
  if (!value || !Array.isArray(value.events) || !value.profiles?.A || !value.profiles?.B ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value.ui?.lastViewedDate || "")) throw new Error("バックアップの形式が正しくありません");
  const ids = new Set<string>();
  for (const event of value.events) {
    if (!event || typeof event.id !== "string" || !event.id || event.id.includes("/") || [".", ".."].includes(event.id) || /^__.*__$/.test(event.id) || event.id.length > 500 || ids.has(event.id) ||
      !["A", "B"].includes(event.babyId) || !types.has(event.type) || !Number.isFinite(event.timestamp) || event.timestamp < 0) {
      throw new Error("記録の形式またはIDが正しくありません");
    }
    ids.add(event.id);
  }
  for (const id of ["A", "B"]) {
    const profile = value.profiles[id];
    if (profile.babyId !== id || typeof profile.displayName !== "string" ||
      typeof profile.diaperSize !== "string" || !profile.diaperStockBySize ||
      Object.values(profile.diaperStockBySize).some((stock) => typeof stock !== "number" || !Number.isFinite(stock)) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(profile.birthDate || "")) throw new Error("赤ちゃんの設定が正しくありません");
  }
  return stripLegacyCalendarFields(value);
}
