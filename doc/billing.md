# Twinly Premium 決済

## 動作

- 月200円。家族オーナーが開始してから168時間の無料体験、家族につき一度。
- 体験の開始時はカード不要。終了後、起動中・復帰時に支払い案内を表示。無料の基本記録は継続可能。
- Stripe Checkoutで契約すると毎月自動更新。カード情報をTwinlyには保存しない。
- 決済成功の戻りURLだけでは有料化しない。署名確認したWebhookまたは本人の再確認によりStripeの現状と支払済み請求書を取得する。
- 契約・カード変更・解約はStripe Customer Portal。期末解約なら支払済み期間まで利用可能。支払い失敗で期間を延長しない。
- 決済中断・再試行は同じCheckout Sessionを利用。既存契約があれば新規契約を作らない。
- 家族メンバーが決済を操作することはできない。期限後もデータ・メンバーを削除しない。
- TWINLY_BILLING_ENABLEDが未設定/falseなら現在の開発プレビューを維持。有効化後、既存の無期限プレビューは最初のプラン取得で終了し、オーナーが改めて7日間の体験を開始できる。既存体験の開始日時を推測して遡らない。

## GitHub Actions 設定

Secrets:
- TWINLY_STRIPE_SECRET_KEY: StripeのAPI秘密キー
- TWINLY_STRIPE_WEBHOOK_SECRET: 対象Webhookの署名シークレット

Variables:
- TWINLY_STRIPE_PRICE_ID: JPY 200 / 月 / 1か月間隔の定期価格ID
- TWINLY_APP_URL: 本番のHTTPS origin（例 https://twinly-prod.web.app）
- TWINLY_BILLING_ENABLED: true（設定と検証完了後に有効化）

キーをチャット、ソース、VITE_変数に入れない。CIがGoogle Secret Managerへ標準入力で登録する。Google Cloud認証は既存のActions設定を利用。

## Stripe設定と公開手順

1. Stripeアカウントの事業者情報・入金口座登録を完了する。
2. テスト環境で月200円の定期価格を作る。Customer Portalでカード変更・期末解約を有効にし、プラン変更は無効にする。
3. Webhookを次のURLに登録。REST取得は2024-06-20に固定している。Webhookからはcustomer IDのみ参照し、権限判定では必ず現在のAPIを再取得する。
   `https://asia-northeast1-twinly-prod.cloudfunctions.net/stripeWebhook`
4. イベント: checkout.session.completed / customer.subscription.created / customer.subscription.updated / customer.subscription.deleted / invoice.paid / invoice.payment_failed。
5. テスト用キー・価格で隔離したFirebase環境に配備し、下記の実接続確認をする。本番プロジェクトの既存利用者に対してテスト課金を有効にしない。
6. 本番Stripeで同じ商品・Portal・Webhookを設定し、本番用Secrets/Variablesを登録してからmasterへ反映する。コードのみのマージでは決済は有効にならない。
7. 販売者情報、問い合わせ先、利用規約、プライバシーポリシー等の実際の公開URLをStripe Checkoutの公開設定に登録する。事業者情報やURLを仮作成しない。

Functionsとルールの配備が失敗したときは新しいフロントエンドを配備しない。旧プレビューの権限書き込みを拒否するサーバー更新と期限判定ルールを一緒に公開する。

## 実接続での確認（未実施）

- 試用の開始・期限到達・端末復帰、旧プレビューからの移行
- 成功、カード拒否、3Dセキュア、中断、連打、通信断後の再試行
- Webhookの重複・順不同・配信再試行と、戻り画面からの再確認
- 家族メンバー端末への反映と期限後のFirestore読み書き制限
- 更新支払い失敗、期末解約、期間終了、再契約
- 実際の表示価格、領収書、販売者情報、解約導線

自動テストは期限境界、認可、署名、金額検証、支払済み権限、契約重複防止、再試行とUI導線を確認する。実Stripe決済の成功を保証するものではない。

## 運用

familyBilling/{familyId} はサーバー専用で顧客IDと決済試行を保存。families/{familyId}/services/access は家族が読める権限情報のみ。Webhookは現在の契約を再取得し、Firestoreトランザクションの競合時には読み直す。
未解決のCheckout作成が23時間を超えた場合は再作成を止める。Stripe管理画面で当該顧客のSessionを確認してからcheckoutAttemptを復旧する。確認せず削除しない。

Stripe APIの参照: https://docs.stripe.com/api/checkout/sessions/create / https://docs.stripe.com/webhooks / https://docs.stripe.com/api/customer_portal/sessions/create

## 受領済みサンドボックス価格（2026-09-17）

- 商品ID: `prod_VH0Ad8pKk5SDuB`
- 価格ID: `price_1UGSA5BtBKzzWDenqD7PitXg`
- 予定料金: 月200円（JPY）。IDのみから金額や環境は確認できないため、Stripe APIでの照合は未実施。
- テスト環境専用の `TWINLY_STRIPE_PRICE_ID` に設定する。本番設定には流用しない。秘密キー・Webhook・テスト環境への配備は未設定。

## サンドボックス接続チェック

GitHub Actions Secret `TWINLY_STRIPE_TEST_SECRET_KEY` に `sk_test_` のキーを登録。
`Stripe Sandbox Connection Check` は上記サンドボックス価格を読み取り、月200円・JPY・毎月・定額・商品IDを照合する。秘密キーはログや成果物に出さない。顧客や契約の作成、課金、Firebaseへの配備は行わない。
テストキーは本番用 `TWINLY_STRIPE_SECRET_KEY` とは分離する。接続確認後も、隔離したFirebaseテスト環境への配備とWebhook設定、決済フローの実接続テストが必要。
