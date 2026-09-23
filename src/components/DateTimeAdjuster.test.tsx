import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DateTimeAdjuster } from "./DateTimeAdjuster";

describe("DateTimeAdjuster", () => {
  afterEach(cleanup);

  it("keeps the legacy controls for record editing", () => {
    const value = new Date("2026-04-18T10:00:00").getTime();
    const onChange = vi.fn();
    const { rerender } = render(<DateTimeAdjuster id="datetime" value={value} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "30分戻す" }));
    expect(onChange).toHaveBeenLastCalledWith(value - 30 * 60 * 1000);
    rerender(<DateTimeAdjuster id="datetime" value={value} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "10分進める" }));
    expect(onChange).toHaveBeenLastCalledWith(value + 10 * 60 * 1000);
  });

  it("exposes only a 15-minute shortcut and on-demand native date-time input in compact mode", () => {
    const value = new Date("2026-04-18T10:00:00").getTime();
    const onChange = vi.fn();
    const { rerender } = render(<DateTimeAdjuster compact id="datetime" value={value} onChange={onChange} />);
    expect(screen.queryByLabelText("日時を直接編集")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "15分戻す" }));
    expect(onChange).toHaveBeenLastCalledWith(value - 15 * 60 * 1000);
    rerender(<DateTimeAdjuster compact id="datetime" value={value} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "日時を変更" }));
    const nativeInput = screen.getByLabelText("日時を直接編集") as HTMLInputElement;
    expect(nativeInput.value).toBe("2026-04-18T10:00");
    fireEvent.change(nativeInput, { target: { value: "2026-04-17T09:30" } });
    expect(onChange).toHaveBeenLastCalledWith(new Date("2026-04-17T09:30:00").getTime());
  });
});
