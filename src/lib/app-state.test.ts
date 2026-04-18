import { describe, expect, it } from "vitest";
import { createInitialAppState, stripLegacyCalendarFields } from "./app-state";

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
  });
});
