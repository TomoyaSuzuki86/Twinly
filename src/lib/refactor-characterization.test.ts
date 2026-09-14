import { describe, expect, it } from "vitest";
import { createInitialAppState } from "./app-state";
import { appendEvents } from "./event-mutations";
import { getAutoWakeTimestampForActivity } from "./sleep";
import {
  expandVoiceCommandTargets,
  toVoiceLogPayload,
  type VoiceCommand,
} from "./voice-command";
import {
  isSyncSettled,
  shouldShowAutomaticSyncSpinner,
} from "./manual-sync-state";
import type { LogEvent } from "@/types";

const event = (overrides: Partial<LogEvent> & Pick<LogEvent, "id" | "babyId" | "type" | "timestamp">): LogEvent => ({
  ...overrides,
});

describe("refactor characterization contracts", () => {
  it("keeps the manual-sync indicator active during initial load and sync activity", () => {
    const idle = { checking: false, routineStatus: false, syncMessage: undefined };
    const checking = { checking: true, routineStatus: false, syncMessage: undefined };

    expect(shouldShowAutomaticSyncSpinner(idle, true)).toBe(true);
    expect(shouldShowAutomaticSyncSpinner(idle, false)).toBe(false);
    expect(shouldShowAutomaticSyncSpinner(checking, false)).toBe(true);
    expect(isSyncSettled(idle)).toBe(true);
    expect(isSyncSettled(checking)).toBe(false);
  });

  it("places an automatic wake before a milk record while the baby is sleeping", () => {
    const sleepStartedAt = Date.parse("2026-09-14T10:00:00+09:00");
    const milkAt = Date.parse("2026-09-14T11:00:00+09:00");
    const sleepStart = event({ id: "sleep", babyId: "A", type: "sleepStart", timestamp: sleepStartedAt });

    expect(getAutoWakeTimestampForActivity([sleepStart], "A", milkAt, "milk"))
      .toBe(milkAt - 15 * 60 * 1000);
  });

  it("expands a two-baby voice milk command without changing each baby's amount", () => {
    const command: VoiceCommand = {
      kind: "event",
      babyId: "both",
      type: "milk",
      milkMlByBaby: { A: 150, B: 170 },
      timestamp: 1234,
      note: "voice: ミルク",
    };

    const payloads = expandVoiceCommandTargets(command).map(toVoiceLogPayload);

    expect(payloads).toEqual([
      expect.objectContaining({ babyId: "A", type: "milk", milkMl: 150, timestamp: 1234 }),
      expect.objectContaining({ babyId: "B", type: "milk", milkMl: 170, timestamp: 1234 }),
    ]);
  });

  it("keeps diaper stock shared between both baby profiles when a diaper event is appended", () => {
    const app = createInitialAppState(new Date("2026-09-14T00:00:00+09:00"));
    app.profiles.A.diaperSize = "M";
    app.profiles.B.diaperSize = "M";
    app.profiles.A.diaperStockBySize.M = 8;
    app.profiles.B.diaperStockBySize.M = 8;

    const next = appendEvents(app, [
      event({ id: "diaper", babyId: "A", type: "diaper", timestamp: 1, diaperKind: "pee", diaperSizeUsed: "M" }),
    ]);

    expect(next.profiles.A.diaperStockBySize.M).toBe(7);
    expect(next.profiles.B.diaperStockBySize.M).toBe(7);
    expect(next.events[0]).toEqual(expect.objectContaining({ diaperSizeUsed: "M", diaperStockConsumed: 1 }));
  });
});
