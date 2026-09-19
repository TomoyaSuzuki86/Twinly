const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { isActiveMember, isMemberRoleOwner, isFamilyOwner } = require("../access-policy");

test("active membership is required by every family policy", () => {
  assert.equal(isActiveMember({ status: "active" }), true);
  assert.equal(isActiveMember({ status: "disabled" }), false);
  assert.equal(isMemberRoleOwner({ status: "disabled", role: "owner" }), false);
  assert.equal(isFamilyOwner({ status: "disabled", role: "owner" }, {}, "u1"), false);
});

test("owner policies preserve the intentional callable distinction", () => {
  const activeMember = { status: "active", role: "member" };
  assert.equal(isMemberRoleOwner(activeMember), false);
  assert.equal(isFamilyOwner(activeMember, { ownerUid: "u1" }, "u1"), true);
});

test("Firestore rules keep active membership and member-role ownership explicit", () => {
  const rules = fs.readFileSync(path.resolve(__dirname, "../../firestore.rules"), "utf8");
  assert.match(rules, /members\/\$\(request\.auth\.uid\)\)\.data\.status == "active"/);
  assert.match(rules, /members\/\$\(request\.auth\.uid\)\)\.data\.role == "owner"/);
});
