import { afterEach, describe, expect, it } from "vitest";
import { createInitialAppState } from "@/lib/app-state";
import { appStateCacheKey, readCachedAppState, writeCachedAppState } from "./app-state-cache";

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

  it("drops malformed cache instead of exposing placeholder-like stale data", () => {
    const key = appStateCacheKey("user-1", "family-1");
    localStorage.setItem(key, JSON.stringify({ profiles: { A: {}, B: {} } }));

    expect(readCachedAppState(localStorage, "user-1", "family-1")).toBeNull();
    expect(localStorage.getItem(key)).toBeNull();
  });
});
