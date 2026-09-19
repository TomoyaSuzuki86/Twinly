import type { AppState, BabyId, LogEvent } from "@/types";
import { adjustSharedDiaperStock, getSharedDiaperStock, setSharedDiaperStock } from "./diaper-stock";

export function appendEvents(state: AppState, additions: LogEvent[]): AppState {
  const next = structuredClone(state);
  const existing = new Set(next.events.map((event) => event.id));
  for (const original of additions) {
    if (existing.has(original.id)) continue;
    const event = { ...original };
    if (event.type === "diaper" && next.diaperStockManagementEnabled) {
      const size = event.diaperSizeUsed || next.profiles[event.babyId].diaperSize;
      const stock = getSharedDiaperStock(next.profiles, size);
      event.diaperSizeUsed = size;
      event.diaperStockConsumed = Math.min(1, Math.max(0, stock));
      next.profiles = setSharedDiaperStock(next.profiles, size, stock - 1);
      next.profiles[event.babyId].diaperSize = size;
    }
    existing.add(event.id);
    next.events.push(event);
  }
  next.events.sort((a, b) => b.timestamp - a.timestamp);
  return next;
}

export function removeEvents(state: AppState, ids: Set<string>): AppState {
  const next = structuredClone(state);
  for (const event of next.events) {
    if (!ids.has(event.id) || !event.diaperSizeUsed || !event.diaperStockConsumed) continue;
    // Use the original size even if the baby has since moved up a size.
    next.profiles = adjustSharedDiaperStock(
      next.profiles,
      event.diaperSizeUsed,
      event.diaperStockConsumed
    );
  }
  next.events = next.events.filter((event) => !ids.has(event.id));
  return next;
}

export function editEventGroup(
  state: AppState,
  eventId: string,
  payload: Partial<LogEvent>
): AppState {
  const originalEvent = state.events.find((event) => event.id === eventId);
  if (!originalEvent) return state;

  const sharedDailyId = originalEvent.sharedDailyId;
  const nextEvents = state.events.map((event) => {
    const sameRecord = event.id === eventId || Boolean(sharedDailyId && event.sharedDailyId === sharedDailyId);
    return sameRecord ? { ...event, ...payload } : event;
  });
  return { ...state, events: nextEvents };
}

export function getEventGroupIds(events: LogEvent[], eventId: string): Set<string> {
  const target = events.find((event) => event.id === eventId);
  if (!target?.sharedDailyId) return new Set([eventId]);

  return new Set(
    events
      .filter((event) => event.sharedDailyId === target.sharedDailyId)
      .map((event) => event.id)
  );
}

export function removeEventGroup(state: AppState, eventId: string): AppState {
  return removeEvents(state, getEventGroupIds(state.events, eventId));
}

export function updateSharedDiaperStock(
  state: AppState,
  babyId: BabyId,
  size: string,
  stock: number
): AppState {
  return { ...state, profiles: setSharedDiaperStock(state.profiles, size, stock) };
}
