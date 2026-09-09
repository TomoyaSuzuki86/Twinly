import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { IntroTutorial } from "./IntroTutorial";
import { finishTutorial, shouldShowTutorial } from "@/lib/tutorial-progress";
vi.mock("@/lib/tutorial-progress", () => ({ finishTutorial: vi.fn(), shouldShowTutorial: vi.fn() }));
const props = { uid: "parent-one", ready: true, blocked: false, replay: 0, names: ["奏汰", "日向"] as [string, string] };
beforeEach(() => {
  vi.mocked(shouldShowTutorial).mockResolvedValue(true);
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ top: 30, left: 10, width: 180, height: 50, right: 190, bottom: 80, x: 10, y: 30, toJSON: () => ({}) });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.clearAllMocks(); vi.useRealTimers(); });
const setup = () => render(<><button data-tutorial="baby-A">実際のタブ</button><header data-tutorial="header">Twinly</header><IntroTutorial {...props} /></>);
describe("IntroTutorial", () => {
  it("waits for readiness and avoids interrupting other dialogs", async () => {
    const view = render(<IntroTutorial {...props} ready={false} />);
    expect(shouldShowTutorial).not.toHaveBeenCalled();
    view.rerender(<IntroTutorial {...props} blocked />);
    expect(shouldShowTutorial).not.toHaveBeenCalled();
    view.rerender(<IntroTutorial {...props} />);
    await screen.findByText("まずは、記録する子を選ぶ");
  });
  it("shows one baby and then two babies without forwarding gestures to live controls", async () => {
    const live = vi.fn();
    render(<><button data-tutorial="baby-A" onDoubleClick={live}>実際のタブ</button><header data-tutorial="header" onDoubleClick={live}>Twinly</header><IntroTutorial {...props} /></>);
    await screen.findByText("まずは、記録する子を選ぶ");
    fireEvent.click(screen.getByText("次へ"));
    fireEvent.doubleClick(screen.getByLabelText("奏汰の音声入力を練習"));
    expect(screen.getAllByText("180 ml")).toHaveLength(1);
    fireEvent.click(screen.getByText("次へ"));
    fireEvent.doubleClick(screen.getByLabelText("2人同時の音声入力を練習"));
    expect(screen.getAllByText("180 ml")).toHaveLength(2);
    expect(live).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("次へ"));
    fireEvent.click(screen.getByText("記録をはじめる"));
    expect(finishTutorial).toHaveBeenCalledWith("parent-one", "completed");
  });
  it("supports a 550ms long press and cancels a departed pointer", async () => {
    setup(); await screen.findByText("まずは、記録する子を選ぶ");
    fireEvent.click(screen.getByText("次へ")); vi.useFakeTimers();
    const target = screen.getByLabelText("奏汰の音声入力を練習");
    const press = () => { const event = new MouseEvent("pointerdown", { bubbles: true, button: 0 }); Object.defineProperty(event, "isPrimary", { value: true }); fireEvent(target, event); };
    press(); fireEvent.pointerLeave(target); act(() => vi.advanceTimersByTime(600));
    expect(screen.queryByText("180 ml")).toBeNull();
    press(); act(() => vi.advanceTimersByTime(550));
    expect(screen.getByText("180 ml")).toBeTruthy();
  });
  it("allows replay after skipping, and supports users who already completed", async () => {
    vi.mocked(shouldShowTutorial).mockResolvedValue(false);
    const view = render(<IntroTutorial {...props} />);
    await waitFor(() => expect(shouldShowTutorial).toHaveBeenCalled());
    expect(screen.queryByRole("dialog")).toBeNull();
    view.rerender(<IntroTutorial {...props} replay={1} />);
    fireEvent.click(await screen.findByText("スキップ"));
    expect(finishTutorial).toHaveBeenCalledWith("parent-one", "skipped");
    view.rerender(<IntroTutorial {...props} replay={2} />);
    expect(await screen.findByText("まずは、記録する子を選ぶ")).toBeTruthy();
  });
});
