import type { FamilyRelationship } from "@/types";

export const relationshipLabels: Record<FamilyRelationship, string> = {
  father: "父",
  mother: "母",
  grandfather: "祖父",
  grandmother: "祖母",
  other: "その他",
};

export const familyRelationshipOptions = Object.entries(relationshipLabels) as [FamilyRelationship, string][];

export const normalizeNickname = (value: string) => value.trim().slice(0, 20);

export const isFamilyRelationship = (value: unknown): value is FamilyRelationship =>
  typeof value === "string" && Object.prototype.hasOwnProperty.call(relationshipLabels, value);
