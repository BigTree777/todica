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

- [ ] **失敗テスト**: `server/__tests__/unit/session-repository.test.ts` を新規追加し, `DrizzleSessionRepository` の以下を red 状態で作る (AC-2 / AC-4 / AC-5 の基盤).
  - [ ] `create({ token, expiresAt, createdAt })` で行が INSERT される.
  - [ ] `findValidByToken(token, now)` が期限内なら行を返し, 期限切れなら `null` を返す (境界 `expires_at === now` は期限切れ扱い = strict `>` 判定).
  - [ ] `deleteByToken(token)` で行が削除され, 以降の `findValidByToken` が `null` になる.
- [ ] **実装**: `server/drizzle/00xx_sessions.sql` 追加 / `server/drizzle/meta/_journal.json` 更新 / `server/src/db/schema.ts` に `sessions` テーブル追加 / `server/src/data/session-repository.ts` interface 新規 / `server/src/infra/persistence/drizzle/session-repository.ts` 実装 新規.
- [ ] 上記単体テストが green になることを確認.

## Step 2: /login /logout + authMiddleware 切替 + AUTH_TOKEN 削除

- [ ] **失敗テスト**: `server/__tests__/integration/login.test.ts` を新規追加し, 以下を red 状態で作る.
  - [ ] **AC-2**: `POST /api/v1/login { password: "correct" }` が 200 と `{ token, expiresAt }` を返し, sessions に行が増えること.
  - [ ] **AC-3**: `POST /api/v1/login { password: "wrong" }` が 401 `{ code: "INVALID_PASSWORD" }` を返すこと.
  - [ ] body が不正 (password 欠落 / 非文字列 / 空文字) で 400 を返すこと.
  - [ ] **AC-5**: 有効 token を持って `POST /api/v1/logout` を呼ぶと 204 + sessions から行が消えること. 連続して logout しても 204 (冪等 no-op).
  - [ ] 有効 token なしで `/api/v1/logout` を呼ぶと 401 (authMiddleware で弾かれる).
  - [ ] login / logout が Idempotency-Key 必須ガードの対象外であること (`Idempotency-Key` ヘッダ無しで 400 にならないこと).
- [ ] **失敗テスト**: 既存 `server/__tests__/integration/*` の Bearer が固定 `AUTH_TOKEN` 前提のため一斉に red になる. **Step 8 で一括書き換える前提**で本 Step では新規テストのみ green を目指す.
- [ ] **失敗テスト**: `server/__tests__/integration/auth.test.ts` (新規 or 既存追記) で以下を red 状態に.
  - [ ] **AC-1**: token なしで `/api/v1/today` を叩いて 401.
  - [ ] **AC-4**: `expires_at <= now` の session token で `/api/v1/today` を叩いて 401 (FakeClock で時刻を進めて検証).
  - [ ] **AC-7**: 旧固定 `AUTH_TOKEN` 風の文字列を Bearer に乗せても 401 (sessions に存在しない token は一律拒否).
- [ ] **実装**:
  - [ ] `package.json` (server / root) に `bcrypt` + `@types/bcrypt` を追加.
  - [ ] `server/src/app.ts`: `AppDeps.authToken` を削除し, `passwordHash: string` + `sessionRepository: SessionRepository` を追加.
  - [ ] `server/src/app.ts`: `authMiddleware` を sessions lookup に差し替え. `path === "/api/v1/login"` および既存 `/healthz` を素通し.
  - [ ] `server/src/app.ts`: `idempotencyMiddleware` に `/api/v1/login` `/api/v1/logout` の除外を追加.
  - [ ] `server/src/app.ts`: `POST /api/v1/login` ハンドラ追加 (`bcrypt.compare` + `crypto.randomBytes(32).toString("hex")` + `sessionRepository.create`).
  - [ ] `server/src/app.ts`: `POST /api/v1/logout` ハンドラ追加 (Authorization の token を `sessionRepository.deleteByToken`).
  - [ ] `server/src/main.ts`: `AUTH_TOKEN` 読取と必須チェック削除 / `APP_PASSWORD_HASH` 必須化 / `DrizzleSessionRepository` インスタンス化 / `createApp` の引数差替え.
  - [ ] `server/__tests__/helpers/login.ts` 新規: `loginForTest(app, password)` ヘルパ.
- [ ] 上記 integration テストが green になることを確認.

## Step 3: Web auth-storage + authed-fetch + Repository リファクタ

- [ ] **失敗テスト**: `web/src/auth/auth-storage.test.ts` 新規追加 (AC-2 / AC-4 / AC-5 の基盤).
  - [ ] Web 実装: `setToken(t)` → `getToken()` で `t` が返る → `clearToken()` で `null` に戻る.
  - [ ] Capacitor 実装: モック `@capacitor/preferences` で `Preferences.set/get/remove` が呼ばれる.
