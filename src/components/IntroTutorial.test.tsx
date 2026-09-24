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

const LiveUi = ({ onLiveSleep }: { onLiveSleep?: () => void }) => <>
  <div data-tutorial="babies">双子タブ</div>
  <div className="twinly-baby-tabs-content" data-state="active">
    <button data-tutorial="primary-action" aria-label="食事を記録">食事</button>
    <button data-tutorial="primary-action" aria-label="おむつを記録">おむつ</button>
    <button data-tutorial="primary-action" role="switch" aria-checked="false" onClick={onLiveSleep}>実画面の睡眠</button>
    <button data-tutorial="baby-A">1人目</button>
    <div data-tutorial="logs">ログ</div>
    <div data-tutorial="log-summary">食事・おむつ・睡眠の集計</div>
    <button aria-label="週間タイムラインを開く">タイムライン</button>
  </div>
  <header data-tutorial="header">Twinly</header>
  <button aria-label="settings">設定</button>
</>;

const setup = (onLiveSleep?: () => void) => render(<>
  <LiveUi onLiveSleep={onLiveSleep} />
  <IntroTutorial {...props} />
</>);

const next = () => fireEvent.click(screen.getByText("次へ"));

const openTutorialSleepTime = () => {
  vi.useFakeTimers();
  const tutorialSleep = screen.getByRole("switch", { name: /チュートリアル: 入眠を記録/ });
  fireEvent.pointerDown(tutorialSleep);
  act(() => vi.advanceTimersByTime(550));
};

describe("IntroTutorial", () => {
  it("waits for readiness and starts the eleven-step tutorial", async () => {
    const view = render(<IntroTutorial {...props} ready={false} />);
    expect(shouldShowTutorial).not.toHaveBeenCalled();

    view.rerender(<IntroTutorial {...props} blocked />);
    expect(shouldShowTutorial).not.toHaveBeenCalled();

    view.rerender(<IntroTutorial {...props} />);
    await screen.findByText("まずは、記録する子を選ぶ");
    expect(screen.getByText("1 / 11")).toBeTruthy();
  });

  it("explains the basic record controls before practice", async () => {
    setup();
    await screen.findByText("まずは、記録する子を選ぶ");
    next();
    expect(screen.getByText("基本の記録は、ボタンから")).toBeTruthy();
    expect(screen.getByText("2 / 11")).toBeTruthy();
  });

  it("uses a tutorial-only sleep button and never touches the live sleep control", async () => {
    const liveSleep = vi.fn();
    setup(liveSleep);
    await screen.findByText("まずは、記録する子を選ぶ");
    next();
    next();

    openTutorialSleepTime();
    expect(screen.getByText("赤ちゃん: 入眠時刻")).toBeTruthy();
    fireEvent.click(screen.getByText("記録する"));

    expect(screen.getByText("時刻設定まで完了")).toBeTruthy();
    expect(screen.getByText(/実際のログには保存されません/)).toBeTruthy();
    expect(liveSleep).not.toHaveBeenCalled();
  });

  it("lets the user delete the tutorial-only sleep log with the real edit modal UI", async () => {
    setup();
    await screen.findByText("まずは、記録する子を選ぶ");
    next();
    next();

    openTutorialSleepTime();
    fireEvent.click(screen.getByText("記録する"));
    next();

    fireEvent.click(screen.getByRole("button", { name: /入眠 .*を編集/ }));
    expect(screen.getByText("記録の編集")).toBeTruthy();
    fireEvent.click(screen.getByText("削除"));
    fireEvent.click(screen.getByText("削除する"));

    expect(screen.getByText("練習ログを削除できました")).toBeTruthy();
    expect(screen.getByText(/実際のログは一切変更されていません/)).toBeTruthy();
  });

  it("skips only the current step", async () => {
    setup();
    await screen.findByText("まずは、記録する子を選ぶ");

    fireEvent.click(screen.getByText("スキップ"));

    expect(screen.getByText("基本の記録は、ボタンから")).toBeTruthy();
    expect(screen.getByText("2 / 11")).toBeTruthy();
    expect(finishTutorial).not.toHaveBeenCalled();
  });

  it("practices custom memos before the daily summary while keeping the timeline step omitted", async () => {
    setup();
    await screen.findByText("まずは、記録する子を選ぶ");

    for (let index = 0; index < 7; index += 1) {
      fireEvent.click(screen.getByText("スキップ"));
    }

    expect(screen.getByText("よく使う記録は、1タップに")).toBeTruthy();
    expect(screen.getByText("8 / 11")).toBeTruthy();
    expect(screen.getByText("次へ").closest("button")?.hasAttribute("disabled")).toBe(true);

    fireEvent.click(screen.getByText("追加してみる"));

    expect(screen.getByText("作成と記録をまとめて体験")).toBeTruthy();
    expect(screen.getByRole("button", { name: /沐浴 .*を編集/ })).toBeTruthy();
    expect(screen.getByText("長押しで削除")).toBeTruthy();
    expect(screen.getByText("次へ").closest("button")?.hasAttribute("disabled")).toBe(false);

    next();
    expect(screen.getByText("ログ下の集計を、すぐ確認")).toBeTruthy();
    expect(screen.getByText("9 / 11")).toBeTruthy();

    fireEvent.click(screen.getByText("スキップ"));
    expect(screen.getByText("もっと便利に使いたいときは")).toBeTruthy();
    expect(screen.getByText("10 / 11")).toBeTruthy();
    expect(screen.queryByText("タイムラインで、1週間を見渡す")).toBeNull();
  });

  it("ends the whole tutorial immediately without confirmation", async () => {
    setup();
    await screen.findByText("まずは、記録する子を選ぶ");

    fireEvent.click(screen.getByText("終了"));

    await waitFor(() => expect(finishTutorial).toHaveBeenCalledWith("parent-one", "skipped"));
    expect(screen.queryByText("チュートリアルを終了しますか？")).toBeNull();
    expect(screen.queryByText("まずは、記録する子を選ぶ")).toBeNull();
  });

  it("allows replay after completion", async () => {
    vi.mocked(shouldShowTutorial).mockResolvedValue(false);
    const view = render(<IntroTutorial {...props} />);
    await waitFor(() => expect(shouldShowTutorial).toHaveBeenCalled());
    expect(screen.queryByRole("dialog")).toBeNull();

    view.rerender(<IntroTutorial {...props} replay={1} />);
    expect(await screen.findByText("まずは、記録する子を選ぶ")).toBeTruthy();
  });
});