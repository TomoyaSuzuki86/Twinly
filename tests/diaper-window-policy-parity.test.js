import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import {
  clampDiaperWindowMinutes as clampClient,
  DEFAULT_DIAPER_WINDOW_MINUTES as CLIENT_DEFAULT,
  MAX_DIAPER_WINDOW_MINUTES as CLIENT_MAX,
  MIN_DIAPER_WINDOW_MINUTES as CLIENT_MIN,
  resolveDiaperWindowMinutes as resolveClient,
} from "../src/lib/diaper-window-policy";

const require = createRequire(import.meta.url);
const {
  clampDiaperWindowMinutes: clampServer,
  DEFAULT_DIAPER_WINDOW_MINUTES: SERVER_DEFAULT,
  MAX_DIAPER_WINDOW_MINUTES: SERVER_MAX,
  MIN_DIAPER_WINDOW_MINUTES: SERVER_MIN,
  resolveDiaperWindowMinutes: resolveServer,
} = require("../functions/diaper-window-policy.js");

describe("client/server diaper window policy parity", () => {
  it("keeps bounds and default identical", () => {
    expect(SERVER_MIN).toBe(CLIENT_MIN);
    expect(SERVER_MAX).toBe(CLIENT_MAX);
    expect(SERVER_DEFAULT).toBe(CLIENT_DEFAULT);
    expect(CLIENT_MIN).toBe(30);
    expect(CLIENT_MAX).toBe(720);
    expect(CLIENT_DEFAULT).toBe(120);
  });

  it("clamps valid numeric values identically", () => {
    for (const [value, expected] of [[1, 30], [30, 30], [120, 120], [720, 720], [900, 720]]) {
      expect(clampClient(value)).toBe(expected);
      expect(clampServer(value)).toBe(expected);
      expect(resolveClient(value)).toBe(expected);
      expect(resolveServer(value)).toBe(expected);
    }
  });

  it("uses the same default for invalid stored values", () => {
    for (const value of [undefined, null, "", 0, "0", "not-a-number"]) {
      expect(resolveClient(value)).toBe(120);
      expect(resolveServer(value)).toBe(120);
    }
  });
});
