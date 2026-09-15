import { describe, expect, it } from "vitest";
import { resolveActiveDateAfterDayChange } from "./use-app-clock";

describe("resolveActiveDateAfterDayChange", () => {
  it("moves the viewed date forward when the user was viewing the previous today", () => {
    expect(resolveActiveDateAfterDayChange("2026-09-15", "2026-09-15", "2026-09-16"))
      .toBe("2026-09-16");
  });

  it("keeps an explicitly selected past date when today changes", () => {
    expect(resolveActiveDateAfterDayChange("2026-09-10", "2026-09-15", "2026-09-16"))
      .toBe("2026-09-10");
  });
});
