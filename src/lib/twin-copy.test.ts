import { describe, expect, it } from "vitest";
import type { LogEvent } from "@/types";
import { hasTwinCopyDuplicate, supportsTwinCopyEvent } from "./twin-copy";

const base = (overrides: Partial<LogEvent> = {}): LogEvent => ({
  id: "source",
  babyId: "A",
  type: "daily",
  timestamp: 1000,
  note: "memo",
  ...overrides,
});

describe("twin copy", () => {
  it("supports care, daily, and sleep records requested by the editor", () => {
    expect(supportsTwinCopyEvent(base({ type: "milk" }))).toBe(true);
    expect(supportsTwinCopyEvent(base({ type: "diaper" }))).toBe(true);
    expect(supportsTwinCopyEvent(base({ type: "daily" }))).toBe(true);
    expect(supportsTwinCopyEvent(base({ type: "sleepStart" }))).toBe(true);
    expect(supportsTwinCopyEvent(base({ type: "wake" }))).toBe(true);
    expect(supportsTwinCopyEvent(base({ type: "solidFood" }))).toBe(false);
  });

  it("detects the same daily memo on the other twin", () => {
    const source = base();
    const existing = base({ id: "target", babyId: "B" });
    expect(hasTwinCopyDuplicate([source, existing], source, { note: "memo", timestamp: 1000 })).toBe(true);
  });

  it("does not treat a different milk amount as a duplicate", () => {
    const source = base({ type: "milk", milkMethod: "bottle", milkMl: 120 });
    const existing = base({ id: "target", babyId: "B", type: "milk", milkMethod: "bottle", milkMl: 140 });
    expect(hasTwinCopyDuplicate([source, existing], source, { milkMethod: "bottle", milkMl: 120, timestamp: 1000 })).toBe(false);
  });
});
