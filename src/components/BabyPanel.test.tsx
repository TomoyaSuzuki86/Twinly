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

    expect(screen.getByText("前回 09:45")).toBeTruthy();
    expect(screen.getByText("35分前")).toBeTruthy();
    expect(screen.getByText("前回 10:05 / 15分前")).toBeTruthy();
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

    fireEvent.click(screen.getByLabelText(/ミルク履歴を開く/));
    fireEvent.click(screen.getByLabelText(/おむつ履歴を開く/));

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
    expect(screen.getAllByText("2回")).toHaveLength(2);
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

    expect(screen.getByText("現時点")).toBeTruthy();
    expect(screen.getByText("過去7日平均")).toBeTruthy();
    expect(screen.getByText("200ml")).toBeTruthy();
    expect(screen.getByText("27ml")).toBeTruthy();
    expect(screen.getByText("過去7日平均より 173ml 多めです")).toBeTruthy();
  });

  it("shows diaper stock forecast details when an estimate is available", () => {
    renderPanel({
      lowStock: { size: "新生児", remaining: 8 },
      diaperEstimate: {
        size: "新生児",
        remaining: 8,
        dailyAverage: 2.3,
        daysRemaining: 3.4,
        estimatedRunOutDate: "2026-04-21",
        level: "warning",
      },
    });

    expect(screen.getByText("このペースだとあと約4日")).toBeTruthy();
    expect(screen.getByText("在庫切れ予測: 2026-04-21")).toBeTruthy();
    expect(screen.getByText("3日以内")).toBeTruthy();
  });

  it("shows an unknown forecast message when there is not enough diaper history", () => {
    renderPanel({
      diaperEstimate: {
        size: "新生児",
        remaining: 80,
        dailyAverage: 0,
        daysRemaining: null,
        estimatedRunOutDate: null,
        level: "unknown",
      },
    });

    expect(screen.getByText("在庫予測は準備中")).toBeTruthy();
    expect(screen.getByText("記録が増えると、在庫切れの予測を表示します。")).toBeTruthy();
  });
});
