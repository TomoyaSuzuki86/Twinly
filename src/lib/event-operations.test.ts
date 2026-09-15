import { describe, expect, it } from "vitest";
import { createInitialAppState } from "./app-state";
import {
  editEventGroup,
  getEventGroupIds,
  removeEventGroup,
  updateSharedDiaperStock,
} from "./event-mutations";
import { createVoiceEventDrafts } from "./use-event-operations";
import type { LogEvent } from "@/types";

const event = (overrides: Partial<LogEvent> = {}): LogEvent => ({
  id: "event-a",
  babyId: "A",
  type: "daily",
  timestamp: 1000,
  note: "before",
  ...overrides,
});

describe("event group mutations", () => {
  it("edits every event in the same shared daily record and leaves unrelated events unchanged", () => {
    const state = createInitialAppState(new Date("2026-09-15T00:00:00Z"));
    state.events = [
      event({ id: "a", babyId: "A", sharedDailyId: "shared-1" }),
      event({ id: "b", babyId: "B", sharedDailyId: "shared-1" }),
      event({ id: "other", note: "untouched" }),
    ];

    const next = editEventGroup(state, "a", {
      note: "after",
      updatedByUid: "user-1",
      updatedAt: 2000,
    });

    expect(next.events.find(({ id }) => id === "a")).toMatchObject({ note: "after", updatedByUid: "user-1", updatedAt: 2000 });
    expect(next.events.find(({ id }) => id === "b")).toMatchObject({ note: "after", updatedByUid: "user-1", updatedAt: 2000 });
    expect(next.events.find(({ id }) => id === "other")?.note).toBe("untouched");
  });

  it("resolves and removes the whole shared record group", () => {
    const state = createInitialAppState(new Date("2026-09-15T00:00:00Z"));
    state.events = [
      event({ id: "a", sharedDailyId: "shared-1" }),
      event({ id: "b", babyId: "B", sharedDailyId: "shared-1" }),
      event({ id: "other" }),
    ];

    expect([...getEventGroupIds(state.events, "a")]).toEqual(["a", "b"]);
    const next = removeEventGroup(state, "a");
    expect(next.events.map(({ id }) => id)).toEqual(["other"]);
  });

  it("keeps diaper stock shared between both babies and clamps it at zero", () => {
    const state = createInitialAppState(new Date("2026-09-15T00:00:00Z"));
    const next = updateSharedDiaperStock(state, "A", "M", -3);

    expect(next.profiles.A.diaperStockBySize.M).toBe(0);
    expect(next.profiles.B.diaperStockBySize.M).toBe(0);
  });
});

describe("voice event draft conversion", () => {
  it("keeps both-target daily records linked by one shared id", () => {
    const ids = ["shared-voice"];
    const drafts = createVoiceEventDrafts(
      {
        kind: "event",
        babyId: "both",
        type: "daily",
        dailyNote: "今日も元気",
        timestamp: 1234,
        note: "voice: 今日も元気",
      },
      () => ids.shift() ?? "unexpected"
    );

    expect(drafts).toHaveLength(2);
    expect(drafts.map((draft) => draft.babyId)).toEqual(["A", "B"]);
    expect(drafts.every((draft) => draft.payload?.sharedDailyId === "shared-voice")).toBe(true);
    expect(drafts.every((draft) => draft.autoWake === false)).toBe(true);
  });
});
