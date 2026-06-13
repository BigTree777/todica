# 設計・実装計画: アプリ内パスワードログイン

> [`spec.md`](spec.md) の要件を, どう実現するかに落とす. BL-074 に対応する.

## 方針概要

サーバに `POST /api/v1/login` / `/logout` の 2 本を新設し, bcrypt ハッシュ照合に成功したら `crypto.randomBytes(32).toString("hex")` の opaque token を発行して新規 `sessions` テーブルに `(token PK, expires_at, created_at)` で永続化する. 既存 authMiddleware (`server/src/app.ts:120` 付近) は固定値比較から「sessions テーブル lookup + 期限判定」に差し替え, `AUTH_TOKEN` / `VITE_AUTH_TOKEN` の固定トークン経路は両端から完全に削除する. クライアント側は Web / Android で同じ `LoginView` を共有し, token は `auth-storage` 抽象 (Web: `localStorage`, Android: Capacitor `Preferences`) に格納する. main.tsx 起動時は token 有無で `LoginView` / 本体を分岐し, 401 応答は HTTP 層の interceptor で捕捉して token を破棄 → `LoginView` に戻す. Android 初回起動は SetupView (URL + `/healthz` 検証のみ) → LoginView の 2 ステップに整える.

## 影響範囲

| 領域 | 変更内容 |
| --- | --- |
| API | `POST /api/v1/login` 新規 (認証不要) / `POST /api/v1/logout` 新規 (要 Bearer) / 既存 `/api/v1/*` の authMiddleware を sessions lookup に差し替え |
| DB | `sessions` テーブル新規 (`token PK`, `expires_at`, `created_at`) + マイグレーション 1 本追加 + Drizzle schema に `sessions` 追加 |
| サーバモジュール | `data/session-repository.ts` (interface) + `infra/persistence/drizzle/session-repository.ts` (実装) 新規. `main.ts` で `APP_PASSWORD_HASH` を必須 env として読み, `AUTH_TOKEN` の読取・必須チェックを削除. `app.ts` の `AppDeps.authToken` を撤廃し `passwordHash` + `sessionRepository` を追加 |
| Web モジュール | `web/src/auth/auth-storage.ts` 新規 (interface + Web / Capacitor 実装の dynamic import). `web/src/auth/login-client.ts` 新規 (login / logout fetch). `web/src/ui/login-view/` 新規. 既存 HTTP repository 群 (`task-repository.ts` 等 5 本) のコンストラクタ引数から `authToken` 直接渡しを廃止し, `auth-storage` から都度読む形に変更 + 401 検出 interceptor を共通化 |
| Web 起動分岐 | `main.tsx` から `VITE_AUTH_TOKEN` 参照と `Preferences.get({ key: "authToken" })` を削除. token 有無で `LoginView` を表示する分岐を追加 |
| UI | `LoginView` 新規 / `SetupView` は URL + `/healthz` 検証のみに簡素化 (token 入力削除) / `SettingsView` に「ログアウト」ボタン追加 |
| Service Worker | `web/vite.config.ts` の `VitePWA` injectManifest 設定で `/api/*` を pre-cache 対象外にする (`navigateFallbackDenylist` または `globPatternsIgnore` 相当の方法). `web/src/sw/service-worker.ts` の runtime caching ルートからも `/api/*` を除外 |
| テスト | `server/__tests__/integration/*` (47 ファイル超) の Bearer ヘッダを `loginForTest()` ヘルパ経由に書き換え. `__tests__/release/prod-startup.test.ts` に `APP_PASSWORD_HASH` を env で渡し /login → API 呼び出しを検証する形に拡張. `web/` に LoginView 単体テスト + auth-storage 単体テスト追加 |
| env / docs | ルート `.env.example` から `AUTH_TOKEN` / `VITE_AUTH_TOKEN` を削除し `APP_PASSWORD_HASH` を追加. `docs/user/deploy-guide.md` §3 / `docs/developer/setup/server.md` / `quick-start.md` を更新 |

## 設計詳細

### データモデル

- `sessions` テーブル (SQLite, Drizzle):
  - `token` `TEXT PRIMARY KEY NOT NULL` — `crypto.randomBytes(32).toString("hex")` の 64 文字 16 進文字列.
  - `expires_at` `INTEGER NOT NULL` — Unix epoch ms. 発行時刻 + 30 日.
  - `created_at` `INTEGER NOT NULL` — Unix epoch ms.
  - インデックスは PK だけで十分 (lookup は token 等値で済む). expires_at の自動掃除はスコープ外 (将来 BL).
