import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { WeeklyTimelineModal } from "./WeeklyTimelineModal";
import { BabyProfile, LogEvent } from "@/types";

const profiles: Record<"A" | "B", BabyProfile> = {
  A: {
    babyId: "A",
    displayName: "奏汰",
    birthDate: "2026-04-02",
    diaperSize: "S",
    diaperStockBySize: { S: 80 },
    iconGradient: "from-violet-500 to-fuchsia-500",
  },
  B: {
    babyId: "B",
    displayName: "日向",
    birthDate: "2026-04-02",
    diaperSize: "S",
    diaperStockBySize: { S: 80 },
    iconGradient: "from-sky-500 to-cyan-400",
  },
};

const events: LogEvent[] = [
  {
    id: "milk-a",
    babyId: "A",
    type: "milk",
    milkMl: 100,
    milkMethod: "bottle",
    timestamp: new Date("2026-07-29T09:00:00+09:00").getTime(),
  },
  {
    id: "pee-b",
    babyId: "B",
    type: "diaper",
    diaperKind: "pee",
    timestamp: new Date("2026-07-29T09:30:00+09:00").getTime(),
  },
  {
    id: "poop-a",
    babyId: "A",
    type: "diaper",
    diaperKind: "poop",
    timestamp: new Date("2026-07-29T15:00:00+09:00").getTime(),
  },
];

afterEach(cleanup);

describe("WeeklyTimelineModal", () => {
  it("fits seven days and 24 hours into one grid with compact category markers", () => {
    render(
      <WeeklyTimelineModal
        open
        onOpenChange={() => undefined}
        events={events}
        profiles={profiles}
        initialDate="2026-07-29"
        initialBabyId="A"
        now={new Date("2026-07-29T12:00:00+09:00")}
      />
    );

    const grid = screen.getByRole("group", { name: "7日間24時間タイムライングリッド" });
    const kanataEvent = screen.getByLabelText("奏汰のミルク 09:00");
    const hinataEvent = screen.getByLabelText("日向のおしっこ 09:30");
    const poopEvent = screen.getByLabelText("奏汰のうんち 15:00");

    expect(grid.dataset.dayCount).toBe("7");
    expect(grid.dataset.hourCount).toBe("24");
    expect(screen.queryByText("食事/おむつ")).toBeNull();
    expect(kanataEvent.className).toContain("bg-blue-500");
    expect(poopEvent.className).toContain("bg-amber-400");
    expect(kanataEvent.dataset.selected).toBe("true");
    expect(hinataEvent.dataset.selected).toBe("false");
    expect(hinataEvent.className).toContain("opacity-25");

    fireEvent.click(screen.getByRole("button", { name: "日向の記録を強調" }));

    expect(kanataEvent.dataset.selected).toBe("false");
    expect(hinataEvent.dataset.selected).toBe("true");
    expect(kanataEvent.className).toContain("opacity-25");
    expect(hinataEvent.className).toContain("bg-cyan-300");
  });

  it("keeps two grouped lanes with fixed subtype positions regardless of event order", () => {
    const timestamp = new Date("2026-07-29T09:00:00+09:00").getTime();
    const overlappingEvents: LogEvent[] = [
      {
        id: "poop",
        babyId: "A",
        type: "diaper",
        diaperKind: "poop",
        timestamp,
      },
      {
        id: "milk",
        babyId: "A",
        type: "milk",
        milkMl: 100,
        milkMethod: "bottle",
        timestamp,
      },
      {
        id: "pee",
        babyId: "A",
        type: "diaper",
        diaperKind: "pee",
        timestamp,
      },
      {
        id: "solid-food",
        babyId: "A",
        type: "solidFood",
        note: "10倍がゆ",
        timestamp,
      },
    ];

    render(
      <WeeklyTimelineModal
        open
        onOpenChange={() => undefined}
        events={overlappingEvents}
        profiles={profiles}
        initialDate="2026-07-29"
        initialBabyId="A"
        now={new Date("2026-07-29T12:00:00+09:00")}
      />
    );

    expect(screen.getByLabelText("奏汰のミルク 09:00").style.left).toBe("20%");
    expect(screen.getByLabelText("奏汰の離乳食 09:00").style.left).toBe("30%");
    expect(screen.getByLabelText("奏汰のおしっこ 09:00").style.left).toBe("70%");
    expect(screen.getByLabelText("奏汰のうんち 09:00").style.left).toBe("80%");
  });

  it("keeps a lone poop marker in the poop lane", () => {
    render(
      <WeeklyTimelineModal
        open
        onOpenChange={() => undefined}
        events={[
          {
            id: "poop-only",
            babyId: "A",
            type: "diaper",
            diaperKind: "poop",
            timestamp: new Date("2026-07-29T15:00:00+09:00").getTime(),
          },
        ]}
        profiles={profiles}
        initialDate="2026-07-29"
        initialBabyId="A"
        now={new Date("2026-07-29T12:00:00+09:00")}
      />
    );

    expect(screen.getByLabelText("奏汰のうんち 15:00").style.left).toBe("80%");
  });

  it("shows completed sleep as a band and a per-day total", () => {
    const events: LogEvent[] = [
      {
        id: "sleep",
        babyId: "A",
        type: "sleepStart",
        timestamp: new Date("2026-07-29T01:00:00+09:00").getTime(),
      },
      {
        id: "wake",
        babyId: "A",
        type: "wake",
        timestamp: new Date("2026-07-29T03:30:00+09:00").getTime(),
      },
    ];

    render(
      <WeeklyTimelineModal
        open
        onOpenChange={() => undefined}
        events={events}
        profiles={profiles}
        initialDate="2026-07-29"
        initialBabyId="A"
        now={new Date("2026-07-29T12:00:00+09:00")}
      />
    );

    expect(screen.getByLabelText("奏汰の睡眠時間帯")).toBeTruthy();
    expect(screen.getByLabelText("2026-07-29の睡眠合計 2時間30分")).toBeTruthy();
  });
});
