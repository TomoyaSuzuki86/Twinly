import { describe, expect, it } from "vitest";
import {
  createDefaultDiaperDraft,
  createDefaultMilkDraft,
  formatDateTimeLocalValue,
  parseDateTimeLocalValue,
} from "./entry-drafts";
import { LogEvent } from "@/types";

describe("createDefaultMilkDraft", () => {
  it("reuses the previous milk amount for the same baby", () => {
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
        id: "milk-a-breast",
        babyId: "A",
        type: "milk",
        timestamp: new Date("2026-04-18T06:30:00+09:00").getTime(),
        milkMl: 90,
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
      {
        id: "milk-a-latest-breast",
        babyId: "A",
        type: "milk",
        timestamp: new Date("2026-04-18T08:00:00+09:00").getTime(),
        milkMethod: "breast",
      },
    ];

    const now = new Date("2026-04-18T08:30:00+09:00");
    const draft = createDefaultMilkDraft(events, "A", now);

    expect(draft.milkMl).toBe(50);
    expect(draft.timestamp).toBe(now.getTime());
  });

  it("falls back to the default milk values when there is no previous milk record", () => {
    const now = new Date("2026-04-18T08:30:00+09:00");
    const draft = createDefaultMilkDraft([], "A", now);

    expect(draft.milkMl).toBe(140);
    expect(draft.timestamp).toBe(now.getTime());
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
