// Called only from authenticated GitHub Actions. Never writes API keys to
// disk, build output, command-line arguments, or stdout.
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
if (process.env.GITHUB_ACTIONS !== 'true') throw new Error('GitHub Actions専用です');

const familyId = process.env.TWINLY_TRIAL_FAMILY_ID || '';
const model = process.env.TWINLY_AI_MODEL || 'gemini-3.6-flash';
const emailFrom = String(process.env.TWINLY_EMAIL_FROM || '').trim();
if (!/^[A-Za-z0-9_-]*$/.test(familyId) || !/^[A-Za-z0-9.-]+$/.test(model)) throw new Error('AI設定値が不正です');
if (emailFrom && (emailFrom.length > 200 || /[\r\n]/.test(emailFrom) || !emailFrom.includes('@'))) throw new Error('メール送信元設定が不正です');

function setSecret(name, value, label) {
  const result = spawnSync(
    'npx',
    ['--yes','firebase-tools@latest','functions:secrets:set',name,'--data-file','-','--project','twinly-prod','--non-interactive'],
    { input:value, encoding:'utf8', stdio:['pipe','ignore','ignore'] }
  );
  if (result.status !== 0) throw new Error(`${label} Secretの登録に失敗しました。Secret Managerへの権限を確認してください`);
}

function secretExists(name) {
  const result = spawnSync(
    'npx',
    ['--yes','firebase-tools@latest','functions:secrets:get',name,'--project','twinly-prod','--non-interactive'],
    { encoding:'utf8', stdio:['ignore','ignore','ignore'] }
  );
  return result.status === 0;
}

const apiKey = process.env.TWINLY_AI_API_KEY;
if (apiKey) setSecret('TWINLY_AI_API_KEY', apiKey, 'AI');
fs.appendFileSync(process.env.GITHUB_OUTPUT, `ai_enabled=${Boolean(apiKey)}\n`);
console.log(apiKey ? 'AI Secret configured.' : 'AI Secret未設定：AI解析エンドポイントの配備をスキップします。');

const emailApiKey = process.env.TWINLY_EMAIL_API_KEY;
if (emailApiKey) setSecret('TWINLY_EMAIL_API_KEY', emailApiKey, 'Email');
const emailSecretAvailable = Boolean(emailApiKey) || secretExists('TWINLY_EMAIL_API_KEY');
const emailEnabled = Boolean(emailFrom && emailSecretAvailable);

fs.writeFileSync(
  'functions/.env.twinly-prod',
  [
    `TWINLY_TRIAL_FAMILY_ID=${familyId}`,
    `TWINLY_AI_MODEL=${model}`,
    `TWINLY_EMAIL_FROM=${JSON.stringify(emailFrom)}`,
    `TWINLY_EMAIL_DELIVERY_ENABLED=${emailEnabled}`,
    '',
  ].join('\n')
);

fs.appendFileSync(process.env.GITHUB_OUTPUT, `email_enabled=${emailEnabled}\n`);
console.log(emailEnabled
  ? 'Email delivery configured.'
  : 'Email delivery未設定：TWINLY_EMAIL_API_KEY SecretとTWINLY_EMAIL_FROM Variableを設定してください。');
