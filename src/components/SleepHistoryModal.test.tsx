import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createInitialAppState } from "@/lib/app-state";
import type { LogEvent } from "@/types";
import { SleepHistoryModal } from "./SleepHistoryModal";

const now = new Date("2026-04-18T10:20:00+09:00");

describe("SleepHistoryModal", () => {
  afterEach(cleanup);

  it("shows useful sleep summary metrics and active sleep sessions", () => {
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
      {
        id: "sleep-b-1",
        babyId: "B",
        type: "sleepStart",
        timestamp: new Date("2026-04-18T08:30:00+09:00").getTime(),
      },
      {
        id: "wake-b-1",
        babyId: "B",
        type: "wake",
        timestamp: new Date("2026-04-18T09:00:00+09:00").getTime(),
      },
      {
        id: "sleep-b-2",
        babyId: "B",
        type: "sleepStart",
        timestamp: new Date("2026-04-18T10:10:00+09:00").getTime(),
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
    expect(screen.getByText("合計睡眠")).toBeTruthy();
    expect(screen.getByText("1日平均")).toBeTruthy();
    expect(screen.getByText("最長睡眠")).toBeTruthy();
    expect(screen.getByText("平均覚醒時間")).toBeTruthy();
    expect(screen.getByText("2人同時睡眠")).toBeTruthy();
    expect(screen.getByText("1時間50分")).toBeTruthy();
    expect(screen.getByText("1時間30分")).toBeTruthy();
    expect(screen.getByText("30分")).toBeTruthy();
    expect(screen.getByText("40分")).toBeTruthy();
    expect(screen.getByText("2回")).toBeTruthy();
    expect(screen.getByText(/睡眠中 20分/)).toBeTruthy();
    expect(screen.getByText(/睡眠 1時間30分/)).toBeTruthy();
  });
});
