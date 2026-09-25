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

    expect(screen.queryByRole("checkbox", { name: /自動的に起床する/ })).toBeNull();
    expect(onSave).toHaveBeenCalledWith({
      milkMl: 50,
      milkMethod: "bottle",
      note: "",
      timestamp: new Date("2026-04-18T10:15:00+09:00").getTime(),
      autoWake: true,
    });
  });

  it("changes milk amount with a 10ml-step slider", () => {
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

    const slider = screen.getByRole("slider", { name: "ミルク量スライダー" });
    fireEvent.change(slider, { target: { value: "180" } });

    expect((screen.getByLabelText("ミルク量") as HTMLInputElement).value).toBe("180");
    expect((slider as HTMLInputElement).value).toBe("180");
  });

  it("allows direct numeric milk input and saves it", () => {
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

    const amountInput = screen.getByLabelText("ミルク量");
    fireEvent.change(amountInput, { target: { value: "175" } });
    expect((amountInput as HTMLInputElement).value).toBe("175");

    fireEvent.click(screen.getByRole("button", { name: "保存する" }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ milkMl: 175 }));
  });

  it("records breastfeeding without inventing a milk amount", () => {
    const onSave = vi.fn();
    render(
      <MilkModal
        open
        onOpenChange={vi.fn()}
        displayName="赤ちゃんA"
        initialDraft={{
          milkMl: 50,
          breastLeftMinutes: 15,
          breastRightMinutes: 20,
          note: "",
          timestamp: new Date("2026-04-18T10:15:00+09:00").getTime(),
        }}
        onSave={onSave}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "母乳" }));
    expect(screen.queryByLabelText("ミルク量")).toBeNull();
    expect(screen.queryByText("母乳として記録")).toBeNull();
    expect(screen.queryByText(/母乳量は推定せず/)).toBeNull();

    const left = screen.getByLabelText("左の授乳時間") as HTMLSelectElement;
    const right = screen.getByLabelText("右の授乳時間") as HTMLSelectElement;
    expect(left.value).toBe("15");
    expect(right.value).toBe("20");

    fireEvent.change(left, { target: { value: "25" } });
    fireEvent.change(right, { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "保存する" }));

    expect(onSave).toHaveBeenCalledWith({
      milkMethod: "breast",
      breastLeftMinutes: 25,
      breastRightMinutes: 5,
      note: "",
      timestamp: new Date("2026-04-18T10:15:00+09:00").getTime(),
      autoWake: true,
    });
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
      autoWake: true,
    });
  });

  it("shows auto wake only while sleeping and allows it to be disabled", () => {
    const onSave = vi.fn();

    render(
      <MilkModal
        open
        onOpenChange={vi.fn()}
        displayName="赤ちゃんA"
        isSleeping
        initialDraft={{
          milkMl: 50,
          note: "",
          timestamp: new Date("2026-04-18T10:15:00+09:00").getTime(),
        }}
        onSave={onSave}
      />
    );

    const checkbox = screen.getByRole("checkbox", { name: /自動的に起床する/ });
    expect((checkbox as HTMLInputElement).checked).toBe(true);
    fireEvent.click(checkbox);
    fireEvent.click(screen.getByRole("button", { name: "保存する" }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ autoWake: false }));
  });
});
