# 設計・実装計画: entrypoint-decomposition

> [`spec.md`](spec.md) の要件を, どう実現するかに落とす.

## 方針概要

`server/src/app.ts` を「ミドルウェア配線 + 共通ヘルパ + router マウント」と「リソース別ハンドラ」に水平分割する. リソース別ハンドラは `server/src/routers/<resource>.ts` に切り出し, 各々 `function xxxRouter(deps: AppDeps): Hono` を export する. `createApp` は `app.route("/api/v1/<resource>", xxxRouter(deps))` で配線するだけにする.

`web/src/main.tsx` を「エントリ (`createRoot().render(...)`)」「起動分岐 (`bootstrap.ts`)」「`App` コンポーネント (`app.tsx`)」「ルート定義 (`routes.tsx`)」に垂直分割する. `main.tsx` 自体は最小エントリのみを残す.

既存テストが green を維持することをもって振る舞いの不変を担保する. 加えて構造的受け入れ基準 (各ファイル 400 行以下, `createApp` 内の直接ハンドラ不在) を grep / `wc -l` ベースの構造テストで担保する.

## 影響範囲

| 領域 | 変更内容 |
| --- | --- |
| API | 変更なし (公開仕様の保持). |
| DB | 変更なし. |
| サーバモジュール | `server/src/app.ts` を縮退. `server/src/routers/{tasks,today,focus,counter,settings,routines,projects,trash,reset,auth}.ts` を新規作成. 共通ヘルパ `errorJson` / `saveAndReturn` / `clearFocusIfMatches` / `sortTasks` は `server/src/routers/_shared.ts` に切り出して再 export. |
| Web モジュール | `web/src/main.tsx` を最小エントリに縮退. `web/src/bootstrap.ts` (起動分岐 + Repository 構築), `web/src/app.tsx` (`App` コンポーネント本体 + サブコンポーネント `SetupViewWithNav`), `web/src/routes.tsx` (`Routes` JSX) を新規作成. |
| UI | 変更なし (既存ビュー / ルート パス / `AppShell` 配置は不変). |
| テスト | 既存テスト無改修. 構造テスト `tests/structure/entrypoint-decomposition.test.ts` を 1 件追加. |
| ドキュメント | `docs/developer/architecture/module-boundaries.md` の API レイヤ節に新ファイル配置を 1 行追記する (新規ファイル群が層境界に整合していることの明記). |

## 設計詳細

### サーバ側分割

#### ディレクトリ構成

```
server/src/
  app.ts                   # createApp: ミドルウェア配線 + router マウント のみ (≤ 400 行)
  routers/
    _shared.ts             # errorJson / saveAndReturn / clearFocusIfMatches / sortTasks / 型 (≤ 200 行想定)
    tasks.ts               # POST /tasks, GET /tasks, PATCH /tasks/:id, DELETE /tasks/:id, POST /tasks/:id/complete
    today.ts               # GET /today
    focus.ts               # GET /focus, PUT /focus
    counter.ts             # GET /counter
    settings.ts            # GET /settings, PATCH /settings
    routines.ts            # POST /routines, GET /routines, PATCH /routines/:id, DELETE /routines/:id (deps.routineRepository 条件付き)
    projects.ts            # POST /projects, GET /projects, PATCH /projects/:id, DELETE /projects/:id
    trash.ts               # GET /trash, POST /trash/:id/restore, DELETE /trash
    reset.ts               # POST /reset
    auth.ts                # GET /auth-state, POST /login, POST /password, POST /logout
```

#### router モジュールの形

各 router は次のシグネチャで export する.

```ts
// server/src/routers/tasks.ts
import { Hono } from "hono";
import type { AppDeps } from "../app.js";
import { errorJson, saveAndReturn, clearFocusIfMatches, sortTasks } from "./_shared.js";

export function tasksRouter(deps: AppDeps): Hono {
  const router = new Hono();
  router.post("/", async (c) => { /* 既存ロジック */ });
  router.get("/", async (c) => { /* 既存ロジック */ });
  router.patch("/:id", async (c) => { /* 既存ロジック */ });
  router.delete("/:id", async (c) => { /* 既存ロジック */ });
  router.post("/:id/complete", async (c) => { /* 既存ロジック */ });
  return router;
}
```

