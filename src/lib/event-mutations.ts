import type { AppState, LogEvent } from "@/types";

export function appendEvents(state: AppState, additions: LogEvent[]): AppState {
  const next = structuredClone(state);
  const existing = new Set(next.events.map((event) => event.id));
  for (const original of additions) {
    if (existing.has(original.id)) continue;
    const event = { ...original };
    if (event.type === "diaper" && next.diaperStockManagementEnabled) {
      const size = event.diaperSizeUsed || next.profiles[event.babyId].diaperSize;
      const stock = next.profiles[event.babyId].diaperStockBySize[size] ?? 0;
      event.diaperSizeUsed = size;
      event.diaperStockConsumed = Math.min(1, Math.max(0, stock));
      for (const profile of Object.values(next.profiles)) profile.diaperStockBySize[size] = Math.max(0, stock - 1);
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
    for (const profile of Object.values(next.profiles)) {
      profile.diaperStockBySize[event.diaperSizeUsed] = (profile.diaperStockBySize[event.diaperSizeUsed] ?? 0) + event.diaperStockConsumed;
    }
  }
  next.events = next.events.filter((event) => !ids.has(event.id));
  return next;
}
