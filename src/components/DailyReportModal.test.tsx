import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createInitialAppState } from "@/lib/app-state";
import type { LogEvent } from "@/types";
import { DailyReportModal } from "./DailyReportModal";

describe("DailyReportModal", () => {
  afterEach(cleanup);

  it("groups shared twin memos, hides age labels, and opens the existing editor from a row", () => {
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
    const onSelectEvent = vi.fn();

    render(
      <DailyReportModal
        open
        onOpenChange={vi.fn()}
        events={events}
        profiles={app.profiles}
        onSelectEvent={onSelectEvent}
      />
    );

    expect(screen.getAllByText("共通メモ")).toHaveLength(1);
    expect(screen.getByLabelText("奏汰 & 日向の共通メモ")).toBeTruthy();
    expect(screen.queryByText(/生後\d/)).toBeNull();
    expect(screen.queryByText("メモを長押しすると削除できます。")).toBeNull();

    fireEvent.click(screen.getByTestId("daily-report-shared:shared-1"));

    expect(onSelectEvent).toHaveBeenCalledWith({
      eventId: "daily-a",
      sharedDailyId: "shared-1",
    });
  });

  it("groups a copied memo whose original lost sharedDailyId during sync and requests repair", () => {
    const app = createInitialAppState(new Date("2026-09-26T00:00:00+09:00"));
    app.profiles.A.displayName = "奏汰";
    app.profiles.B.displayName = "日向";
    const timestamp = new Date("2026-09-26T03:34:00+09:00").getTime();
    const events: LogEvent[] = [
      {
        id: "original-a",
        babyId: "A",
        type: "daily",
        timestamp,
        note: "両方起きたけど、両方再入眠した",
      },
      {
        id: "copy-b",
        babyId: "B",
        type: "daily",
        timestamp,
        note: "両方起きたけど、両方再入眠した",
        sharedDailyId: "shared-copy",
      },
    ];
    const onSelectEvent = vi.fn();

    render(
      <DailyReportModal
        open
        onOpenChange={vi.fn()}
        events={events}
        profiles={app.profiles}
        onSelectEvent={onSelectEvent}
      />
    );

    expect(screen.getAllByText("両方起きたけど、両方再入眠した")).toHaveLength(1);
    expect(screen.getByLabelText("奏汰 & 日向の共通メモ")).toBeTruthy();

    fireEvent.click(screen.getByTestId("daily-report-shared:shared-copy"));
    expect(onSelectEvent).toHaveBeenCalledWith({
      eventId: "copy-b",
      repairEventId: "original-a",
      sharedDailyId: "shared-copy",
    });
  });
});
