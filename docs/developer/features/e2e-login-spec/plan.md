# 設計・実装計画: E2E (Playwright) に LoginView シナリオを追加

> [`spec.md`](spec.md) の要件を, どう実現するかに落とす.

## 方針概要

新規 `e2e/login.spec.ts` を 1 ファイル追加し, Playwright で BL-074 の往復シナリオ (AC-1 / AC-2 / AC-3 / AC-5) を実ブラウザ経由で検証する. `playwright.config.ts` の `webServer` 設定 (`APP_PASSWORD_HASH` を渡す) は BL-074 で更新済みのため流用し, server / web の本体コードは無改修. 既存 `e2e/smoke.spec.ts` および `e2e/today-view-create-form.spec.ts` の構成 (`role` / `aria-label` 中心の locator, `expect(...).toBeVisible()` 中心の assertion) をそのまま踏襲する.

## 影響範囲

| 領域 | 変更内容 |
| --- | --- |
| API | 変更なし (`/api/v1/login` / `/logout` は BL-074 で既に実装済み) |
| DB | 変更なし (`.e2e-data/e2e.db` を `playwright.config.ts` が既に毎回初期化) |
| モジュール | 変更なし (server / web の本体 TS は触らない) |
| UI | 変更なし (`LoginView` / `SettingsView` の DOM 構造は BL-074 のまま) |
| テスト | `e2e/login.spec.ts` 新規 1 ファイル. 必要に応じ `playwright.config.ts` の `E2E_TEST_PASSWORD` re-export 経路を確認 (既に re-export 済みなので原則無改修) |

## 設計詳細

### シナリオ別 Playwright 操作

各シナリオは `await page.goto("/")` から開始し, ブラウザコンテキストは Playwright のデフォルト fixture に任せる (`{ page }`). cookie / localStorage はテストごとに分離される.

| シナリオ | 主要操作 |
| --- | --- |
| AC-1 (未認証 → LoginView) | `await page.goto("/")` / `await expect(page.getByRole("heading", { name: "ログイン" })).toBeVisible()` / `await expect(page.getByLabel("パスワード")).toBeVisible()` / `await expect(page.getByRole("form", { name: "タスク起票フォーム" })).toHaveCount(0)` |
| AC-2 (誤パスワード) | `await page.goto("/")` / `await page.getByLabel("パスワード").fill("wrong-password")` / `await page.getByRole("button", { name: "ログイン" }).click()` / `await expect(page.getByRole("alert")).toHaveText("パスワードが正しくありません")` / `await expect(page.getByLabel("パスワード")).toHaveAttribute("aria-invalid", "true")` |
| AC-3 (正パスワード) | `await page.goto("/")` / `await page.getByLabel("パスワード").fill(E2E_TEST_PASSWORD)` / `await page.getByRole("button", { name: "ログイン" }).click()` / `await expect(page.getByRole("form", { name: "タスク起票フォーム" })).toBeVisible()` / `await expect(page.evaluate(() => localStorage.getItem("todica.auth.token")))` が non-empty |
| AC-4 (ログアウト) | AC-3 と同じ手順でログイン → ハンバーガーから `/settings` 遷移 → `await page.getByRole("button", { name: "ログアウト" }).click()` / `await expect(page.getByRole("heading", { name: "ログイン" })).toBeVisible()` / `await page.goto("/")` 再訪後も `LoginView` のまま |

### 401 判定の方針 (D-5 参照)

`POST /api/v1/login` のレスポンスを Playwright の `page.waitForResponse()` で監視する案も存在するが, 本 spec では採用しない. 理由は (a) `LoginView` がエラーメッセージを `role="alert"` で UI に明示するため UI 観点で十分検証可能, (b) BL-074 の `LoginView` 単体テスト (vitest) で fetch レスポンスのモック検証が完了済み. E2E では「ユーザが目視で 401 を知る経路」を守る方が責務にあっている.

### `E2E_TEST_PASSWORD` の取得経路 (D-3 参照)

`playwright.config.ts` の末尾に `export { E2E_TEST_PASSWORD, E2E_TEST_PASSWORD_HASH };` が存在する. spec 側は `import { E2E_TEST_PASSWORD } from "../playwright.config.js";` または `import { E2E_TEST_PASSWORD } from "../playwright.config";` (Playwright の ts 解決に従う) で参照する. `process.env` 経由にはしない (BL-074 で env 受け渡し方針を取らず, リテラル re-export を採用済み).

## 重要な決定

