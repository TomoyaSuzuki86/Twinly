import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import {
  clampMilkWindowHours as clampClientMilkWindowHours,
  DEFAULT_MILK_WINDOW_HOURS as CLIENT_DEFAULT,
  MAX_MILK_WINDOW_HOURS as CLIENT_MAX,
  MIN_MILK_WINDOW_HOURS as CLIENT_MIN,
  normalizeMilkWindowInput,
} from "../src/lib/milk-window-policy";

const require = createRequire(import.meta.url);
const {
  clampMilkWindowHours: clampServerMilkWindowHours,
  DEFAULT_MILK_WINDOW_HOURS: SERVER_DEFAULT,
  MAX_MILK_WINDOW_HOURS: SERVER_MAX,
  MIN_MILK_WINDOW_HOURS: SERVER_MIN,
  resolveMilkWindowHours,
} = require("../functions/milk-window-policy.js");

describe("client/server milk window policy parity", () => {
  it("keeps the domain bounds and default identical", () => {
    expect(SERVER_MIN).toBe(CLIENT_MIN);
    expect(SERVER_MAX).toBe(CLIENT_MAX);
    expect(SERVER_DEFAULT).toBe(CLIENT_DEFAULT);
    expect(CLIENT_MIN).toBe(0.5);
    expect(CLIENT_MAX).toBe(12);
    expect(CLIENT_DEFAULT).toBe(3);
  });

  it("clamps valid numeric values identically", () => {
    const cases = [
      [-1, 0.5],
      [0, 0.5],
      [0.5, 0.5],
      [3, 3],
      [12, 12],
      [20, 12],
    ];

    for (const [value, expected] of cases) {
      expect(clampClientMilkWindowHours(value)).toBe(expected);
      expect(clampServerMilkWindowHours(value)).toBe(expected);
      expect(resolveMilkWindowHours(value)).toBe(expected);
    }
  });

  it("preserves the server fallback for non-numeric stored values", () => {
    expect(resolveMilkWindowHours(undefined)).toBe(3);
    expect(resolveMilkWindowHours("not-a-number")).toBe(3);
    expect(resolveMilkWindowHours(null)).toBe(0.5);
  });

  it("preserves the settings input fallback before clamping", () => {
    expect(normalizeMilkWindowInput("")).toBe(3);
    expect(normalizeMilkWindowInput(0)).toBe(3);
    expect(normalizeMilkWindowInput("0")).toBe(3);
    expect(normalizeMilkWindowInput("not-a-number")).toBe(3);
    expect(normalizeMilkWindowInput("-1")).toBe(0.5);
    expect(normalizeMilkWindowInput("20")).toBe(12);
  });
});
