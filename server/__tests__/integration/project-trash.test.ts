import type { Hono } from "hono";
/**
 * 結合テスト: Project のゴミ箱経由復元 (BL-119 / project-soft-delete).
 *
 * 受け入れ基準の出典: docs/developer/features/project-soft-delete/spec.md AC-4〜AC-9.
 * trash 系エンドポイント (/api/v1/trash GET / /trash/{id}/restore POST / /trash DELETE) を
 * Task/Project 共用に拡張する (D-1). 新 endpoint は追加しない.
 *
 * 注意: 本ファイルは TDD の "red" を作るためのテスト.
 *       Project のゴミ箱表現 (listTrash の projects 配列 / restore の Project 判別 /
 *       purge の Project 物理削除) は未実装のため, すべて失敗する想定.
 *       implementer が usecase / repository を拡張することで green 化する.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { authHeaders, buildTestApp, TEST_INITIAL_TIME } from "../helpers/build-test-app.js";
import type {
  InMemoryProjectRepository,
  InMemoryTaskRepository,
} from "../helpers/in-memory-repositories.js";

const PROJECT_ID_1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PROJECT_ID_2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const TASK_ID_1 = "11111111-1111-4111-8111-111111111111";

// ゴミ箱投入済みの過去時刻.
const TRASHED_AT = "2026-06-07T08:00:00.000Z";

let app: Hono;
let projectRepo: InMemoryProjectRepository;
let taskRepo: InMemoryTaskRepository;

beforeEach(() => {
  const built = buildTestApp({ initialTime: TEST_INITIAL_TIME });
  app = built.app;
  projectRepo = built.projectRepository;
  taskRepo = built.taskRepository;
});

/** ゴミ箱状態の Project を seed する (trashedAt != null). */
function seedTrashedProject(id: string, name: string, version = 2): void {
  projectRepo.seedProject({
    id,
    name,
    version,
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
// AC-4: GET /api/v1/trash が { tasks, projects } を返し Project を含む
// ============================================================

describe("GET /api/v1/trash (AC-4 ゴミ箱一覧に Project が含まれる)", () => {
  it("シナリオ (AC-4): ゴミ箱内タスク T と ゴミ箱内 Project P がともに返る", async () => {
    //   Given ゴミ箱内のタスク T と ゴミ箱内の Project P が存在する
    //   When  GET /api/v1/trash を実行する
    //   Then  レスポンスは T を含む tasks 配列と P を含む projects 配列を返す
    seedTrashedTask(TASK_ID_1);
    seedTrashedProject(PROJECT_ID_1, "削除済みプロジェクト");

    const res = await app.request("/api/v1/trash", {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      tasks: Array<{ id: string }>;
      projects: Array<{ id: string; name: string; trashedAt: string | null; version: number }>;
    };

    // tasks に T が含まれる (後方互換: tasks キーは維持).
    expect(body.tasks.map((t) => t.id)).toContain(TASK_ID_1);

    // projects に P が含まれる (D-2: TrashedProject = { id, name, trashedAt, version }).
    expect(Array.isArray(body.projects)).toBe(true);
    const p = body.projects.find((x) => x.id === PROJECT_ID_1);
    expect(p).toBeDefined();
    expect(p?.name).toBe("削除済みプロジェクト");
    expect(p?.trashedAt).not.toBeNull();
    expect(p?.version).toBe(2);
  });

  it("シナリオ (AC-4): 通常状態の Project は projects 配列に含まれない", async () => {
    seedTrashedProject(PROJECT_ID_1, "ゴミ箱の P");
    // 通常状態の Project (trashedAt=null) は含まれない.
    projectRepo.seedProject({
      id: PROJECT_ID_2,
      name: "通常の Q",
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
    const body = (await res.json()) as { projects: Array<{ id: string }> };
    const ids = body.projects.map((p) => p.id);
    expect(ids).toContain(PROJECT_ID_1);
    expect(ids).not.toContain(PROJECT_ID_2);
  });
});

// ============================================================
// AC-5: ゴミ箱の Project を復元できる
// ============================================================

describe("POST /api/v1/trash/:id/restore (AC-5 Project 復元)", () => {
  it("シナリオ (AC-5): ゴミ箱の Project を復元 → 200 { project } / trashedAt=null / version+1 / 一覧復帰", async () => {
    //   Given ゴミ箱内の Project P (trashed_at != null, version=2) が存在する
    //   When  POST /api/v1/trash/{P.id}/restore を If-Match: 2 で実行する
    //   Then  HTTP 200 が返り P が返却される
    //   And   P の trashed_at が null になる
    //   And   P の version が 3 に増える
    //   And   GET /api/v1/projects に P が再び含まれる
    seedTrashedProject(PROJECT_ID_1, "復元する P", 2);

    const res = await app.request(`/api/v1/trash/${PROJECT_ID_1}/restore`, {
      method: "POST",
      headers: authHeaders({
        "Idempotency-Key": "restore-project-1",
        "If-Match": "2",
      }),
    });

    expect(res.status).toBe(200);
    // restore レスポンスは Project 復元時 { project } (oneOf の project 枝).
    const body = (await res.json()) as {
      project: { id: string; trashedAt: string | null; version: number };
    };
    expect(body.project.id).toBe(PROJECT_ID_1);
    expect(body.project.trashedAt).toBeNull();
    expect(body.project.version).toBe(3);

    // ストア上も復元されている.
    const stored = await projectRepo.findById(PROJECT_ID_1);
    expect(stored?.trashedAt).toBeNull();
    expect(stored?.version).toBe(3);

    // 通常一覧に再び含まれる.
    const listRes = await app.request("/api/v1/projects", {
      method: "GET",
      headers: authHeaders(),
    });
    const list = (await listRes.json()) as { projects: Array<{ id: string }> };
    expect(list.projects.map((p) => p.id)).toContain(PROJECT_ID_1);
  });

  it("シナリオ (AC-5): 復元後はゴミ箱の projects から消える", async () => {
    seedTrashedProject(PROJECT_ID_1, "復元する P", 2);

    await app.request(`/api/v1/trash/${PROJECT_ID_1}/restore`, {
      method: "POST",
      headers: authHeaders({
        "Idempotency-Key": "restore-project-gone",
        "If-Match": "2",
      }),
    });

    const trashRes = await app.request("/api/v1/trash", {
      method: "GET",
      headers: authHeaders(),
    });
    const body = (await trashRes.json()) as { projects: Array<{ id: string }> };
    expect(body.projects.find((p) => p.id === PROJECT_ID_1)).toBeUndefined();
  });
});

// ============================================================
// AC-6: Project 復元はカスケード復元しない
// ============================================================

describe("POST /api/v1/trash/:id/restore (AC-6 カスケード復元しない)", () => {
  it("シナリオ (AC-6): Project 復元後も NULL 化済みタスクの projectId は元へ戻らない", async () => {
    //   Given Project P を削除した結果 projectId が NULL 化されたタスク T が存在する
    //   When  ゴミ箱から P を復元する
    //   Then  P は通常状態に戻る
    //   And   T.projectId は NULL のまま (元の P.id には戻らない)
    seedTrashedProject(PROJECT_ID_1, "復元する P", 2);
    // 削除時に projectId が NULL 化された (元は P.id) タスク.
    taskRepo.seed({
      id: TASK_ID_1,
      name: "孤立タスク",
      projectId: null,
      dueDate: "today",
      priority: "normal",
      origin: "manual",
      routineId: null,
      createdAt: TEST_INITIAL_TIME,
      updatedAt: TEST_INITIAL_TIME,
      trashedAt: null,
      trashedReason: null,
      version: 2,
    });

    const res = await app.request(`/api/v1/trash/${PROJECT_ID_1}/restore`, {
      method: "POST",
      headers: authHeaders({
        "Idempotency-Key": "restore-no-cascade",
        "If-Match": "2",
      }),
    });

    expect(res.status).toBe(200);

    // P は通常状態に戻る.
    const project = await projectRepo.findById(PROJECT_ID_1);
    expect(project?.trashedAt).toBeNull();

    // T.projectId は NULL のまま (カスケード復元しない).
    const task = await taskRepo.findById(TASK_ID_1);
    expect(task?.projectId).toBeNull();
  });
});

// ============================================================
// AC-8: 復元の楽観ロック (Project)
// ============================================================

describe("POST /api/v1/trash/:id/restore (AC-8 楽観ロック)", () => {
  it("シナリオ (AC-8): 古い version で復元 → 412 + 最新の Project を返す", async () => {
    //   Given ゴミ箱内の Project P (version=2) が存在する
    //   When  POST /api/v1/trash/{P.id}/restore を If-Match: 1 (古い version) で実行する
    //   Then  HTTP 412 が返り 最新の P が返却される
    seedTrashedProject(PROJECT_ID_1, "競合する P", 2);

    const res = await app.request(`/api/v1/trash/${PROJECT_ID_1}/restore`, {
      method: "POST",
      headers: authHeaders({
        "Idempotency-Key": "restore-project-412",
        "If-Match": "1", // 実際の version は 2
      }),
    });

    expect(res.status).toBe(412);
    const body = (await res.json()) as { project: { id: string; version: number } };
    expect(body.project.id).toBe(PROJECT_ID_1);
    expect(body.project.version).toBe(2);

    // ストアは変更されない (まだゴミ箱のまま).
    const stored = await projectRepo.findById(PROJECT_ID_1);
    expect(stored?.version).toBe(2);
    expect(stored?.trashedAt).not.toBeNull();
  });
});

// ============================================================
// AC-9: 通常状態の id を復元しようとするとエラー
// ============================================================

describe("POST /api/v1/trash/:id/restore (AC-9 非ゴミ箱 Project)", () => {
  it("シナリオ (AC-9): 通常状態 (trashedAt=null) の Project を restore → 400 PROJECT_NOT_IN_TRASH", async () => {
    //   Given 通常状態 (trashed_at = null) の Project P が存在する
    //   When  POST /api/v1/trash/{P.id}/restore を実行する
    //   Then  HTTP 400 が返る (PROJECT_NOT_IN_TRASH 相当)
    projectRepo.seedProject({
      id: PROJECT_ID_1,
      name: "通常の P",
      version: 1,
      createdAt: TEST_INITIAL_TIME,
      updatedAt: TEST_INITIAL_TIME,
      trashedAt: null,
    });

    const res = await app.request(`/api/v1/trash/${PROJECT_ID_1}/restore`, {
      method: "POST",
      headers: authHeaders({
        "Idempotency-Key": "restore-not-in-trash",
        "If-Match": "1",
      }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("PROJECT_NOT_IN_TRASH");

    // ストアは変更されない.
    const stored = await projectRepo.findById(PROJECT_ID_1);
    expect(stored?.trashedAt).toBeNull();
    expect(stored?.version).toBe(1);
  });
});

// ============================================================
// AC-7: ゴミ箱を空にすると Project も物理削除される
// ============================================================

describe("DELETE /api/v1/trash (AC-7 Project も物理削除)", () => {
  it("シナリオ (AC-7): ゴミ箱を空にすると Task T と Project P がいずれも物理削除される", async () => {
    //   Given ゴミ箱内のタスク T と ゴミ箱内の Project P が存在する
    //   When  DELETE /api/v1/trash を実行する
    //   Then  T と P がいずれも物理削除される
    //   And   GET /api/v1/trash の tasks 配列・projects 配列がともに空になる
    seedTrashedTask(TASK_ID_1);
    seedTrashedProject(PROJECT_ID_1, "消える P");

    const res = await app.request("/api/v1/trash", {
      method: "DELETE",
      headers: authHeaders({ "Idempotency-Key": "empty-with-project" }),
    });

    expect(res.status).toBe(204);

    // Task / Project ともに物理削除されている.
    expect(await taskRepo.findById(TASK_ID_1)).toBeNull();
    expect(await projectRepo.findById(PROJECT_ID_1)).toBeNull();

    // ゴミ箱一覧が tasks / projects ともに空.
    const trashRes = await app.request("/api/v1/trash", {
      method: "GET",
      headers: authHeaders(),
    });
    const body = (await trashRes.json()) as { tasks: unknown[]; projects: unknown[] };
    expect(body.tasks).toEqual([]);
    expect(body.projects).toEqual([]);
  });

  it("シナリオ (AC-7): 通常状態の Project は DELETE /trash で物理削除されない", async () => {
    projectRepo.seedProject({
      id: PROJECT_ID_2,
      name: "残る通常 P",
      version: 1,
      createdAt: TEST_INITIAL_TIME,
      updatedAt: TEST_INITIAL_TIME,
      trashedAt: null,
    });
    seedTrashedProject(PROJECT_ID_1, "消える P");

    await app.request("/api/v1/trash", {
      method: "DELETE",
      headers: authHeaders({ "Idempotency-Key": "empty-keep-active-project" }),
    });

    // ゴミ箱の P は消えるが、通常状態の P は残る.
    expect(await projectRepo.findById(PROJECT_ID_1)).toBeNull();
    const active = await projectRepo.findById(PROJECT_ID_2);
    expect(active).not.toBeNull();
    expect(active?.trashedAt).toBeNull();
  });
});
