# タスク: auth-storage-tests

> [`plan.md`](plan.md) を実行可能な単位に分解する. 完了したらチェックを入れる.

## AC ↔ Step マップ

| Step | 対象ファイル | カバーする AC |
| --- | --- | --- |
| Step 1 | `web/src/auth/authed-fetch.test.ts` | AC-1 (引数透過) / AC-2 (200 透過) / AC-7 (Authorization 上書き禁止) |
| Step 2 | `web/src/auth/authed-fetch.test.ts` | AC-3 (401 hand-off) / AC-4 (非 401 素通し) |
| Step 3 | `web/src/auth/authed-fetch.test.ts` | AC-5 (storage 未設定 no-op) / AC-6 (getToken=null) |
| Step 4 | `web/src/auth/capacitor-auth-storage.test.ts` | AC-8 (getToken) / AC-9 (null 透過) |
| Step 5 | `web/src/auth/capacitor-auth-storage.test.ts` | AC-10 (setToken) / AC-11 (clearToken) |
| Step 6 | `web/src/auth/capacitor-auth-storage.test.ts` | AC-12 (round-trip) |
| Step 7 | (回帰確認) | AC-13 (typecheck / lint / vitest 全体) |

## 実装 (TDD サイクル)

> 各 Step は「失敗するテストを書く → green になることを確認」の順で進める.
> 本機能はテスト追加スコープなので production の green 化は不要 (既に実装済).
> テスト記述後に既存 production がそのまま green を返すはず. red になった場合は
> spec の解釈ミスを疑い `project-designer` へ差し戻す.

### Step 1: authedFetch の引数透過 / 200 透過

- [x] `web/src/auth/authed-fetch.test.ts` を新規作成し, ファイル先頭にコメントブロックで
      受け入れ基準の出典 (`docs/developer/features/auth-storage-tests/spec.md` AC-1〜AC-7) を明記する.
- [x] `beforeEach` / `afterEach` に共通セットアップ (mock storage 注入, `global.fetch` mock,
      `setAuthStorage(null)` でのクリーンアップ) を実装する.
- [x] AC-1: `authedFetch("/api/v1/projects", { method: "POST", body: "x" })` が `fetch` を
      `"/api/v1/projects"` + 第 2 引数に `Authorization: Bearer tkn-1` を含む `Headers` 付きで
      呼ぶことを assert する.
- [x] AC-2: 200 Response で `clearToken` 未呼出 / event 未 dispatch を assert する.
- [x] AC-7: 呼出側が `Authorization` を既に渡している場合に上書きしないことを assert する.
- [x] `npx vitest run web/src/auth/authed-fetch.test.ts` で green を確認.

### Step 2: authedFetch の 401 hand-off / 非 401 素通し

- [x] AC-3: 401 Response で `currentStorage.clearToken` が 1 回呼ばれ,
      `todica:auth-expired` イベントが 1 回 dispatch されることを assert する.
      (`window.addEventListener(AUTH_EXPIRED_EVENT, spy)` + `afterEach` で removeEventListener.)
- [x] AC-4: 500 Response で `clearToken` 未呼出 / event 未 dispatch を assert する.
- [x] `npx vitest run web/src/auth/authed-fetch.test.ts` で green を確認.

### Step 3: authedFetch の storage 未設定 / getToken=null

- [x] AC-5: `setAuthStorage(null)` 状態で 401 Response を受けたとき, `fetch` への
      Authorization ヘッダが付かないこと / event は dispatch されることを assert する.
- [x] AC-6: `getToken().mockResolvedValue(null)` のとき Authorization 非付与であること,
      200 Response が透過することを assert する.
- [x] `npx vitest run web/src/auth/authed-fetch.test.ts` で green を確認.

### Step 4: CapacitorAuthStorage の getToken

- [x] `web/src/auth/capacitor-auth-storage.test.ts` を新規作成し, ファイル先頭で
      `vi.mock("@capacitor/preferences", () => ({ Preferences: { get: vi.fn(), set: vi.fn(), remove: vi.fn() } }))` を宣言する.
- [x] `beforeEach` で `vi.clearAllMocks()` を呼ぶ.
- [x] AC-8: `Preferences.get.mockResolvedValue({ value: "tkn-stored" })` のとき,
      `new CapacitorAuthStorage().getToken()` が `"tkn-stored"` を返し, `Preferences.get` が
      `{ key: "authToken" }` で 1 回呼ばれることを assert する.
- [x] AC-9: `Preferences.get.mockResolvedValue({ value: null })` のとき, 返り値が `null` であることを assert する.
- [x] `npx vitest run web/src/auth/capacitor-auth-storage.test.ts` で green を確認.

### Step 5: CapacitorAuthStorage の setToken / clearToken

- [x] AC-10: `CapacitorAuthStorage.setToken("tkn-new")` で `Preferences.set` が
      `{ key: "authToken", value: "tkn-new" }` で 1 回呼ばれ, subscribe した listener が
      `"tkn-new"` で呼ばれることを assert する.
- [x] AC-11: `CapacitorAuthStorage.clearToken()` で `Preferences.remove` が `{ key: "authToken" }` で
      1 回呼ばれ, subscribe した listener が `null` で呼ばれることを assert する.
- [x] `npx vitest run web/src/auth/capacitor-auth-storage.test.ts` で green を確認.

### Step 6: CapacitorAuthStorage の round-trip

- [x] AC-12: module-scoped な `let storedValue: string | null = null;` を `Preferences.set` mock 内で
      更新し, `Preferences.get` mock が `storedValue` を返す形で実装する.
      `setToken("tkn-rt")` → `getToken()` の順に呼んで返り値が `"tkn-rt"` であることを assert する.
- [x] `npx vitest run web/src/auth/capacitor-auth-storage.test.ts` で green を確認.

### Step 7: 回帰確認 / 最終チェック

- [x] `npx vitest run` をリポジトリルートから実行し, 既存 1666 件 + 新規分すべて green を確認 (AC-13).
- [x] `npm run typecheck` (web ワークスペース) が 0 エラーであることを確認.
- [x] `npm run lint` (web ワークスペース) が 0 エラーであることを確認.

## テスト

- [x] 単体テスト (Step 1〜6 で記述)
- [x] 結合 / E2E テスト (本 feature のスコープ外 / 既存 `app-login-production-path.test.tsx` を活かす)

## ドキュメント

- [x] 関連ドキュメント更新は不要 (テスト追加のみ. API / schema / user ガイドに影響なし).

## 仕上げ

- [x] 受け入れ基準 (spec.md AC-1〜AC-13) を全て満たすことを確認.
- [x] `auditor` にレビュー依頼 (production 無改修 / 既存テスト無改修 / カバレッジ追加の確認).
- [x] PR タイトル例: `test(auth-storage-tests): BL-078 authedFetch / CapacitorAuthStorage の単体テスト追加`.
