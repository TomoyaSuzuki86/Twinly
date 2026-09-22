import { describe, expect, it } from "vitest";
import type { LogEvent } from "@/types";
import {
  isCareReminderResolved,
  type CareReminderMarker,
} from "./care-notification-reconciler";

const reminder = (overrides: Partial<CareReminderMarker> = {}): CareReminderMarker => ({
  babyId: "A",
  kind: "milk",
  eventId: "milk-1",
  occurredAt: 1_000,
  ...overrides,
});

const event = (overrides: Partial<LogEvent> = {}): LogEvent => ({
  id: "milk-1",
  babyId: "A",
  type: "milk",
  timestamp: 1_000,
  milkMl: 140,
  milkMethod: "bottle",
  ...overrides,
});

describe("care notification reconciliation", () => {
  it("keeps a reminder while its source care event is still the latest action", () => {
    expect(isCareReminderResolved(reminder(), [event()])).toBe(false);
  });

  it("resolves only after a newer matching care action is recorded", () => {
    const events = [
      event(),
      event({ id: "milk-2", timestamp: 2_000 }),
      event({ id: "diaper-1", type: "diaper", timestamp: 3_000, diaperKind: "pee" }),
      event({ id: "milk-b", babyId: "B", timestamp: 4_000 }),
    ];

    expect(isCareReminderResolved(reminder(), events)).toBe(true);
    expect(isCareReminderResolved(reminder({ babyId: "B" }), [event()])).toBe(false);
    expect(isCareReminderResolved(reminder({ kind: "diaper" }), [event()])).toBe(false);
  });

  it("resolves a sleep reminder only when sleep starts after the wake that triggered it", () => {
    const sleepReminder = reminder({
      kind: "sleep",
      eventId: "wake-1",
      occurredAt: 1_000,
    });

    expect(
      isCareReminderResolved(sleepReminder, [
        event({ id: "wake-1", type: "wake", timestamp: 1_000 }),
        event({ id: "wake-2", type: "wake", timestamp: 2_000 }),
      ])
    ).toBe(false);

    expect(
      isCareReminderResolved(sleepReminder, [
        event({ id: "wake-1", type: "wake", timestamp: 1_000 }),
        event({ id: "sleep-2", type: "sleepStart", timestamp: 2_000 }),
      ])
    ).toBe(true);
  });
});
