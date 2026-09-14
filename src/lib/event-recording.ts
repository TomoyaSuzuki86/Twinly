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
    id: idFactory(),
    babyId: draft.babyId,
    type: draft.type,
    ...draft.payload,
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
  const recorded: LogEvent[] = [];

  for (const draft of drafts) {
    const event = createRecordedEvent(draft, actorUid, idFactory, now);

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
  }

  return recorded;
};
