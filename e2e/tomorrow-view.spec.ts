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
import { expect, type Page, test } from "@playwright/test";
import { getApiAuthHeader } from "./helpers/api-auth.js";
import { createFormLocator, openCreateForm } from "./helpers/floating-create-button.js";

const API_BASE = "http://localhost:3000";

/**
 * AppShell のハンバーガーメニューから「明日のタスク」リンクで /tomorrow に遷移する.
 * BL-049 でサイドバーはハンバーガーボタン開閉式のオーバーレイメニューに変わったため,
 * リンクを click する前にハンバーガーボタンを押してメニュー (`role="dialog"`) を
 * 開く必要がある (閉状態の menu は viewport 外に隠れている).
 */
async function gotoTomorrowViaSidebar(page: Page): Promise<void> {
  await page.goto("/today");
  await page.getByRole("button", { name: "メニューを開く" }).click();
  const menu = page.getByRole("dialog", { name: "ナビゲーションメニュー" });
  await expect(menu).toBeVisible();
  await menu.getByRole("link", { name: "明日のタスク" }).click();
  await expect(page).toHaveURL(/\/tomorrow$/);
}

/**
 * tomorrow-view のメインランドマーク.
 *
 * BL-051 で旧 `<section aria-label="明日のタスク">` ランドマークは `<main>` に
 * 統合された (h1 が見出しとして十分なため aria-label は撤去). よって本ファイルでは
 * `<main className="day-view">` (role=main) を tomorrow-view のスコープとして使う.
 * `/tomorrow` 単独ページなので `main` ランドマークは 1 つだけ存在する想定.
 */
function tomorrowRegion(page: Page) {
  return page.getByRole("main");
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

    // BL-104 追従: 起票フォームは + ボタンで初めて開く.
    const taskName = `TOMORROW起票 ${Date.now()}`;
    await openCreateForm(page, "tomorrow");
    const createForm = createFormLocator(page, "tomorrow");
    const nameInput = createForm.getByLabel(/タスク名/);
    await expect(nameInput).toBeVisible();
    // 期限 UI は無いことの確認 (REQ-2 of BL-039). 同じく form scope.
    await expect(createForm.getByLabel(/期限/)).toHaveCount(0);

    await nameInput.fill(taskName);
    await createForm.getByRole("button", { name: /追加|起票|登録|送信/ }).click();

    // BL-070 追従: タスク名は <input aria-label="{name} の名前" value={name}> として表示される.
    await expect(tomorrowRegion(page).getByLabel(`${taskName} の名前`)).toHaveValue(taskName);
  });

  test("シナリオ Q (REQ-4): 「今日にする」で /tomorrow から消えて /today に現れる", async ({
    page,
    request,
  }) => {
    const authHeader = await getApiAuthHeader(request, API_BASE);
    // API 直叩きで dueDate=tomorrow のタスクを 1 件作成.
    const taskName = `TOMORROW移送 ${Date.now()}`;
    const taskId = crypto.randomUUID();
    await request.post(`${API_BASE}/api/v1/tasks`, {
      headers: { ...authHeader, "Idempotency-Key": crypto.randomUUID() },
      data: { id: taskId, name: taskName, dueDate: "tomorrow", priority: "highest" },
    });

    await gotoTomorrowViaSidebar(page);

    // BL-070 追従: タスク名は input value に入る.
    await expect(tomorrowRegion(page).getByLabel(`${taskName} の名前`)).toHaveValue(taskName);

    // 該当タスク行内の「今日にする」をクリック.
    // BL-070 追従: name は input value のため hasText では matches しない.
    // aria-label 一致の input を持つ <li> でフィルタする.
    const taskRow = tomorrowRegion(page)
      .getByRole("listitem")
      .filter({
        has: page.getByLabel(`${taskName} の名前`),
      });
    await taskRow.getByRole("button", { name: /今日にする/ }).click();

    // /tomorrow から消える.
    await expect(tomorrowRegion(page).getByLabel(`${taskName} の名前`)).toHaveCount(0);

    // ハンバーガーメニュー経由で /today に遷移する (BL-049 でメニューはオーバーレイ化).
    await page.getByRole("button", { name: "メニューを開く" }).click();
    const navMenu = page.getByRole("dialog", { name: "ナビゲーションメニュー" });
    await expect(navMenu).toBeVisible();
    await navMenu.getByRole("link", { name: "今日のタスク" }).click();
    await expect(page).toHaveURL(/\/today$/);
    await expect(todayHeading(page)).toBeVisible();

    // BL-070 追従: /today にタスク名が input value として出ている.
    await expect(page.getByLabel(`${taskName} の名前`)).toHaveValue(taskName);

    // サーバ side: dueDate=today になっている (= サーバ側で正しく移送されている).
    const after = await request.get(`${API_BASE}/api/v1/tasks?dueDate=today`, {
      headers: authHeader,
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
    const authHeader = await getApiAuthHeader(request, API_BASE);
    // API 直叩きで dueDate=tomorrow のタスクを 1 件作成.
    const taskName = `TOMORROW削除 ${Date.now()}`;
    const taskId = crypto.randomUUID();
    await request.post(`${API_BASE}/api/v1/tasks`, {
      headers: { ...authHeader, "Idempotency-Key": crypto.randomUUID() },
      data: { id: taskId, name: taskName, dueDate: "tomorrow", priority: "highest" },
    });

    await gotoTomorrowViaSidebar(page);

    // BL-070 追従: タスク名は input value に入る.
    await expect(tomorrowRegion(page).getByLabel(`${taskName} の名前`)).toHaveValue(taskName);

    // 「削除」をクリック.
    // BL-070 追従: name は input value のため hasText では matches しない.
    const taskRow = tomorrowRegion(page)
      .getByRole("listitem")
      .filter({
        has: page.getByLabel(`${taskName} の名前`),
      });
    await taskRow.getByRole("button", { name: /削除/ }).click();

    // /tomorrow から消える.
    await expect(tomorrowRegion(page).getByLabel(`${taskName} の名前`)).toHaveCount(0);

    // サーバ side: trashedReason = "deleted" でゴミ箱送りされている.
    const trashed = await request.get(`${API_BASE}/api/v1/tasks?trashed=true`, {
      headers: authHeader,
    });
    const trashedBody = (await trashed.json()) as {
      tasks: Array<{ id: string; trashedReason: string | null }>;
    };
    const deletedEntry = trashedBody.tasks.find((t) => t.id === taskId);
    expect(deletedEntry).toBeDefined();
    expect(deletedEntry?.trashedReason).toBe("deleted");
  });
});
