import { describe, expect, it } from "vitest";
import { LogEvent } from "@/types";
import { buildWeeklyTimeline, getWeekEnd, getWeekStart, shiftWeek } from "./weekly-timeline";

const event = (
  id: string,
  timestamp: string,
  babyId: "A" | "B",
  type: "milk" | "diaper" | "weight" = "milk"
): LogEvent => ({
  id,
  babyId,
  type,
  timestamp: new Date(timestamp).getTime(),
  ...(type === "milk" ? { milkMl: 100, milkMethod: "bottle" as const } : {}),
  ...(type === "diaper" ? { diaperKind: "pee" as const } : {}),
  ...(type === "weight" ? { weight: 6.2 } : {}),
});

describe("weekly timeline", () => {
  it("uses Monday through Sunday as one page", () => {
    const start = getWeekStart(new Date("2026-07-29T12:00:00+09:00"));
    const end = getWeekEnd(start);

    expect(start.getDay()).toBe(1);
    expect(start.getDate()).toBe(27);
    expect(end.getDay()).toBe(0);
    expect(end.getDate()).toBe(2);
  });

  it("moves in seven-day pages", () => {
    const start = getWeekStart(new Date("2026-07-29T12:00:00+09:00"));

    expect(shiftWeek(start, -1).getDate()).toBe(20);
    expect(shiftWeek(start, 1).getDate()).toBe(3);
  });

  it("groups both babies chronologically and excludes non-timeline records", () => {
    const events: LogEvent[] = [
      event("b", "2026-07-28T10:30:00+09:00", "B", "diaper"),
      event("a", "2026-07-28T09:00:00+09:00", "A"),
      event("health", "2026-07-28T08:00:00+09:00", "A", "weight"),
      event("outside", "2026-07-20T09:00:00+09:00", "A"),
    ];

    const days = buildWeeklyTimeline(events, new Date("2026-07-29T12:00:00+09:00"));
    const tuesday = days.find((day) => day.key === "2026-07-28");

    expect(days).toHaveLength(7);
    expect(tuesday?.events.map((item) => item.id)).toEqual(["a", "b"]);
    expect(days.flatMap((day) => day.events)).toHaveLength(2);
  });
});
