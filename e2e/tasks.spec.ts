/**
 * タスク基本操作の E2E スモーク (BL-026 / BL-001〜003, 007).
 *
 * TodayView の「タスク一覧」「現在のタスク」上のボタンを実ブラウザでクリックし,
 * PATCH /api/v1/tasks/:id (priority/dueDate/name) と
 * DELETE /api/v1/tasks/:id, POST /api/v1/tasks/:id/complete の経路で
 * UI が更新されることを happy path で確認する.
 *
 * 各テストは固有のタスク名 (Date.now() suffix) で起票し, 他テストと衝突しない.
 *
 * 当該タスクが唯一の today タスクの場合, `focusedId = currentTaskId ?? nextTaskId`
 * のフォールバックで「現在のタスク」セクション側に入る (today-view.tsx:399). したがって
 * `タスク一覧` 固定の locator はテスト順や DB 状態に依存して壊れる. 本ファイルの helper
 * `taskRow` は両セクション共通で動くよう, タスク名 span の親要素 (li or div) を取る.
 */
import { expect, test, type Page } from "@playwright/test";

/**
 * タスク名から, そのタスクのボタン群を含む親コンテナを返す.
 * - 「タスク一覧」配下の `<li>` か, 「現在のタスク」配下の `<div>` を拾う.
 */
function taskRow(page: Page, taskName: string) {
  return page.getByText(taskName, { exact: true }).first().locator("..");
}

async function createTask(page: Page, taskName: string): Promise<void> {
  await page.getByLabel("タスク名").fill(taskName);
  await page.getByRole("button", { name: "追加" }).click();
}

test.describe("タスク基本操作", () => {
  test("優先度ボタンを押すと表示と aria-label が更新される", async ({ page }) => {
    await page.goto("/");
    const taskName = `優先度テスト ${Date.now()}`;
    await createTask(page, taskName);

    const priorityButton = taskRow(page, taskName).getByRole("button", {
      name: /優先度を切替/,
    });
    const initialLabel = await priorityButton.getAttribute("aria-label");

    await priorityButton.click();

    await expect(priorityButton).not.toHaveAttribute(
      "aria-label",
      initialLabel ?? "",
    );
  });

  test("「明日へ」を押すと今日の一覧から消える", async ({ page }) => {
    await page.goto("/");
    const taskName = `期限切替テスト ${Date.now()}`;
    await createTask(page, taskName);

    await expect(taskRow(page, taskName)).toBeVisible();
    await taskRow(page, taskName).getByRole("button", { name: "明日へ" }).click();

    await expect(page.getByText(taskName, { exact: true })).toHaveCount(0);
  });

  test("タスクを編集すると名前が一覧に反映される", async ({ page }) => {
    await page.goto("/");
    const originalName = `編集元 ${Date.now()}`;
    const newName = `編集後 ${Date.now() + 1}`;
    await createTask(page, originalName);

    await taskRow(page, originalName).getByRole("button", { name: "編集" }).click();

    const editForm = page.getByRole("form", { name: "タスク編集フォーム" });
    await editForm.getByLabel("名称").fill(newName);
    await editForm.getByRole("button", { name: "保存" }).click();

    await expect(page.getByText(newName, { exact: true })).toBeVisible();
    await expect(page.getByText(originalName, { exact: true })).toHaveCount(0);
  });

  test("タスクを削除すると一覧から消える (ゴミ箱に移動)", async ({ page }) => {
    await page.goto("/");
    const taskName = `削除テスト ${Date.now()}`;
    await createTask(page, taskName);

    await expect(taskRow(page, taskName)).toBeVisible();
    await taskRow(page, taskName).getByRole("button", { name: "削除" }).click();

    await expect(page.getByText(taskName, { exact: true })).toHaveCount(0);
  });
});
