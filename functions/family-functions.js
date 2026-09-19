const crypto = require("crypto");
const { accessFor } = require("./ai-policy");
const { isMemberRoleOwner } = require("./access-policy");
const { HttpsError, onCall } = require("firebase-functions/v2/https");

const inviteLifetimeMs = 24 * 60 * 60 * 1000;
const validRelationships = new Set(["father", "mother", "grandfather", "grandmother", "other"]);
const publicCallableOptions = { invoker: "public" };

module.exports = ({ admin, db, familyAccess, logger = console }) => {
  const requireAuthUid = (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "ログインが必要です");
    return uid;
  };
  
  const validateFamilyProfile = (data) => {
    const nickname = String(data?.nickname || "").trim().slice(0, 20);
    const relationship = String(data?.relationship || "");
    if (!nickname) throw new HttpsError("invalid-argument", "ニックネームを入力してください");
    if (!validRelationships.has(relationship)) throw new HttpsError("invalid-argument", "続柄を選択してください");
    return { nickname, relationship };
  };
  
  const buildLegacyFamilyProfile = (request, userData = {}) => {
    const email = String(request.auth?.token?.email || userData.email || "").trim();
    const fallbackName = email.includes("@") ? email.split("@")[0] : "メンバー";
    const nickname = String(userData.displayName || request.auth?.token?.name || fallbackName)
      .trim()
      .slice(0, 20) || "メンバー";
    return { nickname, relationship: "other" };
  };
  
  const hashFamilyInvite = (token) => crypto.createHash("sha256").update(String(token || "")).digest("hex");

  const completeFamilyOnboarding = onCall(publicCallableOptions, async (request) => {
    const uid = requireAuthUid(request);
    const migrateLegacyOnly = request.data?.migrateLegacyOnly === true;
    const requestedProfile = migrateLegacyOnly ? null : validateFamilyProfile(request.data);
    const userRef = db.collection("users").doc(uid);
    const legacyAppRef = userRef.collection("app").doc("state");
    const [existingUserSnap, legacyAppSnap] = await Promise.all([
      userRef.get(),
      legacyAppRef.get(),
    ]);
    const existingFamilyId = existingUserSnap.data()?.activeFamilyId;
  
    // A brand-new account should still complete the profile screen. Existing users,
    // including accounts whose old app document is missing or unusually large, are
    // repaired automatically so data-copy trouble can never block sign-in again.
    if (migrateLegacyOnly && !existingUserSnap.exists && !legacyAppSnap.exists) {
      return { familyId: null };
    }
    const nextFamilyId = typeof existingFamilyId === "string" && existingFamilyId ? existingFamilyId : uid;
    const familyRef = db.collection("families").doc(nextFamilyId);
    const memberRef = familyRef.collection("members").doc(uid);
    const familyAppRef = familyRef.collection("app").doc("state");
  
    await db.runTransaction(async (transaction) => {
      const [familySnap, memberSnap] = await Promise.all([
        transaction.get(familyRef),
        transaction.get(memberRef),
      ]);
  
      if (familySnap.exists && existingFamilyId && !memberSnap.exists) {
        throw new HttpsError("permission-denied", "この家族のメンバーではありません");
      }
  
      const existingMember = memberSnap.data() || {};
      const profile = requestedProfile || (memberSnap.exists
        ? {
            nickname: String(existingMember.nickname || "メンバー"),
            relationship: validRelationships.has(existingMember.relationship) ? existingMember.relationship : "other",
          }
        : buildLegacyFamilyProfile(request, existingUserSnap.data()));
  
      transaction.set(
        userRef,
        {
          uid,
          activeFamilyId: nextFamilyId,
          displayName: admin.firestore.FieldValue.delete(),
          email: admin.firestore.FieldValue.delete(),
          photoURL: admin.firestore.FieldValue.delete(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      if (!familySnap.exists) {
        transaction.set(familyRef, {
          name: "わが家",
          ownerUid: uid,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
      transaction.set(
        memberRef,
        {
          uid,
          ...profile,
          profileCompleted: requestedProfile ? true : existingMember.profileCompleted === true,
          role: existingMember.role === "member" ? "member" : "owner",
          status: "active",
          joinedAt: existingMember.joinedAt || admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    });
  
    // Preserve the legacy document byte-for-byte. This happens only after the
    // family/member transaction succeeds; a large document can no longer roll back
    // the account repair and trap the user on the registration screen.
    if (legacyAppSnap.exists) {
      try {
        const familyAppSnap = await familyAppRef.get();
        if (!familyAppSnap.exists) {
          try { await familyAppRef.create(legacyAppSnap.data()); }
          catch (error) { if (error.code !== 6) throw error; }
        }
      } catch (error) {
        logger.error("Legacy app copy failed after family onboarding", { uid, familyId: nextFamilyId, error });
      }
    }
  
    return { familyId: nextFamilyId };
  });
  
  const createFamilyInvite = onCall(publicCallableOptions, async (request) => {
    const uid = requireAuthUid(request);
    const familyId = String(request.data?.familyId || "").trim();
    if (!familyId) throw new HttpsError("invalid-argument", "家族IDが必要です");
  
    const memberSnap = await db.collection("families").doc(familyId).collection("members").doc(uid).get();
    if (!memberSnap.exists || !isMemberRoleOwner(memberSnap.data())) {
      throw new HttpsError("permission-denied", "管理者だけが家族を招待できます");
    }
  
    if (!(await familyAccess(familyId)).features.familySharing) throw new HttpsError("permission-denied", "家族共有は有料限定です");
    const token = crypto.randomBytes(32).toString("base64url");
    const tokenHash = hashFamilyInvite(token);
    const expiresAt = Date.now() + inviteLifetimeMs;
    await db.collection("familyInvites").doc(tokenHash).set({
      familyId,
      createdByUid: uid,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: admin.firestore.Timestamp.fromMillis(expiresAt),
      usedAt: null,
      usedByUid: null,
    });
    return { token, expiresAt };
  });
  
  const joinFamily = onCall(publicCallableOptions, async (request) => {
    const uid = requireAuthUid(request);
    const profile = validateFamilyProfile(request.data);
    const token = String(request.data?.token || "").trim();
    if (token.length < 32) throw new HttpsError("invalid-argument", "招待リンクが正しくありません");
  
    const inviteRef = db.collection("familyInvites").doc(hashFamilyInvite(token));
    const userRef = db.collection("users").doc(uid);
    const familyId = await db.runTransaction(async (transaction) => {
      const [inviteSnap, userSnap] = await Promise.all([transaction.get(inviteRef), transaction.get(userRef)]);
      if (!inviteSnap.exists) throw new HttpsError("not-found", "招待リンクが見つかりません");
      const invite = inviteSnap.data();
      if (invite.usedAt) throw new HttpsError("failed-precondition", "この招待リンクは使用済みです");
      if (!invite.expiresAt || invite.expiresAt.toMillis() < Date.now()) {
        throw new HttpsError("deadline-exceeded", "招待リンクの期限が切れています");
      }
      if (userSnap.data()?.activeFamilyId && userSnap.data().activeFamilyId !== invite.familyId) {
        throw new HttpsError("failed-precondition", "すでに別の家族へ参加しています");
      }
  
      const familyRef = db.collection("families").doc(invite.familyId);
      const accessSnap = await transaction.get(familyRef.collection("services").doc("access"));
      if (!accessFor(accessSnap.data(), Boolean(process.env.TWINLY_TRIAL_FAMILY_ID) && invite.familyId === process.env.TWINLY_TRIAL_FAMILY_ID).features.familySharing) throw new HttpsError("permission-denied","招待先の家族共有は現在ロック中です");
      const memberRef = familyRef.collection("members").doc(uid);
      const [familySnap, memberSnap] = await Promise.all([
        transaction.get(familyRef),
        transaction.get(memberRef),
      ]);
      if (!familySnap.exists) throw new HttpsError("not-found", "招待先の家族が見つかりません");
      if (memberSnap.exists && memberSnap.data()?.status === "active") {
        throw new HttpsError("already-exists", "すでにこの家族へ参加しています");
      }
      transaction.set(
        userRef,
        {
          uid,
          activeFamilyId: invite.familyId,
          displayName: admin.firestore.FieldValue.delete(),
          email: admin.firestore.FieldValue.delete(),
          photoURL: admin.firestore.FieldValue.delete(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      transaction.set(memberRef, {
          uid,
          ...profile,
          profileCompleted: true,
          role: "member",
        status: "active",
        joinedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      transaction.update(inviteRef, {
        usedAt: admin.firestore.FieldValue.serverTimestamp(),
        usedByUid: uid,
      });
      return invite.familyId;
    });
  
    return { familyId };
  });

  return { completeFamilyOnboarding, createFamilyInvite, joinFamily };
};
