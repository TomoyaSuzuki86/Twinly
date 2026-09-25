import type { BabyId, LogEvent } from "@/types";

export const getOtherTwinId = (babyId: BabyId): BabyId => (babyId === "A" ? "B" : "A");

export const supportsTwinCopyEvent = (event: LogEvent) =>
  event.type === "milk" ||
  event.type === "diaper" ||
  event.type === "daily" ||
  event.type === "sleepStart" ||
  event.type === "wake";

const resolved = <K extends keyof LogEvent>(
  event: LogEvent,
  payload: Partial<LogEvent>,
  key: K
): LogEvent[K] => (payload[key] !== undefined ? payload[key] : event[key]);

const normalizedNote = (value: string | undefined) => value ?? "";

export const hasTwinCopyDuplicate = (
  events: LogEvent[],
  event: LogEvent,
  payload: Partial<LogEvent>
) => {
  if (!supportsTwinCopyEvent(event)) return false;

  const targetBabyId = getOtherTwinId(event.babyId);
  const timestamp = resolved(event, payload, "timestamp");

  return events.some((candidate) => {
    if (
      candidate.babyId !== targetBabyId ||
      candidate.type !== event.type ||
      candidate.timestamp !== timestamp
    ) {
      return false;
    }

    if (event.type === "milk") {
      const milkMethod = resolved(event, payload, "milkMethod") ?? "bottle";
      const candidateMethod = candidate.milkMethod ?? "bottle";
      if (candidateMethod !== milkMethod) return false;
      if (milkMethod === "breast") {
        return (
          (candidate.breastLeftMinutes ?? 0) ===
            (resolved(event, payload, "breastLeftMinutes") ?? 0) &&
          (candidate.breastRightMinutes ?? 0) ===
            (resolved(event, payload, "breastRightMinutes") ?? 0)
        );
      }
      return (candidate.milkMl ?? 0) === (resolved(event, payload, "milkMl") ?? 0);
    }

    if (event.type === "diaper") {
      return candidate.diaperKind === resolved(event, payload, "diaperKind");
    }

    if (event.type === "daily") {
      return (
        normalizedNote(candidate.note) ===
          normalizedNote(resolved(event, payload, "note")) &&
        candidate.customMemoId === resolved(event, payload, "customMemoId") &&
        candidate.customMemoEmoji === resolved(event, payload, "customMemoEmoji")
      );
    }

    return true;
  });
};
