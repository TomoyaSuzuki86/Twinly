import { describe, expect, it } from "vitest";
import { detectHorizontalSwipe } from "./horizontal-swipe";

describe("detectHorizontalSwipe", () => {
  it("detects a left swipe", () => {
    expect(detectHorizontalSwipe({ x: 160, y: 100 }, { x: 80, y: 108 })).toBe("left");
  });

  it("detects a right swipe", () => {
    expect(detectHorizontalSwipe({ x: 80, y: 100 }, { x: 160, y: 92 })).toBe("right");
  });

  it("ignores short horizontal movement", () => {
    expect(detectHorizontalSwipe({ x: 100, y: 100 }, { x: 140, y: 102 })).toBeNull();
  });

  it("ignores mostly vertical scrolling", () => {
    expect(detectHorizontalSwipe({ x: 100, y: 100 }, { x: 160, y: 180 })).toBeNull();
  });
});
