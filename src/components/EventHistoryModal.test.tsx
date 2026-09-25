import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EventHistoryModal } from "./EventHistoryModal";
import { createInitialAppState } from "@/lib/app-state";
import type { LogEvent } from "@/types";

const now = new Date("2026-04-18T10:20:00+09:00");

describe("EventHistoryModal", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows milk progress versus the previous 7-day average in the milk history modal", () => {
    const app = createInitialAppState(now);
    const events: LogEvent[] = [
      {
        id: "today-1",
        babyId: "A",
        type: "milk",
        timestamp: new Date("2026-04-18T08:00:00+09:00").getTime(),
        milkMl: 120,
        milkMethod: "bottle",
      },
      {
        id: "today-2",
        babyId: "A",
        type: "milk",
        timestamp: new Date("2026-04-18T10:00:00+09:00").getTime(),
        milkMl: 80,
        milkMethod: "breast",
        breastLeftMinutes: 15,
        breastRightMinutes: 10,
      },
      {
        id: "food-today",
        babyId: "A",
        type: "solidFood",
        timestamp: new Date("2026-04-18T09:30:00+09:00").getTime(),
        note: "10倍がゆ 小さじ2",
      },
      {
        id: "d1",
        babyId: "A",
        type: "milk",
        timestamp: new Date("2026-04-17T09:00:00+09:00").getTime(),
        milkMl: 100,
        milkMethod: "bottle",
      },
      {
        id: "d2",
        babyId: "A",
        type: "milk",
        timestamp: new Date("2026-04-16T10:00:00+09:00").getTime(),
        milkMl: 90,
        milkMethod: "bottle",
      },
    ];

    render(
      <EventHistoryModal
        open
        onOpenChange={vi.fn()}
        historyType="milk"
        events={events}
        profile={app.profiles.A}
        activeDate="2026-04-18"
        now={now}
      />
    );

    expect(screen.getByRole("tab", { name: "ミルク" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "母乳" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "離乳食" })).toBeTruthy();
    expect(screen.getAllByText("120ml").length).toBeGreaterThan(0);
    expect(screen.getByText("27ml")).toBeTruthy();
    expect(screen.getByText(/93ml/)).toBeTruthy();

    fireEvent.mouseDown(screen.getByRole("tab", { name: "母乳" }), { button: 0, ctrlKey: false });
    expect(screen.getByText("授乳時間の推移")).toBeTruthy();
    expect(screen.getByText("母乳の記録")).toBeTruthy();
    expect(screen.getAllByText("15分").length).toBeGreaterThan(0);
    expect(screen.getAllByText("10分").length).toBeGreaterThan(0);

    fireEvent.mouseDown(screen.getByRole("tab", { name: "離乳食" }), { button: 0, ctrlKey: false });
    expect(screen.getByText("離乳食回数の推移")).toBeTruthy();
    expect(screen.getByText("離乳食の記録")).toBeTruthy();
    expect(screen.getByText("10倍がゆ 小さじ2")).toBeTruthy();
  });
});
