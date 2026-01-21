# AGENTS.md — Twinly (Codex CLI)

## 0. リポジトリ情報

- Repo: `git@github.com:TomoyaSuzuki86/Twinly.git`
- 目的: 双子（A/B）の育児ログ（ミルク・おむつ・日次レポート）を、**PWA（Chrome表示）**で素早く記録し、後でGoogleカレンダーへ出力できるようにする。

## 1. 重要な前提（最優先）

- UIは `Twinly/doc/mock/育児記録pwa_画面モック（横向きa_b・でかボタン）.jsx` を最優先で参照し、**見た目と操作感を寄せる**。
- 初期リリースは **手入力 + カレンダー出力を先行**（Owlet連携は二次リリース）。
- 端末は1台運用が主だが、将来的に夫婦別端末で共有できるように、データはFirebaseで持てる設計にする（初期はローカル保存でもよいが、移行しやすくする）。
- Googleカレンダーは A/Bで別カレンダーにまとめる：
  - `育児記録-A`
  - `育児記録-B`
  - 「全部を予定にする」前提（ユーザーが非表示にすればよい）

## 2. 用語（1回だけ）

- **PWA（Progressive Web App）**: ブラウザで動くのに、アプリみたいにホーム画面に追加できる仕組み。以後「Webアプリ」と呼ぶ。

## 3. 開発ゴール（フェーズ）

### Phase 1（最初にここ）

- ダークテーマの横向きUI（A/B 2カラム、でかボタン）
- ミルク・おむつを1タップで記録（必要ならモーダルで詳細）
- 当日ログ表示（編集・削除・Undo）
- 日次レポート生成（ボタンで作成、内容は当日の集計を本文に入れる）
- ローカル保存（localStorage / IndexedDB どちらでも可。後でFirebaseへ移しやすく）
- おむつ在庫管理（サイズ別、残り10枚で購入導線：リンクは設定で登録）

###### Phase 1.5（夫婦共有の土台：Firebase Auth + Firestore）

#### 目的

- Googleログインできる
- Firestoreにデータを保存し、別端末でも同じデータを見られる
- family（家族）単位の共有の土台を作る（招待は次でもよい）

---

#### 開発者自身がやる（Codex CLIでは不可：Firebase Console）

1. Firebaseプロジェクト作成（例：twinly-prod）
   
   1. firebaseConfigは以下です
      
      ```
      // Import the functions you need from the SDKs you need
      import { initializeApp } from "firebase/app";
      import { getAnalytics } from "firebase/analytics";
      // TODO: Add SDKs for Firebase products that you want to use
      // https://firebase.google.com/docs/web/setup#available-libraries
      
      // Your web app's Firebase configuration
      // For Firebase JS SDK v7.20.0 and later, measurementId is optional
      const firebaseConfig = {
        apiKey: "AIzaSyAEn2SKA28aLo-KtM2432C4jf6YX40FFhY",
        authDomain: "twinly-prod.firebaseapp.com",
        projectId: "twinly-prod",
        storageBucket: "twinly-prod.firebasestorage.app",
        messagingSenderId: "557885702942",
        appId: "1:557885702942:web:b87f1280a9222a4c56ff0f",
        measurementId: "G-BEE0JC4C8P"
      };
      
      // Initialize Firebase
      const app = initializeApp(firebaseConfig);
      const analytics = getAnalytics(app);
      ```
      
      

2. Authentication：Googleログインを有効化

3. Firestore Database：作成（開発中はテストモードでも可）

4. Firestoreルールを設定（docに保存した rules をコンソールへ貼り付ける）←以下のルールを設定済み
   
   ```
   rules_version = '2';
   
   service cloud.firestore {
     match /databases/{database}/documents {
   
       function isSignedIn() {
         return request.auth != null;
       }
   
       // families/{familyId}/members/{uid} が存在すれば「家族メンバー」
       function isFamilyMember(familyId) {
         return isSignedIn()
           && exists(/databases/$(database)/documents/families/$(familyId)/members/$(request.auth.uid));
       }
   
       match /families/{familyId} {
   
         // family本体
         allow read: if isFamilyMember(familyId);
         allow create: if isSignedIn();
         allow update, delete: if isFamilyMember(familyId);
   
         // ★ members は初期参加のための例外を作る
         match /members/{uid} {
           // 読み取り：家族メンバーならOK（自分だけ見えるでもOKだが、まずは簡単に）
           allow read: if isFamilyMember(familyId);
   
           // 作成：本人が自分のuidのmemberを作れる（初回参加で必要）
           allow create: if isSignedIn() && request.auth.uid == uid;
   
           // 更新・削除：基本は本人のみ（運用で「管理者」導入したくなったら後で拡張）
           allow update, delete: if isSignedIn() && request.auth.uid == uid;
         }
   
         // それ以外のサブコレクション（events / babies など）
         match /{sub=**} {
           allow read, write: if isFamilyMember(familyId);
         }
       }
   
       // デフォルト拒否
       match /{document=**} {
         allow read, write: if false;
       }
     }
   }
   
   ```
