import type { AppState, BabyProfile, EventType, LogEvent } from "@/types";
import { mergeSharedAppState } from "@/lib/app-state";

const CACHE_PREFIX = "twinly-app-cache:";
const STARTUP_CACHE_DAYS = 8;
const STARTUP_CACHE_MAX_EVENTS = 400;

type IdleWindow = Window & {
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
};

type PendingCacheWrite = {
  app: AppState;
  storage: Pick<Storage, "setItem">;
  userId: string;
  familyId: string;
  handle: number;
  mode: "idle" | "timeout";
};

const pendingWrites = new Map<string, PendingCacheWrite>();

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
      customMemoPresets: parsed.customMemoPresets,
      diaperStockManagementEnabled: parsed.diaperStockManagementEnabled,
      sleepManagementEnabled: parsed.sleepManagementEnabled,
    }, parsed.ui);
  } catch {
    storage.removeItem(key);
    return null;
  }
};


const cacheSeedTypes: EventType[] = [
  "milk",
  "solidFood",
  "diaper",
  "sleepStart",
  "wake",
  "temperature",
  "weight",
  "height",
  "daily",
];

export const createStartupCacheState = (
  app: AppState,
  now = Date.now()
): AppState => {
  const cutoff = now - STARTUP_CACHE_DAYS * 86_400_000;
  const sorted = [...app.events].sort((a, b) => b.timestamp - a.timestamp);
  const recent = sorted.filter((event) => event.timestamp >= cutoff).slice(0, STARTUP_CACHE_MAX_EVENTS);
  const recentIds = new Set(recent.map((event) => event.id));
  const seeds = new Map<string, LogEvent>();

  for (const event of sorted) {
    if (event.timestamp >= cutoff || !cacheSeedTypes.includes(event.type)) continue;
    const key = `${event.babyId}:${event.type}`;
    if (!seeds.has(key)) seeds.set(key, event);
    if (seeds.size >= cacheSeedTypes.length * 2) break;
  }

  return {
    ...app,
    events: [...recent, ...[...seeds.values()].filter((event) => !recentIds.has(event.id))]
      .sort((a, b) => b.timestamp - a.timestamp),
  };
};

export const writeCachedAppState = (
  storage: Pick<Storage, "setItem">,
  userId: string,
  familyId: string,
  app: AppState
) => {
  try {
    const compact = createStartupCacheState(app);
    storage.setItem(appStateCacheKey(userId, familyId), JSON.stringify(compact));
  } catch {
    // Startup cache is an optimization only. Outbox/Firestore remain authoritative.
  }
};

export const scheduleCachedAppStateWrite = (
  storage: Pick<Storage, "setItem">,
  userId: string,
  familyId: string,
  app: AppState
) => {
  const key = appStateCacheKey(userId, familyId);
  const current = pendingWrites.get(key);
  if (current) {
    current.app = app;
    return;
  }

  const run = () => {
    const pending = pendingWrites.get(key);
    if (!pending) return;
    pendingWrites.delete(key);
    writeCachedAppState(pending.storage, pending.userId, pending.familyId, pending.app);
  };

  const idleWindow = typeof window !== "undefined" ? window as IdleWindow : null;
  if (idleWindow?.requestIdleCallback) {
    const handle = idleWindow.requestIdleCallback(run, { timeout: 1_500 });
    pendingWrites.set(key, { storage, userId, familyId, app, handle, mode: "idle" });
    return;
  }

  const handle = setTimeout(run, 120) as unknown as number;
  pendingWrites.set(key, { storage, userId, familyId, app, handle, mode: "timeout" });
};
