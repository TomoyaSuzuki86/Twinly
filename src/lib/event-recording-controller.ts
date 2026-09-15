import type { AppState, BabyId, EventType, LogEvent } from "@/types";
import { appendEvents } from "./event-mutations";
import { buildRecordedEvents, type EventDraft } from "./event-recording";

export type EventRecordingUndoOptions = {
  transcript?: string;
  retryVoice?: boolean;
};

type EventRecordingControllerOptions = {
  actorUid?: string;
  existingEvents: LogEvent[];
  idFactory: () => string;
  updateApp: (updater: (previous: AppState) => AppState) => boolean;
  scheduleUndo: (events: LogEvent[], options?: EventRecordingUndoOptions) => void;
};

export const isCareEventType = (type: EventType) =>
  type === "milk" || type === "solidFood" || type === "diaper";

export const createEventRecordingController = ({
  actorUid,
  existingEvents,
  idFactory,
  updateApp,
  scheduleUndo,
}: EventRecordingControllerOptions) => {
  const recordEventDrafts = (
    drafts: EventDraft[],
    undoOptions?: EventRecordingUndoOptions
  ) => {
    if (!actorUid || !drafts.length) return false;

    const events = buildRecordedEvents({
      existingEvents,
      drafts,
      actorUid,
      idFactory,
    });
    if (!events.length) return false;
    if (!updateApp((previous) => appendEvents(previous, events))) return false;

    scheduleUndo(events, undoOptions);
    return true;
  };

  const addEvent = (
    babyId: BabyId,
    type: EventType,
    payload?: Partial<LogEvent>,
    options: { autoWake?: boolean } = {}
  ) =>
    recordEventDrafts([
      {
        babyId,
        type,
        payload,
        autoWake: isCareEventType(type) && options.autoWake !== false,
      },
    ]);

  const addEventFromPayload = (
    eventData: Omit<
      LogEvent,
      "id" | "timestamp" | "createdByUid" | "updatedByUid" | "createdAt" | "updatedAt"
    >
  ) => {
    const { babyId, type, ...payload } = eventData;
    return addEvent(babyId, type, payload);
  };

  return {
    recordEventDrafts,
    addEvent,
    addEventFromPayload,
  };
};