- `SessionRepository` (data 層 interface):
  - `create({ token, expiresAt, createdAt })` — INSERT.
  - `findValidByToken(token, now)` — `SELECT WHERE token = ? AND expires_at > ?` の単一行取得.
  - `deleteByToken(token)` — DELETE.

### 処理フロー

- ログイン (`POST /api/v1/login`):
  1. authMiddleware は path が `/api/v1/login` の場合に素通しする (login 時には token を持っていない).
  2. body を zod 風の素直な検証で `{ password: string }` に絞る. 不正なら 400.
  3. `bcrypt.compare(password, deps.passwordHash)` を await. 不一致なら 401 `{ code: "INVALID_PASSWORD" }`.
  4. `crypto.randomBytes(32).toString("hex")` で token 生成. `expiresAt = clock.now() + 30 * 24 * 60 * 60 * 1000`.
  5. `sessionRepository.create({ token, expiresAt, createdAt: clock.now() })`.
  6. 200 OK `{ token, expiresAt }` を返す.
- ログアウト (`POST /api/v1/logout`):
  1. authMiddleware を通過させる (= 有効な session でなければそもそも到達しない). 二重保険として該当行が無くても 204 で no-op.
  2. `sessionRepository.deleteByToken(token)` を await.
  3. 204 No Content を返す.
- 一般 API の authMiddleware:
  1. path が `/api/v1/login` または `/healthz` なら素通し.
  2. `Authorization: Bearer <token>` を取り出し. 欠落 / 形式不正は 401 `UNAUTHORIZED`.
  3. `sessionRepository.findValidByToken(token, clock.now())` で行が取れなければ 401 (期限切れも同様).
  4. 通過. `c.set("sessionToken", token)` を積み, /logout ハンドラから参照できるようにする.
- Web 起動:
  1. `auth-storage.getToken()` を await. `null` なら `LoginView` を表示し他ルートには遷移させない (`Navigate to="/login" replace`).
  2. token があれば本体を起動. 通常通り Repository が API を叩く.
- 401 interceptor:
  - `auth-storage` で token を破棄し, グローバル state (`useAuthToken` Context) を `null` にして `LoginView` に遷移する.
- Android 初回起動 (SetupView):
  1. ユーザがサーバ URL を入力 → `fetch(url + "/healthz")` を実行.
  2. 200 が返れば URL を Preferences に保存し, `LoginView` に遷移.
  3. 失敗 (タイムアウト / 4xx / 5xx / ネットワークエラー) はエラーメッセージを表示.

### 例外 / エラー処理

- 不正パスワード: サーバが 401 `{ code: "INVALID_PASSWORD", message: "..." }` を返す. LoginView は body の code に依らず固定文言「パスワードが正しくありません」を表示する.
- ネットワークエラー / タイムアウト: LoginView は「サーバに接続できません」を表示し再試行可能にする.
- token 期限切れ: 一般 API が 401 → fetch interceptor が token を破棄し LoginView に戻す. ログアウト操作と同じ後始末で統一する.
- bcrypt.compare の throw: ハッシュ形式不正は 500. APP_PASSWORD_HASH が空 / 不正のときは `main.ts` 起動時に validate して即 process.exit(1).

## 重要な決定

### アーキテクチャ決定

