import { describe, expect, it } from "vitest";
import {
  hasSyncActivity,
  isSyncSettled,
  shouldShowAutomaticSyncSpinner,
  type ManualSyncSignals,
} from "./manual-sync-state";

const signals = (overrides: Partial<ManualSyncSignals> = {}): ManualSyncSignals => ({
  checking: false,
  routineStatus: false,
  syncMessage: undefined,
  ...overrides,
});

describe("manual sync state", () => {
  it("treats checking, routine status, and sync messages as sync activity", () => {
    expect(hasSyncActivity(signals({ checking: true }))).toBe(true);
    expect(hasSyncActivity(signals({ routineStatus: true }))).toBe(true);
    expect(hasSyncActivity(signals({ syncMessage: "保存を待っています" }))).toBe(true);
    expect(hasSyncActivity(signals())).toBe(false);
  });

  it("keeps the automatic spinner visible during initial load even without active signals", () => {
    expect(shouldShowAutomaticSyncSpinner(signals(), true)).toBe(true);
    expect(shouldShowAutomaticSyncSpinner(signals(), false)).toBe(false);
    expect(shouldShowAutomaticSyncSpinner(signals({ checking: true }), false)).toBe(true);
  });

  it("settles only when every sync activity signal has cleared", () => {
    expect(isSyncSettled(signals())).toBe(true);
    expect(isSyncSettled(signals({ checking: true }))).toBe(false);
    expect(isSyncSettled(signals({ routineStatus: true }))).toBe(false);
    expect(isSyncSettled(signals({ syncMessage: "同期中" }))).toBe(false);
  });
});
