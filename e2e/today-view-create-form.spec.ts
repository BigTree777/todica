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

const API_BASE = "http://localhost:3000";
const AUTH_HEADER = { Authorization: "Bearer dev-token" };

test.describe("BL-039 今日ビュー起票フォームのスコープ", () => {
  test("シナリオ: 起票フォーム内に「期限」UI が存在しない (REQ-1)", async ({ page }) => {
    await page.goto("/");

    // 起票フォーム自体は表示されている.
    const form = page.getByRole("form", { name: "タスク起票フォーム" });
    await expect(form).toBeVisible();

    // 起票フォーム scope 内に「期限」label / combobox / input は存在しない.
    // inline-create-form spec REQ-1: id="task-due-date" も DOM 上に存在してはならない.
    await expect(form.getByLabel(/期限/)).toHaveCount(0);
    await expect(form.locator("#task-due-date")).toHaveCount(0);

    // 起票フォーム内の input/select は 1 つのみ (タスク名 input).
    // BL-040 で優先度 select は星 button group に置換, BL-041 でプロジェクト select は
    // トグル button に置換されたため. 「追加」ボタン / プロジェクトトグル / 優先度星は
    // button 要素であり input/select には数えない.
    await expect(form.locator("input, select")).toHaveCount(1);
  });

  test('シナリオ: 起票したタスクは dueDate="today" でサーバに永続化される (REQ-2)', async ({
    page,
    request,
  }) => {
    await page.goto("/");

    const taskName = `BL039起票 ${Date.now()}`;

    // 起票フォームに入力 → 「追加」.
    await page.getByLabel("タスク名").fill(taskName);
    await page.getByRole("button", { name: "追加", exact: true }).click();

    // UI 上に起票したタスクが現れる (= 今日ビューに反映 = dueDate=today で作成された).
    await expect(page.getByText(taskName, { exact: true }).first()).toBeVisible();

    // サーバ側でも dueDate=today で永続化されていることを確認する.
    const response = await request.get(`${API_BASE}/api/v1/tasks?dueDate=today`, {
      headers: AUTH_HEADER,
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
