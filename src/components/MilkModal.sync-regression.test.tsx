import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MilkModal } from "./MilkModal";

describe("MilkModal sync regression", () => {
  afterEach(cleanup);

  it("does not overwrite in-progress input when the synchronized default changes", () => {
    const common = {
      onOpenChange: vi.fn(),
      displayName: "赤ちゃんA",
      onSave: vi.fn(),
    };
    const firstDraft = { milkMl: 50, note: "", timestamp: 1_000 };
    const synchronizedDraft = { milkMl: 180, note: "同期後", timestamp: 2_000 };

    const { rerender } = render(
      <MilkModal open initialDraft={firstDraft} {...common} />
    );

    fireEvent.change(screen.getByRole("slider", { name: "ミルク量スライダー" }), {
      target: { value: "60" },
    });
    expect((screen.getByLabelText("ミルク量") as HTMLInputElement).value).toBe("60");

    rerender(<MilkModal open initialDraft={synchronizedDraft} {...common} />);
    expect((screen.getByLabelText("ミルク量") as HTMLInputElement).value).toBe("60");

    rerender(<MilkModal open={false} initialDraft={synchronizedDraft} {...common} />);
    rerender(<MilkModal open initialDraft={synchronizedDraft} {...common} />);
    expect((screen.getByLabelText("ミルク量") as HTMLInputElement).value).toBe("180");
  });
});
