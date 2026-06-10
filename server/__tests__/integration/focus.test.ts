import type { DueDate, Priority, Task, TrashedReason } from "@todica/domain/task";
import type { Hono } from "hono";
/**
 * 結合テスト: 現在のタスク (フォーカス) API (BL-006 / FR-012 / FR-013 / NFR-011).
 *
 * 受け入れ基準の出典: docs/developer/features/focus-task/spec.md
 * 各 describe / it のタイトルに Gherkin シナリオ名 (spec.md §「受け入れ基準」) を含めて
 * trace 可能とする.
 *
 * 注意: 本ファイルは TDD の "red" を作るためのテスト.
 *       createApp() の GET/PUT /api/v1/focus はスタブ (500 NOT_IMPLEMENTED を返す)
 *       のため, このファイル内のテストはすべて失敗する想定.
 *       implementer がエンドポイント / 連動ロジックを実装することで green 化する.
 *
 * スコープ:
 *   - GET /api/v1/focus 正常系 / 認証
 *   - PUT /api/v1/focus 正常系 / 異常系 (INVALID_FOCUS_TARGET / MISSING_IF_MATCH /
 *     MISSING_IDEMPOTENCY_KEY / 412 / Idempotency-Key 再送)
 *   - 完了 / 削除 / 期限変更経路でのフォーカス自動解除 (FR-013)
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  TEST_AUTH_TOKEN,
  TEST_INITIAL_TIME,
  authHeaders,
  buildTestApp,
} from "../helpers/build-test-app.js";
import type {
  InMemoryFocusRepository,
  InMemoryTaskRepository,
} from "../helpers/in-memory-repositories.js";

// 並び順検証のため id が lexicographic に区別できる固定値を用意する.
const ID_001 = "00000000-0000-4000-8000-000000000001";
const ID_002 = "00000000-0000-4000-8000-000000000002";
const ID_003 = "00000000-0000-4000-8000-000000000003";
const ID_OTHER = "00000000-0000-4000-8000-0000000000ff";

let app: Hono;
let taskRepo: InMemoryTaskRepository;
let focusRepo: InMemoryFocusRepository;

beforeEach(() => {
  const built = buildTestApp();
  app = built.app;
  taskRepo = built.taskRepository;
  focusRepo = built.focusRepository;
});

/** Task のテストフィクスチャ. デフォルトは today / normal / active. */
function makeTask(overrides: Partial<Task> & { id: string }): Task {
  const base: Task = {
    id: overrides.id,
    name: "x",
    projectId: null,
    dueDate: "today" as DueDate,
    priority: "normal" as Priority,
    origin: "manual",
    routineId: null,
    createdAt: TEST_INITIAL_TIME,
    updatedAt: TEST_INITIAL_TIME,
    trashedAt: null,
    trashedReason: null as TrashedReason | null,
    version: 1,
  };
  return { ...base, ...overrides };
}

// ============================================================
// GET /api/v1/focus (spec.md §「GET /api/v1/focus」)
// ============================================================

