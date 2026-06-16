/**
 * LoginView E2E (e2e-login-spec).
 *
 * 仕様参照:
 *   - docs/developer/features/e2e-login-spec/spec.md (AC-1 / AC-2 / AC-3 / AC-4)
 *   - docs/developer/features/e2e-login-spec/plan.md (D-1 〜 D-9, Step 1 〜 6)
 *
 * 検証範囲:
 *   アプリ内パスワードログイン経路を Playwright で実機検証する:
 *     LoginView → /api/v1/login → 今日ビュー → SettingsView ログアウト → LoginView 戻り
 *   の往復を, 実ブラウザ経由で 1 spec にまとめて回帰防止する.
 *
 * 設計原則 (plan.md):
 *   - D-2: locator は `getByRole` / `getByLabel` 優先. CSS class には依存しない.
 *   - D-3: `E2E_TEST_PASSWORD` は `playwright.config.ts` の re-export を import. 直書きしない.
 *   - D-4: 各 test は独立 reproducible. `test.describe.serial()` は使わない.
 *           AC-4 (ログアウト) は AC-3 と同じログイン手順を test 内で繰り返してから検証.
 *   - D-5: 401 判定は UI の `role="alert"` で行う. `waitForResponse` は使わない.
 *   - D-6: ログアウト後の遷移先は `page.goto("/")` 再実行で確定させる.
 *   - D-7: localStorage キーは `web/src/auth/auth-storage.ts` の `STORAGE_KEY` ("todica.auth.token") を踏襲.
 *   - D-8: `/settings` は `page.goto("/settings")` で直接遷移する (ハンバーガー経由ではない).
 *
 * 注意:
 *   `playwright.config.ts` 末尾で `export { E2E_TEST_PASSWORD, E2E_TEST_PASSWORD_HASH }` 済み.
 *   ここを変更したら本 spec の import も同時に更新する.
 */
import { expect, test } from "@playwright/test";
import { E2E_TEST_PASSWORD } from "../playwright.config";

/** auth-storage が `localStorage` に保存するキー. `web/src/auth/auth-storage.ts` の `STORAGE_KEY` と揃える. */
const AUTH_TOKEN_STORAGE_KEY = "todica.auth.token";

// global-setup で発行された storageState を本 spec では使わず, 全テストを未認証から開始する.
// LoginView の往復は「未認証 → ログイン → 認証済」を直接検証するため, storageState で
// 持ち回す token を破棄して independent reproducible flow を確保する.
test.use({ storageState: { cookies: [], origins: [] } });