- D-1: spec ファイルは 1 つに集約し, `e2e/login.spec.ts` 内に 4 シナリオを並べる. `e2e/login/` のような subdirectory は切らない (既存 `e2e/` は flat 構造).
- D-2: locator は `page.getByRole()` / `page.getByLabel()` を優先する. `page.locator(".class")` は CSS 変更で壊れやすいため避ける. 既存 `smoke.spec.ts` / `today-view-create-form.spec.ts` の方針と一致.
- D-3: `E2E_TEST_PASSWORD` は `playwright.config.ts` の re-export を import する. 直書きは禁止 (BL-074 でテスト fixture 化された定数を再利用する).
- D-4: 各 `test()` は独立に reproducible にする. AC-4 (ログアウト後の LoginView 戻り) は AC-3 (ログイン) と同じ手順を spec 先頭で繰り返してから検証する. `test.describe.serial()` で前段の状態を引き継がない.
- D-5: 401 判定は UI のエラーメッセージ (`role="alert"`) で行う. `page.waitForResponse()` でのネットワーク監視は使わない.
- D-6: ログアウト後の遷移先 (`LoginView` 戻り) は `await page.goto("/")` を再実行して再描画させる. SPA 内ルーティングの自動遷移挙動は `main.tsx` のレンダリング分岐に任せ, 不確実な暗黙遷移を待たない.
- D-7: AC-3 で `localStorage.getItem("todica.auth.token")` を `page.evaluate()` で読む. キー名は `web/src/auth/auth-storage.ts` の `STORAGE_KEY = "todica.auth.token"` に揃える. キーが変わったら spec も更新する必要がある (= 仕様の一部として固定する).
- D-8: AC-4 で `/settings` への遷移は `await page.goto("/settings")` を採用する. ハンバーガーメニュー経由のクリック動線は `hamburger-nav.spec.ts` 等で別途検証されており, 本 spec の関心事ではない.
- D-9: 段階分割は 1 commit とする. spec 4 シナリオは責務的に密接 (LoginView の入出力) で, 分割するメリットが薄い.
- 大きいものは ADR 化 → 現時点で必要な ADR 起票は無し.

## リスク / 代替案

- リスク R-1: `webServer.reuseExistingServer` が CI 以外で true のため, 既に server が走っていると `APP_PASSWORD_HASH` が反映されない可能性. 対策: 本 spec は新規追加なので影響は限定的だが, 「ローカルで失敗したら `.e2e-data/` を削除 + 既存 dev server を停止して再実行する」旨を tasks.md に手順として記載しておく.
- リスク R-2: `page.goto("/")` 直後の `LoginView` 表示は `main.tsx` の `useEffect` / `auth-storage` 読み出しに依存し, 初期描画で一瞬今日ビュー側の DOM が混在する可能性 (= レース). 対策: assertion を `await expect(...).toBeVisible()` で待機させ, レンダリングの収束を Playwright の auto-waiting に委ねる. flakey が観測されたら fixture で `await page.waitForLoadState("networkidle")` を追加する.
- 代替案 A-1 (採用しない): 4 シナリオを `test.describe.serial()` で連結し AC-4 で AC-3 の state を継承する案. 採用しない理由は flakey 発生時のデバッグコストが上がるため. 各 test を独立にした方が再現性が高い.
- 代替案 A-2 (採用しない): server を直接叩いて token を発行 → localStorage に注入 → 今日ビューから始める案. UI 経路の検証範囲が縮むため非採用 (BL-077 のゴールは「LoginView 自体の往復」).

## 変更ファイル表

| ファイル | 種別 | 内容 |
| --- | --- | --- |
| `e2e/login.spec.ts` | 新規 | 4 シナリオ (AC-1 〜 AC-4) を含む Playwright spec |
| `playwright.config.ts` | 変更なし (確認のみ) | `E2E_TEST_PASSWORD` の re-export が維持されていることを確認 |

## 既存資産の流用

- `e2e/smoke.spec.ts`: テスト本体の骨格 (`import { expect, test } from "@playwright/test"` / `await page.goto("/")` / `page.getByLabel(...)` / `page.getByRole("button", { name: ... })`).
- `e2e/today-view-create-form.spec.ts`: `test.describe()` でグルーピングしつつ複数 scenario を 1 spec にまとめる構成, および「起票フォーム = `role="form"` name "タスク起票フォーム"」の locator 規約.
- `e2e/settings.spec.ts`: `/settings` への直接遷移パターン (`await page.goto("/settings")`).
- `playwright.config.ts`: `E2E_TEST_PASSWORD` / `E2E_TEST_PASSWORD_HASH` の re-export, および `webServer` の env 設定.
- `web/src/auth/auth-storage.ts`: `STORAGE_KEY = "todica.auth.token"` (localStorage 検証のキー名).
- `web/src/ui/login-view/login-view.tsx`: 「ログイン」見出し / 「パスワード」label / 「ログイン」 button / `role="alert"` エラー / `aria-invalid` の DOM 仕様.
- `web/src/ui/settings-view/settings-view.tsx`: 「ログアウト」 button の locator.

## スコープ境界

- 触る: `e2e/login.spec.ts` 新規追加.
- 触らない: server (`/api/v1/login` / `/logout` の実装) / web (`LoginView` / `SettingsView` / `main.tsx` / `auth-storage`) / 既存 e2e spec (25 本) / vitest 系テスト / `playwright.config.ts` の本体ロジック (re-export 確認のみ).
- 触らない (BL-077 範囲外): AC-4 期限切れ / AC-6 Android 2 ステップ / AC-7 旧 AUTH_TOKEN. これらは vitest および server integration テストでカバー済み.

## テスト方針

> 全体方針は [`../../quality/test-catalog.md`](../../quality/test-catalog.md).

- 本 BL では Playwright (E2E) のみで検証する. vitest 系のテストは追加・変更しない.
- 検証コマンド: `npx playwright test e2e/login.spec.ts` で単体検証 → `npx playwright test` で全 e2e 回帰確認.
- `auditor` への提示物: 新規 spec ファイル + 上記コマンドの green 結果 (Playwright のサマリ).
- 既存 e2e の green 状態 (25 本) の維持を回帰確認に含める.

## 未決事項 / 確認待ち

- なし
