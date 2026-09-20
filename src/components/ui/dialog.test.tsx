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
