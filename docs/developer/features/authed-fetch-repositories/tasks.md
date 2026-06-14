# タスク: 残り 4 本 HTTP Repository を `authedFetch` 経由に統一

> [`plan.md`](plan.md) を実行可能な単位に分解する. 完了したらチェックを入れる.

## 受け入れ基準 ↔ Step 対応マップ

| AC | 関連 Step |
| --- | --- |
| AC-1 (settings 401 → token 破棄 + event) | Step 2 (失敗テスト) → Step 6 (実装) |
| AC-2 (project 401 → token 破棄 + event) | Step 3 (失敗テスト) → Step 7 (実装) |
| AC-3 (routine 401 → token 破棄 + event) | Step 4 (失敗テスト) → Step 8 (実装) |
| AC-4 (trash 401 → token 破棄 + event) | Step 5 (失敗テスト) → Step 9 (実装) |
| AC-5 (constructor から authToken 撤去) | Step 1 (既存テスト改修で red) → Step 6〜10 (実装) |
| AC-6 (Repository API 互換 — 既存テスト green) | Step 1 (既存テスト seed 統一) → Step 6〜10 (実装) |
| AC-7 (settings-repository.test.ts 新規追加) | Step 2 (新規ファイル作成) → Step 6 (実装) |

## 実装

### Step 1 / 既存テストの seed 統一 + constructor 引数撤去対応 (red 化)

> 4 ファイルそれぞれを `setAuthStorage` seed パターンに揃え, constructor 呼び出しを `new HttpXxxRepository(BASE_URL)` に変更する. この時点で本体が constructor 第 2 引数を要求しているため typecheck が落ちる (= red). [AC-5 / AC-6]

- [x] `web/__tests__/http-task-repository.test.ts` の `new HttpTaskRepository(BASE_URL, TEST_TOKEN)` を `new HttpTaskRepository(BASE_URL)` に置換 (seed パターンは既に統一済み).
- [x] `web/src/repositories/project-repository.test.ts` の `beforeEach` を `WebAuthStorage` + `setAuthStorage` 4 ステップ seed に書き換え, `afterEach` で `setAuthStorage(null)` + `localStorage.clear()` を呼ぶ. `new HttpProjectRepository(BASE_URL, TEST_TOKEN)` を `new HttpProjectRepository(BASE_URL)` に置換.
- [x] `web/src/repositories/routine-repository.test.ts` を同様のパターンで書き換え.
- [x] `web/src/repositories/trash-repository.test.ts` を同様のパターンで書き換え.

### Step 2 / settings の単体テスト + 401 捕捉テストを新規作成 (red) [AC-1 / AC-7]

- [x] `web/src/repositories/settings-repository.test.ts` を新設. 観点は plan.md §「settings-repository.test.ts 新規追加 (AC-7)」を実装. seed パターンは Step 1 と同じ.
- [x] `web/__tests__/http-settings-repository-401.test.ts` を新設. `app-login-production-path.test.tsx` をテンプレートに, `HttpSettingsRepository(baseUrl).getSettings()` で 401 を引き当て, token 破棄 + `todica:auth-expired` dispatch を assert する.

### Step 3 / project の 401 捕捉テストを新規作成 (red) [AC-2]

- [x] `web/__tests__/http-project-repository-401.test.ts` を新設. `HttpProjectRepository(baseUrl).list()` で 401 を引き当てる.

### Step 4 / routine の 401 捕捉テストを新規作成 (red) [AC-3]

- [x] `web/__tests__/http-routine-repository-401.test.ts` を新設. `HttpRoutineRepository(baseUrl).list()` で 401 を引き当てる.

### Step 5 / trash の 401 捕捉テストを新規作成 (red) [AC-4]

- [x] `web/__tests__/http-trash-repository-401.test.ts` を新設. `HttpTrashRepository(baseUrl).list()` で 401 を引き当てる.

### Step 6 / `HttpSettingsRepository` を `authedFetch` 経由に移行 (green) [AC-1 / AC-6 / AC-7]

- [x] `web/src/repositories/settings-repository.ts` に `import { authedFetch } from "../auth/authed-fetch.js"` を追加.
- [x] `getSettings` / `patchSettings` の `fetch` を `authedFetch` に置換. リクエスト header から `Authorization` を削除し, `Content-Type` / `Idempotency-Key` / `If-Match` のみ inline で組み立てる.
- [x] constructor の `readonly authToken: string` を削除し `readonly baseUrl: string` のみ残す. 内部の `this.authToken` 参照を全削除.
- [x] Step 1 / 2 のテストが green になることを確認.

