import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MilkModal } from "./MilkModal";

const draft = () => ({
  milkMl: 50,
  note: "",
  timestamp: new Date("2026-04-18T10:15:00").getTime(),
});

const renderMilk = (extra: Partial<React.ComponentProps<typeof MilkModal>> = {}) => {
  const onSave = vi.fn();
  const onOpenChange = vi.fn();
  render(
    <MilkModal open displayName="赤ちゃんA" initialDraft={draft()}
      onSave={onSave} onOpenChange={onOpenChange} {...extra} />
  );
  return { onSave, onOpenChange };
};

describe("MilkModal", () => {
  afterEach(cleanup);

  it("starts at the previous amount and saves unchanged timestamp", () => {
    const { onSave } = renderMilk();
    expect((screen.getByRole("textbox", { name: "ミルク量（ml）" }) as HTMLInputElement).value).toBe("50");
    fireEvent.click(screen.getByRole("button", { name: "保存する" }));
    expect(onSave).toHaveBeenCalledWith({
      milkMl: 50, note: "", timestamp: draft().timestamp, autoWake: true,
    });
    expect(screen.queryByRole("checkbox", { name: /自動で起床を記録/ })).toBeNull();
  });

  it("uses only labeled 10ml steps and accepts a direct amount", () => {
    const { onSave } = renderMilk();
    const amount = screen.getByRole("textbox", { name: "ミルク量（ml）" }) as HTMLInputElement;
    expect(screen.queryByRole("button", { name: "ミルク量を5ml減らす" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "ミルク量を10ml減らす" }));
    expect(amount.value).toBe("40");
    fireEvent.click(screen.getByRole("button", { name: "ミルク量を10ml増やす" }));
    expect(amount.value).toBe("50");
    fireEvent.change(amount, { target: { value: "125" } });
    expect(amount.value).toBe("125");
    fireEvent.click(screen.getByRole("button", { name: "保存する" }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ milkMl: 125 }));
  });

  it("blocks zero amount and keeps optional bottle/breast UI hidden", () => {
    const { onSave } = renderMilk();
    fireEvent.change(screen.getByRole("textbox", { name: "ミルク量（ml）" }), { target: { value: "" } });
    expect((screen.getByRole("button", { name: "保存する" }) as HTMLButtonElement).disabled).toBe(true);
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "母乳" })).toBeNull();
    expect(screen.queryByRole("button", { name: "哺乳瓶" })).toBeNull();
  });

  it("saves solid food with its own note and shared timestamp", () => {
    const onSaveSolidFood = vi.fn();
    renderMilk({ onSaveSolidFood });
    fireEvent.click(screen.getByRole("button", { name: "離乳食" }));
    fireEvent.change(screen.getByLabelText("食べたもの・量"), {
      target: { value: "10倍がゆ 小さじ2、にんじん 少し" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存する" }));
    expect(onSaveSolidFood).toHaveBeenCalledWith({
      note: "10倍がゆ 小さじ2、にんじん 少し",
      timestamp: draft().timestamp, autoWake: true,
    });
  });

  it("only shows auto-wake while sleeping", () => {
    const { onSave } = renderMilk({ isSleeping: true });
    const checkbox = screen.getByRole("checkbox", { name: /自動で起床を記録/ });
    expect((checkbox as HTMLInputElement).checked).toBe(true);
    fireEvent.click(checkbox);
    fireEvent.click(screen.getByRole("button", { name: "保存する" }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ autoWake: false }));
  });

  it("confirms before discarding modified milk amount", () => {
    const { onOpenChange } = renderMilk();
    fireEvent.click(screen.getByRole("button", { name: "ミルク量を10ml増やす" }));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.getByText("入力内容を破棄しますか？")).toBeTruthy();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    fireEvent.click(screen.getByRole("button", { name: "破棄する" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("shows compact timestamp controls", () => {
    renderMilk();
    expect(screen.getByRole("button", { name: "15分戻す" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "日時を変更" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "30分戻す" })).toBeNull();
  });
});
