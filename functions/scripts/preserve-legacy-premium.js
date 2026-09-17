// Run only from the authenticated production deployment before changing access policy.
const admin = require('firebase-admin');
const { preserve } = require('../preserve-legacy-premium');
if (process.env.GITHUB_ACTIONS !== 'true') throw new Error('GitHub Actions専用です');
admin.initializeApp({projectId:'twinly-prod'});
preserve(admin.auth(), admin.firestore()).then(() => {
  console.log('Existing family Premium entitlement verified and preserved.');
}).catch(() => {
  console.error('Premium preservation failed. Deployment stopped; verify the existing account and active family.');
  process.exitCode = 1;
});
