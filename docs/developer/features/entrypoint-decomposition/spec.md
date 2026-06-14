# 仕様: entrypoint-decomposition

- 状態: ドラフト
- 関連: [`../../planning/backlog.md`](../../planning/backlog.md) の BL-085

## 背景 / 課題

クライアント起動エントリ `web/src/main.tsx` (555 行) と Hono アプリ本体 `server/src/app.ts` (1337 行) が肥大化しており, [`docs/developer/architecture/module-boundaries.md`](../../architecture/module-boundaries.md) が定める「API レイヤは薄く保ち, アプリケーション層 / ドメイン層に責務を寄せる」「クライアントは起動配線とビュー定義を分離する」方針と乖離している.

具体的な乖離点は次のとおり.

- `server/src/app.ts` の `createApp` が CORS / 認証 / Idempotency といったミドルウェア配線, リソース別の 30 個超のハンドラ (`/api/v1/tasks`, `/api/v1/today`, `/api/v1/focus`, `/api/v1/counter`, `/api/v1/settings`, `/api/v1/routines`, `/api/v1/projects`, `/api/v1/trash`, `/api/v1/reset`, `/api/v1/auth-state` / `/api/v1/login` / `/api/v1/password` / `/api/v1/logout`, テスト時計用エンドポイント) を 1 ファイルに同居させており, リソースを跨いだ修正の影響範囲が読みにくい.
- `web/src/main.tsx` が次の 3 つの責務を 1 ファイルに同居させている.
  1. `init()` での起動分岐 (Capacitor Native ローカルモード / Native サーバモード / Web サーバモード) と Repository 群の構築.
  2. `App` コンポーネント内での `AuthState` 取得, `LoginView` / `InitialSetupView` / `SetupViewWithNav` への分岐.
  3. React Router のルート定義 (`/setup`, `/today`, `/tomorrow`, `/focus`, `/settings`, `/trash`, `/projects`, `/routines`) と `AppShell` への配置.

この状態のままだと, ハンドラ追加・ビュー追加・起動分岐変更のいずれにおいても巨大ファイルの中央を編集することになり, 衝突しやすく, 各責務の境界も曖昧なままになる.

## ゴール / 非ゴール

- ゴール:
  - `server/src/app.ts` を, リソース別の router モジュール群に分割し, `createApp` の責務を「ミドルウェア配線 + 各 router の `app.route()` マウント」のみに縮退させる.
  - `web/src/main.tsx` を, (1) 起動分岐 + Repository 構築, (2) `App` 本体 (認証状態と分岐), (3) ルート定義の 3 領域に分割し, `main.tsx` 自体はエントリ (`createRoot().render(...)`) のみに縮退させる.
  - 各ファイルを 400 行以下に収める (BL-085 完了目安).
  - 既存テスト (`npm test`), 型 (`npm run typecheck`), Lint (`npm run lint`) を grebreaking 無く維持する.
- 非ゴール:
  - 既存 API 仕様 (リクエスト / レスポンスのスキーマ, ステータスコード, エラーコード) の変更.
  - ドメイン層 (`server/src/domain/`) および Repository 層 (`server/src/repositories/`, `web/src/repositories/`) の変更.
  - 新規ハンドラ・新規ビュー・新規モードの追加.
  - 認証ロジック・Idempotency ロジック・CORS ポリシーの仕様変更.
  - 動作仕様レベルの挙動変更 (起動順序・分岐条件・ルート パス).

## 要件

