import { describe, expect, it } from "vitest";
import { createInitialAppState } from "./app-state";
import { buildDashboardSelectors } from "./dashboard-selectors";
import type { LogEvent } from "@/types";

const at = (time: string) => new Date(`2026-04-18T${time}:00+09:00`).getTime();

const sleep = (id: string, type: "sleepStart" | "wake", timestamp: number): LogEvent => ({
  id,
  babyId: "A",
  type,
  timestamp,
});

describe("buildDashboardSelectors split-layout invariants", () => {
  it("keeps each baby's records isolated while both dashboard slices are active", () => {
    const now = new Date("2026-04-18T10:20:00+09:00");
    const app = createInitialAppState(now);
    app.events = [
      { id: "a-milk", babyId: "A", type: "milk", timestamp: at("09:45"), milkMl: 150 },
      { id: "b-diaper", babyId: "B", type: "diaper", timestamp: at("10:00"), diaperKind: "pee" },
    ];

    const dashboard = buildDashboardSelectors(app, "2026-04-18", "2026-04-18", now);

    expect(dashboard.A.currentEvents.map((event) => event.id)).toEqual(["a-milk"]);
    expect(dashboard.B.currentEvents.map((event) => event.id)).toEqual(["b-diaper"]);
    expect(dashboard.A.latestEvents.every((event) => event.babyId === "A")).toBe(true);
    expect(dashboard.B.latestEvents.every((event) => event.babyId === "B")).toBe(true);
  });

  it("uses each baby's configured diaper gauge interval", () => {
    const now = new Date("2026-04-18T13:00:00+09:00");
    const app = createInitialAppState(now);
    app.profiles.A.diaperGaugeWindowMinutes = 240;
    app.events = [
      { id: "a-diaper", babyId: "A", type: "diaper", timestamp: at("12:00"), diaperKind: "pee" },
    ];

    const dashboard = buildDashboardSelectors(app, "2026-04-18", "2026-04-18", now);

    expect(dashboard.A.tabGaugePercents.diaper).toBe(25);
  });

  it("hides the activity tab gauge while the baby is sleeping", () => {
    const now = new Date("2026-04-18T10:20:00+09:00");
    const app = createInitialAppState(now);
    app.profiles.A.activityLimitMinutesOverride = 120;
    app.events = [
      sleep("reset-sleep", "sleepStart", at("07:30")),
      sleep("reset-wake", "wake", at("08:00")),
      sleep("nap", "sleepStart", at("10:05")),
    ];

    const dashboard = buildDashboardSelectors(app, "2026-04-18", "2026-04-18", now);

    expect(dashboard.A.sleeping).toBe(true);
    expect(dashboard.A.tabGaugePercents.activity).toBe(0);
    expect(dashboard.B.tabGaugePercents.activity).toBe(0);
  });
});