const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validate } = require('./validate-development-config.cjs');
function config() { return {
  VITE_FIREBASE_PROJECT_ID:'twinly-test-example',
  VITE_FIREBASE_API_KEY:'test',
  VITE_FIREBASE_APP_ID:'1:123456:web:test',
  VITE_FIREBASE_AUTH_DOMAIN:'twinly-test-example.firebaseapp.com',
  VITE_FIREBASE_MESSAGING_SENDER_ID:'123456',
  VITE_FIREBASE_STORAGE_BUCKET:'twinly-test-example.firebasestorage.app',
  DEV_SERVICE_ACCOUNT:JSON.stringify({type:'service_account',project_id:'twinly-test-example',client_email:'deploy@twinly-test-example.iam.gserviceaccount.com',private_key:'-----BEGIN PRIVATE KEY-----test'}),
}; }
test('accepts a separate development project', () => assert.doesNotThrow(() => validate(config())));
for (const [key, value] of [
  ['VITE_FIREBASE_PROJECT_ID','twinly-prod'],
  ['VITE_FIREBASE_AUTH_DOMAIN','twinly-prod.firebaseapp.com'],
  ['VITE_FIREBASE_STORAGE_BUCKET','twinly-prod.firebasestorage.app'],
  ['VITE_FIREBASE_MESSAGING_SENDER_ID','557885702942'],
  ['VITE_FIREBASE_APP_ID','1:557885702942:web:production'],
  ['DEV_SERVICE_ACCOUNT',JSON.stringify({project_id:'twinly-prod'})],
  ['DEV_SERVICE_ACCOUNT','invalid'],
]) test('rejects mixed configuration: ' + key + value.slice(0,12), () => assert.throws(() => validate({...config(), [key]:value})));
for (const key of Object.keys(config())) test('rejects missing ' + key, () => {
  const env=config(); delete env[key]; assert.throws(() => validate(env));
});
