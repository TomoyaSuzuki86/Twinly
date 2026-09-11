import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Dialog, DialogContent, DialogTitle } from "./dialog";

const touchList = (x: number, y: number) => {
  const touch = { clientX: x, clientY: y };
  return {
    0: touch,
    length: 1,
    item: () => touch,
  };
};

const fireSwipe = (target: Element, startX: number, endX: number) => {
  const start = new Event("touchstart", { bubbles: true, cancelable: true });
  Object.defineProperty(start, "touches", { value: touchList(startX, 100) });
  fireEvent(target, start);

  const end = new Event("touchend", { bubbles: true, cancelable: true });
  Object.defineProperty(end, "changedTouches", { value: touchList(endX, 100) });
  fireEvent(target, end);
};

function HistoryDialogFixture({
  title,
  onOpenA,
  onOpenB,
}: {
  title: string;
  onOpenA: () => void;
  onOpenB: () => void;
}) {
  return (
    <>
      <div className="twinly-baby-tabs-content">
        <button aria-label="かなちゃんの食事履歴を開く" onClick={onOpenA}>A</button>
      </div>
      <div className="twinly-baby-tabs-content">
        <button aria-label="ひなちゃんの食事履歴を開く" onClick={onOpenB}>B</button>
      </div>
      <Dialog open>
        <DialogContent>
          <DialogTitle>{title}</DialogTitle>
        </DialogContent>
      </Dialog>
    </>
  );
}

describe("DialogContent", () => {
  afterEach(cleanup);

  it("switches from the first twin to the second twin with a left swipe on a history modal", () => {
    const openA = vi.fn();
    const openB = vi.fn();
    render(<HistoryDialogFixture title="かなちゃんの食事履歴" onOpenA={openA} onOpenB={openB} />);

    fireSwipe(screen.getByRole("dialog"), 220, 100);

    expect(openA).not.toHaveBeenCalled();
    expect(openB).toHaveBeenCalledTimes(1);
  });

  it("switches from the second twin to the first twin with a right swipe on a history modal", () => {
    const openA = vi.fn();
    const openB = vi.fn();
    render(<HistoryDialogFixture title="ひなちゃんの食事履歴" onOpenA={openA} onOpenB={openB} />);

    fireSwipe(screen.getByRole("dialog"), 100, 220);

    expect(openA).toHaveBeenCalledTimes(1);
    expect(openB).not.toHaveBeenCalled();
  });

  it("shows an opening skeleton while the modal is entering", () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>設定</DialogTitle>
        </DialogContent>
      </Dialog>
    );

    expect(screen.getByTestId("dialog-opening-skeleton")).toBeTruthy();
  });
});
