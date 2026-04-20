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
          milkMethod: "bottle",
          milkMlByMethod: {
            bottle: 50,
            breast: 90,
          },
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
          milkMlByMethod: {
            bottle: 50,
            breast: 90,
          },
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

  it("keeps separate default amounts for bottle and breast", () => {
    render(
      <MilkModal
        open
        onOpenChange={vi.fn()}
        displayName="赤ちゃんA"
        initialDraft={{
          milkMl: 50,
          milkMethod: "bottle",
          milkMlByMethod: {
            bottle: 50,
            breast: 90,
          },
          note: "",
          timestamp: new Date("2026-04-18T10:15:00+09:00").getTime(),
        }}
        onSave={vi.fn()}
      />
    );

    expect(screen.getAllByText("50")[0]).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "母乳" }));
    expect(screen.getAllByText("90")[0]).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "哺乳瓶" }));
    expect(screen.getAllByText("50")[0]).toBeTruthy();
  });
});
