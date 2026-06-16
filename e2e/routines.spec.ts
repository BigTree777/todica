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
import { createFormLocator, openCreateForm } from "./helpers/floating-create-button.js";

test.describe("ルーティン", () => {
  test("ルーティンを作成すると一覧に表示される", async ({ page }) => {
    await page.goto("/routines");
    const routineName = `R作成 ${Date.now()}`;

    // BL-104 追従: 起票フォームは + ボタンで開く折りたたみ式.
    await openCreateForm(page, "routines");
    const form = createFormLocator(page, "routines");

    // BL-061 (routine-card-component) / BL-070 追従: form scope で取得する.
    await form.getByLabel("ルーティン名").fill(routineName);
    // 月曜・火曜にチェック (任意の選択).
    await form.getByLabel("月", { exact: true }).check();
    await form.getByLabel("火", { exact: true }).check();
    await form.getByRole("button", { name: "追加" }).click();

    // BL-070 (inline-edit-all-cards) 追従: ルーティン名は input.value で表示される.
    // Playwright には getByDisplayValue が無いため input[value="..."] で取得する.
    await expect(page.locator(`.routine-card input[value="${routineName}"]`)).toBeVisible();
  });

  test("ルーティンを削除すると一覧から消える", async ({ page }) => {
    await page.goto("/routines");
    const routineName = `R削除 ${Date.now()}`;

    // BL-104 追従: + ボタンで起票フォームを開く.
    await openCreateForm(page, "routines");
    const form = createFormLocator(page, "routines");

    await form.getByLabel("ルーティン名").fill(routineName);
    await form.getByLabel("月", { exact: true }).check();
    await form.getByRole("button", { name: "追加" }).click();
    // BL-070 追従: routine 名は input.value で表示される.
    // Playwright には getByDisplayValue が無いため input[value="..."] で取得する.
    await expect(page.locator(`.routine-card input[value="${routineName}"]`)).toBeVisible();

    // BL-061 (routine-card-component) 追従: ルーティン名は `.routine-card__main` 内の
    // `<span>` に置かれるようになり, `locator("..")` だけでは `<li class="routine-card">`
    // までたどり着けない. `xpath=ancestor::li` で `<li>` 全体を取得して
    // 「削除」 button を探す.
    //
    // BL-070 (inline-edit-all-cards) 追従:
    //   表示モードの `<span>` は `<input value={...}>` に置換される.
    //   Playwright には getByDisplayValue が無いため input[value="..."] + ancestor::li で取得する.
    const routineRow = page
      .locator(`.routine-card input[value="${routineName}"]`)
      .first()
      .locator("xpath=ancestor::li[1]");
    await routineRow.getByRole("button", { name: "削除" }).click();

    await expect(page.locator(`.routine-card input[value="${routineName}"]`)).toHaveCount(0);
  });
});