`createApp` 側は次のようにマウントする.

```ts
app.route("/api/v1/tasks", tasksRouter(deps));
app.route("/api/v1/today", todayRouter(deps));
app.route("/api/v1/focus", focusRouter(deps));
app.route("/api/v1/counter", counterRouter(deps));
app.route("/api/v1/settings", settingsRouter(deps));
app.route("/api/v1/projects", projectsRouter(deps));
app.route("/api/v1/trash", trashRouter(deps));
app.route("/api/v1/reset", resetRouter(deps));
app.route("/api/v1/", authRouter(deps)); // /login /logout /password /auth-state を含むため prefix を / にする
if (deps.routineRepository) {
  app.route("/api/v1/routines", routinesRouter(deps, deps.routineRepository));
}
```

`auth.ts` だけは, パスが `/api/v1/login` / `/api/v1/logout` / `/api/v1/password` / `/api/v1/auth-state` と並列に並ぶため, `app.route("/api/v1/", authRouter(deps))` で `/login` / `/logout` / `/password` / `/auth-state` を直接張る.

#### 共通ヘルパの扱い

- `errorJson(c, status, code, message)` / `saveAndReturn(c, deps, status, body)` / `clearFocusIfMatches(deps, targetId)` / `sortTasks(tasks)` は複数 router から参照されるため `routers/_shared.ts` に置く.
- `WRITE_METHODS` セットは Idempotency ミドルウェアでのみ参照するので `app.ts` 内に残す.
- `AppDeps` interface は `app.ts` に残し, 各 router からは `import type { AppDeps } from "../app.js"` する.

#### 認証ミドルウェアの扱い

`app.use("*", authMiddleware)` および `app.use("*", idempotencyMiddleware)` は分割後も `createApp` 内に残す. これは「全ルートに先頭で適用するクロスカッティング関心事」であり, 各 router に分散させると順序保証が崩れるため.

#### テスト時計エンドポイント

`/api/v1/test/clock` 系は `deps.testClock` が真の場合のみマウントする条件付き. 第一候補は `createApp` 直下のまま (本番経路では存在しないため, リソース別 router の対称性を崩しても影響が小さい). `tests/structure/entrypoint-decomposition.test.ts` の grep では「`/api/v1/test/clock` で始まる app.get/post 呼び出しは例外として許可」と書く.

### Web 側分割

#### ファイル構成

```
web/src/
  main.tsx        # createRoot().render(...) のみ (≤ 50 行想定)
  bootstrap.ts    # init(): 起動分岐 + Repository 構築 + AuthStorage 注入 (≤ 200 行想定)
  app.tsx        # App コンポーネント + SetupViewWithNav (≤ 400 行想定)
  routes.tsx      # <Routes>...</Routes> JSX (≤ 200 行想定)
```

#### 各ファイルの責務

- **`main.tsx`**: 副作用 import (`./styles/tokens.css` / `./styles/button.css`), `init()` を呼び出して `createRoot(root).render(<StrictMode><QueryClientProvider client={queryClient}><BrowserRouter><App ... /></BrowserRouter></QueryClientProvider></StrictMode>)` を実行する. `App` / `init` / `buildHttpRepos` の export は `app.tsx` / `bootstrap.ts` から行うので `main.tsx` 内では行わない.
- **`bootstrap.ts`**: `init()` 関数を export. Capacitor Native 判定 → ローカルモード / サーバモード分岐 → `WebAuthStorage` / `CapacitorAuthStorage` 選択 → `buildHttpRepos()` 呼び出し → `setAuthStorage()` 注入. `buildHttpRepos()` 自身もここに置く. 戻り値は `{ config, repos, authStorage }`.
- **`app.tsx`**: `App` コンポーネント本体を export. `useSyncQueue`, 認証状態 (`authState`, `token`, `baseUrl`, `authToken`, `currentMode`, `repos`) の State 管理, `useEffect` での `fetchAuthState` / `AUTH_EXPIRED_EVENT` 監視, `handleLogin` / `handleLogout` / `handleChangePassword` / `handleInitialPasswordSetup` / `handleSelectLocal` / `handleSwitchMode` を担当. 認証分岐 (`InitialSetupView` / `LoginView` の早期 return) もここ. ルート定義は `routes.tsx` へ委譲する. サブコンポーネント `SetupViewWithNav` もここで定義する (ルートでしか使われないが, `useNavigate` をルート要素の `element` 内で呼び出すため Route 側コンテキストが必要).
- **`routes.tsx`**: `<Routes>` JSX とその子 `<Route>` 群を返す関数コンポーネント `AppRoutes(props)` を export. props には `config`, `repos`, `currentMode`, `token`, `handleLogin` / `handleLogout` / `handleChangePassword` / `handleSelectLocal` / `handleSwitchMode` / `handleSetServer` (URL 検証完了後の処理) などを受け取る. `App` は分岐後に `<AppRoutes ... />` を返す.