- families/{familyId}/members/{uid} を基準にアクセス制御
  5. Webアプリ登録（firebaseConfigを取得）

---

#### Codexがやる（コード側）

##### A. Firebase導入と初期化

- firebase SDKを追加
- `src/lib/firebase.ts` を作成し、以下をexportする
  - `app`, `auth`, `db`
  - firebase.tsは以下になる想定
  - ```
    import { initializeApp, getApps } from "firebase/app";
    import { getAuth } from "firebase/auth";
    import { getFirestore } from "firebase/firestore";
    
    // Analytics は「必要になってから」でOK（後述）
    import { getAnalytics, isSupported } from "firebase/analytics";
    
    const firebaseConfig = {
      apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
      storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
      appId: import.meta.env.VITE_FIREBASE_APP_ID,
      measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
    };
    
    // ViteのHMRで二重初期化しないようにする
    export const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
    
    export const auth = getAuth(app);
    export const db = getFirestore(app);
    
    // Analytics は動かない環境もあるのでガードする（任意）
    export async function initAnalytics() {
      if (import.meta.env.DEV) return null; // 開発中は切るのが無難
      const ok = await isSupported();
      return ok ? getAnalytics(app) : null;
    }
    
    ```
  - 
- Analyticsは必須ではない。入れるなら「本番のみ」＋ isSupportedガード

##### B. 環境変数の整備（.env.local含む）

- `.env.example` を追加し、必要キーを列挙する（Vite想定で VITE_ プレフィックス）
- `.gitignore` を確認し `.env.local` がコミットされないようにする
- READMEまたはdocに「`.env.local` を作って値を入れる」手順を書く
  - `.env.local` の中身（例）
    - VITE_FIREBASE_API_KEY=...
    - VITE_FIREBASE_AUTH_DOMAIN=...
    - VITE_FIREBASE_PROJECT_ID=...
    - VITE_FIREBASE_STORAGE_BUCKET=...
    - VITE_FIREBASE_MESSAGING_SENDER_ID=...
    - VITE_FIREBASE_APP_ID=...
    - VITE_FIREBASE_MEASUREMENT_ID=...（任意）

##### C. GoogleログインUI

- ヘッダーまたは設定画面に「ログイン/ログアウト」ボタンを追加
- ログイン状態（メール等）を表示
- auth状態を購読し、ログイン後にFirestore同期を有効化する

##### D. Firestoreデータ構造（Phase 1.5の最小）

- `families/{familyId}`
- `families/{familyId}/members/{uid}`
- `families/{familyId}/babies/{babyId}`
- `families/{familyId}/events/{eventId}`

##### E. 初回ログイン時の family 作成フロー（重要）

- ログイン直後、以下を順に実行する
  1) `familyId` を決める（まずは `familyId = auth.uid` でOK）
  2) `families/{familyId}` が無ければ作成
  3) `families/{familyId}/members/{auth.uid}` を作成（自分を家族メンバーに登録）
- これにより、Firestoreルールに引っかからず events/babies を扱える

##### F. events / babies の保存と購読

- repository層を作り、Firestoreの保存・購読（onSnapshot）を実装する
- 画面状態のソースをFirestoreに寄せる（localは予備/移行用）

##### G. localStorage → Firestore 移行（Phase1資産の救済）

- 初回ログイン時：
  - Firestoreのeventsが空
  - localStorageにeventsがある
  - 未移行フラグ
    の条件なら一括アップロード
- 移行済みフラグで二重移行を防ぐ

##### H. 追加（任意だが便利）

- Firestoreに未同期がある、などの簡易表示（数だけでOK）
- エクスポート/インポート（JSON）は引き続き残す

---

#### 受け入れ条件（Phase 1.5）

- Googleログインできる
- 記録がFirestoreに保存される
- 別ブラウザ/別端末で同じGoogleアカウントでログインすると同じログが見える
- 初回ログイン時に members 登録まで自動で完了する
- localStorageからの移行が一度だけ実行され、データが欠けない

### Phase 2（Googleカレンダー連携を本命として固める）

- Google OAuth 2.0 をアプリに組み込む
- A/Bカレンダーを作成（なければ作る）し、イベントを作る
- 同期の状態（未同期・同期済み・失敗）を見えるようにする
- 失敗時に手動再同期できる

### Phase 3（将来）

- Owlet連携（RESTで取得できるなら取得。難しければ設計だけ先に分離しておく）
- 睡眠・室温・体温などの追加ログ

## 4. 画面要件（Phase 1）

### 4.1 メイン画面（横向き）

- 左：赤ちゃんA、右：赤ちゃんB
- 各パネル内に：
  - 生後◯日
  - ミルク合計（ml / 回数）
  - おむつ回数
  - 大ボタン：ミルク（青）、おむつ（黄）
  - 今日のログ（カード、時刻表示、編集/削除）
