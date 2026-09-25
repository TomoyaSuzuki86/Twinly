import type { LogEvent } from "@/types";
import { sameValue, type EventChange } from "./app-repository";

export const USER_EVENT_FIELDS: readonly (keyof LogEvent)[] = [
  "babyId",
  "type",
  "timestamp",
  "milkMl",
  "milkMethod",
  "breastLeftMinutes",
  "breastRightMinutes",
  "diaperKind",
  "diaperSizeUsed",
  "temperature",
  "weight",
  "height",
  "note",
  "customMemoId",
  "customMemoEmoji",
];

const setEventValue = (event: LogEvent, field: keyof LogEvent, value: unknown) => {
  const target = event as unknown as Record<string, unknown>;
  if (value === undefined) delete target[field as string];
  else target[field as string] = value;
};

// Concurrent Firestore writes are serialized by server transaction order.
// Only fields changed by the local mutation are projected over the latest remote record.
export function mergeEventChangeByServerOrder(
  change: EventChange,
  remote: LogEvent | undefined
): { confirmed?: EventChange } {
  const before = change.before;
  const local = change.after;

  if (!local) {
    if (!remote) return {};
    return { confirmed: { id: change.id, before: remote } };
  }

  if (!before) {
    if (remote && sameValue(remote, local)) return {};
    return { confirmed: { id: change.id, ...(remote ? { before: remote } : {}), after: local } };
  }

  if (!remote) return { confirmed: { id: change.id, after: local } };

  const merged = structuredClone(remote);
  let changed = false;
  for (const field of USER_EVENT_FIELDS) {
    if (sameValue(before[field], local[field])) continue;
    if (!sameValue(remote[field], local[field])) {
      setEventValue(merged, field, local[field]);
      changed = true;
    }
  }
  if (!changed) return {};
  if (local.updatedByUid !== undefined) merged.updatedByUid = local.updatedByUid;
  if (local.updatedAt !== undefined) merged.updatedAt = local.updatedAt;
  return { confirmed: { id: change.id, before: remote, after: merged } };
}
