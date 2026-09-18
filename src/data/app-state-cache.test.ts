import { afterEach, describe, expect, it } from "vitest";
import { createInitialAppState } from "@/lib/app-state";
import { appStateCacheKey, createStartupCacheState, readCachedAppState, writeCachedAppState } from "./app-state-cache";

afterEach(() => localStorage.clear());

describe("app state startup cache", () => {
  it("restores the last real baby profiles for the same user and family", () => {
    const app = createInitialAppState(new Date("2026-09-18T08:00:00+09:00"));
    app.profiles.A.displayName = "奏汰";
    app.profiles.B.displayName = "日向";

    writeCachedAppState(localStorage, "user-1", "family-1", app);
    const cached = readCachedAppState(localStorage, "user-1", "family-1");

    expect(cached?.profiles.A.displayName).toBe("奏汰");
    expect(cached?.profiles.B.displayName).toBe("日向");
  });

  it("does not reuse another family's startup cache", () => {
    const app = createInitialAppState();
    app.profiles.A.displayName = "奏汰";
    writeCachedAppState(localStorage, "user-1", "family-1", app);

    expect(readCachedAppState(localStorage, "user-1", "family-2")).toBeNull();
  });


  it("keeps the synchronous startup cache bounded even when history is large", () => {
    const now = new Date("2026-09-18T12:00:00+09:00").getTime();
    const app = createInitialAppState(new Date(now));
    app.events = Array.from({ length: 1_200 }, (_, index) => ({
      id: `event-${index}`,
      babyId: index % 2 === 0 ? "A" as const : "B" as const,
      type: index % 3 === 0 ? "milk" as const : index % 3 === 1 ? "diaper" as const : "wake" as const,
      timestamp: now - index * 30 * 60 * 1000,
    }));

    const compact = createStartupCacheState(app, now);

    expect(compact.events.length).toBeLessThanOrEqual(418);
    expect(compact.events[0]?.id).toBe("event-0");
    expect(compact.profiles).toEqual(app.profiles);
  });

  it("drops malformed cache instead of exposing placeholder-like stale data", () => {
    const key = appStateCacheKey("user-1", "family-1");
    localStorage.setItem(key, JSON.stringify({ profiles: { A: {}, B: {} } }));

    expect(readCachedAppState(localStorage, "user-1", "family-1")).toBeNull();
    expect(localStorage.getItem(key)).toBeNull();
  });
});
