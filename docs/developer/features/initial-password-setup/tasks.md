# タスク: env 廃止 + ブラウザからの初期パスワード設定

> [`plan.md`](plan.md) を実行可能な単位に分解する. 完了したらチェックを入れる. TDD サイクル (失敗するテスト → 通す → リファクタ) で進める.

## AC ↔ Step マップ

| AC | カバー Step |
| --- | --- |
| AC-1 (env なしでサーバ正常起動) | Step 1 |
| AC-2 (APP_PASSWORD_HASH の参照 0) | Step 1 |
| AC-3 (DB 空で auth-state が initialized: false) | Step 2 |
| AC-4 (DB ありで auth-state が initialized: true) | Step 2 |
| AC-5 (DB 空で /api/v1/password が認証不要 + currentPassword 不要で受理) | Step 4 |
| AC-6 (DB ありで /api/v1/password は従来どおり認証必須) | Step 4 |
| AC-7 (DB 空で /api/v1/login が 412 INITIAL_SETUP_REQUIRED) | Step 3 |
| AC-8 (起動時に未初期化なら InitialSetupView) | Step 7 |
| AC-9 (InitialSetupView 送信成功で auto-login + /today 遷移) | Step 7 |
| AC-10 (新 PW != 確認 PW で送信されない) | Step 6 |
| AC-11 (必須項目空で送信されない) | Step 6 |
| AC-12 (既存ユーザーは LoginView) | Step 7 |
| AC-13 (既存ユーザー + 既存 token は本体直行) | Step 7 |
| AC-14 (Capacitor SetupView 完了後の振り分け) | Step 7 |
| AC-15 (deploy-guide にセキュリティ注意を明記) | Step 8 |

## Step 1: env と password-seed の物理削除

### 実装

- [x] `server/src/main.ts` から `const APP_PASSWORD_HASH = process.env.APP_PASSWORD_HASH ?? ""` と関連 import / 呼び出しを削除する.
- [x] `server/src/main.ts` から `await seedPasswordIfEmpty(passwordRepository, APP_PASSWORD_HASH, Date.now())` と DB 空時の `process.exit(1)` ガードを削除する.
- [x] `server/src/main.ts` の `import { seedPasswordIfEmpty } from "./password-seed.js"` を削除する.
- [x] `server/src/password-seed.ts` をファイルごと削除する.
- [x] 既存テスト `server/__tests__/integration/password-seed.test.ts` を撤去する. 代替として「DB 空 + env なしでサーバが起動できる」起動テストを新規追加する (Step 7 のテスト全体方針と統合).
- [x] `server/__tests__/integration/startup.test.ts` および `__tests__/release/prod-startup.test.ts` で `APP_PASSWORD_HASH` を渡している箇所を本 feature の経路 (初期設定 API で hash を作る) に書き換える.
- [x] `server/__tests__/helpers/login-for-test.ts` の env 依存を初期設定 API 呼び出しに置き換える (DB 空 → `POST /api/v1/password` で hash 作成 + token 取得 → 以後 Bearer で使う).

### テスト (test-designer が用意し, implementer が green 化する)

- [x] AC-1: `APP_PASSWORD_HASH` env を渡さず, DB 空で起動 → `/healthz` が 200 OK を返すまで到達する.
- [x] AC-2: ソースツリーに対する `grep -r "APP_PASSWORD_HASH" server/src web/src` のヒット数が 0 であることをアサートする (自動化はオプション. CI で `grep` するスクリプトを足してもよい).
- [x] AC-2: `server/src/password-seed.ts` が存在しないことを node:fs で確認する.

## Step 2: GET /api/v1/auth-state の新設

### 実装

- [x] `server/src/app.ts` の `authMiddleware` 内で `/api/v1/auth-state` を素通しパスとして扱う (= `/api/v1/login` と同じ早期 next).
- [x] `server/src/app.ts` に `GET /api/v1/auth-state` ハンドラを追加する.
  - `await deps.passwordRepository.getHash()` の結果を `null` 比較し, `{ initialized: hash !== null }` を 200 OK で返す.
  - DB エラー時は 500 INTERNAL_ERROR にフォールバック.

