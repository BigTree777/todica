/**
 * プロジェクト E2E スモーク (BL-026 / BL-016).
 *
 * 検証する happy path:
 *   1. プロジェクト作成 (POST /api/v1/projects)
 *   2. タスクに紐付けて起票 (POST /api/v1/tasks with projectId)
 *   3. プロジェクト削除 (DELETE /api/v1/projects/:id)
 *   4. カスケード null: 紐付いたタスクは削除されず, projectId が null になる. 一覧から消えない
 */
import { expect, test, type Page } from "@playwright/test";

function taskRow(page: Page, taskName: string) {
  return page.getByText(taskName, { exact: true }).first().locator("..");
}

test("プロジェクトを削除すると紐付いていたタスクは残る (カスケード null)", async ({
  page,
}) => {
  const projectName = `Pカスケード ${Date.now()}`;
  const taskName = `Tカスケード ${Date.now()}`;

  // 1. プロジェクト作成
  await page.goto("/projects");
  await page.getByLabel("プロジェクト名").fill(projectName);
  await page.getByRole("button", { name: "追加" }).click();
  await expect(page.getByText(projectName, { exact: true })).toBeVisible();

  // 2. タスクに紐付けて起票
  await page.goto("/today");
  await page.getByLabel("タスク名").fill(taskName);
  await page.getByLabel("プロジェクト (任意)").selectOption({ label: projectName });
  await page.getByRole("button", { name: "追加" }).click();
  await expect(taskRow(page, taskName)).toBeVisible();

  // 3. プロジェクト削除
  await page.goto("/projects");
  const projectRow = page
    .getByText(projectName, { exact: true })
    .first()
    .locator("..");
  await projectRow.getByRole("button", { name: "削除" }).click();
  await expect(page.getByText(projectName, { exact: true })).toHaveCount(0);

  // 4. タスクは依然として今日ビューに残っている
  await page.goto("/today");
  await expect(taskRow(page, taskName)).toBeVisible();
});