test.describe("LoginView 往復シナリオ", () => {
  // D-4: 各 test を独立 reproducible にするため, 開始時点で必ず未認証状態にする.
  // localStorage の token と cookie をクリアして各 test を未認証状態から開始する.
  test.beforeEach(async ({ page, context }) => {
    await context.clearCookies();
    // localStorage は origin スコープなので, baseURL を一度開いてからクリアする.
    await page.goto("/");
    await page.evaluate(() => {
      localStorage.clear();
    });
  });

  test("AC-1: 未認証で / にアクセスすると LoginView が表示される", async ({ page }) => {
    // Given: localStorage に token が無い (beforeEach でクリア済み).
    // When: ルートへアクセス.
    await page.goto("/");

    // Then: LoginView の主要要素が見える.
    await expect(page.getByRole("heading", { name: "ログイン" })).toBeVisible();
    await expect(page.getByLabel("パスワード")).toBeVisible();
    await expect(page.getByRole("button", { name: "ログイン" })).toBeVisible();

    // And: 今日ビューの起票フォームは表示されない (= ログイン前は本体ビューに到達していない).
    await expect(page.getByRole("form", { name: "タスク起票フォーム" })).toHaveCount(0);
  });

  test("AC-2: 誤ったパスワードでログインを試みると role=alert にエラーが表示される", async ({
    page,
  }) => {
    // Given: 未認証で LoginView を開いた状態 (beforeEach + goto).
    await page.goto("/");

    // When: パスワードに `E2E_TEST_PASSWORD` 以外の値を入れて submit.
    await page.getByLabel("パスワード").fill("wrong-password");
    await page.getByRole("button", { name: "ログイン" }).click();

    // Then: role="alert" 要素に「パスワードが正しくありません」が表示される.
    //   D-5: 401 判定は UI のエラーメッセージで確認する.
    await expect(page.getByRole("alert")).toHaveText("パスワードが正しくありません");

    // And: LoginView 既存仕様で input に `aria-invalid="true"` が付く.
    await expect(page.getByLabel("パスワード")).toHaveAttribute("aria-invalid", "true");

    // And: LoginView に留まり, 今日ビューには遷移していない.
    await expect(page.getByRole("heading", { name: "ログイン" })).toBeVisible();
    await expect(page.getByRole("form", { name: "タスク起票フォーム" })).toHaveCount(0);
  });

  test("AC-3: 正しいパスワードでログインすると今日ビューに遷移する", async ({ page }) => {
    // Given: 未認証で LoginView を開いた状態.
    await page.goto("/");

    // When: 正しいパスワード (`E2E_TEST_PASSWORD`) を入れて submit.
    await page.getByLabel("パスワード").fill(E2E_TEST_PASSWORD);
    await page.getByRole("button", { name: "ログイン" }).click();

    // Then: 今日ビューに遷移し <h1>今日</h1> が描画される.
    // 起票フォームは + ボタン展開式 (floating-create-button) のため初期非表示.
    // 今日ビュー到達の sentinel は h1「今日」と + ボタン「タスクを追加」とする.
    await expect(page.getByRole("heading", { name: "今日", level: 1 })).toBeVisible();
    await expect(page.getByRole("button", { name: "タスクを追加" })).toBeVisible();

    // And: LoginView は表示されていない.
    await expect(page.getByRole("heading", { name: "ログイン" })).toHaveCount(0);

    // And: localStorage に token が保存されている.
    //   D-7: キー名は auth-storage.ts の STORAGE_KEY を固定値として参照する.
    const token = await page.evaluate((key) => localStorage.getItem(key), AUTH_TOKEN_STORAGE_KEY);
    expect(token).not.toBeNull();
    expect((token ?? "").length).toBeGreaterThan(0);
  });

  test("AC-4: ログアウトすると LoginView に戻り再訪しても今日ビューには到達できない", async ({
    page,
  }) => {
    // Given: AC-3 と同じ手順でログイン済み状態を作る (D-4: 独立した reproducible flow).
    await page.goto("/");
    await page.getByLabel("パスワード").fill(E2E_TEST_PASSWORD);
    await page.getByRole("button", { name: "ログイン" }).click();
    // 今日ビュー到達 sentinel は h1「今日」 (起票フォームは + 展開式のため初期非表示).
    await expect(page.getByRole("heading", { name: "今日", level: 1 })).toBeVisible();

    // When: 設定ビューへ直接遷移 (D-8: ハンバーガー経由ではなく goto で固定) し,
    //   ログアウトボタンを押す.
    await page.goto("/settings");
    await page.getByRole("button", { name: "ログアウト" }).click();

    // Then: LoginView に戻る.
    await expect(page.getByRole("heading", { name: "ログイン" })).toBeVisible();

    // And: localStorage の token は消えている.
    const tokenAfterLogout = await page.evaluate(
      (key) => localStorage.getItem(key),
      AUTH_TOKEN_STORAGE_KEY,
    );
    expect(tokenAfterLogout).toBeNull();

    // And: 再度 `/` を開いても本体ビュー (起票フォーム) には到達せず, LoginView に留まる.
    //   D-6: ログアウト後の遷移先確定は `page.goto("/")` の再実行で行う.
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "ログイン" })).toBeVisible();
    await expect(page.getByRole("form", { name: "タスク起票フォーム" })).toHaveCount(0);
  });
});
