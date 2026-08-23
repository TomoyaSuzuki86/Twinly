import { describe, expect, it } from "vitest";
import { createInitialAppState, mergeSharedAppState, stripLegacyCalendarFields, toSharedAppState } from "./app-state";

describe("stripLegacyCalendarFields", () => {
  it("removes legacy Google Calendar fields from imported app state", () => {
    const migrated = stripLegacyCalendarFields({
      profiles: {
        A: {
          babyId: "A",
          displayName: "Baby A",
          birthDate: "2025-01-01",
          diaperSize: "S",
          diaperStockBySize: { S: 12 },
          diaperPurchaseUrl: "https://example.com/a",
          calendarName: "育児記録-A",
          calendarId: "calendar-a",
        },
        B: {
          babyId: "B",
          displayName: "Baby B",
          birthDate: "2025-01-01",
          diaperSize: "S",
          diaperStockBySize: { S: 8 },
          diaperPurchaseUrl: "https://example.com/b",
          calendarName: "育児記録-B",
          calendarId: "calendar-b",
        },
      },
      events: [
        {
          id: "milk-1",
          babyId: "A",
          type: "milk",
          timestamp: 1,
          milkMl: 120,
          calendarStatus: "synced",
          calendarEventId: "event-1",
        },
        {
          id: "daily-1",
          babyId: "B",
          type: "daily",
          timestamp: 2,
          note: "good day",
          calendarStatus: "error",
        },
      ],
      ui: {
        lastViewedDate: "2026-04-18",
      },
    });

    expect(migrated.profiles.A).not.toHaveProperty("calendarName");
    expect(migrated.profiles.A).not.toHaveProperty("calendarId");
    expect(migrated.profiles.B).not.toHaveProperty("calendarName");
    expect(migrated.profiles.B).not.toHaveProperty("calendarId");
    expect(migrated.events[0]).not.toHaveProperty("calendarStatus");
    expect(migrated.events[0]).not.toHaveProperty("calendarEventId");
    expect(migrated.events[1]).not.toHaveProperty("calendarStatus");
    expect(migrated.profiles.A.sleepTargetHoursOverride).toBeNull();
  });
});

describe("createInitialAppState", () => {
  it("builds baby profiles without any calendar configuration", () => {
    const app = createInitialAppState(new Date("2026-04-18T09:00:00+09:00"));

    expect(app.profiles.A).not.toHaveProperty("calendarName");
    expect(app.profiles.A).not.toHaveProperty("calendarId");
    expect(app.profiles.B).not.toHaveProperty("calendarName");
    expect(app.profiles.B).not.toHaveProperty("calendarId");
    expect(app.events).toEqual([]);
    expect(app.profiles.A.sleepTargetHoursOverride).toBeNull();
  });
});

describe("shared app state helpers", () => {
  it("removes ui state from Firestore payloads", () => {
    const app = createInitialAppState(new Date("2026-04-18T09:00:00+09:00"));
    const shared = toSharedAppState(app);

    expect(shared).not.toHaveProperty("ui");
    expect(shared.profiles).toEqual(app.profiles);
    expect(shared.events).toEqual(app.events);
  });

  it("merges remote data with local ui state", () => {
    const app = createInitialAppState(new Date("2026-04-18T09:00:00+09:00"));
    const merged = mergeSharedAppState(
      {
        profiles: app.profiles,
        events: [
          {
            id: "event-1",
            babyId: "A",
            type: "milk",
            timestamp: 1,
            milkMl: 100,
          },
        ],
      },
      { lastViewedDate: "2026-04-20" }
    );

    expect(merged.ui.lastViewedDate).toBe("2026-04-20");
    expect(merged.events).toHaveLength(1);
    expect(merged.events[0].id).toBe("event-1");
  });
});