`未決-2` の通り, `bootstrap.ts` が 400 行を超える場合は `web/src/repo-factory.ts` を更に切り出す (ローカル Repository の動的 import を集約).

#### 公開シンボル

互換のため次を保持する.

- `web/src/app.tsx` から `App`, `AppProps`, `AppConfig`, `buildHttpRepos` を export.
- `web/src/main.tsx` 自体は何も export しない (元から export はあるが, テストはエントリ呼び出しを直接使っていない).

公開シンボルが移動する場合は影響を `git grep` で確認し, import パスを追従修正する.

### 処理フロー (変更前後の対比)

#### サーバ

```
変更前: createApp(deps)
  - CORS
  - /healthz
  - authMiddleware
  - idempotencyMiddleware
  - GET /api/v1/auth-state
  - POST /api/v1/login
  - POST /api/v1/password
  - POST /api/v1/logout
  - POST /api/v1/tasks
  - ... (合計 30+ ハンドラ)

変更後: createApp(deps)
  - CORS
  - /healthz
  - authMiddleware
  - idempotencyMiddleware
  - app.route("/api/v1/", authRouter(deps))
  - app.route("/api/v1/tasks", tasksRouter(deps))
  - app.route("/api/v1/today", todayRouter(deps))
  - app.route("/api/v1/focus", focusRouter(deps))
  - app.route("/api/v1/counter", counterRouter(deps))
  - app.route("/api/v1/settings", settingsRouter(deps))
  - app.route("/api/v1/projects", projectsRouter(deps))
  - app.route("/api/v1/trash", trashRouter(deps))
  - app.route("/api/v1/reset", resetRouter(deps))
  - if (deps.routineRepository) app.route("/api/v1/routines", routinesRouter(deps))
  - if (deps.testClock) { ... テスト時計 3 本 ... }
```

#### Web

```
変更前: main.tsx
  - 起動分岐 (init)
  - buildHttpRepos
  - App コンポーネント (認証 + ルート定義)
  - SetupViewWithNav

変更後:
  - main.tsx        : init() を呼んで createRoot().render(<App ... />)
  - bootstrap.ts    : init() / buildHttpRepos()
  - app.tsx         : App コンポーネント (認証分岐 + handler 群) / SetupViewWithNav
  - routes.tsx      : AppRoutes コンポーネント (Routes JSX)
```

### 例外 / エラー処理

- 既存の `errorJson` を `routers/_shared.ts` に移送する以外, 例外ハンドリングの挙動は変更しない.
- 既存の `c.get("idempotencyKey")` の流れも変更しない (Idempotency ミドルウェアは `createApp` 内で `*` にマウントしたまま).

## 重要な決定

