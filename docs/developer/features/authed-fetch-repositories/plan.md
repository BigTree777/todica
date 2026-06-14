# 設計・実装計画: 残り 4 本 HTTP Repository を `authedFetch` 経由に統一

> [`spec.md`](spec.md) の要件を, どう実現するかに落とす.

## 方針概要

BL-074 で `HttpTaskRepository` に適用済みの「`authedFetch` 経由 + constructor の `authToken` 廃止」というパターンを, 残り 4 本 (`HttpSettingsRepository` / `HttpProjectRepository` / `HttpRoutineRepository` / `HttpTrashRepository`) に機械的に展開する. 加えて BL-074 で task 側に optional unused のまま残った `authToken` 引数も同時に撤去し, 全 5 本で constructor を `(baseUrl)` のみに揃える. API 仕様 (path / method / body / response 型 / Idempotency-Key / If-Match 等の業務ヘッダ) は無改修, Authorization の付与経路だけが入れ替わる.

## 影響範囲

| 領域 | 変更内容 |
| --- | --- |
| API (サーバ) | 変更なし (path / method / response 型は無改修) |
| DB | 変更なし |
| Web Repository (HTTP) | 4 本を `authedFetch` に置換 + 5 本の constructor から `authToken` 引数を撤去 |
| Web Repository (Local) | 触れない (BL-020 スコープ外) |
| Web 起動エントリ | `main.tsx` の `buildHttpRepos` を `(baseUrl, authToken) → (baseUrl)` に整理 |
| UI コンポーネント | 触れない (Repository の利用側は引数増減を受けるだけで挙動不変) |
| 単体テスト | 4 本の既存テストを `setAuthStorage` seed パターンに統一 + 各 1 件ずつ 401 捕捉テスト追加 + `settings-repository.test.ts` を新規追加 |
| domain / server / e2e | 触れない |
| デザイントークン / a11y | 変更なし |

### 変更ファイル一覧

| ファイル | 種別 | 変更概要 |
| --- | --- | --- |
| `web/src/repositories/settings-repository.ts` | 改修 | `fetch` → `authedFetch`, `Authorization` 手書き削除, constructor `authToken` 撤去 |
| `web/src/repositories/project-repository.ts` | 改修 | 同上 |
| `web/src/repositories/routine-repository.ts` | 改修 | 同上 |
| `web/src/repositories/trash-repository.ts` | 改修 | 同上 |
| `web/src/repositories/task-repository.ts` | 改修 | constructor から optional unused の `authToken` を撤去 (本体 fetch は BL-074 で移行済み) |
| `web/src/main.tsx` | 改修 | `buildHttpRepos` のシグネチャを `(baseUrl: string)` に変更, 各 `new HttpXxxRepository(baseUrl)` に揃える |
| `web/src/repositories/project-repository.test.ts` | 改修 | `beforeEach` で `WebAuthStorage` + `setAuthStorage` で token を seed する形に統一, `new HttpProjectRepository(BASE_URL)` に変更 |
| `web/src/repositories/routine-repository.test.ts` | 改修 | 同上 |
| `web/src/repositories/trash-repository.test.ts` | 改修 | 同上 |
| `web/__tests__/http-task-repository.test.ts` | 改修 | `new HttpTaskRepository(BASE_URL, TEST_TOKEN)` → `new HttpTaskRepository(BASE_URL)` に揃える (seed パターンは既に統一済み) |
| `web/src/repositories/settings-repository.test.ts` | 新規 | AC-6 の seed パターン + AC-7 観点の単体テストを追加 |
| `web/__tests__/http-settings-repository-401.test.ts` (案) | 新規 | AC-1 の 401 捕捉テスト |
| `web/__tests__/http-project-repository-401.test.ts` (案) | 新規 | AC-2 の 401 捕捉テスト |
| `web/__tests__/http-routine-repository-401.test.ts` (案) | 新規 | AC-3 の 401 捕捉テスト |
| `web/__tests__/http-trash-repository-401.test.ts` (案) | 新規 | AC-4 の 401 捕捉テスト |

