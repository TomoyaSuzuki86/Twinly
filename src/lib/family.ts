import { User } from "firebase/auth";
import { collection, doc, getDoc, getDocFromServer, onSnapshot, serverTimestamp, updateDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "@/firebase";
import { beginBackgroundSync } from "@/lib/background-sync";
import {
  isFamilyRelationship,
  normalizeNickname,
} from "@/lib/family-profile";
import {
  clearCachedFamilySession,
  readCachedFamilySession,
  writeCachedFamilySession,
} from "@/lib/family-session-cache";
import type { FamilySession } from "@/lib/family-session-contract";
import { FamilyMember, FamilyRelationship } from "@/types";

export {
  familyRelationshipOptions,
  isFamilyRelationship,
  normalizeNickname,
  relationshipLabels,
} from "@/lib/family-profile";

export type { FamilySession } from "@/lib/family-session-contract";
export { readCachedFamilySession } from "@/lib/family-session-cache";

type FamilySetupResult = { familyId: string | null };
type FamilyOnboardingInput =
  | { nickname: string; relationship: FamilyRelationship }
  | { migrateLegacyOnly: true };

export class InvalidFamilySessionError extends Error {}

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
  if (!familySnap.exists()) {
    throw new InvalidFamilySessionError("家族データが見つかりません。家族との紐付け情報が古くなっている可能性があります。");
  }
  if (!memberSnap.exists()) {
    throw new InvalidFamilySessionError("このアカウントの家族メンバー登録が見つかりません。家族の管理者から再招待が必要です。");
  }
  if (memberSnap.data().status === "inactive") {
    throw new InvalidFamilySessionError("このアカウントの家族メンバー登録は無効になっています。家族の管理者に確認してください。");
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
  } catch (firstError) {
    // A preview channel is a separate origin, so it starts without Twinly's
    // family-session cache. If the first server read races an auth-token refresh
    // or hits a transient backend failure, retry once from the server before
    // showing the blocking family-session error. Confirmed access failures are
    // not transient and must be surfaced immediately.
    if (firstError instanceof InvalidFamilySessionError) {
      clearCachedFamilySession(user.uid);
      throw firstError;
    }
    try {
      if (typeof user.getIdToken === "function") await user.getIdToken(true);
      const session = await loadFamilySessionFresh(user, true);
      if (session) writeCachedFamilySession(user.uid, session);
      else clearCachedFamilySession(user.uid);
      return session;
    } catch (retryError) {
      clearCachedFamilySession(user.uid);
      console.warn("Family session retry failed", { firstError, retryError });
      throw retryError;
    }
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
