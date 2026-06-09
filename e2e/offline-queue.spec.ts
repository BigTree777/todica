/**
 * オフライン書込キュー E2E (BL-027 / BL-018).
 *
 * 検証する happy path:
 *   1. オフラインでタスクを起票 → IndexedDB キューに保存
 *   2. オンライン復帰 → window の `online` イベント発火 → flush() で server に POST 送信
 *   3. server 側でタスクが作成されていることを API で確認
 *
 * 注: 同じ flow を PATCH (update) で書こうとすると, 現在の web 実装が PATCH を
 * enqueue する際に `If-Match` を header ではなく body の `ifMatch` プロパティに入れて
 * しまうため (today-view.tsx の updateMutation), flush 時の fetch は header 無しで送られ
 * server が 400 MISSING_IF_MATCH を返す. 結果として offline → online flush の PATCH 経路は
 * 現在動かない. POST はこの問題に該当しないので本テストは create で書く. PATCH 経路の
 * 修正は別 BL に切り出すべき.
 */
import { expect, test } from "@playwright/test";

const API_BASE = "http://localhost:3000";
const AUTH_HEADER = { Authorization: "Bearer dev-token" };

test("オフラインでタスクを起票 → オンライン復帰でキューが flush され server に作成される", async ({
  page,
  context,
  request,
}) => {
  const taskName = `オフライン起票 ${Date.now()}`;

  await page.goto("/");

  // オフラインに切替.
  await context.setOffline(true);

  // 起票フォームから追加 (オフライン中は IndexedDB キューに保存され, fetch は飛ばない).
  await page.getByLabel("タスク名").fill(taskName);
  await page.getByRole("button", { name: "追加" }).click();

  // オフライン中はサーバ側には未到達であることを確認.
  const offlineCheck = await request.get(`${API_BASE}/api/v1/tasks?trashed=false`, {
    headers: AUTH_HEADER,
  });
  const offlineList = (await offlineCheck.json()) as {
    tasks: Array<{ id: string; name: string }>;
  };
  expect(offlineList.tasks.find((t) => t.name === taskName)).toBeUndefined();

  // オンライン復帰 → window の online イベントが発火し flush() が走る.
  // POST /api/v1/tasks が server に届いて 201 で返るのを待つ.
  const postResponse = page.waitForResponse(
    (res) =>
      res.url().endsWith("/api/v1/tasks") &&
      res.request().method() === "POST" &&
      res.status() === 201,
  );
  await context.setOffline(false);
  await postResponse;

  // server 側にタスクが作成されている.
  const onlineCheck = await request.get(`${API_BASE}/api/v1/tasks?trashed=false`, {
    headers: AUTH_HEADER,
  });
  const onlineList = (await onlineCheck.json()) as {
    tasks: Array<{ id: string; name: string }>;
  };
  expect(onlineList.tasks.find((t) => t.name === taskName)).toBeDefined();
});