- **D-1 (sessions スキーマ): token を `TEXT PRIMARY KEY`, expires_at / created_at を `INTEGER` (Unix epoch ms) で保持する.** 既存の `created_at` 等が ISO 文字列のテーブル (tasks 等) と方針が異なるが, 期限判定は数値比較で済む方が単純で, sessions は表示用ではないため可読性は不要. clock 抽象 (`deps.clock.now()`) と数値比較が直結する.
- **D-2 (token 生成): `crypto.randomBytes(32).toString("hex")` を採用.** 64 文字 16 進文字列. base64url との選択肢があるが, ヘッダ値として `Bearer <token>` で乗せた際に `/` `+` `=` の URL 安全性問題を起こさない hex を選ぶ. 32 byte = 256 bit のエントロピーで衝突は実用上発生しない.
- **D-3 (bcrypt cost factor): cost = 12 を採用.** 一般的なサーバ性能で 200-300ms 程度. login が 1 ユーザ × 30 日に 1 度の頻度なので体感に影響しない. 平文の env を残さない方針 (NFR) と整合.
- **D-4 (パスワードハッシュは env 経由のみ): `APP_PASSWORD_HASH` 環境変数で受け取り `main.ts` で起動時に validate. DB には保存しない.** マルチユーザではないためユーザ管理テーブルは不要 (CORE-2 維持). ハッシュをローテーションするときは env を書き換えて再起動するだけで済む.
- **D-5 (opaque token + sessions テーブル): JWT は不採用.** 単一インスタンス・単一ユーザ運用ではステートレス性が活きず, 即時 revoke (= ログアウト) の自然な実装手段として DB 行削除が最も単純. 既存 Drizzle + better-sqlite3 を流用するため新規依存はゼロ.
- **D-6 (有効期限 30 日): `expires_at = clock.now() + 30 * 24 * 60 * 60 * 1000`.** リフレッシュトークンは持たない. 期限境界は `expires_at > clock.now()` の strict > で判定し, 同一 ms ぴったりの境界は「期限切れ」として扱う.
- **D-7 (AUTH_TOKEN 完全廃止): 既存の `AUTH_TOKEN` env / `VITE_AUTH_TOKEN` env / authMiddleware の固定トークン比較 / `AppDeps.authToken` / Web Repository の `authToken` 引数 / SetupView の token 入力欄をすべて削除する.** 並存運用は仕様で明示的に否定 (spec.md 非ゴール). 旧クライアント (固定 token Bearer) は新サーバで一律 401 になる (受け入れ基準 7).
- **D-8 (LoginView 共通化): `web/src/ui/login-view/` を 1 か所だけ作り Web / Android で共有する.** 既に同じ Web bundle が両プラットフォームで動くため, 分岐は token 保存先 (D-9) だけで済む.
- **D-9 (auth-storage 抽象): `getToken()` / `setToken(token)` / `clearToken()` の 3 メソッドを持つ interface を `web/src/auth/auth-storage.ts` に置く.** Web 実装は `localStorage` の `todica.auth.token` キーに保存. Android 実装は `@capacitor/preferences` の `authToken` キーに保存. 起動時 `Capacitor.isNativePlatform()` で実装を選ぶ (既存 main.tsx の構造をそのまま流用).
- **D-10 (SetupView 2 ステップ簡素化): SetupView から `authToken` 入力欄と `onSave` の token 引数を削除し, URL + `/healthz` 接続検証のみに絞る.** 検証成功で URL を保存し `LoginView` へ遷移. ローカルモード選択 (BL-020 / `onSelectLocal`) は据え置き.
- **D-11 (SettingsView ログアウトボタン): SettingsView の最下部に「ログアウト」ボタンを追加し, 押下で `POST /api/v1/logout` を呼んでから `auth-storage.clearToken()` + `LoginView` 遷移.** Confirm dialog は出さない (低リスク操作).
- **D-12 (Service Worker `/api/*` 除外): `web/vite.config.ts` の `VitePWA` injectManifest に `workbox.navigateFallbackDenylist: [/^\/api\//]` を加え, `web/src/sw/service-worker.ts` の runtime caching ルートからも `/api/*` を一切扱わないようにする.** 401 応答や認証関連の API 応答が SW にキャッシュされる事故を防ぐ.
- **D-13 (fetch interceptor の挿入位置): 共通 fetch ラッパ `web/src/auth/authed-fetch.ts` を新設し, 全 HTTP Repository (`HttpTaskRepository` 等 5 本) がこれを経由する.** 401 を捕捉した時点で `auth-storage.clearToken()` + イベント発火 (`window.dispatchEvent(new Event("todica:auth-expired"))`) を行い, `main.tsx` の上位 listener が `<Navigate to="/login" replace />` を起こす. Repository 個別の 401 ハンドラを増やさない.
- **D-14 (login ハンドラの型と検証): body は `{ password: string }`.** 受信時に `typeof password !== "string"` または `password.length === 0` で 400. zod 等の追加依存は入れず, 既存ハンドラと同じ素直な if 検証で済ませる.
- **D-15 (login 経路は CORS / 認証より前): CORS middleware は既に `app.use("*", cors(...))` で全パスに適用済み. authMiddleware を `path === "/api/v1/login" || path === "/healthz"` で素通しする条件分岐に拡張する.** `/api/v1/login` を `app.use("*", authMiddleware)` より前に `app.post(...)` で先に登録する方法もあるが, Hono の middleware 評価順は path に関係なく先勝ちのため, スキップ判定で統一する方が読みやすい.
- **D-16 (Idempotency-Key の扱い): /api/v1/login / /api/v1/logout は Idempotency-Key の対象外にする.** idempotencyMiddleware の早期 return ガードに `path === "/api/v1/login" || path === "/api/v1/logout"` を追加. login は本質的に「password → token」の冪等ではない遷移 (毎回新 token を発行する) のため.
- **D-17 (loginForTest ヘルパ): `server/__tests__/helpers/login.ts` に `loginForTest(app, password)` を 1 つ用意し token を返す.** integration テストの beforeEach で token を取得して各 fetch の Bearer に乗せる. 47 ファイル超の修正をヘルパ 1 点突破で抑える.
- **D-18 (テスト時パスワード固定): テストでは平文 `"test-password"` を `bcrypt.hashSync("test-password", 4)` でハッシュ化したものを `APP_PASSWORD_HASH` 同等の値として `createApp` 経由で渡す.** cost factor 4 を採用してテスト所要時間を最小化 (本番の 12 と独立).
- **D-19 (LoginView a11y): `<input type="password">` に対し `<label>パスワード</label>` を明示し, エラー時は `role="alert"` + `aria-live="assertive"` で読み上げる.** `aria-invalid` と `aria-describedby` でエラーメッセージと入力欄を紐付ける. submit ボタンに `aria-busy` を付与し送信中の二重押下を抑止.

