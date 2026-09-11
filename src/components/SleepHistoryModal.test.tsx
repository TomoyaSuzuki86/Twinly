import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createInitialAppState } from "@/lib/app-state";
import type { LogEvent } from "@/types";
import { SleepHistoryModal } from "./SleepHistoryModal";

const now = new Date("2026-04-18T10:20:00+09:00");

describe("SleepHistoryModal", () => {
  beforeAll(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    );
  });

  afterEach(cleanup);

  it("shows useful sleep summary metrics and replaces the history list with a chart", () => {
    const app = createInitialAppState(now);
    const events: LogEvent[] = [
      {
        id: "sleep-1",
        babyId: "A",
        type: "sleepStart",
        timestamp: new Date("2026-04-18T08:00:00+09:00").getTime(),
      },
      {
        id: "wake-1",
        babyId: "A",
        type: "wake",
        timestamp: new Date("2026-04-18T09:30:00+09:00").getTime(),
      },
      {
        id: "sleep-2",
        babyId: "A",
        type: "sleepStart",
        timestamp: new Date("2026-04-18T10:00:00+09:00").getTime(),
      },
    ];

    render(
      <SleepHistoryModal
        open
        onOpenChange={vi.fn()}
        events={events}
        profile={app.profiles.A}
        now={now}
      />
    );

    expect(screen.getByText(`${app.profiles.A.displayName}の睡眠履歴`)).toBeTruthy();
    expect(screen.queryByText("合計睡眠")).toBeNull();
    expect(screen.queryByText("2人同時睡眠")).toBeNull();
    expect(screen.getByText("1日平均")).toBeTruthy();
    expect(screen.getByText("最長睡眠")).toBeTruthy();
    expect(screen.getByText("平均覚醒時間")).toBeTruthy();
    expect(screen.getByText("平均夜間睡眠")).toBeTruthy();
    expect(screen.getByText("平均夜間覚醒")).toBeTruthy();
    expect(screen.getByText("平均入眠時間")).toBeTruthy();
    expect(screen.getByText("平均起床時間")).toBeTruthy();
    expect(screen.getByText("2回")).toBeTruthy();
    expect(screen.getByText("30分")).toBeTruthy();
    expect(screen.getByTestId("longest-sleep-date").textContent).toBe("4/18");
    expect(screen.getByText("睡眠時間の推移")).toBeTruthy();
    expect(screen.getByTestId("sleep-history-chart")).toBeTruthy();
    expect(screen.queryByText("履歴一覧")).toBeNull();
    expect(screen.getByTestId("sleep-progress-comparison").textContent).toContain(
      "比較できる過去7日分の睡眠記録"
    );
  });

  it("calculates night sleep and night wakes using the 19:00 to 06:00 window", () => {
    const app = createInitialAppState(now);
    const events: LogEvent[] = [
      {
        id: "night-sleep-1",
        babyId: "A",
        type: "sleepStart",
        timestamp: new Date("2026-04-17T20:00:00+09:00").getTime(),
      },
      {
        id: "night-wake-1",
        babyId: "A",
        type: "wake",
        timestamp: new Date("2026-04-18T01:00:00+09:00").getTime(),
      },
      {
        id: "night-sleep-2",
        babyId: "A",
        type: "sleepStart",
        timestamp: new Date("2026-04-18T02:00:00+09:00").getTime(),
      },
      {
        id: "night-wake-2",
        babyId: "A",
        type: "wake",
        timestamp: new Date("2026-04-18T06:00:00+09:00").getTime(),
      },
      {
        id: "day-sleep",
        babyId: "A",
        type: "sleepStart",
        timestamp: new Date("2026-04-18T08:00:00+09:00").getTime(),
      },
      {
        id: "day-wake",
        babyId: "A",
        type: "wake",
        timestamp: new Date("2026-04-18T09:00:00+09:00").getTime(),
      },
    ];

    render(
      <SleepHistoryModal
        open
        onOpenChange={vi.fn()}
        events={events}
        profile={app.profiles.A}
        now={now}
      />
    );

    expect(screen.getByText(/夜間は19:00〜翌6:00/)).toBeTruthy();
    expect(screen.getByText("1時間17分")).toBeTruthy();
    expect(screen.getByText("0.1回/夜")).toBeTruthy();
    expect(screen.getByTestId("longest-sleep-date").textContent).toBe("4/17");
    expect(screen.getByText("20:00")).toBeTruthy();
    expect(screen.getByText("06:00")).toBeTruthy();
  });

  it("averages the first bedtime after 19:00 and first wake at or after 06:00 for each night", () => {
    const app = createInitialAppState(now);
    const events: LogEvent[] = [
      {
        id: "sleep-a",
        babyId: "A",
        type: "sleepStart",
        timestamp: new Date("2026-04-16T21:00:00+09:00").getTime(),
      },
      {
        id: "wake-a",
        babyId: "A",
        type: "wake",
        timestamp: new Date("2026-04-17T06:30:00+09:00").getTime(),
      },
      {
        id: "sleep-b",
        babyId: "A",
        type: "sleepStart",
        timestamp: new Date("2026-04-17T23:00:00+09:00").getTime(),
      },
      {
        id: "wake-b",
        babyId: "A",
        type: "wake",
        timestamp: new Date("2026-04-18T07:30:00+09:00").getTime(),
      },
    ];

    render(
      <SleepHistoryModal
        open
        onOpenChange={vi.fn()}
        events={events}
        profile={app.profiles.A}
        now={now}
      />
    );

    expect(screen.getByText("22:00")).toBeTruthy();
    expect(screen.getByText("07:00")).toBeTruthy();
  });

  it("compares today's sleep at the current time with the previous 7 days at the same cutoff", () => {
    const app = createInitialAppState(now);
    const events: LogEvent[] = [];

    for (let offset = 7; offset >= 1; offset -= 1) {
      const day = new Date("2026-04-18T00:00:00+09:00");
      day.setDate(day.getDate() - offset);
      const wake = new Date(day);
      wake.setHours(4, 0, 0, 0);
      events.push(
        {
          id: `history-sleep-${offset}`,
          babyId: "A",
          type: "sleepStart",
          timestamp: day.getTime(),
        },
        {
          id: `history-wake-${offset}`,
          babyId: "A",
          type: "wake",
          timestamp: wake.getTime(),
        }
      );
    }

    events.push(
      {
        id: "today-sleep",
        babyId: "A",
        type: "sleepStart",
        timestamp: new Date("2026-04-18T00:00:00+09:00").getTime(),
      },
      {
        id: "today-wake",
        babyId: "A",
        type: "wake",
        timestamp: new Date("2026-04-18T06:00:00+09:00").getTime(),
      }
    );

    render(
      <SleepHistoryModal
        open
        onOpenChange={vi.fn()}
        events={events}
        profile={app.profiles.A}
        now={now}
      />
    );

    expect(screen.getByTestId("sleep-progress-comparison").textContent).toBe(
      "過去7日平均より 2時間 多めです"
    );
  });
});
