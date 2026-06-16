/**
 * 今日ビュー起票フォーム E2E (BL-039 / inline-create-form).
 *
 * 仕様参照:
 *   docs/developer/features/inline-create-form/spec.md §「受け入れ基準」(REQ-1 / REQ-2).
 *   docs/developer/features/inline-create-form/plan.md §「テスト方針」.
 *
 * 本ファイルは TDD の "red" を作るための E2E.
 *   - 現状 `web/src/ui/today-view/today-view.tsx` には起票フォーム内に
 *     `<label htmlFor="task-due-date">期限</label>` と対応 `<select>` が残っている.
 *     そのため REQ-1 (期限 UI が存在しない) を期待する以下のテストは失敗する.
 *   - implementer が起票フォームから期限 select を削除し,
 *     `handleCreate` 内で `dueDate: "today"` をリテラル固定で渡すように変更すると green になる.
 *
 * 注意:
 *   - 既存テストとの分離のため, タスク名は `Date.now()` suffix を含めて衝突を避ける.
 *   - サーバ初期状態には既存テストの残骸が含まれうるため, テスト由来の id でのみ assert する.
 */
import { expect, test } from "@playwright/test";
import { getApiAuthHeader } from "./helpers/api-auth.js";
import { createFormLocator, openCreateForm } from "./helpers/floating-create-button.js";

const API_BASE = "http://localhost:3000";

test.describe("BL-039 今日ビュー起票フォームのスコープ", () => {
  test("シナリオ: 起票フォーム内に「期限」UI が存在しない (REQ-1)", async ({ page }) => {
    await page.goto("/today");

    // BL-104 追従: 起票フォームは初期非表示. + ボタンを押して展開する.
    await openCreateForm(page, "today");
    const form = createFormLocator(page, "today");
    await expect(form).toBeVisible();

    // 起票フォーム scope 内に「期限」label / combobox / input は存在しない.
    // inline-create-form spec REQ-1: id="task-due-date" も DOM 上に存在してはならない.
    await expect(form.getByLabel(/期限/)).toHaveCount(0);
    await expect(form.locator("#task-due-date")).toHaveCount(0);

    // 起票フォーム内の input/select は 2 つ:
    //   タスク名 (input id="task-name") +
    //   プロジェクト (<select id="create-project">, BL-065 で BL-041 トグル UI を撤去し戻した).
    // BL-040 で優先度 select は星 button group (role=radiogroup) に置換されたため
    // input/select には数えない. 「追加」ボタンも button 要素なので別.
    await expect(form.locator("input, select")).toHaveCount(2);
  });

  test('シナリオ: 起票したタスクは dueDate="today" でサーバに永続化される (REQ-2)', async ({
    page,
    request,
  }) => {
    const authHeader = await getApiAuthHeader(request, API_BASE);
    await page.goto("/today");

    const taskName = `BL039起票 ${Date.now()}`;

    // BL-104 追従: + で起票フォームを開いてから入力する.
    await openCreateForm(page, "today");
    const form = createFormLocator(page, "today");
    await form.getByLabel("タスク名").fill(taskName);
    await form.getByRole("button", { name: "追加", exact: true }).click();

    // BL-070 追従: タスク名は <input aria-label="{name} の名前" value={name}> として表示される.
    await expect(page.getByLabel(`${taskName} の名前`).first()).toHaveValue(taskName);

    // サーバ側でも dueDate=today で永続化されていることを確認する.
    const response = await request.get(`${API_BASE}/api/v1/tasks?dueDate=today`, {
      headers: authHeader,
    });
    expect(response.ok()).toBe(true);
    const body = (await response.json()) as {
      tasks: Array<{ id: string; name: string; dueDate: string }>;
    };
    const created = body.tasks.find((t) => t.name === taskName);
    expect(created).toBeDefined();
    expect(created?.dueDate).toBe("today");
  });
});
