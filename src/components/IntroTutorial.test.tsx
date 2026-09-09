import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { IntroTutorial } from "./IntroTutorial";
import { finishTutorial, shouldShowTutorial } from "@/lib/tutorial-progress";

vi.mock("@/lib/tutorial-progress", () => ({ finishTutorial: vi.fn(), shouldShowTutorial: vi.fn() }));

const props = {
  uid: "parent-one",
  ready: true,
  blocked: false,
  replay: 0,
  names: ["奏汰", "日向"] as [string, string],
};

beforeEach(() => {
  vi.mocked(shouldShowTutorial).mockResolvedValue(true);
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    top: 30,
    left: 10,
    width: 180,
    height: 50,
    right: 190,
    bottom: 80,
    x: 10,
    y: 30,
    toJSON: () => ({}),
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.useRealTimers();
});

const LiveUi = ({ onLiveGesture }: { onLiveGesture?: () => void }) => <>
  <div data-tutorial="babies">双子タブ</div>
  <div className="twinly-baby-tabs-content" data-state="active">
    <button aria-label="食事を記録">食事</button>
    <button role="switch" aria-checked="false" onPointerDown={onLiveGesture}>睡眠</button>
    <button data-tutorial="baby-A" onDoubleClick={onLiveGesture}>実際のタブ</button>
    <div data-tutorial="logs">ログ</div>
  </div>
  <header data-tutorial="header" onDoubleClick={onLiveGesture}>Twinly</header>
</>;

const setup = (onLiveGesture?: () => void) => render(<>
  <LiveUi onLiveGesture={onLiveGesture} />
  <IntroTutorial {...props} />
</>);

const next = () => fireEvent.click(screen.getByText("次へ"));

const pointerDown = (target: Element) => {
  const event = new MouseEvent("pointerdown", { bubbles: true, button: 0 });
  Object.defineProperty(event, "isPrimary", { value: true });
  fireEvent(target, event);
};

describe("IntroTutorial", () => {
  it("waits for readiness and avoids interrupting other dialogs", async () => {
    const view = render(<IntroTutorial {...props} ready={false} />);
    expect(shouldShowTutorial).not.toHaveBeenCalled();

    view.rerender(<IntroTutorial {...props} blocked />);
    expect(shouldShowTutorial).not.toHaveBeenCalled();

    view.rerender(<IntroTutorial {...props} />);
    await screen.findByText("まずは、記録する子を選ぶ");
    expect(screen.getByText("1 / 7")).toBeTruthy();
  });

  it("walks through basic recording, sleep, voice examples and logs", async () => {
    setup();
    await screen.findByText("まずは、記録する子を選ぶ");

    next();
    expect(screen.getByText("基本の記録は、ボタンから")).toBeTruthy();

    next();
    expect(screen.getByText("睡眠だけは、長押しも覚える")).toBeTruthy();

    next();
    expect(screen.getByText("この子だけに、声で記録")).toBeTruthy();

    next();
    expect(screen.getByText("2人分を、ひとことで")).toBeTruthy();

    next();
    expect(screen.getByText("声では、時刻までまとめて言えます")).toBeTruthy();
    expect(screen.getByText("「30分前にミルク180」")).toBeTruthy();

    next();
    expect(screen.getByText("記録は、あとから直せます")).toBeTruthy();
    fireEvent.click(screen.getByText("記録をはじめる"));
    expect(finishTutorial).toHaveBeenCalledWith("parent-one", "completed");
  });

  it("keeps sleep long-press practice inside the tutorial", async () => {
    const live = vi.fn();
    setup(live);
    await screen.findByText("まずは、記録する子を選ぶ");
    next();
    next();
    vi.useFakeTimers();

    const target = screen.getByLabelText("睡眠の長押しを練習");
    pointerDown(target);
    fireEvent.pointerLeave(target);
    act(() => vi.advanceTimersByTime(600));
    expect(screen.queryByText("時刻を指定して記録")).toBeNull();

    pointerDown(target);
    act(() => vi.advanceTimersByTime(550));
    expect(screen.getByText("時刻を指定して記録")).toBeTruthy();
    expect(live).not.toHaveBeenCalled();
  });

  it("shows one baby and then two babies without forwarding voice gestures to live controls", async () => {
    const live = vi.fn();
    setup(live);
    await screen.findByText("まずは、記録する子を選ぶ");

    next();
    next();
    next();
    fireEvent.doubleClick(screen.getByLabelText("奏汰の音声入力を練習"));
    expect(screen.getAllByText("180 ml")).toHaveLength(1);

    next();
    fireEvent.doubleClick(screen.getByLabelText("2人同時の音声入力を練習"));
    expect(screen.getAllByText("180 ml")).toHaveLength(2);
    expect(live).not.toHaveBeenCalled();
  });

  it("supports a 550ms voice long press and cancels a departed pointer", async () => {
    setup();
    await screen.findByText("まずは、記録する子を選ぶ");
    next();
    next();
    next();
    vi.useFakeTimers();

    const target = screen.getByLabelText("奏汰の音声入力を練習");
    pointerDown(target);
    fireEvent.pointerLeave(target);
    act(() => vi.advanceTimersByTime(600));
    expect(screen.queryByText("180 ml")).toBeNull();

    pointerDown(target);
    act(() => vi.advanceTimersByTime(550));
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
