/**
 * Idempotency-Key 冪等応答 E2E (BL-027 / BL-015).
 *
 * 同じ Idempotency-Key を付けた書込リクエストを 2 回送ると, 2 回目は
 * **新規処理を実行せず, 1 回目の応答を再生する** ことを実 HTTP で確認する.
 *
 * 統合テストでは `app.request()` を Node 内インラインで叩くため middleware の
 * 冪等処理経路は通っているが, 「実 HTTP リクエストとしてサーバプロセスに到達した
 * 2 回目が DB に再書込しない」ことを保証するには実 HTTP 往復が必要.
 */
import { expect, test } from "@playwright/test";
import { getApiAuthHeader } from "./helpers/api-auth.js";

const API_BASE = "http://localhost:3000";

test("同じ Idempotency-Key の 2 回目 POST は 1 回目と同じ応答を返し DB には 1 件しか作らない", async ({
  request,
}) => {
  const authHeader = await getApiAuthHeader(request, API_BASE);
  const idempotencyKey = crypto.randomUUID();
  const taskId = crypto.randomUUID();
  const taskName = `冪等テスト ${Date.now()}`;

  // 1 回目: 通常通り 201 で task が作成される.
  const first = await request.post(`${API_BASE}/api/v1/tasks`, {
    headers: { ...authHeader, "Idempotency-Key": idempotencyKey },
    data: { id: taskId, name: taskName },
  });
  expect(first.status()).toBe(201);
  const firstBody = await first.json();

  // 2 回目: 同じ Idempotency-Key で body を変えても, 1 回目の応答が再生されるはず.
  // (`name` を別文字列にしても無視されて元の `taskName` が返る)
  const second = await request.post(`${API_BASE}/api/v1/tasks`, {
    headers: { ...authHeader, "Idempotency-Key": idempotencyKey },
    data: { id: crypto.randomUUID(), name: `差替テスト ${Date.now()}` },
  });
  expect(second.status()).toBe(201);
  const secondBody = await second.json();
  expect(secondBody).toEqual(firstBody);

  // DB 側にも 1 件しか作られていないことを確認.
  // `差替テスト` のタスクは作成されていないはず.
  const listRes = await request.get(`${API_BASE}/api/v1/tasks?trashed=false`, {
    headers: authHeader,
  });
  const list = (await listRes.json()) as { tasks: Array<{ id: string; name: string }> };
  const matches = list.tasks.filter((t) => t.name === taskName || t.name.startsWith("差替テスト"));
  expect(matches).toHaveLength(1);
  expect(matches[0].id).toBe(taskId);
});
