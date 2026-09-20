import { describe, expect, it } from "vitest";
import { createInitialAppState } from "./app-state";
import { buildCareGaugeSettingsModel, copyGaugeSettings, gaugeProfilesEqual, setSleepGaugeMode } from "./settings-gauge-policy";

describe("settings gauge policy", () => {
  it("preserves custom values while switching to age mode and restores them", () => {
    const app = createInitialAppState(new Date("2026-09-20T00:00:00+09:00"));
    app.profiles.A.activityLimitMinutesOverride = 95;
    app.profiles.A.sleepTargetHoursOverride = 13.5;

    const age = setSleepGaugeMode(app.profiles, "A", "age", 120, 13);
    expect(age.A.activityLimitMinutesOverride).toBeNull();
    expect(age.A.activityLimitMinutesCustom).toBe(95);

    const custom = setSleepGaugeMode(age, "A", "custom", 120, 13);
    expect(custom.A.activityLimitMinutesOverride).toBe(95);
    expect(custom.A.sleepTargetHoursOverride).toBe(13.5);
  });

  it("copies only gauge fields to the other baby", () => {
    const app = createInitialAppState();
    app.profiles.A.milkGaugeWindowHours = 4;
    app.profiles.B.displayName = "keep";
    const copied = copyGaugeSettings(app.profiles, "A");
    expect(copied.B.milkGaugeWindowHours).toBe(4);
    expect(copied.B.displayName).toBe("keep");
    expect(gaugeProfilesEqual(copied, { ...copied, B: { ...copied.B, displayName: "ignored" } })).toBe(true);
  });
  it("derives care gauge defaults outside the settings component", () => {
    const app = createInitialAppState(new Date("2026-09-20T00:00:00+09:00"));
    const model = buildCareGaugeSettingsModel({
      babyId: "A",
      profile: app.profiles.A,
      displayProfile: app.profiles.A,
      events: app.events,
      now: new Date("2026-09-20T12:00:00+09:00"),
    });
    expect(model.milkWindowHours).toBe(3);
    expect(model.diaperWindowMinutes).toBe(120);
    expect(model.sleepUsesAgeDefaults).toBe(true);
  });
});
