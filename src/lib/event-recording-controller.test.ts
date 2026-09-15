import { describe, expect, it, vi } from "vitest";
import { createInitialAppState } from "./app-state";
import { createEventRecordingController } from "./event-recording-controller";

describe("createEventRecordingController", () => {
  it("does not write when there is no actor or no draft", () => {
    const updateApp = vi.fn(() => true);
    const scheduleUndo = vi.fn();
    const controller = createEventRecordingController({
      actorUid: undefined,
      existingEvents: [],
      idFactory: () => "event-1",
      updateApp,
      scheduleUndo,
    });

    expect(controller.recordEventDrafts([{ babyId: "A", type: "milk" }])).toBe(false);
    expect(updateApp).not.toHaveBeenCalled();
    expect(scheduleUndo).not.toHaveBeenCalled();
  });

  it("writes recorded events and schedules undo only after a successful update", () => {
    let state = createInitialAppState(new Date("2026-09-15T00:00:00Z"));
    const updateApp = vi.fn((updater: (previous: typeof state) => typeof state) => {
      state = updater(state);
      return true;
    });
    const scheduleUndo = vi.fn();
    const controller = createEventRecordingController({
      actorUid: "user-1",
      existingEvents: state.events,
      idFactory: () => "event-1",
      updateApp,
      scheduleUndo,
    });

    const undoOptions = { transcript: "ミルク120", retryVoice: true };
    expect(
      controller.recordEventDrafts(
        [{ babyId: "A", type: "milk", payload: { milkMl: 120, timestamp: 1234 }, autoWake: false }],
        undoOptions
      )
    ).toBe(true);

    expect(state.events).toHaveLength(1);
    expect(state.events[0]).toMatchObject({
      id: "event-1",
      babyId: "A",
      type: "milk",
      milkMl: 120,
      timestamp: 1234,
      createdByUid: "user-1",
      updatedByUid: "user-1",
    });
    expect(scheduleUndo).toHaveBeenCalledWith([state.events[0]], undoOptions);
  });

  it("does not schedule undo when persistence rejects the update", () => {
    const scheduleUndo = vi.fn();
    const controller = createEventRecordingController({
      actorUid: "user-1",
      existingEvents: [],
      idFactory: () => "event-1",
      updateApp: () => false,
      scheduleUndo,
    });

    expect(controller.recordEventDrafts([{ babyId: "A", type: "milk" }])).toBe(false);
    expect(scheduleUndo).not.toHaveBeenCalled();
  });
});
