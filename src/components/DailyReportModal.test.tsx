import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createInitialAppState } from "@/lib/app-state";
import type { LogEvent } from "@/types";
import { DailyReportModal } from "./DailyReportModal";

describe("DailyReportModal", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("groups shared twin memos, hides age labels, and deletes from long press confirmation", () => {
    vi.useFakeTimers();
    const app = createInitialAppState(new Date("2026-09-26T00:00:00+09:00"));
    app.profiles.A.displayName = "奏汰";
    app.profiles.B.displayName = "日向";

    const timestamp = new Date("2026-09-25T20:00:00+09:00").getTime();
    const events: LogEvent[] = [
      {
        id: "daily-a",
        babyId: "A",
        type: "daily",
        timestamp,
        note: "共通メモ",
        sharedDailyId: "shared-1",
      },
      {
        id: "daily-b",
        babyId: "B",
        type: "daily",
        timestamp,
        note: "共通メモ",
        sharedDailyId: "shared-1",
      },
    ];
    const onDelete = vi.fn();

    render(
      <DailyReportModal
        open
        onOpenChange={vi.fn()}
        events={events}
        profiles={app.profiles}
        onDelete={onDelete}
      />
    );

    expect(screen.getAllByText("共通メモ")).toHaveLength(1);
    expect(screen.getByLabelText("奏汰 & 日向の共通メモ")).toBeTruthy();
    expect(screen.queryByText(/生後\d/)).toBeNull();
    expect(screen.getByText("メモを長押しすると削除できます。")).toBeTruthy();

    fireEvent.pointerDown(screen.getByTestId("daily-report-shared:shared-1"), {
      clientX: 20,
      clientY: 20,
    });
    act(() => {
      vi.advanceTimersByTime(550);
    });

    expect(screen.getByText("このメモを削除しますか？")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "削除する" }));

    expect(onDelete).toHaveBeenCalledWith("daily-a");
  });
});
