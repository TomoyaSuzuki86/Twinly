import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DiaperModal } from "./DiaperModal";
import { createInitialAppState } from "@/lib/app-state";

const baseApp = () => createInitialAppState(new Date("2026-04-18T09:00:00+09:00"));
const draft = () => ({
  diaperKind: "poop" as const, note: "", selectedDiaperSize: "新生児",
  timestamp: new Date("2026-04-18T09:45:00+09:00").getTime(),
});
const renderDiaper = (overrides: Partial<React.ComponentProps<typeof DiaperModal>> = {}) => {
  const app = baseApp();
  const onSave = vi.fn();
  const onOpenChange = vi.fn();
  render(<DiaperModal open displayName="赤ちゃんA" onOpenChange={onOpenChange}
    initialDraft={draft()} onSave={onSave}
    diaperStockManagementEnabled={app.diaperStockManagementEnabled}
    diaperStockBySize={app.profiles.A.diaperStockBySize}
    onUpdateDiaperStock={vi.fn()} babyProfile={app.profiles.A} {...overrides} />);
  return { onSave, onOpenChange };
};

describe("DiaperModal", () => {
  afterEach(cleanup);

  it("preserves diaper kind and timestamp by default", () => {
    const { onSave } = renderDiaper();
    fireEvent.click(screen.getByRole("button", { name: "保存する" }));
    expect(onSave).toHaveBeenCalledWith({
      diaperKind: "poop", note: "", selectedDiaperSize: "新生児",
      timestamp: draft().timestamp, autoWake: true,
    });
    expect(screen.queryByRole("checkbox", { name: /自動で起床を記録/ })).toBeNull();
  });

  it("offers pee and poop only and compact date controls", () => {
    renderDiaper();
    expect(screen.getByRole("button", { name: "おしっこ" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "うんち" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "両方" })).toBeNull();
    expect(screen.getByRole("button", { name: "15分戻す" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "日時を変更" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "30分戻す" })).toBeNull();
  });

  it("offers conditional automatic wake", () => {
    const { onSave } = renderDiaper({ isSleeping: true });
    const checkbox = screen.getByRole("checkbox", { name: /自動で起床を記録/ });
    fireEvent.click(checkbox);
    fireEvent.click(screen.getByRole("button", { name: "保存する" }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ autoWake: false }));
  });

  it("does not expose stock editing by default", () => {
    const app = baseApp();
    renderDiaper({ diaperStockManagementEnabled: true, diaperStockBySize: app.profiles.A.diaperStockBySize });
    expect(screen.queryByLabelText("おむつ在庫数")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /おむつ在庫/ }));
    expect(screen.getByLabelText("おむつ在庫数")).toBeTruthy();
  });

  it("confirms before discarding modified diaper kind", () => {
    const { onOpenChange } = renderDiaper();
    fireEvent.click(screen.getByRole("button", { name: "おしっこ" }));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.getByText("入力内容を破棄しますか？")).toBeTruthy();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    fireEvent.click(screen.getByRole("button", { name: "破棄する" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
