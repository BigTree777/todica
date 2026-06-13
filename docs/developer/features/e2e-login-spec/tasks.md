# タスク: E2E (Playwright) に LoginView シナリオを追加

> [`plan.md`](plan.md) を実行可能な単位に分解する. 完了したらチェックを入れる.

## AC ↔ Step マップ

| AC (spec.md) | 対応 Step (本ファイル) | テスト対象 (Playwright) |
| --- | --- | --- |
| AC-1 未認証アクセスで LoginView が表示される | Step 1 + Step 2 | `e2e/login.spec.ts` の test "未認証で / にアクセスすると LoginView が表示される" |
| AC-2 誤ったパスワード → エラー + LoginView 留まる | Step 1 + Step 3 | `e2e/login.spec.ts` の test "誤ったパスワードでログインを試みると role=alert にエラーが表示される" |
| AC-3 正しいパスワード → 今日ビュー遷移 | Step 1 + Step 4 | `e2e/login.spec.ts` の test "正しいパスワードでログインすると今日ビューに遷移する" |
| AC-4 SettingsView ログアウト → LoginView 戻り | Step 1 + Step 5 | `e2e/login.spec.ts` の test "ログアウトすると LoginView に戻り再訪しても今日ビューには到達できない" |
| AC-5 既存 e2e spec が回帰なし | Step 6 | `npx playwright test` 全件 green |

## 実装

### Step 1: 準備 — `E2E_TEST_PASSWORD` import 経路の確認

- [ ] `playwright.config.ts` 末尾の `export { E2E_TEST_PASSWORD, E2E_TEST_PASSWORD_HASH }` が維持されていることを確認する.
- [ ] `e2e/login.spec.ts` から `import { E2E_TEST_PASSWORD } from "../playwright.config";` (または相対パスを Playwright の ts 解決に合わせる) で参照可能であることを確認する.
- [ ] (確認のみ. コード変更は発生しない想定)

### Step 2: AC-1 (未認証 → LoginView)

- [ ] `e2e/login.spec.ts` を新規作成し, ヘッダコメントに「BL-077 / E2E LoginView シナリオ」と本 BL の参照を書く.
- [ ] 最初の test を追加:
  - `await page.goto("/")`
  - `await expect(page.getByRole("heading", { name: "ログイン" })).toBeVisible()`
  - `await expect(page.getByLabel("パスワード")).toBeVisible()`
  - `await expect(page.getByRole("button", { name: "ログイン" })).toBeVisible()`
  - `await expect(page.getByRole("form", { name: "タスク起票フォーム" })).toHaveCount(0)`

### Step 3: AC-2 (誤パスワード → エラー + 留まる)

- [ ] 2 番目の test を追加:
  - `await page.goto("/")`
  - `await page.getByLabel("パスワード").fill("wrong-password")`
  - `await page.getByRole("button", { name: "ログイン" }).click()`
  - `await expect(page.getByRole("alert")).toHaveText("パスワードが正しくありません")`
  - `await expect(page.getByLabel("パスワード")).toHaveAttribute("aria-invalid", "true")`
  - `await expect(page.getByRole("heading", { name: "ログイン" })).toBeVisible()` (LoginView に留まる)

### Step 4: AC-3 (正パスワード → 今日ビュー)

- [ ] 3 番目の test を追加:
  - `await page.goto("/")`
  - `await page.getByLabel("パスワード").fill(E2E_TEST_PASSWORD)`
  - `await page.getByRole("button", { name: "ログイン" }).click()`
  - `await expect(page.getByRole("form", { name: "タスク起票フォーム" })).toBeVisible()`
  - `await expect(page.getByRole("heading", { name: "ログイン" })).toHaveCount(0)`
  - `const token = await page.evaluate(() => localStorage.getItem("todica.auth.token"))` を取り, `expect(token).not.toBeNull()` / `expect((token ?? "").length).toBeGreaterThan(0)`

### Step 5: AC-4 (ログアウト → LoginView 戻り)

- [ ] 4 番目の test を追加:
  - `await page.goto("/")` → AC-3 と同じログイン操作を行いログイン状態を作る
  - `await expect(page.getByRole("form", { name: "タスク起票フォーム" })).toBeVisible()` (ログイン確認)
  - `await page.goto("/settings")`
  - `await page.getByRole("button", { name: "ログアウト" }).click()`
  - `await expect(page.getByRole("heading", { name: "ログイン" })).toBeVisible()`
  - `const token = await page.evaluate(() => localStorage.getItem("todica.auth.token"))` を取り, `expect(token).toBeNull()`
  - `await page.goto("/")` 再訪 → `await expect(page.getByRole("heading", { name: "ログイン" })).toBeVisible()` (今日ビューに直接到達しない)

### Step 6: AC-5 (既存 e2e の回帰なし)

- [ ] `.e2e-data/` を削除し既存 dev server を停止した clean な状態で `npx playwright test` を実行し, 全 spec (既存 25 本 + 新規 1 本) が green であることを確認する.
- [ ] CI と同じ条件 (`CI=1 npx playwright test`) でも green であることを確認する.

## テスト

- [ ] 単体テスト: 追加しない (本 BL のスコープ外).
- [ ] 結合 / E2E テスト:
  - [ ] `npx playwright test e2e/login.spec.ts` が単体で green (Step 2 〜 Step 5 の 4 シナリオ).
  - [ ] `npx playwright test` 全件 green (既存 25 本 + 新規 1 本 = 26 本).

## TDD サイクル (Step ごと)

各 Step は以下のサイクルで実装する.

1. red: 該当する test を追加 → `npx playwright test e2e/login.spec.ts -g "<テスト名>"` で red を確認.
2. green: BL-074 の本体実装が既に揃っているため, 通常は新規実装は不要で red のまま red であれば spec 側の locator / 期待値を修正する (実装側の修正が必要となった場合は本 BL のスコープ外 = BL-074 への差し戻し対象として記録する).
3. refactor: locator / 期待値の整理, コメントの追記, `describe` グルーピングの調整 (必要な場合のみ).

> BL-077 のスコープは「spec の追加」のみのため, 通常の TDD と異なり green 化に本体実装変更を伴わない. red が解消できない場合は spec 側のミスか, BL-074 実装の隠れたバグであり, 後者なら本 BL を一旦止めて BL-074 への差し戻しを管理者に上申する.

## ドキュメント

- [ ] `docs/developer/quality/test-catalog.md` に E2E ファイル一覧セクションが存在するか確認する.
  - 存在する場合: `e2e/login.spec.ts` を追記.
  - 存在しない場合: 追記不要 (BL-077 のスコープでカタログ自体を新設はしない).

## 仕上げ

- [ ] 受け入れ基準 (spec.md の AC-1 〜 AC-5) を全て満たすことを確認.
- [ ] typecheck (`npm run typecheck`) / lint (`npm run lint`) が 0 エラー.
- [ ] `auditor` にレビュー依頼 (spec / plan / tasks / 新規 `e2e/login.spec.ts` / Playwright green 出力をパッケージ).
