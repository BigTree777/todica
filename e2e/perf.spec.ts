/**
 * パフォーマンス E2E (BL-029 / NFR-010 補強).
 *
 * 1000 件のタスクが永続化されている状態で `/api/v1/today` の応答が
 * 1 秒以内に返ることを実 HTTP で確認する. SQLite のインデックス設計
 * (tasks_due_date_priority_idx 等) が効いているかの実機計測.
 *
 * セットアップに数十秒を要するため本テスト単体のタイムアウトを 5 分に設定.
 */
import { expect, test } from "@playwright/test";

const API_BASE = "http://localhost:3000";
const AUTH_HEADER = { Authorization: "Bearer dev-token" };

test.setTimeout(300_000);

test("1000 件タスク投入下で /today が 1 秒以内に返る", async ({ request }) => {
  const TARGET_COUNT = 1000;

  for (let i = 0; i < TARGET_COUNT; i++) {
    const res = await request.post(`${API_BASE}/api/v1/tasks`, {
      headers: { ...AUTH_HEADER, "Idempotency-Key": crypto.randomUUID() },
      data: { id: crypto.randomUUID(), name: `perf-${i}` },
    });
    expect(res.status()).toBe(201);
  }

  // 応答時間を計測.
  const t0 = Date.now();
  const res = await request.get(`${API_BASE}/api/v1/today`, {
    headers: AUTH_HEADER,
  });
  const elapsed = Date.now() - t0;

  expect(res.status()).toBe(200);
  const body = (await res.json()) as { tasks: Array<unknown> };
  expect(body.tasks.length).toBeGreaterThanOrEqual(TARGET_COUNT);
  expect(elapsed).toBeLessThan(1000);

  // 観測値を log で残す (CI で degradation 監視に使えるよう).
  console.log(`[perf] /today returned ${body.tasks.length} tasks in ${elapsed} ms`);
});
