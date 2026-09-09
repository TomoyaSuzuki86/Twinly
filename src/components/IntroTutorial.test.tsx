import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
});

const LiveUi = () => <>
  <div data-tutorial="babies">双子タブ</div>
  <div className="twinly-baby-tabs-content" data-state="active">
    <button aria-label="食事を記録">食事</button>
    <button role="switch" aria-checked="true">睡眠</button>
    <button data-tutorial="baby-A">奏汰</button>
    <div data-tutorial="logs">ログ</div>
  </div>
  <header data-tutorial="header">Twinly</header>
  <button aria-label="settings">設定</button>
</>;

const setup = () => render(<>
  <LiveUi />
  <IntroTutorial {...props} />
</>);

describe("IntroTutorial", () => {
  it("waits for readiness and starts the nine-step live tutorial", async () => {
    const view = render(<IntroTutorial {...props} ready={false} />);
    expect(shouldShowTutorial).not.toHaveBeenCalled();

    view.rerender(<IntroTutorial {...props} blocked />);
    expect(shouldShowTutorial).not.toHaveBeenCalled();

    view.rerender(<IntroTutorial {...props} />);
    await screen.findByText("まずは、記録する子を選ぶ");
    expect(screen.getByText("1 / 9")).toBeTruthy();
  });

  it("explains the basic record controls before live practice", async () => {
    setup();
    await screen.findByText("まずは、記録する子を選ぶ");
    fireEvent.click(screen.getByText("次へ"));
    expect(screen.getByText("基本の記録は、ボタンから")).toBeTruthy();
    expect(screen.getByText("2 / 9")).toBeTruthy();
  });

  it("allows replay after skipping and supports users who already completed", async () => {
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
