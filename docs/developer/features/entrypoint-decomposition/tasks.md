# タスク: entrypoint-decomposition

> [`plan.md`](plan.md) を実行可能な単位に分解する. 完了したらチェックを入れる.

## 事前準備

- [ ] BL-085 のブランチ (`feature/entrypoint-decomposition`) で作業していることを確認する.
- [ ] `npm test` / `npm run typecheck` / `npm run lint` を分割前のベースラインとして 1 回実行し, 全 green / 0 件であることを記録する.
- [ ] `wc -l server/src/app.ts web/src/main.tsx` を分割前ベースラインとして記録する.

## サーバ側分割

### 共通ヘルパ抽出

- [ ] `server/src/routers/_shared.ts` を新規作成し, `server/src/app.ts` から `errorJson`, `saveAndReturn`, `clearFocusIfMatches`, `sortTasks` を移動する.
- [ ] `_shared.ts` で 4 ヘルパを `export` し, `app.ts` 側は import に切替える.

### リソース別 router 作成 (10 ファイル)

各ファイルは `function <name>Router(deps: AppDeps): Hono` を export する形に揃える. ハンドラ実装は元の `app.get/post/put/patch/delete(...)` の呼び出しを `router.get/post/put/patch/delete(...)` に置換しただけの 1 対 1 移送とし, ロジック変更は行わない.

- [ ] `server/src/routers/auth.ts` を作成. 対象ハンドラ: `GET /auth-state`, `POST /login`, `POST /password`, `POST /logout`.
- [ ] `server/src/routers/tasks.ts` を作成. 対象ハンドラ: `POST /`, `GET /`, `PATCH /:id`, `DELETE /:id`, `POST /:id/complete`.
- [ ] `server/src/routers/today.ts` を作成. 対象ハンドラ: `GET /`.
- [ ] `server/src/routers/focus.ts` を作成. 対象ハンドラ: `GET /`, `PUT /`.
- [ ] `server/src/routers/counter.ts` を作成. 対象ハンドラ: `GET /`.
- [ ] `server/src/routers/settings.ts` を作成. 対象ハンドラ: `GET /`, `PATCH /`.
- [ ] `server/src/routers/projects.ts` を作成. 対象ハンドラ: `POST /`, `GET /`, `PATCH /:id`, `DELETE /:id`.
- [ ] `server/src/routers/trash.ts` を作成. 対象ハンドラ: `GET /`, `POST /:id/restore`, `DELETE /`.
- [ ] `server/src/routers/reset.ts` を作成. 対象ハンドラ: `POST /`.
- [ ] `server/src/routers/routines.ts` を作成. 対象ハンドラ: `POST /`, `GET /`, `PATCH /:id`, `DELETE /:id`. `deps.routineRepository` のオプショナルチェックは `createApp` 側で行う.

### createApp 縮退

- [ ] `server/src/app.ts` の `createApp` 内のリソース別ハンドラを全て削除し, `app.route("/api/v1/<resource>", xxxRouter(deps))` 配線に置換する.
- [ ] `auth.ts` のマウントは `app.route("/api/v1/", authRouter(deps))` で `/login` / `/logout` / `/password` / `/auth-state` を張る形にする.
- [ ] `routines.ts` のマウントは `if (deps.routineRepository) { app.route("/api/v1/routines", routinesRouter(deps)); }` で条件付きにする.
- [ ] CORS / `/healthz` / `authMiddleware` / `idempotencyMiddleware` / テスト時計用エンドポイント / 末尾 `return app;` は `createApp` 内に残す.
- [ ] `WRITE_METHODS` 定数は `app.ts` 内に残す.

## Web 側分割

### bootstrap.ts 切り出し

- [ ] `web/src/bootstrap.ts` を新規作成する.
- [ ] `web/src/main.tsx` から `buildHttpRepos`, `Repositories` 型, `ViteEnv` 型, `init()` 関数本体, `env` 定数を `bootstrap.ts` に移動する.
- [ ] `init()` の戻り値型は `Promise<{ config: AppConfig; repos: Repositories; authStorage: AuthStorage }>` に統一し, `createRoot` 呼び出し部分は呼び出し元 (`main.tsx`) に残す.
- [ ] `AppConfig` 型は `app.tsx` から `import type` する形に整理する.

