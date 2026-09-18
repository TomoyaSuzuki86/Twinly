import type { AppState, BabyProfile } from "@/types";
import { mergeSharedAppState } from "@/lib/app-state";

const CACHE_PREFIX = "twinly-app-cache:";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const isProfile = (value: unknown, babyId: "A" | "B"): value is BabyProfile => {
  if (!isRecord(value)) return false;
  return value.babyId === babyId &&
    typeof value.displayName === "string" &&
    typeof value.birthDate === "string" &&
    typeof value.diaperSize === "string" &&
    isRecord(value.diaperStockBySize);
};

const isCachedAppState = (value: unknown): value is AppState => {
  if (!isRecord(value) || !isRecord(value.profiles) || !isRecord(value.ui)) return false;
  return isProfile(value.profiles.A, "A") &&
    isProfile(value.profiles.B, "B") &&
    Array.isArray(value.events) &&
    typeof value.ui.lastViewedDate === "string";
};

export const appStateCacheKey = (userId: string, familyId: string) =>
  `${CACHE_PREFIX}${userId}:${familyId}`;

export const readCachedAppState = (
  storage: Pick<Storage, "getItem" | "removeItem">,
  userId: string,
  familyId: string
): AppState | null => {
  const key = appStateCacheKey(userId, familyId);
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isCachedAppState(parsed)) {
      storage.removeItem(key);
      return null;
    }
    return mergeSharedAppState({
      profiles: parsed.profiles,
      events: parsed.events,
      diaperStockManagementEnabled: parsed.diaperStockManagementEnabled,
      sleepManagementEnabled: parsed.sleepManagementEnabled,
    }, parsed.ui);
  } catch {
    storage.removeItem(key);
    return null;
  }
};

export const writeCachedAppState = (
  storage: Pick<Storage, "setItem">,
  userId: string,
  familyId: string,
  app: AppState
) => {
  try {
    storage.setItem(appStateCacheKey(userId, familyId), JSON.stringify(app));
  } catch {
    // Startup cache is an optimization only. Outbox/Firestore remain authoritative.
  }
};
