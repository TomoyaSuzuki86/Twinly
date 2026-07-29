import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
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
];

describe("WeeklyTimelineModal", () => {
  it("emphasizes the selected baby and keeps the other baby's records faint", () => {
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

    const kanataEvent = screen.getByLabelText("奏汰のミルク 09:00");
    const hinataEvent = screen.getByLabelText("日向のおしっこ 09:30");
    expect(kanataEvent.dataset.selected).toBe("true");
    expect(hinataEvent.dataset.selected).toBe("false");
    expect(hinataEvent.className).toContain("opacity-25");

    fireEvent.click(screen.getByRole("button", { name: "日向の記録を強調" }));

    expect(kanataEvent.dataset.selected).toBe("false");
    expect(hinataEvent.dataset.selected).toBe("true");
    expect(kanataEvent.className).toContain("opacity-25");
  });
});
