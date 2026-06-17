import type { DueDate, Priority, Task, TrashedReason } from "@todica/domain/task";
import type { Hono } from "hono";
/**
 * 結合テスト: ゴミ箱 API (BL-011 / FR-061 / FR-062 / NFR-020 / NFR-021).
 *
 * 受け入れ基準の出典: docs/developer/features/trash/spec.md
 * 各 describe / it のタイトルに Gherkin シナリオ名を含めて trace 可能とする.
 *
 * 注意: 本ファイルは TDD の "red" を作るためのテスト.
 *       GET /api/v1/trash, POST /api/v1/trash/:id/restore, DELETE /api/v1/trash は
 *       まだ実装されていないため, すべて失敗する想定.
 *       implementer がエンドポイントを実装することで green 化する.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  authHeaders,
  buildTestApp,
  TEST_AUTH_TOKEN,
  TEST_INITIAL_TIME,
} from "../helpers/build-test-app.js";
import type {
  InMemoryCounterRepository,
  InMemoryTaskRepository,
} from "../helpers/in-memory-repositories.js";

const TASK_ID_1 = "11111111-1111-4111-8111-111111111111";
const TASK_ID_2 = "22222222-2222-4222-8222-222222222222";
const TASK_ID_3 = "33333333-3333-4333-8333-333333333333";
const TASK_ID_4 = "44444444-4444-4444-8444-444444444444";

// dayBoundaryTime = "04:00"
const BOUNDARY_TIME = "04:00";
// 境界を超えた状態（リセットが発動する時刻）
const TIME_AFTER_BOUNDARY = "2026-06-08T10:00:00.000Z";
// 今日の境界時刻
const TODAY_BOUNDARY_AT = "2026-06-08T04:00:00.000Z";

let app: Hono;
let taskRepo: InMemoryTaskRepository;
let counterRepo: InMemoryCounterRepository;

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

/** ゴミ箱タスクのフィクスチャ. trashedAt / trashedReason を設定する. */
function makeTrashedTask(
  overrides: Partial<Task> & { id: string; trashedReason: TrashedReason },
): Task {
  const trashedAt = "2026-06-07T12:00:00.000Z";
  return makeTask({
    ...overrides,
    trashedAt,
    updatedAt: trashedAt,
  });
}

beforeEach(() => {
  const built = buildTestApp({ initialTime: TEST_INITIAL_TIME });
  app = built.app;
  taskRepo = built.taskRepository;
  counterRepo = built.counterRepository;
});

// ============================================================
// GET /api/v1/trash (FR-062 ゴミ箱閲覧)
// ============================================================

