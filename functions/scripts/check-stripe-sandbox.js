const fs = require('node:fs');
const { stripeRequest } = require('../stripe-client');
const { PRICE_YEN } = require('../billing-policy');

async function main() {
  const secret = process.env.TWINLY_STRIPE_TEST_SECRET_KEY;
  if (!secret || !secret.startsWith('sk_test_')) throw new Error('TWINLY_STRIPE_TEST_SECRET_KEY にテスト用シークレットキーを登録してください');
  const priceId = process.env.TWINLY_STRIPE_TEST_PRICE_ID;
  if (!/^price_[A-Za-z0-9]+$/.test(priceId || '')) throw new Error('テスト価格IDが未設定または不正です');
  const price = await stripeRequest(secret, 'prices/' + priceId);
  if (price.livemode !== false) throw new Error('テスト環境の価格ではありません');
  if (price.active !== true || price.currency !== 'jpy' || price.unit_amount !== PRICE_YEN ||
      price.recurring?.interval !== 'month' || price.recurring?.interval_count !== 1 ||
      price.recurring?.usage_type !== 'licensed' || price.billing_scheme !== 'per_unit') {
    throw new Error('価格が有効な月額' + PRICE_YEN + '円の定額プランと一致しません');
  }
  if (price.product !== 'prod_VH0Ad8pKk5SDuB') throw new Error('受領したTwinly商品のIDと一致しません');
  const summary = 'Stripeサンドボックス接続成功。Twinly Premiumの月額' + PRICE_YEN + '円（JPY、毎月、定額）を確認しました。\n顧客・契約・決済の作成や本番への配備は行っていません。\n';
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
