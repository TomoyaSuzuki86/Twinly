import { describe, expect, it } from "vitest";
import { resolveAppModal } from "./use-app-modal-controller";

describe("resolveAppModal", () => {
  it("resolves care, edit, and settings modals", () => {
    expect(resolveAppModal("milk", { babyId: "A" })).toEqual({ kind: "milk", babyId: "A" });
    expect(resolveAppModal("diaper", { babyId: "B" })).toEqual({ kind: "diaper", babyId: "B" });
    expect(resolveAppModal("edit", { eventId: "event-1" })).toEqual({ kind: "edit", eventId: "event-1" });
    expect(resolveAppModal("settings")).toEqual({ kind: "settings" });
  });

  it("preserves the existing no-op contract for mismatched payloads", () => {
    expect(resolveAppModal("milk", { eventId: "event-1" })).toBeNull();
    expect(resolveAppModal("edit", { babyId: "A" })).toBeNull();
    expect(resolveAppModal("diaper")).toBeNull();
  });
});
