/**
 * 衝突 / エラー UI 反応 E2E (BL-031).
 *
 * BL-027 の E2E 整備中に発見した 2 つの実装バグの修復を実環境で確認する:
 *   (a) online 412 → ConflictDialog が開く (今までは OptimisticLockError が onError に
 *       届くだけで `instanceof ConflictError` 判定で素通り → ダイアログ非表示だった)
 *   (b) offline PATCH 後の online 復帰で flush が成功する (今までは `If-Match` が header
 *       ではなく body に入っていて server が 400 MISSING_IF_MATCH で reject していた)
 *
 * (c) 401 / ネットワークエラー時の UI 反応は UI 設計判断 (toast / banner / 静かな refetch)
 *     を要するため別 BL に切り出し済み.
 */
import { expect, test, type Page } from "@playwright/test";

const API_BASE = "http://localhost:3000";
const AUTH_HEADER = { Authorization: "Bearer dev-token" };

function taskRow(page: Page, taskName: string) {
  return page.getByText(taskName, { exact: true }).first().locator("..");
}

test("2 タブ同時編集で後勝ち側に ConflictDialog が表示される (BL-031 a)", async ({
  browser,
  request,
}) => {
  // API で task を 1 件作成 (version 1).
  const taskId = crypto.randomUUID();
  const taskName = `衝突テスト ${Date.now()}`;
  await request.post(`${API_BASE}/api/v1/tasks`, {
    headers: { ...AUTH_HEADER, "Idempotency-Key": crypto.randomUUID() },
    data: { id: taskId, name: taskName },
  });

  // タブ A・B を独立した browser context で開く (それぞれ独自の React Query キャッシュを持つ).
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const pageA = await ctxA.newPage();
  const pageB = await ctxB.newPage();

  await Promise.all([pageA.goto("/"), pageB.goto("/")]);
  await Promise.all([
    expect(pageA.getByText(taskName, { exact: true })).toBeVisible(),
    expect(pageB.getByText(taskName, { exact: true })).toBeVisible(),
  ]);

  // タブ A: 編集して保存 → server 側 version が 1 → 2 に上がる.
  await taskRow(pageA, taskName).getByRole("button", { name: "編集" }).click();
  await pageA
    .getByRole("form", { name: "タスク編集フォーム" })
    .getByLabel("名称")
    .fill(`${taskName} (A 編集)`);
  await pageA
    .getByRole("form", { name: "タスク編集フォーム" })
    .getByRole("button", { name: "保存" })
    .click();
  await expect(pageA.getByText(`${taskName} (A 編集)`)).toBeVisible();

  // タブ B: refetch していないので version 1 のまま. 編集を試みると 412 が返り
  // OptimisticLockError → ConflictError 変換経由で ConflictDialog が開くはず.
  await taskRow(pageB, taskName).getByRole("button", { name: "編集" }).click();
  await pageB
    .getByRole("form", { name: "タスク編集フォーム" })
    .getByLabel("名称")
    .fill(`${taskName} (B 編集)`);
  await pageB
    .getByRole("form", { name: "タスク編集フォーム" })
    .getByRole("button", { name: "保存" })
    .click();

  await expect(
    pageB.getByRole("dialog", { name: "変更が衝突しました" }),
  ).toBeVisible();

  await ctxA.close();
  await ctxB.close();
});

test("オフラインで編集した PATCH がオンライン復帰で flush され server に反映される (BL-031 b)", async ({
  page,
  context,
  request,
}) => {
  // API で task を 1 件作成.
  const originalName = `オフライン編集元 ${Date.now()}`;
  const updatedName = `オフライン編集後 ${Date.now() + 1}`;
  const taskId = crypto.randomUUID();
  await request.post(`${API_BASE}/api/v1/tasks`, {
    headers: { ...AUTH_HEADER, "Idempotency-Key": crypto.randomUUID() },
    data: { id: taskId, name: originalName },
  });

  // ブラウザで開いて task を表示.
  await page.goto("/");
  await expect(page.getByText(originalName, { exact: true })).toBeVisible();

  // オフライン中に編集 → IndexedDB queue に PATCH が積まれる (実 fetch は飛ばない).
  await context.setOffline(true);
  await taskRow(page, originalName).getByRole("button", { name: "編集" }).click();
  await page
    .getByRole("form", { name: "タスク編集フォーム" })
    .getByLabel("名称")
    .fill(updatedName);
  await page
    .getByRole("form", { name: "タスク編集フォーム" })
    .getByRole("button", { name: "保存" })
    .click();

  // オフライン中は server 側は変わらない.
  const offlineCheck = await request.get(
    `${API_BASE}/api/v1/tasks?trashed=false`,
    { headers: AUTH_HEADER },
  );
  const offlineList = (await offlineCheck.json()) as {
    tasks: Array<{ id: string; name: string }>;
  };
  expect(offlineList.tasks.find((t) => t.id === taskId)?.name).toBe(originalName);

  // オンライン復帰 → online event → flush() → PATCH 200 が返るのを待つ.
  const patchResponse = page.waitForResponse(
    (res) =>
      res.url().includes(`/api/v1/tasks/${taskId}`) &&
      res.request().method() === "PATCH" &&
      res.status() === 200,
  );
  await context.setOffline(false);
  await patchResponse;

  // server 側で名前が更新されている (header に If-Match が乗ったので reject されない).
  const onlineCheck = await request.get(
    `${API_BASE}/api/v1/tasks?trashed=false`,
    { headers: AUTH_HEADER },
  );
  const onlineList = (await onlineCheck.json()) as {
    tasks: Array<{ id: string; name: string }>;
  };
  expect(onlineList.tasks.find((t) => t.id === taskId)?.name).toBe(updatedName);
});
