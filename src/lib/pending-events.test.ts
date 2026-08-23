import { beforeEach, describe, expect, it } from "vitest";
import type { LogEvent } from "@/types";
import {
  loadPendingEvents,
  mergePendingEvents,
  removePendingEvents,
  storePendingEvents,
} from "./pending-events";

const event = (id: string, timestamp: number): LogEvent => ({
  id,
  babyId: "A",
  type: "milk",
  timestamp,
  milkMl: 140,
});

describe("pending events", () => {
  beforeEach(() => localStorage.clear());

  it("keeps unsynced events across page reloads until they are confirmed", () => {
    storePendingEvents("user-1", [event("one", 100)]);
    storePendingEvents("user-1", [event("two", 200)]);

    expect(loadPendingEvents("user-1").map((item) => item.id)).toEqual(["one", "two"]);

    removePendingEvents("user-1", ["one"]);
    expect(loadPendingEvents("user-1").map((item) => item.id)).toEqual(["two"]);
  });

  it("merges pending records without duplicating records already stored remotely", () => {
    expect(mergePendingEvents([event("one", 100)], [event("one", 100), event("two", 200)])).toEqual([
      event("two", 200),
      event("one", 100),
    ]);
  });
});