ADR を切るほどの巨大判断は無いと判断 (既存 ADR-0007 / ADR-0010 で SQLite + Bearer の基本方針が既に置かれている). 本 BL は方針の deepen に留まる.

## 段階分割

各 Step は単独でコミット可能な粒度. 上流の Step に依存する Step は明記する.

| Step | 内容 | 依存 |
| --- | --- | --- |
| Step 1 | サーバ: `sessions` テーブルのマイグレーション SQL 追加 / Drizzle schema に `sessions` 追加 / `SessionRepository` interface + Drizzle 実装. 単体テスト (insert / lookup / delete / 期限境界) を先に書いて green 化. | なし |
| Step 2 | サーバ: `POST /api/v1/login` / `POST /api/v1/logout` ハンドラ追加 / authMiddleware を sessions lookup に切替え / Idempotency middleware の除外パス追加 / `AppDeps.authToken` 撤去・`passwordHash` + `sessionRepository` 追加 / `main.ts` で `AUTH_TOKEN` 読取・必須チェック削除 + `APP_PASSWORD_HASH` 必須化. integration テスト (login 200 / 401 / logout 204 / 期限切れ 401 / 旧固定 token 401) を先に書いて green 化. | Step 1 |
| Step 3 | Web: `auth/auth-storage.ts` + `auth/authed-fetch.ts` + `auth/login-client.ts` 新規 / 既存 HTTP Repository 5 本 (`task-repository.ts` 等) のコンストラクタから `authToken` 引数を撤去し `authed-fetch` 経由に変更. 単体テスト (auth-storage で localStorage / Preferences の保存・取得・破棄). | Step 2 |
| Step 4 | Web: `LoginView` 新規 / `main.tsx` の起動分岐に token 有無 → LoginView / 本体 を追加 / 401 interceptor のイベント listener を main.tsx に配線 / `VITE_AUTH_TOKEN` env 参照を完全削除. LoginView 単体テスト (正しいパスワード → /login → token 保存 → /today 遷移 / 不正パスワード → エラーメッセージ表示 / loading 中の aria-busy). | Step 3 |
| Step 5 | Web: SetupView を URL + `/healthz` 検証のみに簡素化 (token 入力欄削除) / SettingsView に「ログアウト」ボタン追加. SetupView 既存テストの token 関連を URL 単独に書き換え, SettingsView テストに「ログアウトで /logout 呼出 → token 破棄 → LoginView 遷移」を追加. | Step 4 |
| Step 6 | Service Worker: `web/vite.config.ts` の `VitePWA` 設定で `/api/*` を navigateFallbackDenylist に追加 / `web/src/sw/service-worker.ts` の runtime caching ルートから `/api/*` を除外. 既存 PWA E2E (`e2e/pwa-prod.spec.ts`) が green を維持することを確認しつつ, 「/api/login の応答が SW にキャッシュされない」回帰テストを 1 件追加. | Step 5 |
| Step 7 | env / docs: ルート `.env.example` から `AUTH_TOKEN` / `VITE_AUTH_TOKEN` を削除 / `APP_PASSWORD_HASH` 追加 / `docs/user/deploy-guide.md` §3 / `docs/developer/setup/server.md` / `quick-start.md` / `docs/developer/quality/test-catalog.md` を更新. ハッシュ生成手順 (`node -e "console.log(require('bcrypt').hashSync('your-password', 12))"`) を deploy-guide.md に追記. | Step 2 |
| Step 8 | テスト一括更新: `server/__tests__/integration/*` の Bearer ヘッダを `loginForTest()` ヘルパ経由に書き換え (47 ファイル超). `__tests__/release/prod-startup.test.ts` を `APP_PASSWORD_HASH` 渡し + login → API 呼び出し検証に拡張. E2E (Playwright) の login シナリオを 1 件追加. | Step 4 + Step 6 |

