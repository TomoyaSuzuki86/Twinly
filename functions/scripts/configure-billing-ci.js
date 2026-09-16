const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
if (process.env.GITHUB_ACTIONS !== 'true') throw new Error('GitHub Actions専用です');
const enabled = process.env.TWINLY_BILLING_ENABLED === 'true';
const values = { TWINLY_BILLING_ENABLED: String(enabled) };
if (enabled) {
  const price = process.env.TWINLY_STRIPE_PRICE_ID || '';
  const appUrl = process.env.TWINLY_APP_URL || '';
  if (!/^price_[a-zA-Z0-9]+$/.test(price) || !/^https:\/\/[a-zA-Z0-9.-]+\/?$/.test(appUrl)) throw new Error('決済の商品ID・本番URLを設定してください');
  values.TWINLY_STRIPE_PRICE_ID = price;
  values.TWINLY_APP_URL = appUrl;
  for (const name of ['TWINLY_STRIPE_SECRET_KEY', 'TWINLY_STRIPE_WEBHOOK_SECRET']) {
    const value = process.env[name];
    if (!value) throw new Error(`${name} が未設定です`);
    const result = spawnSync('npx', ['--yes', 'firebase-tools@latest', 'functions:secrets:set', name, '--data-file', '-', '--project', 'twinly-prod', '--non-interactive'], { input: value, encoding: 'utf8', stdio: ['pipe', 'ignore', 'ignore'] });
    if (result.status !== 0) throw new Error(`${name} の登録に失敗しました`);
  }
}
fs.appendFileSync('functions/.env.twinly-prod', Object.entries(values).map(([key, value]) => `${key}=${value}\n`).join(''));
fs.appendFileSync(process.env.GITHUB_OUTPUT, `billing_enabled=${enabled}\n`);
