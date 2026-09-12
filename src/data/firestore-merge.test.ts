import { describe, expect, it } from "vitest";
import type { LogEvent } from "@/types";
import { mergeEventChangeByServerOrder } from "./firestore-app-repository";

const base: LogEvent = {
  id: "milk-1",
  babyId: "A",
  type: "milk",
  timestamp: 1_000,
  milkMl: 120,
  note: "before",
};

describe("server-ordered event merge", () => {
  it("preserves unrelated remote fields while applying the local field change", () => {
    const remote = { ...base, note: "remote note" };
    const local = { ...base, milkMl: 150 };
    const result = mergeEventChangeByServerOrder({ id: base.id, before: base, after: local }, remote);
    expect(result.confirmed?.after).toMatchObject({ milkMl: 150, note: "remote note" });
  });

  it("lets the later server-processed mutation win when both changed the same field", () => {
    const remote = { ...base, milkMl: 180 };
    const local = { ...base, milkMl: 150 };
    const result = mergeEventChangeByServerOrder({ id: base.id, before: base, after: local }, remote);
    expect(result.confirmed?.after?.milkMl).toBe(150);
  });

  it("lets a later delete remove a remotely edited record without a dialog", () => {
    const remote = { ...base, milkMl: 180 };
    const result = mergeEventChangeByServerOrder({ id: base.id, before: base }, remote);
    expect(result.confirmed).toEqual({ id: base.id, before: remote });
  });

  it("lets a later edit recreate a record that an earlier transaction deleted", () => {
    const local = { ...base, milkMl: 150 };
    const result = mergeEventChangeByServerOrder({ id: base.id, before: base, after: local }, undefined);
    expect(result.confirmed).toEqual({ id: base.id, after: local });
  });
});