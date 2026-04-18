import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MilkModal } from "./MilkModal";

describe("MilkModal", () => {
  it("starts from the provided previous milk draft and saves the timestamp", () => {
    const onSave = vi.fn();

    render(
      <MilkModal
        open
        onOpenChange={vi.fn()}
        displayName="赤ちゃんA"
        initialDraft={{
          milkMl: 50,
          milkMethod: "bottle",
          note: "",
          timestamp: new Date("2026-04-18T10:15:00+09:00").getTime(),
        }}
        onSave={onSave}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "保存する" }));

    expect(onSave).toHaveBeenCalledWith({
      milkMl: 50,
      milkMethod: "bottle",
      note: "",
      timestamp: new Date("2026-04-18T10:15:00+09:00").getTime(),
    });
  });

  it("changes milk amount in 5ml increments", () => {
    const onSave = vi.fn();

    render(
      <MilkModal
        open
        onOpenChange={vi.fn()}
        displayName="赤ちゃんA"
        initialDraft={{
          milkMl: 50,
          milkMethod: "bottle",
          note: "",
          timestamp: new Date("2026-04-18T10:15:00+09:00").getTime(),
        }}
        onSave={onSave}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "ミルク量を増やす" }));
    fireEvent.click(screen.getByRole("button", { name: "保存する" }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        milkMl: 55,
      })
    );
  });
});
