import { describe, expect, it } from "vitest";
import {
  normalizeStoredTheme,
  parseStoredLayoutMode,
  resolveAppliedTheme,
} from "./appearance-preferences";

describe("appearance preferences", () => {
  it("normalizes legacy theme ids while preserving current and unknown ids", () => {
    expect(normalizeStoredTheme(null)).toBe("dark");
    expect(normalizeStoredTheme("light")).toBe("milk");
    expect(normalizeStoredTheme("pink")).toBe("sakura");
    expect(normalizeStoredTheme("yellow")).toBe("sun");
    expect(normalizeStoredTheme("forest")).toBe("forest");
    expect(normalizeStoredTheme("custom-theme")).toBe("custom-theme");
  });

  it("applies free themes and gates premium themes without changing the fallback", () => {
    expect(resolveAppliedTheme("dark", false)).toBe("dark");
    expect(resolveAppliedTheme("milk", false)).toBe("milk");
    expect(resolveAppliedTheme("sakura", false)).toBe("dark");
    expect(resolveAppliedTheme("sun", false)).toBe("dark");
    expect(resolveAppliedTheme("forest", false)).toBe("dark");
    expect(resolveAppliedTheme("sakura", true)).toBe("sakura");
    expect(resolveAppliedTheme("sun", true)).toBe("sun");
    expect(resolveAppliedTheme("forest", true)).toBe("forest");
    expect(resolveAppliedTheme("unknown", true)).toBe("dark");
  });

  it("defaults an unset layout to split while preserving explicit user choices", () => {
    expect(parseStoredLayoutMode("split")).toBe("split");
    expect(parseStoredLayoutMode("single")).toBe("single");
    expect(parseStoredLayoutMode(null)).toBe("split");
    expect(parseStoredLayoutMode("unknown")).toBe("split");
  });
});