- 機能要件:
  - FR-1: `server/src/app.ts` の各リソース別ハンドラ群を, リソース単位の router モジュールに移動する. 1 リソース = 1 ファイル. 対象は `tasks` / `today` / `focus` / `counter` / `settings` / `routines` / `projects` / `trash` / `reset` / `auth` の 10 個 (auth は `login` / `logout` / `password` / `auth-state` をまとめる).
  - FR-2: `createApp` は次の責務のみを持つ.
    - CORS / 認証 / Idempotency / 共通ヘルパ (`errorJson`, `saveAndReturn`, `clearFocusIfMatches` 等) の配線.
    - `/healthz` のマウント.
    - 各 router モジュールの `app.route("/api/v1/...", xxxRouter(deps))` マウント.
    - テスト時計用エンドポイント群の条件付きマウント (`deps.testClock` 経由).
  - FR-3: `web/src/main.tsx` のうち `init()` で行っている起動分岐 (Native ローカル / Native サーバ / Web サーバ) と Repository 構築ロジックを `bootstrap.ts` (仮称) に切り出す.
  - FR-4: `App` コンポーネント本体 (認証状態の取得, `LoginView` / `InitialSetupView` / `SetupViewWithNav` への分岐, モード切替ハンドラ, `handleLogin` / `handleLogout` / `handleChangePassword` 等) を `app.tsx` (仮称) に切り出す.
  - FR-5: React Router の `<Routes>` 定義を `routes.tsx` (仮称) に切り出す.
  - FR-6: `main.tsx` 本体は `createRoot().render(<StrictMode><QueryClientProvider><BrowserRouter><App /></BrowserRouter></QueryClientProvider></StrictMode>)` 相当の最小エントリのみを残す.
- 非機能要件:
  - NFR-1 (互換性): 既存テスト (`npm test`) は無改修で全件 green を維持する. 既存テストはハンドラの公開 URL とレスポンスを通じてのみ振る舞いを観察しているため, 分割は内部実装の変更として扱う.
  - NFR-2 (型安全): `npm run typecheck` が 0 件で通る. `any` の新規追加を許可しない.
  - NFR-3 (Lint): `npm run lint` が 0 件で通る.
  - NFR-4 (規模上限): 分割後の単一ファイルは 400 行以下 (空行・コメント含む).
  - NFR-5 (公開シンボル): `createApp` / `AppDeps` / `App` / `AppProps` / `AppConfig` / `buildHttpRepos` の公開シグネチャを維持する. これらは他テストおよびエントリポイント (`server/src/main.ts` 等) から利用されているため.

## 受け入れ基準

> 書き方は [`../../quality/acceptance-criteria.md`](../../quality/acceptance-criteria.md) に従う.

```
シナリオ: 既存テストが分割後も green を維持する
  Given BL-085 の分割が完了している
  When  リポジトリルートで `npx vitest run` を実行する
  Then  全テストが green で終了する
  And   `npm run typecheck` が 0 件で終了する
  And   `npm run lint` が 0 件で終了する
```

```
シナリオ: 分割後の各ファイルが 400 行以下である
  Given BL-085 の分割が完了している
  When  `server/src/routers/` 配下と `web/src/` の新規ファイル, および分割後の `server/src/app.ts` / `web/src/main.tsx` 各ファイルの行数を `wc -l` で計測する
  Then  いずれも 400 行以下である
```

```
シナリオ: createApp がルータ配線のみに縮退している
  Given BL-085 の分割が完了している
  When  `server/src/app.ts` の `createApp` 本体を読む
  Then  HTTP メソッド付きの直接ハンドラ呼び出し (`app.get("/api/v1/...")` / `app.post(...)` / `app.put(...)` / `app.patch(...)` / `app.delete(...)`) は含まれない
  And   `/healthz` と, `deps.testClock` ブロック内のテスト時計用エンドポイントだけが例外として `createApp` 内に直接記述されることを許す
  And   それ以外の各 `/api/v1/...` リソースは `app.route("/api/v1/<resource>", <resource>Router(deps))` 形式でマウントされている
```

```
シナリオ: main.tsx がエントリのみに縮退している
  Given BL-085 の分割が完了している
  When  `web/src/main.tsx` を読む
  Then  ファイル内に React コンポーネント定義 (`function App` / `function SetupViewWithNav` 等) は含まれない
  And   `Routes` / `Route` JSX も含まれない
  And   `init()` または同等の起動関数を呼び `createRoot().render(...)` を実行する記述のみが残っている
```

