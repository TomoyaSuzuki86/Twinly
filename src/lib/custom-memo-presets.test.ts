import { describe, expect, it } from "vitest";
import {
  createCustomMemoPreset,
  prependCustomMemoPreset,
  removeCustomMemoPreset,
} from "./custom-memo-presets";

describe("custom memo presets", () => {
  it("normalizes user input and rejects empty presets", () => {
    expect(createCustomMemoPreset(" 🍼 ", " げっぷ ", () => "id-1")).toEqual({
      id: "id-1",
      emoji: "🍼",
      text: "げっぷ",
    });
    expect(createCustomMemoPreset(" ", "memo", () => "id-2")).toBeNull();
    expect(createCustomMemoPreset("🍼", " ", () => "id-3")).toBeNull();
  });

  it("adds newest first and deletes only the selected preset", () => {
    const existing = [{ id: "old", emoji: "💊", text: "薬" }];
    const next = { id: "new", emoji: "🍼", text: "げっぷ" };
    expect(prependCustomMemoPreset(existing, next).map((item) => item.id)).toEqual(["new", "old"]);
    expect(removeCustomMemoPreset([next, ...existing], "new")).toEqual(existing);
  });
});
