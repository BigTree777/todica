/**
 * ハンバーガーナビゲーション E2E (BL-049 / hamburger-nav).
 *
 * 受け入れ基準の出典:
 *   docs/developer/features/hamburger-nav/spec.md §「受け入れ基準」AC-1〜AC-9.
 *   docs/developer/features/hamburger-nav/plan.md §「テスト方針」.
 *   docs/developer/features/hamburger-nav/tasks.md §「テスト」(本ファイル作成を明示).
 *
 * 単体テスト (web/__tests__/hamburger-nav.test.tsx) との分担:
 *   - 単体: 状態遷移と ARIA 属性の検証 (jsdom).
 *   - E2E (本ファイル): 実ブラウザでしか測れない受け入れ基準を主体に検証する.
 *     - AC-6: `.app-shell__main` の全幅表示 (computed style / boundingBox の取得).
 *     - AC-8: アクティブリンクの視覚的識別 (active クラス + border-left の存在).
 *     - その他 AC-1〜AC-5 / AC-7 / AC-9 は単体と同じ振る舞いを実ブラウザでも回帰確認する
 *       (実 CSS で menu が viewport 外に隠れる / overlay の click 領域が成立する など,
 *        jsdom では確認できない layout 起因の不具合を検出する).
 *
 * 前提: アプリ本体 (`web/src/ui/app-shell/app-shell.tsx`, `app-shell.css`) は
 * 既に BL-049 の仕様どおりに実装済み. 本テストは「無改修で全件 pass する」状態を
 * 維持するための回帰ガード.
 */
import { type Page, expect, test } from "@playwright/test";

/**
 * ハンバーガーボタンを押してメニュー (`role="dialog"`) を開く. 開いたメニューを返す.
 * 既に開いている場合は呼び出し側の責任で重複 open を回避する.
 */
async function openMenu(page: Page) {
  await page.getByRole("button", { name: "メニューを開く" }).click();
  const menu = page.getByRole("dialog", { name: "ナビゲーションメニュー" });
  await expect(menu).toBeVisible();
  return menu;
}

