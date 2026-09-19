const { billingState } = require('./billing-policy');

function expireDevelopmentTrial(data = {}, now = Date.now()) {
  if (billingState(data, now).status !== 'trialing') {
    throw new Error('無料体験中にだけ7日分を消化できます');
  }
  return {
    billingVersion: 1,
    trialEndsAt: now - 1,
    developmentExpiredAt: now,
  };
}

module.exports = { expireDevelopmentTrial };
