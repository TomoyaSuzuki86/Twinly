import type { AppState, LogEvent } from "@/types";

// No provider SDK types cross this boundary. A native/SQL adapter can implement it.
export type EventChange = { before?: LogEvent; after?: LogEvent; id: string };
export type SettingChange = { path: string[]; before: unknown; after: unknown; delta?: number };
export type AppMutation = { id: string; queuedAt?: number; events: EventChange[]; settings: SettingChange[] };
export type AppSnapshot = { app: AppState; fromCache: boolean; completeHistory: boolean };
export interface AppRepository {
  subscribe(onChange: (snapshot: AppSnapshot) => void, onError: (error: unknown) => void): () => void;
  commit(mutation: AppMutation): Promise<AppMutation>;
  validate?(mutation: AppMutation): void;
  loadAll(): Promise<AppState>;
}

export const sameValue = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  const left = Object.keys(a).filter((key) => (a as Record<string, unknown>)[key] !== undefined).sort();
  const right = Object.keys(b).filter((key) => (b as Record<string, unknown>)[key] !== undefined).sort();
  return left.length === right.length && left.every((key, i) => key === right[i] &&
    sameValue((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]));
};

export function createMutation(before: AppState, after: AppState, id: string, options: { relativeStock?: boolean } = {}): AppMutation {
  const previous = new Map(before.events.map((event) => [event.id, event]));
  const next = new Map(after.events.map((event) => [event.id, event]));
  const events: EventChange[] = [];
  for (const eventId of new Set([...previous.keys(), ...next.keys()])) {
    if (!sameValue(previous.get(eventId), next.get(eventId))) {
      events.push({ id: eventId, before: previous.get(eventId), after: next.get(eventId) });
    }
  }
  const settings: SettingChange[] = [];
  const walk = (left: unknown, right: unknown, path: string[]) => {
    if (sameValue(left, right)) return;
    if (left && right && typeof left === "object" && typeof right === "object" && !Array.isArray(right)) {
      for (const key of new Set([...Object.keys(left), ...Object.keys(right)])) {
        walk((left as Record<string, unknown>)[key], (right as Record<string, unknown>)[key], [...path, key]);
      }
    } else {
      // Stock consumption is relative; explicit stock/settings edits remain absolute.
      const delta = options.relativeStock !== false && events.length && path.includes("diaperStockBySize") &&
        typeof left === "number" && typeof right === "number" ? right - left : undefined;
      settings.push({ path, before: left, after: right, ...(delta === undefined ? {} : { delta }) });
    }
  };
  walk(before.profiles, after.profiles, ["profiles"]);
  walk(before.diaperStockManagementEnabled, after.diaperStockManagementEnabled, ["diaperStockManagementEnabled"]);
  walk(before.sleepManagementEnabled, after.sleepManagementEnabled, ["sleepManagementEnabled"]);
  return { id, events, settings };
}

export function applyMutation(state: AppState, mutation: AppMutation, checkConflicts = false): AppState {
  const result = structuredClone(state);
  const events = new Map(result.events.map((event) => [event.id, event]));
  for (const change of mutation.events) {
    if (checkConflicts && !sameValue(events.get(change.id), change.before)) {
      throw new Error("別の端末で同じ記録が変更されています。未同期データを書き出してから確認してください。");
    }
    if (change.after) events.set(change.id, change.after);
    else events.delete(change.id);
  }
  result.events = [...events.values()].sort((a, b) => b.timestamp - a.timestamp);
  for (const change of mutation.settings) {
    let target = result as unknown as Record<string, unknown>;
    for (const key of change.path.slice(0, -1)) target = target[key] as Record<string, unknown>;
    const key = change.path[change.path.length - 1];
    if (checkConflicts && change.delta === undefined && !sameValue(target[key], change.before)) {
      throw new Error("別の端末で同じ設定が変更されています。未同期データを書き出してから確認してください。");
    }
    if (change.delta !== undefined) target[key] = Math.max(0, Number(target[key] ?? 0) + change.delta);
    else if (change.after === undefined) delete target[key];
    else target[key] = change.after;
  }
  return result;
}

// Resolve the last available diaper against the transaction's current stock,
// so two devices cannot both later undo consumption of the same remaining unit.
export function reconcileStockConsumption(state: AppState, original: AppMutation): AppMutation {
  const mutation = structuredClone(original);
  const available = { ...state.profiles.A.diaperStockBySize };
  for (const change of mutation.events) {
    const event = change.after;
    if (change.before || !event?.diaperSizeUsed || !event.diaperStockConsumed) continue;
    const size = event.diaperSizeUsed;
    const actual = Math.min(event.diaperStockConsumed, Math.max(0, available[size] ?? 0));
    const correction = event.diaperStockConsumed - actual;
    event.diaperStockConsumed = actual;
    available[size] = Math.max(0, (available[size] ?? 0) - actual);
    for (const setting of mutation.settings) {
      if (setting.path.includes("diaperStockBySize") && setting.path[setting.path.length - 1] === size && setting.delta !== undefined) setting.delta += correction;
    }
  }
  return mutation;
}
