import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { createInitialAppState } from "@/lib/app-state";
import { BabyTabTrigger } from "./BabyTabTrigger";

describe("BabyTabTrigger", () => {
  afterEach(cleanup);

  it("shows gauges only on the unselected tab", () => {
    const profile = createInitialAppState(new Date("2026-08-11T08:00:00+09:00")).profiles.A;
    const { rerender } = render(
      <BabyTabTrigger profile={profile} gaugePercents={{ milk: 35, diaper: 70, sleep: 42 }} />
    );

    expect(screen.getByTestId("baby-A-milk-mini-gauge").dataset.percent).toBe("35");
    expect(screen.getByTestId("baby-A-diaper-mini-gauge").dataset.percent).toBe("70");
    expect(screen.getByTestId("baby-A-sleep-mini-gauge").dataset.percent).toBe("42");
    expect(
      screen.getByLabelText(`${profile.displayName}のミルク必要度35%・おむつ交換必要度70%・必要睡眠時間の残り42%`)
    ).toBeTruthy();

    rerender(
      <BabyTabTrigger
        profile={profile}
        gaugePercents={{ milk: 35, diaper: 70, sleep: 42 }}
        sleeping
        selected
      />
    );
    expect(screen.queryByLabelText(`${profile.displayName}は睡眠中`)).toBeNull();
    expect(screen.queryByTestId("baby-A-milk-mini-gauge")).toBeNull();
    expect(screen.queryByTestId("baby-A-diaper-mini-gauge")).toBeNull();
    expect(screen.queryByTestId("baby-A-sleep-mini-gauge")).toBeNull();
    expect(screen.queryByText(/生後/)).toBeNull();
  });
});
