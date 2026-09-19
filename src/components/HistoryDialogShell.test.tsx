import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HistoryDialogShell } from "./HistoryDialogShell";
import { createInitialAppState } from "@/lib/app-state";

const touchList = (x: number, y: number) => {
  const touch = { clientX: x, clientY: y };
  return { 0: touch, length: 1, item: () => touch };
};

const swipe = (target: Element, startX: number, endX: number) => {
  const start = new Event("touchstart", { bubbles: true, cancelable: true });
  Object.defineProperty(start, "touches", { value: touchList(startX, 100) });
  fireEvent(target, start);
  const end = new Event("touchend", { bubbles: true, cancelable: true });
  Object.defineProperty(end, "changedTouches", { value: touchList(endX, 100) });
  fireEvent(target, end);
};

describe("HistoryDialogShell", () => {
  afterEach(cleanup);

  it("switches A to B on a left swipe without reading DOM labels", () => {
    const app = createInitialAppState(new Date("2026-04-18T09:00:00+09:00"));
    const onSwitchBaby = vi.fn();
    render(
      <HistoryDialogShell
        open
        onOpenChange={vi.fn()}
        profile={{ ...app.profiles.A, displayName: "同じ名前", iconEmoji: "🌙" }}
        title="同じ名前の食事履歴"
        description="履歴"
        onSwitchBaby={onSwitchBaby}
      >
        <div>content</div>
      </HistoryDialogShell>
    );

    swipe(screen.getByRole("dialog"), 220, 100);
    expect(onSwitchBaby).toHaveBeenCalledWith("B");
    expect(screen.getByRole("heading").querySelector('[data-history-baby-marker="A"]')?.textContent).toContain("🌙");
  });

  it("switches B to A on a right swipe", () => {
    const app = createInitialAppState(new Date("2026-04-18T09:00:00+09:00"));
    const onSwitchBaby = vi.fn();
    render(
      <HistoryDialogShell
        open
        onOpenChange={vi.fn()}
        profile={app.profiles.B}
        title="履歴"
        description="履歴"
        onSwitchBaby={onSwitchBaby}
      >
        <div>content</div>
      </HistoryDialogShell>
    );

    swipe(screen.getByRole("dialog"), 100, 220);
    expect(onSwitchBaby).toHaveBeenCalledWith("A");
  });
});
