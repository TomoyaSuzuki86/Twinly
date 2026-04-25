import type { ComponentProps } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BabyPanel } from "./BabyPanel";
import { createInitialAppState } from "@/lib/app-state";
import { LogEvent } from "@/types";

const baseNow = new Date("2026-04-18T10:20:00+09:00");

const renderPanel = ({
  events = [],
  allEvents = events,
  diaperEstimate = null,
  lowStock = null,
  onOpenHistory = vi.fn(),
}: {
  events?: LogEvent[];
  allEvents?: LogEvent[];
  diaperEstimate?: ComponentProps<typeof BabyPanel>["diaperEstimate"];
  lowStock?: ComponentProps<typeof BabyPanel>["lowStock"];
  onOpenHistory?: ComponentProps<typeof BabyPanel>["onOpenHistory"];
} = {}) => {
  const app = createInitialAppState(baseNow);

  return render(
    <BabyPanel
      profile={app.profiles.A}
      events={events}
      allEvents={allEvents}
      activeDate="2026-04-18"
      now={baseNow}
      lowStock={lowStock}
      diaperEstimate={diaperEstimate}
      onOpenHistory={onOpenHistory}
      onOpenModal={vi.fn()}
      onDeleteEvent={vi.fn()}
      onAddEvent={vi.fn()}
      lastWeight={null}
      lastHeight={null}
      themeDimmedBgColor="bg-background"
    />
  );
};

describe("BabyPanel", () => {
  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it("shows the last milk and diaper times together with elapsed minutes", () => {
    vi.useFakeTimers();
    vi.setSystemTime(baseNow);

    const events: LogEvent[] = [
      {
        id: "milk-1",
        babyId: "A",
        type: "milk",
        timestamp: new Date("2026-04-18T09:45:00+09:00").getTime(),
        milkMl: 80,
        milkMethod: "bottle",
      },
      {
        id: "diaper-1",
        babyId: "A",
        type: "diaper",
        timestamp: new Date("2026-04-18T10:05:00+09:00").getTime(),
        diaperKind: "pee",
      },
    ];

    renderPanel({ events });

    expect(screen.getByText((_, element) => element?.textContent === "前回 09:45")).toBeTruthy();
    expect(screen.getAllByText((_, element) => (element?.textContent ?? "").includes("35")).length).toBeGreaterThan(0);
    expect(
      screen.getAllByText((_, element) => {
        const text = element?.textContent ?? "";
        return text.includes("10:05") && text.includes("15");
      }).length
    ).toBeGreaterThan(0);
  });

  it("renders every event instead of limiting the list to four items", () => {
    const events: LogEvent[] = Array.from({ length: 6 }, (_, index) => ({
      id: `milk-${index + 1}`,
      babyId: "A",
      type: "milk",
      timestamp: new Date(`2026-04-18T0${index}:00:00+09:00`).getTime(),
      milkMl: 100 + index,
      milkMethod: "bottle",
      note: `event-${index + 1}`,
    }));

    renderPanel({ events });

    expect(screen.getByText("event-1")).toBeTruthy();
    expect(screen.getByText("event-6")).toBeTruthy();
    expect(screen.getAllByText(/event-/)).toHaveLength(6);
  });

  it("opens the corresponding history view from each summary card", () => {
    const onOpenHistory = vi.fn();

    renderPanel({ onOpenHistory });

    const historyButtons = screen.getAllByRole("button").filter((button) => {
      const name = button.getAttribute("aria-label") ?? "";
      return name.includes("history");
    });

    fireEvent.click(historyButtons[0]);
    fireEvent.click(historyButtons[1]);

    expect(onOpenHistory).toHaveBeenNthCalledWith(1, "milk", "A");
    expect(onOpenHistory).toHaveBeenNthCalledWith(2, "diaper", "A");
  });

  it("shows milk and diaper breakdown totals in the summary cards", () => {
    const events: LogEvent[] = [
      {
        id: "milk-bottle",
        babyId: "A",
        type: "milk",
        timestamp: new Date("2026-04-18T08:00:00+09:00").getTime(),
        milkMl: 120,
        milkMethod: "bottle",
      },
      {
        id: "milk-breast",
        babyId: "A",
        type: "milk",
        timestamp: new Date("2026-04-18T09:00:00+09:00").getTime(),
        milkMl: 80,
        milkMethod: "breast",
      },
      {
        id: "diaper-pee",
        babyId: "A",
        type: "diaper",
        timestamp: new Date("2026-04-18T09:30:00+09:00").getTime(),
        diaperKind: "pee",
      },
      {
        id: "diaper-mix",
        babyId: "A",
        type: "diaper",
        timestamp: new Date("2026-04-18T10:00:00+09:00").getTime(),
        diaperKind: "mix",
      },
      {
        id: "diaper-poop",
        babyId: "A",
        type: "diaper",
        timestamp: new Date("2026-04-18T10:10:00+09:00").getTime(),
        diaperKind: "poop",
      },
    ];

    renderPanel({ events });

    expect(screen.getByText("200")).toBeTruthy();
    expect(screen.getByText("120ml")).toBeTruthy();
    expect(screen.getByText("80ml")).toBeTruthy();
    expect(screen.getByText("4")).toBeTruthy();
    expect(screen.getAllByText((_, element) => element?.textContent === "2 times")).toHaveLength(2);
  });

  it("shows milk progress versus the previous 7-day average at the same time", () => {
    const allEvents: LogEvent[] = [
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

    renderPanel({ events: allEvents.slice(0, 2), allEvents });

    expect(screen.getByText("Now")).toBeTruthy();
    expect(screen.getByText("7d avg")).toBeTruthy();
    expect(screen.getByText("200ml")).toBeTruthy();
    expect(screen.getByText("27ml")).toBeTruthy();
    expect(screen.getByText("Above avg by 173ml")).toBeTruthy();
  });

  it("shows diaper stock forecast details when an estimate is available", () => {
    renderPanel({
      lowStock: { size: "Newborn", remaining: 8 },
      diaperEstimate: {
        size: "Newborn",
        remaining: 8,
        dailyAverage: 2.3,
        daysRemaining: 3.4,
        estimatedRunOutDate: "2026-04-21",
        level: "warning",
      },
    });

    expect(screen.getByText("4 days left at this pace")).toBeTruthy();
    expect(screen.getByText("Estimated runout: 2026-04-21")).toBeTruthy();
    expect(screen.getByText("3 days left")).toBeTruthy();
  });

  it("shows an unknown forecast message when there is not enough diaper history", () => {
    renderPanel({
      diaperEstimate: {
        size: "Newborn",
        remaining: 80,
        dailyAverage: 0,
        daysRemaining: null,
        estimatedRunOutDate: null,
        level: "unknown",
      },
    });

    expect(screen.getByText("Forecast unavailable")).toBeTruthy();
    expect(screen.getByText("More diaper records are needed before we can estimate the runout date.")).toBeTruthy();
  });
});
