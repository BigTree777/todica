/**
 * 「明日のタスク」独立ビュー E2E (BL-038 / tomorrow-view).
 *
 * 仕様参照:
 *   docs/developer/features/tomorrow-view/spec.md §「受け入れ基準」.
 *   docs/developer/features/tomorrow-view/plan.md §「E2E (Playwright)」.
 *   docs/developer/features/tomorrow-view/tasks.md T-004.
 *
 * 本ファイルは TDD の "red" を作るための E2E.
 *   - 現状 `/tomorrow` は `TomorrowViewPlaceholder` が割り当てられているだけで, 起票フォームも
 *     タスクカードも持たない. よって以下のテストは全て失敗する.
 *   - implementer が web/src/ui/tomorrow-view/tomorrow-view.tsx を新設して main.tsx の Route
 *     element を差し替えることで green 化する.
 *
 * 注意:
 *   - 既存テストとの分離のため, タスク名は `Date.now()` suffix を含めて衝突しないようにする.
 *   - サーバ初期状態には既存テストの残骸が含まれうるため, テスト由来のタスク名のみで assert する.
 */
import { type Page, expect, test } from "@playwright/test";

const API_BASE = "http://localhost:3000";
const AUTH_HEADER = { Authorization: "Bearer dev-token" };

/**
 * AppShell サイドバーから「明日のタスク」リンクで /tomorrow に遷移する.
 * BL-036 で導入されたサイドバーランドマークを使う.
 */
async function gotoTomorrowViaSidebar(page: Page): Promise<void> {
  await page.goto("/today");
  await page
    .getByRole("navigation", { name: "サイドバーナビゲーション" })
    .getByRole("link", { name: "明日のタスク" })
    .click();
  await expect(page).toHaveURL(/\/tomorrow$/);
}

/** tomorrow-view のランドマーク (REQ-1 で <section aria-label="明日のタスク"> を期待). */
function tomorrowRegion(page: Page) {
  return page.getByRole("region", { name: "明日のタスク" });
}

/** today-view のランドマーク (今日ビュー側の確認用). */
function todayHeading(page: Page) {
  return page.getByRole("heading", { name: "今日" });
}

test.describe("tomorrow-view (/tomorrow) のシナリオ", () => {
  test("シナリオ P (REQ-2): /tomorrow で起票したタスクが一覧に出る", async ({ page }) => {
    await gotoTomorrowViaSidebar(page);

    // 見出し <h1>明日のタスク</h1> が描画されている (placeholder と新実装で共通の文言).
    await expect(page.getByRole("heading", { name: "明日のタスク", level: 1 })).toBeVisible();

    // 起票フォームの入力欄 (タスク名) があり, 期限 UI は無い (REQ-2).
    const taskName = `TOMORROW起票 ${Date.now()}`;
    const nameInput = page.getByLabel(/タスク名/);
    await expect(nameInput).toBeVisible();
    // 期限 UI は無いことの確認 (label / combobox いずれも).
    await expect(page.getByLabel(/期限/)).toHaveCount(0);

    await nameInput.fill(taskName);
    await page.getByRole("button", { name: /追加|起票|登録|送信/ }).click();

    // 起票したタスク名が tomorrow-view 内に表示される.
    await expect(tomorrowRegion(page).getByText(taskName, { exact: true })).toBeVisible();
  });

  test("シナリオ Q (REQ-4): 「今日にする」で /tomorrow から消えて /today に現れる", async ({
    page,
    request,
  }) => {
    // API 直叩きで dueDate=tomorrow のタスクを 1 件作成.
    const taskName = `TOMORROW移送 ${Date.now()}`;
    const taskId = crypto.randomUUID();
    await request.post(`${API_BASE}/api/v1/tasks`, {
      headers: { ...AUTH_HEADER, "Idempotency-Key": crypto.randomUUID() },
      data: { id: taskId, name: taskName, dueDate: "tomorrow", priority: "highest" },
    });

    await gotoTomorrowViaSidebar(page);

    // /tomorrow に表示されていることを確認.
    await expect(tomorrowRegion(page).getByText(taskName, { exact: true })).toBeVisible();

    // 該当タスク行内の「今日にする」をクリック.
    const taskRow = tomorrowRegion(page).getByRole("listitem").filter({ hasText: taskName });
    await taskRow.getByRole("button", { name: /今日にする/ }).click();

    // /tomorrow から消える.
    await expect(tomorrowRegion(page).getByText(taskName, { exact: true })).toHaveCount(0);

    // サイドバーから /today に遷移する.
    await page
      .getByRole("navigation", { name: "サイドバーナビゲーション" })
      .getByRole("link", { name: "今日のタスク" })
      .click();
    await expect(page).toHaveURL(/\/today$/);
    await expect(todayHeading(page)).toBeVisible();

    // /today にタスク名が出ている.
    await expect(page.getByText(taskName, { exact: true })).toBeVisible();

    // サーバ side: dueDate=today になっている (= サーバ側で正しく移送されている).
    const after = await request.get(`${API_BASE}/api/v1/tasks?dueDate=today`, {
      headers: AUTH_HEADER,
    });
    const afterBody = (await after.json()) as {
      tasks: Array<{ id: string; dueDate: string }>;
    };
    const moved = afterBody.tasks.find((t) => t.id === taskId);
    expect(moved).toBeDefined();
    expect(moved?.dueDate).toBe("today");
  });

  test("シナリオ R (REQ-5): 「削除」で /tomorrow から消えてゴミ箱送りになる", async ({
    page,
    request,
  }) => {
    // API 直叩きで dueDate=tomorrow のタスクを 1 件作成.
    const taskName = `TOMORROW削除 ${Date.now()}`;
    const taskId = crypto.randomUUID();
    await request.post(`${API_BASE}/api/v1/tasks`, {
      headers: { ...AUTH_HEADER, "Idempotency-Key": crypto.randomUUID() },
      data: { id: taskId, name: taskName, dueDate: "tomorrow", priority: "highest" },
    });

    await gotoTomorrowViaSidebar(page);

    // 表示されていることを確認.
    await expect(tomorrowRegion(page).getByText(taskName, { exact: true })).toBeVisible();

    // 「削除」をクリック.
    const taskRow = tomorrowRegion(page).getByRole("listitem").filter({ hasText: taskName });
    await taskRow.getByRole("button", { name: /削除/ }).click();

    // /tomorrow から消える.
    await expect(tomorrowRegion(page).getByText(taskName, { exact: true })).toHaveCount(0);

    // サーバ side: trashedReason = "deleted" でゴミ箱送りされている.
    const trashed = await request.get(`${API_BASE}/api/v1/tasks?trashed=true`, {
      headers: AUTH_HEADER,
    });
    const trashedBody = (await trashed.json()) as {
      tasks: Array<{ id: string; trashedReason: string | null }>;
    };
    const deletedEntry = trashedBody.tasks.find((t) => t.id === taskId);
    expect(deletedEntry).toBeDefined();
    expect(deletedEntry?.trashedReason).toBe("deleted");
  });
});
