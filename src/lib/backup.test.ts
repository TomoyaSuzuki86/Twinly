import { describe, expect, it } from "vitest";
import { createInitialAppState } from "./app-state";
import { parseBackup } from "./backup";

describe("parseBackup", () => {
  it("accepts a valid Twinly backup", () => {
    const app = createInitialAppState(new Date("2026-09-14T00:00:00+09:00"));
    app.events.push({
      id: "milk-1",
      babyId: "A",
      type: "milk",
      timestamp: 1_700_000_000_000,
      milkMl: 150,
    });

    expect(parseBackup(JSON.stringify(app))).toEqual(app);
  });

  it("rejects duplicate event ids", () => {
    const app = createInitialAppState(new Date("2026-09-14T00:00:00+09:00"));
    const event = {
      id: "duplicate",
      babyId: "A" as const,
      type: "milk" as const,
      timestamp: 1_700_000_000_000,
      milkMl: 150,
    };
    app.events = [event, { ...event, babyId: "B" }];

    expect(() => parseBackup(JSON.stringify(app))).toThrow("記録の形式またはIDが正しくありません");
  });

  it("rejects prototype-pollution keys", () => {
    expect(() =>
      parseBackup(
        '{"profiles":{"A":{"__proto__":{},"babyId":"A"},"B":{"babyId":"B"}},"events":[],"ui":{"lastViewedDate":"2026-09-14"}}'
      )
    ).toThrow("不正なバックアップです");
  });

  it("removes legacy calendar fields and restores profile defaults", () => {
    const app = createInitialAppState(new Date("2026-09-14T00:00:00+09:00"));
    const legacy = JSON.parse(JSON.stringify(app));
    legacy.profiles.A.calendarId = "legacy-calendar";
    legacy.profiles.A.calendarName = "legacy";
    delete legacy.profiles.A.milkGaugeWindowHours;
    delete legacy.profiles.A.diaperGaugeWindowMinutes;
    delete legacy.profiles.A.activityLimitMinutesCustom;
    delete legacy.profiles.A.sleepTargetHoursCustom;
    legacy.events = [
      {
        id: "legacy-event",
        babyId: "A",
        type: "milk",
        timestamp: 1_700_000_000_000,
        milkMl: 150,
        calendarStatus: "synced",
        calendarEventId: "legacy-google-event",
      },
    ];

    const restored = parseBackup(JSON.stringify(legacy));

    expect(restored.profiles.A).not.toHaveProperty("calendarId");
    expect(restored.profiles.A).not.toHaveProperty("calendarName");
    expect(restored.profiles.A.milkGaugeWindowHours).toBe(3);
    expect(restored.profiles.A.diaperGaugeWindowMinutes).toBe(120);
    expect(restored.profiles.A.activityLimitMinutesCustom).toBeNull();
    expect(restored.profiles.A.sleepTargetHoursCustom).toBeNull();
    expect(restored.events[0]).not.toHaveProperty("calendarStatus");
    expect(restored.events[0]).not.toHaveProperty("calendarEventId");
  });
});