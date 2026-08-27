import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { createInitialAppState } from "@/lib/app-state";
import { BabyTabTrigger } from "./BabyTabTrigger";

describe("BabyTabTrigger", () => {
  afterEach(cleanup);

  it("shows gauges only on the unselected tab", () => {
    const profile = createInitialAppState(new Date("2026-08-11T08:00:00+09:00")).profiles.A;
    const { rerender } = render(
      <BabyTabTrigger profile={profile} gaugePercents={{ milk: 35, diaper: 70, activity: 42 }} />
    );

    expect(screen.getByTestId("baby-A-milk-mini-gauge").dataset.percent).toBe("35");
    expect(screen.getByTestId("baby-A-diaper-mini-gauge").dataset.percent).toBe("70");
    expect(screen.getByTestId("baby-A-activity-mini-gauge").dataset.percent).toBe("42");
    expect(screen.getByTestId("baby-A-activity-mini-gauge").getAttribute("style")).toContain("rgb(34, 197, 94)");
    expect(screen.getByTestId("baby-A-milk-mini-gauge").className).toContain("h-9");
    expect(screen.queryByText(/生後/)).toBeNull();
    expect(
      screen.getByLabelText(`${profile.displayName}のミルク必要度35%・おむつ交換必要度70%・活動時間経過42%`)
    ).toBeTruthy();

    rerender(
      <BabyTabTrigger
        profile={profile}
        gaugePercents={{ milk: 35, diaper: 70, activity: 42 }}
        sleeping
        selected
      />
    );
    expect(screen.queryByLabelText(`${profile.displayName}は睡眠中`)).toBeNull();
    expect(screen.queryByTestId("baby-A-milk-mini-gauge")).toBeNull();
    expect(screen.queryByTestId("baby-A-diaper-mini-gauge")).toBeNull();
    expect(screen.queryByTestId("baby-A-activity-mini-gauge")).toBeNull();
    expect(screen.getByText(/生後\d+日/)).toBeTruthy();
  });

  it("hides only the activity gauge when sleep management is disabled", () => {
    const profile = createInitialAppState(new Date("2026-08-11T08:00:00+09:00")).profiles.A;
    render(
      <BabyTabTrigger
        profile={profile}
        gaugePercents={{ milk: 35, diaper: 70, activity: 42 }}
        activityGaugeEnabled={false}
      />
    );

    expect(screen.getByTestId("baby-A-milk-mini-gauge")).toBeTruthy();
    expect(screen.getByTestId("baby-A-diaper-mini-gauge")).toBeTruthy();
    expect(screen.queryByTestId("baby-A-activity-mini-gauge")).toBeNull();
    expect(screen.getByLabelText(`${profile.displayName}のミルク必要度35%・おむつ交換必要度70%`)).toBeTruthy();
  });
});
