/**
 * プロジェクト E2E スモーク (BL-026 / BL-016 / BL-041).
 *
 * 検証する happy path:
 *   1. プロジェクト作成 (POST /api/v1/projects)
 *   2. タスクに紐付けて起票 (POST /api/v1/tasks with projectId)
 *      - BL-041: 起票フォームのプロジェクト入力は `<select>` ではなく `<ProjectToggle />` (button).
 *        目的のプロジェクトに到達するまでトグルを連打する経路で書き換え.
 *   3. プロジェクト削除 (DELETE /api/v1/projects/:id)
 *   4. カスケード null: 紐付いたタスクは削除されず, projectId が null になる. 一覧から消えない
 */
import { type Page, expect, test } from "@playwright/test";

function taskRow(page: Page, taskName: string) {
  return page.getByText(taskName, { exact: true }).first().locator("..");
}

/**
 * 起票フォーム scope 内のプロジェクトトグルボタン (BL-041 / ProjectToggle).
 * 旧 `<select id="task-project">` (= `getByLabel("プロジェクト (任意)")`) からの置換.
 */
function projectToggleButton(page: Page) {
  return page
    .getByRole("form", { name: /タスク起票フォーム|起票フォーム/ })
    .getByRole("button", { name: /プロジェクト/ });
}

test("プロジェクトを削除すると紐付いていたタスクは残る (カスケード null)", async ({ page }) => {
  const projectName = `Pカスケード ${Date.now()}`;
  const taskName = `Tカスケード ${Date.now()}`;

  // 1. プロジェクト作成
  await page.goto("/projects");
  await page.getByLabel("プロジェクト名").fill(projectName);
  await page.getByRole("button", { name: "追加", exact: true }).click();
  await expect(page.getByText(projectName, { exact: true })).toBeVisible();

  // 2. タスクに紐付けて起票
  //    BL-041: <select> ではなくトグル button. 目的のプロジェクト名に到達するまで連打する.
  //    最大 N 回 (= 全プロジェクト数 + null) で必ず到達するため決定論的.
  await page.goto("/today");
  await page.getByLabel("タスク名").fill(taskName);

  const toggle = projectToggleButton(page);
  await expect(toggle).toBeVisible();
  const maxIterations = 20;
  let reached = false;
  for (let i = 0; i < maxIterations; i++) {
    const text = (await toggle.textContent()) ?? "";
    if (text.includes(projectName)) {
      reached = true;
      break;
    }
    await toggle.click();
  }
  expect(
    reached,
    `トグルを ${maxIterations} 回クリックしても "${projectName}" に到達しなかった`,
  ).toBe(true);
  await expect(toggle).toContainText(projectName);

  await page.getByRole("button", { name: "追加", exact: true }).click();
  await expect(taskRow(page, taskName)).toBeVisible();

  // 3. プロジェクト削除
  await page.goto("/projects");
  const projectRow = page.getByText(projectName, { exact: true }).first().locator("..");
  await projectRow.getByRole("button", { name: "削除" }).click();
  await expect(page.getByText(projectName, { exact: true })).toHaveCount(0);

  // 4. タスクは依然として今日ビューに残っている
  await page.goto("/today");
  await expect(taskRow(page, taskName)).toBeVisible();
});
