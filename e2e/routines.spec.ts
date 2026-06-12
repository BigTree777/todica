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

    // BL-061 (routine-card-component) 追従: name input の label を「名前」→「ルーティン名」に変更
    // (= placeholder と一致させ, visually-hidden 化したときも文脈が明確になる NFR-NAME-LABEL-CHANGE).
    // BL-070 追従: 表示モードに同名 visually-hidden label が追加されるため form でスコープを絞る.
    await page
      .getByRole("form", { name: "ルーティン作成フォーム" })
      .getByLabel("ルーティン名")
      .fill(routineName);
    // 月曜・火曜にチェック (任意の選択).
    // BL-070 追従: 表示モードにも曜日 checkbox が常時表示されるため
    // form scope 内の checkbox を明示的に取得する.
    await page
      .getByRole("form", { name: "ルーティン作成フォーム" })
      .getByLabel("月", { exact: true })
      .check();
    await page
      .getByRole("form", { name: "ルーティン作成フォーム" })
      .getByLabel("火", { exact: true })
      .check();
    await page.getByRole("button", { name: "追加" }).click();

    // BL-070 (inline-edit-all-cards) 追従: ルーティン名は input.value で表示される.
    // Playwright には getByDisplayValue が無いため input[value="..."] で取得する.
    await expect(page.locator(`.routine-card input[value="${routineName}"]`)).toBeVisible();
  });

  test("ルーティンを削除すると一覧から消える", async ({ page }) => {
    await page.goto("/routines");
    const routineName = `R削除 ${Date.now()}`;

    // BL-061 (routine-card-component) 追従: 「名前」→「ルーティン名」.
    // BL-070 追従: 表示モードに同名 visually-hidden label が追加されるため form でスコープを絞る.
    await page
      .getByRole("form", { name: "ルーティン作成フォーム" })
      .getByLabel("ルーティン名")
      .fill(routineName);
    // BL-070 追従: 表示モードにも曜日 checkbox が常時表示されるため
    // form scope 内の checkbox を明示的に取得する.
    await page
      .getByRole("form", { name: "ルーティン作成フォーム" })
      .getByLabel("月", { exact: true })
      .check();
    await page.getByRole("button", { name: "追加" }).click();
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
