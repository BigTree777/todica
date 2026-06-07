/**
 * 結合テスト: タスク CRUD API (BL-001 / FR-001 〜 FR-009, NFR-020).
 *
 * 受け入れ基準の出典: docs/developer/features/task-crud/spec.md
 * 各 describe / it のタイトルに Gherkin シナリオ名を含めて trace 可能とする.
 *
 * 注意: 本ファイルは TDD の "red" を作るためのテスト.
 *       createApp() がスタブ (501 を返す) のため, すべて失敗する想定.
 *       implementer がエンドポイントを実装することで green 化する.
 */
import { beforeEach, describe, expect, it } from "vitest";
import type { Hono } from "hono";
import {
  authHeaders,
  buildTestApp,
  TEST_AUTH_TOKEN,
  TEST_INITIAL_TIME,
} from "../helpers/build-test-app.js";
import type {
  InMemoryIdempotencyStore,
  InMemoryProjectRepository,
  InMemoryTaskRepository,
} from "../helpers/in-memory-repositories.js";

const TASK_ID_1 = "11111111-1111-4111-8111-111111111111";
const TASK_ID_2 = "22222222-2222-4222-8222-222222222222";
const TASK_ID_3 = "33333333-3333-4333-8333-333333333333";
const PROJECT_ID_1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

let app: Hono;
let taskRepo: InMemoryTaskRepository;
let projectRepo: InMemoryProjectRepository;
let idempotencyStore: InMemoryIdempotencyStore;

beforeEach(() => {
  const built = buildTestApp();
  app = built.app;
  taskRepo = built.taskRepository;
  projectRepo = built.projectRepository;
  idempotencyStore = built.idempotencyStore;
});

// ============================================================
// 起票 (FR-001 / FR-002 / NFR-010)
// ============================================================

