import type { Hono } from "hono";
/**
 * 結合テスト: Routine のゴミ箱経由復元 (BL-120 / routine-soft-delete).
 *
 * 受け入れ基準の出典: docs/developer/features/routine-soft-delete/spec.md AC-5〜AC-10.
 * trash 系エンドポイント (/api/v1/trash GET / /trash/{id}/restore POST / /trash DELETE) を
 * Task/Project/Routine 共用に拡張する (D-1). 新 endpoint は追加しない.
 *
 * 注意: 本ファイルは TDD の "red" を作るためのテスト.
 *       Routine のゴミ箱表現 (listTrash の routines 配列 / restore の Routine 判別 /
 *       purge の Routine 物理削除) は未実装のため, すべて失敗する想定.
 *       implementer が usecase / repository を拡張することで green 化する.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { authHeaders, buildTestApp, TEST_INITIAL_TIME } from "../helpers/build-test-app.js";
import type {
  InMemoryProjectRepository,
  InMemoryRoutineRepository,
  InMemoryTaskRepository,
} from "../helpers/in-memory-repositories.js";

const ROUTINE_ID_1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ROUTINE_ID_2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PROJECT_ID_1 = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const TASK_ID_1 = "11111111-1111-4111-8111-111111111111";

// ゴミ箱投入済みの過去時刻.
const TRASHED_AT = "2026-06-07T08:00:00.000Z";

let app: Hono;
let routineRepo: InMemoryRoutineRepository;
let projectRepo: InMemoryProjectRepository;
let taskRepo: InMemoryTaskRepository;

beforeEach(() => {
  const built = buildTestApp({ initialTime: TEST_INITIAL_TIME });
  app = built.app;
  routineRepo = built.routineRepository;
  projectRepo = built.projectRepository;
  taskRepo = built.taskRepository;
});

/** ゴミ箱状態の Routine を seed する (trashedAt != null). */
function seedTrashedRoutine(id: string, name: string, version = 2): void {
  routineRepo.seed({
    id,
    name,
    daysOfWeek: [1],
    defaultPriority: "normal",
    version,
    createdAt: TEST_INITIAL_TIME,
    updatedAt: TRASHED_AT,
    trashedAt: TRASHED_AT,
  });
}

/** ゴミ箱状態の Project を seed する. */
function seedTrashedProject(id: string, name: string): void {
  projectRepo.seedProject({
    id,
    name,
    version: 2,
    createdAt: TEST_INITIAL_TIME,
    updatedAt: TRASHED_AT,
    trashedAt: TRASHED_AT,
  });
}

/** ゴミ箱状態のタスクを seed する. */
function seedTrashedTask(id: string): void {
  taskRepo.seed({
    id,
    name: "削除済みタスク",
    projectId: null,
    dueDate: "today",
    priority: "normal",
    origin: "manual",
    routineId: null,
    createdAt: TEST_INITIAL_TIME,
    updatedAt: TRASHED_AT,
    trashedAt: TRASHED_AT,
    trashedReason: "deleted",
    version: 2,
  });
}

// ============================================================
// AC-5: GET /api/v1/trash が { tasks, projects, routines } を返し Routine を含む
// ============================================================

