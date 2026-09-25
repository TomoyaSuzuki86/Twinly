import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Dialog, DialogContent, DialogTitle } from "./dialog";

describe("DialogContent", () => {
  afterEach(cleanup);

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

  it("keeps dialogs inside the viewport and scrolls only when content overflows", () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>長いモーダル</DialogTitle>
          <div>内容</div>
        </DialogContent>
      </Dialog>
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog.className).toContain("max-h-[calc(100dvh-1rem)]");
    expect(dialog.className).toContain("overflow-y-auto");
    expect(dialog.className).toContain("overscroll-contain");
  });

  it("renders arbitrary titles without feature-specific decoration", () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>食事履歴</DialogTitle>
        </DialogContent>
      </Dialog>
    );

    expect(screen.getByRole("heading").querySelector("[data-history-baby-marker]")).toBeNull();
  });
});
