import type { ComponentProps } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BabyPanel } from "./BabyPanel";
import { createInitialAppState } from "@/lib/app-state";
import { LogEvent } from "@/types";

const baseNow = new Date("2026-04-18T10:20:00+09:00");

const renderPanel = ({
  events = [],
  latestEvents,
  logEvents,
  diaperEstimate = null,
  lowStock = null,
  onOpenHistory = vi.fn(),
  onOpenModal = vi.fn(),
  onAddEvent = vi.fn(),
  onOpenSleepTimeEditor = vi.fn(),
  sleepManagementEnabled = true,
}: {
  events?: LogEvent[];
  latestEvents?: LogEvent[];
  logEvents?: LogEvent[];
  diaperEstimate?: ComponentProps<typeof BabyPanel>["diaperEstimate"];
  lowStock?: ComponentProps<typeof BabyPanel>["lowStock"];
  onOpenHistory?: ComponentProps<typeof BabyPanel>["onOpenHistory"];
  onOpenModal?: ComponentProps<typeof BabyPanel>["onOpenModal"];
  onAddEvent?: ComponentProps<typeof BabyPanel>["onAddEvent"];
  onOpenSleepTimeEditor?: ComponentProps<typeof BabyPanel>["onOpenSleepTimeEditor"];
  sleepManagementEnabled?: boolean;
} = {}) => {
  const app = createInitialAppState(baseNow);

  return render(
    <BabyPanel
      profile={app.profiles.A}
      events={events}
      latestEvents={latestEvents}
      logEvents={logEvents}
      logDate="2026-04-18"
      now={baseNow}
      diaperStockManagementEnabled={app.diaperStockManagementEnabled}
      sleepManagementEnabled={sleepManagementEnabled}
      lowStock={lowStock}
      diaperEstimate={diaperEstimate}
      milkProgress={null}
      onOpenHistory={onOpenHistory}
      onOpenModal={onOpenModal}
      onAddEvent={onAddEvent}
      onOpenSleepTimeEditor={onOpenSleepTimeEditor}
      onOpenDailyReport={vi.fn()}
      onOpenHealthChart={vi.fn()}
      onOpenTimeline={vi.fn()}
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

    expect(screen.getByText("前回 09:45 / 35分前")).toBeTruthy();
    expect(screen.getByText("前回 10:05 / 15分前")).toBeTruthy();
  });

  it("uses all latest events for last milk and diaper times even when daily totals are empty", () => {
    vi.useFakeTimers();
    vi.setSystemTime(baseNow);

    const latestEvents: LogEvent[] = [
      {
        id: "diaper-yesterday",
        babyId: "A",
        type: "diaper",
        timestamp: new Date("2026-04-17T23:30:00+09:00").getTime(),
        diaperKind: "poop",
      },
      {
        id: "milk-yesterday",
        babyId: "A",
        type: "milk",
        timestamp: new Date("2026-04-17T23:00:00+09:00").getTime(),
        milkMl: 80,
        milkMethod: "bottle",
      },
    ];

    renderPanel({ events: [], latestEvents });

    expect(screen.getByText("前回 23:00 / 680分前")).toBeTruthy();
    expect(screen.getByText("前回 23:30 / 650分前")).toBeTruthy();
    expect(screen.getAllByText("0")).toBeTruthy();
  });

  it("uses the button backgrounds as milk and diaper timing gauges", () => {
    const latestEvents: LogEvent[] = [
      ...Array.from({ length: 7 }, (_, index) => ({
        id: `milk-${index}`,
        babyId: "A" as const,
        type: "milk" as const,
        timestamp: new Date(`2026-04-${String(11 + index).padStart(2, "0")}T09:00:00+09:00`).getTime(),
        milkMl: 140,
        milkMethod: "bottle" as const,
      })),
      {
        id: "milk-top-up",
        babyId: "A",
        type: "milk",
        timestamp: new Date("2026-04-18T10:10:00+09:00").getTime(),
        milkMl: 5,
        milkMethod: "bottle",
      },
      {
        id: "diaper-1",
        babyId: "A",
        type: "diaper",
        timestamp: new Date("2026-04-18T04:20:00+09:00").getTime(),
        diaperKind: "pee",
      },
      {
        id: "diaper-2",
        babyId: "A",
        type: "diaper",
        timestamp: new Date("2026-04-18T07:20:00+09:00").getTime(),
        diaperKind: "poop",
      },
    ];

    renderPanel({ latestEvents });

    expect(Number.parseInt(screen.getByTestId("milk-gauge-fill").style.width)).toBeGreaterThan(50);
    expect(screen.getByText(/あと \d+ ml/)).toBeTruthy();
    expect(screen.getByText(/\/ \d+ ml/)).toBeTruthy();
    expect(screen.getByTestId("diaper-gauge-fill").style.width).toBe("100%");
    expect(screen.getByRole("button", { name: /推定空腹度/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /交換必要度/ })).toBeTruthy();
  });

  it("keeps exactly two primary actions and opens meal entry from the food button", () => {
    const onOpenModal = vi.fn();

    renderPanel({ onOpenModal });

    const mealButton = screen.getByRole("button", { name: /食事を記録/ });
    const diaperButton = screen.getByRole("button", { name: /おむつを記録/ });
    expect(mealButton.className).toContain("select-none");
    expect(diaperButton.className).toContain("select-none");

    fireEvent.click(mealButton);
    expect(screen.getByText("食事")).toBeTruthy();
    expect(diaperButton).toBeTruthy();
    expect(screen.queryByRole("button", { name: /離乳食を記録/ })).toBeNull();
    expect(onOpenModal).toHaveBeenCalledWith("milk", { babyId: "A" });
  });

  it("toggles the sleep shortcut between sleep and wake", () => {
    const onAddEvent = vi.fn();
    const { rerender } = renderPanel({ onAddEvent });

    const sleepButton = screen.getByRole("switch", { name: /入眠を記録/ });
    expect(sleepButton.className).toContain("w-full");
    expect(sleepButton.className).toContain("select-none");
    expect(sleepButton.getAttribute("aria-checked")).toBe("false");
    expect(screen.getByText("起床中")).toBeTruthy();
    expect(screen.getByText("入眠 →")).toBeTruthy();
    expect(screen.getByText("活動時間 未記録")).toBeTruthy();
    expect(screen.getByText("前回睡眠 未記録")).toBeTruthy();
    expect(screen.queryByText(/今日の睡眠/)).toBeNull();
    expect(screen.getByTestId("sleep-gauge-fill").style.width).toBe("0%");
    fireEvent.click(sleepButton);
    expect(onAddEvent).toHaveBeenCalledWith(expect.objectContaining({ babyId: "A", type: "sleepStart" }));

    const app = createInitialAppState(baseNow);
    const sleepingEvents: LogEvent[] = [
      {
        id: "completed-sleep",
        babyId: "A",
        type: "sleepStart",
        timestamp: new Date("2026-04-18T08:00:00+09:00").getTime(),
      },
      {
        id: "completed-wake",
        babyId: "A",
        type: "wake",
        timestamp: new Date("2026-04-18T09:30:00+09:00").getTime(),
      },
      {
        id: "sleep",
        babyId: "A",
        type: "sleepStart",
        timestamp: baseNow.getTime() - 10 * 60 * 1000,
      },
    ];
    rerender(
      <BabyPanel
        profile={app.profiles.A}
        events={sleepingEvents}
        latestEvents={sleepingEvents}
        now={baseNow}
        diaperStockManagementEnabled
        sleepManagementEnabled
        lowStock={null}
        diaperEstimate={null}
        milkProgress={null}
        onOpenHistory={vi.fn()}
        onOpenModal={vi.fn()}
        onAddEvent={onAddEvent}
        onOpenSleepTimeEditor={vi.fn()}
        onOpenDailyReport={vi.fn()}
        onOpenHealthChart={vi.fn()}
        onOpenTimeline={vi.fn()}
        lastWeight={null}
        lastHeight={null}
        themeDimmedBgColor="bg-background"
      />
    );
    expect(screen.getByText("睡眠中")).toBeTruthy();
    expect(screen.getByText("← 起床")).toBeTruthy();
    expect(screen.getByRole("switch", { name: /起床を記録/ }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByText("睡眠時間 10分")).toBeTruthy();
    expect(screen.getByText("前回睡眠 1時間30分")).toBeTruthy();
    expect(screen.queryByText(/今日の睡眠/)).toBeNull();
    expect(screen.getByTestId("sleep-gauge-fill").style.width).toBe("27%");
    fireEvent.click(screen.getByRole("switch", { name: /起床を記録/ }));
    expect(onAddEvent).toHaveBeenCalledWith(expect.objectContaining({ babyId: "A", type: "wake" }));
  });

  it("opens the sleep time editor on long press without recording immediately", () => {
    vi.useFakeTimers();
    const onAddEvent = vi.fn();
    const onOpenSleepTimeEditor = vi.fn();
    renderPanel({ onAddEvent, onOpenSleepTimeEditor });

    const sleepButton = screen.getByRole("switch", { name: /入眠を記録/ });
    fireEvent.pointerDown(sleepButton);
    vi.advanceTimersByTime(550);
    fireEvent.pointerUp(sleepButton);
    fireEvent.click(sleepButton);

    expect(onOpenSleepTimeEditor).toHaveBeenCalledWith({ babyId: "A", type: "sleepStart" });
    expect(onAddEvent).not.toHaveBeenCalled();
  });

  it("hides the sleep shortcut when sleep management is disabled", () => {
    renderPanel({ sleepManagementEnabled: false });

    expect(screen.queryByRole("switch", { name: /入眠を記録/ })).toBeNull();
    expect(screen.queryByTestId("sleep-gauge-fill")).toBeNull();
    expect(screen.queryByText("睡眠回数")).toBeNull();
  });

  it("shows sleep totals, count, and average activity in the log summary", () => {
    const events: LogEvent[] = [
      {
        id: "sleep-1",
        babyId: "A",
        type: "sleepStart",
        timestamp: new Date("2026-04-18T01:00:00+09:00").getTime(),
      },
      {
        id: "wake-1",
        babyId: "A",
        type: "wake",
        timestamp: new Date("2026-04-18T02:30:00+09:00").getTime(),
      },
      {
        id: "sleep-2",
        babyId: "A",
        type: "sleepStart",
        timestamp: new Date("2026-04-18T04:00:00+09:00").getTime(),
      },
      {
        id: "wake-2",
        babyId: "A",
        type: "wake",
        timestamp: new Date("2026-04-18T05:00:00+09:00").getTime(),
      },
      {
        id: "sleep-3",
        babyId: "A",
        type: "sleepStart",
        timestamp: new Date("2026-04-18T07:00:00+09:00").getTime(),
      },
      {
        id: "wake-3",
        babyId: "A",
        type: "wake",
        timestamp: new Date("2026-04-18T08:00:00+09:00").getTime(),
      },
    ];

    renderPanel({ events, latestEvents: events, logEvents: events });

    expect(screen.getByText("3時間30分")).toBeTruthy();
    expect(screen.getByText("睡眠回数")).toBeTruthy();
    expect(screen.getByText("3回")).toBeTruthy();
    expect(screen.getByText("平均活動")).toBeTruthy();
    expect(screen.getByText("1時間45分")).toBeTruthy();
  });

  it("shows activity time since the latest completed wake", () => {
    const events: LogEvent[] = [
      {
        id: "sleep",
        babyId: "A",
        type: "sleepStart",
        timestamp: new Date("2026-04-18T08:00:00+09:00").getTime(),
      },
      {
        id: "wake",
        babyId: "A",
        type: "wake",
        timestamp: new Date("2026-04-18T09:30:00+09:00").getTime(),
      },
    ];

    renderPanel({ events, latestEvents: events });

    expect(screen.getByText("活動時間 50分 / 2時間30分")).toBeTruthy();
    expect(screen.getByTestId("sleep-gauge-fill").style.width).toBe("33%");
    expect(screen.queryByText(/前回入眠/)).toBeNull();
  });

  it("shows the completed sleep duration on a wake log and opens editing from the whole log", () => {
    const onOpenModal = vi.fn();
    const events: LogEvent[] = [
      {
        id: "wake",
        babyId: "A",
        type: "wake",
        timestamp: new Date("2026-04-18T09:30:00+09:00").getTime(),
      },
      {
        id: "sleep",
        babyId: "A",
        type: "sleepStart",
        timestamp: new Date("2026-04-18T08:00:00+09:00").getTime(),
      },
    ];

    renderPanel({ events, latestEvents: events, onOpenModal });

    const wakeLog = screen.getByRole("button", { name: /起床・睡眠 1時間30分.*を編集/ });
    fireEvent.click(wakeLog);
    expect(onOpenModal).toHaveBeenCalledWith("edit", { eventId: "wake" });
    expect(screen.queryByRole("button", { name: "delete" })).toBeNull();
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

    fireEvent.click(screen.getByLabelText(/食事履歴を開く/));
    fireEvent.click(screen.getByLabelText(/おむつ履歴を開く/));

    expect(onOpenHistory).toHaveBeenNthCalledWith(1, "milk", "A");
    expect(onOpenHistory).toHaveBeenNthCalledWith(2, "diaper", "A");
  });

  it("shows milk totals without method breakdowns and diaper totals", () => {
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
    expect(screen.queryByText("哺乳瓶")).toBeNull();
    expect(screen.queryByText("母乳")).toBeNull();
    expect(screen.getByText("4")).toBeTruthy();
    expect(screen.getAllByText("2回")).toHaveLength(3);
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
