import { cleanup, render, screen } from "@testing-library/react";
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

    expect(screen.getAllByText("200ml").length).toBeGreaterThan(0);
    expect(screen.getByText("27ml")).toBeTruthy();
    expect(screen.getByText(/173ml/)).toBeTruthy();
  });
});
