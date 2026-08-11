import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { createInitialAppState } from "@/lib/app-state";
import { BabyTabTrigger } from "./BabyTabTrigger";

describe("BabyTabTrigger", () => {
  afterEach(cleanup);

  it("shows mini care gauges only when percentages are provided", () => {
    const profile = createInitialAppState(new Date("2026-08-11T08:00:00+09:00")).profiles.A;
    const { rerender } = render(<BabyTabTrigger profile={profile} />);

    expect(screen.queryByTestId("baby-A-milk-mini-gauge")).toBeNull();
    expect(screen.queryByTestId("baby-A-diaper-mini-gauge")).toBeNull();

    rerender(<BabyTabTrigger profile={profile} careGaugePercents={{ milk: 35, diaper: 70 }} />);

    expect(screen.getByTestId("baby-A-milk-mini-gauge").style.width).toBe("35%");
    expect(screen.getByTestId("baby-A-diaper-mini-gauge").style.width).toBe("70%");
    expect(screen.getByLabelText(`${profile.displayName}のミルク必要度35%・おむつ交換必要度70%`)).toBeTruthy();
  });
});
