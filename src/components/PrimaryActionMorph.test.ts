import { describe, expect, it } from "vitest";
import {
  MORPH_FINAL_INTRUSION,
  MORPH_MIDPOINT_INTRUSION,
  MORPH_START_INTRUSION,
  calculatePrimaryActionMorphFrame,
  getPrimaryActionMorphSnapTarget,
  type MorphRect,
} from "./PrimaryActionMorph";

const rect = (left: number, top: number, width: number, height: number): MorphRect => ({
  left,
  top,
  width,
  height,
});

describe("PrimaryActionMorph geometry", () => {
  it("keeps source geometry before the morph begins", () => {
    const food = rect(20, 200, 140, 112);
    const diaper = rect(176, 200, 140, 112);
    const sleep = rect(20, 324, 296, 80);
    const frame = calculatePrimaryActionMorphFrame({
      stickyBottom: food.top + MORPH_START_INTRUSION,
      bounds: { left: 0, width: 336 },
      foodRect: food,
      diaperRect: diaper,
      sleepRect: sleep,
      splitLayoutActive: false,
    });

    expect(frame.food.progress).toBe(0);
    expect(frame.diaper.progress).toBe(0);
    expect(frame.sleep?.progress).toBe(0);
    expect(frame.food.rect).toEqual(food);
    expect(frame.diaper.rect).toEqual(diaper);
  });

  it("lands three compact actions in equal slots at the final position", () => {
    const frame = calculatePrimaryActionMorphFrame({
      stickyBottom: 336,
      bounds: { left: 0, width: 330 },
      foodRect: rect(20, 200, 140, 112),
      diaperRect: rect(170, 200, 140, 112),
      sleepRect: rect(20, 324, 290, 80),
      splitLayoutActive: false,
    });

    expect(frame.intrusion).toBe(MORPH_FINAL_INTRUSION);
    expect(frame.food.rect).toEqual({ left: 6, top: 339, width: 102, height: 58 });
    expect(frame.diaper.rect).toEqual({ left: 114, top: 339, width: 102, height: 58 });
    expect(frame.sleep?.rect).toEqual({ left: 222, top: 339, width: 102, height: 58 });
    expect(frame.food.interactive).toBe(true);
    expect(frame.diaper.interactive).toBe(true);
    expect(frame.sleep?.interactive).toBe(true);
  });

  it("keeps two equal slots when sleep management is disabled", () => {
    const frame = calculatePrimaryActionMorphFrame({
      stickyBottom: 336,
      bounds: { left: 0, width: 330 },
      foodRect: rect(20, 200, 140, 112),
      diaperRect: rect(170, 200, 140, 112),
      sleepRect: null,
      splitLayoutActive: false,
    });

    expect(frame.sleep).toBeNull();
    expect(frame.food.rect.width).toBe(156);
    expect(frame.diaper.rect.width).toBe(156);
    expect(frame.food.rect.left).toBe(6);
    expect(frame.diaper.rect.left).toBe(168);
  });

  it("uses the same snap thresholds as the legacy enhancer", () => {
    expect(getPrimaryActionMorphSnapTarget(MORPH_START_INTRUSION)).toBeNull();
    expect(getPrimaryActionMorphSnapTarget(MORPH_START_INTRUSION + 10)).toBe(MORPH_START_INTRUSION);
    expect(getPrimaryActionMorphSnapTarget(MORPH_MIDPOINT_INTRUSION)).toBe(MORPH_FINAL_INTRUSION);
    expect(getPrimaryActionMorphSnapTarget(MORPH_FINAL_INTRUSION - 10)).toBe(MORPH_FINAL_INTRUSION);
    expect(getPrimaryActionMorphSnapTarget(MORPH_FINAL_INTRUSION)).toBeNull();
  });
});