### テスト

- [x] AC-3: DB 空 + Authorization なしで GET `/api/v1/auth-state` → 200 + `{ initialized: false }`.
- [x] AC-4: DB に hash あり + Authorization なしで GET `/api/v1/auth-state` → 200 + `{ initialized: true }`.

## Step 3: POST /api/v1/login の 412 分岐

### 実装

- [x] `server/src/app.ts` の `POST /api/v1/login` ハンドラで, `await deps.passwordRepository.getHash()` が `null` のときの分岐を 500 INTERNAL_ERROR から 412 INITIAL_SETUP_REQUIRED に変更する.
- [x] エラーボディは `{ code: "INITIAL_SETUP_REQUIRED", message: "initial password setup is required" }` 形式 (既存 `errorJson` 流用).

### テスト

- [x] AC-7: DB 空状態で `POST /api/v1/login` に `{ password: "anything" }` → 412 INITIAL_SETUP_REQUIRED. sessions に INSERT されない.
- [x] DB あり時の既存 200 / 401 / 400 経路が引き続き green.

## Step 4: POST /api/v1/password の 2 モード分岐

### 実装

- [x] `server/src/app.ts` の `authMiddleware` で `/api/v1/password` の認証スキップ条件を追加する.
  - `c.req.path === "/api/v1/password"` かつ `await deps.passwordRepository.getHash() === null` のとき素通し.
  - それ以外は既存どおり Bearer 検証.
- [x] `POST /api/v1/password` ハンドラの先頭で `await deps.passwordRepository.getHash()` を 1 回取得し, 結果で 2 モードに分岐する.
- [x] 初期設定モード (`hash === null`):
  - JSON パース失敗 → 400 INVALID_REQUEST_BODY.
  - `newPassword` が文字列でない / 空 → 400 INVALID_REQUEST_BODY.
  - `currentPassword` は受理しても無視する.
  - `bcrypt.hashSync(newPassword, 12)` で新ハッシュ生成.
  - `passwordRepository.setHash(newHash, clock.now())`.
  - `randomBytes(32).toString("hex")` で token 発行 / `expiresAt = nowMs + 30 day` / `sessionRepository.create({ token, expiresAt, createdAt: nowMs })`.
  - 200 OK + `{ token, expiresAt }`.
- [x] 通常モード (`hash !== null`): 既存仕様を維持. `currentPassword` 必須 / Bearer 必須 / sessions 全削除 / 200 OK + 空ボディ.
- [x] エラーハンドリング (bcrypt / DB) の 500 INTERNAL_ERROR フォールバックを引き続き保持する.

### テスト

- [x] AC-5: DB 空 + Authorization なし + `{ newPassword: "P0" }` → 200 OK + ボディに `token` / `expiresAt`. DB に hash が書かれ, sessions に token が INSERT される.
- [x] AC-5 補足: 上記成功直後にもう一度 `POST /api/v1/password` を Bearer なしで叩くと, 通常モードに切り替わって 401 を返す.
- [x] AC-6: DB あり + Authorization なし + `{ newPassword: "P1" }` → 401 UNAUTHORIZED. DB の hash は変わらない.
- [x] 既存の password-change feature のテスト (AC-PWD-2 / AC-PWD-3 / AC-PWD-6 / AC-PWD-11 / AC-PWD-12) が引き続き green.
- [x] 初期設定モードで body 不正 (`newPassword` 欠落 / 型不正 / JSON パース失敗) → 400.

## Step 5: Web auth-state-client / setupInitialPassword

### 実装

- [x] `web/src/auth/auth-state-client.ts` を新設.
  - `fetchAuthState(baseUrl: string): Promise<{ initialized: boolean }>` を実装.
  - 200 → resolve / network → `NetworkError` / その他 → `Error`.