> 401 捕捉テストは `web/__tests__/` 直下に置く案を採用する (既存の `app-login-production-path.test.tsx` と同じ配置で, 「Repository 配線 + auth-storage 連携」を扱う統合観点のテストであることを location 上明確にするため). 4 本を 1 ファイル `http-repositories-401.test.ts` に集約しても良いが, 失敗時の局所化容易性を優先して 4 ファイルに分割する (D-4).

## 設計詳細

### `authedFetch` 呼び出しに置換する箇所

| Repository | 置換対象メソッド | エンドポイント |
| --- | --- | --- |
| `HttpSettingsRepository` | `getSettings` / `patchSettings` | `GET /api/v1/settings` / `PATCH /api/v1/settings` |
| `HttpProjectRepository` | `list` / `create` / `update` / `delete` | `GET|POST /api/v1/projects` / `PATCH|DELETE /api/v1/projects/:id` |
| `HttpRoutineRepository` | `list` / `create` / `update` / `delete` | `GET|POST /api/v1/routines` / `PATCH|DELETE /api/v1/routines/:id` |
| `HttpTrashRepository` | `list` / `restore` / `empty` | `GET /api/v1/trash` / `POST /api/v1/trash/:id/restore` / `DELETE /api/v1/trash` |

### 置換の変換規則 (パターン)

各 Repository 内で以下の機械的変換を行う.

- `await fetch(url, init)` → `await authedFetch(url, init)`
- `init.headers` の `Authorization: 'Bearer ${this.authToken}'` を削除. `Content-Type` / `Idempotency-Key` / `If-Match` は維持する.
- それぞれの `authHeaders(extra)` private helper を廃止し, 必要に応じて `jsonHeaders(extra)` (Content-Type のみ付与) を `task-repository.ts` の流儀に合わせて新設, または直接 inline オブジェクトで `Content-Type` / `Idempotency-Key` / `If-Match` を組み立てる. 命名と粒度は task 側に合わせる.
- constructor から `readonly authToken: string` を削除. `readonly baseUrl: string` のみを残す.

### constructor 引数の変更

- 5 本の Repository 共通で:
  - 旧: `constructor(readonly baseUrl: string, readonly authToken: string) {}` (task は `authToken?: string` の optional)
  - 新: `constructor(readonly baseUrl: string) {}`
- 内部の `this.authToken` 参照はすべて削除する. token は `authedFetch` が `auth-storage` から都度読む.

### `main.tsx` の整理

```
旧: function buildHttpRepos(baseUrl: string, authToken: string): Repositories {
       return {
         task: new HttpTaskRepository(baseUrl, authToken),
         settings: new HttpSettingsRepository(baseUrl, authToken),
         trash: new HttpTrashRepository(baseUrl, authToken),
         project: new HttpProjectRepository(baseUrl, authToken),
         routine: new HttpRoutineRepository(baseUrl, authToken),
       };
     }

新: function buildHttpRepos(baseUrl: string): Repositories {
       return {
         task: new HttpTaskRepository(baseUrl),
         settings: new HttpSettingsRepository(baseUrl),
         trash: new HttpTrashRepository(baseUrl),
         project: new HttpProjectRepository(baseUrl),
         routine: new HttpRoutineRepository(baseUrl),
       };
     }
```

呼出側 (`AppWithAuth` 等) で `buildHttpRepos(baseUrl, authToken)` を呼んでいる箇所もシグネチャに合わせて `buildHttpRepos(baseUrl)` に変更する. `AppConfig.authToken` / `App` の token 参照のうち, Repository 生成のためだけに保持していたものは整理する余地があるが, 本 BL のスコープは「`buildHttpRepos` シグネチャ更新」までとし, それ以外で `authToken` を保持する箇所には触れない (LoginView / logout 経路で参照される可能性があるため別 BL の判断とする).

### 既存 Repository テストの seed パターン統一

