/**
 * アクセシビリティ E2E (BL-029 / NFR-010 補強).
 *
 * 主要画面で axe-core が報告する WCAG 2.1 AA 違反が 0 件であることを保証する.
 * 単体テスト (testing-library) は個別コンポーネントの aria 属性を確認するが,
 * 実 DOM 全体で違反が無いかは E2E でしか網羅できない.
 *
 * axe-core は best practice ルールも検出するが, 本テストでは WCAG 2.1 AA に限定する.
 * (best practice は dev チームの優先度判断に委ねる)
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { openCreateForm } from "./helpers/floating-create-button.js";

async function scanWcag(page: Page) {
  return new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
}

test.describe("WCAG 2.1 AA 違反 0 件", () => {
  test("今日ビュー (/today)", async ({ page }) => {
    await page.goto("/today");
    await page.getByRole("heading", { name: "今日" }).waitFor();
    const result = await scanWcag(page);
    expect(result.violations).toEqual([]);
  });

  test("現在のタスクビュー (/focus, BL-037)", async ({ page }) => {
    await page.goto("/focus");
    await page.getByRole("heading", { name: "現在のタスク" }).waitFor();
    const result = await scanWcag(page);
    expect(result.violations).toEqual([]);
  });

  test("明日のタスクビュー (/tomorrow, BL-038)", async ({ page }) => {
    await page.goto("/tomorrow");
    await page.getByRole("heading", { name: "明日のタスク" }).waitFor();
    const result = await scanWcag(page);
    expect(result.violations).toEqual([]);
  });

  test("プロジェクトビュー (/projects)", async ({ page }) => {
    await page.goto("/projects");
    await page.getByRole("heading", { name: "プロジェクト" }).waitFor();
    const result = await scanWcag(page);
    expect(result.violations).toEqual([]);
  });

  test("ゴミ箱ビュー (/trash)", async ({ page }) => {
    await page.goto("/trash");
    await page.getByRole("heading", { name: "ゴミ箱" }).waitFor();
    const result = await scanWcag(page);
    expect(result.violations).toEqual([]);
  });

  test("ルーティンビュー (/routines)", async ({ page }) => {
    await page.goto("/routines");
    await page.getByRole("heading", { name: "ルーティン" }).waitFor();
    const result = await scanWcag(page);
    expect(result.violations).toEqual([]);
  });

  test("設定ビュー (/settings)", async ({ page }) => {
    await page.goto("/settings");
    await page.getByRole("heading", { name: "設定" }).waitFor();
    const result = await scanWcag(page);
    expect(result.violations).toEqual([]);
  });

  /**
   * BL-104 (floating-create-button) 追従:
   *   + ボタンで展開した起票フォームも WCAG 違反 0 件であることを保証する.
   *   axe-core は aria-label / aria-expanded の整合を見るので, REQ-11 /
   *   REQ-12 の retention は本テストで担保される.
   */
  test("今日ビュー (/today) で + ボタンを押して起票フォームを展開した状態", async ({ page }) => {
    await page.goto("/today");
    await page.getByRole("heading", { name: "今日" }).waitFor();
    await openCreateForm(page, "today");
    const result = await scanWcag(page);
    expect(result.violations).toEqual([]);
  });
});
