/**
 * 左サイドバー + 3 ビュー切替 E2E (BL-036 / ui-sidebar-nav).
 *
 * 受け入れ基準の出典:
 *   - docs/developer/features/ui-sidebar-nav/spec.md §「受け入れ基準」
 *     - 「プライマリ 3 リンクの遷移 (REQ-2 / REQ-4 / REQ-5)」
 *     - 「セカンダリ 4 リンクの遷移 (REQ-3 / REQ-4)」
 *     - 「アクティブリンクのハイライト (REQ-6)」
 *     - 「ルート構造の不変条件 (REQ-4)」 (`/setup` AppShell 外)
 *
 * 関連 plan: docs/developer/features/ui-sidebar-nav/plan.md §「E2E (Playwright)」
 *
 * テスト方針:
 *   - 既存の `/today` 起動 → 実ブラウザでサイドバーのリンクをクリック → URL と
 *     メイン領域の見出しが切り替わることを確認する.
 *   - `/setup` 直接アクセス時はサイドバー自体が DOM に存在しないことを確認する
 *     (D-002 `/setup` は AppShell の外).
 *
 * 本ファイルは TDD の "red" を作るための E2E.
 *   - 現状の `main.tsx` には AppShell も `/focus` `/tomorrow` ルートも無いため,
 *     リンクや見出しが見つからずタイムアウトで失敗する.
 *   - implementer が AppShell と placeholder を実装することで green 化する.
 */
import { type Page, expect, test } from "@playwright/test";

/**
 * サイドバーランドマーク (`<nav aria-label="サイドバーナビゲーション">`) を返す.
 * AppShell の REQ-1 で導入される landmark.
 */
function sidebar(page: Page) {
  return page.getByRole("navigation", { name: "サイドバーナビゲーション" });
}

test.describe("サイドバーから 3 プライマリルートに遷移できる (REQ-2 / REQ-4 / REQ-5)", () => {
  /**
   * シナリオ: サイドバーの「現在のタスク」リンクから /focus に遷移する
   *   Given AppShell が表示されている (現在 URL は /today)
   *   When  サイドバーの「現在のタスク」リンクをクリックする
   *   Then  URL が /focus に変わる
   *   And   メイン領域に focus-view placeholder の見出し「現在のタスク」が表示される
   */
  test("「現在のタスク」リンクで /focus に遷移し見出しが表示される", async ({ page }) => {
    await page.goto("/today");

    await sidebar(page).getByRole("link", { name: "現在のタスク" }).click();

    await expect(page).toHaveURL(/\/focus$/);
    await expect(page.getByRole("heading", { name: "現在のタスク" })).toBeVisible();
  });

  /**
   * シナリオ: サイドバーの「今日のタスク」リンクから /today に遷移する
   *   Given AppShell が表示されている (現在 URL は /focus)
   *   When  サイドバーの「今日のタスク」リンクをクリックする
   *   Then  URL が /today に変わる
   *   And   メイン領域に既存の TodayView (見出し「今日」) が表示される
   */
  test("「今日のタスク」リンクで /today に遷移し見出し「今日」が表示される", async ({ page }) => {
    await page.goto("/focus");

    await sidebar(page).getByRole("link", { name: "今日のタスク" }).click();

    await expect(page).toHaveURL(/\/today$/);
    await expect(page.getByRole("heading", { name: "今日" })).toBeVisible();
  });

  /**
   * シナリオ: サイドバーの「明日のタスク」リンクから /tomorrow に遷移する
   *   Given AppShell が表示されている (現在 URL は /today)
   *   When  サイドバーの「明日のタスク」リンクをクリックする
   *   Then  URL が /tomorrow に変わる
   *   And   メイン領域に tomorrow-view placeholder の見出し「明日のタスク」が表示される
   */
  test("「明日のタスク」リンクで /tomorrow に遷移し見出しが表示される", async ({ page }) => {
    await page.goto("/today");

    await sidebar(page).getByRole("link", { name: "明日のタスク" }).click();

    await expect(page).toHaveURL(/\/tomorrow$/);
    await expect(page.getByRole("heading", { name: "明日のタスク" })).toBeVisible();
  });
});

