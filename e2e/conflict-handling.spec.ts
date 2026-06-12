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
import { expect, test } from "@playwright/test";

const API_BASE = "http://localhost:3000";
const AUTH_HEADER = { Authorization: "Bearer dev-token" };

// BL-070 (inline-edit-all-cards) 追従 (spec AC-25):
//   BL-042 で撤去された task の「編集」 button → 編集フォーム経路は, BL-070 のインライン
//   input (fill → blur で PATCH /api/v1/tasks/:id { name }) で復活した.
//   タスク名は <input aria-label="{name} の名前"> に表示されるため getByLabel で取得し,
//   blur 経路に書き換えて skip を解除する.
test("2 タブ同時編集で後勝ち側に ConflictDialog が表示される (BL-031 a / BL-070 blur 経路)", async ({
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
    expect(pageA.getByLabel(`${taskName} の名前`).first()).toBeVisible(),
    expect(pageB.getByLabel(`${taskName} の名前`).first()).toBeVisible(),
  ]);

  // タブ A: input fill → blur で PATCH → server 側 version が 1 → 2 に上がる.
  // PATCH 200 の response を待ってから B 側の操作に進む (= A の保存完了を確定させる).
  const inputA = pageA.getByLabel(`${taskName} の名前`).first();
  const patchA = pageA.waitForResponse(
    (res) =>
      res.url().includes(`/api/v1/tasks/${taskId}`) &&
      res.request().method() === "PATCH" &&
      res.status() === 200,
  );
  await inputA.fill(`${taskName} (A 編集)`);
  await inputA.blur();
  await patchA;

  // タブ B: refetch していないので version 1 のまま. input fill → blur で PATCH を試みると
  // 412 が返り OptimisticLockError → ConflictError 変換経由で ConflictDialog が開くはず.
  // (B の aria-label は refetch 前なので元の taskName のまま取得できる.)
  const inputB = pageB.getByLabel(`${taskName} の名前`).first();
  await inputB.fill(`${taskName} (B 編集)`);
  await inputB.blur();

  await expect(pageB.getByRole("dialog", { name: "変更が衝突しました" })).toBeVisible();

  await ctxA.close();
  await ctxB.close();
});

// BL-070 (inline-edit-all-cards) 追従 (spec AC-25):
//   旧経路: getByRole("button", { name: "変更" }).click() → 編集 form の input.fill → 「保存」 click.
//   新経路: ProjectCard は表示モードに常時 input を持ち, fill → blur で PATCH が飛ぶ.
//   プロジェクト名は input.value に入るため, locator は `.project-card input[value="..."]` で
//   取得する (projects.spec.ts と同じイディオム / Playwright に getByDisplayValue は無い).
test("2 タブ同時編集でプロジェクト名衝突時にも ConflictDialog が表示される (BL-033 / BL-070 blur 経路)", async ({
  browser,
  request,
}) => {
  const projectId = crypto.randomUUID();
  const projectName = `P衝突 ${Date.now()}`;
  await request.post(`${API_BASE}/api/v1/projects`, {
    headers: { ...AUTH_HEADER, "Idempotency-Key": crypto.randomUUID() },
    data: { id: projectId, name: projectName },
  });

  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const pageA = await ctxA.newPage();
  const pageB = await ctxB.newPage();

  await Promise.all([pageA.goto("/projects"), pageB.goto("/projects")]);
  await Promise.all([
    expect(pageA.locator(`.project-card input[value="${projectName}"]`)).toBeVisible(),
    expect(pageB.locator(`.project-card input[value="${projectName}"]`)).toBeVisible(),
  ]);

  // タブ A: input fill → blur で PATCH → server 側 version が 1 → 2 に上がる.
  // PATCH 200 の response を待ってから B 側の操作に進む (= A の保存完了を確定させる).
  const inputA = pageA.locator(`.project-card input[value="${projectName}"]`).first();
  const patchA = pageA.waitForResponse(
    (res) =>
      res.url().includes(`/api/v1/projects/${projectId}`) &&
      res.request().method() === "PATCH" &&
      res.status() === 200,
  );
  await inputA.fill(`${projectName} (A 編集)`);
  await inputA.blur();
  await patchA;

  // タブ B: refetch していないので version 1 のまま. input fill → blur で PATCH を試みると
  // 412 が返り ProjectConflictError → ConflictError 変換経由で ConflictDialog が開くはず.
  // (B の input[value] 属性は refetch 前なので元の projectName のまま取得できる.)
  const inputB = pageB.locator(`.project-card input[value="${projectName}"]`).first();
  await inputB.fill(`${projectName} (B 編集)`);
  await inputB.blur();

  await expect(pageB.getByRole("dialog", { name: "変更が衝突しました" })).toBeVisible();

  await ctxA.close();
  await ctxB.close();
});

test("401 が返るとエラー通知バナーが表示される (BL-034)", async ({ page }) => {
  await page.goto("/");

  // POST /api/v1/tasks を route 介入で 401 にする.
  await page.route("**/api/v1/tasks", (route) => {
    if (route.request().method() === "POST") {
      route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ code: "UNAUTHORIZED", message: "Bad token" }),
      });
    } else {
      route.continue();
    }
  });

  await page.getByLabel("タスク名").fill(`401テスト ${Date.now()}`);
  await page.getByRole("button", { name: "追加", exact: true }).click();

  // エラー通知バナーが表示される.
  await expect(page.getByRole("alert", { name: "通信エラー通知" })).toBeVisible();
  await expect(page.getByText("通信に失敗しました")).toBeVisible();
});

// BL-070 (inline-edit-all-cards) 追従 (spec AC-25): BL-042 で撤去された編集フォーム経路は
// BL-070 のインライン input (fill → blur で PATCH) で復活した. blur 経路に書き換えて
// skip を解除する. オフライン flush 経路 (IndexedDB queue → online 復帰 → flush) は従来どおり.
test("オフラインで編集した PATCH がオンライン復帰で flush され server に反映される (BL-031 b / BL-070 blur 経路)", async ({
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
  const nameInput = page.getByLabel(`${originalName} の名前`).first();
  await expect(nameInput).toBeVisible();

  // オフライン中に input fill → blur で編集 → IndexedDB queue に PATCH が積まれる
  // (実 fetch は飛ばない).
  await context.setOffline(true);
  await nameInput.fill(updatedName);
  await nameInput.blur();

  // オフライン中は server 側は変わらない.
  const offlineCheck = await request.get(`${API_BASE}/api/v1/tasks?trashed=false`, {
    headers: AUTH_HEADER,
  });
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
  const onlineCheck = await request.get(`${API_BASE}/api/v1/tasks?trashed=false`, {
    headers: AUTH_HEADER,
  });
  const onlineList = (await onlineCheck.json()) as {
    tasks: Array<{ id: string; name: string }>;
  };
  expect(onlineList.tasks.find((t) => t.id === taskId)?.name).toBe(updatedName);
});
