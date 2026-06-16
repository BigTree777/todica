/**
 * 境界時刻またぎでの日次リセット連動 E2E (BL-030, BL-027 から移管).
 *
 * Playwright config の `TEST_NOW=2026-06-09T05:00:00.000Z` で server 内で
 * FakeClock が走り, `/api/v1/test/clock/advance` で時刻を 24h 進めることで
 * needsDailyReset() が true になる. その状態で `/api/v1/today` を叩くと
 * `maybeRunDailyReset` が発火し以下を検証できる:
 *   - 未完了タスク (dueDate=tomorrow) の today への繰越 (FR-043)
 *   - 完了カウンタの 0 リセット (FR-051)
 *   - ルーティンの当日分タスク自動生成 (FR-031)
 *
 * 各テストは固有のタスク / ルーティン名で起票して相互に干渉しない. clock の
 * advance は累積するが, 各 test 内で必要な advance 量だけ進めて検証する.
 */
import { expect, test } from "@playwright/test";
import { getApiAuthHeader } from "./helpers/api-auth.js";

const API_BASE = "http://localhost:3000";
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

async function advanceClock(
  request: import("@playwright/test").APIRequestContext,
  authHeader: { Authorization: string },
  ms: number,
): Promise<void> {
  const res = await request.post(`${API_BASE}/api/v1/test/clock/advance`, {
    headers: authHeader,
    data: { ms },
  });
  expect(res.status()).toBe(200);
}

async function listTasks(
  request: import("@playwright/test").APIRequestContext,
  authHeader: { Authorization: string },
): Promise<Array<{ id: string; name: string; dueDate: string }>> {
  const res = await request.get(`${API_BASE}/api/v1/tasks?trashed=false`, { headers: authHeader });
  expect(res.status()).toBe(200);
  const body = (await res.json()) as {
    tasks: Array<{ id: string; name: string; dueDate: string }>;
  };
  return body.tasks;
}

async function getToday(
  request: import("@playwright/test").APIRequestContext,
  authHeader: { Authorization: string },
): Promise<{
  tasks: Array<{ id: string; name: string }>;
  completionCount: number;
}> {
  const res = await request.get(`${API_BASE}/api/v1/today`, {
    headers: authHeader,
  });
  expect(res.status()).toBe(200);
  return (await res.json()) as {
    tasks: Array<{ id: string; name: string }>;
    completionCount: number;
  };
}

test("境界時刻またぎで dueDate=tomorrow のタスクが today に繰り越される", async ({ request }) => {
  const authHeader = await getApiAuthHeader(request, API_BASE);
  const taskId = crypto.randomUUID();
  const taskName = `繰越テスト ${Date.now()}`;

  // 明日分タスクを起票.
  await request.post(`${API_BASE}/api/v1/tasks`, {
    headers: { ...authHeader, "Idempotency-Key": crypto.randomUUID() },
    data: { id: taskId, name: taskName, dueDate: "tomorrow" },
  });

  // 繰越前: dueDate は "tomorrow".
  const beforeTasks = await listTasks(request, authHeader);
  expect(beforeTasks.find((t) => t.id === taskId)?.dueDate).toBe("tomorrow");

  // 24 時間進めて /today を叩く → reset 発火 → tomorrow が today に繰り越される.
  await advanceClock(request, authHeader, ONE_DAY_MS);
  await getToday(request, authHeader);

  const afterTasks = await listTasks(request, authHeader);
  expect(afterTasks.find((t) => t.id === taskId)?.dueDate).toBe("today");
});

test("境界時刻またぎで完了カウンタが 0 にリセットされる", async ({ request }) => {
  const authHeader = await getApiAuthHeader(request, API_BASE);
  // 任意のタスクを 1 件作って完了する.
  const taskId = crypto.randomUUID();
  await request.post(`${API_BASE}/api/v1/tasks`, {
    headers: { ...authHeader, "Idempotency-Key": crypto.randomUUID() },
    data: { id: taskId, name: `カウンタリセット用 ${Date.now()}` },
  });
  const completeRes = await request.post(`${API_BASE}/api/v1/tasks/${taskId}/complete`, {
    headers: {
      ...authHeader,
      "Idempotency-Key": crypto.randomUUID(),
      "If-Match": "1",
    },
  });
  expect(completeRes.status()).toBe(200);

  // 完了直後: counter は 1 以上 (他テストでの完了が累積しているかもしれない).
  const before = await getToday(request, authHeader);
  expect(before.completionCount).toBeGreaterThan(0);

  // 24 時間進めて /today → reset → counter が 0 に.
  await advanceClock(request, authHeader, ONE_DAY_MS);
  const after = await getToday(request, authHeader);
  expect(after.completionCount).toBe(0);
});

test("境界時刻またぎで指定曜日のルーティンタスクが自動生成される", async ({ request }) => {
  const authHeader = await getApiAuthHeader(request, API_BASE);
  // 今日相当の clock 時刻から見て翌日となる曜日のルーティンを作る.
  // clock を 24h 進めた時点で server 側の曜日が "ルーティンの daysOfWeek に含まれる" 状態に
  // 持って行く. テスト用 clock の現在時刻を API から取得して計算する.
  const clockRes = await request.get(`${API_BASE}/api/v1/test/clock`, {
    headers: authHeader,
  });
  const { now: currentNowIso } = (await clockRes.json()) as { now: string };
  const tomorrowDate = new Date(new Date(currentNowIso).getTime() + ONE_DAY_MS);
  const tomorrowDayOfWeek = tomorrowDate.getUTCDay(); // 0=日 〜 6=土

  const routineName = `R自動生成 ${Date.now()}`;
  const routineRes = await request.post(`${API_BASE}/api/v1/routines`, {
    headers: { ...authHeader, "Idempotency-Key": crypto.randomUUID() },
    data: {
      id: crypto.randomUUID(),
      name: routineName,
      daysOfWeek: [tomorrowDayOfWeek],
    },
  });
  expect(routineRes.status()).toBe(201);

  // 24 時間進める → /today で reset 発火 → 当日分のルーティンタスクが新規生成される.
  await advanceClock(request, authHeader, ONE_DAY_MS);
  await getToday(request, authHeader);

  // 生成された routine タスクが all-tasks 一覧に現れるはず.
  const tasksAfter = await listTasks(request, authHeader);
  const routineTask = tasksAfter.find((t) => t.name === routineName && t.dueDate === "today");
  expect(routineTask).toBeDefined();
});
