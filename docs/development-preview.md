# Development専用Firebase

developmentのデプロイはGitHub Environment `development`を使用し、本番とは別のFirebaseプロジェクトへHosting・Firestoreルール/インデックス・基本Functionsを配信します。
本番設定へのフォールバックはありません。設定不足・本番project ID・Auth/Storage/サービスアカウントの不一致はビルド前に停止します。

## 初回セットアップ

1. 本番とは別のFirebaseプロジェクトを作成し、Webアプリを登録する。
2. AuthenticationのGoogleログインを有効化し、Firestoreの(default)データベースを作成する。Functions利用に必要な料金プランと権限を設定する。
3. 新しいプロジェクト専用のデプロイ用サービスアカウントを用意する。本番の権限を付与しない。
4. GitHub Environment `development` に以下のSecretsを登録する（ローカル.env.localは使用しない）。

| Secret | 内容 |
| --- | --- |
| FIREBASE_SERVICE_ACCOUNT_TWINLY_DEV | 専用サービスアカウントJSON |
| DEV_VITE_FIREBASE_API_KEY | WebアプリapiKey |
| DEV_VITE_FIREBASE_PROJECT_ID | 専用projectId |
| DEV_VITE_FIREBASE_APP_ID | appId |
| DEV_VITE_FIREBASE_AUTH_DOMAIN | 専用projectId.firebaseapp.com |
| DEV_VITE_FIREBASE_STORAGE_BUCKET | 専用storageBucket |
| DEV_VITE_FIREBASE_MESSAGING_SENDER_ID | messagingSenderId |
| DEV_VITE_FIREBASE_MEASUREMENT_ID | 任意：専用Analytics |
| DEV_VITE_GOOGLE_OAUTH_CLIENT_ID | 任意：専用カレンダーOAuthクライアント |
| DEV_VITE_WEB_PUSH_PUBLIC_KEY | 任意：専用Push公開鍵（配信は本PRでは未設定） |

5. この変更をdevelopmentへ取り込み、Deploy Development Previewを実行する。
6. 新URL `https://<専用projectId>.web.app` でログイン・家族作成・記録保存を確認する。Auth承認済みドメインにも新URLのホストを登録する。

## 範囲と未完了項目

- 現在の変更はデプロイ設定です。Firebaseプロジェクトの作成、Secrets登録、デプロイ成功までは分離完了ではありません。
- AI、定期メール、Push配信は専用キーと送信先の設定が必要なため、このworkflowの配信対象から除外しています。画面に表示されても機能全体のテスト環境が完成した状態ではありません。
- 決済PR #146は別途developmentへの取り込み・テスト用Stripe設定・Webhook登録が必要です。本PRだけでは決済は有効になりません。
- 本番専用のconfigure-ai-ci.js / configure-billing-ci.jsをdevelopmentに使用しないでください。
- Stripeはテストキーのみ使用し、月額200円のPrice `price_1UGSA5BtBKzzWDenqD7PitXg`を検証します。本番Stripeキーはdevelopmentに登録しません。
- 旧URL（twinly-prodのdevelopmentプレビューチャンネル）は本番バックエンドにつながったままです。新環境の確認後に旧チャンネルを削除し、ブックマークやPWAを新URLに切り替えてください。既存データは移行・削除しません。
