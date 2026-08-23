import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MilkModal } from "./MilkModal";

describe("MilkModal", () => {
  afterEach(() => {
    cleanup();
  });

  it("starts from the provided previous milk draft and saves the timestamp", () => {
    const onSave = vi.fn();

    render(
      <MilkModal
        open
        onOpenChange={vi.fn()}
        displayName="赤ちゃんA"
        initialDraft={{
          milkMl: 50,
          note: "",
          timestamp: new Date("2026-04-18T10:15:00+09:00").getTime(),
        }}
        onSave={onSave}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "保存する" }));

    expect(onSave).toHaveBeenCalledWith({
      milkMl: 50,
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

  it("does not show bottle or breast choices", () => {
    render(
      <MilkModal
        open
        onOpenChange={vi.fn()}
        displayName="赤ちゃんA"
        initialDraft={{
          milkMl: 50,
          note: "",
          timestamp: new Date("2026-04-18T10:15:00+09:00").getTime(),
        }}
        onSave={vi.fn()}
      />
    );

    expect(screen.getAllByText("50")[0]).toBeTruthy();
    expect(screen.queryByRole("button", { name: "母乳" })).toBeNull();
    expect(screen.queryByRole("button", { name: "哺乳瓶" })).toBeNull();
  });

  it("saves solid food using only the shared memo and timestamp", () => {
    const onSaveSolidFood = vi.fn();

    render(
      <MilkModal
        open
        onOpenChange={vi.fn()}
        displayName="赤ちゃんA"
        initialDraft={{
          milkMl: 50,
          note: "",
          timestamp: new Date("2026-04-18T10:15:00+09:00").getTime(),
        }}
        onSave={vi.fn()}
        onSaveSolidFood={onSaveSolidFood}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "離乳食" }));
    fireEvent.change(screen.getByLabelText("メモ"), {
      target: { value: "10倍がゆ 小さじ2、にんじん 少し" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存する" }));

    expect(onSaveSolidFood).toHaveBeenCalledWith({
      note: "10倍がゆ 小さじ2、にんじん 少し",
      timestamp: new Date("2026-04-18T10:15:00+09:00").getTime(),
    });
  });
});
