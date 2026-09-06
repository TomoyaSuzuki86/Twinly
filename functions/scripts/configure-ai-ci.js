// Called only from authenticated GitHub Actions. Never writes the API key to
// disk, build output, a command-line argument, or stdout.
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
if (process.env.GITHUB_ACTIONS !== 'true') throw new Error('GitHub Actions専用です');
const familyId = process.env.TWINLY_TRIAL_FAMILY_ID || '';
const model = process.env.TWINLY_AI_MODEL || 'gemini-2.5-flash';
if (!/^[A-Za-z0-9_-]*$/.test(familyId) || !/^[A-Za-z0-9.-]+$/.test(model)) throw new Error('AI設定値が不正です');
fs.writeFileSync('functions/.env.twinly-prod', `TWINLY_TRIAL_FAMILY_ID=${familyId}\nTWINLY_AI_MODEL=${model}\n`);
const apiKey = process.env.TWINLY_AI_API_KEY;
if (apiKey) {
  const result = spawnSync('npx', ['--yes','firebase-tools@latest','functions:secrets:set','TWINLY_AI_API_KEY','--data-file','-','--project','twinly-prod','--non-interactive'],
    {input:apiKey,encoding:'utf8',stdio:['pipe','ignore','ignore']});
  if (result.status !== 0) throw new Error('AI Secretの登録に失敗しました。Secret Managerへの権限を確認してください');
}
fs.appendFileSync(process.env.GITHUB_OUTPUT, `ai_enabled=${Boolean(apiKey)}\n`);
console.log(apiKey ? 'AI Secret configured.' : 'AI Secret未設定：AI解析エンドポイントの配備をスキップします。');
