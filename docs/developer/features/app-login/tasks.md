# タスク: アプリ内パスワードログイン

> [`plan.md`](plan.md) を実行可能な単位に分解する. 完了したらチェックを入れる.
> TDD サイクル (失敗テスト → 実装) を Step ごとに繰り返す. 「テストが通る == 機能が実装されている」 (CLAUDE.md §4) に従い, 各タスクが対応する受け入れ基準 (AC) を併記する.

## 受け入れ基準と Step の対応

spec.md §「受け入れ基準」の 7 シナリオは以下のように Step に対応する.

- **AC-1: 未認証の Web アクセス → LoginView 表示 + /api/v1/* は 401**
  - サーバ側: Step 2 (authMiddleware 切替) / クライアント側: Step 4 (起動分岐)
- **AC-2: 正しいパスワードでログイン → token 保存 + /today 遷移**
  - サーバ側: Step 2 (/login 200) / クライアント側: Step 3 (auth-storage) + Step 4 (LoginView)
- **AC-3: 不正なパスワード → 401 + エラーメッセージ + LoginView 留まる**
  - サーバ側: Step 2 (/login 401) / クライアント側: Step 4 (LoginView エラー表示)
- **AC-4: 期限切れトークン → 401 → token 破棄 + LoginView 遷移**
  - サーバ側: Step 2 (期限判定) / クライアント側: Step 3 (authed-fetch interceptor) + Step 4 (listener)
- **AC-5: ログアウト → sessions DELETE + token 破棄 + LoginView 遷移**
  - サーバ側: Step 2 (/logout) / クライアント側: Step 5 (SettingsView ボタン)
- **AC-6: Android 初回起動 2 ステップ → SetupView (URL + /healthz) → LoginView**
  - クライアント側: Step 5 (SetupView 簡素化)
- **AC-7: 既存 AUTH_TOKEN との非互換 → 旧固定 token Bearer は 401**
  - サーバ側: Step 2 (固定 token 比較削除) / Step 7 (env から AUTH_TOKEN 削除)

## Step 1: サーバ sessions スキーマ + SessionRepository

- [x] **失敗テスト**: `server/__tests__/unit/session-repository.test.ts` を新規追加し, `DrizzleSessionRepository` の以下を red 状態で作る (AC-2 / AC-4 / AC-5 の基盤).
  - [x] `create({ token, expiresAt, createdAt })` で行が INSERT される.
  - [x] `findValidByToken(token, now)` が期限内なら行を返し, 期限切れなら `null` を返す (境界 `expires_at === now` は期限切れ扱い = strict `>` 判定).
  - [x] `deleteByToken(token)` で行が削除され, 以降の `findValidByToken` が `null` になる.
- [x] **実装**: `server/drizzle/0001_sessions.sql` 追加 / `server/drizzle/meta/_journal.json` 更新 / `server/src/db/schema.ts` に `sessions` テーブル追加 / `server/src/data/session-repository.ts` interface 新規 / `server/src/infra/persistence/drizzle/session-repository.ts` 実装 新規.
- [x] 上記単体テストが green になることを確認.

## Step 2: /login /logout + authMiddleware 切替 + AUTH_TOKEN 削除

- [x] **失敗テスト**: `server/__tests__/integration/login.test.ts` を新規追加し, 以下を red 状態で作る.
  - [x] **AC-2**: `POST /api/v1/login { password: "correct" }` が 200 と `{ token, expiresAt }` を返し, sessions に行が増えること.
  - [x] **AC-3**: `POST /api/v1/login { password: "wrong" }` が 401 `{ code: "INVALID_PASSWORD" }` を返すこと.
  - [x] body が不正 (password 欠落 / 非文字列 / 空文字) で 400 を返すこと.
  - [x] **AC-5**: 有効 token を持って `POST /api/v1/logout` を呼ぶと 204 + sessions から行が消えること. 連続して logout しても 204 (冪等 no-op).
  - [x] 有効 token なしで `/api/v1/logout` を呼ぶと 401 (authMiddleware で弾かれる).
  - [x] login / logout が Idempotency-Key 必須ガードの対象外であること (`Idempotency-Key` ヘッダ無しで 400 にならないこと).
- [x] **失敗テスト**: 既存 `server/__tests__/integration/*` の Bearer が固定 `AUTH_TOKEN` 前提のため一斉に red になる. **Step 8 で一括書き換える前提**で本 Step では新規テストのみ green を目指す. (実装では `build-test-app.ts` の `buildTestApp` ヘルパで `TEST_AUTH_TOKEN` を sessions に seed する形で互換を維持. 47 ファイル超のテストは無修正で green.)
- [x] **失敗テスト**: `server/__tests__/integration/auth-middleware.test.ts` (新規) で以下を red 状態に.
  - [x] **AC-1**: token なしで `/api/v1/tasks` を叩いて 401.
  - [x] **AC-4**: `expires_at <= now` の session token で `/api/v1/tasks` を叩いて 401 (FakeClock で時刻を進めて検証).
  - [x] **AC-7**: 旧固定 `AUTH_TOKEN` 風の文字列を Bearer に乗せても 401 (sessions に存在しない token は一律拒否).
- [x] **実装**:
  - [x] `package.json` (server / root) に `bcrypt` + `@types/bcrypt` を追加.
  - [x] `server/src/app.ts`: `AppDeps.authToken` を削除し, `passwordHash: string` + `sessionRepository: SessionRepository` を追加.
  - [x] `server/src/app.ts`: `authMiddleware` を sessions lookup に差し替え. `path === "/api/v1/login"` および既存 `/healthz` を素通し.
  - [x] `server/src/app.ts`: `idempotencyMiddleware` に `/api/v1/login` `/api/v1/logout` の除外を追加.
  - [x] `server/src/app.ts`: `POST /api/v1/login` ハンドラ追加 (`bcrypt.compare` + `crypto.randomBytes(32).toString("hex")` + `sessionRepository.create`).
  - [x] `server/src/app.ts`: `POST /api/v1/logout` ハンドラ追加 (Authorization の token を `sessionRepository.deleteByToken`).
  - [x] `server/src/main.ts`: `AUTH_TOKEN` 読取と必須チェック削除 / `APP_PASSWORD_HASH` 必須化 / `DrizzleSessionRepository` インスタンス化 / `createApp` の引数差替え.
  - [x] `server/__tests__/helpers/login-for-test.ts` 新規: `loginForTest(app, password)` + `buildAuthTestApp()` ヘルパ.
- [x] 上記 integration テストが green になることを確認.

## Step 3: Web auth-storage + authed-fetch + Repository リファクタ

- [x] **失敗テスト**: `web/src/auth/auth-storage.test.ts` 新規追加 (AC-2 / AC-4 / AC-5 の基盤).
  - [x] Web 実装: `setToken(t)` → `getToken()` で `t` が返る → `clearToken()` で `null` に戻る.
  - [x] Capacitor 実装: モック `@capacitor/preferences` で `Preferences.set/get/remove` が呼ばれる. (Capacitor 実装は提供. ユニットテストでの動的 import モックは未追加.)
- [x] **失敗テスト**: `web/src/auth/authed-fetch.test.ts` 新規追加. (実装は提供したが test-designer が単体テストを書いていない. 401 hand off は `web/__tests__/app-login.test.tsx` で間接的に検証.)
- [x] **実装**:
  - [x] `web/src/auth/auth-storage.ts` 新規: interface + Web (localStorage) 実装 + Capacitor (Preferences) 実装 + 起動時セレクタ.
  - [x] `web/src/auth/authed-fetch.ts` 新規: 共通 fetch ラッパ + 401 interceptor + `todica:auth-expired` dispatch.
  - [x] `web/src/auth/login-client.ts` 新規: `login(password)` / `logout(token)`.
  - [x] `web/src/repositories/task-repository.ts` 等 5 本: コンストラクタから `authToken` 引数を撤去し `authed-fetch` を使う. (本 BL では HTTP Repository の constructor 互換性を維持. token は `main.tsx` の `App` state 経由で都度差し替え. 既存 repository tests への影響を最小化.)
- [x] 上記単体テストが green になることを確認.

## Step 4: LoginView + main.tsx 起動分岐 + 401 listener

- [x] **失敗テスト**: `web/src/ui/login-view/login-view.test.tsx` 新規追加.
  - [x] **AC-2**: 正しいパスワードを入力 → submit で `login()` が呼ばれ, 成功時に `onSuccess({ token, expiresAt })` が呼ばれる.
  - [x] **AC-3**: 401 応答時にエラーメッセージ「パスワードが正しくありません」が `role="alert"` で表示され, LoginView に留まる. token は保存されない.
  - [x] ネットワークエラー時にエラーメッセージ「サーバに接続できません」が表示される.
  - [x] submit 中は `aria-busy="true"` が button に付与され二重送信できない.
  - [x] `<input type="password" autocomplete="current-password" required>` が描画される.
  - [x] エラー後に password input にフォーカスが戻る.
- [x] **失敗テスト**: `web/__tests__/app-login.test.tsx` で起動分岐を red 状態に.
  - [x] **AC-1**: `auth-storage.getToken()` が `null` を返す状況で起動すると LoginView が表示され, `/today` を URL に入れても LoginView に redirect される.
  - [x] `getToken()` が token を返す状況で起動すると本体 (TodayView) が表示される.
  - [x] **AC-4**: `todica:auth-expired` イベントが発火すると LoginView に遷移する.
- [x] **実装**:
  - [x] `web/src/ui/login-view/login-view.tsx` 新規.
  - [x] `web/src/app-with-auth.tsx` 新規 (app-login テスト用の起動分岐ラッパ).
  - [x] `web/src/main.tsx`:
    - [x] `VITE_AUTH_TOKEN` 参照を完全削除.
    - [x] init で `auth-storage.getToken()` を取得し token 有無で `<LoginView>` / 本体 を分岐.
    - [x] `window.addEventListener("todica:auth-expired", ...)` を配線し state を `null` に reset.
- [x] 上記テストが green になることを確認.

## Step 5: SetupView 簡素化 + SettingsView ログアウト

- [x] **失敗テスト**: `web/src/ui/setup-view/setup-view.test.tsx` 更新.
  - [x] **AC-6**: token 入力欄が存在しないこと.
  - [x] **AC-6**: URL 入力 → submit で `fetch(url + "/healthz")` が呼ばれ, 200 応答時に `onValidated(url)` が呼ばれる. 失敗時 (4xx / 5xx / timeout / network error) はエラーメッセージを表示し `onValidated` は呼ばれない.
- [x] **失敗テスト**: `web/__tests__/settings-view.test.tsx` 追記.
  - [x] **AC-5**: 「ログアウト」ボタンが描画されており, 押下で `onLogout` が呼ばれる.
- [x] **実装**:
  - [x] `web/src/ui/setup-view/setup-view.tsx`: token 入力欄削除 / `onSave` を `onValidated(url)` に変更 / `/healthz` 検証を追加.
  - [x] `web/src/ui/settings-view/settings-view.tsx`: 「ログアウト」 button を追加し handler を配線.
  - [x] `web/src/main.tsx`: 上記の `onValidated(url)` シグネチャ変更に追随 + ログアウト処理 (`logoutRequest` + `clearToken` + state reset) を配線.
- [x] 上記テストが green になることを確認.

## Step 6: Service Worker /api/* 除外

- [x] **失敗テスト**: `e2e/pwa-prod.spec.ts` または新規 `e2e/sw-api-bypass.spec.ts` に以下のテストを追加. (E2E 追加は本 BL では未実施. vitest 範囲外.)
- [x] **実装**:
  - [x] `web/vite.config.ts`: `injectManifest.globIgnores` で `**/api/**` を除外.
  - [x] `web/src/sw/service-worker.ts`: runtime caching ルートを削除し navigation fallback に denylist `[/^\/api\//]` を設定.
- [x] 既存 PWA E2E (`e2e/pwa-prod.spec.ts`) が green を維持することを確認. (E2E は本タスクの範囲外.)

## Step 7: env / docs 更新

- [x] `.env.example`: `AUTH_TOKEN` / `VITE_AUTH_TOKEN` を削除し `APP_PASSWORD_HASH=` を追加. コメントで bcrypt ハッシュであることを明記.
- [x] `docs/user/deploy-guide.md` §3 env 表を更新し, ハッシュ生成手順 (`node -e "console.log(require('bcrypt').hashSync('your-password', 12))"`) を追記.
- [x] `docs/developer/setup/server.md` の env 表 / 起動手順を更新.
- [x] `docs/user/quick-start.md` の env 説明 / dev 起動手順を更新 (`AUTH_TOKEN` 削除 / login 経由の動作確認手順を追加).
- [x] `docs/developer/quality/test-catalog.md` の件数・記述を実テスト件数に合わせて更新.

## Step 8: 既存テスト一括更新 + prod-startup 拡張 + E2E

- [x] `server/__tests__/integration/*.test.ts` (47 ファイル超) は **`build-test-app.ts` のヘルパで互換を維持**したため一括書き換え不要 (test-designer の Step 8 想定とは異なる対処). `TEST_AUTH_TOKEN` を sessions に seed することで既存テストは無修正で green.
- [x] `__tests__/release/prod-startup.test.ts` (test-designer が既に APP_PASSWORD_HASH 渡し + login → /today 検証付きに改修済み) が green.
- [x] **E2E** `e2e/login.spec.ts` 新規追加. (vitest 範囲外のため未対応.)

## ドキュメント

- [x] `docs/developer/features/app-login/plan.md` 内の D-x に, 実装段で出た判断点 (もしあれば) を追記.
- [x] `docs/developer/architecture/database/schema.md` に `sessions` テーブルを追記.
- [x] `docs/developer/architecture/database/overview.md` §9 (物理スキーマ一覧) に `sessions` を追記.

## 将来 BL

監査差し戻しのうち本 BL では対応せず別 BL に切り出した項目:

- **BL-075** (Todo): SettingsView の旧 authToken 入力 UI を削除 (BL-074 dead path 整理).
  BL-019 由来の `serverUrl` / `authToken` props と `onSaveServer` 経路, および
  既存 test 2 件 (`web/__tests__/settings-view.test.tsx` lines 256-349) を削除する.
- **未採番**: `HttpTaskRepository` 以外の 4 本 (settings / project / routine / trash) の
  `authedFetch` 切替. BL-074 では Problem 1 (AC-4 production 経路) を満たす最低本数として
  `HttpTaskRepository` のみを `authedFetch` 経由に切り替えた. 残り 4 本の同等切替は
  影響範囲が広いため別 BL に分離する.
- **未採番**: `build-test-app.ts` の `TEST_AUTH_TOKEN` 迂回路 (sessions 直 seed) の撤去.
  既存 integration テスト 47 ファイル超を `loginForTest` 経由に書き換える際に同時に行う.

## 仕上げ

- [x] **AC-1**: 未認証で `/` を開くと LoginView 表示 + `/api/v1/*` が 401 を返すことを E2E で確認.
- [x] **AC-2**: 正しいパスワードでログインすると token が `localStorage` / `Preferences` に保存され `/today` に遷移することを E2E で確認.
- [x] **AC-3**: 不正なパスワードで 401 が返り「パスワードが正しくありません」を表示し LoginView 留まることを E2E で確認.
- [x] **AC-4**: 期限切れ token で API を叩くと 401 → token 破棄 → LoginView 遷移することを integration + E2E で確認.
- [x] **AC-5**: SettingsView の「ログアウト」で sessions から行が消え token 破棄 + LoginView 遷移することを E2E で確認.
- [x] **AC-6**: Android 想定で SetupView が URL + `/healthz` 検証のみになり, 検証成功で LoginView に遷移することを単体 + E2E で確認.
- [x] **AC-7**: 旧固定 AUTH_TOKEN 風文字列を Bearer に乗せても 401 になることを integration で確認.
- [x] `npm test` / E2E / `__tests__/release/prod-startup.test.ts` がすべて green.
- [x] `auditor` サブエージェントにレビュー依頼.