- 上部バー：
  - アプリ名「Twinly」（デザインはモックに寄せる）
  - PWA表示
  - Googleカレンダー同期状態（Phase 1はモック表示でOK）
  - 設定ボタン
- 下部：
  - 「保存しました / 取り消す」のスナックバー（Undo）

### 4.2 入力モーダル

- ミルク：
  - 量（ml）を +/- で変更（10ml刻み）
  - 種類：哺乳瓶 / 母乳
  - メモ（任意）
- おむつ：
  - おしっこ / うんち / 両方
  - メモ（任意）

### 4.3 設定（Phase 1）

- 赤ちゃんA/B：
  - 表示名（例：赤ちゃんA）
  - 生年月日（生後日数算出）
  - おむつサイズ（新生児/S/Mなど）
  - 在庫（サイズごとの残枚数）
  - おむつ購入リンク（Amazon URL、任意）
- データ：
  - エクスポート（JSON）
  - インポート（JSON）
  - 全消し（確認あり）

## 5. データモデル（Phase 1の最小）

### 5.1 Event（記録）

- id: string
- babyId: "A" | "B"
- type: "milk" | "diaper" | "daily"
- timestamp: number（epoch ms）
- milk:
  - amountMl?: number
  - method?: "bottle" | "breast"
- diaper:
  - kind?: "pee" | "poop" | "mix"
- note?: string

※ 後でカレンダー同期用に以下を追加できるようにする：

- calendarStatus?: "pending" | "synced" | "error"
- calendarEventId?: string

### 5.2 Profile（赤ちゃん）

- babyId: "A" | "B"
- displayName: string
- birthDate: "YYYY-MM-DD"
- diaperSize: string
- diaperStockBySize: Record<string, number>
- diaperPurchaseUrl?: string

## 6. 技術方針（おすすめ）

- UIは React で実装（mockのJSX資産を活かす）
- できれば TypeScript を使う（保守のため）
- ビルドは Vite を推奨（軽くてPWAに向く）
- PWA対応（manifest + service worker）は Phase 1の後半でOK（最初は通常SPAで作ってよい）
- デザイン：Tailwind CSS 推奨（モックの見た目を作りやすい）
  - 角丸・影・背景グラデの再現を優先

※ 既にプロジェクト雛形がある場合はそれに従う。ない場合は上記で新規作成。

## 7. 実装の優先順位（Codexはこの順で進める）

1) `doc/mock` のUIを見て、メイン画面を再現（見た目と配置）  
2) 記録の追加（ミルク/おむつ）＋Undo  
3) 当日集計（合計ml、回数）＋当日ログ表示  
4) 編集・削除  
5) おむつ在庫の減算 + 10枚以下で購入導線  
6) 設定画面（最低限：名前・在庫・購入リンク）  
7) エクスポート/インポート（JSON）  

## 8. 受け入れ条件（Phase 1）

- 横向きで、A/Bが同時に見える
- ミルク/おむつが「迷わず押せる」サイズのボタンになっている
- 1タップで記録できる（詳細は必要なときだけ）
- Undoで直前の記録が戻る
- 当日の合計値が正しい
- おむつ在庫が記録のたびに減る（設定したサイズ）
- 残り10枚以下で購入リンク誘導が出る（リンク未設定なら出さない）
- ローカル保存され、リロードしてもデータが残る

## 9. コーディング規約（簡単）

- UIコンポーネントは分ける（Main / BabyPanel / Modal / EventCard など）
- 状態は「Event配列 + Profile」に寄せる（あとでFirestoreに移しやすい形）
- 重要ロジック（集計、在庫減算、Undo）は関数として分離しテストしやすくする
- 日本語UI文言はハードコードでOK（将来i18nにしやすいように一箇所に寄せるとなお良い）

## 10. テスト（最低限）

- 集計（合計ml、回数）
- 在庫減算とUndo
- 日次レポート文面生成（最低限のフォーマット確認）

※ テスト基盤がない場合は、まずロジック関数だけでもユニットテストを導入する。

## 11. Codex CLI向けの作業メモ

- まず `doc/mock` のJSXを読み、構造・色・余白を合わせる
- 変更は小さく刻み、動く状態を保つ
- 画面崩れが起きやすい部分（カード角丸・影・背景）は、モックを最優先で寄せる

## 12. コマンド例（必要なら）

- clone: `git clone git@github.com:TomoyaSuzuki86/Twinly.git`
- install/build/test は package.json / README に従う（見つからない場合は作る）

## 13. Env Vars (CI only)

- Do not use local `.env.local`.
- Use GitHub Actions Secrets.
- Required keys:
  - VITE_FIREBASE_API_KEY
  - VITE_FIREBASE_APP_ID
  - VITE_FIREBASE_AUTH_DOMAIN
  - VITE_FIREBASE_MEASUREMENT_ID
  - VITE_FIREBASE_MESSAGING_SENDER_ID
  - VITE_FIREBASE_PROJECT_ID
  - VITE_FIREBASE_STORAGE_BUCKET
  - VITE_GOOGLE_OAUTH_CLIENT_ID

