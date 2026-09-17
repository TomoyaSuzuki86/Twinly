const { accessFor } = require('./ai-policy');
const markerPath = 'adminMigrations/preserveRabbitCatPremiumV1';
const targetName = value => String(value || '').trim().toLowerCase().split(/\s+/).sort().join(' ') === 'cat rabbit';
async function preserve(auth, db) {
  const marker = db.doc(markerPath);
  const previous = await marker.get();
  if (previous.exists) {
    const familyId = previous.data()?.familyId;
    if (typeof familyId !== 'string' || !familyId || familyId.includes('/')) throw new Error('Invalid migration');
    const access = await db.doc('families/' + familyId + '/services/access').get();
    if (access.data()?.premiumGrant !== 'legacy') throw new Error('Grant was removed; manual review required');
    return;
  }
  const matches = [];
  let pageToken;
  do {
    const page = await auth.listUsers(1000, pageToken);
    matches.push(...page.users.filter(user => !user.disabled && targetName(user.displayName)));
    pageToken = page.pageToken;
  } while (pageToken);
  if (matches.length !== 1) throw new Error('Target account is not unique');
  const uid = matches[0].uid;
  const userRef = db.doc('users/' + uid);
  await db.runTransaction(async tx => {
    const done = await tx.get(marker);
    if (done.exists) throw new Error('Concurrent migration; retry deployment');
    const user = await tx.get(userRef);
    const familyId = user.data()?.activeFamilyId;
    if (typeof familyId !== 'string' || !familyId || familyId.includes('/')) throw new Error('No active family');
    const member = await tx.get(db.doc('families/' + familyId + '/members/' + uid));
    const accessRef = db.doc('families/' + familyId + '/services/access');
    const access = await tx.get(accessRef);
    if (member.data()?.status !== 'active') throw new Error('Not an active member');
    if (accessFor(access.data(), true).plan !== 'premium') throw new Error('Current Premium entitlement required');
    tx.set(accessRef, {premiumGrant:'legacy', premiumGrantReason:'existing-family-continuity'}, {merge:true});
    tx.create(marker, {familyId, uid, completedAt:Date.now()});
  });
}
module.exports = { preserve, targetName };