- [ ] **失敗テスト**: `web/src/auth/authed-fetch.test.ts` 新規追加.
  - [ ] **AC-4 基盤**: 401 応答時に `auth-storage.clearToken()` が呼ばれ, `todica:auth-expired` イベントが発火する.
  - [ ] 200 応答時は素通しで body / status を呼出元に返す.
  - [ ] token が `null` の時は Authorization ヘッダを付けない.
- [ ] **実装**:
  - [ ] `web/src/auth/auth-storage.ts` 新規: interface + Web (localStorage) 実装 + Capacitor (Preferences) 実装 + 起動時セレクタ.
  - [ ] `web/src/auth/authed-fetch.ts` 新規: 共通 fetch ラッパ + 401 interceptor.
  - [ ] `web/src/auth/login-client.ts` 新規: `login(password)` / `logout()`.
  - [ ] `web/src/repositories/task-repository.ts` 等 5 本: コンストラクタから `authToken` 引数を撤去し `authed-fetch` を使う.
  - [ ] 既存 Repository テストが新シグネチャでも通るよう, 必要に応じて beforeEach の `auth-storage.setToken("test-token")` 注入.
- [ ] 上記単体テストが green になることを確認.

## Step 4: LoginView + main.tsx 起動分岐 + 401 listener

- [ ] **失敗テスト**: `web/src/ui/login-view/login-view.test.tsx` 新規追加.
  - [ ] **AC-2**: 正しいパスワードを入力 → submit で `POST /api/v1/login` が呼ばれ, 200 応答時に `auth-storage.setToken(...)` + `/today` に遷移する.
  - [ ] **AC-3**: 401 応答時にエラーメッセージ「パスワードが正しくありません」が `role="alert"` で表示され, LoginView に留まる. token は保存されない.
  - [ ] ネットワークエラー時にエラーメッセージ「サーバに接続できません」が表示される.
  - [ ] submit 中は `aria-busy="true"` が button に付与され二重送信できない.
  - [ ] `<input type="password" autocomplete="current-password" required>` が描画される.
  - [ ] エラー後に password input にフォーカスが戻る.
- [ ] **失敗テスト**: `web/src/main.test.tsx` (新規 or 既存追記) で起動分岐を red 状態に.
  - [ ] **AC-1**: `auth-storage.getToken()` が `null` を返す状況で起動すると LoginView が表示され, `/today` を URL に入れても LoginView に redirect される.
  - [ ] `getToken()` が token を返す状況で起動すると本体 (TodayView) が表示される.
  - [ ] **AC-4**: `todica:auth-expired` イベントが発火すると LoginView に遷移する.
- [ ] **実装**:
  - [ ] `web/src/ui/login-view/login-view.tsx` 新規.
  - [ ] `web/src/main.tsx`:
    - [ ] `VITE_AUTH_TOKEN` 参照を完全削除.
    - [ ] init で `auth-storage.getToken()` を取得し token 有無で `<LoginView>` / 本体 を分岐.
    - [ ] `window.addEventListener("todica:auth-expired", ...)` を配線し state を `null` に reset.
- [ ] 上記テストが green になることを確認.

## Step 5: SetupView 簡素化 + SettingsView ログアウト

- [ ] **失敗テスト**: `web/src/ui/setup-view/setup-view.test.tsx` 更新.
  - [ ] **AC-6**: token 入力欄が存在しないこと.
  - [ ] **AC-6**: URL 入力 → submit で `fetch(url + "/healthz")` が呼ばれ, 200 応答時に `onSave(url)` が呼ばれる. 失敗時 (4xx / 5xx / timeout / network error) はエラーメッセージを表示し `onSave` は呼ばれない.
- [ ] **失敗テスト**: `web/src/ui/settings-view/settings-view.test.tsx` 追記.
  - [ ] **AC-5**: 「ログアウト」ボタンが描画されており, 押下で `POST /api/v1/logout` が呼ばれ, 200/204 応答後に `auth-storage.clearToken()` が呼ばれ LoginView に遷移する.
- [ ] **実装**:
  - [ ] `web/src/ui/setup-view/setup-view.tsx`: token 入力欄削除 / `onSave` の signature を `(url) => void` に変更 / `/healthz` 検証を追加.
  - [ ] `web/src/ui/settings-view/settings-view.tsx`: 「ログアウト」 button を追加し handler を配線.
  - [ ] `web/src/main.tsx`: 上記の `onSave(url)` シグネチャ変更に追随.
