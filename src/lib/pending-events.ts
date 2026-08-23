import type { LogEvent } from "@/types";

const STORAGE_KEY_PREFIX = "twinly-pending-events:";

const storageKey = (uid: string) => `${STORAGE_KEY_PREFIX}${uid}`;

const isLogEvent = (value: unknown): value is LogEvent => {
  if (!value || typeof value !== "object") return false;
  const event = value as Partial<LogEvent>;
  return (
    typeof event.id === "string" &&
    (event.babyId === "A" || event.babyId === "B") &&
    typeof event.type === "string" &&
    typeof event.timestamp === "number" &&
    Number.isFinite(event.timestamp)
  );
};

export const loadPendingEvents = (uid: string): LogEvent[] => {
  try {
    const stored = localStorage.getItem(storageKey(uid));
    if (!stored) return [];
    const parsed = JSON.parse(stored) as unknown;
    return Array.isArray(parsed) ? parsed.filter(isLogEvent) : [];
  } catch {
    return [];
  }
};

export const storePendingEvents = (uid: string, events: LogEvent[]) => {
  try {
    const byId = new Map(loadPendingEvents(uid).map((event) => [event.id, event]));
    events.forEach((event) => byId.set(event.id, event));
    localStorage.setItem(storageKey(uid), JSON.stringify([...byId.values()]));
  } catch (error) {
    console.warn("[Twinly] Failed to preserve pending events locally.", error);
  }
};

export const removePendingEvents = (uid: string, eventIds: Iterable<string>) => {
  try {
    const removingIds = new Set(eventIds);
    const remaining = loadPendingEvents(uid).filter((event) => !removingIds.has(event.id));
    if (remaining.length) {
      localStorage.setItem(storageKey(uid), JSON.stringify(remaining));
    } else {
      localStorage.removeItem(storageKey(uid));
    }
  } catch (error) {
    console.warn("[Twinly] Failed to clear pending events locally.", error);
  }
};

export const mergePendingEvents = (remoteEvents: LogEvent[], pendingEvents: LogEvent[]) => {
  const byId = new Map(remoteEvents.map((event) => [event.id, event]));
  pendingEvents.forEach((event) => {
    if (!byId.has(event.id)) byId.set(event.id, event);
  });
  return [...byId.values()].sort((left, right) => right.timestamp - left.timestamp);
};
