# Pixel Watch / Wear OS voice input

TwinlyのPixel Watch連携は、次の流れで動かします。

1. スマホ/PWAの設定で「Watch連携キー」を作成する
2. `wearos/` をAndroid Studioで開いてPixel Watchへインストールする
3. Watchアプリ初回起動時に連携キーを入力する
4. 以後は「OK Google, Twinlyを開いて」でTwinly Wearを起動する
5. 時計文字盤のショートカット枠を編集し、「Twinly 音声入力」を選ぶ
6. アプリ起動後、またはショートカットをタップ後に音声入力され、Functionsの`recordFromWear`へ送信される

## Pixel Watchのショートカット設定

Pixel Watchの文字盤で、3つまたは4つ並ぶショートカット枠はWear OSの「Complication」です。
Twinly Wearをインストールすると、文字盤のショートカット候補に「Twinly 音声入力」が出ます。

1. Pixel Watchの文字盤を長押し
2. カスタマイズを開く
3. ショートカット枠を選ぶ
4. 一覧から「Twinly 音声入力」を選ぶ

選んだ枠をタップするとTwinly Wearが開き、連携キーが保存済みならすぐ音声入力を開始します。

## 音声例

```text
ひなたが5分前にミルクを80ml飲みました
かなたが14時30分にうんちしました
ひなた おむつ
かなた ミルク 120
```

## Gemini

`recordFromWear`は、Functions環境変数`GEMINI_API_KEY`がある場合にGemini APIで自然文解析します。
未設定の場合は、Webアプリ側と同等のルールベース解析へフォールバックします。

設定例:

```powershell
firebase functions:config:set gemini.key="..." # 旧方式は非推奨の場合あり
```

現在のコードはNode.jsの環境変数を読みます。Firebase Functions v2では、運用方法に合わせて
`GEMINI_API_KEY`と任意の`GEMINI_MODEL`を設定してください。

## Endpoint

Wear OSアプリは以下へPOSTします。

```text
https://asia-northeast1-twinly-prod.cloudfunctions.net/recordFromWear
```

Body:

```json
{
  "token": "XXXX-XXXX-XXXX",
  "text": "ひなたが5分前にミルクを80ml飲みました"
}
```