## 変更ファイルと影響範囲

| ファイル | 種別 | 内容 |
| --- | --- | --- |
| `server/drizzle/0010_sessions.sql` (想定) | 新規 | `CREATE TABLE sessions (token TEXT PRIMARY KEY NOT NULL, expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL);` |
| `server/drizzle/meta/_journal.json` | 修正 | 新マイグレーションの登録 |
| `server/src/db/schema.ts` | 修正 | `sessions` テーブル定義追加 / `schema` export に追加 |
| `server/src/data/session-repository.ts` | 新規 | `SessionRepository` interface |
| `server/src/infra/persistence/drizzle/session-repository.ts` | 新規 | `DrizzleSessionRepository` 実装 |
| `server/src/app.ts` | 修正 | authMiddleware を sessions lookup に差替え / `/login` `/logout` ハンドラ追加 / `AppDeps.authToken` 削除, `passwordHash` + `sessionRepository` 追加 / idempotencyMiddleware に `/login` `/logout` の除外を追加 |
| `server/src/main.ts` | 修正 | `AUTH_TOKEN` 読取と必須チェック削除 / `APP_PASSWORD_HASH` 必須化 / `DrizzleSessionRepository` インスタンス化 / `createApp` の引数差替え |
| `server/__tests__/helpers/login.ts` (想定) | 新規 | `loginForTest(app, password)` ヘルパ |
| `server/__tests__/integration/*.test.ts` (47 ファイル超) | 修正 | beforeEach で `loginForTest` を呼んで token を取得し各 fetch の Bearer に使う |
| `server/__tests__/integration/login.test.ts` (想定) | 新規 | login / logout / 期限切れ / 旧固定 token 拒否の integration |
| `__tests__/release/prod-startup.test.ts` | 修正 | env を `APP_PASSWORD_HASH` に切り替え / login → 認証付き /healthz および /api/v1/today 検証を追加 |
| `web/src/auth/auth-storage.ts` | 新規 | interface + Web / Capacitor 2 実装 |
| `web/src/auth/authed-fetch.ts` | 新規 | 401 を捕捉する共通 fetch ラッパ |
| `web/src/auth/login-client.ts` | 新規 | `login(password)` / `logout()` の fetch 呼出 |
| `web/src/ui/login-view/login-view.tsx` | 新規 | LoginView 本体 |
| `web/src/ui/login-view/login-view.test.tsx` | 新規 | LoginView 単体テスト |
| `web/src/repositories/*.ts` (5 本) | 修正 | コンストラクタの `authToken` 引数を削除し `authed-fetch` を使う |
| `web/src/main.tsx` | 修正 | `VITE_AUTH_TOKEN` 参照削除 / token 有無 → LoginView 分岐 / 401 listener |
| `web/src/ui/setup-view/setup-view.tsx` | 修正 | token 入力欄削除 / URL + `/healthz` 検証のみ / `onSave(url)` に署名変更 |
| `web/src/ui/setup-view/setup-view.test.tsx` | 修正 | 上記に追随 |
| `web/src/ui/settings-view/settings-view.tsx` | 修正 | 「ログアウト」ボタン追加 / handler 配線 |
| `web/src/ui/settings-view/settings-view.test.tsx` | 修正 | ログアウト操作のテスト追加 |
| `web/vite.config.ts` | 修正 | `VitePWA` の `workbox.navigateFallbackDenylist` に `/^\/api\//` 追加 |
| `web/src/sw/service-worker.ts` | 修正 | runtime caching ルートから `/api/*` を除外 |
| `e2e/login.spec.ts` (想定) | 新規 | login → /today → logout → LoginView の E2E |
| `.env.example` | 修正 | `AUTH_TOKEN` / `VITE_AUTH_TOKEN` 削除, `APP_PASSWORD_HASH` 追加 |
| `docs/user/deploy-guide.md` | 修正 | §3 env 表更新 + bcrypt ハッシュ生成手順追記 |
| `docs/developer/setup/server.md` | 修正 | env 表 / 起動手順を更新 |
| `docs/developer/setup/quick-start.md` | 修正 | env 表 / 動作確認手順を更新 |
| `docs/developer/quality/test-catalog.md` | 修正 | login / logout / 401 interceptor の項目追加 |
| `package.json` (server / root) | 修正 | `bcrypt` + `@types/bcrypt` を server の dependencies / devDependencies に追加 |