### Step 7 / `HttpProjectRepository` を `authedFetch` 経由に移行 (green) [AC-2 / AC-6]

- [x] `web/src/repositories/project-repository.ts` に `authedFetch` を import.
- [x] `list` / `create` / `update` / `delete` の `fetch` を `authedFetch` に置換.
- [x] `authHeaders` private helper を廃止し, 各 method で `Content-Type` / `Idempotency-Key` / `If-Match` を inline で組み立てる (`task-repository.ts` の `jsonHeaders` 流儀に揃える).
- [x] constructor から `authToken` 引数を削除.
- [x] Step 1 / 3 のテストが green になることを確認.

### Step 8 / `HttpRoutineRepository` を `authedFetch` 経由に移行 (green) [AC-3 / AC-6]

- [x] `web/src/repositories/routine-repository.ts` に `authedFetch` を import.
- [x] `list` / `create` / `update` / `delete` の `fetch` を `authedFetch` に置換.
- [x] `authHeaders` private helper を廃止し, 各 method で header を inline 組み立て.
- [x] constructor から `authToken` 引数を削除.
- [x] Step 1 / 4 のテストが green になることを確認.

### Step 9 / `HttpTrashRepository` を `authedFetch` 経由に移行 (green) [AC-4 / AC-6]

- [x] `web/src/repositories/trash-repository.ts` に `authedFetch` を import.
- [x] `list` / `restore` / `empty` の `fetch` を `authedFetch` に置換.
- [x] `authHeaders` private helper を廃止し, 各 method で header を inline 組み立て.
- [x] constructor から `authToken` 引数を削除.
- [x] Step 1 / 5 のテストが green になることを確認.

### Step 10 / `HttpTaskRepository` の constructor から optional `authToken` を撤去 [AC-5]

- [x] `web/src/repositories/task-repository.ts` の constructor 2 番目の引数 `authToken?: string` と `void authToken;` を削除.
- [x] JSDoc の `BL-074: 旧 API 互換のため authToken 引数は受けるが内部では使わない` の記述を, 「BL-076 で撤去済み」に書き換える.
- [x] `web/__tests__/http-task-repository.test.ts` の `new HttpTaskRepository(BASE_URL)` 呼び出しが Step 1 で既に対応済みであることを再確認.

### Step 11 / `main.tsx` の `buildHttpRepos` シグネチャを整理 [AC-5]

- [x] `web/src/main.tsx` の `buildHttpRepos(baseUrl, authToken)` を `buildHttpRepos(baseUrl)` に変更.
- [x] 内部の `new HttpXxxRepository(baseUrl, authToken)` 5 行をすべて `new HttpXxxRepository(baseUrl)` に変更.
- [x] 呼出元 (`AppWithAuth` 等) の `buildHttpRepos(baseUrl, authToken)` 呼び出しもシグネチャ変更に合わせる. `AppConfig.authToken` 等が他用途で参照されている場合は本 BL では触らない (plan.md §「`main.tsx` の整理」).
- [x] typecheck が 0 エラーになることを確認.

## テスト

- [x] 単体テスト: Step 2〜5 で追加した 4 本の 401 捕捉テスト + 新規 `settings-repository.test.ts` がすべて green.
- [x] 単体テスト: Step 1 で改修した既存 4 本のテストが全件 green を維持.
- [x] リグレッション: `npx vitest run` をリポジトリルートから実行し, 既存 1662 件 + 追加分が全件 green.
- [x] typecheck: `npx tsc --noEmit` が 0 エラー.
- [x] lint: 既存 lint タスクが 0 エラー.

## ドキュメント

- [x] 本 BL は API / 環境変数 / ユーザ操作を変えないため `docs/user/` の更新は不要.
- [x] `docs/developer/project.md` には触れない (CLAUDE.md の禁止事項).

## 仕上げ

- [x] 受け入れ基準 AC-1〜AC-7 を spec.md と突き合わせ, それぞれ対応 Step が green であることを確認.
- [x] `auditor` サブエージェントにレビュー依頼 (仕様適合 / テスト妥当性 / 残存する生 `fetch` の有無 / `authToken` 残骸の有無).
