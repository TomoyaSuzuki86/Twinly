import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BabyPanel } from "./BabyPanel";
import { createInitialAppState } from "@/lib/app-state";

const now = new Date("2026-04-18T10:20:00+09:00");

const noop = vi.fn();

describe("BabyPanel split-layout action isolation", () => {
  it("records and opens input only for the touched baby", () => {
    const app = createInitialAppState(now);
    const onAddEvent = vi.fn();
    const onOpenModal = vi.fn();

    render(
      <div>
        <section data-testid="split-panel-a">
          <BabyPanel
            profile={app.profiles.A}
            events={[]}
            latestEvents={[]}
            logEvents={[]}
            logDate="2026-04-18"
            now={now}
            diaperStockManagementEnabled={app.diaperStockManagementEnabled}
            sleepManagementEnabled
            lowStock={null}
            diaperEstimate={null}
            milkProgress={null}
            onOpenHistory={noop}
            onOpenModal={onOpenModal}
            onAddEvent={onAddEvent}
            onOpenSleepTimeEditor={noop}
            onOpenDailyReport={noop}
            onOpenHealthChart={noop}
            onOpenTimeline={noop}
            lastWeight={null}
            lastHeight={null}
            themeDimmedBgColor="bg-background"
          />
        </section>
        <section data-testid="split-panel-b">
          <BabyPanel
            profile={app.profiles.B}
            events={[]}
            latestEvents={[]}
            logEvents={[]}
            logDate="2026-04-18"
            now={now}
            diaperStockManagementEnabled={app.diaperStockManagementEnabled}
            sleepManagementEnabled
            lowStock={null}
            diaperEstimate={null}
            milkProgress={null}
            onOpenHistory={noop}
            onOpenModal={onOpenModal}
            onAddEvent={onAddEvent}
            onOpenSleepTimeEditor={noop}
            onOpenDailyReport={noop}
            onOpenHealthChart={noop}
            onOpenTimeline={noop}
            lastWeight={null}
            lastHeight={null}
            themeDimmedBgColor="bg-background"
          />
        </section>
      </div>
    );

    const panelA = within(screen.getByTestId("split-panel-a"));
    const panelB = within(screen.getByTestId("split-panel-b"));

    fireEvent.click(panelB.getByRole("switch", { name: /入眠を記録/ }));
    expect(onAddEvent).toHaveBeenCalledTimes(1);
    expect(onAddEvent).toHaveBeenLastCalledWith(
      expect.objectContaining({ babyId: "B", type: "sleepStart" })
    );

    fireEvent.click(panelA.getByRole("button", { name: /食事を記録/ }));
    expect(onOpenModal).toHaveBeenCalledTimes(1);
    expect(onOpenModal).toHaveBeenLastCalledWith("milk", { babyId: "A" });
  });
});
