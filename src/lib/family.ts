import { User } from "firebase/auth";
import { collection, doc, getDoc, getDocFromServer, onSnapshot, serverTimestamp, updateDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "@/firebase";
import { beginBackgroundSync } from "@/lib/background-sync";
import { FamilyInfo, FamilyMember, FamilyRelationship } from "@/types";

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

export type FamilySession = {
  family: FamilyInfo;
  member: FamilyMember;
};

type FamilySetupResult = { familyId: string | null };
type FamilyOnboardingInput =
  | { nickname: string; relationship: FamilyRelationship }
  | { migrateLegacyOnly: true };

const FAMILY_SESSION_CACHE_PREFIX = "twinly-family-session:";

class InvalidFamilySessionError extends Error {}

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

const writeCachedFamilySession = (uid: string, session: FamilySession) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(familySessionCacheKey(uid), JSON.stringify(session));
  } catch {
    // Local cache is an optimization only. Firestore remains the source of truth.
  }
};

const clearCachedFamilySession = (uid: string) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(familySessionCacheKey(uid));
  } catch {
    // Ignore storage failures.
  }
};

const callCompleteFamilyOnboarding = async (input: FamilyOnboardingInput) => {
  if (!functions) throw new Error("Firebase Functions is not configured");
  const call = httpsCallable<FamilyOnboardingInput, FamilySetupResult>(functions, "completeFamilyOnboarding");
  return (await call(input)).data;
};

const loadFamilySessionFresh = async (user: User, forceServer: boolean): Promise<FamilySession | null> => {
  if (!db) return null;
  const userRef = doc(db, "users", user.uid);
  const userSnap = forceServer ? await getDocFromServer(userRef) : await getDoc(userRef);
  let familyId = userSnap.data()?.activeFamilyId;
  let migratedLegacyUser = false;
  if (typeof familyId !== "string" || !familyId) {
    const result = await callCompleteFamilyOnboarding({ migrateLegacyOnly: true });
    familyId = result.familyId;
    migratedLegacyUser = Boolean(familyId);
  }
  if (typeof familyId !== "string" || !familyId) return null;

  const familyRef = doc(db, "families", familyId);
  const memberRef = doc(db, "families", familyId, "members", user.uid);
  const readServer = forceServer || migratedLegacyUser;
  const [familySnap, memberSnap] = await Promise.all([
    readServer ? getDocFromServer(familyRef) : getDoc(familyRef),
    readServer ? getDocFromServer(memberRef) : getDoc(memberRef),
  ]);
  if (!familySnap.exists() || !memberSnap.exists() || memberSnap.data().status === "inactive") {
    throw new InvalidFamilySessionError("家族情報が見つからないか、アクセス権がありません。");
  }

  return {
    family: {
      id: familyId,
      name: String(familySnap.data().name || "わが家"),
      ownerUid: String(familySnap.data().ownerUid || ""),
    },
    member: {
      uid: user.uid,
      nickname: String(memberSnap.data().nickname || user.displayName || "メンバー"),
      relationship: isFamilyRelationship(memberSnap.data().relationship)
        ? memberSnap.data().relationship
        : "other",
      role: memberSnap.data().role === "owner" ? "owner" : "member",
      status: "active",
      profileCompleted: memberSnap.data().profileCompleted !== false,
    },
  };
};

const refreshCachedFamilySession = (user: User, cached: FamilySession) => {
  const finishSync = beginBackgroundSync("family-session");
  void loadFamilySessionFresh(user, true)
    .then((fresh) => {
      if (!fresh) {
        clearCachedFamilySession(user.uid);
        if (typeof window !== "undefined") window.location.reload();
        return;
      }

      writeCachedFamilySession(user.uid, fresh);
      const familyChanged =
        fresh.family.id !== cached.family.id ||
        fresh.family.name !== cached.family.name ||
        fresh.family.ownerUid !== cached.family.ownerUid;
      if (familyChanged && typeof window !== "undefined") window.location.reload();
    })
    .catch((error) => {
      if (error instanceof InvalidFamilySessionError) {
        clearCachedFamilySession(user.uid);
        if (typeof window !== "undefined") window.location.reload();
        return;
      }
      console.warn("Failed to refresh cached family session", error);
    })
    .finally(finishSync);
};

export const loadFamilySession = async (user: User): Promise<FamilySession | null> => {
  const cached = readCachedFamilySession(user.uid);
  if (cached) {
    refreshCachedFamilySession(user, cached);
    return cached;
  }

  try {
    const session = await loadFamilySessionFresh(user, false);
    if (session) writeCachedFamilySession(user.uid, session);
    else clearCachedFamilySession(user.uid);
    return session;
  } catch (error) {
    clearCachedFamilySession(user.uid);
    throw error;
  }
};

export const subscribeFamilyMembers = (
  familyId: string,
  onChange: (members: FamilyMember[]) => void,
  onError?: (error: unknown) => void
) => {
  if (!db) return () => {};
  return onSnapshot(collection(db, "families", familyId, "members"), (snapshot) => {
    const members = snapshot.docs
      .map((memberDoc) => ({ uid: memberDoc.id, ...memberDoc.data() }) as FamilyMember)
      .filter((member) => member.status !== "inactive")
      .sort((a, b) => (a.role === b.role ? a.nickname.localeCompare(b.nickname, "ja") : a.role === "owner" ? -1 : 1));
    onChange(members);
  }, onError);
};

export const updateMemberProfile = async (
  familyId: string,
  uid: string,
  profile: { nickname: string; relationship: FamilyRelationship }
) => {
  if (!db) throw new Error("Firebase is not configured");
  const nickname = normalizeNickname(profile.nickname);
  if (!nickname) throw new Error("ニックネームを入力してください");
  await updateDoc(doc(db, "families", familyId, "members", uid), {
    nickname,
    relationship: profile.relationship,
    profileCompleted: true,
    updatedAt: serverTimestamp(),
  });
};

export const completeFamilyOnboarding = async (profile: {
  nickname: string;
  relationship: FamilyRelationship;
}) => {
  return callCompleteFamilyOnboarding(profile);
};

export const joinFamilyWithInvite = async (input: {
  token: string;
  nickname: string;
  relationship: FamilyRelationship;
}) => {
  if (!functions) throw new Error("Firebase Functions is not configured");
  const call = httpsCallable<typeof input, FamilySetupResult>(functions, "joinFamily");
  return (await call(input)).data;
};

export const createFamilyInvite = async (familyId: string) => {
  if (!functions) throw new Error("Firebase Functions is not configured");
  const call = httpsCallable<{ familyId: string }, { token: string; expiresAt: number }>(functions, "createFamilyInvite");
  return (await call({ familyId })).data;
};