- [x] `web/src/auth/password-client.ts` に `setupInitialPassword(baseUrl: string, newPassword: string): Promise<{ token: string; expiresAt: number }>` を追加.
  - 認証ヘッダなしで `POST /api/v1/password` を叩く.
  - 200 → `{ token, expiresAt }` を resolve / 400 → `BadRequestError` / network → `NetworkError` / その他 → `Error`.

### テスト

- [x] `fetchAuthState`: fetch をモックして 200 + `{ initialized: false }` / `{ initialized: true }` を resolve することを確認.
- [x] `fetchAuthState`: fetch が throw したら `NetworkError` を投げる.
- [x] `setupInitialPassword`: 200 + token / expiresAt を resolve することを確認.
- [x] `setupInitialPassword`: 400 で `BadRequestError`, fetch throw で `NetworkError`.

## Step 6: InitialSetupView コンポーネントの新設

### 実装

- [x] `web/src/ui/initial-setup-view/initial-setup-view.tsx` を新設.
  - Props: `setupInitialPassword(newPassword): Promise<{ token, expiresAt }>`, `onSetupSuccess({ token, expiresAt }): void | Promise<void>`.
  - state: `newPassword`, `confirmPassword`, `error`, `submitting`.
  - DOM: `<main>` + `<h1>初期パスワード設定</h1>` + `role="alert"` エラー領域 + form (2 input + 送信ボタン).
  - input: `type="password"` / `autocomplete="new-password"` / `required` / `aria-invalid` / `aria-describedby`.
  - 送信前バリデーション: 空 → 送信せず error. 不一致 → 送信せず error.
  - 送信処理: `await setupInitialPassword(newPassword)` → 成功で `await onSetupSuccess(result)` / 失敗で error 表示.
  - 初回マウントで新パスワード input に focus / 失敗後にも focus を戻す.
  - submit 中は `aria-busy="true"` / `disabled`.
- [x] `web/src/ui/initial-setup-view/initial-setup-view.css` を新設 (login-view.css 相当の最小スタイル).

### テスト

- [x] AC-10: 新パスワード "A" + 確認入力 "B" で送信ボタン → `setupInitialPassword` が呼ばれない + `role="alert"` にエラー表示.
- [x] AC-11: いずれかが空のまま送信ボタン → `setupInitialPassword` が呼ばれない.
- [x] 正常系: 一致する 2 入力で送信ボタン → `setupInitialPassword` が呼ばれ, resolve で `onSetupSuccess(result)` が呼ばれる.
- [x] エラー系: `BadRequestError` / `NetworkError` / その他のエラーで対応する文言が画面に出る.
- [x] a11y: input に `autocomplete="new-password"` / `aria-invalid` / `aria-describedby` が正しく付与される.

## Step 7: main.tsx の分岐組み込み

### 実装

- [x] `web/src/main.tsx` の `App` に `authState: { initialized: boolean } | null` state と setter を追加.
- [x] `useEffect` で起動時に `fetchAuthState(baseUrl)` を呼ぶ.
  - `currentMode === "local"` のときは fetch しない.
  - 成功で `setAuthState(result)` を更新する.
  - 失敗 (NetworkError) は state を更新せず, 既存の `ErrorNotification` / `OfflineBanner` 経路に任せる.
- [x] レンダリング分岐を以下の優先順で実装:
  1. `currentMode === "server"` かつ `authState === null` → 空表示 (またはスピナー).
  2. `currentMode === "server"` かつ `authState?.initialized === false` → `<InitialSetupView setupInitialPassword={...} onSetupSuccess={...} />` を全画面表示.
  3. `currentMode === "server"` かつ `authState?.initialized === true` かつ `!token` かつ `!needsSetup` → 既存どおり `<LoginView ... />`.
  4. それ以外 → 既存どおり `<Routes>` 配下の本体に入る.