describe("GET /api/v1/trash (AC-5 ゴミ箱一覧に Routine が含まれる)", () => {
  it("シナリオ (AC-5): ゴミ箱内タスク T / Project P / Routine R がいずれも返る", async () => {
    //   Given ゴミ箱内のタスク T, ゴミ箱内の Project P, ゴミ箱内の Routine R が存在する
    //   When  GET /api/v1/trash を実行する
    //   Then  レスポンスは T を含む tasks 配列, P を含む projects 配列, R を含む routines 配列を返す
    seedTrashedTask(TASK_ID_1);
    seedTrashedProject(PROJECT_ID_1, "削除済みプロジェクト");
    seedTrashedRoutine(ROUTINE_ID_1, "削除済みルーティン");

    const res = await app.request("/api/v1/trash", {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      tasks: Array<{ id: string }>;
      projects: Array<{ id: string }>;
      routines: Array<{ id: string; name: string; trashedAt: string | null; version: number }>;
    };

    // tasks / projects は後方互換で維持.
    expect(body.tasks.map((t) => t.id)).toContain(TASK_ID_1);
    expect(body.projects.map((p) => p.id)).toContain(PROJECT_ID_1);

    // routines に R が含まれる (D-2: TrashedRoutine = { id, name, trashedAt, version }).
    expect(Array.isArray(body.routines)).toBe(true);
    const r = body.routines.find((x) => x.id === ROUTINE_ID_1);
    expect(r).toBeDefined();
    expect(r?.name).toBe("削除済みルーティン");
    expect(r?.trashedAt).not.toBeNull();
    expect(r?.version).toBe(2);
    // TrashedRoutine は trashedReason / daysOfWeek / defaultPriority を射影に含めない (D-2 / D-6).
    expect((r as unknown as { trashedReason?: unknown }).trashedReason).toBeUndefined();
    expect((r as unknown as { daysOfWeek?: unknown }).daysOfWeek).toBeUndefined();
    expect((r as unknown as { defaultPriority?: unknown }).defaultPriority).toBeUndefined();
  });

  it("シナリオ (AC-5): 通常状態の Routine は routines 配列に含まれない", async () => {
    seedTrashedRoutine(ROUTINE_ID_1, "ゴミ箱の R");
    // 通常状態の Routine (trashedAt=null) は含まれない.
    routineRepo.seed({
      id: ROUTINE_ID_2,
      name: "通常の S",
      daysOfWeek: [2],
      defaultPriority: "normal",
      version: 1,
      createdAt: TEST_INITIAL_TIME,
      updatedAt: TEST_INITIAL_TIME,
      trashedAt: null,
    });

    const res = await app.request("/api/v1/trash", {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { routines: Array<{ id: string }> };
    const ids = body.routines.map((r) => r.id);
    expect(ids).toContain(ROUTINE_ID_1);
    expect(ids).not.toContain(ROUTINE_ID_2);
  });
});

// ============================================================
// AC-6: ゴミ箱の Routine を復元できる
// ============================================================

describe("POST /api/v1/trash/:id/restore (AC-6 Routine 復元)", () => {
  it("シナリオ (AC-6): ゴミ箱の Routine を復元 → 200 { routine } / trashedAt=null / version+1 / 一覧復帰", async () => {
    //   Given ゴミ箱内の Routine R (trashed_at != null, version=2) が存在する
    //   When  POST /api/v1/trash/{R.id}/restore を If-Match: 2 で実行する
    //   Then  HTTP 200 が返り R が返却される
    //   And   R の trashed_at が null になる
    //   And   R の version が 3 に増える
    //   And   GET /api/v1/routines に R が再び含まれる
    seedTrashedRoutine(ROUTINE_ID_1, "復元する R", 2);

    const res = await app.request(`/api/v1/trash/${ROUTINE_ID_1}/restore`, {
      method: "POST",
      headers: authHeaders({
        "Idempotency-Key": "restore-routine-1",
        "If-Match": "2",
      }),
    });

    expect(res.status).toBe(200);
    // restore レスポンスは Routine 復元時 { routine } (oneOf の routine 枝).
    const body = (await res.json()) as {
      routine: { id: string; trashedAt: string | null; version: number };
    };
    expect(body.routine.id).toBe(ROUTINE_ID_1);
    expect(body.routine.trashedAt).toBeNull();
    expect(body.routine.version).toBe(3);

    // ストア上も復元されている.
    const stored = await routineRepo.findById(ROUTINE_ID_1);
    expect((stored as unknown as { trashedAt: string | null })?.trashedAt).toBeNull();
    expect(stored?.version).toBe(3);

    // 通常一覧に再び含まれる.
    const listRes = await app.request("/api/v1/routines", {
      method: "GET",
      headers: authHeaders(),
    });
    const list = (await listRes.json()) as { routines: Array<{ id: string }> };
    expect(list.routines.map((r) => r.id)).toContain(ROUTINE_ID_1);
  });

  it("シナリオ (AC-6): 復元後はゴミ箱の routines から消える", async () => {
    seedTrashedRoutine(ROUTINE_ID_1, "復元する R", 2);

    await app.request(`/api/v1/trash/${ROUTINE_ID_1}/restore`, {
      method: "POST",
      headers: authHeaders({
        "Idempotency-Key": "restore-routine-gone",
        "If-Match": "2",
      }),
    });

    const trashRes = await app.request("/api/v1/trash", {
      method: "GET",
      headers: authHeaders(),
    });
    const body = (await trashRes.json()) as { routines: Array<{ id: string }> };
    expect(body.routines.find((r) => r.id === ROUTINE_ID_1)).toBeUndefined();
  });
});

// ============================================================
// AC-7: Routine 復元はデタッチしたタスクを再紐付けしない
// ============================================================

describe("POST /api/v1/trash/:id/restore (AC-7 再紐付けしない)", () => {
  it("シナリオ (AC-7): Routine 復元後も NULL 化済みタスクの routineId は元へ戻らない", async () => {
    //   Given Routine R を削除した結果 routineId が NULL 化されたタスク T が存在する
    //   When  ゴミ箱から R を復元する
    //   Then  R は通常状態に戻る
    //   And   T.routineId は NULL のまま (元の R.id には戻らない)
    seedTrashedRoutine(ROUTINE_ID_1, "復元する R", 2);
    // 削除時に routineId が NULL 化された (元は R.id) タスク.
    taskRepo.seed({
      id: TASK_ID_1,
      name: "孤立ルーティンタスク",
      projectId: null,
      dueDate: "today",
      priority: "normal",
      origin: "routine",
      routineId: null,
      createdAt: TEST_INITIAL_TIME,
      updatedAt: TEST_INITIAL_TIME,
      trashedAt: null,
      trashedReason: null,
      version: 2,
    });

    const res = await app.request(`/api/v1/trash/${ROUTINE_ID_1}/restore`, {
      method: "POST",
      headers: authHeaders({
        "Idempotency-Key": "restore-routine-no-reattach",
        "If-Match": "2",
      }),
    });

    expect(res.status).toBe(200);

    // R は通常状態に戻る.
    const routine = await routineRepo.findById(ROUTINE_ID_1);
    expect((routine as unknown as { trashedAt: string | null })?.trashedAt).toBeNull();

    // T.routineId は NULL のまま (再紐付けしない).
    const task = await taskRepo.findById(TASK_ID_1);
    expect(task?.routineId).toBeNull();
  });
});

// ============================================================
// AC-9: 復元の楽観ロック (Routine)
// ============================================================

describe("POST /api/v1/trash/:id/restore (AC-9 楽観ロック)", () => {
  it("シナリオ (AC-9): 古い version で復元 → 412 + 最新の Routine を返す", async () => {
    //   Given ゴミ箱内の Routine R (version=2) が存在する
    //   When  POST /api/v1/trash/{R.id}/restore を If-Match: 1 (古い version) で実行する
    //   Then  HTTP 412 が返り 最新の R が返却される
    seedTrashedRoutine(ROUTINE_ID_1, "競合する R", 2);

    const res = await app.request(`/api/v1/trash/${ROUTINE_ID_1}/restore`, {
      method: "POST",
      headers: authHeaders({
        "Idempotency-Key": "restore-routine-412",
        "If-Match": "1", // 実際の version は 2
      }),
    });

    expect(res.status).toBe(412);
    const body = (await res.json()) as { routine: { id: string; version: number } };
    expect(body.routine.id).toBe(ROUTINE_ID_1);
    expect(body.routine.version).toBe(2);

    // ストアは変更されない (まだゴミ箱のまま).
    const stored = await routineRepo.findById(ROUTINE_ID_1);
    expect(stored?.version).toBe(2);
    expect((stored as unknown as { trashedAt: string | null })?.trashedAt).not.toBeNull();
  });
});

// ============================================================
// AC-10: 通常状態の id を復元しようとするとエラー
// ============================================================

describe("POST /api/v1/trash/:id/restore (AC-10 非ゴミ箱 Routine)", () => {
  it("シナリオ (AC-10): 通常状態 (trashedAt=null) の Routine を restore → 400 ROUTINE_NOT_IN_TRASH", async () => {
    //   Given 通常状態 (trashed_at = null) の Routine R が存在する
    //   When  POST /api/v1/trash/{R.id}/restore を実行する
    //   Then  HTTP 400 が返る (ROUTINE_NOT_IN_TRASH 相当)
    routineRepo.seed({
      id: ROUTINE_ID_1,
      name: "通常の R",
      daysOfWeek: [1],
      defaultPriority: "normal",
      version: 1,
      createdAt: TEST_INITIAL_TIME,
      updatedAt: TEST_INITIAL_TIME,
      trashedAt: null,
    });

    const res = await app.request(`/api/v1/trash/${ROUTINE_ID_1}/restore`, {
      method: "POST",
      headers: authHeaders({
        "Idempotency-Key": "restore-routine-not-in-trash",
        "If-Match": "1",
      }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("ROUTINE_NOT_IN_TRASH");

    // ストアは変更されない.
    const stored = await routineRepo.findById(ROUTINE_ID_1);
    expect((stored as unknown as { trashedAt: string | null })?.trashedAt).toBeNull();
    expect(stored?.version).toBe(1);
  });
});

// ============================================================
// AC-8: ゴミ箱を空にすると Routine も物理削除される
// ============================================================

describe("DELETE /api/v1/trash (AC-8 Routine も物理削除)", () => {
  it("シナリオ (AC-8): ゴミ箱を空にすると Task T / Project P / Routine R がいずれも物理削除される", async () => {
    //   Given ゴミ箱内のタスク T, ゴミ箱内の Project P, ゴミ箱内の Routine R が存在する
    //   When  DELETE /api/v1/trash を実行する
    //   Then  T と P と R がいずれも物理削除される
    //   And   GET /api/v1/trash の tasks / projects / routines 配列がいずれも空になる
    seedTrashedTask(TASK_ID_1);
    seedTrashedProject(PROJECT_ID_1, "消える P");
    seedTrashedRoutine(ROUTINE_ID_1, "消える R");

    const res = await app.request("/api/v1/trash", {
      method: "DELETE",
      headers: authHeaders({ "Idempotency-Key": "empty-with-routine" }),
    });

    expect(res.status).toBe(204);

    // Task / Project / Routine がいずれも物理削除されている.
    expect(await taskRepo.findById(TASK_ID_1)).toBeNull();
    expect(await projectRepo.findById(PROJECT_ID_1)).toBeNull();
    expect(await routineRepo.findById(ROUTINE_ID_1)).toBeNull();

    // ゴミ箱一覧が tasks / projects / routines いずれも空.
    const trashRes = await app.request("/api/v1/trash", {
      method: "GET",
      headers: authHeaders(),
    });
    const body = (await trashRes.json()) as {
      tasks: unknown[];
      projects: unknown[];
      routines: unknown[];
    };
    expect(body.tasks).toEqual([]);
    expect(body.projects).toEqual([]);
    expect(body.routines).toEqual([]);
  });

  it("シナリオ (AC-8): 通常状態の Routine は DELETE /trash で物理削除されない", async () => {
    routineRepo.seed({
      id: ROUTINE_ID_2,
      name: "残る通常 R",
      daysOfWeek: [2],
      defaultPriority: "normal",
      version: 1,
      createdAt: TEST_INITIAL_TIME,
      updatedAt: TEST_INITIAL_TIME,
      trashedAt: null,
    });
    seedTrashedRoutine(ROUTINE_ID_1, "消える R");

    await app.request("/api/v1/trash", {
      method: "DELETE",
      headers: authHeaders({ "Idempotency-Key": "empty-keep-active-routine" }),
    });

    // ゴミ箱の R は消えるが、通常状態の R は残る.
    expect(await routineRepo.findById(ROUTINE_ID_1)).toBeNull();
    const active = await routineRepo.findById(ROUTINE_ID_2);
    expect(active).not.toBeNull();
    expect((active as unknown as { trashedAt: string | null })?.trashedAt).toBeNull();
  });
});
