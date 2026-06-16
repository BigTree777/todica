/**
 * プロジェクト E2E スモーク (BL-026 / BL-016 / BL-041 / BL-065).
 *
 * 検証する happy path:
 *   1. プロジェクト作成 (POST /api/v1/projects)
 *   2. タスクに紐付けて起票 (POST /api/v1/tasks with projectId)
 *      - BL-065 (project-toggle-removal): 起票フォームのプロジェクト入力は再び `<select>` に戻された.
 *        旧 BL-041 トグル button (1 タップで巡回) は撤去され, `getByLabel("プロジェクト")` で
 *        `<select>` を取得して `selectOption({ label: "<name>" })` で直接選ぶ.
 *   3. プロジェクト削除 (DELETE /api/v1/projects/:id)
 *   4. カスケード null: 紐付いたタスクは削除されず, projectId が null になる. 一覧から消えない.
 */
import { expect, type Page, test } from "@playwright/test";

function taskRow(page: Page, taskName: string) {
  // BL-070 追従: タスク名は <input aria-label="{name} の名前"> の value に入る.
  // input から最寄りのタスクカード要素を遡る.
  // 注意: 強調表示中 (focused task) の TaskCard は <li> ではなく <section> (region) で
  // 描画されるため, DB が空の単独実行で作成タスクが focused になるケースも許容するよう
  // li / section の両方を ancestor 対象にする.
  return page
    .getByLabel(`${taskName} の名前`)
    .first()
    .locator("xpath=ancestor::*[self::li or self::section][1]");
}

/**
 * 起票フォーム scope 内のプロジェクト選択 `<select>` (BL-065 / project-toggle-removal).
 *
 * 旧 BL-041 トグル button (`getByRole("button", { name: /プロジェクト/ })`) は撤去された.
 * 新 UI は visually-hidden な `<label>プロジェクト</label>` + `<select id="create-project">`
 * のため, `getByLabel("プロジェクト")` で取得できる.
 */
function projectSelect(page: Page) {
  return page
    .getByRole("form", { name: /タスク起票フォーム|起票フォーム/ })
    .getByLabel("プロジェクト");
}

test("プロジェクトを削除すると紐付いていたタスクは残る (カスケード null)", async ({ page }) => {
  const projectName = `Pカスケード ${Date.now()}`;
  const taskName = `Tカスケード ${Date.now()}`;

  // 1. プロジェクト作成
  await page.goto("/projects");
  // BL-070 (inline-edit-all-cards) 追従:
  //   表示モードに常時 input + visually-hidden label "プロジェクト名" が追加されるため,
  //   page.getByLabel("プロジェクト名") は複数マッチで strict violation になる可能性がある.
  //   起票 form は <form aria-label="プロジェクト作成フォーム"> でスコープを絞る.
  await page
    .getByRole("form", { name: "プロジェクト作成フォーム" })
    .getByLabel("プロジェクト名")
    .fill(projectName);
  await page.getByRole("button", { name: "追加", exact: true }).click();
  // BL-070 追従: プロジェクト名は表示モードの input.value で表示される.
  // Playwright には getByDisplayValue が無いため input[value="..."] で取得する.
  await expect(page.locator(`.project-card input[value="${projectName}"]`)).toBeVisible();

  // 2. タスクに紐付けて起票
  //    BL-065 (project-toggle-removal): <select> から「目的のプロジェクト」を直接選ぶ.
  //    旧 BL-041 トグル button 連打方式 (= maxIterations ループ) は不要.
  await page.goto("/today");
  await page.getByLabel("タスク名").fill(taskName);

  const select = projectSelect(page);
  await expect(select).toBeVisible();
  // 「目的のプロジェクト名」を <option> ラベルで指定して直接選択 (BL-065 REQ-2 / D-001).
  await select.selectOption({ label: projectName });
  // 選択直後, `<select>` の表示テキスト (= 選択中 option) が projectName を含む.
  await expect(select).toHaveValue(/.+/); // 非空 (= プロジェクトなしから外れた).

  await page.getByRole("button", { name: "追加", exact: true }).click();
  await expect(taskRow(page, taskName)).toBeVisible();

  // 3. プロジェクト削除
  await page.goto("/projects");
  // BL-070 追従: プロジェクト名は input.value で表示される.
  // Playwright には getByDisplayValue が無いため input[value="..."] で取得する.
  const projectRow = page
    .locator(`.project-card input[value="${projectName}"]`)
    .first()
    .locator("xpath=ancestor::li[1]");
  await projectRow.getByRole("button", { name: "削除" }).click();
  await expect(page.locator(`.project-card input[value="${projectName}"]`)).toHaveCount(0);

  // 4. タスクは依然として今日ビューに残っている
  await page.goto("/today");
  await expect(taskRow(page, taskName)).toBeVisible();
});
