import type { Hono } from "hono";
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
// 起票時の優先度 (BL-002 / FR-003)
//
// spec.md (task-priority) §「起票時の優先度 (FR-003)」 で本 feature に追加された
// シナリオ. priority を省略すると "normal" になることは既存テスト
// 「タスク名のみでタスクを起票できる」(L48-) で担保済のため再掲しない.
// ここでは「priority を明示できる」2 ケースのみ新規追加する.
// ============================================================

describe("POST /api/v1/tasks (起票時の優先度 BL-002)", () => {
  it('シナリオ: 起票時に priority = "highest" を明示できる (BL-002 / FR-003)', async () => {
    const res = await app.request("/api/v1/tasks", {
      method: "POST",
      headers: authHeaders({ "Idempotency-Key": TASK_ID_1 }),
      body: JSON.stringify({ id: TASK_ID_1, name: "x", priority: "highest" }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as { task: { priority: string } };
    expect(body.task.priority).toBe("highest");
  });

  it('シナリオ: 起票時に priority = "later" を明示できる (BL-002 / FR-003)', async () => {
    const res = await app.request("/api/v1/tasks", {
      method: "POST",
      headers: authHeaders({ "Idempotency-Key": TASK_ID_1 }),
      body: JSON.stringify({ id: TASK_ID_1, name: "x", priority: "later" }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as { task: { priority: string } };
    expect(body.task.priority).toBe("later");
  });
});

// ============================================================
// 優先度の変更 (BL-002 / FR-004)
//
// spec.md (task-priority) §「優先度の変更 (FR-004)」 と 1:1 対応.
// PATCH /api/v1/tasks/{id} で priority を受理する経路を担保する.
// 共通経路 (If-Match, Idempotency-Key, 楽観ロック, 404, 401) は BL-001 で担保済のため再掲しない.
// ============================================================

describe("PATCH /api/v1/tasks/{id} (優先度の変更 BL-002)", () => {
  it("シナリオ: PATCH で priority を normal から highest に変更できる", async () => {
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
        "Idempotency-Key": "patch-priority-1",
      }),
      body: JSON.stringify({ priority: "highest" }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      task: {
        priority: string;
        version: number;
        createdAt: string;
        name: string;
        projectId: string | null;
        dueDate: string;
      };
    };
    expect(body.task.priority).toBe("highest");
    expect(body.task.version).toBe(2);
    // createdAt は変更されない (BL-001 既存挙動の継承)
    expect(body.task.createdAt).toBe(TEST_INITIAL_TIME);
    // 他のフィールドは変更されない
    expect(body.task.name).toBe("x");
    expect(body.task.projectId).toBeNull();
    expect(body.task.dueDate).toBe("today");

    // ストア側にも反映されている
    const after = await taskRepo.findById(TASK_ID_1);
    expect(after?.priority).toBe("highest");
    expect(after?.version).toBe(2);
  });

  it("シナリオ: PATCH で priority を later から highest に変更できる", async () => {
    taskRepo.seed({
      id: TASK_ID_1,
      name: "x",
      projectId: null,
      dueDate: "today",
      priority: "later",
      origin: "manual",
      routineId: null,
      createdAt: TEST_INITIAL_TIME,
      updatedAt: TEST_INITIAL_TIME,
      trashedAt: null,
      trashedReason: null,
      version: 3,
    });

    const res = await app.request(`/api/v1/tasks/${TASK_ID_1}`, {
      method: "PATCH",
      headers: authHeaders({
        "If-Match": "3",
        "Idempotency-Key": "patch-priority-2",
      }),
      body: JSON.stringify({ priority: "highest" }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { task: { priority: string; version: number } };
    expect(body.task.priority).toBe("highest");
    expect(body.task.version).toBe(4);
  });

  it("シナリオ: PATCH で priority を normal から later に変更できる", async () => {
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
        "Idempotency-Key": "patch-priority-3",
      }),
      body: JSON.stringify({ priority: "later" }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { task: { priority: string; version: number } };
    expect(body.task.priority).toBe("later");
    expect(body.task.version).toBe(2);
  });

  it("シナリオ: PATCH で priority を値域外に変更しようとすると 400 INVALID_PRIORITY が返り, ストアは不変", async () => {
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
        "Idempotency-Key": "patch-priority-invalid",
      }),
      body: JSON.stringify({ priority: "urgent" }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("INVALID_PRIORITY");

    // ストアの T は priority "normal", version 1 のまま
    const after = await taskRepo.findById(TASK_ID_1);
    expect(after?.priority).toBe("normal");
    expect(after?.version).toBe(1);
  });

  it("シナリオ: PATCH で name と priority を同時に変更できる", async () => {
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
        "Idempotency-Key": "patch-priority-combined",
      }),
      body: JSON.stringify({ name: "y", priority: "later" }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      task: { name: string; priority: string; version: number };
    };
    expect(body.task).toMatchObject({
      name: "y",
      priority: "later",
      version: 2,
    });
  });
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
// 名称編集 (追加) - 不在 projectId の参照整合性 (plan.md §例外処理表)
// ============================================================

describe("PATCH /api/v1/tasks/{id} (projectId 参照整合性)", () => {
  it("シナリオ: 編集時に不在の projectId を指定すると 400 PROJECT_NOT_FOUND が返る", async () => {
    // plan.md §例外処理表で「PROJECT_NOT_FOUND は起票・編集の両方」と明記.
    // 起票時の同名シナリオと同じ assert スタイル.
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
    // projectRepo にはどのプロジェクトも seed しない (= 全 ID 不在)

    const res = await app.request(`/api/v1/tasks/${TASK_ID_1}`, {
      method: "PATCH",
      headers: authHeaders({
        "If-Match": "1",
        "Idempotency-Key": "patch-project-missing",
      }),
      body: JSON.stringify({ projectId: "non-existent-project-id" }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("PROJECT_NOT_FOUND");

    // ストアは変更されない (projectId 不変, version 不変)
    const after = await taskRepo.findById(TASK_ID_1);
    expect(after?.projectId).toBeNull();
    expect(after?.version).toBe(1);
  });
});

// ============================================================
// Idempotency-Key 欠落 (NFR-020, plan.md §例外処理表, ADR-0010)
// ============================================================

describe("POST /api/v1/tasks (Idempotency-Key 必須)", () => {
  it("シナリオ: Idempotency-Key ヘッダ欠落の起票は 400 MISSING_IDEMPOTENCY_KEY が返る", async () => {
    // 全書き込み系で Idempotency-Key は必須 (plan.md §例外処理表, ADR-0010).
    const res = await app.request("/api/v1/tasks", {
      method: "POST",
      headers: {
        // 認証は通すが Idempotency-Key だけ意図的に外す.
        Authorization: `Bearer ${TEST_AUTH_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ id: TASK_ID_1, name: "x" }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("MISSING_IDEMPOTENCY_KEY");

    // タスクは作成されない
    expect(taskRepo.all()).toHaveLength(0);
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
// 完了アクション (BL-003 / FR-006 / FR-060)
//
// spec.md (task-complete) §「API: 完了アクションの正常系」「API: 完了と削除の区別」
// 「API: 楽観ロック / 冪等性 / 認証」「API: ゴミ箱状態のタスクへの再完了 / クロス遷移」と 1:1 対応する.
// 共通経路 (Idempotency-Key middleware, 認証 middleware) は BL-001 で担保済のため,
// 本 feature では完了固有の分岐 (trashedReason の差 / 既ゴミ箱状態への no-op) を重点的に検証する.
//
// test-designer のスタブ (server/src/app.ts: POST /tasks/:id/complete → 501) のため,
// 以下のテストはすべて red になる. implementer が green 化する.
// ============================================================

describe("POST /api/v1/tasks/{id}/complete (BL-003 完了アクション)", () => {
  it("シナリオ: 通常状態のタスクを完了するとゴミ箱状態 (completed) になる", async () => {
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

    const res = await app.request(`/api/v1/tasks/${TASK_ID_1}/complete`, {
      method: "POST",
      headers: authHeaders({
        "If-Match": "1",
        "Idempotency-Key": "complete-1",
      }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      task: {
        id: string;
        trashedAt: string | null;
        trashedReason: string | null;
        version: number;
        createdAt: string;
      };
    };
    expect(body.task.id).toBe(TASK_ID_1);
    expect(body.task.trashedAt).not.toBeNull();
    expect(body.task.trashedReason).toBe("completed");
    expect(body.task.version).toBe(2);
    // createdAt は不変
    expect(body.task.createdAt).toBe(TEST_INITIAL_TIME);

    // ストア側にも反映
    const after = await taskRepo.findById(TASK_ID_1);
    expect(after?.trashedAt).not.toBeNull();
    expect(after?.trashedReason).toBe("completed");
    expect(after?.version).toBe(2);
  });

  it("シナリオ: 完了済タスクは既定の一覧 (?trashed=false) から外れる", async () => {
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

    // 完了
    const completeRes = await app.request(`/api/v1/tasks/${TASK_ID_1}/complete`, {
      method: "POST",
      headers: authHeaders({
        "If-Match": "1",
        "Idempotency-Key": "complete-list-default",
      }),
    });
    expect(completeRes.status).toBe(200);

    // 既定 (?trashed=false) では完了済が出ない
    const listRes = await app.request("/api/v1/tasks", {
      method: "GET",
      headers: authHeaders(),
    });
    expect(listRes.status).toBe(200);
    const list = (await listRes.json()) as { tasks: Array<{ id: string }> };
    expect(list.tasks.find((t) => t.id === TASK_ID_1)).toBeUndefined();
  });

  it("シナリオ: 完了済タスクは trashed=true の一覧で参照できる (trashedReason = 'completed')", async () => {
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

    const completeRes = await app.request(`/api/v1/tasks/${TASK_ID_1}/complete`, {
      method: "POST",
      headers: authHeaders({
        "If-Match": "1",
        "Idempotency-Key": "complete-list-trashed",
      }),
    });
    expect(completeRes.status).toBe(200);

    const listRes = await app.request("/api/v1/tasks?trashed=true", {
      method: "GET",
      headers: authHeaders(),
    });
    expect(listRes.status).toBe(200);
    const list = (await listRes.json()) as {
      tasks: Array<{ id: string; trashedReason: string | null }>;
    };
    const found = list.tasks.find((t) => t.id === TASK_ID_1);
    expect(found).toBeDefined();
    expect(found?.trashedReason).toBe("completed");
  });

  it("シナリオ: 完了は削除と異なる trashedReason を記録する ('completed' であって 'deleted' ではない)", async () => {
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

    const res = await app.request(`/api/v1/tasks/${TASK_ID_1}/complete`, {
      method: "POST",
      headers: authHeaders({
        "If-Match": "1",
        "Idempotency-Key": "complete-vs-delete",
      }),
    });
    expect(res.status).toBe(200);
    const after = await taskRepo.findById(TASK_ID_1);
    expect(after?.trashedReason).toBe("completed");
    expect(after?.trashedReason).not.toBe("deleted");
  });

  it("シナリオ: 古い If-Match で完了しようとすると 412 + 現行 task が返り, ストアは不変", async () => {
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

    const res = await app.request(`/api/v1/tasks/${TASK_ID_1}/complete`, {
      method: "POST",
      headers: authHeaders({
        "If-Match": "1",
        "Idempotency-Key": "complete-stale",
      }),
    });

    expect(res.status).toBe(412);
    const body = (await res.json()) as {
      task: { name: string; version: number; trashedAt: string | null };
    };
    expect(body.task.name).toBe("current");
    expect(body.task.version).toBe(2);

    const after = await taskRepo.findById(TASK_ID_1);
    expect(after?.trashedAt).toBeNull();
    expect(after?.version).toBe(2);
  });

  it("シナリオ: If-Match ヘッダ欠落の完了リクエストは 400 MISSING_IF_MATCH", async () => {
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

    const res = await app.request(`/api/v1/tasks/${TASK_ID_1}/complete`, {
      method: "POST",
      headers: authHeaders({ "Idempotency-Key": "complete-no-if-match" }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("MISSING_IF_MATCH");

    // ストア不変
    const after = await taskRepo.findById(TASK_ID_1);
    expect(after?.trashedAt).toBeNull();
    expect(after?.version).toBe(1);
  });

  it("シナリオ: Idempotency-Key 欠落の完了リクエストは 400 MISSING_IDEMPOTENCY_KEY", async () => {
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

    const res = await app.request(`/api/v1/tasks/${TASK_ID_1}/complete`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TEST_AUTH_TOKEN}`,
        "Content-Type": "application/json",
        "If-Match": "1",
      },
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("MISSING_IDEMPOTENCY_KEY");
  });

  it("シナリオ: 同じ Idempotency-Key で 2 回送信しても遷移は 1 回のみ (version は 2 のまま)", async () => {
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

    const headers = authHeaders({
      "If-Match": "1",
      "Idempotency-Key": "complete-idem-1",
    });

    const res1 = await app.request(`/api/v1/tasks/${TASK_ID_1}/complete`, {
      method: "POST",
      headers,
    });
    expect(res1.status).toBe(200);
    const body1 = await res1.json();

    const res2 = await app.request(`/api/v1/tasks/${TASK_ID_1}/complete`, {
      method: "POST",
      headers,
    });
    expect(res2.status).toBe(200);
    const body2 = await res2.json();

    // 2 回目は 1 回目と完全同一の応答
    expect(body2).toEqual(body1);

    // ストアは version 2 のまま (3 に進んでいない)
    const after = await taskRepo.findById(TASK_ID_1);
    expect(after?.version).toBe(2);
    expect(after?.trashedReason).toBe("completed");

    // IdempotencyStore に保管されている
    expect(await idempotencyStore.get("complete-idem-1")).not.toBeNull();
  });

  it("シナリオ: 認証なしの完了リクエストは 401 を返し, ストアは不変", async () => {
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

    const res = await app.request(`/api/v1/tasks/${TASK_ID_1}/complete`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "If-Match": "1",
        "Idempotency-Key": "complete-unauth",
      },
    });

    expect(res.status).toBe(401);

    const after = await taskRepo.findById(TASK_ID_1);
    expect(after?.trashedAt).toBeNull();
    expect(after?.version).toBe(1);
  });

  it("シナリオ: 存在しないタスクへの完了は 404 TASK_NOT_FOUND", async () => {
    const res = await app.request(`/api/v1/tasks/${TASK_ID_3}/complete`, {
      method: "POST",
      headers: authHeaders({
        "If-Match": "1",
        "Idempotency-Key": "complete-404",
      }),
    });

    expect(res.status).toBe(404);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("TASK_NOT_FOUND");
  });

  it("シナリオ: 既 'completed' のタスクへの再 complete は 200 no-op (version / trashedAt / trashedReason 不変)", async () => {
    // plan.md D-003: 既完了は no-op で 200 OK + 現行 task. If-Match 検証もスキップ.
    const existingTrashedAt = "2026-06-06T12:00:00.000Z";
    taskRepo.seed({
      id: TASK_ID_1,
      name: "x",
      projectId: null,
      dueDate: "today",
      priority: "normal",
      origin: "manual",
      routineId: null,
      createdAt: TEST_INITIAL_TIME,
      updatedAt: existingTrashedAt,
      trashedAt: existingTrashedAt,
      trashedReason: "completed",
      version: 5,
    });

    const res = await app.request(`/api/v1/tasks/${TASK_ID_1}/complete`, {
      method: "POST",
      headers: authHeaders({
        // If-Match を意図的に古い値で送っても no-op として扱われる (D-003: 既完了は If-Match 検証スキップ).
        "If-Match": "1",
        "Idempotency-Key": "complete-noop-already-completed",
      }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      task: { trashedAt: string | null; trashedReason: string | null; version: number };
    };
    expect(body.task.trashedAt).toBe(existingTrashedAt);
    expect(body.task.trashedReason).toBe("completed");
    expect(body.task.version).toBe(5);

    // ストア不変
    const after = await taskRepo.findById(TASK_ID_1);
    expect(after?.trashedAt).toBe(existingTrashedAt);
    expect(after?.trashedReason).toBe("completed");
    expect(after?.version).toBe(5);
  });

  it("シナリオ: 既 'deleted' のタスクへの complete は 200 no-op (trashedReason は 'deleted' のまま)", async () => {
    // plan.md D-003 / R-002: 削除済を完了で上書きしない. BL-008 集計 / BL-011 復元の意味を壊さないため.
    const existingTrashedAt = "2026-06-06T12:00:00.000Z";
    taskRepo.seed({
      id: TASK_ID_1,
      name: "x",
      projectId: null,
      dueDate: "today",
      priority: "normal",
      origin: "manual",
      routineId: null,
      createdAt: TEST_INITIAL_TIME,
      updatedAt: existingTrashedAt,
      trashedAt: existingTrashedAt,
      trashedReason: "deleted",
      version: 5,
    });

    const res = await app.request(`/api/v1/tasks/${TASK_ID_1}/complete`, {
      method: "POST",
      headers: authHeaders({
        "If-Match": "5",
        "Idempotency-Key": "complete-noop-already-deleted",
      }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      task: { trashedAt: string | null; trashedReason: string | null; version: number };
    };
    // trashedReason は "deleted" のまま (上書きしない)
    expect(body.task.trashedReason).toBe("deleted");
    expect(body.task.version).toBe(5);

    // ストア不変 (特に trashedReason が "completed" に書き換わっていない)
    const after = await taskRepo.findById(TASK_ID_1);
    expect(after?.trashedReason).toBe("deleted");
    expect(after?.version).toBe(5);
  });
});

// ============================================================
// BL-038 / tomorrow-view: GET /api/v1/tasks?dueDate=today|tomorrow
//
// spec.md (tomorrow-view) §「サーバ実装の補強」 / §「受け入れ基準」§「サーバ API の補強」
// と 1:1 対応する. plan.md §「サーバ補強の手順」 手順 4.
//
// 観点:
//   1. ?dueDate=tomorrow で tomorrow タスクのみが返る.
//   2. ?dueDate=today    で today タスクのみが返る.
//   3. ?dueDate 未指定で両方の dueDate を返す (既存挙動の維持 / 後方互換).
//   4. 不正値 ?dueDate=yesterday は寛容バリデーション (= 全件返す).
//      既存 ?trashed の不正値挙動と整合 (D-002 / U-010).
//   5. ?dueDate と ?trashed の AND 直交 (trashed=true で tomorrow のゴミ箱のみが返る).
//
// 本テストはサーバ側 (server/src/app.ts の dueDate query parse + repo 拡張)
// が未実装のため red になる. implementer が手順 1〜3 で green 化する.
// ============================================================

describe("GET /api/v1/tasks (BL-038 ?dueDate フィルタ)", () => {
  /**
   * 共通 seed: タスク A (dueDate="today") とタスク B (dueDate="tomorrow") を
   * 起票済みの状態で投入する.
   *
   * - 並び順検証もしやすいよう createdAt をずらす.
   * - priority は両方 normal にしておき, dueDate フィルタの効果のみを観察する.
   */
  function seedTwoTasksOfDifferentDueDates(): void {
    taskRepo.seed({
      id: TASK_ID_1,
      name: "today-task",
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
    taskRepo.seed({
      id: TASK_ID_2,
      name: "tomorrow-task",
      projectId: null,
      dueDate: "tomorrow",
      priority: "normal",
      origin: "manual",
      routineId: null,
      createdAt: "2026-06-07T09:00:01.000Z",
      updatedAt: "2026-06-07T09:00:01.000Z",
      trashedAt: null,
      trashedReason: null,
      version: 1,
    });
  }

  it("シナリオ A: ?dueDate=tomorrow は dueDate=tomorrow のタスクのみを返す", async () => {
    seedTwoTasksOfDifferentDueDates();

    const res = await app.request("/api/v1/tasks?dueDate=tomorrow", {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const list = (await res.json()) as {
      tasks: Array<{ id: string; dueDate: string }>;
    };
    expect(list.tasks).toHaveLength(1);
    expect(list.tasks[0]?.id).toBe(TASK_ID_2);
    expect(list.tasks[0]?.dueDate).toBe("tomorrow");
    // today タスクは含まれない.
    expect(list.tasks.find((t) => t.id === TASK_ID_1)).toBeUndefined();
  });

  it("シナリオ B: ?dueDate=today は dueDate=today のタスクのみを返す", async () => {
    seedTwoTasksOfDifferentDueDates();

    const res = await app.request("/api/v1/tasks?dueDate=today", {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const list = (await res.json()) as {
      tasks: Array<{ id: string; dueDate: string }>;
    };
    expect(list.tasks).toHaveLength(1);
    expect(list.tasks[0]?.id).toBe(TASK_ID_1);
    expect(list.tasks[0]?.dueDate).toBe("today");
    // tomorrow タスクは含まれない.
    expect(list.tasks.find((t) => t.id === TASK_ID_2)).toBeUndefined();
  });

  it("シナリオ C: ?dueDate 未指定は既存挙動 (両方の dueDate を返す) を維持する", async () => {
    seedTwoTasksOfDifferentDueDates();

    const res = await app.request("/api/v1/tasks", {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const list = (await res.json()) as {
      tasks: Array<{ id: string; dueDate: string }>;
    };
    // 両方の dueDate が含まれる (= 既存挙動の不変).
    expect(list.tasks).toHaveLength(2);
    const ids = list.tasks.map((t) => t.id).sort();
    expect(ids).toEqual([TASK_ID_1, TASK_ID_2].sort());
  });

  it("シナリオ D: ?dueDate に不正値 (yesterday) を渡しても 400 にせず無視する (= 全件返す)", async () => {
    // spec U-010 / D-002: 既存 ?trashed パラメータの寛容バリデーションと整合.
    seedTwoTasksOfDifferentDueDates();

    const res = await app.request("/api/v1/tasks?dueDate=yesterday", {
      method: "GET",
      headers: authHeaders(),
    });

    // 400 にならず 200 が返る.
    expect(res.status).toBe(200);
    const list = (await res.json()) as {
      tasks: Array<{ id: string }>;
    };
    // dueDate フィルタなしと同じ応答 (両方含まれる).
    expect(list.tasks).toHaveLength(2);
    const ids = list.tasks.map((t) => t.id).sort();
    expect(ids).toEqual([TASK_ID_1, TASK_ID_2].sort());
  });

  it("シナリオ E (?dueDate と ?trashed の直交性): trashed=true&dueDate=tomorrow はゴミ箱内の tomorrow タスクのみを返す", async () => {
    // tomorrow タスクをゴミ箱に, today タスクは通常状態のまま seed する.
    taskRepo.seed({
      id: TASK_ID_1,
      name: "today-task",
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
    taskRepo.seed({
      id: TASK_ID_2,
      name: "tomorrow-task-trashed",
      projectId: null,
      dueDate: "tomorrow",
      priority: "normal",
      origin: "manual",
      routineId: null,
      createdAt: "2026-06-07T09:00:01.000Z",
      updatedAt: "2026-06-07T09:00:02.000Z",
      trashedAt: "2026-06-07T09:00:02.000Z",
      trashedReason: "deleted",
      version: 2,
    });

    // trashed 未指定 + dueDate=tomorrow → ゴミ箱の tomorrow は出ない.
    const resActive = await app.request("/api/v1/tasks?dueDate=tomorrow", {
      method: "GET",
      headers: authHeaders(),
    });
    expect(resActive.status).toBe(200);
    const activeList = (await resActive.json()) as {
      tasks: Array<{ id: string }>;
    };
    expect(activeList.tasks.find((t) => t.id === TASK_ID_2)).toBeUndefined();

    // trashed=true + dueDate=tomorrow → ゴミ箱内の tomorrow タスクのみが返る.
    const resTrashed = await app.request("/api/v1/tasks?dueDate=tomorrow&trashed=true", {
      method: "GET",
      headers: authHeaders(),
    });
    expect(resTrashed.status).toBe(200);
    const trashedList = (await resTrashed.json()) as {
      tasks: Array<{ id: string; dueDate: string; trashedReason: string | null }>;
    };
    expect(trashedList.tasks).toHaveLength(1);
    expect(trashedList.tasks[0]?.id).toBe(TASK_ID_2);
    expect(trashedList.tasks[0]?.dueDate).toBe("tomorrow");
    expect(trashedList.tasks[0]?.trashedReason).toBe("deleted");
    // today タスク (通常状態) は trashed=true では返らない.
    expect(trashedList.tasks.find((t) => t.id === TASK_ID_1)).toBeUndefined();
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
