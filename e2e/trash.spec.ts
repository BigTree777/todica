/**
 * ゴミ箱 E2E スモーク (BL-026 / BL-011).
 *
 * 検証する happy path:
 *   1. ゴミ箱から復元: タスクを削除 → /trash で「復元」 → /today に戻る
 *   2. ゴミ箱を空にする: タスクを削除 → /trash で「ゴミ箱を空にする」 → 「ゴミ箱は空です」
 */
import { expect, type Page, test } from "@playwright/test";
import { openCreateForm } from "./helpers/floating-create-button.js";

function taskRow(page: Page, taskName: string) {
  // BL-057: タスクカードが 3 段ゾーン化されたため ancestor::li で <li> を取得.
  // BL-070 (inline-edit-all-cards) 追従: タスク名は <input aria-label="{name} の名前">.
  return page.getByLabel(`${taskName} の名前`).first().locator("xpath=ancestor::li");
}

async function createAndDelete(page: Page, taskName: string): Promise<void> {
  await page.goto("/today");
  await openCreateForm(page, "today");
  await page.getByLabel("タスク名").fill(taskName);
  await page.getByRole("button", { name: "追加", exact: true }).click();
  await taskRow(page, taskName).getByRole("button", { name: "削除" }).click();
  // BL-070 追従: タスク名は input value に入る. aria-label でカウントを確認.
  await expect(page.getByLabel(`${taskName} の名前`)).toHaveCount(0);
}

test.describe("ゴミ箱", () => {
  test("ゴミ箱からタスクを復元すると今日ビューに戻る", async ({ page }) => {
    const taskName = `復元テスト ${Date.now()}`;
    await createAndDelete(page, taskName);

    await page.goto("/trash");
    const trashedRow = page
      .getByRole("list", { name: "ゴミ箱のタスク一覧" })
      .getByRole("listitem")
      .filter({ hasText: taskName });
    await expect(trashedRow).toBeVisible();
    await trashedRow.getByRole("button", { name: "復元" }).click();
    await expect(trashedRow).toHaveCount(0);

    await page.goto("/today");
    await expect(taskRow(page, taskName)).toBeVisible();
  });

  test("ゴミ箱を空にすると一覧が空になる", async ({ page }) => {
    const taskName = `空にするテスト ${Date.now()}`;
    await createAndDelete(page, taskName);

    await page.goto("/trash");
    await expect(
      page
        .getByRole("list", { name: "ゴミ箱のタスク一覧" })
        .getByRole("listitem")
        .filter({ hasText: taskName }),
    ).toBeVisible();

    await page.getByRole("button", { name: "ゴミ箱を空にする" }).click();

    await expect(page.getByText("ゴミ箱は空です")).toBeVisible();
  });
});
