const assert = require('node:assert/strict');

function validate(env) {
  const required = ['VITE_FIREBASE_PROJECT_ID', 'VITE_FIREBASE_API_KEY',
    'VITE_FIREBASE_APP_ID', 'VITE_FIREBASE_AUTH_DOMAIN',
    'VITE_FIREBASE_MESSAGING_SENDER_ID', 'VITE_FIREBASE_STORAGE_BUCKET',
    'DEV_SERVICE_ACCOUNT'];
  for (const name of required) assert.ok(env[name]?.trim(), 'Missing development setting: ' + name);
  const project = env.VITE_FIREBASE_PROJECT_ID;
  assert.match(project, /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/, 'Invalid development project ID');
  assert.notEqual(project, 'twinly-prod', 'Production project is forbidden');
  assert.equal(env.VITE_FIREBASE_AUTH_DOMAIN, project + '.firebaseapp.com', 'Auth must use development');
  assert.ok([project + '.firebasestorage.app', project + '.appspot.com'].includes(env.VITE_FIREBASE_STORAGE_BUCKET), 'Storage must use development');
  assert.notEqual(env.VITE_FIREBASE_MESSAGING_SENDER_ID, '557885702942', 'Production sender is forbidden');
  assert.ok(env.VITE_FIREBASE_APP_ID.startsWith('1:' + env.VITE_FIREBASE_MESSAGING_SENDER_ID + ':web:'), 'App and sender must match');
  let account;
  try { account = JSON.parse(env.DEV_SERVICE_ACCOUNT); } catch { throw new Error('Invalid development service account JSON'); }
  assert.equal(account.project_id, project, 'Service account must belong to development');
  assert.equal(account.type, 'service_account', 'Service account required');
  assert.ok(account.client_email?.endsWith('@' + project + '.iam.gserviceaccount.com'), 'Invalid development service account');
  assert.ok(account.private_key?.startsWith('-----BEGIN PRIVATE KEY-----'), 'Service account key missing');
}
module.exports = { validate };
if (require.main === module) {
  try { validate(process.env); console.log('Development isolation checks passed'); }
  catch (error) { console.error(error.message.split('\n')[0]); process.exitCode = 1; }
}