### app.tsx 切り出し

- [ ] `web/src/app.tsx` を新規作成する.
- [ ] `web/src/main.tsx` から `App` コンポーネント本体, `AppProps` 型, `AppConfig` 型, `SetupViewWithNav` コンポーネント, 各ハンドラ (`handleLogin` / `handleLoginSuccess` / `handleInitialPasswordSetup` / `handleInitialPasswordSetupSuccess` / `handleLogout` / `handleChangePassword` / `handlePasswordChanged` / `handleSelectLocal` / `handleSwitchMode`) を `app.tsx` に移動する.
- [ ] 認証状態の `useState` / `useEffect` 群もそのまま `app.tsx` に移動する.
- [ ] `Routes` JSX 部分のみ `routes.tsx` への呼び出しに置換する.

### routes.tsx 切り出し

- [ ] `web/src/routes.tsx` を新規作成する.
- [ ] `web/src/main.tsx` から `<Routes>...</Routes>` JSX 部分を `AppRoutes` コンポーネントとして抽出する. props で `repos` / `config` / `currentMode` / `token` / `defaultRoute` / 各ハンドラ / URL 検証完了コールバック (`onSetupValidated`) を受け取る.
- [ ] `OfflineBanner` / `PwaUpdateBanner` / `ErrorNotification` の配置はそのまま `app.tsx` 側に残す (3 つの早期 return パターンで使われているため).

### main.tsx 縮退

- [ ] `web/src/main.tsx` 内のコンポーネント定義 (`App`, `SetupViewWithNav`) と `init()` を全て削除する.
- [ ] 副作用 import (`./styles/tokens.css`, `./styles/button.css`) は残す.
- [ ] `import { init } from "./bootstrap.js"` と `import { App } from "./app.js"` を追加する.
- [ ] エントリ部分 (`document.getElementById("root")` チェック → `init()` 呼び出し → `createRoot(root).render(<StrictMode><QueryClientProvider><BrowserRouter><App ... /></BrowserRouter></QueryClientProvider></StrictMode>)`) を `main.tsx` に残す.

### bootstrap.ts のサイズ判定

- [ ] `bootstrap.ts` の行数を測り, 400 行を超える場合は `web/src/repo-factory.ts` を追加で切り出す (ローカル Repository の動的 import 群を集約).

## テスト

- [ ] 構造テスト `tests/structure/entrypoint-decomposition.test.ts` を追加.
  - [ ] `server/src/app.ts` の `createApp` 内で `app.(get|post|put|patch|delete)("/api/v1/...")` パターンが 0 件 (`/api/v1/test/clock` は除外) を assert する.
  - [ ] `server/src/app.ts`, `server/src/routers/*.ts`, `web/src/main.tsx`, `web/src/bootstrap.ts`, `web/src/app.tsx`, `web/src/routes.tsx` の各ファイル行数が 400 以下を assert する.
  - [ ] `web/src/main.tsx` 内に `function App` / `<Routes>` キーワード出現が 0 件を assert する.
- [ ] 既存テスト (`npx vitest run`) を全件実行し, 全て green を確認する.
- [ ] 既存型チェック (`npm run typecheck`) を実行し, 0 件を確認する.
- [ ] 既存 Lint (`npm run lint`) を実行し, 0 件を確認する.

## 動作確認

- [ ] `npm -w server run dev` 起動 smoke 確認 (起動成功 + `/healthz` 200).
- [ ] `npm -w web run build` smoke 確認 (Vite ビルド成功).
- [ ] サーバを起動して各 `/api/v1/...` URL を 1 回ずつ叩き, 分割前後で同じレスポンスが返ることを目視確認する (任意, 既存 HTTP 統合テストで担保されるため省略可).

## ドキュメント

- [ ] `docs/developer/architecture/module-boundaries.md` の API レイヤ節に, `server/src/routers/` のリソース別 router 配置を 1 行追記する.
- [ ] 必要に応じて `docs/developer/features/entrypoint-decomposition/spec.md` の未決事項を, 実装フェーズの決定に従って更新する.

## 仕上げ

- [ ] 受け入れ基準 (spec.md) を全て満たすことを確認する.
- [ ] `auditor` にレビュー依頼を出す.
- [ ] `feature/entrypoint-decomposition` ブランチを push し, Pull Request を作成する.