## 既存資産で再利用するもの

spec.md §「既存資産で再利用するもの」を引き継ぎつつ, plan で新たに気付いた流用候補を追加.

- 既存 authMiddleware (`server/src/app.ts:120`) の枠組み (Authorization ヘッダ取得 / `Bearer <token>` 正規表現 / 401 応答形). 内部の固定値比較だけを sessions lookup に差し替える.
- 既存 Drizzle schema 配線 (`server/src/db/schema.ts`) と migrate 経路 (`server/src/main.ts` の `migrate(db, { migrationsFolder })`). sessions も同じ仕組みに乗せる.
- 既存 Repository パターン (`task-repository.ts` 等). SessionRepository は同じ data interface + drizzle 実装の二層構造で書く.
- 既存 SystemClock / FakeClock 抽象 (`@todica/domain/clock`). expires_at の判定と `loginForTest()` のテスト時刻制御に使う.
- 既存 HTTP Repository (`web/src/repositories/*.ts`) の構造. `fetch` 呼出箇所を `authed-fetch` に差し替えるだけで済むよう, ベース URL とパス構築ロジックには触らない.
- 既存 SetupView の `onSave` 配線 (`web/src/main.tsx`) と Preferences 保存パターン. token 削除分は素直に減らすだけで, URL 保存経路はそのまま流用.
- 既存 OfflineBanner / ErrorNotification のグローバル listener パターン (`web/src/main.tsx` で `<ErrorNotification />` を最上位にマウント). 401 → LoginView 遷移も同じ層で扱う.
- 既存 ConflictError / OptimisticLockError の throwing パターン (`web/src/repositories/*.ts`). 401 用に `UnauthorizedError` を追加し, `authed-fetch` から throw する形で揃える.

## スコープ境界

### 触らないファイル / 概念

- `docs/developer/project.md` (CLAUDE.md の規定で原則禁止).
- 既存ドメインモジュール (`domain/` の Task / Project / Routine / Settings / Counter / Focus). 認証はインフラ関心であり, ドメインには触れない.
- Idempotency-Key の取り扱い (login / logout を除外パスに追加するのみ).
- If-Match の楽観ロック. sessions はバージョン管理しない (即時 revoke が運用)
- Android local mode (BL-020 / `mode === "local"` 経路). ローカルモードは認証不要であり, 本 BL の token 経路を通らない (main.tsx の既存分岐をそのまま残す).
- Tasks / Projects / Routines / Trash / Settings / Today の各 view のロジック. 401 は共通 interceptor で処理するため view 個別の修正は不要.
- パスワード変更 UI / リカバリフロー / 2FA / rate limit / session 自動掃除 / 多端末同時セッション管理 (spec で非ゴール).

### 触らない概念

- マルチユーザ / 役割 / 共有 (project.md §3 CORE-2).
- JWT / リフレッシュトークン / SSO / OAuth (spec の非ゴール).

## 非機能 / アクセシビリティ

- LoginView 入力要件:
  - `<label htmlFor="login-password">パスワード</label>` を可視配置. visually-hidden ではなく明示ラベルを使う (1 画面 1 入力で十分余裕がある).
  - `<input id="login-password" type="password" autocomplete="current-password" required>` で password manager / OS 自動入力に対応.
  - submit ボタンは `<button type="submit" className="button button--primary">ログイン</button>` で既存 `.button` クラス (BL-067) を再利用.
