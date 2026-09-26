import { isFamilyRelationship } from "@/lib/family-profile";
import type { FamilySession } from "@/lib/family-session-contract";

const FAMILY_SESSION_CACHE_PREFIX = "twinly-family-session:";

const familySessionCacheKey = (uid: string) => `${FAMILY_SESSION_CACHE_PREFIX}${uid}`;

const isFamilySession = (value: unknown, uid: string): value is FamilySession => {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<FamilySession>;
  return Boolean(
    candidate.family &&
    typeof candidate.family.id === "string" &&
    candidate.family.id &&
    typeof candidate.family.name === "string" &&
    typeof candidate.family.ownerUid === "string" &&
    candidate.member &&
    candidate.member.uid === uid &&
    typeof candidate.member.nickname === "string" &&
    isFamilyRelationship(candidate.member.relationship) &&
    (candidate.member.role === "owner" || candidate.member.role === "member") &&
    candidate.member.status === "active"
  );
};

export const readCachedFamilySession = (uid: string): FamilySession | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(familySessionCacheKey(uid));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!isFamilySession(parsed, uid)) {
      window.localStorage.removeItem(familySessionCacheKey(uid));
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
};

export const writeCachedFamilySession = (uid: string, session: FamilySession) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(familySessionCacheKey(uid), JSON.stringify(session));
  } catch {
    // Local cache is an optimization only. Firestore remains authoritative.
  }
};

export const clearCachedFamilySession = (uid: string) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(familySessionCacheKey(uid));
  } catch {
    // Ignore storage failures.
  }
};