describe("GET /api/v1/trash (BL-011 ゴミ箱一覧)", () => {
  it("シナリオ: 認証なしのゴミ箱一覧は 401 を返す", async () => {
    // spec.md §「認証なしのゴミ箱一覧は 401 を返す」
    //   Given Authorization ヘッダを付けない
    //   When  クライアントが GET /api/v1/trash を送る
    //   Then  HTTP 401 Unauthorized が返る
    const res = await app.request("/api/v1/trash", {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    expect(res.status).toBe(401);
  });

  it("シナリオ: ゴミ箱が空のときは空配列が返る", async () => {
    // spec.md §「ゴミ箱が空のときは空配列が返る」
    //   Given 認証済みのリクエストである
    //   And   ゴミ箱にタスクが 1 件も存在しない
    //   When  クライアントが GET /api/v1/trash を送る
    //   Then  HTTP 200 OK が返り、レスポンスの tasks が空配列（[]）である
    const res = await app.request("/api/v1/trash", {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { tasks: unknown[] };
    expect(body.tasks).toEqual([]);
  });

  it("シナリオ: 完了タスクがゴミ箱に存在するとき → 200 tasks に含まれる (trashedReason='completed')", async () => {
    // spec.md §「ゴミ箱の一覧を取得できる」
    //   Given タスク T1（trashedReason = "completed"）がゴミ箱に存在する
    //   When  クライアントが GET /api/v1/trash を送る
    //   Then  HTTP 200 OK が返る
    //   And   レスポンスボディの tasks に T1 が含まれ trashedReason = "completed" である
    taskRepo.seed(makeTrashedTask({ id: TASK_ID_1, trashedReason: "completed" }));

    const res = await app.request("/api/v1/trash", {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      tasks: Array<{ id: string; trashedReason: string | null; trashedAt: string | null }>;
    };
    expect(body.tasks).toHaveLength(1);
    expect(body.tasks[0]?.id).toBe(TASK_ID_1);
    expect(body.tasks[0]?.trashedReason).toBe("completed");
    expect(body.tasks[0]?.trashedAt).not.toBeNull();
  });

  it("シナリオ: 削除タスクがゴミ箱に存在するとき → 200 tasks に含まれる (trashedReason='deleted')", async () => {
    // spec.md §「ゴミ箱の一覧を取得できる」
    //   Given タスク T1（trashedReason = "deleted"）がゴミ箱に存在する
    //   When  クライアントが GET /api/v1/trash を送る
    //   Then  HTTP 200 OK が返る
    //   And   レスポンスボディの tasks に T1 が含まれ trashedReason = "deleted" である
    taskRepo.seed(makeTrashedTask({ id: TASK_ID_1, trashedReason: "deleted" }));

    const res = await app.request("/api/v1/trash", {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      tasks: Array<{ id: string; trashedReason: string | null }>;
    };
    expect(body.tasks).toHaveLength(1);
    expect(body.tasks[0]?.id).toBe(TASK_ID_1);
    expect(body.tasks[0]?.trashedReason).toBe("deleted");
  });

  it("シナリオ: アクティブタスクはゴミ箱に含まれない", async () => {
    // spec.md §「ゴミ箱の一覧を取得できる」
    //   And   タスク T3 が通常状態（trashedAt = null）で存在する
    //   Then  レスポンスボディの tasks に T3 は含まれない
    taskRepo.seed(makeTrashedTask({ id: TASK_ID_1, trashedReason: "deleted" }));
    taskRepo.seed(makeTrashedTask({ id: TASK_ID_2, trashedReason: "completed" }));
    taskRepo.seed(makeTask({ id: TASK_ID_3, name: "アクティブタスク" }));

    const res = await app.request("/api/v1/trash", {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { tasks: Array<{ id: string }> };
    expect(body.tasks).toHaveLength(2);
    const ids = body.tasks.map((t) => t.id);
    expect(ids).toContain(TASK_ID_1);
    expect(ids).toContain(TASK_ID_2);
    expect(ids).not.toContain(TASK_ID_3);
  });
});

// ============================================================
// POST /api/v1/trash/:id/restore (FR-061 タスク復元)
// ============================================================

describe("POST /api/v1/trash/:id/restore (BL-011 タスク復元)", () => {
  it("シナリオ: 認証なしの復元リクエストは 401 を返す", async () => {
    // spec.md §「認証なしの復元リクエストは 401 を返す」
    //   Given Authorization ヘッダを付けない
    //   When  クライアントが POST /api/v1/trash/<id>/restore を送る
    //   Then  HTTP 401 Unauthorized が返る
    const res = await app.request(`/api/v1/trash/${TASK_ID_1}/restore`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": "restore-unauth",
        "If-Match": "1",
      },
    });

    expect(res.status).toBe(401);
  });

  it("シナリオ: ゴミ箱タスクを復元 → 200 { task: { trashedAt: null, trashedReason: null, dueDate: 'today', version+1 } }", async () => {
    // spec.md §「ゴミ箱のタスクを復元できる（dueDate は 'today' にリセット）」
    //   Given タスク T が { trashedAt: <過去>, trashedReason: "deleted", dueDate: "tomorrow", version: 2 } でゴミ箱にある
    //   When  クライアントが POST /api/v1/trash/<T の id>/restore を送る
    //   And   ヘッダに Idempotency-Key と If-Match: 2 を付ける
    //   Then  HTTP 200 OK が返る
    //   And   レスポンスボディの task は { trashedAt: null, trashedReason: null, dueDate: "today", version: 3 } を含む
    taskRepo.seed(
      makeTrashedTask({
        id: TASK_ID_1,
        trashedReason: "deleted",
        dueDate: "tomorrow",
        version: 2,
      }),
    );

    const res = await app.request(`/api/v1/trash/${TASK_ID_1}/restore`, {
      method: "POST",
      headers: authHeaders({
        "Idempotency-Key": "restore-1",
        "If-Match": "2",
      }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      task: {
        id: string;
        trashedAt: string | null;
        trashedReason: string | null;
        dueDate: string;
        version: number;
        createdAt: string;
      };
    };
    expect(body.task.id).toBe(TASK_ID_1);
    expect(body.task.trashedAt).toBeNull();
    expect(body.task.trashedReason).toBeNull();
    expect(body.task.dueDate).toBe("today");
    expect(body.task.version).toBe(3);
    // createdAt は変更されない
    expect(body.task.createdAt).toBe(TEST_INITIAL_TIME);

    // ストア上の T も更新されている
    const stored = await taskRepo.findById(TASK_ID_1);
    expect(stored?.trashedAt).toBeNull();
    expect(stored?.trashedReason).toBeNull();
    expect(stored?.dueDate).toBe("today");
    expect(stored?.version).toBe(3);
  });

  it("シナリオ: 復元後にゴミ箱から消えている（GET /trash に含まれない）", async () => {
    // spec.md §「ゴミ箱のタスクを復元できる」より: 復元後はアクティブ状態になる
    taskRepo.seed(makeTrashedTask({ id: TASK_ID_1, trashedReason: "deleted", version: 1 }));

    // 復元
    await app.request(`/api/v1/trash/${TASK_ID_1}/restore`, {
      method: "POST",
      headers: authHeaders({
        "Idempotency-Key": "restore-check-trash",
        "If-Match": "1",
      }),
    });

    // ゴミ箱一覧に含まれないこと
    const trashRes = await app.request("/api/v1/trash", {
      method: "GET",
      headers: authHeaders(),
    });
    expect(trashRes.status).toBe(200);
    const trashBody = (await trashRes.json()) as { tasks: Array<{ id: string }> };
    expect(trashBody.tasks.find((t) => t.id === TASK_ID_1)).toBeUndefined();
  });

  it("シナリオ: 復元後に今日ビューに現れる（GET /today の tasks に含まれる）", async () => {
    // spec.md §「ゴミ箱のタスクを復元できる」より: 復元後の dueDate = "today"
    taskRepo.seed(makeTrashedTask({ id: TASK_ID_1, trashedReason: "deleted", version: 1 }));

    // 復元
    await app.request(`/api/v1/trash/${TASK_ID_1}/restore`, {
      method: "POST",
      headers: authHeaders({
        "Idempotency-Key": "restore-check-today",
        "If-Match": "1",
      }),
    });

    // 今日ビューに含まれること
    const todayRes = await app.request("/api/v1/today", {
      method: "GET",
      headers: authHeaders(),
    });
    expect(todayRes.status).toBe(200);
    const todayBody = (await todayRes.json()) as { tasks: Array<{ id: string }> };
    expect(todayBody.tasks.find((t) => t.id === TASK_ID_1)).toBeDefined();
  });

  it("シナリオ: 存在しない ID を restore → 404 TASK_NOT_FOUND", async () => {
    // spec.md §「存在しない ID への復元は 404 を返す」
    //   Given サーバに該当 id のタスクが存在しない
    //   When  クライアントが POST /api/v1/trash/<存在しない id>/restore を送る
    //   Then  HTTP 404 Not Found が返り、レスポンスの code が "TASK_NOT_FOUND" である
    const res = await app.request(`/api/v1/trash/${TASK_ID_1}/restore`, {
      method: "POST",
      headers: authHeaders({
        "Idempotency-Key": "restore-404",
        "If-Match": "1",
      }),
    });

    expect(res.status).toBe(404);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("TASK_NOT_FOUND");
  });

  it("シナリオ: ゴミ箱に入っていないタスクを restore → 400 TASK_NOT_IN_TRASH", async () => {
    // spec.md §「ゴミ箱に入っていないタスクへの復元は 400 を返す」
    //   Given タスク T が通常状態（trashedAt = null）で存在する
    //   When  クライアントが POST /api/v1/trash/<T の id>/restore を送る
    //   Then  HTTP 400 Bad Request が返り、レスポンスの code が "TASK_NOT_IN_TRASH" である
    taskRepo.seed(makeTask({ id: TASK_ID_1, version: 1 }));

    const res = await app.request(`/api/v1/trash/${TASK_ID_1}/restore`, {
      method: "POST",
      headers: authHeaders({
        "Idempotency-Key": "restore-not-in-trash",
        "If-Match": "1",
      }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("TASK_NOT_IN_TRASH");
  });

  it("シナリオ: version 不一致（If-Match） → 412 Precondition Failed + 現行 task", async () => {
    // spec.md §「古い version での復元は 412 を返す」
    //   Given タスク T が { trashedAt: <過去>, trashedReason: "deleted", version: 3 } でゴミ箱にある
    //   When  クライアントが POST /api/v1/trash/<T の id>/restore を If-Match: 2 で送る
    //   Then  HTTP 412 Precondition Failed が返る
    //   And   レスポンスボディに現行 task（version = 3 の状態）が含まれる
    //   And   ストア上の T は変更されない
    taskRepo.seed(
      makeTrashedTask({
        id: TASK_ID_1,
        trashedReason: "deleted",
        version: 3,
      }),
    );

    const res = await app.request(`/api/v1/trash/${TASK_ID_1}/restore`, {
      method: "POST",
      headers: authHeaders({
        "Idempotency-Key": "restore-412",
        "If-Match": "2", // 実際の version は 3
      }),
    });

    expect(res.status).toBe(412);
    const body = (await res.json()) as { task: { version: number; trashedAt: string | null } };
    // 現行 task（version=3）がレスポンスに含まれる
    expect(body.task.version).toBe(3);
    // ストア上は変更されない
    const stored = await taskRepo.findById(TASK_ID_1);
    expect(stored?.version).toBe(3);
    expect(stored?.trashedAt).not.toBeNull();
  });

  it("シナリオ: If-Match ヘッダが欠落した復元リクエストは 400 MISSING_IF_MATCH", async () => {
    // spec.md §「If-Match ヘッダが欠落した復元リクエストは 400 を返す」
    taskRepo.seed(makeTrashedTask({ id: TASK_ID_1, trashedReason: "deleted", version: 1 }));

    const res = await app.request(`/api/v1/trash/${TASK_ID_1}/restore`, {
      method: "POST",
      headers: authHeaders({
        "Idempotency-Key": "restore-no-if-match",
        // If-Match を意図的に省略
      }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("MISSING_IF_MATCH");
  });

  it("シナリオ: Idempotency-Key ヘッダが欠落した復元リクエストは 400 MISSING_IDEMPOTENCY_KEY", async () => {
    // spec.md §「Idempotency-Key ヘッダが欠落した復元リクエストは 400 を返す」
    taskRepo.seed(makeTrashedTask({ id: TASK_ID_1, trashedReason: "deleted", version: 1 }));

    const res = await app.request(`/api/v1/trash/${TASK_ID_1}/restore`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TEST_AUTH_TOKEN}`,
        "Content-Type": "application/json",
        "If-Match": "1",
        // Idempotency-Key を意図的に省略
      },
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("MISSING_IDEMPOTENCY_KEY");
  });

  it("シナリオ: 復元操作は completedCount を変更しない", async () => {
    // spec.md §「復元操作は completedCount を変更しない」
    //   Given counterRepo に completedCount = 5 を seed
    //   And   trashedReason = "completed" のゴミ箱タスクがある
    //   When  POST /api/v1/trash/:id/restore
    //   Then  200 OK
    //   And   GET /api/v1/counter で completedCount = 5 のまま
    counterRepo.seed({ completedCount: 5 });
    taskRepo.seed(makeTrashedTask({ id: TASK_ID_1, trashedReason: "completed", version: 1 }));

    const res = await app.request(`/api/v1/trash/${TASK_ID_1}/restore`, {
      method: "POST",
      headers: authHeaders({
        "Idempotency-Key": "restore-counter-check",
        "If-Match": "1",
      }),
    });

    expect(res.status).toBe(200);

    const counterRes = await app.request("/api/v1/counter", {
      method: "GET",
      headers: authHeaders(),
    });
    expect(counterRes.status).toBe(200);
    const counterBody = (await counterRes.json()) as { counter: { completedCount: number } };
    expect(counterBody.counter.completedCount).toBe(5);
  });

  it("シナリオ: 同じ Idempotency-Key で再送 → 200（保存済み応答。遷移は 1 回のみ）", async () => {
    // spec.md §「同じ Idempotency-Key で 2 回復元しても遷移は 1 回しか起きない」
    //   Given タスク T が { trashedAt: <過去>, trashedReason: "deleted", version: 2 } でゴミ箱にある
    //   When  クライアントが POST /api/v1/trash/<T の id>/restore を Idempotency-Key: "k1", If-Match: 2 で送る
    //   And   サーバが 200 OK を返した後、クライアントが同じヘッダ・同じパスをもう一度送る
    //   Then  2 回目も HTTP 200 OK が返り、レスポンスボディは 1 回目と同じ内容である
    //   And   ストア上の T は version = 3 のまま（version = 4 に進んでいない）
    taskRepo.seed(makeTrashedTask({ id: TASK_ID_1, trashedReason: "deleted", version: 2 }));

    const headers = authHeaders({
      "Idempotency-Key": "restore-idem-k1",
      "If-Match": "2",
    });

    const res1 = await app.request(`/api/v1/trash/${TASK_ID_1}/restore`, {
      method: "POST",
      headers,
    });
    expect(res1.status).toBe(200);
    const body1 = await res1.json();

    const res2 = await app.request(`/api/v1/trash/${TASK_ID_1}/restore`, {
      method: "POST",
      headers,
    });
    expect(res2.status).toBe(200);
    const body2 = await res2.json();

    // 2 回目のレスポンスは 1 回目と同じ
    expect(body2).toEqual(body1);

    // ストアは version = 3 のまま（4 に進んでいない）
    const stored = await taskRepo.findById(TASK_ID_1);
    expect(stored?.version).toBe(3);
  });
});

// ============================================================
// DELETE /api/v1/trash（手動「ゴミ箱を空にする」FR-062 手動）
// ============================================================

describe("DELETE /api/v1/trash (BL-011 ゴミ箱を空にする)", () => {
  it("シナリオ: 認証なしの「空にする」は 401 を返す", async () => {
    // spec.md §「認証なしの「空にする」は 401 を返す」
    //   Given Authorization ヘッダを付けない
    //   When  クライアントが DELETE /api/v1/trash を送る
    //   Then  HTTP 401 Unauthorized が返る
    const res = await app.request("/api/v1/trash", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": "empty-unauth",
      },
    });

    expect(res.status).toBe(401);
  });

  it("シナリオ: ゴミ箱を空にする → 204 No Content、T1・T2 は物理削除される", async () => {
    // spec.md §「ゴミ箱を空にするとゴミ箱の全タスクが物理削除される」
    //   Given ゴミ箱にタスク T1、T2 が存在する
    //   And   通常状態のタスク T3 が存在する
    //   When  クライアントが DELETE /api/v1/trash を送る
    //   Then  HTTP 204 No Content が返る
    //   And   T1、T2 はストアから物理削除されている（GET /api/v1/trash で 0 件）
    //   And   T3 は通常状態のまま残っている
    taskRepo.seed(makeTrashedTask({ id: TASK_ID_1, trashedReason: "deleted" }));
    taskRepo.seed(makeTrashedTask({ id: TASK_ID_2, trashedReason: "completed" }));
    taskRepo.seed(makeTask({ id: TASK_ID_3, name: "アクティブタスク" }));

    const res = await app.request("/api/v1/trash", {
      method: "DELETE",
      headers: authHeaders({ "Idempotency-Key": "empty-trash-1" }),
    });

    expect(res.status).toBe(204);

    // T1, T2 はストアから消えている
    expect(await taskRepo.findById(TASK_ID_1)).toBeNull();
    expect(await taskRepo.findById(TASK_ID_2)).toBeNull();

    // T3 は残っている
    const t3 = await taskRepo.findById(TASK_ID_3);
    expect(t3).not.toBeNull();
    expect(t3?.trashedAt).toBeNull();
  });

  it("シナリオ: 空にした後 GET /trash → { tasks: [] }", async () => {
    // spec.md §「ゴミ箱を空にするとゴミ箱の全タスクが物理削除される」の後続確認
    taskRepo.seed(makeTrashedTask({ id: TASK_ID_1, trashedReason: "deleted" }));
    taskRepo.seed(makeTrashedTask({ id: TASK_ID_2, trashedReason: "completed" }));

    await app.request("/api/v1/trash", {
      method: "DELETE",
      headers: authHeaders({ "Idempotency-Key": "empty-trash-check" }),
    });

    const trashRes = await app.request("/api/v1/trash", {
      method: "GET",
      headers: authHeaders(),
    });
    expect(trashRes.status).toBe(200);
    const body = (await trashRes.json()) as { tasks: unknown[] };
    expect(body.tasks).toEqual([]);
  });

  it("シナリオ: アクティブタスクは DELETE /trash で削除されない", async () => {
    // spec.md §「ゴミ箱を空にするとゴミ箱の全タスクが物理削除される」
    //   And   T3 は通常状態のまま残っている
    taskRepo.seed(makeTrashedTask({ id: TASK_ID_1, trashedReason: "deleted" }));
    taskRepo.seed(makeTask({ id: TASK_ID_3, name: "アクティブタスク" }));

    await app.request("/api/v1/trash", {
      method: "DELETE",
      headers: authHeaders({ "Idempotency-Key": "empty-trash-active-check" }),
    });

    // アクティブタスクは残っている
    const t3 = await taskRepo.findById(TASK_ID_3);
    expect(t3).not.toBeNull();
    expect(t3?.trashedAt).toBeNull();
  });

  it("シナリオ: 既に空のゴミ箱への「空にする」は no-op で 204 を返す", async () => {
    // spec.md §「既に空のゴミ箱への「空にする」は no-op で 204 を返す」
    //   Given ゴミ箱にタスクが 1 件も存在しない
    //   When  クライアントが DELETE /api/v1/trash を送る
    //   Then  HTTP 204 No Content が返る
    const res = await app.request("/api/v1/trash", {
      method: "DELETE",
      headers: authHeaders({ "Idempotency-Key": "empty-trash-noop" }),
    });

    expect(res.status).toBe(204);
  });

  it("シナリオ: 同じ Idempotency-Key で再送 → 204（保存済み応答）", async () => {
    // spec.md §「同じ Idempotency-Key で 2 回「空にする」を送っても結果は同じ」
    //   Given ゴミ箱にタスク T1 が存在する
    //   When  クライアントが DELETE /api/v1/trash を Idempotency-Key: "k1" で送る
    //   And   サーバが 204 を返した後、同じ Idempotency-Key で再送する
    //   Then  2 回目も HTTP 204 No Content が返る
    //   And   ストアへの物理削除は 1 回分のみ（2 回目の DB 操作は発生しない）
    taskRepo.seed(makeTrashedTask({ id: TASK_ID_1, trashedReason: "deleted" }));

    const headers = authHeaders({ "Idempotency-Key": "empty-trash-idem" });

    const res1 = await app.request("/api/v1/trash", {
      method: "DELETE",
      headers,
    });
    expect(res1.status).toBe(204);

    const res2 = await app.request("/api/v1/trash", {
      method: "DELETE",
      headers,
    });
    expect(res2.status).toBe(204);

    // T1 は最初の削除で消えており、2 回目も同じ結果
    expect(await taskRepo.findById(TASK_ID_1)).toBeNull();
  });
});

// ============================================================
// purgeTrash（日次清算、BL-010 との統合）
//
// spec.md §「日次清算（FR-062 purgeTrash）」と 1:1 対応する.
// POST /api/v1/reset 経由で purgeTrash が呼ばれることを HTTP レベルで確認する.
// ============================================================

describe("purgeTrash（日次清算 BL-011 / FR-062）", () => {
  // BL-112 plan.md D-004: 既存シナリオは UTC ベースで書かれているため, CI runner の TZ 設定に
  // 暗黙依存しないように "UTC" を明示する. 挙動の意図変更ではなく前提の明示化であり,
  // 既存 assert はそのまま green を保つ.
  beforeEach(() => {
    vi.stubEnv("TZ", "UTC");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("シナリオ: POST /api/v1/reset で dayBoundaryTime を超えた状態でリセット実行 → 境界時刻より古い trashedAt を持つゴミ箱タスクが物理削除される", async () => {
    // spec.md §「前日の境界時刻より古いゴミ箱タスクが物理削除される」
    //   Given dayBoundaryTime = "04:00"
    //   And   clock.now() = "2026-06-08T10:00:00.000Z"（今日の境界時刻は "2026-06-08T04:00:00.000Z"）
    //   And   タスク T1 が { trashedAt: "2026-06-07T03:59:59.999Z" } でゴミ箱にある（境界より前）
    //   And   タスク T2 が { trashedAt: "2026-06-07T10:00:00.000Z" } でゴミ箱にある（境界より前）
    //   And   タスク T3 が { trashedAt: "2026-06-08T05:00:00.000Z" } でゴミ箱にある（境界以降）
    //   And   タスク T4 が通常状態（trashedAt = null）で存在する
    //   When  POST /api/v1/reset を送る（リセットが実行される）
    //   Then  T1 と T2 はストアから物理削除されている
    //   And   T3 はゴミ箱に残っている（今日の境界時刻以降に入ったため清算対象外）
    //   And   T4 は変更されていない

    // 境界を超えた時刻を使うアプリを構築する
    const built = buildTestApp({ initialTime: TIME_AFTER_BOUNDARY });
    const localApp = built.app;
    const localTaskRepo = built.taskRepository;
    const localCounterRepo = built.counterRepository;
    const localSettingsRepo = built.settingsRepository;

    localSettingsRepo.seed({ dayBoundaryTime: BOUNDARY_TIME });
    // lastResetExecutedAt = null にしてリセットが発動するようにする
    localCounterRepo.seed({ completedCount: 0, lastResetExecutedAt: null });

    // T1: 境界 "2026-06-08T04:00:00.000Z" より古い trashedAt
    localTaskRepo.seed(
      makeTask({
        id: TASK_ID_1,
        trashedAt: "2026-06-07T03:59:59.999Z",
        trashedReason: "deleted",
        updatedAt: "2026-06-07T03:59:59.999Z",
        version: 2,
      }),
    );

    // T2: 昨日の境界より後、今日の境界より前
    localTaskRepo.seed(
      makeTask({
        id: TASK_ID_2,
        trashedAt: "2026-06-07T10:00:00.000Z",
        trashedReason: "completed",
        updatedAt: "2026-06-07T10:00:00.000Z",
        version: 2,
      }),
    );

    // T3: 今日の境界時刻以降（清算対象外）
    localTaskRepo.seed(
      makeTask({
        id: TASK_ID_3,
        trashedAt: "2026-06-08T05:00:00.000Z",
        trashedReason: "deleted",
        updatedAt: "2026-06-08T05:00:00.000Z",
        version: 2,
      }),
    );

    // T4: 通常状態（変更されない）
    localTaskRepo.seed(makeTask({ id: TASK_ID_4, name: "アクティブタスク" }));

    const res = await localApp.request("/api/v1/reset", {
      method: "POST",
      headers: authHeaders({ "Idempotency-Key": "reset-purge-1" }),
    });

    // リセットは成功する
    expect(res.status).toBe(200);
    const body = (await res.json()) as { executed: boolean };
    expect(body.executed).toBe(true);

    // T1, T2 は物理削除されている
    expect(await localTaskRepo.findById(TASK_ID_1)).toBeNull();
    expect(await localTaskRepo.findById(TASK_ID_2)).toBeNull();

    // T3 はゴミ箱に残っている
    const t3 = await localTaskRepo.findById(TASK_ID_3);
    expect(t3).not.toBeNull();
    expect(t3?.trashedAt).toBe("2026-06-08T05:00:00.000Z");

    // T4 は変更されていない
    const t4 = await localTaskRepo.findById(TASK_ID_4);
    expect(t4).not.toBeNull();
    expect(t4?.trashedAt).toBeNull();
  });

  it("シナリオ: ゴミ箱が空の状態で POST /api/v1/reset → エラーなく 200 が返る", async () => {
    // spec.md §「清算対象がない場合は何も削除されない」
    //   Given ゴミ箱にタスクが 0 件
    //   And   リセットが発動する時刻
    //   When  POST /api/v1/reset を送る
    //   Then  HTTP 200 OK でエラーなく返る
    const built = buildTestApp({ initialTime: TIME_AFTER_BOUNDARY });
    const localApp = built.app;
    const localCounterRepo = built.counterRepository;
    const localSettingsRepo = built.settingsRepository;

    localSettingsRepo.seed({ dayBoundaryTime: BOUNDARY_TIME });
    localCounterRepo.seed({ completedCount: 0, lastResetExecutedAt: null });

    const res = await localApp.request("/api/v1/reset", {
      method: "POST",
      headers: authHeaders({ "Idempotency-Key": "reset-empty-trash" }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { executed: boolean };
    expect(body.executed).toBe(true);
  });

  it("シナリオ: GET /api/v1/today 経由の自動リセット（境界時刻超え）で古いゴミ箱タスクが物理削除される", async () => {
    // spec.md §「前日の境界時刻より古いゴミ箱タスクが物理削除される」
    //   Given dayBoundaryTime = "04:00"
    //   And   clock.now() が境界を超えた時刻
    //   And   古いゴミ箱タスク T1（trashedAt < 今日の境界時刻）が存在する
    //   And   新しいゴミ箱タスク T2（trashedAt >= 今日の境界時刻）が存在する
    //   When  GET /api/v1/today を送る（自動リセットが発動する）
    //   Then  HTTP 200 が返る
    //   And   T1 は物理削除されている
    //   And   T2 はゴミ箱に残っている
    const built = buildTestApp({ initialTime: TIME_AFTER_BOUNDARY });
    const localApp = built.app;
    const localTaskRepo = built.taskRepository;
    const localCounterRepo = built.counterRepository;
    const localSettingsRepo = built.settingsRepository;

    localSettingsRepo.seed({ dayBoundaryTime: BOUNDARY_TIME });
    localCounterRepo.seed({ completedCount: 0, lastResetExecutedAt: null });

    // T1: 今日の境界 "2026-06-08T04:00:00.000Z" より古い → 削除対象
    localTaskRepo.seed(
      makeTask({
        id: TASK_ID_1,
        trashedAt: "2026-06-07T10:00:00.000Z",
        trashedReason: "deleted",
        updatedAt: "2026-06-07T10:00:00.000Z",
        version: 2,
      }),
    );

    // T2: 今日の境界以降 → 残る
    localTaskRepo.seed(
      makeTask({
        id: TASK_ID_2,
        trashedAt: "2026-06-08T05:00:00.000Z",
        trashedReason: "completed",
        updatedAt: "2026-06-08T05:00:00.000Z",
        version: 2,
      }),
    );

    const res = await localApp.request("/api/v1/today", {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);

    // T1 は物理削除されている
    expect(await localTaskRepo.findById(TASK_ID_1)).toBeNull();

    // T2 はゴミ箱に残っている
    const t2 = await localTaskRepo.findById(TASK_ID_2);
    expect(t2).not.toBeNull();
    expect(t2?.trashedAt).toBe("2026-06-08T05:00:00.000Z");
  });

  it("シナリオ: 境界時刻より新しい trashedAt を持つゴミ箱タスクは物理削除されない", async () => {
    // spec.md §「清算対象がない場合は何も削除されない」
    //   Given dayBoundaryTime = "04:00"
    //   And   clock.now() = "2026-06-08T10:00:00.000Z"
    //   And   ゴミ箱のタスクが全て { trashedAt >= "2026-06-08T04:00:00.000Z" } である
    //   When  purgeTrash が呼ばれる（POST /api/v1/reset 経由）
    //   Then  ゴミ箱のタスクは削除されない

    const built = buildTestApp({ initialTime: TIME_AFTER_BOUNDARY });
    const localApp = built.app;
    const localTaskRepo = built.taskRepository;
    const localCounterRepo = built.counterRepository;
    const localSettingsRepo = built.settingsRepository;

    localSettingsRepo.seed({ dayBoundaryTime: BOUNDARY_TIME });
    localCounterRepo.seed({ completedCount: 0, lastResetExecutedAt: null });

    // 境界以降の trashedAt を持つゴミ箱タスク（清算対象外）
    localTaskRepo.seed(
      makeTask({
        id: TASK_ID_1,
        trashedAt: TODAY_BOUNDARY_AT, // ちょうど境界時刻
        trashedReason: "deleted",
        updatedAt: TODAY_BOUNDARY_AT,
        version: 2,
      }),
    );

    localTaskRepo.seed(
      makeTask({
        id: TASK_ID_2,
        trashedAt: "2026-06-08T05:00:00.000Z", // 境界より後
        trashedReason: "completed",
        updatedAt: "2026-06-08T05:00:00.000Z",
        version: 2,
      }),
    );

    const res = await localApp.request("/api/v1/reset", {
      method: "POST",
      headers: authHeaders({ "Idempotency-Key": "reset-purge-boundary" }),
    });

    expect(res.status).toBe(200);

    // どちらも削除されない
    expect(await localTaskRepo.findById(TASK_ID_1)).not.toBeNull();
    expect(await localTaskRepo.findById(TASK_ID_2)).not.toBeNull();
  });
});
