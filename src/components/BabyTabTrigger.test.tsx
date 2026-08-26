import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { createInitialAppState } from "@/lib/app-state";
import { BabyTabTrigger } from "./BabyTabTrigger";

describe("BabyTabTrigger", () => {
  afterEach(cleanup);

  it("shows milk, diaper, and sleep gauges on the right side of every tab", () => {
    const profile = createInitialAppState(new Date("2026-08-11T08:00:00+09:00")).profiles.A;
    const { rerender } = render(
      <BabyTabTrigger profile={profile} gaugePercents={{ milk: 35, diaper: 70, sleep: 42 }} />
    );

    expect(screen.getByTestId("baby-A-milk-mini-gauge").dataset.percent).toBe("35");
    expect(screen.getByTestId("baby-A-diaper-mini-gauge").dataset.percent).toBe("70");
    expect(screen.getByTestId("baby-A-sleep-mini-gauge").dataset.percent).toBe("42");
    expect(
      screen.getByLabelText(`${profile.displayName}のミルク必要度35%・おむつ交換必要度70%・活動時間経過42%`)
    ).toBeTruthy();

    rerender(<BabyTabTrigger profile={profile} gaugePercents={{ milk: 35, diaper: 70, sleep: 42 }} sleeping />);
    expect(screen.getByLabelText(`${profile.displayName}は睡眠中`)).toBeTruthy();
  });
});
