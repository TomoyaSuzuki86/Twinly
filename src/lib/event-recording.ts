import type { BabyId, EventType, LogEvent } from "@/types";
import { getAutoWakeTimestampForActivity, type AutoWakeActivityType } from "./sleep";

export type EventDraft = {
  babyId: BabyId;
  type: EventType;
  payload?: Partial<LogEvent>;
  autoWake?: boolean;
};

type BuildRecordedEventsOptions = {
  existingEvents: LogEvent[];
  drafts: EventDraft[];
  actorUid?: string;
  idFactory: () => string;
  now?: () => number;
};

const autoWakeActivityLabels: Record<AutoWakeActivityType, string> = {
  milk: "ミルク",
  solidFood: "離乳食",
  diaper: "おむつ",
};

const isAutoWakeActivity = (type: EventType): type is AutoWakeActivityType =>
  type === "milk" || type === "solidFood" || type === "diaper";

const createRecordedEvent = (
  draft: Omit<EventDraft, "autoWake">,
  actorUid: string | undefined,
  idFactory: () => string,
  now: () => number
): LogEvent => {
  const payloadTimestamp = draft.payload?.timestamp;
  const timestamp =
    typeof payloadTimestamp === "number" && Number.isFinite(payloadTimestamp)
      ? payloadTimestamp
      : now();
  const recordedAt = now();

  return {
    ...draft.payload,
    // Routing and audit fields are authoritative. A stale or malformed payload must
    // never redirect a record to the other baby (especially when both panels are mounted).
    id: idFactory(),
    babyId: draft.babyId,
    type: draft.type,
    createdByUid: actorUid,
    updatedByUid: actorUid,
    createdAt: recordedAt,
    updatedAt: recordedAt,
    timestamp,
  };
};

export const buildRecordedEvents = ({
  existingEvents,
  drafts,
  actorUid,
  idFactory,
  now = Date.now,
}: BuildRecordedEventsOptions): LogEvent[] => {
  // Voice input historically materialized all requested events before deriving
  // auto-wake records. Preserve that audit/id ordering while centralizing the rule.
  const baseEvents = drafts.map((draft) =>
    createRecordedEvent(draft, actorUid, idFactory, now)
  );
  const recorded: LogEvent[] = [];

  baseEvents.forEach((event, index) => {
    const draft = drafts[index];
    if (draft.autoWake && isAutoWakeActivity(event.type)) {
      const autoWakeTimestamp = getAutoWakeTimestampForActivity(
        [...recorded, ...existingEvents],
        event.babyId,
        event.timestamp,
        event.type
      );
      if (autoWakeTimestamp !== null) {
        recorded.push(
          createRecordedEvent(
            {
              babyId: event.babyId,
              type: "wake",
              payload: {
                timestamp: autoWakeTimestamp,
                note: `${autoWakeActivityLabels[event.type]}記録により自動起床`,
              },
            },
            actorUid,
            idFactory,
            now
          )
        );
      }
    }

    recorded.push(event);
  });

  return recorded;
};