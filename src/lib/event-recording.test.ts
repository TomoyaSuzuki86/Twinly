import { describe, expect, it } from "vitest";
import { buildRecordedEvents, type EventDraft } from "./event-recording";
import type { LogEvent } from "@/types";

const sleepStart = (babyId: "A" | "B", timestamp: number): LogEvent => ({
  id: `sleep-${babyId}`,
  babyId,
  type: "sleepStart",
  timestamp,
});

describe("buildRecordedEvents", () => {
  it("adds audit fields and keeps an explicit timestamp", () => {
    let id = 0;
    const events = buildRecordedEvents({
      existingEvents: [],
      drafts: [{ babyId: "A", type: "milk", payload: { timestamp: 1234, milkMl: 180 } }],
      actorUid: "user-1",
      idFactory: () => `event-${++id}`,
      now: () => 9999,
    });

    expect(events).toEqual([
      expect.objectContaining({
        id: "event-1",
        babyId: "A",
        type: "milk",
        timestamp: 1234,
        milkMl: 180,
        createdByUid: "user-1",
        updatedByUid: "user-1",
        createdAt: 9999,
        updatedAt: 9999,
      }),
    ]);
  });

  it("adds one automatic wake before a care event when requested", () => {
    let id = 0;
    const startedAt = Date.parse("2026-09-14T10:00:00+09:00");
    const milkAt = Date.parse("2026-09-14T11:00:00+09:00");
    const drafts: EventDraft[] = [
      { babyId: "A", type: "milk", payload: { timestamp: milkAt, milkMl: 180 }, autoWake: true },
    ];

    const events = buildRecordedEvents({
      existingEvents: [sleepStart("A", startedAt)],
      drafts,
      actorUid: "user-1",
      idFactory: () => `event-${++id}`,
      now: () => milkAt,
    });

    expect(events).toHaveLength(2);
    expect(events[0]).toEqual(expect.objectContaining({
      babyId: "A",
      type: "wake",
      timestamp: milkAt - 15 * 60 * 1000,
      note: "ミルク記録により自動起床",
    }));
    expect(events[1]).toEqual(expect.objectContaining({ babyId: "A", type: "milk", milkMl: 180 }));
  });

  it("does not add an automatic wake when the caller disables it", () => {
    let id = 0;
    const startedAt = Date.parse("2026-09-14T10:00:00+09:00");
    const milkAt = Date.parse("2026-09-14T11:00:00+09:00");

    const events = buildRecordedEvents({
      existingEvents: [sleepStart("A", startedAt)],
      drafts: [{ babyId: "A", type: "milk", payload: { timestamp: milkAt, milkMl: 180 }, autoWake: false }],
      actorUid: "user-1",
      idFactory: () => `event-${++id}`,
      now: () => milkAt,
    });

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual(expect.objectContaining({ type: "milk", milkMl: 180 }));
  });

  it("uses earlier events from the same batch when evaluating later drafts", () => {
    let id = 0;
    const sleepAt = Date.parse("2026-09-14T10:00:00+09:00");
    const milkAt = Date.parse("2026-09-14T10:30:00+09:00");
    const diaperAt = Date.parse("2026-09-14T10:40:00+09:00");

    const events = buildRecordedEvents({
      existingEvents: [sleepStart("A", sleepAt)],
      drafts: [
        { babyId: "A", type: "milk", payload: { timestamp: milkAt }, autoWake: true },
        { babyId: "A", type: "diaper", payload: { timestamp: diaperAt, diaperKind: "pee" }, autoWake: true },
      ],
      actorUid: "user-1",
      idFactory: () => `event-${++id}`,
      now: () => diaperAt,
    });

    expect(events.filter((event) => event.type === "wake")).toHaveLength(1);
  });
});
