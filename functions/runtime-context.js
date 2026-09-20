const { isActiveMember, isMemberRoleOwner } = require("./access-policy");

const createRuntimeContext = ({ db, accessFor }) => {
  const familyAccess = async (familyId) => {
    const snap = await db.collection("families").doc(familyId).collection("services").doc("access").get();
    // previewPlan is written only after verifying the active family owner.
    return accessFor(snap.data(), true);
  };

  const getAppRefForUid = async (uid) => {
    const userSnap = await db.collection("users").doc(uid).get();
    const familyId = userSnap.data()?.activeFamilyId;
    if (familyId) {
      const member = await db.collection("families").doc(familyId).collection("members").doc(uid).get();
      if (!member.exists || !isActiveMember(member.data())) throw new Error("Family access denied");
      if (!isMemberRoleOwner(member.data()) && !(await familyAccess(familyId)).features.familySharing) throw new Error("Family sharing is locked");
    }
    return familyId
      ? db.collection("families").doc(familyId).collection("app").doc("state")
      : db.collection("users").doc(uid).collection("app").doc("state");
  };

  return { familyAccess, getAppRefForUid };
};

module.exports = createRuntimeContext;