```
シナリオ: 既存 API が変わっていない
  Given BL-085 の分割が完了している
  When  サーバを起動して `/api/v1/tasks`, `/api/v1/today`, `/api/v1/focus`, `/api/v1/counter`, `/api/v1/settings`, `/api/v1/routines`, `/api/v1/projects`, `/api/v1/trash`, `/api/v1/reset`, `/api/v1/auth-state`, `/api/v1/login`, `/api/v1/password`, `/api/v1/logout` の各ハンドラを呼ぶ
  Then  分割前と同じ HTTP ステータス・レスポンスボディ・ヘッダ (ETag / Idempotency 関連を含む) が返る
  And   既存の HTTP 統合テスト群がこれを担保している
```

```
シナリオ: 起動分岐とルート定義が変わっていない
  Given BL-085 の分割が完了している
  When  Web 環境および Capacitor Native 環境で起動する
  Then  Capacitor Native でローカルモード保存時はローカル Repository が組まれる
  And   Capacitor Native でサーバモード保存時はサーバ URL を元に HTTP Repository が組まれる
  And   ブラウザ環境では `VITE_API_BASE_URL` を元に HTTP Repository が組まれる
  And   分割前と同じパス (`/setup` / `/today` / `/tomorrow` / `/focus` / `/settings` / `/trash` / `/projects` / `/routines`) でビューに到達できる
```

## 未決事項 / 確認待ち

以下の判断ポイントは, 第一候補で `plan.md` を起こした上で実装フェーズ前にユーザー確認を取る.

- 未決-1 (server 分割粒度): 第一候補は **リソース単位 10 ファイル** (`tasks` / `today` / `focus` / `counter` / `settings` / `routines` / `projects` / `trash` / `reset` / `auth`). 認証系を更に細分化する (`login` / `logout` / `password` / `auth-state` を別ファイル) と機能境界は明確になるが, `auth-state` と `login` の共通ヘルパ (パスワード未設定時の素通し条件など) を再配置するコストが発生する. ハンドラ単位 (30+ ファイル) は逆に分散しすぎて読みにくい. 第一候補を採用する場合, `auth.ts` 内で `login` / `logout` / `password` / `auth-state` のセクションコメントで論理境界を明示する.
- 未決-2 (web 分割粒度): 第一候補は **3 ファイル** (`bootstrap.ts` / `app.tsx` / `routes.tsx`) + 最小エントリ `main.tsx`. Native↔Web の repo factory を更に切り出す (`repo-factory.ts`) かは, `bootstrap.ts` の行数が NFR-4 (400 行) に収まるかを実装フェーズで判断して決める. 現状 `init()` 内のローカル Repository 動的 import が大きく, 400 行近くなる可能性がある. その場合は `repo-factory.ts` を追加で切り出す.
- 未決-3 (router モジュールの引数渡し): 第一候補は **`xxxRouter(deps: AppDeps): Hono` を export し, `createApp` 側で `app.route("/api/v1/tasks", tasksRouter(deps))` でマウント** する方式. これは Hono の標準的なルータモジュール分割パターンで, ハンドラ側は `deps` をクロージャ越しに参照する. 代替として deps を引数ではなく `c.get("deps")` 経由でアクセスする方式もあるが, 型の取り回しが煩雑になるため非採用とする.
- 未決-4 (テスト追加要否): 分割は振る舞い不変のリファクタなので, 新規 unit / integration テストは原則追加しない. ただし「`createApp` 本体に `app.get/post/put/patch/delete("/api/v1/...")` パターンが残っていない」「分割後の各ファイルが 400 行以下である」は受け入れ基準 (構造的不変条件) なので, `test-designer` が grep / `wc -l` ベースの構造テスト (例: `tests/structure/entrypoint-decomposition.test.ts`) を 1 件追加する. これも第一候補で進める.
- 未決-5 (テスト時計用エンドポイントの扱い): `/api/v1/test/clock` 系は `deps.testClock` が渡された時のみ生やすという条件付きマウントを持つ. 第一候補は **`createApp` 直下に残す** (リソース別 router の外側. 通常運用に存在しないため). 別 router (`test-clock.ts`) に切り出すかは未決.
