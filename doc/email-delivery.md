# Twinly 日次まとめメール配送

Twinlyの日次まとめメールは、Cloud FunctionsからResend Email APIへ直接配送します。

## 本番設定

GitHub repository の `production` Environment に次を設定します。

- Secret `TWINLY_EMAIL_API_KEY`: Resend API key (`re_...`)
- Variable `TWINLY_EMAIL_FROM`: Resendで送信可能な送信元。例: `Twinly <summary@example.com>`

`TWINLY_EMAIL_FROM` のドメインはResend側で送信ドメインとして認証してください。
設定後に `Deploy Firebase` workflow を手動実行するか、Functions変更をmasterへpushすると、Secret Managerへの登録と配送Functionsの配備が行われます。

## 配送フロー

1. 日次メール設定の指定時刻以降、未生成なら15分ごとの補完スケジューラが当日分を `mail` キューへ作成します。
2. `mail/{mailId}` 作成トリガーがResendへ即時送信します。
3. 作成トリガーが失敗しても、15分ごとのflushが未配送メールを再試行します。
4. Resendには日付・家族単位の冪等キーを渡し、再試行時の二重配信を防ぎます。
5. 成功したキュードキュメントは削除し、家族設定へ `lastSentDate` / `lastSentAt` を記録します。
6. 失敗時は `lastDeliveryError` を保存し、次回flushで再試行します。

旧 `sendDailySummaryEmails` も当面は互換性のため残しますが、`lastQueuedDate` により補完スケジューラとの重複キューは防止されます。