- **D-1 (採用)**: server 側は **リソース単位 10 ファイル** で分割する (`spec.md` 未決-1 の第一候補). 認証系の更なる細分化は採用しない. 理由: 共通ヘルパ (パスワード未設定時の素通し条件) は `auth.ts` 内で完結し, 細分化のメリットが小さい.
- **D-2 (採用)**: web 側は **3 ファイル** で分割する (`spec.md` 未決-2 の第一候補). `bootstrap.ts` が 400 行を超えそうな場合のみ追加で `repo-factory.ts` に分割する. 判断は実装フェーズ.
- **D-3 (採用)**: router モジュールは **`xxxRouter(deps: AppDeps): Hono` を export し, `createApp` で `app.route("/api/v1/<resource>", xxxRouter(deps))` でマウント** する (`spec.md` 未決-3 の第一候補). 各 router は `deps` をクロージャ越しに参照する.
- **D-4 (採用)**: テスト時計用エンドポイントは **`createApp` 直下に残す** (`spec.md` 未決-5 の第一候補). 通常本番には存在しないため対称性のずれは許容する.
- **D-5 (採用)**: 構造的受け入れ基準 (各ファイル 400 行以下, `createApp` 直接ハンドラ不在) は **構造テスト 1 件 (`tests/structure/entrypoint-decomposition.test.ts`)** で担保する (`spec.md` 未決-4 の第一候補). grep / `wc -l` 相当を Node + `fs.readFileSync` で実装する想定.

これらは ADR 化するほどの分岐ではない (ADR は仕様レベルの不可逆な技術選定に限る). 既存 ADR `0007-server-tech-stack.md` (Hono 採用) と `0010-api-design.md` (REST + ETag + Idempotency) の方針内で完結する細粒度の構造判断のため, ADR 新規作成は行わない.

## リスク / 代替案

- **リスク R-1**: 分割の際に `c.get("idempotencyKey")` / 認証中継 / ETag ヘッダ付与の流れがリソース別 router に分散すると, 1 リソースだけ漏れる可能性がある. 緩和策: 既存の HTTP 統合テストが全リソースを網羅していることを `test-designer` の事前監査で確認する. 不足が見つかれば test-designer に追加を依頼する.
- **リスク R-2**: `app.route("/api/v1/", authRouter(deps))` のように prefix を `/` 寄りで切ると, 他リソースの mount 順序によっては期待しないマッチが起きる可能性がある. 緩和策: `auth.ts` のルートを `router.get("/auth-state", ...)` / `router.post("/login", ...)` 等の完全パスで張り, 他 prefix と衝突しないことを既存テストで確認する.
- **リスク R-3**: `bootstrap.ts` の動的 `import("@capacitor/preferences")` / `import("./repositories/local-db.js")` 等が, 分割後にバンドラの分析でうまく解決されない可能性がある. 緩和策: Vite ビルド (`npm -w web run build` 相当) の成功を tasks のチェックポイントに含める.
- **代替案 A-1**: server を「Resource × Method」単位の 30+ ファイル分割 (spec 未決-1 候補 C). 採用しない (1 ファイル 30 行程度になり, 読み手は逆に複数ファイルを跨ぐ必要がある).
- **代替案 A-2**: web を「Native 切り替え / repo-factory / route 定義 / OfflineBanner マウント」の細分割 (spec 未決-2 候補 b). 採用しない (`OfflineBanner` 等は元から共通 JSX として `App` から 1 行で呼ばれるだけで, 別ファイル化の利得が薄い).

## テスト方針

> 全体方針は [`../../quality/test-catalog.md`](../../quality/test-catalog.md).

- **既存テスト**: 全件 green を維持する. server 側の HTTP 統合テスト (各リソース別) と web 側の `App` レンダリングテストが振る舞い不変を担保する.
- **新規テスト 1 件**: `tests/structure/entrypoint-decomposition.test.ts` を追加. 内容は次の構造的不変条件を assert する.
  1. `server/src/app.ts` の `createApp` 関数本体内で, `app.(get|post|put|patch|delete)("/api/v1/...")` の正規表現マッチが 0 件である (例外: `/api/v1/test/clock` 系のみ許可).
  2. `server/src/app.ts`, `server/src/routers/*.ts`, `web/src/main.tsx`, `web/src/bootstrap.ts`, `web/src/app.tsx`, `web/src/routes.tsx` の各ファイル行数 (`fs.readFileSync().split("\n").length`) が 400 以下である.
  3. `web/src/main.tsx` 内に `function App` / `Routes` のキーワード出現が無い.
- **手動確認**: 仕様上「動作不変」を保つので, テスト green に加えて Vite ビルド (`npm -w web run build`) と server 起動 (`npm -w server run dev`) の smoke 確認をタスクに含める. これは MEMORY.md の verify-bootstrap-runnable 方針に従う.
