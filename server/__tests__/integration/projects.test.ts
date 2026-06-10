import type { Hono } from "hono";
/**
 * 結合テスト: プロジェクト CRUD API (BL-016 / FR-020 〜 FR-022).
 *
 * 受け入れ基準の出典: docs/developer/features/project-crud/spec.md
 * 各 describe / it のタイトルに Gherkin シナリオ名を含めて trace 可能とする.
 *
 * 注意: 本ファイルは TDD の "red" を作るためのテスト.
 *       エンドポイント未実装のため, すべて失敗する想定.
 *       implementer がエンドポイントを実装することで green 化する.
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  TEST_AUTH_TOKEN,
  TEST_INITIAL_TIME,
  authHeaders,
  buildTestApp,
} from "../helpers/build-test-app.js";
import type {
  InMemoryIdempotencyStore,
  InMemoryProjectRepository,
  InMemoryTaskRepository,
} from "../helpers/in-memory-repositories.js";

const PROJECT_ID_1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PROJECT_ID_2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const TASK_ID_1 = "11111111-1111-4111-8111-111111111111";

let app: Hono;
let projectRepo: InMemoryProjectRepository;
let taskRepo: InMemoryTaskRepository;
let idempotencyStore: InMemoryIdempotencyStore;

beforeEach(() => {
  const built = buildTestApp();
  app = built.app;
  projectRepo = built.projectRepository;
  taskRepo = built.taskRepository;
  idempotencyStore = built.idempotencyStore;
});

// ============================================================
// プロジェクト作成 (FR-020)
// spec.md §「プロジェクト作成（FR-020）」と 1:1 対応する.
// ============================================================

describe("POST /api/v1/projects (プロジェクト作成 FR-020)", () => {
  it("シナリオ: 正常系 - プロジェクトを作成できる", async () => {
    // Given 認証済みクライアントが Idempotency-Key ヘッダを付与している
    // When  POST /api/v1/projects に { name: "仕事" } を送信する
    // Then  201 Created で { project: { id, name: "仕事", version: 1, createdAt, updatedAt } } が返る
    // And   GET /api/v1/projects の一覧に "仕事" が含まれる
    const res = await app.request("/api/v1/projects", {
      method: "POST",
      headers: authHeaders({ "Idempotency-Key": PROJECT_ID_1 }),
      body: JSON.stringify({ id: PROJECT_ID_1, name: "仕事" }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as { project: Record<string, unknown> };
    expect(body.project).toMatchObject({
      id: PROJECT_ID_1,
      name: "仕事",
      version: 1,
    });
    expect(typeof body.project.createdAt).toBe("string");
    expect(typeof body.project.updatedAt).toBe("string");

    // 一覧に含まれている
    const listRes = await app.request("/api/v1/projects", {
      method: "GET",
      headers: authHeaders(),
    });
    expect(listRes.status).toBe(200);
    const list = (await listRes.json()) as { projects: Array<{ name: string }> };
    expect(list.projects.some((p) => p.name === "仕事")).toBe(true);
  });

  it("シナリオ: 正常系 - 同名プロジェクトを複数作成できる (プロジェクト名の一意性保証なし)", async () => {
    // Given "仕事" という名前のプロジェクトがすでに存在する
    // When  POST /api/v1/projects に { name: "仕事" } を別の Idempotency-Key で送信する
    // Then  201 Created で新しいプロジェクトが返る
    // And   GET /api/v1/projects の一覧に "仕事" が 2 件含まれる
    projectRepo.seedProject({
      id: PROJECT_ID_1,
      name: "仕事",
      version: 1,
      createdAt: TEST_INITIAL_TIME,
      updatedAt: TEST_INITIAL_TIME,
    });

    const res = await app.request("/api/v1/projects", {
      method: "POST",
      headers: authHeaders({ "Idempotency-Key": PROJECT_ID_2 }),
      body: JSON.stringify({ id: PROJECT_ID_2, name: "仕事" }),
    });

    expect(res.status).toBe(201);

    const listRes = await app.request("/api/v1/projects", {
      method: "GET",
      headers: authHeaders(),
    });
    const list = (await listRes.json()) as { projects: Array<{ name: string }> };
    expect(list.projects.filter((p) => p.name === "仕事")).toHaveLength(2);
  });

  it("シナリオ: 冪等性 - 同じ Idempotency-Key で 2 回 POST すると 1 件しか作成されない", async () => {
    // Given 認証済みクライアントが同じ Idempotency-Key でリクエストを送信する
    // When  POST /api/v1/projects に同じ Idempotency-Key で 2 回送信する
    // Then  2 回目は 1 回目と同じ 201 レスポンスが返る
    // And   プロジェクトは 1 件のみ作成されている
    const reqBody = JSON.stringify({ id: PROJECT_ID_1, name: "仕事" });
    const headers = authHeaders({ "Idempotency-Key": PROJECT_ID_1 });

    const res1 = await app.request("/api/v1/projects", {
      method: "POST",
      headers,
      body: reqBody,
    });
    expect(res1.status).toBe(201);
    const body1 = await res1.json();

    const res2 = await app.request("/api/v1/projects", {
      method: "POST",
      headers,
      body: reqBody,
    });
    expect(res2.status).toBe(201);
    const body2 = await res2.json();

    // 2 回目のレスポンスは 1 回目と同じ内容
    expect(body2).toEqual(body1);

    // 一覧は 1 件のみ
    const listRes = await app.request("/api/v1/projects", {
      method: "GET",
      headers: authHeaders(),
    });
    const list = (await listRes.json()) as { projects: unknown[] };
    expect(list.projects).toHaveLength(1);

    // IdempotencyStore に保管されている
    expect(await idempotencyStore.get(PROJECT_ID_1)).not.toBeNull();
  });

  it("シナリオ: バリデーション - 空の name は拒否される", async () => {
    // Given 認証済みクライアントが Idempotency-Key ヘッダを付与している
    // When  POST /api/v1/projects に { name: "" } を送信する
    // Then  400 Bad Request で { code: "INVALID_PROJECT_NAME" } が返る
    const res = await app.request("/api/v1/projects", {
      method: "POST",
      headers: authHeaders({ "Idempotency-Key": PROJECT_ID_1 }),
      body: JSON.stringify({ id: PROJECT_ID_1, name: "" }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("INVALID_PROJECT_NAME");
    expect(projectRepo.all()).toHaveLength(0);
  });

  it("シナリオ: バリデーション - 201 文字以上の name は拒否される", async () => {
    // Given 認証済みクライアントが Idempotency-Key ヘッダを付与している
    // When  POST /api/v1/projects に 201 文字の name を送信する
    // Then  400 Bad Request で { code: "INVALID_PROJECT_NAME" } が返る
    const name201 = "あ".repeat(201);
    const res = await app.request("/api/v1/projects", {
      method: "POST",
      headers: authHeaders({ "Idempotency-Key": PROJECT_ID_1 }),
      body: JSON.stringify({ id: PROJECT_ID_1, name: name201 }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("INVALID_PROJECT_NAME");
    expect(projectRepo.all()).toHaveLength(0);
  });

  it("シナリオ: バリデーション - 200 文字の name は受け付けられる (境界値)", async () => {
    // 200 文字は仕様上限値 (1〜200 文字) → 201 になると弾かれる境界を確認する
    const name200 = "a".repeat(200);
    const res = await app.request("/api/v1/projects", {
      method: "POST",
      headers: authHeaders({ "Idempotency-Key": PROJECT_ID_1 }),
      body: JSON.stringify({ id: PROJECT_ID_1, name: name200 }),
    });

    expect(res.status).toBe(201);
  });

  it("シナリオ: バリデーション - 制御文字を含む name は拒否される", async () => {
    // Given 認証済みクライアントが Idempotency-Key ヘッダを付与している
    // When  POST /api/v1/projects に制御文字（例: "\x01"）を含む name を送信する
    // Then  400 Bad Request で { code: "INVALID_PROJECT_NAME" } が返る
    const res = await app.request("/api/v1/projects", {
      method: "POST",
      headers: authHeaders({ "Idempotency-Key": PROJECT_ID_1 }),
      body: JSON.stringify({ id: PROJECT_ID_1, name: "仕事\x01メモ" }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("INVALID_PROJECT_NAME");
    expect(projectRepo.all()).toHaveLength(0);
  });

  it("シナリオ: Idempotency-Key なしは拒否される (MISSING_IDEMPOTENCY_KEY)", async () => {
    // Given 認証済みクライアントが Idempotency-Key ヘッダを付与していない
    // When  POST /api/v1/projects に { name: "仕事" } を送信する
    // Then  400 Bad Request で { code: "MISSING_IDEMPOTENCY_KEY" } が返る
    const res = await app.request("/api/v1/projects", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TEST_AUTH_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ id: PROJECT_ID_1, name: "仕事" }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("MISSING_IDEMPOTENCY_KEY");
    expect(projectRepo.all()).toHaveLength(0);
  });

  it("シナリオ: 認証なしは拒否される (401)", async () => {
    // Given 未認証クライアントがリクエストを送信する
    // When  POST /api/v1/projects に { name: "仕事" } を送信する
    // Then  401 Unauthorized が返る
    const res = await app.request("/api/v1/projects", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": PROJECT_ID_1,
      },
      body: JSON.stringify({ id: PROJECT_ID_1, name: "仕事" }),
    });

    expect(res.status).toBe(401);
    expect(projectRepo.all()).toHaveLength(0);
  });
});

// ============================================================
// プロジェクト一覧取得
// spec.md §「プロジェクト一覧取得」と 1:1 対応する.
// ============================================================

describe("GET /api/v1/projects (プロジェクト一覧取得)", () => {
  it("シナリオ: 正常系 - プロジェクト一覧が name 昇順で返る", async () => {
    // Given "仕事" と "個人" という名前のプロジェクトが存在する
    // When  GET /api/v1/projects を送信する
    // Then  200 OK で { projects: [...] } が返る
    // And   一覧は name 昇順（"個人", "仕事" の順）である
    projectRepo.seedProject({
      id: PROJECT_ID_1,
      name: "仕事",
      version: 1,
      createdAt: TEST_INITIAL_TIME,
      updatedAt: TEST_INITIAL_TIME,
    });
    projectRepo.seedProject({
      id: PROJECT_ID_2,
      name: "個人",
      version: 1,
      createdAt: TEST_INITIAL_TIME,
      updatedAt: TEST_INITIAL_TIME,
    });

    const res = await app.request("/api/v1/projects", {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { projects: Array<{ name: string }> };
    expect(body.projects).toHaveLength(2);
    // name 昇順: Unicode コードポイント順 (BINARY コレーション)
    // "仕" = U+4ED5 < "個" = U+500B なので "仕事" < "個人"
    expect(body.projects[0]?.name).toBe("仕事");
    expect(body.projects[1]?.name).toBe("個人");
  });

  it("シナリオ: 正常系 - プロジェクトが 0 件のとき空配列が返る", async () => {
    // Given プロジェクトが 1 件も存在しない
    // When  GET /api/v1/projects を送信する
    // Then  200 OK で { projects: [] } が返る
    const res = await app.request("/api/v1/projects", {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { projects: unknown[] };
    expect(body.projects).toHaveLength(0);
  });

  it("シナリオ: 認証なしは拒否される (401)", async () => {
    // Given 未認証クライアントがリクエストを送信する
    // When  GET /api/v1/projects を送信する
    // Then  401 Unauthorized が返る
    const res = await app.request("/api/v1/projects", {
      method: "GET",
    });

    expect(res.status).toBe(401);
  });
});

// ============================================================
// プロジェクト名称変更 (FR-021)
// spec.md §「プロジェクト名称変更（FR-021）」と 1:1 対応する.
// ============================================================

describe("PATCH /api/v1/projects/:id (プロジェクト名称変更 FR-021)", () => {
  it("シナリオ: 正常系 - プロジェクトの名称を変更できる (version+1)", async () => {
    // Given プロジェクト（id: "p-1", name: "仕事", version: 1）が存在する
    // When  PATCH /api/v1/projects/p-1 に If-Match: 1, Idempotency-Key 付きで { name: "仕事2" } を送信する
    // Then  200 OK で { project: { id: "p-1", name: "仕事2", version: 2, updatedAt: <更新後> } } が返る
    projectRepo.seedProject({
      id: PROJECT_ID_1,
      name: "仕事",
      version: 1,
      createdAt: TEST_INITIAL_TIME,
      updatedAt: TEST_INITIAL_TIME,
    });

    const res = await app.request(`/api/v1/projects/${PROJECT_ID_1}`, {
      method: "PATCH",
      headers: authHeaders({
        "If-Match": "1",
        "Idempotency-Key": "patch-project-1",
      }),
      body: JSON.stringify({ name: "仕事2" }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      project: { id: string; name: string; version: number; createdAt: string; updatedAt: string };
    };
    expect(body.project).toMatchObject({
      id: PROJECT_ID_1,
      name: "仕事2",
      version: 2,
    });
    // createdAt は変更されない
    expect(body.project.createdAt).toBe(TEST_INITIAL_TIME);
    expect(body.project.updatedAt).toBeDefined();

    // ストア側にも反映されている
    const after = await projectRepo.findById(PROJECT_ID_1);
    expect(after?.name).toBe("仕事2");
    expect(after?.version).toBe(2);
  });

  it("シナリオ: 楽観ロック衝突 - If-Match が現行 version と不一致で 412 + 現行プロジェクトが返る", async () => {
    // Given プロジェクト（id: "p-1", version: 2）が存在する
    // When  PATCH /api/v1/projects/p-1 に If-Match: 1 で送信する
    // Then  412 Precondition Failed で { project: <現行プロジェクト> } が返る
    projectRepo.seedProject({
      id: PROJECT_ID_1,
      name: "仕事",
      version: 2,
      createdAt: TEST_INITIAL_TIME,
      updatedAt: TEST_INITIAL_TIME,
    });

    const res = await app.request(`/api/v1/projects/${PROJECT_ID_1}`, {
      method: "PATCH",
      headers: authHeaders({
        "If-Match": "1",
        "Idempotency-Key": "patch-stale-project",
      }),
      body: JSON.stringify({ name: "仕事2" }),
    });

    expect(res.status).toBe(412);
    const body = (await res.json()) as { project: { name: string; version: number } };
    expect(body.project.name).toBe("仕事");
    expect(body.project.version).toBe(2);

    // ストアは変更されない
    const after = await projectRepo.findById(PROJECT_ID_1);
    expect(after?.name).toBe("仕事");
    expect(after?.version).toBe(2);
  });

  it("シナリオ: If-Match ヘッダなしは拒否される (MISSING_IF_MATCH)", async () => {
    // Given プロジェクト（id: "p-1"）が存在する
    // When  PATCH /api/v1/projects/p-1 に If-Match ヘッダなしで送信する
    // Then  400 Bad Request で { code: "MISSING_IF_MATCH" } が返る
    projectRepo.seedProject({
      id: PROJECT_ID_1,
      name: "仕事",
      version: 1,
      createdAt: TEST_INITIAL_TIME,
      updatedAt: TEST_INITIAL_TIME,
    });

    const res = await app.request(`/api/v1/projects/${PROJECT_ID_1}`, {
      method: "PATCH",
      headers: authHeaders({ "Idempotency-Key": "patch-no-match" }),
      body: JSON.stringify({ name: "仕事2" }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("MISSING_IF_MATCH");

    // ストアは変更されない
    const after = await projectRepo.findById(PROJECT_ID_1);
    expect(after?.name).toBe("仕事");
  });

  it("シナリオ: 存在しない id への PATCH は 404 PROJECT_NOT_FOUND", async () => {
    // Given id: "nonexistent" のプロジェクトは存在しない
    // When  PATCH /api/v1/projects/nonexistent に送信する
    // Then  404 Not Found で { code: "PROJECT_NOT_FOUND" } が返る
    const res = await app.request("/api/v1/projects/nonexistent", {
      method: "PATCH",
      headers: authHeaders({
        "If-Match": "1",
        "Idempotency-Key": "patch-not-found",
      }),
      body: JSON.stringify({ name: "x" }),
    });

    expect(res.status).toBe(404);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("PROJECT_NOT_FOUND");
  });

  it("シナリオ: バリデーション - 空の name は拒否される (INVALID_PROJECT_NAME)", async () => {
    // Given プロジェクト（id: "p-1", version: 1）が存在する
    // When  PATCH /api/v1/projects/p-1 に { name: "" } を送信する
    // Then  400 Bad Request で { code: "INVALID_PROJECT_NAME" } が返る
    projectRepo.seedProject({
      id: PROJECT_ID_1,
      name: "仕事",
      version: 1,
      createdAt: TEST_INITIAL_TIME,
      updatedAt: TEST_INITIAL_TIME,
    });

    const res = await app.request(`/api/v1/projects/${PROJECT_ID_1}`, {
      method: "PATCH",
      headers: authHeaders({
        "If-Match": "1",
        "Idempotency-Key": "patch-invalid-name",
      }),
      body: JSON.stringify({ name: "" }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("INVALID_PROJECT_NAME");

    // ストアは変更されない
    const after = await projectRepo.findById(PROJECT_ID_1);
    expect(after?.name).toBe("仕事");
    expect(after?.version).toBe(1);
  });
});

// ============================================================
// プロジェクト削除 (FR-022)
// spec.md §「プロジェクト削除（FR-022）」と 1:1 対応する.
// ============================================================

describe("DELETE /api/v1/projects/:id (プロジェクト削除 FR-022)", () => {
  it("シナリオ: 正常系 - プロジェクトを削除できる (204 + 一覧から消える)", async () => {
    // Given プロジェクト（id: "p-1", version: 1）が存在し、紐付くタスクが 0 件である
    // When  DELETE /api/v1/projects/p-1 に If-Match: 1, Idempotency-Key 付きで送信する
    // Then  204 No Content が返る
    // And   GET /api/v1/projects の一覧に "p-1" が含まれない
    projectRepo.seedProject({
      id: PROJECT_ID_1,
      name: "仕事",
      version: 1,
      createdAt: TEST_INITIAL_TIME,
      updatedAt: TEST_INITIAL_TIME,
    });

    const res = await app.request(`/api/v1/projects/${PROJECT_ID_1}`, {
      method: "DELETE",
      headers: authHeaders({
        "If-Match": "1",
        "Idempotency-Key": "delete-project-1",
      }),
    });

    expect(res.status).toBe(204);

    // 一覧から消えている
    const listRes = await app.request("/api/v1/projects", {
      method: "GET",
      headers: authHeaders(),
    });
    const list = (await listRes.json()) as { projects: Array<{ id: string }> };
    expect(list.projects.find((p) => p.id === PROJECT_ID_1)).toBeUndefined();

    // ストアからも消えている
    const stored = await projectRepo.findById(PROJECT_ID_1);
    expect(stored).toBeNull();
  });

  it("シナリオ: カスケード NULL - 削除したプロジェクトに紐付くタスクの projectId が null になる (trashedAt は変わらない)", async () => {
    // Given プロジェクト（id: "p-1", version: 1）が存在し、タスク（projectId: "p-1"）が 1 件存在する
    // When  DELETE /api/v1/projects/p-1 に If-Match: 1, Idempotency-Key 付きで送信する
    // Then  204 No Content が返る
    // And   該当タスクの projectId が null になっている
    // And   該当タスクはゴミ箱に移動していない（trashedAt = null のまま）
    projectRepo.seedProject({
      id: PROJECT_ID_1,
      name: "仕事",
      version: 1,
      createdAt: TEST_INITIAL_TIME,
      updatedAt: TEST_INITIAL_TIME,
    });
    taskRepo.seed({
      id: TASK_ID_1,
      name: "資料を作る",
      projectId: PROJECT_ID_1,
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

    const res = await app.request(`/api/v1/projects/${PROJECT_ID_1}`, {
      method: "DELETE",
      headers: authHeaders({
        "If-Match": "1",
        "Idempotency-Key": "delete-cascade-null",
      }),
    });

    expect(res.status).toBe(204);

    // タスクの projectId が null になっている
    const task = await taskRepo.findById(TASK_ID_1);
    expect(task).not.toBeNull();
    expect(task?.projectId).toBeNull();

    // trashedAt は変わっていない（ゴミ箱に移動していない）
    expect(task?.trashedAt).toBeNull();
  });

  it("シナリオ: 楽観ロック衝突 - If-Match が現行 version と不一致で 412 + 現行プロジェクトが返る", async () => {
    // Given プロジェクト（id: "p-1", version: 2）が存在する
    // When  DELETE /api/v1/projects/p-1 に If-Match: 1 で送信する
    // Then  412 Precondition Failed で { project: <現行プロジェクト> } が返る
    projectRepo.seedProject({
      id: PROJECT_ID_1,
      name: "仕事",
      version: 2,
      createdAt: TEST_INITIAL_TIME,
      updatedAt: TEST_INITIAL_TIME,
    });

    const res = await app.request(`/api/v1/projects/${PROJECT_ID_1}`, {
      method: "DELETE",
      headers: authHeaders({
        "If-Match": "1",
        "Idempotency-Key": "delete-stale",
      }),
    });

    expect(res.status).toBe(412);
    const body = (await res.json()) as { project: { version: number } };
    expect(body.project.version).toBe(2);

    // ストアは変更されない
    const after = await projectRepo.findById(PROJECT_ID_1);
    expect(after).not.toBeNull();
    expect(after?.version).toBe(2);
  });

  it("シナリオ: If-Match ヘッダなしは拒否される (MISSING_IF_MATCH)", async () => {
    // Given プロジェクト（id: "p-1"）が存在する
    // When  DELETE /api/v1/projects/p-1 に If-Match ヘッダなしで送信する
    // Then  400 Bad Request で { code: "MISSING_IF_MATCH" } が返る
    projectRepo.seedProject({
      id: PROJECT_ID_1,
      name: "仕事",
      version: 1,
      createdAt: TEST_INITIAL_TIME,
      updatedAt: TEST_INITIAL_TIME,
    });

    const res = await app.request(`/api/v1/projects/${PROJECT_ID_1}`, {
      method: "DELETE",
      headers: authHeaders({ "Idempotency-Key": "delete-no-match" }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("MISSING_IF_MATCH");

    // ストアは変更されない
    const after = await projectRepo.findById(PROJECT_ID_1);
    expect(after).not.toBeNull();
  });

  it("シナリオ: Idempotency-Key なしは拒否される (MISSING_IDEMPOTENCY_KEY)", async () => {
    // Given プロジェクト（id: "p-1"）が存在する
    // When  DELETE /api/v1/projects/p-1 に Idempotency-Key ヘッダなしで送信する
    // Then  400 Bad Request で { code: "MISSING_IDEMPOTENCY_KEY" } が返る
    projectRepo.seedProject({
      id: PROJECT_ID_1,
      name: "仕事",
      version: 1,
      createdAt: TEST_INITIAL_TIME,
      updatedAt: TEST_INITIAL_TIME,
    });

    const res = await app.request(`/api/v1/projects/${PROJECT_ID_1}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${TEST_AUTH_TOKEN}`,
        "Content-Type": "application/json",
        "If-Match": "1",
      },
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("MISSING_IDEMPOTENCY_KEY");

    // ストアは変更されない
    const after = await projectRepo.findById(PROJECT_ID_1);
    expect(after).not.toBeNull();
  });

  it("シナリオ: 存在しない id への DELETE は 404 PROJECT_NOT_FOUND", async () => {
    // Given id: "nonexistent" のプロジェクトは存在しない
    // When  DELETE /api/v1/projects/nonexistent に If-Match: 1, Idempotency-Key 付きで送信する
    // Then  404 Not Found で { code: "PROJECT_NOT_FOUND" } が返る
    const res = await app.request("/api/v1/projects/nonexistent", {
      method: "DELETE",
      headers: authHeaders({
        "If-Match": "1",
        "Idempotency-Key": "delete-not-found",
      }),
    });

    expect(res.status).toBe(404);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("PROJECT_NOT_FOUND");
  });

  it("シナリオ: 認証なしは拒否される (401)", async () => {
    // Given 未認証クライアントがリクエストを送信する
    // When  DELETE /api/v1/projects/p-1 を送信する
    // Then  401 Unauthorized が返る
    projectRepo.seedProject({
      id: PROJECT_ID_1,
      name: "仕事",
      version: 1,
      createdAt: TEST_INITIAL_TIME,
      updatedAt: TEST_INITIAL_TIME,
    });

    const res = await app.request(`/api/v1/projects/${PROJECT_ID_1}`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        "If-Match": "1",
        "Idempotency-Key": "delete-unauth",
      },
    });

    expect(res.status).toBe(401);

    // ストアは変更されない
    const after = await projectRepo.findById(PROJECT_ID_1);
    expect(after).not.toBeNull();
  });
});
