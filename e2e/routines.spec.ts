/**
 * ルーティン E2E スモーク (BL-026 / BL-017).
 *
 * 検証する happy path:
 *   1. ルーティン作成 (曜日チェック付き) → 一覧に表示される
 *   2. ルーティン削除 → 一覧から消える
 *
 * BL-017 のもう 1 つの観点である「指定曜日に翌日タスクが自動生成される」は,
 * 日次リセットを発火させる必要があり境界時刻の前後関係を制御するテスト用 hook が
 * 現在 API/UI 双方に存在しない. 本ファイルでは扱わず, backlog で別項目に切り出す
 * (BL-027 クロスレイヤ整合性枠の「日次リセット連動」サブ項目).
 */
import { expect, test } from "@playwright/test";

test.describe("ルーティン", () => {
  test("ルーティンを作成すると一覧に表示される", async ({ page }) => {
    await page.goto("/routines");
    const routineName = `R作成 ${Date.now()}`;

    await page.getByLabel("名前").fill(routineName);
    // 月曜・火曜にチェック (任意の選択).
    await page.getByLabel("月", { exact: true }).check();
    await page.getByLabel("火", { exact: true }).check();
    await page.getByRole("button", { name: "追加" }).click();

    await expect(page.getByText(routineName, { exact: true })).toBeVisible();
  });

  test("ルーティンを削除すると一覧から消える", async ({ page }) => {
    await page.goto("/routines");
    const routineName = `R削除 ${Date.now()}`;

    await page.getByLabel("名前").fill(routineName);
    await page.getByLabel("月", { exact: true }).check();
    await page.getByRole("button", { name: "追加" }).click();
    await expect(page.getByText(routineName, { exact: true })).toBeVisible();

    const routineRow = page
      .getByText(routineName, { exact: true })
      .first()
      .locator("..");
    await routineRow.getByRole("button", { name: "削除" }).click();

    await expect(page.getByText(routineName, { exact: true })).toHaveCount(0);
  });
});