test.describe("サイドバーから補助メニュー 4 view に遷移できる (REQ-3 / REQ-4)", () => {
  /**
   * シナリオ: サイドバーのセカンダリリンクから既存 4 view に遷移できる
   *   Given AppShell が表示されている
   *   When  サイドバーの「プロジェクト」リンクをクリックする
   *   Then  URL が /projects に変わり ProjectsView の見出しが表示される
   */
  test("「プロジェクト」リンクで /projects に遷移する", async ({ page }) => {
    await page.goto("/today");

    await sidebar(page).getByRole("link", { name: "プロジェクト" }).click();

    await expect(page).toHaveURL(/\/projects$/);
    await expect(page.getByRole("heading", { name: "プロジェクト" })).toBeVisible();
  });

  /**
   * シナリオ: 「ルーティン」リンクで /routines に遷移する
   */
  test("「ルーティン」リンクで /routines に遷移する", async ({ page }) => {
    await page.goto("/today");

    await sidebar(page).getByRole("link", { name: "ルーティン" }).click();

    await expect(page).toHaveURL(/\/routines$/);
    await expect(page.getByRole("heading", { name: "ルーティン" })).toBeVisible();
  });

  /**
   * シナリオ: 「ゴミ箱」リンクで /trash に遷移する
   */
  test("「ゴミ箱」リンクで /trash に遷移する", async ({ page }) => {
    await page.goto("/today");

    await sidebar(page).getByRole("link", { name: "ゴミ箱" }).click();

    await expect(page).toHaveURL(/\/trash$/);
    await expect(page.getByRole("heading", { name: "ゴミ箱" })).toBeVisible();
  });

  /**
   * シナリオ: 「設定」リンクで /settings に遷移する
   */
  test("「設定」リンクで /settings に遷移する", async ({ page }) => {
    await page.goto("/today");

    await sidebar(page).getByRole("link", { name: "設定" }).click();

    await expect(page).toHaveURL(/\/settings$/);
    await expect(page.getByRole("heading", { name: "設定" })).toBeVisible();
  });
});

test.describe("アクティブリンクのハイライト (REQ-6)", () => {
  /**
   * シナリオ: 現在いるルートのリンクがアクティブ表示になる
   *   Given AppShell が表示されており URL が /today である
   *   When  サイドバーを目視する
   *   Then  「今日のタスク」リンクに aria-current="page" が付与されている
   *   And   他のリンクは aria-current を持たない
   *
   * 注: React Router v6 の <NavLink> はアクティブ時にデフォルトで aria-current="page" を付ける.
   */
  test('/today で「今日のタスク」リンクが aria-current="page" を持つ', async ({ page }) => {
    await page.goto("/today");

    const todayLink = sidebar(page).getByRole("link", { name: "今日のタスク" });
    await expect(todayLink).toHaveAttribute("aria-current", "page");

    // 他のプライマリリンクは aria-current を持たない
    const focusLink = sidebar(page).getByRole("link", { name: "現在のタスク" });
    const tomorrowLink = sidebar(page).getByRole("link", { name: "明日のタスク" });
    await expect(focusLink).not.toHaveAttribute("aria-current", "page");
    await expect(tomorrowLink).not.toHaveAttribute("aria-current", "page");
  });

  /**
   * シナリオ: ルート遷移時にアクティブリンクが追従する
   *   Given AppShell の URL が /today で「今日のタスク」がアクティブである
   *   When  「現在のタスク」リンクをクリックして /focus に遷移する
   *   Then  「現在のタスク」リンクが aria-current="page" を持つ
   *   And   「今日のタスク」リンクから aria-current 属性が外れる
   */
  test("リンクをクリックしてアクティブが追従する", async ({ page }) => {
    await page.goto("/today");

    // 起点: /today で「今日のタスク」がアクティブ
    await expect(sidebar(page).getByRole("link", { name: "今日のタスク" })).toHaveAttribute(
      "aria-current",
      "page",
    );

    // 「現在のタスク」へ遷移
    await sidebar(page).getByRole("link", { name: "現在のタスク" }).click();
    await expect(page).toHaveURL(/\/focus$/);

    // 「現在のタスク」がアクティブになり, 「今日のタスク」のアクティブは外れる
    await expect(sidebar(page).getByRole("link", { name: "現在のタスク" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(sidebar(page).getByRole("link", { name: "今日のタスク" })).not.toHaveAttribute(
      "aria-current",
      "page",
    );
  });
});

test.describe("/setup では AppShell が表示されない (REQ-4 / D-002)", () => {
  /**
   * シナリオ: /setup は AppShell の外に残る (サイドバー非表示)
   *   Given Web クライアントを `/setup` で起動する
   *   When  画面の描画が完了する
   *   Then  既存の SetupView (見出し「サーバ接続設定」) が表示される
   *   And   画面にサイドバー (aria-label="サイドバーナビゲーション") は存在しない
   *
   * /setup は Android 初回起動時のオンボーディング画面で, サイドバーから到達する
   * 性質のものではないため AppShell の外に残す (plan.md D-002).
   */
  test("/setup 直接アクセス時はサイドバーが描画されない", async ({ page }) => {
    await page.goto("/setup");

    // SetupView の見出しが表示される (既存 BL-019 の見出し: 「サーバ接続設定」)
    await expect(page.getByRole("heading", { name: "サーバ接続設定" })).toBeVisible();

    // サイドバーランドマーク (`<nav aria-label="サイドバーナビゲーション">`) は存在しない
    await expect(sidebar(page)).toHaveCount(0);
  });
});
