import { describe, expect, it } from "vitest";
import { isFamilyRelationship, normalizeNickname, relationshipLabels } from "./family";

describe("family profile", () => {
  it("normalizes a nickname without retaining surrounding whitespace", () => {
    expect(normalizeNickname("  とも  ")).toBe("とも");
    expect(normalizeNickname("1234567890123456789012345")).toHaveLength(20);
  });

  it("accepts only the supported relationships", () => {
    expect(isFamilyRelationship("father")).toBe(true);
    expect(isFamilyRelationship("mother")).toBe(true);
    expect(isFamilyRelationship("partner")).toBe(false);
    expect(isFamilyRelationship(null)).toBe(false);
  });

  it("has a Japanese label for every relationship", () => {
    expect(Object.values(relationshipLabels)).toEqual(["父", "母", "祖父", "祖母", "その他"]);
  });
});