- [x] `onSetupSuccess(result)` の中身:
  - `await authStorage.setToken(result.token)`.
  - `setToken(result.token)` / `setAuthToken(result.token)`.
  - `setAuthState({ initialized: true })`.
  - `setRepos(buildHttpRepos(baseUrl))`.
  - `navigate("/today", { replace: true })`.
- [x] `setupInitialPassword` プロップ用ラッパ: `auth/password-client.setupInitialPassword(baseUrl, newPassword)` を呼ぶハンドラを定義する.
- [x] Capacitor `SetupView` 完了後の挙動は既存のまま (`navigate("/", { replace: true })`). 後続は上記分岐が `auth-state` に応じて InitialSetupView / LoginView を出す.

### テスト

- [x] AC-8: `fetchAuthState` モックが `{ initialized: false }` を返したとき `InitialSetupView` が描画される. LoginView は描画されない.
- [x] AC-9: `InitialSetupView` の `onSetupSuccess` を発火させると, `authStorage.setToken` が呼ばれ, `setToken` / `setAuthState({ initialized: true })` で state が更新され, `navigate("/today", { replace: true })` が呼ばれる.
- [x] AC-12: `fetchAuthState` モックが `{ initialized: true }` を返し token が無いと LoginView が描画される.
- [x] AC-13: `fetchAuthState` モックが `{ initialized: true }` を返し token があると本体 (`<Routes>` 配下) が描画される.
- [x] AC-14: Capacitor の `SetupView` 完了 (`navigate("/")`) 後に同じ分岐に乗り, `auth-state` の結果に応じて InitialSetupView / LoginView が選ばれる.

## Step 8: ドキュメント更新

### ドキュメント

- [x] `docs/user/deploy-guide.md` の環境変数表から `APP_PASSWORD_HASH` を削除する.
- [x] `docs/user/deploy-guide.md` のセットアップ手順を「サーバ起動 → ブラウザで `/` を開く → 初期パスワード設定」のフローに書き換える.
- [x] `docs/user/deploy-guide.md` に NFR-IPS-1 のセキュリティ注意 (「サーバ起動後, 最初に URL に到達したユーザーが初期パスワード設定者となる. デプロイ完了直後に運用者本人が即座にブラウザでアクセスすること」) を明記する.
- [x] `docs/user/quick-start.md` から `APP_PASSWORD_HASH` / bcrypt CLI 手順を削除し, 初回起動フローを「ブラウザで開いて初期設定する」形に書き換える.
- [x] `docs/user/faq.md` の「パスワードを忘れた場合」を「DB に SSH で入り `app_password` テーブルの行を `DELETE` → 再度ブラウザで `/` を開いて初期設定」フローに書き換える.
- [x] `docs/developer/setup/server.md` から env 関連の記述を削除し, 起動条件を更新する.
- [x] `.env.example` から `APP_PASSWORD_HASH` の行を削除する.
- [x] `docs/developer/architecture/api/openapi.yaml` に以下を反映する.
  - `GET /api/v1/auth-state` の追加 (認証不要 / 200 / `{ initialized: boolean }`).
  - `POST /api/v1/password` の 2 モード分岐 (DB 空: 認証不要 + `{ newPassword }` + 200 / `{ token, expiresAt }`. DB あり: 既存どおり).
  - `POST /api/v1/login` の 412 INITIAL_SETUP_REQUIRED.

### テスト

- [x] AC-15: `docs/user/deploy-guide.md` を読んで NFR-IPS-1 の注意が記載されていることを目視確認する (自動化はオプション).

## 仕上げ

- [x] 受け入れ基準 (spec.md AC-1 〜 AC-15) を全て満たすことを確認.
- [x] サーバ全テスト (vitest) と Web 全テストが green.
- [x] typecheck / lint 0 エラー.
- [x] `grep -r "APP_PASSWORD_HASH" server/src web/src` のヒット数が 0.
- [x] `server/src/password-seed.ts` が存在しないことを確認.
- [x] auditor にレビュー依頼.
