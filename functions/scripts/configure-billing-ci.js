const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
if (process.env.GITHUB_ACTIONS !== 'true') throw new Error('GitHub Actions専用です');

const project = 'twinly-prod';

function accessSecret(name) {
  const result = spawnSync(
    'npx',
    ['--yes', 'firebase-tools@latest', 'functions:secrets:access', name, '--project', project, '--non-interactive'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
  );
  return result.status === 0 ? result.stdout.replace(/\r?\n$/, '') : null;
}

function syncSecret(name, value) {
  const current = accessSecret(name);
  if (!value) {
    if (current !== null) {
      console.log(`${name} already exists; GitHub Secret未設定のため既存値を維持します。`);
      return;
    }
    throw new Error(`${name} がGitHub/Secret Managerのどちらにも設定されていません`);
  }
  if (current === value) {
    console.log(`${name} unchanged; new version was not created.`);
    return;
  }
  const result = spawnSync(
    'npx',
    ['--yes', 'firebase-tools@latest', 'functions:secrets:set', name, '--data-file', '-', '--project', project, '--non-interactive'],
    { input: value, encoding: 'utf8', stdio: ['pipe', 'ignore', 'ignore'] }
  );
  if (result.status !== 0) throw new Error(`${name} の登録に失敗しました`);
  console.log(`${name} updated.`);
}

// Production billing is enabled only when the production environment explicitly opts in.
const enabled = process.env.TWINLY_BILLING_ENABLED === 'true';
const values = { TWINLY_BILLING_ENABLED: String(enabled) };
if (enabled) {
  const price = process.env.TWINLY_STRIPE_PRICE_ID || '';
  const appUrl = process.env.TWINLY_APP_URL || '';
  if (!/^price_[a-zA-Z0-9]+$/.test(price) || !/^https:\/\/[a-zA-Z0-9.-]+\/?$/.test(appUrl)) throw new Error('決済の商品ID・本番URLを設定してください');
  values.TWINLY_STRIPE_PRICE_ID = price;
  values.TWINLY_APP_URL = appUrl;
  syncSecret('TWINLY_STRIPE_SECRET_KEY', process.env.TWINLY_STRIPE_SECRET_KEY);
  syncSecret('TWINLY_STRIPE_WEBHOOK_SECRET', process.env.TWINLY_STRIPE_WEBHOOK_SECRET);
}
fs.appendFileSync('functions/.env.twinly-prod', Object.entries(values).map(([key, value]) => `${key}=${value}\n`).join(''));
fs.appendFileSync(process.env.GITHUB_OUTPUT, `billing_enabled=${enabled}\n`);
