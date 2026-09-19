import { afterEach, describe, expect, it } from "vitest";
import {
  isFamilyRelationship,
  normalizeNickname,
  readCachedFamilySession,
  relationshipLabels,
} from "./family";

afterEach(() => localStorage.clear());

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

  it("restores a valid cached family session for instant startup", () => {
    localStorage.setItem("twinly-family-session:user-1", JSON.stringify({
      family: { id: "family-1", name: "わが家", ownerUid: "user-1" },
      member: {
        uid: "user-1",
        nickname: "とも",
        relationship: "father",
        role: "owner",
        status: "active",
        profileCompleted: true,
      },
    }));

    expect(readCachedFamilySession("user-1")?.family.id).toBe("family-1");
    expect(readCachedFamilySession("user-1")?.member.nickname).toBe("とも");
  });

  it("rejects a cached family session belonging to another user", () => {
    localStorage.setItem("twinly-family-session:user-1", JSON.stringify({
      family: { id: "family-1", name: "わが家", ownerUid: "user-2" },
      member: {
        uid: "user-2",
        nickname: "別ユーザー",
        relationship: "other",
        role: "member",
        status: "active",
        profileCompleted: true,
      },
    }));

    expect(readCachedFamilySession("user-1")).toBeNull();
    expect(localStorage.getItem("twinly-family-session:user-1")).toBeNull();
  });
});
