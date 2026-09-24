import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HistoryModalSkeleton } from "./HistoryModalSkeleton";

describe("HistoryModalSkeleton", () => {
  afterEach(cleanup);

  it("opens a modal immediately while history content is loading", () => {
    render(<HistoryModalSkeleton open onOpenChange={vi.fn()} />);

    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText("履歴を読み込み中…")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("履歴を読み込み中");
  });
});