- エラーメッセージの読み上げ:
  - エラー表示要素に `role="alert" aria-live="assertive"` を付与し, 不正パスワード / ネットワークエラーの両方を即時読み上げ.
  - `aria-invalid` を `<input>` に付与し, `aria-describedby` でメッセージ要素と紐付ける.
- focus 管理:
  - 初回マウント時に password input に autofocus.
  - 失敗後はフォーカスを password input に戻す.
- 既存 NFR の維持:
  - `box-shadow` / `text-shadow` 追加禁止 (NFR-NO-SHADOW).
  - `:hover` / `transition` / `animation` 追加禁止 (NFR-NO-HOVER-TRANSITION). LoginView のスタイルは既存 `.button` / 既存トークンの組合せだけで成立させる.
- セキュリティ:
  - パスワード平文は env に置かない. ハッシュのみ.
  - token は `localStorage` (Web) に置く. spec で明示された非ゴール (XSS 対策の追加は将来 BL) として据え置き.
  - サーバ側の bcrypt 比較は `bcrypt.compare` を使い, タイミング攻撃に対しては bcrypt 標準の constant-time 比較に依存.

## テスト方針

> 全体方針は [`../../quality/test-catalog.md`](../../quality/test-catalog.md).

- サーバ単体: `DrizzleSessionRepository` の insert / findValidByToken (期限境界含む) / deleteByToken.
- サーバ integration:
  - `POST /api/v1/login` が正しいパスワードで 200 + token を返す.
  - `POST /api/v1/login` が誤ったパスワードで 401.
  - `POST /api/v1/logout` が token を sessions から削除し 204 を返す.
  - 一般 API が有効 token で 200, 期限切れ token で 401, 旧固定 AUTH_TOKEN で 401 (受け入れ基準 7).
  - login / logout が Idempotency-Key 必須ガードの対象外であること.
- サーバ release: `__tests__/release/prod-startup.test.ts` が `APP_PASSWORD_HASH` 渡しで起動 → login → /healthz と /api/v1/today を Bearer で叩いて 200 を確認.
- Web 単体:
  - `auth-storage` の Web 実装が localStorage に保存・取得・破棄できる.
  - LoginView がパスワード送信で `/api/v1/login` を呼び, 成功時に token を `auth-storage` 経由で保存し /today に遷移する.
  - LoginView が 401 時にエラーメッセージ「パスワードが正しくありません」を `role="alert"` で表示する.
  - SetupView が URL + `/healthz` 検証のみで保存し, token 入力欄が存在しないこと.
  - SettingsView の「ログアウト」ボタンが `/api/v1/logout` を呼び, token を破棄して LoginView に戻す.
  - `authed-fetch` が 401 応答時に `auth-storage.clearToken()` を呼び `todica:auth-expired` イベントを発火する.
- E2E:
  - login → /today に遷移 → logout → LoginView の往復.
  - 期限切れ token → /api/* で 401 → LoginView 自動遷移.

## 未決事項 / リスク / 代替案

### 未決事項

なし. spec で全件解消済み. 実装段で発生した判断点は本 plan の D-x に追記する.

### リスク

- migration の DB 後方互換: 既存稼働 DB に sessions テーブルが無いケースは migrate で自動追加されるため問題なし. AUTH_TOKEN 経路を削除するため, 既存 Web bundle (旧版) を持つユーザはサーバ更新後に LoginView が出るまで一度 401 を経験する (許容範囲. release notes に明記).
- bcrypt の native binding ビルド失敗リスク: `bcrypt` パッケージは prebuilt binary を持つため通常は問題ないが, 環境によっては `node-gyp` を要求する. 代替として pure-JS の `bcryptjs` がある (実装互換). 本 plan では `bcrypt` を一次採用し, CI / VPS で binding が確保できない場合のみ `bcryptjs` に差し替える方針.
- localStorage の XSS リスクは spec で明示的に「対策追加は将来 BL」としているため本 BL では受容.

### 代替案

- **localStorage ではなく Cookie に token を入れる**: HttpOnly Cookie で XSS リスクを下げられるが, Capacitor (Android WebView) との互換と CORS 設定の複雑化を考えると現時点で利益が小さい. 採用せず.
- **token rotation (login 毎に古い token を全部消す)**: 多端末同時利用を spec で禁止していないため不採用. 1 端末で複数 session を持てる現状を維持.
