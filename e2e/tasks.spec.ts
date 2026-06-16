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
 * のフォールバックで「現在のタスク」セクション側に入る (today-view.tsx). したがって
 * `タスク一覧` 固定の locator はテスト順や DB 状態に依存して壊れる. 本ファイルの helper
 * `taskRow` は両セクション共通で動くよう, タスク名 input からカード本体
 * (class="task-card" の li または section) を遡って取る.
 */
import { expect, type Page, test } from "@playwright/test";
import { createFormLocator, openCreateForm } from "./helpers/floating-create-button.js";

/**
 * タスク名から, そのタスクのボタン群を含む親コンテナを返す.
 * - 「タスク一覧」配下の `<li>` か, 「現在のタスク」配下の `<div>` を拾う.
 */
function taskRow(page: Page, taskName: string) {
  // BL-070 (inline-edit-all-cards) 追従: タスク名は <input aria-label="{name} の名前">
  // に置換された. aria-label で input を取得し, カード本体 (class="task-card" を持つ
  // <li> または「現在のタスク」セクションの <section>) まで遡る.
  // ancestor::li 固定だと focus 側 (<section>) に入ったタスクで解決できないため,
  // class token 一致 (" task-card " を含む) で両 variant 共通にする.
  // (contains(@class, "task-card") だと内側の task-card__title 等も誤マッチするので不可.)
  return page
    .getByLabel(`${taskName} の名前`)
    .first()
    .locator(
      'xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " task-card ")][1]',
    );
}

/**
 * BL-104 (floating-create-button) 追従: 起票フォームは常時表示ではなくなり,
 * + ボタン押下で初めて開く折りたたみ式になった. 各テストの最初に呼び出す.
 */
async function createTask(page: Page, taskName: string): Promise<void> {
  await openCreateForm(page, "today");
  const form = createFormLocator(page, "today");
  await form.getByLabel("タスク名").fill(taskName);
  await form.getByRole("button", { name: "追加", exact: true }).click();
}

test.describe("タスク基本操作", () => {
  test("星 1 つ目をクリックすると radiogroup の aria-label が「後回し」を含むに変わる", async ({
    page,
  }) => {
    // BL-040 priority-star-ui AC-5:
    //   Given /today にタスク T (priority="normal") が表示されている
    //   When  T のカード上の 1 番目の星をクリックする
    //   Then  TaskRepository.update が { patch: { priority: "later" } } で呼ばれる
    //    かつ aria 表現 (現在の優先度: ...) が "後回し" 相当に変化する
    //    かつ 1 番目の星のみが点灯した見た目になる
    //
    // 旧テスト (cycle ボタン「優先度を切替」を押すと aria-label が更新される) を,
    // 星 UI 直接クリックに書き換える.
    await page.goto("/");
    const taskName = `星優先度テスト ${Date.now()}`;
    await createTask(page, taskName);

    const row = taskRow(page, taskName);

    // タスクカード内の優先度 radiogroup を取得.
    // 起票フォーム側の <PriorityStars /> と区別するため, タスク行 (row) スコープに限定する.
    const priorityGroup = row.getByRole("radiogroup");
    await expect(priorityGroup).toBeVisible();

    // 初期 aria-label には「普通」が含まれる (BL-040 既定値 = normal).
    await expect(priorityGroup).toHaveAttribute("aria-label", /普通/);

    // 星 (role=radio) 3 つを取得.
    const stars = priorityGroup.getByRole("radio");
    await expect(stars).toHaveCount(3);

    // 1 番目の星 (= later) をクリック.
    await stars.first().click();

    // aria-label が「後回し」相当に変化する.
    await expect(priorityGroup).toHaveAttribute("aria-label", /後回し/);
  });

  test("「明日にする」を押すと今日の一覧から消える", async ({ page }) => {
    await page.goto("/");
    const taskName = `期限切替テスト ${Date.now()}`;
    await createTask(page, taskName);

    await expect(taskRow(page, taskName)).toBeVisible();
    // BL-042: ラベルは「明日へ」→「明日にする」に統一.
    await taskRow(page, taskName).getByRole("button", { name: "明日にする" }).click();

    // BL-070 追従: タスク名は input value に表示される. aria-label でカウントを確認.
    await expect(page.getByLabel(`${taskName} の名前`)).toHaveCount(0);
  });

  // BL-042 (task-card-actions) でカード上の「編集」 button と編集フォームを撤去したため
  // 一時 skip していたが, BL-070 (inline-edit-all-cards) でタスク名がインライン input
  // (fill → blur で PATCH /api/v1/tasks/:id { name }) になり名称編集経路が復活したため,
  // blur 経路に書き換えて skip を解除する (spec AC-25).
  test("タスク名 input を編集して blur すると新しい名前が一覧に反映される (BL-070 blur 経路)", async ({
    page,
  }) => {
    await page.goto("/");
    const originalName = `編集元 ${Date.now()}`;
    const newName = `編集後 ${Date.now() + 1}`;
    await createTask(page, originalName);

    // タスク名は <input aria-label="{name} の名前"> に表示される.
    const nameInput = page.getByLabel(`${originalName} の名前`).first();
    await expect(nameInput).toBeVisible();

    // fill → blur で PATCH が飛ぶ.
    await nameInput.fill(newName);
    await nameInput.blur();

    // refetch 後, input は新しい name で再マウントされ aria-label も更新される.
    await expect(page.getByLabel(`${newName} の名前`).first()).toBeVisible();
    await expect(page.getByLabel(`${originalName} の名前`)).toHaveCount(0);
  });

  test("タスクを削除すると一覧から消える (ゴミ箱に移動)", async ({ page }) => {
    await page.goto("/");
    const taskName = `削除テスト ${Date.now()}`;
    await createTask(page, taskName);

    await expect(taskRow(page, taskName)).toBeVisible();
    await taskRow(page, taskName).getByRole("button", { name: "削除" }).click();

    // BL-070 追従: タスク名は input value に表示される. aria-label でカウントを確認.
    await expect(page.getByLabel(`${taskName} の名前`)).toHaveCount(0);
  });
});
