// Called only from authenticated GitHub Actions. Never writes API keys to
// disk, build output, command-line arguments, or stdout.
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
if (process.env.GITHUB_ACTIONS !== 'true') throw new Error('GitHub Actions専用です');

const project = 'twinly-prod';
const familyId = process.env.TWINLY_TRIAL_FAMILY_ID || '';
const model = process.env.TWINLY_AI_MODEL || 'gemini-3.6-flash';
const fallbackModel = process.env.TWINLY_AI_FALLBACK_MODEL || 'gemini-3.5-flash-lite';
if (!/^[A-Za-z0-9_-]*$/.test(familyId) || !/^[A-Za-z0-9.-]+$/.test(model) || !/^[A-Za-z0-9.-]+$/.test(fallbackModel)) throw new Error('AI設定値が不正です');

function accessSecret(name) {
  const result = spawnSync(
    'npx',
    ['--yes', 'firebase-tools@latest', 'functions:secrets:access', name, '--project', project, '--non-interactive'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
  );
  return result.status === 0 ? result.stdout.replace(/\r?\n$/, '') : null;
}

function syncSecret(name, value, label) {
  const current = accessSecret(name);
  if (!value) {
    if (current !== null) {
      console.log(`${label} Secret already exists; GitHub Secret未設定のため既存値を維持します。`);
      return true;
    }
    return false;
  }
  if (current === value) {
    console.log(`${label} Secret unchanged; new version was not created.`);
    return true;
  }
  const result = spawnSync(
    'npx',
    ['--yes', 'firebase-tools@latest', 'functions:secrets:set', name, '--data-file', '-', '--project', project, '--non-interactive'],
    { input: value, encoding: 'utf8', stdio: ['pipe', 'ignore', 'ignore'] }
  );
  if (result.status !== 0) throw new Error(`${label} Secretの登録に失敗しました。Secret Managerへの権限を確認してください`);
  console.log(`${label} Secret updated.`);
  return true;
}

const aiEnabled = syncSecret('TWINLY_AI_API_KEY', process.env.TWINLY_AI_API_KEY, 'AI');
fs.appendFileSync(process.env.GITHUB_OUTPUT, `ai_enabled=${aiEnabled}\n`);
console.log(aiEnabled ? 'AI Secret ready.' : 'AI Secret未設定：AI解析エンドポイントの配備をスキップします。');

fs.writeFileSync(
  'functions/.env.twinly-prod',
  [
    `TWINLY_TRIAL_FAMILY_ID=${familyId}`,
    `TWINLY_AI_MODEL=${model}`,
    `TWINLY_AI_FALLBACK_MODEL=${fallbackModel}`,
    '',
  ].join('\n')
);