test.describe("BL-049 ハンバーガーナビゲーション", () => {
  // ----------------------------------------------------------
  // AC-1: 初期表示
  // ----------------------------------------------------------

  /**
   * シナリオ AC-1:
   *   Given /today を開く
   *   Then  ハンバーガーボタン (aria-label="メニューを開く", aria-expanded="false") が見える
   *   And   role="dialog" のメニューは存在しない (= 閉じている)
   */
  test("AC-1: 初期表示でハンバーガーボタンが見え, メニュー dialog は閉じている", async ({
    page,
  }) => {
    await page.goto("/today");

    const hamburger = page.getByRole("button", { name: "メニューを開く" });
    await expect(hamburger).toBeVisible();
    await expect(hamburger).toHaveAttribute("aria-expanded", "false");

    await expect(page.getByRole("dialog", { name: "ナビゲーションメニュー" })).toHaveCount(0);
  });

  // ----------------------------------------------------------
  // AC-2: メニューを開く
  // ----------------------------------------------------------

  /**
   * シナリオ AC-2:
   *   Given /today
   *   When  ハンバーガーボタンを click する
   *   Then  role="dialog" のメニューが表示される
   *   And   ボタンの aria-label が「メニューを閉じる」に変わる
   *   And   ボタンの aria-expanded="true" に変わる
   */
  test("AC-2: ハンバーガー click でメニューが開き aria-expanded=true に切り替わる", async ({
    page,
  }) => {
    await page.goto("/today");

    await openMenu(page);

    const closeButton = page.getByRole("button", { name: "メニューを閉じる" });
    await expect(closeButton).toBeVisible();
    await expect(closeButton).toHaveAttribute("aria-expanded", "true");
  });

  // ----------------------------------------------------------
  // AC-3: リンク選択でメニューが閉じる
  // ----------------------------------------------------------

  /**
   * シナリオ AC-3:
   *   Given /today でメニューが開いている
   *   When  メニュー内「今日のタスク」リンクを click する
   *   Then  /today に居る (= ルーティング維持)
   *   And   dialog が消える
   *   And   aria-expanded="false" に戻る
   */
  test("AC-3: メニュー内のリンクを click するとメニューが閉じる", async ({ page }) => {
    await page.goto("/today");

    const menu = await openMenu(page);
    await menu.getByRole("link", { name: "今日のタスク" }).click();

    await expect(page).toHaveURL(/\/today$/);
    await expect(page.getByRole("dialog", { name: "ナビゲーションメニュー" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "メニューを開く" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  // ----------------------------------------------------------
  // AC-4: オーバーレイ click で閉じる
  // ----------------------------------------------------------

  /**
   * シナリオ AC-4:
   *   Given メニューが開いている
   *   When  オーバーレイ背景 (`.app-shell__overlay`) を click する
   *   Then  dialog が消える
   *   And   ハンバーガーボタンに focus が戻る (REQ-13)
   *
   * 実装上 overlay は inset: 0 で全画面を覆うため Playwright の auto-position click
   * (中心点) が menu パネル (240px 幅) と重なる場合がある. メニューパネルの右側を
   * 明示的に指定して overlay 上の確実な点を click する.
   */
  test("AC-4: オーバーレイ背景の click でメニューが閉じる", async ({ page }) => {
    await page.goto("/today");
    await openMenu(page);

    // viewport の右端寄り (overlay は inset: 0 / menu は 240px 幅左寄せ).
    const viewport = page.viewportSize();
    const x = viewport ? viewport.width - 10 : 600;
    const y = viewport ? Math.floor(viewport.height / 2) : 300;
    await page.locator(".app-shell__overlay").click({ position: { x: x - 240, y: y } });

    await expect(page.getByRole("dialog", { name: "ナビゲーションメニュー" })).toHaveCount(0);
    // ハンバーガーボタンに focus が戻る (REQ-13).
    await expect(page.getByRole("button", { name: "メニューを開く" })).toBeFocused();
  });

  // ----------------------------------------------------------
  // AC-5: Escape キーで閉じる
  // ----------------------------------------------------------

  /**
   * シナリオ AC-5:
   *   Given メニューが開いている
   *   When  Escape を押す
   *   Then  dialog が消える
   *   And   ハンバーガーボタンに focus が戻る (REQ-13)
   */
  test("AC-5: Escape でメニューが閉じる", async ({ page }) => {
    await page.goto("/today");
    await openMenu(page);

    await page.keyboard.press("Escape");

    await expect(page.getByRole("dialog", { name: "ナビゲーションメニュー" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "メニューを開く" })).toBeFocused();
  });

  // ----------------------------------------------------------
  // AC-6: メイン領域の全幅表示
  // ----------------------------------------------------------

  /**
   * シナリオ AC-6:
   *   Given /today (メニュー閉)
   *   When  .app-shell__main の boundingBox を測る
   *   Then  幅が viewport 全幅と等しい (= 固定サイドバーが領域を圧迫していない)
   *
   * 注: AppShell は <div class="app-shell" display:flex> 配下に <div class="app-shell__main">
   *     を置く. menu パネルは position: fixed なので flex フローには影響しない →
   *     main は親 (app-shell) の全幅を占有するはず.
   */
  test("AC-6: .app-shell__main がページの全幅を占める (メニュー閉)", async ({ page }) => {
    await page.goto("/today");
    // ヘッダ描画完了を待つ.
    await expect(page.getByRole("heading", { name: "今日" })).toBeVisible();

    const main = page.locator(".app-shell__main");
    await expect(main).toBeVisible();

    // AC-6 の意図 = 「サイドバーが main の幅を圧迫していない」.
    // → `.app-shell__main` の幅が, その親 `.app-shell` の幅と等しいかを比較する
    //   (旧仕様では `.app-shell__sidebar` (~200px) が flex の左側を占有していた).
    //
    // viewport.width / documentElement.clientWidth と直接比較しないのは,
    // body の default margin 8px や縦スクロールバーで誤差が出るため (test 環境依存).
    const shell = page.locator(".app-shell");
    const shellBox = await shell.boundingBox();
    const mainBox = await main.boundingBox();
    expect(shellBox).not.toBeNull();
    expect(mainBox).not.toBeNull();

    // main の幅が親 .app-shell と同じ (= flex の左を取るサイドバーが存在しない).
    expect(mainBox?.width).toBe(shellBox?.width);
    // main の左端が .app-shell の左端と一致する (サイドバー分のオフセットが無い).
    expect(mainBox?.x).toBe(shellBox?.x);

    // 念のため: 旧サイドバーセレクタ .app-shell__sidebar は DOM に存在しない.
    await expect(page.locator(".app-shell__sidebar")).toHaveCount(0);
  });

  // ----------------------------------------------------------
  // AC-7: メニュー項目の構成
  // ----------------------------------------------------------

  /**
   * シナリオ AC-7:
   *   Given /today
   *   When  メニューを開く
   *   Then  プライマリ 3 (現在のタスク/今日のタスク/明日のタスク)
   *         + 区切り
   *         + セカンダリ 4 (プロジェクト/ルーティン/ゴミ箱/設定)
   *         = 計 7 リンクが期待順で並ぶ
   */
  test("AC-7: メニュー内に 7 リンク (プライマリ 3 / セカンダリ 4) が期待順に並ぶ", async ({
    page,
  }) => {
    await page.goto("/today");
    const menu = await openMenu(page);

    const linkTexts = await menu.getByRole("link").allTextContents();
    const normalized = linkTexts.map((t) => t.trim());

    expect(normalized).toEqual([
      "現在のタスク",
      "今日のタスク",
      "明日のタスク",
      "プロジェクト",
      "ルーティン",
      "ゴミ箱",
      "設定",
    ]);
  });

  // ----------------------------------------------------------
  // AC-8: アクティブリンクの視覚的識別
  // ----------------------------------------------------------

  /**
   * シナリオ AC-8:
   *   Given /today
   *   When  メニューを開く
   *   Then  「今日のタスク」リンクに aria-current="page" が付与されている
   *   And   "active" クラスを持ち, font-weight: 700 (太字) が computed で取れる
   *         (= app-shell.css の `.app-shell__nav-link.active { font-weight: bold; }`)
   *
   * 他のリンク (例「現在のタスク」) は active クラスを持たず, font-weight も bold ではない
   * (= 「今日のタスク」だけが視覚的に強調されている).
   */
  test("AC-8: /today では「今日のタスク」リンクが active スタイルで強調される", async ({
    page,
  }) => {
    await page.goto("/today");
    const menu = await openMenu(page);

    const todayLink = menu.getByRole("link", { name: "今日のタスク" });
    await expect(todayLink).toHaveAttribute("aria-current", "page");
    await expect(todayLink).toHaveClass(/(^|\s)active(\s|$)/);

    // computed font-weight が "bold" 相当 (700 以上) になっている.
    const todayFontWeight = await todayLink.evaluate(
      (el) => window.getComputedStyle(el).fontWeight,
    );
    // CSS の "bold" は computed では "700" になる.
    expect(Number(todayFontWeight)).toBeGreaterThanOrEqual(700);

    // 他のリンクは active クラスを持たない.
    const focusLink = menu.getByRole("link", { name: "現在のタスク" });
    await expect(focusLink).not.toHaveClass(/(^|\s)active(\s|$)/);
    const focusFontWeight = await focusLink.evaluate(
      (el) => window.getComputedStyle(el).fontWeight,
    );
    expect(Number(focusFontWeight)).toBeLessThan(700);
  });

  // ----------------------------------------------------------
  // AC-9: アクセシビリティ属性
  // ----------------------------------------------------------

  /**
   * シナリオ AC-9:
   *   Given メニューが開いている
   *   Then  メニューパネルに role="dialog" が付与されている
   *   And   aria-modal="true" が付与されている
   *   And   aria-label="ナビゲーションメニュー" が付与されている
   */
  test("AC-9: メニュー open 時に role=dialog / aria-modal=true / aria-label が付与される", async ({
    page,
  }) => {
    await page.goto("/today");
    await openMenu(page);

    const menu = page.getByRole("dialog", { name: "ナビゲーションメニュー" });
    await expect(menu).toHaveAttribute("aria-modal", "true");
    await expect(menu).toHaveAttribute("aria-label", "ナビゲーションメニュー");
  });
});
