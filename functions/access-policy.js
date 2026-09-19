const isActiveMember = member => member?.status === "active";
const isMemberRoleOwner = member => isActiveMember(member) && member?.role === "owner";
const isFamilyOwner = (member, family, uid) =>
  isActiveMember(member) && (member?.role === "owner" || family?.ownerUid === uid);

module.exports = {
  isActiveMember,
  isMemberRoleOwner,
  isFamilyOwner,
};
