import { describe, expect, it } from "vitest";
import {
  createDefaultDiaperDraft,
  createDefaultMilkDraft,
  formatDateTimeLocalValue,
  parseDateTimeLocalValue,
  stepMilkAmount,
} from "./entry-drafts";
import { LogEvent } from "@/types";

describe("createDefaultMilkDraft", () => {
  it("reuses the previous milk amount and method for the same baby", () => {
    const events: LogEvent[] = [
      {
        id: "milk-b",
        babyId: "B",
        type: "milk",
        timestamp: new Date("2026-04-18T06:00:00+09:00").getTime(),
        milkMl: 80,
        milkMethod: "breast",
      },
      {
        id: "milk-a",
        babyId: "A",
        type: "milk",
        timestamp: new Date("2026-04-18T07:00:00+09:00").getTime(),
        milkMl: 50,
        milkMethod: "bottle",
      },
    ];

    const now = new Date("2026-04-18T08:30:00+09:00");
    const draft = createDefaultMilkDraft(events, "A", now);

    expect(draft.milkMl).toBe(50);
    expect(draft.milkMethod).toBe("bottle");
    expect(draft.timestamp).toBe(now.getTime());
  });

  it("falls back to the default milk values when there is no previous milk record", () => {
    const now = new Date("2026-04-18T08:30:00+09:00");
    const draft = createDefaultMilkDraft([], "A", now);

    expect(draft.milkMl).toBe(140);
    expect(draft.milkMethod).toBe("breast");
    expect(draft.timestamp).toBe(now.getTime());
  });
});

describe("stepMilkAmount", () => {
  it("changes milk amount in 5ml increments", () => {
    expect(stepMilkAmount(50, 1)).toBe(55);
    expect(stepMilkAmount(50, -1)).toBe(45);
  });

  it("clamps milk amount between 0 and 999", () => {
    expect(stepMilkAmount(0, -1)).toBe(0);
    expect(stepMilkAmount(997, 1)).toBe(999);
  });
});

describe("createDefaultDiaperDraft", () => {
  it("starts diaper records with poop selected by default", () => {
    const now = new Date("2026-04-18T09:10:00+09:00");
    const draft = createDefaultDiaperDraft("S", now);

    expect(draft.diaperKind).toBe("poop");
    expect(draft.selectedDiaperSize).toBe("S");
    expect(draft.timestamp).toBe(now.getTime());
  });
});

describe("date time local helpers", () => {
  it("formats and parses the editable event timestamp without losing the minute value", () => {
    const timestamp = new Date("2026-04-18T14:25:00+09:00").getTime();
    const value = formatDateTimeLocalValue(timestamp);

    expect(value).toBe("2026-04-18T14:25");
    expect(parseDateTimeLocalValue(value)).toBe(timestamp);
  });
});
