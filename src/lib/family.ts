import { User } from "firebase/auth";
import { collection, doc, getDoc, getDocFromServer, onSnapshot, serverTimestamp, updateDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "@/firebase";
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

const callCompleteFamilyOnboarding = async (input: FamilyOnboardingInput) => {
  if (!functions) throw new Error("Firebase Functions is not configured");
  const call = httpsCallable<FamilyOnboardingInput, FamilySetupResult>(functions, "completeFamilyOnboarding");
  return (await call(input)).data;
};

export const loadFamilySession = async (user: User): Promise<FamilySession | null> => {
  if (!db) return null;
  const userSnap = await getDoc(doc(db, "users", user.uid));
  let familyId = userSnap.data()?.activeFamilyId;
  let migratedLegacyUser = false;
  if (typeof familyId !== "string" || !familyId) {
    try {
      const result = await callCompleteFamilyOnboarding({ migrateLegacyOnly: true });
      familyId = result.familyId;
      migratedLegacyUser = Boolean(familyId);
    } catch (error) {
      console.warn("Failed to auto-migrate legacy family session", error);
      return null;
    }
  }
  if (typeof familyId !== "string" || !familyId) return null;

  const [familySnap, memberSnap] = await Promise.all([
    migratedLegacyUser
      ? getDocFromServer(doc(db, "families", familyId))
      : getDoc(doc(db, "families", familyId)),
    migratedLegacyUser
      ? getDocFromServer(doc(db, "families", familyId, "members", user.uid))
      : getDoc(doc(db, "families", familyId, "members", user.uid)),
  ]);
  if (!familySnap.exists() || !memberSnap.exists() || memberSnap.data().status === "inactive") return null;

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

export const subscribeFamilyMembers = (
  familyId: string,
  onChange: (members: FamilyMember[]) => void
) => {
  if (!db) return () => {};
  return onSnapshot(collection(db, "families", familyId, "members"), (snapshot) => {
    const members = snapshot.docs
      .map((memberDoc) => ({ uid: memberDoc.id, ...memberDoc.data() }) as FamilyMember)
      .filter((member) => member.status !== "inactive")
      .sort((a, b) => (a.role === b.role ? a.nickname.localeCompare(b.nickname, "ja") : a.role === "owner" ? -1 : 1));
    onChange(members);
  });
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