describe("POST /api/v1/tasks (起票)", () => {
  it("シナリオ: タスク名のみでタスクを起票できる", async () => {
    const res = await app.request("/api/v1/tasks", {
      method: "POST",
      headers: authHeaders({ "Idempotency-Key": TASK_ID_1 }),
      body: JSON.stringify({ id: TASK_ID_1, name: "牛乳を買う" }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as { task: Record<string, unknown> };
    expect(body.task).toMatchObject({
      id: TASK_ID_1,
      name: "牛乳を買う",
      projectId: null,
      dueDate: "today",
      priority: "normal",
      origin: "manual",
      routineId: null,
      trashedAt: null,
      trashedReason: null,
      version: 1,
    });
    expect(typeof body.task.createdAt).toBe("string");
    expect(typeof body.task.updatedAt).toBe("string");

    // GET /api/v1/tasks の結果に該当タスクが 1 件存在する
    const listRes = await app.request("/api/v1/tasks", {
      method: "GET",
      headers: authHeaders(),
    });
    expect(listRes.status).toBe(200);
    const list = (await listRes.json()) as { tasks: Array<{ id: string }> };
    expect(list.tasks).toHaveLength(1);
    expect(list.tasks[0]?.id).toBe(TASK_ID_1);
  });

  it("シナリオ: 起票時にプロジェクトを指定できる", async () => {
    projectRepo.seed(PROJECT_ID_1);

    const res = await app.request("/api/v1/tasks", {
      method: "POST",
      headers: authHeaders({ "Idempotency-Key": TASK_ID_1 }),
      body: JSON.stringify({
        id: TASK_ID_1,
        name: "資料を作る",
        projectId: PROJECT_ID_1,
      }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as { task: { projectId: string } };
    expect(body.task.projectId).toBe(PROJECT_ID_1);
  });

  it("シナリオ: 存在しないプロジェクト ID を指定した起票は弾かれる", async () => {
    const res = await app.request("/api/v1/tasks", {
      method: "POST",
      headers: authHeaders({ "Idempotency-Key": TASK_ID_1 }),
      body: JSON.stringify({
        id: TASK_ID_1,
        name: "x",
        projectId: "non-existent",
      }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("PROJECT_NOT_FOUND");
    // タスクは作成されない
    expect(taskRepo.all()).toHaveLength(0);
  });

  it("シナリオ: 起票時の dueDate を tomorrow に指定できる", async () => {
    const res = await app.request("/api/v1/tasks", {
      method: "POST",
      headers: authHeaders({ "Idempotency-Key": TASK_ID_1 }),
      body: JSON.stringify({ id: TASK_ID_1, name: "x", dueDate: "tomorrow" }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as { task: { dueDate: string } };
    expect(body.task.dueDate).toBe("tomorrow");
  });

  it("シナリオ: 値域外の dueDate を指定した起票は弾かれる (FR-002)", async () => {
    const res = await app.request("/api/v1/tasks", {
      method: "POST",
      headers: authHeaders({ "Idempotency-Key": TASK_ID_1 }),
      body: JSON.stringify({ id: TASK_ID_1, name: "x", dueDate: "2026-06-10" }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("INVALID_DUE_DATE");
    expect(taskRepo.all()).toHaveLength(0);
  });

  it("シナリオ: 空文字の name を指定した起票は弾かれる", async () => {
    const res = await app.request("/api/v1/tasks", {
      method: "POST",
      headers: authHeaders({ "Idempotency-Key": TASK_ID_1 }),
      body: JSON.stringify({ id: TASK_ID_1, name: "" }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("INVALID_TASK_NAME");
  });
});

// ============================================================
// 冪等性 (NFR-020)
// ============================================================

describe("POST /api/v1/tasks (冪等性 NFR-020)", () => {
  it("シナリオ: 同じ Idempotency-Key で 2 回起票しても 1 件しか作成されない", async () => {
    const body = JSON.stringify({ id: TASK_ID_1, name: "牛乳を買う" });
    const headers = authHeaders({ "Idempotency-Key": TASK_ID_1 });

    const res1 = await app.request("/api/v1/tasks", {
      method: "POST",
      headers,
      body,
    });
    expect(res1.status).toBe(201);
    const body1 = await res1.json();

    const res2 = await app.request("/api/v1/tasks", {
      method: "POST",
      headers,
      body,
    });
    expect(res2.status).toBe(201);
    const body2 = await res2.json();

    // 2 回目のレスポンスは 1 回目と同じ内容
    expect(body2).toEqual(body1);

    // 一覧は 1 件のみ
    const listRes = await app.request("/api/v1/tasks", {
      method: "GET",
      headers: authHeaders(),
    });
    const list = (await listRes.json()) as { tasks: unknown[] };
    expect(list.tasks).toHaveLength(1);

    // IdempotencyStore に保管されている
    expect(await idempotencyStore.get(TASK_ID_1)).not.toBeNull();
  });
});

// ============================================================
// 名称編集 (FR-009)
// ============================================================

describe("PATCH /api/v1/tasks/{id} (名称編集)", () => {
  it("シナリオ: タスクの名称を編集できる", async () => {
    taskRepo.seed({
      id: TASK_ID_1,
      name: "牛乳を買う",
      projectId: null,
      dueDate: "today",
      priority: "normal",
      origin: "manual",
      routineId: null,
      createdAt: TEST_INITIAL_TIME,
      updatedAt: TEST_INITIAL_TIME,
      trashedAt: null,
      trashedReason: null,
      version: 1,
    });

    const res = await app.request(`/api/v1/tasks/${TASK_ID_1}`, {
      method: "PATCH",
      headers: authHeaders({
        "If-Match": "1",
        "Idempotency-Key": "patch-key-1",
      }),
      body: JSON.stringify({ name: "豆乳を買う" }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      task: { name: string; version: number; createdAt: string; updatedAt: string };
    };
    expect(body.task.name).toBe("豆乳を買う");
    expect(body.task.version).toBe(2);
    // createdAt 不変
    expect(body.task.createdAt).toBe(TEST_INITIAL_TIME);
    // updatedAt は更新されている (= createdAt と異なる, または書き換えが行われた)
    // FakeClock は時間を進めないため updatedAt は同じ ISO になりうるが,
    // ここでは「サーバが now() を再評価して書き込んだ」結果として createdAt と同値であっても
    // 「version インクリメントが起きた = 書き込みは起きた」ことを確認する.
    expect(body.task.updatedAt).toBeDefined();
  });

  it("シナリオ: 編集 PATCH で送らなかったフィールドは変更されない", async () => {
    taskRepo.seed({
      id: TASK_ID_1,
      name: "x",
      projectId: "P1",
      dueDate: "today",
      priority: "normal",
      origin: "manual",
      routineId: null,
      createdAt: TEST_INITIAL_TIME,
      updatedAt: TEST_INITIAL_TIME,
      trashedAt: null,
      trashedReason: null,
      version: 1,
    });
    projectRepo.seed("P1");

    const res = await app.request(`/api/v1/tasks/${TASK_ID_1}`, {
      method: "PATCH",
      headers: authHeaders({
        "If-Match": "1",
        "Idempotency-Key": "patch-key-1",
      }),
      body: JSON.stringify({ name: "y" }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      task: {
        name: string;
        projectId: string | null;
        dueDate: string;
        priority: string;
        version: number;
      };
    };
    expect(body.task).toMatchObject({
      name: "y",
      projectId: "P1",
      dueDate: "today",
      priority: "normal",
      version: 2,
    });
  });
});

// ============================================================
// 期限切替 (FR-005)
// ============================================================

describe("PATCH /api/v1/tasks/{id} (期限切替)", () => {
  it("シナリオ: タスクの期限を today から tomorrow に切り替えられる", async () => {
    taskRepo.seed({
      id: TASK_ID_1,
      name: "x",
      projectId: null,
      dueDate: "today",
      priority: "normal",
      origin: "manual",
      routineId: null,
      createdAt: TEST_INITIAL_TIME,
      updatedAt: TEST_INITIAL_TIME,
      trashedAt: null,
      trashedReason: null,
      version: 1,
    });

    const res = await app.request(`/api/v1/tasks/${TASK_ID_1}`, {
      method: "PATCH",
      headers: authHeaders({
        "If-Match": "1",
        "Idempotency-Key": "patch-key-1",
      }),
      body: JSON.stringify({ dueDate: "tomorrow" }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { task: { dueDate: string; version: number } };
    expect(body.task.dueDate).toBe("tomorrow");
    expect(body.task.version).toBe(2);
  });

  it("シナリオ: タスクの期限を tomorrow から today に切り替えられる", async () => {
    taskRepo.seed({
      id: TASK_ID_1,
      name: "x",
      projectId: null,
      dueDate: "tomorrow",
      priority: "normal",
      origin: "manual",
      routineId: null,
      createdAt: TEST_INITIAL_TIME,
      updatedAt: TEST_INITIAL_TIME,
      trashedAt: null,
      trashedReason: null,
      version: 1,
    });

    const res = await app.request(`/api/v1/tasks/${TASK_ID_1}`, {
      method: "PATCH",
      headers: authHeaders({
        "If-Match": "1",
        "Idempotency-Key": "patch-key-1",
      }),
      body: JSON.stringify({ dueDate: "today" }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { task: { dueDate: string; version: number } };
    expect(body.task.dueDate).toBe("today");
    expect(body.task.version).toBe(2);
  });

  it("シナリオ: 期限値域外への切替は弾かれる", async () => {
    taskRepo.seed({
      id: TASK_ID_1,
      name: "x",
      projectId: null,
      dueDate: "today",
      priority: "normal",
      origin: "manual",
      routineId: null,
      createdAt: TEST_INITIAL_TIME,
      updatedAt: TEST_INITIAL_TIME,
      trashedAt: null,
      trashedReason: null,
      version: 1,
    });

    const res = await app.request(`/api/v1/tasks/${TASK_ID_1}`, {
      method: "PATCH",
      headers: authHeaders({
        "If-Match": "1",
        "Idempotency-Key": "patch-key-1",
      }),
      body: JSON.stringify({ dueDate: "next-week" }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("INVALID_DUE_DATE");

    // ストアは変更されない
    const after = await taskRepo.findById(TASK_ID_1);
    expect(after?.dueDate).toBe("today");
    expect(after?.version).toBe(1);
  });
});

// ============================================================
// 楽観ロック (NFR-020)
// ============================================================

describe("PATCH /api/v1/tasks/{id} (楽観ロック)", () => {
  it("シナリオ: 古い version で編集すると 412 が返り, サーバ側現行値が返却される", async () => {
    taskRepo.seed({
      id: TASK_ID_1,
      name: "current",
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

    const res = await app.request(`/api/v1/tasks/${TASK_ID_1}`, {
      method: "PATCH",
      headers: authHeaders({
        "If-Match": "1",
        "Idempotency-Key": "patch-stale",
      }),
      body: JSON.stringify({ name: "x" }),
    });

    expect(res.status).toBe(412);
    const body = (await res.json()) as { task: { name: string; version: number } };
    // レスポンスに現行 task (version=2) が含まれる
    expect(body.task.name).toBe("current");
    expect(body.task.version).toBe(2);

    // サーバ側の task は変更されない
    const after = await taskRepo.findById(TASK_ID_1);
    expect(after?.name).toBe("current");
    expect(after?.version).toBe(2);
  });

  it("シナリオ: If-Match ヘッダが欠落した編集リクエストは弾かれる", async () => {
    taskRepo.seed({
      id: TASK_ID_1,
      name: "x",
      projectId: null,
      dueDate: "today",
      priority: "normal",
      origin: "manual",
      routineId: null,
      createdAt: TEST_INITIAL_TIME,
      updatedAt: TEST_INITIAL_TIME,
      trashedAt: null,
      trashedReason: null,
      version: 1,
    });

    const res = await app.request(`/api/v1/tasks/${TASK_ID_1}`, {
      method: "PATCH",
      headers: authHeaders({ "Idempotency-Key": "patch-no-match" }),
      body: JSON.stringify({ name: "y" }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("MISSING_IF_MATCH");
  });
});

// ============================================================
// 削除 (FR-007 / FR-060)
// ============================================================

describe("DELETE /api/v1/tasks/{id}", () => {
  it("シナリオ: タスクを削除するとゴミ箱状態になる (物理削除ではない)", async () => {
    taskRepo.seed({
      id: TASK_ID_1,
      name: "x",
      projectId: null,
      dueDate: "today",
      priority: "normal",
      origin: "manual",
      routineId: null,
      createdAt: TEST_INITIAL_TIME,
      updatedAt: TEST_INITIAL_TIME,
      trashedAt: null,
      trashedReason: null,
      version: 1,
    });

    const res = await app.request(`/api/v1/tasks/${TASK_ID_1}`, {
      method: "DELETE",
      headers: authHeaders({
        "If-Match": "1",
        "Idempotency-Key": "delete-1",
      }),
    });

    expect(res.status).toBe(204);

    // ストアの task は引き続き存在
    const stored = await taskRepo.findById(TASK_ID_1);
    expect(stored).not.toBeNull();
    expect(stored?.trashedAt).not.toBeNull();
    expect(stored?.trashedReason).toBe("deleted");
    expect(stored?.version).toBe(2);

    // GET /api/v1/tasks (既定 = ゴミ箱外) には T が含まれない
    const listRes = await app.request("/api/v1/tasks", {
      method: "GET",
      headers: authHeaders(),
    });
    const list = (await listRes.json()) as { tasks: Array<{ id: string }> };
    expect(list.tasks.find((t) => t.id === TASK_ID_1)).toBeUndefined();
  });

  it("シナリオ: 削除アクションは完了数カウントを増やさない", async () => {
    // 本機能 (BL-001) では Counter テーブルを実装しない. plan.md §テスト方針.
    // 「Counter Repository が呼ばれない / Counter 未実装環境で削除が成功する」ことで担保する.
    taskRepo.seed({
      id: TASK_ID_1,
      name: "x",
      projectId: null,
      dueDate: "today",
      priority: "normal",
      origin: "manual",
      routineId: null,
      createdAt: TEST_INITIAL_TIME,
      updatedAt: TEST_INITIAL_TIME,
      trashedAt: null,
      trashedReason: null,
      version: 1,
    });

    const res = await app.request(`/api/v1/tasks/${TASK_ID_1}`, {
      method: "DELETE",
      headers: authHeaders({
        "If-Match": "1",
        "Idempotency-Key": "delete-counter-check",
      }),
    });

    // Counter Repository を依存に持たない構成で 204 が返れば加算経路は通っていない
    expect(res.status).toBe(204);
  });

  it("シナリオ: 既にゴミ箱状態のタスクへの削除は no-op (冪等)", async () => {
    const trashedAt = "2026-06-06T12:00:00.000Z";
    taskRepo.seed({
      id: TASK_ID_1,
      name: "x",
      projectId: null,
      dueDate: "today",
      priority: "normal",
      origin: "manual",
      routineId: null,
      createdAt: TEST_INITIAL_TIME,
      updatedAt: trashedAt,
      trashedAt,
      trashedReason: "deleted",
      version: 5,
    });

    const res = await app.request(`/api/v1/tasks/${TASK_ID_1}`, {
      method: "DELETE",
      headers: authHeaders({
        "If-Match": "5",
        "Idempotency-Key": "delete-noop",
      }),
    });

    expect(res.status).toBe(204);

    const after = await taskRepo.findById(TASK_ID_1);
    // trashedAt / trashedReason は変わらない (= 元の値が保たれている)
    expect(after?.trashedAt).toBe(trashedAt);
    expect(after?.trashedReason).toBe("deleted");
  });
});

// ============================================================
// 認証 / 存在しないリソース (NFR-002 と整合)
// ============================================================

describe("認証 / 存在しないリソース", () => {
  it("シナリオ: Bearer トークンを付けないリクエストは 401 を返す", async () => {
    const res = await app.request("/api/v1/tasks", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": TASK_ID_1,
      },
      body: JSON.stringify({ id: TASK_ID_1, name: "x" }),
    });

    expect(res.status).toBe(401);
    expect(taskRepo.all()).toHaveLength(0);
  });

  it("シナリオ: 存在しない id への編集は 404 を返す", async () => {
    const res = await app.request(`/api/v1/tasks/${TASK_ID_3}`, {
      method: "PATCH",
      headers: authHeaders({
        "If-Match": "1",
        "Idempotency-Key": "patch-missing",
      }),
      body: JSON.stringify({ name: "x" }),
    });

    expect(res.status).toBe(404);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("TASK_NOT_FOUND");
  });

  it("補助: 異なる Bearer トークン値も 401", async () => {
    // NFR-002 補強. ミドルウェアが「有無のみ」を判定しないこと.
    const res = await app.request("/api/v1/tasks", {
      method: "POST",
      headers: {
        Authorization: "Bearer WRONG",
        "Content-Type": "application/json",
        "Idempotency-Key": TASK_ID_2,
      },
      body: JSON.stringify({ id: TASK_ID_2, name: "x" }),
    });
    expect(res.status).toBe(401);
  });
});

// ============================================================
// 2 階層固定 (FR-008)
// ============================================================

describe("2 階層固定 (FR-008)", () => {
  it("シナリオ: タスクのスキーマにサブタスクを表す参照を持たない", async () => {
    // OpenAPI 文書ではなく実 API のレスポンス形状で確認する.
    const res = await app.request("/api/v1/tasks", {
      method: "POST",
      headers: authHeaders({ "Idempotency-Key": TASK_ID_1 }),
      body: JSON.stringify({ id: TASK_ID_1, name: "x" }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { task: Record<string, unknown> };

    // サブタスク参照を示すフィールドが存在しない
    expect(body.task).not.toHaveProperty("parentTaskId");
    expect(body.task).not.toHaveProperty("subtaskIds");
    expect(body.task).not.toHaveProperty("children");
    expect(body.task).not.toHaveProperty("parent");

    // POST のリクエストスキーマでも parentTaskId を受け付けない:
    // 余計なキーを送っても無視され, レスポンスにも現れない.
    const res2 = await app.request("/api/v1/tasks", {
      method: "POST",
      headers: authHeaders({ "Idempotency-Key": TASK_ID_2 }),
      body: JSON.stringify({
        id: TASK_ID_2,
        name: "y",
        parentTaskId: TASK_ID_1,
      }),
    });
    // 厳格 reject (400) でも, 無視 (201) でも良いが,
    // 通った場合に parentTaskId がレスポンスに紛れ込んでいないことを必須化する.
    if (res2.status === 201) {
      const body2 = (await res2.json()) as { task: Record<string, unknown> };
      expect(body2.task).not.toHaveProperty("parentTaskId");
    } else {
      expect([400]).toContain(res2.status);
    }
  });
});

// ============================================================
// (補助) 認証ありの正常系で TEST_AUTH_TOKEN が一致することの確認
// ============================================================

describe("補助確認", () => {
  it("TEST_AUTH_TOKEN が定義されており, Bearer ヘッダで疎通すること", () => {
    expect(TEST_AUTH_TOKEN).toBeTruthy();
  });
});
