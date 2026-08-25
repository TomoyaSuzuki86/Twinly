import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DateTimeAdjuster } from "./DateTimeAdjuster";

describe("DateTimeAdjuster", () => {
  afterEach(cleanup);

  it("moves the timestamp backward and forward by 10 or 30 minutes", () => {
    const value = new Date("2026-04-18T10:00:00").getTime();
    const onChange = vi.fn();
    const { rerender } = render(<DateTimeAdjuster id="datetime" value={value} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "−30分" }));
    expect(onChange).toHaveBeenLastCalledWith(value - 30 * 60 * 1000);

    rerender(<DateTimeAdjuster id="datetime" value={value} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "＋10分" }));
    expect(onChange).toHaveBeenLastCalledWith(value + 10 * 60 * 1000);
  });
});