describe("GET /api/v1/focus", () => {
  it("シナリオ: 初回アクセス時の FocusSelection はサーバ初期化時に 1 件存在し currentTaskId は null", async () => {
    // spec.md §「FocusSelection の初期状態と暗黙フォールバック」第 1 ケース.
    const res = await app.request("/api/v1/focus", {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      focus: {
        id: string;
        currentTaskId: string | null;
        version: number;
        updatedAt: string;
      };
    };
    expect(body.focus.id).toBe("singleton");
    expect(body.focus.currentTaskId).toBeNull();
    expect(body.focus.version).toBe(1);
    expect(typeof body.focus.updatedAt).toBe("string");
  });

  it("シナリオ: currentTaskId が設定済みのとき GET /api/v1/focus は当該 id を返す", async () => {
    // spec.md §「GET /api/v1/focus」第 2 ケース.
    focusRepo.seed({
      currentTaskId: ID_001,
      version: 3,
      updatedAt: "2026-06-07T10:00:00.000Z",
    });

    const res = await app.request("/api/v1/focus", {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      focus: { currentTaskId: string | null; version: number };
    };
    expect(body.focus.currentTaskId).toBe(ID_001);
    expect(body.focus.version).toBe(3);
  });

  it("シナリオ: 認証なしの GET /api/v1/focus は 401", async () => {
    // spec.md §「GET /api/v1/focus」第 1 ケース.
    const res = await app.request("/api/v1/focus", {
      method: "GET",
      // Authorization 無し.
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(401);
  });
});

// ============================================================
// PUT /api/v1/focus 正常系 (spec.md §「PUT /api/v1/focus」)
// ============================================================

describe("PUT /api/v1/focus (正常系: 設定 / 解除)", () => {
  it("シナリオ: PUT /api/v1/focus で現在のタスクを明示設定できる", async () => {
    // spec.md §「PUT /api/v1/focus」第 1 ケース.
    taskRepo.seed(makeTask({ id: ID_001, dueDate: "today" }));
    // FocusSelection 初期は version=1, currentTaskId=null.

    const res = await app.request("/api/v1/focus", {
      method: "PUT",
      headers: authHeaders({
        "If-Match": "1",
        "Idempotency-Key": "put-focus-set-1",
      }),
      body: JSON.stringify({ taskId: ID_001 }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      focus: { currentTaskId: string | null; version: number };
    };
    expect(body.focus.currentTaskId).toBe(ID_001);
    expect(body.focus.version).toBe(2);

    // 以後の GET /api/v1/focus も同じ値を返す.
    const followup = await app.request("/api/v1/focus", {
      method: "GET",
      headers: authHeaders(),
    });
    const fb = (await followup.json()) as {
      focus: { currentTaskId: string | null; version: number };
    };
    expect(fb.focus.currentTaskId).toBe(ID_001);
    expect(fb.focus.version).toBe(2);
  });

  it("シナリオ: PUT /api/v1/focus { taskId: null } で現在のタスクを解除できる", async () => {
    // spec.md §「PUT /api/v1/focus」第 2 ケース.
    taskRepo.seed(makeTask({ id: ID_001, dueDate: "today" }));
    focusRepo.seed({ currentTaskId: ID_001, version: 5 });

    const res = await app.request("/api/v1/focus", {
      method: "PUT",
      headers: authHeaders({
        "If-Match": "5",
        "Idempotency-Key": "put-focus-clear-1",
      }),
      body: JSON.stringify({ taskId: null }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      focus: { currentTaskId: string | null; version: number };
    };
    expect(body.focus.currentTaskId).toBeNull();
    expect(body.focus.version).toBe(6);
  });
});

// ============================================================
// PUT /api/v1/focus 異常系: INVALID_FOCUS_TARGET (spec.md §「PUT /api/v1/focus」)
// ============================================================

describe("PUT /api/v1/focus (異常系: INVALID_FOCUS_TARGET)", () => {
  it("シナリオ: 存在しないタスク id を currentTaskId に設定しようとすると 400 INVALID_FOCUS_TARGET", async () => {
    // spec.md §「PUT /api/v1/focus」第 4 ケース.
    const res = await app.request("/api/v1/focus", {
      method: "PUT",
      headers: authHeaders({
        "If-Match": "1",
        "Idempotency-Key": "put-focus-not-found",
      }),
      body: JSON.stringify({ taskId: "nonexistent-id" }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("INVALID_FOCUS_TARGET");

    // focus は変更されない.
    expect(focusRepo.current().currentTaskId).toBeNull();
    expect(focusRepo.current().version).toBe(1);
  });

  it("シナリオ: ゴミ箱状態 (trashedAt != null) のタスクを currentTaskId に設定しようとすると 400 INVALID_FOCUS_TARGET", async () => {
    // spec.md §「PUT /api/v1/focus」第 5 ケース.
    taskRepo.seed(
      makeTask({
        id: ID_001,
        dueDate: "today",
        trashedAt: "2026-06-07T08:00:00.000Z",
        trashedReason: "deleted",
      }),
    );

    const res = await app.request("/api/v1/focus", {
      method: "PUT",
      headers: authHeaders({
        "If-Match": "1",
        "Idempotency-Key": "put-focus-trashed",
      }),
      body: JSON.stringify({ taskId: ID_001 }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("INVALID_FOCUS_TARGET");

    expect(focusRepo.current().currentTaskId).toBeNull();
  });

  it('シナリオ: 今日のタスクでない id (dueDate = "tomorrow") を currentTaskId に設定しようとすると 400 INVALID_FOCUS_TARGET', async () => {
    // spec.md §「PUT /api/v1/focus」第 3 ケース.
    taskRepo.seed(makeTask({ id: ID_001, dueDate: "tomorrow" }));

    const res = await app.request("/api/v1/focus", {
      method: "PUT",
      headers: authHeaders({
        "If-Match": "1",
        "Idempotency-Key": "put-focus-tomorrow",
      }),
      body: JSON.stringify({ taskId: ID_001 }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("INVALID_FOCUS_TARGET");

    expect(focusRepo.current().currentTaskId).toBeNull();
  });
});

// ============================================================
// PUT /api/v1/focus 異常系: 楽観ロック / 冪等性 / 認証 (spec.md §「楽観ロック / 冪等性」)
// ============================================================

describe("PUT /api/v1/focus (楽観ロック / 冪等性 / 認証)", () => {
  it("シナリオ: If-Match なしの PUT /api/v1/focus は 400 MISSING_IF_MATCH", async () => {
    // spec.md §「楽観ロック / 冪等性」第 1 ケース.
    taskRepo.seed(makeTask({ id: ID_001, dueDate: "today" }));

    const res = await app.request("/api/v1/focus", {
      method: "PUT",
      headers: authHeaders({
        "Idempotency-Key": "put-focus-no-if-match",
        // If-Match は付けない.
      }),
      body: JSON.stringify({ taskId: ID_001 }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("MISSING_IF_MATCH");

    // focus は変更されない.
    expect(focusRepo.current().currentTaskId).toBeNull();
  });

  it("シナリオ: If-Match の version 不一致は 412 を返し現行 focus を含める", async () => {
    // spec.md §「楽観ロック / 冪等性」第 2 ケース.
    taskRepo.seed(makeTask({ id: ID_001, dueDate: "today" }));
    focusRepo.seed({ currentTaskId: null, version: 3 });

    const res = await app.request("/api/v1/focus", {
      method: "PUT",
      headers: authHeaders({
        "If-Match": "2",
        "Idempotency-Key": "put-focus-stale",
      }),
      body: JSON.stringify({ taskId: ID_001 }),
    });

    expect(res.status).toBe(412);
    const body = (await res.json()) as {
      focus: { currentTaskId: string | null; version: number };
    };
    // 現行 focus がボディに含まれる.
    expect(body.focus.version).toBe(3);
    expect(body.focus.currentTaskId).toBeNull();

    // ストアは変更されない.
    expect(focusRepo.current().version).toBe(3);
    expect(focusRepo.current().currentTaskId).toBeNull();
  });

  it("シナリオ: Idempotency-Key の再送は保存済み応答を返す (二重実行されない)", async () => {
    // spec.md §「楽観ロック / 冪等性」第 3 ケース.
    taskRepo.seed(makeTask({ id: ID_001, dueDate: "today" }));

    const headers = authHeaders({
      "If-Match": "1",
      "Idempotency-Key": "put-focus-idem-1",
    });
    const body = JSON.stringify({ taskId: ID_001 });

    const res1 = await app.request("/api/v1/focus", {
      method: "PUT",
      headers,
      body,
    });
    expect(res1.status).toBe(200);
    const body1 = await res1.json();

    const res2 = await app.request("/api/v1/focus", {
      method: "PUT",
      headers,
      body,
    });
    expect(res2.status).toBe(200);
    const body2 = await res2.json();

    // 2 回目は 1 回目と完全同一の応答.
    expect(body2).toEqual(body1);
    // version は 2 のまま (3 に進まない).
    expect(focusRepo.current().version).toBe(2);
    expect(focusRepo.current().currentTaskId).toBe(ID_001);
  });

  it("シナリオ: Idempotency-Key 欠落の PUT /api/v1/focus は 400 MISSING_IDEMPOTENCY_KEY", async () => {
    // ADR-0010 / 全書き込みで Idempotency-Key 必須.
    taskRepo.seed(makeTask({ id: ID_001, dueDate: "today" }));

    const res = await app.request("/api/v1/focus", {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${TEST_AUTH_TOKEN}`,
        "Content-Type": "application/json",
        "If-Match": "1",
        // Idempotency-Key を意図的に外す.
      },
      body: JSON.stringify({ taskId: ID_001 }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("MISSING_IDEMPOTENCY_KEY");
  });

  it("シナリオ: 認証なしの PUT /api/v1/focus は 401", async () => {
    const res = await app.request("/api/v1/focus", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "If-Match": "1",
        "Idempotency-Key": "put-focus-unauth",
      },
      body: JSON.stringify({ taskId: ID_001 }),
    });
    expect(res.status).toBe(401);

    // ストア不変.
    expect(focusRepo.current().currentTaskId).toBeNull();
    expect(focusRepo.current().version).toBe(1);
  });
});

// ============================================================
// 自動繰上げ: 完了経路 (FR-013) (spec.md §「自動繰上げ: 完了経路」)
// ============================================================

describe("POST /api/v1/tasks/{id}/complete (フォーカス自動解除)", () => {
  it("シナリオ: 現在のタスクを完了するとサーバ側で currentTaskId が null に解除される", async () => {
    // spec.md §「自動繰上げ: 完了経路」第 1 ケース.
    taskRepo.seed(
      makeTask({
        id: ID_001,
        priority: "highest",
        createdAt: "2026-06-08T08:00:00.000Z",
      }),
    );
    taskRepo.seed(
      makeTask({
        id: ID_002,
        priority: "highest",
        createdAt: "2026-06-08T08:00:01.000Z",
      }),
    );
    taskRepo.seed(
      makeTask({
        id: ID_003,
        priority: "normal",
        createdAt: "2026-06-08T08:00:02.000Z",
      }),
    );
    focusRepo.seed({ currentTaskId: ID_001, version: 5 });

    const res = await app.request(`/api/v1/tasks/${ID_001}/complete`, {
      method: "POST",
      headers: authHeaders({
        "If-Match": "1",
        "Idempotency-Key": "complete-clear-focus-1",
      }),
    });
    expect(res.status).toBe(200);

    // focus は解除されている (currentTaskId=null, version インクリメント).
    expect(focusRepo.current().currentTaskId).toBeNull();
    expect(focusRepo.current().version).toBeGreaterThan(5);

    // GET /api/v1/focus も同じ値を返す.
    const focusRes = await app.request("/api/v1/focus", {
      method: "GET",
      headers: authHeaders(),
    });
    const focusBody = (await focusRes.json()) as {
      focus: { currentTaskId: string | null };
    };
    expect(focusBody.focus.currentTaskId).toBeNull();

    // GET /api/v1/today の nextTaskId は B (= ID_002) に繰り上がる
    // (暗黙フォールバック: currentTaskId=null なら並び先頭).
    const todayRes = await app.request("/api/v1/today", {
      method: "GET",
      headers: authHeaders(),
    });
    const todayBody = (await todayRes.json()) as {
      tasks: Array<{ id: string }>;
      nextTaskId: string | null;
    };
    expect(todayBody.nextTaskId).toBe(ID_002);
  });

  it("シナリオ: 現在のタスクではないタスクを完了しても currentTaskId は変わらない", async () => {
    // spec.md §「自動繰上げ: 完了経路」第 2 ケース.
    taskRepo.seed(makeTask({ id: ID_001 }));
    taskRepo.seed(makeTask({ id: ID_002 }));
    taskRepo.seed(makeTask({ id: ID_003 }));
    focusRepo.seed({ currentTaskId: ID_001, version: 5 });

    const res = await app.request(`/api/v1/tasks/${ID_003}/complete`, {
      method: "POST",
      headers: authHeaders({
        "If-Match": "1",
        "Idempotency-Key": "complete-other",
      }),
    });
    expect(res.status).toBe(200);

    // focus は変わらない.
    expect(focusRepo.current().currentTaskId).toBe(ID_001);
    expect(focusRepo.current().version).toBe(5);
  });

  it("シナリオ: 今日のタスクが現在のタスク 1 件だけのときに完了すると, その後の nextTaskId は null", async () => {
    // spec.md §「自動繰上げ: 完了経路」第 3 ケース.
    taskRepo.seed(makeTask({ id: ID_001 }));
    focusRepo.seed({ currentTaskId: ID_001, version: 2 });

    const res = await app.request(`/api/v1/tasks/${ID_001}/complete`, {
      method: "POST",
      headers: authHeaders({
        "If-Match": "1",
        "Idempotency-Key": "complete-last",
      }),
    });
    expect(res.status).toBe(200);

    // focus 解除.
    expect(focusRepo.current().currentTaskId).toBeNull();

    // GET /api/v1/today: tasks=[], nextTaskId=null.
    const todayRes = await app.request("/api/v1/today", {
      method: "GET",
      headers: authHeaders(),
    });
    const todayBody = (await todayRes.json()) as {
      tasks: unknown[];
      nextTaskId: string | null;
    };
    expect(todayBody.tasks).toEqual([]);
    expect(todayBody.nextTaskId).toBeNull();
  });
});

// ============================================================
// 自動繰上げ: 削除経路 (FR-013) (spec.md §「自動繰上げ: 削除 / 期限変更経路」)
// ============================================================

describe("DELETE /api/v1/tasks/{id} (フォーカス自動解除)", () => {
  it("シナリオ: 現在のタスクを削除すると currentTaskId が null に解除される", async () => {
    // spec.md §「自動繰上げ: 削除 / 期限変更経路」第 1 ケース.
    taskRepo.seed(makeTask({ id: ID_001 }));
    focusRepo.seed({ currentTaskId: ID_001, version: 4 });

    const res = await app.request(`/api/v1/tasks/${ID_001}`, {
      method: "DELETE",
      headers: authHeaders({
        "If-Match": "1",
        "Idempotency-Key": "delete-focus-clear",
      }),
    });
    expect(res.status).toBe(204);

    // focus 解除.
    expect(focusRepo.current().currentTaskId).toBeNull();
    expect(focusRepo.current().version).toBeGreaterThan(4);
  });

  it("シナリオ: 現在のタスクではないタスクを削除しても currentTaskId に影響しない", async () => {
    // spec.md §「自動繰上げ: 削除 / 期限変更経路」第 3 ケース (前半).
    taskRepo.seed(makeTask({ id: ID_001 }));
    taskRepo.seed(makeTask({ id: ID_002 }));
    focusRepo.seed({ currentTaskId: ID_001, version: 4 });

    const res = await app.request(`/api/v1/tasks/${ID_002}`, {
      method: "DELETE",
      headers: authHeaders({
        "If-Match": "1",
        "Idempotency-Key": "delete-other",
      }),
    });
    expect(res.status).toBe(204);

    // focus は変わらない.
    expect(focusRepo.current().currentTaskId).toBe(ID_001);
    expect(focusRepo.current().version).toBe(4);
  });
});

// ============================================================
// 自動繰上げ: 期限変更経路 (FR-013) (spec.md §「自動繰上げ: 削除 / 期限変更経路」)
// ============================================================

describe("PATCH /api/v1/tasks/{id} (フォーカス自動解除: dueDate→tomorrow)", () => {
  it("シナリオ: 現在のタスクの期限を tomorrow に変更すると currentTaskId が null に解除される", async () => {
    // spec.md §「自動繰上げ: 削除 / 期限変更経路」第 2 ケース.
    taskRepo.seed(makeTask({ id: ID_001, dueDate: "today" }));
    focusRepo.seed({ currentTaskId: ID_001, version: 7 });

    const res = await app.request(`/api/v1/tasks/${ID_001}`, {
      method: "PATCH",
      headers: authHeaders({
        "If-Match": "1",
        "Idempotency-Key": "patch-tomorrow-focus-clear",
      }),
      body: JSON.stringify({ dueDate: "tomorrow" }),
    });
    expect(res.status).toBe(200);

    // focus 解除.
    expect(focusRepo.current().currentTaskId).toBeNull();
    expect(focusRepo.current().version).toBeGreaterThan(7);
  });

  it("シナリオ: dueDate: today のままの編集 (name のみ変更) では currentTaskId は変わらない", async () => {
    // spec.md §「自動繰上げ: 削除 / 期限変更経路」と spec.md §「現在のタスクではないタスクの削除 / 期限変更は currentTaskId に影響しない」より.
    taskRepo.seed(makeTask({ id: ID_001, dueDate: "today", name: "old" }));
    focusRepo.seed({ currentTaskId: ID_001, version: 4 });

    const res = await app.request(`/api/v1/tasks/${ID_001}`, {
      method: "PATCH",
      headers: authHeaders({
        "If-Match": "1",
        "Idempotency-Key": "patch-name-only-focus-stable",
      }),
      body: JSON.stringify({ name: "new" }),
    });
    expect(res.status).toBe(200);

    // focus は変わらない.
    expect(focusRepo.current().currentTaskId).toBe(ID_001);
    expect(focusRepo.current().version).toBe(4);
  });

  it("シナリオ: 現在のタスクの dueDate を tomorrow → today に戻しても自動で現在のタスクには再設定されない", async () => {
    // spec.md §「自動繰上げ: 削除 / 期限変更経路」第 4 ケース.
    // 前提: currentTaskId は既に null (一旦解除済).
    // 「現在のタスクではない」タスクを tomorrow → today に変えても自動で current にはならない.
    taskRepo.seed(makeTask({ id: ID_001, dueDate: "tomorrow", version: 2 }));
    focusRepo.seed({ currentTaskId: null, version: 8 });

    const res = await app.request(`/api/v1/tasks/${ID_001}`, {
      method: "PATCH",
      headers: authHeaders({
        "If-Match": "2",
        "Idempotency-Key": "patch-back-to-today",
      }),
      body: JSON.stringify({ dueDate: "today" }),
    });
    expect(res.status).toBe(200);

    // focus.currentTaskId は null のまま.
    expect(focusRepo.current().currentTaskId).toBeNull();
  });

  it("シナリオ: 現在のタスクではないタスクの dueDate→tomorrow は currentTaskId に影響しない", async () => {
    taskRepo.seed(makeTask({ id: ID_001, dueDate: "today" }));
    taskRepo.seed(makeTask({ id: ID_OTHER, dueDate: "today" }));
    focusRepo.seed({ currentTaskId: ID_001, version: 3 });

    const res = await app.request(`/api/v1/tasks/${ID_OTHER}`, {
      method: "PATCH",
      headers: authHeaders({
        "If-Match": "1",
        "Idempotency-Key": "patch-other-to-tomorrow",
      }),
      body: JSON.stringify({ dueDate: "tomorrow" }),
    });
    expect(res.status).toBe(200);

    // focus は変わらない.
    expect(focusRepo.current().currentTaskId).toBe(ID_001);
    expect(focusRepo.current().version).toBe(3);
  });
});

// ============================================================
// GET /api/v1/today の currentTaskId 拡張 (plan より自律判断: /today 拡張採用)
// ============================================================

describe("GET /api/v1/today (currentTaskId 拡張)", () => {
  it("シナリオ: GET /api/v1/today のレスポンスに currentTaskId フィールドが含まれる", async () => {
    // plan より「GET /api/v1/today レスポンスを拡張: { tasks, nextTaskId, currentTaskId } を返す」.
    taskRepo.seed(makeTask({ id: ID_001 }));

    const res = await app.request("/api/v1/today", {
      method: "GET",
      headers: authHeaders(),
    });
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      tasks: Array<{ id: string }>;
      nextTaskId: string | null;
      currentTaskId: string | null;
    };
    expect("currentTaskId" in body).toBe(true);
    // 初期は currentTaskId=null (明示未選択).
    expect(body.currentTaskId).toBeNull();
  });

  it("シナリオ: GET /api/v1/today の currentTaskId は FocusSelection.currentTaskId と一致する", async () => {
    taskRepo.seed(makeTask({ id: ID_001 }));
    focusRepo.seed({ currentTaskId: ID_001, version: 2 });

    const res = await app.request("/api/v1/today", {
      method: "GET",
      headers: authHeaders(),
    });
    expect(res.status).toBe(200);

    const body = (await res.json()) as { currentTaskId: string | null };
    expect(body.currentTaskId).toBe(ID_001);
  });
});
