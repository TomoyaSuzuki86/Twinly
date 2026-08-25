import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SleepRecordModal } from "./SleepRecordModal";

describe("SleepRecordModal", () => {
  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it("records a manually selected sleep time", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-18T10:20:00+09:00"));
    const onSave = vi.fn();

    render(
      <SleepRecordModal
        open
        onOpenChange={vi.fn()}
        displayName="奏汰"
        type="sleepStart"
        onSave={onSave}
      />
    );

    fireEvent.change(screen.getByLabelText("入眠日時"), { target: { value: "2026-04-18T09:45" } });
    fireEvent.click(screen.getByRole("button", { name: "記録する" }));

    expect(onSave).toHaveBeenCalledWith(new Date("2026-04-18T09:45:00").getTime());
  });
});
