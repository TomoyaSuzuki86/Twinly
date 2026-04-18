import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DiaperModal } from "./DiaperModal";
import { createInitialAppState } from "@/lib/app-state";

describe("DiaperModal", () => {
  it("defaults diaper entries to poop and preserves the editable timestamp", () => {
    const onSave = vi.fn();
    const baseApp = createInitialAppState(new Date("2026-04-18T09:00:00+09:00"));

    render(
      <DiaperModal
        open
        onOpenChange={vi.fn()}
        displayName="赤ちゃんA"
        initialDraft={{
          diaperKind: "poop",
          note: "",
          selectedDiaperSize: "新生児",
          timestamp: new Date("2026-04-18T09:45:00+09:00").getTime(),
        }}
        onSave={onSave}
        diaperStockBySize={baseApp.profiles.A.diaperStockBySize}
        onUpdateDiaperStock={vi.fn()}
        babyProfile={baseApp.profiles.A}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "保存する" }));

    expect(onSave).toHaveBeenCalledWith({
      diaperKind: "poop",
      note: "",
      selectedDiaperSize: "新生児",
      timestamp: new Date("2026-04-18T09:45:00+09:00").getTime(),
    });
  });
});
