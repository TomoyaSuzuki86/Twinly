import { useEffect, useMemo, useRef, useState } from "react";
import type { AppState, DiaperKind, LogEvent, MilkMethod } from "@/types";
import type { AppModal } from "./use-app-modal-controller";
import { createEventRecordingController, isCareEventType } from "./event-recording-controller";
import { editEventGroup, removeEventGroup, removeEvents } from "./event-mutations";
import type { EventDraft } from "./event-recording";
import { reconcileDisplayedCareNotifications } from "./care-notification-reconciler";
import {
  expandVoiceCommandTargets,
  toVoiceLogPayload,
  type VoiceCommand,
} from "./voice-command";

export type UndoState = {
  open: boolean;
  events?: LogEvent[];
  transcript?: string;
  retryVoice?: boolean;
};

type UpdateApp = (
  updater: (previous: AppState) => AppState,
  options?: { absoluteSettings?: boolean }
) => boolean;

type UseEventOperationsOptions = {
  actorUid?: string;
  app: AppState;
  modal: AppModal;
  idFactory: () => string;
  updateApp: UpdateApp;
  retryVoiceInput: () => void;
};

export const createVoiceEventDrafts = (
  command: VoiceCommand,
  idFactory: () => string
): EventDraft[] => {
  const sharedDailyId = command.type === "daily" && command.babyId === "both" ? idFactory() : undefined;

  return expandVoiceCommandTargets(command).map((targetedCommand) => {
    const { babyId, type, ...payload } = toVoiceLogPayload(targetedCommand);
    return {
      babyId,
      type,
      payload: sharedDailyId ? { ...payload, sharedDailyId } : payload,
      autoWake: isCareEventType(type),
    };
  });
};

export const useEventOperations = ({
  actorUid,
  app,
  modal,
  idFactory,
  updateApp,
  retryVoiceInput,
}: UseEventOperationsOptions) => {
  const [undo, setUndo] = useState<UndoState>({ open: false });
  const undoTimerRef = useRef<number | null>(null);

  const clearUndoTimer = () => {
    if (undoTimerRef.current === null) return;
    window.clearTimeout(undoTimerRef.current);
    undoTimerRef.current = null;
  };

  const dismissUndo = () => setUndo({ open: false });
  const resetUndo = () => setUndo({ open: false });

  const scheduleUndo = (
    events: LogEvent | LogEvent[],
    options?: { transcript?: string; retryVoice?: boolean }
  ) => {
    clearUndoTimer();
    setUndo({ open: true, events: Array.isArray(events) ? events : [events], ...options });
    undoTimerRef.current = window.setTimeout(() => setUndo({ open: false }), 7000);
  };

  useEffect(
    () => () => {
      if (undoTimerRef.current !== null) window.clearTimeout(undoTimerRef.current);
    },
    []
  );

  useEffect(() => {
    void reconcileDisplayedCareNotifications(app.events);
  }, [app.events]);

  const {
    recordEventDrafts,
    addEvent,
    addEventFromPayload: handleAddEvent,
  } = createEventRecordingController({
    actorUid,
    existingEvents: app.events,
    idFactory,
    updateApp,
    scheduleUndo,
  });

  const onSaveMilk = (payload: {
    milkMl?: number;
    milkMethod: MilkMethod;
    note: string;
    timestamp: number;
    autoWake: boolean;
  }) => {
    if (!modal || modal.kind !== "milk") return;
    const { autoWake, ...eventPayload } = payload;
    addEvent(modal.babyId, "milk", eventPayload, { autoWake });
  };

  const onSaveSolidFood = (payload: {
    note: string;
    timestamp: number;
    autoWake: boolean;
  }) => {
    if (!modal || modal.kind !== "milk") return;
    const { autoWake, ...eventPayload } = payload;
    addEvent(modal.babyId, "solidFood", eventPayload, { autoWake });
  };

  const onSaveDiaper = (payload: {
    diaperKind: DiaperKind;
    note: string;
    selectedDiaperSize: string;
    timestamp: number;
    autoWake: boolean;
  }) => {
    if (!modal || modal.kind !== "diaper") return;
    const { diaperKind, note, selectedDiaperSize, timestamp, autoWake } = payload;
    addEvent(
      modal.babyId,
      "diaper",
      { diaperKind, note, timestamp, diaperSizeUsed: selectedDiaperSize },
      { autoWake }
    );
  };

  const handleVoiceCommand = (command: VoiceCommand) => {
    const drafts = createVoiceEventDrafts(command, idFactory);
    const transcript = command.note.startsWith("voice: ")
      ? command.note.slice("voice: ".length)
      : command.note;
    recordEventDrafts(drafts, { transcript, retryVoice: true });
  };

  const onSaveEdit = (eventId: string, payload: Partial<LogEvent>) => {
    const auditPayload = actorUid
      ? { ...payload, updatedByUid: actorUid, updatedAt: Date.now() }
      : payload;
    updateApp((previous) => editEventGroup(previous, eventId, auditPayload));
  };

  const saveSleepEventAt = (timestamp: number) => {
    if (!modal || modal.kind !== "sleepTime") return;
    addEvent(modal.babyId, modal.type, {
      timestamp,
      note: modal.type === "wake" ? "手動: 起床（時刻指定）" : "手動: 入眠（時刻指定）",
    });
  };

  const removeEvent = (eventId: string) => {
    if (!actorUid) return;
    updateApp((previous) => removeEventGroup(previous, eventId));
  };

  const undoLast = () => {
    if (!actorUid || !undo.events?.length) return false;
    const undoIds = new Set(undo.events.map((event) => event.id));
    if (!updateApp((previous) => removeEvents(previous, undoIds))) return false;

    setUndo({ open: false });
    clearUndoTimer();
    return true;
  };

  const retryLastVoiceInput = () => {
    undoLast();
    window.setTimeout(retryVoiceInput, 0);
  };

  const editTarget = useMemo(() => {
    if (!modal || modal.kind !== "edit") return null;
    return app.events.find((event) => event.id === modal.eventId) ?? null;
  }, [modal, app.events]);

  return {
    undo,
    dismissUndo,
    resetUndo,
    recordEventDrafts,
    handleAddEvent,
    onSaveMilk,
    onSaveSolidFood,
    onSaveDiaper,
    handleVoiceCommand,
    onSaveEdit,
    saveSleepEventAt,
    removeEvent,
    undoLast,
    retryLastVoiceInput,
    editTarget,
  };
};