既存 3 ファイル (`project-repository.test.ts` / `routine-repository.test.ts` / `trash-repository.test.ts`) は constructor の第 2 引数として直接 `TEST_TOKEN` を渡し, msw 側で `request.headers.get("Authorization")` をそのまま受けて assertion している. 本 BL では:

- `beforeEach` で `localStorage.clear()` → `new WebAuthStorage()` → `await storage.setToken(TEST_TOKEN)` → `setAuthStorage(storage)` の seed を行う.
- `afterEach` で `setAuthStorage(null)` + `localStorage.clear()` を行う.
- `new HttpXxxRepository(BASE_URL, TEST_TOKEN)` → `new HttpXxxRepository(BASE_URL)` に変更する.
- 既存の `expect(receivedAuth).toBe(\`Bearer ${TEST_TOKEN}\`)` 等の assertion はそのまま green を保つ (`authedFetch` が seed 済み token を `Authorization` に乗せるため).
- パターン参照は `web/__tests__/http-task-repository.test.ts` の `beforeEach` (lines 37–46) を正典とする.

### 401 捕捉テスト (新規 4 本)

`app-login-production-path.test.tsx` をテンプレートに, 4 本それぞれについて以下構造のテストを 1 件ずつ作る.

```
1. beforeEach で localStorage を clear.
2. WebAuthStorage に "expired-token" を seed し setAuthStorage で注入.
3. vi.spyOn(global, "fetch") を 401 Response を返す mock に差し替える.
4. window.addEventListener(AUTH_EXPIRED_EVENT, handler) で発火回数を観測.
5. 対象 Repository の代表的な GET メソッド (settings: getSettings, project: list,
   routine: list, trash: list) を呼び, HTTP 401 で reject することを assert.
6. fetch が 1 回呼ばれていること, storage.getToken() が null になっていること,
   dispatched === 1 であることを assert.
7. afterEach で setAuthStorage(null), localStorage.clear(), vi.restoreAllMocks().
```

### settings-repository.test.ts 新規追加 (AC-7)

既存テストが存在しない `HttpSettingsRepository` について, 他 3 本のテスト構造に揃えた msw ベースの単体テストを新設する. 観点は最低限以下:

- `getSettings` が `GET /api/v1/settings` に `Authorization: Bearer ${TEST_TOKEN}` を付ける.
- `patchSettings` が `PATCH /api/v1/settings` に `Idempotency-Key` (UUID v4) と `If-Match: ${ifMatch}` を付ける.
- 412 応答で `PatchConflictError` を throw し, error.settings に response body の settings が入る.
- 上記すべてで `setAuthStorage` seed パターンを採用する.

## 重要な決定

- **D-1**: BL-074 `task-repository.ts` で確立した `authedFetch` 経由のパターンを変更せず, 4 本に機械的に適用する. 401 捕捉ロジックは `authedFetch` 一極集中のまま (各 Repository 側で 401 を独自に解釈する経路は作らない). BL-074 D-13 を踏襲する.
- **D-2**: 5 本すべての constructor から `authToken` 引数を撤去する. BL-074 では task 側だけ optional unused のまま残していたが, 本 BL のタイミングで揃える方が将来の呼出元 (Local / Storybook / 別エントリ) の見通しが良くなる.
- **D-3**: 後方互換 (`authToken` を optional で残す) は採用しない. 本 BL は機械的なクリーンアップであり, 段階的 deprecation の必要性がない (内部呼出のみで, 外部公開 API ではないため).
- **D-4**: 401 捕捉の単体テストは `app-login-production-path.test.tsx` と同じ `vi.spyOn(global, "fetch")` パターンを採用する (msw でも代替可能だが, 既存 production-path テストとの一貫性を優先). 4 本それぞれに 1 件ずつ独立ファイルとして配置し, `web/__tests__/http-{settings,project,routine,trash}-repository-401.test.ts` の命名で並べる. これにより監査時の対応関係が見やすく, 失敗時の局所化が容易になる.
- **D-5**: 既存 Repository unit テストの auth seed は `beforeEach` で `localStorage.clear()` → `new WebAuthStorage()` → `storage.setToken(TEST_TOKEN)` → `setAuthStorage(storage)` の 4 ステップ固定パターンで揃える. `afterEach` も `setAuthStorage(null)` + `localStorage.clear()` の 2 ステップで固定する. 個別 it 内で seed を行わない (テスト間で auth state が漏れないようにするため).
- **D-6**: `authedFetch` 自体には改修を加えない. 401 → `clearToken` + event dispatch のロジックは BL-074 のまま. 本 BL は呼出側を増やすだけのスコープ.
- **D-7**: 段階分割は 1 PR / 1 commit を推奨する. 4 本の Repository 改修・5 本の constructor 整理・main.tsx 整理・テスト改修は相互依存 (constructor を変えると既存テストの new 呼び出しも変える必要がある) しており, 個別 commit に分けるメリットが薄い. PR 内のレビュー単位として diff を Repository 4 + テスト 4 + main + task 整理に分かるよう構造化する (commit メッセージで明示).
- **D-8**: 既存テストの「`Authorization: Bearer ${TEST_TOKEN}` を付ける」観点は維持する. `authedFetch` 経由でも seed した token がそのまま `Authorization` ヘッダに乗るため, msw 側 assertion を書き換える必要はない.

