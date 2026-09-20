import { describe, expect, it } from "vitest";
import { createInitialAppState } from "./app-state";
import { buildBabyPanelViewModel } from "./baby-panel-view-model";

describe("buildBabyPanelViewModel", () => {
  it("keeps sleep target override and latest care event presentation", () => {
    const app = createInitialAppState(new Date("2026-09-20T00:00:00+09:00"));
    app.profiles.A.sleepTargetHoursOverride = 12;
    app.events = [
      { id: "milk", babyId: "A", type: "milk", timestamp: new Date("2026-09-20T09:00:00+09:00").getTime(), milkMl: 180 },
      { id: "pee", babyId: "A", type: "diaper", timestamp: new Date("2026-09-20T08:30:00+09:00").getTime(), diaperKind: "pee" },
    ];
    const model = buildBabyPanelViewModel({
      profile: app.profiles.A,
      latestEvents: app.events,
      logEvents: app.events,
      now: new Date("2026-09-20T10:00:00+09:00"),
      diaperStockManagementEnabled: app.diaperStockManagementEnabled,
      stockForecastEnabled: true,
      diaperEstimate: null,
      milkProgress: null,
    });
    expect(model.lastMilkTime).toBe("09:00");
    expect(model.lastMilkElapsed).toBe("60分前");
    expect(model.milkCount).toBe(1);
    expect(model.peeCount).toBe(1);
  });
});