- [ ] 上記テストが green になることを確認.

## Step 6: Service Worker /api/* 除外

- [ ] **失敗テスト**: `e2e/pwa-prod.spec.ts` または新規 `e2e/sw-api-bypass.spec.ts` に以下のテストを追加.
  - [ ] SW activate 後にオフラインで `/api/v1/today` を fetch すると, SW から cached 応答が返されず通常通り network fallback / failure になる.
  - [ ] `/api/v1/login` の応答 (`token` を含む) が SW の cache storage に乗っていないこと.
- [ ] **実装**:
  - [ ] `web/vite.config.ts`: `VitePWA` の `workbox.navigateFallbackDenylist` (または `injectManifest` 経由) で `/^\/api\//` を除外.
  - [ ] `web/src/sw/service-worker.ts`: runtime caching ルートから `/api/*` を除外.
- [ ] 既存 PWA E2E (`e2e/pwa-prod.spec.ts`) が green を維持することを確認.

## Step 7: env / docs 更新

- [ ] `.env.example`: `AUTH_TOKEN` / `VITE_AUTH_TOKEN` を削除し `APP_PASSWORD_HASH=` を追加. コメントで bcrypt ハッシュであることを明記.
- [ ] `docs/user/deploy-guide.md` §3 env 表を更新し, ハッシュ生成手順 (`node -e "console.log(require('bcrypt').hashSync('your-password', 12))"`) を追記.
- [ ] `docs/developer/setup/server.md` の env 表 / 起動手順を更新.
- [ ] `docs/developer/setup/quick-start.md` の env 表 / dev 起動手順を更新 (`AUTH_TOKEN` 削除 / login 経由の動作確認手順を追加).
- [ ] `docs/developer/quality/test-catalog.md` に login / logout / 401 interceptor / 期限切れ token の項目を追加.

## Step 8: 既存テスト一括更新 + prod-startup 拡張 + E2E

- [ ] `server/__tests__/integration/*.test.ts` (47 ファイル超) の beforeEach に `loginForTest(app, "test-password")` を入れ, 各 fetch の Bearer を取得した token に置換.
- [ ] `__tests__/release/prod-startup.test.ts` を更新:
  - [ ] env を `AUTH_TOKEN` から `APP_PASSWORD_HASH` (bcrypt cost=4 でハッシュ化した既知パスワード) に差し替え.
  - [ ] 起動後に `POST /api/v1/login` で token を取得.
  - [ ] その token で `/api/v1/today` を Bearer 認証付きで叩いて 200 を確認 (受け入れ基準 AC-1 + AC-2 を release バイナリでも担保).
- [ ] **E2E** `e2e/login.spec.ts` 新規追加:
  - [ ] **AC-2 + AC-5**: TodayView 直アクセス → LoginView リダイレクト → 正しいパスワード入力 → /today 表示 → SettingsView ログアウト → LoginView に戻る.
  - [ ] **AC-3**: 誤ったパスワード入力 → エラーメッセージ表示 → LoginView 留まる.

## ドキュメント

- [ ] `docs/developer/features/app-login/plan.md` 内の D-x に, 実装段で出た判断点 (もしあれば) を追記.
- [ ] `docs/developer/architecture/database/schema.md` に `sessions` テーブルを追記.
- [ ] `docs/developer/architecture/database/overview.md` §9 (物理スキーマ一覧) に `sessions` を追記.

## 仕上げ

- [ ] **AC-1**: 未認証で `/` を開くと LoginView 表示 + `/api/v1/*` が 401 を返すことを E2E で確認.
- [ ] **AC-2**: 正しいパスワードでログインすると token が `localStorage` / `Preferences` に保存され `/today` に遷移することを E2E で確認.
- [ ] **AC-3**: 不正なパスワードで 401 が返り「パスワードが正しくありません」を表示し LoginView 留まることを E2E で確認.
- [ ] **AC-4**: 期限切れ token で API を叩くと 401 → token 破棄 → LoginView 遷移することを integration + E2E で確認.
- [ ] **AC-5**: SettingsView の「ログアウト」で sessions から行が消え token 破棄 + LoginView 遷移することを E2E で確認.
- [ ] **AC-6**: Android 想定で SetupView が URL + `/healthz` 検証のみになり, 検証成功で LoginView に遷移することを単体 + E2E で確認.
- [ ] **AC-7**: 旧固定 AUTH_TOKEN 風文字列を Bearer に乗せても 401 になることを integration で確認.
- [ ] `npm test` / E2E / `__tests__/release/prod-startup.test.ts` がすべて green.
- [ ] `auditor` サブエージェントにレビュー依頼.