## リスク / 代替案

- **R-1 / テスト並列実行時の seed 漏れ**: vitest は file 単位で sandbox が分離されるが, 401 捕捉テストで `vi.spyOn(global, "fetch")` を使う場合 `afterEach` で `vi.restoreAllMocks()` を確実に呼ぶ. 怠ると同一ファイル内の後続テストで msw が動かなくなる. 対処は `app-login-production-path.test.tsx` の afterEach パターン (line 29–33) を踏襲することで回避.
- **R-2 / `setAuthStorage(null)` 戻し忘れ**: `setAuthStorage` はモジュールグローバルな状態を持つため, `afterEach` で `setAuthStorage(null)` を呼ばないと他テストファイルの先頭で前ファイルの storage が残る. 対処は D-5 の固定パターンを厳守.
- **代替案 (棄却) / 1 ファイルに集約**: 401 捕捉テスト 4 件を `web/__tests__/http-repositories-401.test.ts` 1 本に集約する案. 拒否理由: 失敗時にどの Repository が壊れているかが test 名でしか判別できず, 監査時の機械的対応 (Repository ↔ テストファイル) が崩れる.
- **代替案 (棄却) / `authedFetch` の改修で対応**: `authedFetch` 側に「Authorization が付かなかったら token を必須化」等のロジックを追加する案. 拒否理由: BL-074 で確定したインターフェースを本 BL の都合で揺らさない (D-6).

## テスト方針

> 全体方針は [`../../quality/test-catalog.md`](../../quality/test-catalog.md).

### 単体テスト

- 既存 3 ファイルの seed パターン統一 (`project-repository.test.ts` / `routine-repository.test.ts` / `trash-repository.test.ts`).
- 新規 1 ファイルの追加 (`settings-repository.test.ts`).
- 新規 4 ファイルの 401 捕捉テスト追加 (`web/__tests__/http-{settings,project,routine,trash}-repository-401.test.ts`).

### 統合 / E2E テスト

- 本 BL は API 仕様 / UI 仕様を変えないため新規追加なし.
- 既存の `app-login-production-path.test.tsx` (BL-074 で追加された AC-4 production 経路) は task 1 本でしか担保されていなかったが, 本 BL の単体 401 捕捉テストにより 4 本でも同等が担保される.

### typecheck / lint

- `npx tsc --noEmit` と既存 lint タスクで 0 エラー.
- constructor シグネチャ変更に伴う呼出元コンパイルエラーが起きないことを確認.

### vitest 実行場所

- リポジトリルートから `npx vitest run` で実行する (jsdom 環境設定がルート vitest.config に集約されているため).

## 未決事項

- なし.
