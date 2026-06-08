/**
 * 結合テスト: ルーティン CRUD API (BL-017 / FR-030 / FR-031 / FR-033 / FR-035).
 *
 * 受け入れ基準の出典: docs/developer/features/routine/spec.md
 * 各 describe / it のタイトルに Gherkin シナリオ名を含めて trace 可能とする.
 *
 * 注意: 本ファイルは TDD の "red" を作るためのテスト.
 *       エンドポイント未実装のため, すべて失敗する想定.
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
  InMemoryRoutineRepository,
  InMemoryTaskRepository,
  InMemoryIdempotencyStore,
} from "../helpers/in-memory-repositories.js";

// ============================================================
// テストフィクスチャ
// ============================================================

const ROUTINE_ID_1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ROUTINE_ID_2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ROUTINE_ID_3 = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const TASK_ID_1 = "11111111-1111-4111-8111-111111111111";

let app: Hono;
let routineRepo: InMemoryRoutineRepository;
let taskRepo: InMemoryTaskRepository;
let idempotencyStore: InMemoryIdempotencyStore;

beforeEach(() => {
  const built = buildTestApp();
  app = built.app;
  routineRepo = built.routineRepository;
  taskRepo = built.taskRepository;
  idempotencyStore = built.idempotencyStore;
});

// ============================================================
// ルーティン作成（FR-030）
// spec.md §「ルーティン作成（FR-030）」と 1:1 対応する.
// ============================================================

describe("POST /api/v1/routines (ルーティン作成 FR-030)", () => {
  it("シナリオ: 有効なルーティンを作成できる", async () => {
    // Given 認証済みの状態
    // When  POST /api/v1/routines に name="朝の運動", daysOfWeek=[1,2,3,4,5], defaultPriority="normal" を送る
    // Then  HTTP 201 が返り、レスポンスボディに作成されたルーティンが含まれる
    const res = await app.request("/api/v1/routines", {
      method: "POST",
      headers: authHeaders({ "Idempotency-Key": ROUTINE_ID_1 }),
      body: JSON.stringify({
        id: ROUTINE_ID_1,
        name: "朝の運動",
        daysOfWeek: [1, 2, 3, 4, 5],
        defaultPriority: "normal",
      }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as { routine: Record<string, unknown> };
    expect(body.routine).toMatchObject({
      id: ROUTINE_ID_1,
      name: "朝の運動",
      daysOfWeek: [1, 2, 3, 4, 5],
      defaultPriority: "normal",
      version: 1,
    });
    expect(typeof body.routine.createdAt).toBe("string");
    expect(typeof body.routine.updatedAt).toBe("string");

    // 一覧に含まれている
    const listRes = await app.request("/api/v1/routines", {
      method: "GET",
      headers: authHeaders(),
    });
    expect(listRes.status).toBe(200);
    const list = (await listRes.json()) as { routines: Array<{ name: string }> };
    expect(list.routines.some((r) => r.name === "朝の運動")).toBe(true);
  });

  it("シナリオ: 名称が空のルーティンは作成できない（INVALID_ROUTINE_NAME）", async () => {
    // Given 認証済みの状態
    // When  POST /api/v1/routines に name="" を送る
    // Then  HTTP 400 / INVALID_ROUTINE_NAME が返る
    const res = await app.request("/api/v1/routines", {
      method: "POST",
      headers: authHeaders({ "Idempotency-Key": ROUTINE_ID_1 }),
      body: JSON.stringify({
        id: ROUTINE_ID_1,
        name: "",
        daysOfWeek: [1],
        defaultPriority: "normal",
      }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("INVALID_ROUTINE_NAME");
    expect(routineRepo.all()).toHaveLength(0);
  });

  it("シナリオ: 名称が 201 文字以上のルーティンは作成できない（INVALID_ROUTINE_NAME）", async () => {
    // Given 認証済みの状態
    // When  POST /api/v1/routines に 201 文字の name を送る
    // Then  HTTP 400 / INVALID_ROUTINE_NAME が返る
    const name201 = "a".repeat(201);
    const res = await app.request("/api/v1/routines", {
      method: "POST",
      headers: authHeaders({ "Idempotency-Key": ROUTINE_ID_1 }),
      body: JSON.stringify({
        id: ROUTINE_ID_1,
        name: name201,
        daysOfWeek: [1],
        defaultPriority: "normal",
      }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("INVALID_ROUTINE_NAME");
    expect(routineRepo.all()).toHaveLength(0);
  });

  it("シナリオ: 200 文字の name は受け付けられる（境界値）", async () => {
    // 200 文字は仕様上限値 → 201 になると弾かれる境界を確認
    const name200 = "a".repeat(200);
    const res = await app.request("/api/v1/routines", {
      method: "POST",
      headers: authHeaders({ "Idempotency-Key": ROUTINE_ID_1 }),
      body: JSON.stringify({
        id: ROUTINE_ID_1,
        name: name200,
        daysOfWeek: [1],
        defaultPriority: "normal",
      }),
    });

    expect(res.status).toBe(201);
  });

  it("シナリオ: 名称に制御文字を含むルーティンは作成できない（INVALID_ROUTINE_NAME）", async () => {
    // Given 認証済みの状態
    // When  POST /api/v1/routines に name に改行文字（U+000A）を含む文字列を送る
    // Then  HTTP 400 / INVALID_ROUTINE_NAME が返る
    const res = await app.request("/api/v1/routines", {
      method: "POST",
      headers: authHeaders({ "Idempotency-Key": ROUTINE_ID_1 }),
      body: JSON.stringify({
        id: ROUTINE_ID_1,
        name: "朝の運動\nメモ",
        daysOfWeek: [1],
        defaultPriority: "normal",
      }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("INVALID_ROUTINE_NAME");
    expect(routineRepo.all()).toHaveLength(0);
  });

  it("シナリオ: daysOfWeek が空配列のルーティンは作成できない（INVALID_DAYS_OF_WEEK）", async () => {
    // Given 認証済みの状態
    // When  POST /api/v1/routines に daysOfWeek=[] を送る
    // Then  HTTP 400 / INVALID_DAYS_OF_WEEK が返る
    const res = await app.request("/api/v1/routines", {
      method: "POST",
      headers: authHeaders({ "Idempotency-Key": ROUTINE_ID_1 }),
      body: JSON.stringify({
        id: ROUTINE_ID_1,
        name: "朝の運動",
        daysOfWeek: [],
        defaultPriority: "normal",
      }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("INVALID_DAYS_OF_WEEK");
    expect(routineRepo.all()).toHaveLength(0);
  });

  it("シナリオ: daysOfWeek に 0〜6 以外の値を含む場合は作成できない（INVALID_DAYS_OF_WEEK）", async () => {
    // Given 認証済みの状態
    // When  POST /api/v1/routines に daysOfWeek=[7] を送る
    // Then  HTTP 400 / INVALID_DAYS_OF_WEEK が返る
    const res = await app.request("/api/v1/routines", {
      method: "POST",
      headers: authHeaders({ "Idempotency-Key": ROUTINE_ID_1 }),
      body: JSON.stringify({
        id: ROUTINE_ID_1,
        name: "朝の運動",
        daysOfWeek: [7],
        defaultPriority: "normal",
      }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("INVALID_DAYS_OF_WEEK");
    expect(routineRepo.all()).toHaveLength(0);
  });

  it("シナリオ: daysOfWeek に重複値を含む場合は重複を排除して保存される", async () => {
    // Given 認証済みの状態
    // When  POST /api/v1/routines に daysOfWeek=[1,1,2] を送る
    // Then  HTTP 201 が返り、保存されたルーティンの daysOfWeek は [1,2] になる
    const res = await app.request("/api/v1/routines", {
      method: "POST",
      headers: authHeaders({ "Idempotency-Key": ROUTINE_ID_1 }),
      body: JSON.stringify({
        id: ROUTINE_ID_1,
        name: "朝の運動",
        daysOfWeek: [1, 1, 2],
        defaultPriority: "normal",
      }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as { routine: { daysOfWeek: number[] } };
    expect(body.routine.daysOfWeek).toEqual([1, 2]);

    // 保存されているルーティンも重複排除済み
    const saved = await routineRepo.findById(ROUTINE_ID_1);
    expect(saved?.daysOfWeek).toEqual([1, 2]);
  });

  it("シナリオ: 冪等性 - 同一 Idempotency-Key で 2 回送っても 1 件しか作成されない", async () => {
    // Given 認証済みの状態
    // When  同一 Idempotency-Key で POST /api/v1/routines を 2 回送る
    // Then  2 回目も HTTP 201 が返り、レスポンスボディは 1 回目と同じである
    // And   ルーティン一覧に同一 ID のルーティンは 1 件しか存在しない
    const reqBody = JSON.stringify({
      id: ROUTINE_ID_1,
      name: "朝の運動",
      daysOfWeek: [1, 2, 3, 4, 5],
      defaultPriority: "normal",
    });
    const headers = authHeaders({ "Idempotency-Key": ROUTINE_ID_1 });

    const res1 = await app.request("/api/v1/routines", {
      method: "POST",
      headers,
      body: reqBody,
    });
    expect(res1.status).toBe(201);
    const body1 = await res1.json();

    const res2 = await app.request("/api/v1/routines", {
      method: "POST",
      headers,
      body: reqBody,
    });
    expect(res2.status).toBe(201);
    const body2 = await res2.json();

    // 2 回目のレスポンスは 1 回目と同じ内容
    expect(body2).toEqual(body1);

    // 一覧は 1 件のみ
    const listRes = await app.request("/api/v1/routines", {
      method: "GET",
      headers: authHeaders(),
    });
    const list = (await listRes.json()) as { routines: unknown[] };
    expect(list.routines).toHaveLength(1);

    // IdempotencyStore に保管されている
    expect(await idempotencyStore.get(ROUTINE_ID_1)).not.toBeNull();
  });

  it("シナリオ: 認証なしは拒否される（401）", async () => {
    // Given 未認証クライアントがリクエストを送信する
    // When  POST /api/v1/routines に送信する
    // Then  401 Unauthorized が返る
    const res = await app.request("/api/v1/routines", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": ROUTINE_ID_1,
      },
      body: JSON.stringify({
        id: ROUTINE_ID_1,
        name: "朝の運動",
        daysOfWeek: [1],
        defaultPriority: "normal",
      }),
    });

    expect(res.status).toBe(401);
    expect(routineRepo.all()).toHaveLength(0);
  });
});

// ============================================================
// ルーティン一覧取得（FR-030 / FR-035）
// spec.md §「ルーティン一覧取得」と 1:1 対応する.
// ============================================================

describe("GET /api/v1/routines (ルーティン一覧取得 FR-030)", () => {
  it("シナリオ: ルーティン一覧が name 昇順（BINARY）で返る", async () => {
    // Given 3 件のルーティン（name が "B", "A", "C"）が登録されている
    // When  GET /api/v1/routines を呼ぶ
    // Then  HTTP 200 が返り、routines 配列が name 昇順（"A","B","C"）で並んでいる
    routineRepo.seed({
      id: ROUTINE_ID_1,
      name: "B",
      daysOfWeek: [1],
      defaultPriority: "normal",
      version: 1,
      createdAt: TEST_INITIAL_TIME,
      updatedAt: TEST_INITIAL_TIME,
    });
    routineRepo.seed({
      id: ROUTINE_ID_2,
      name: "A",
      daysOfWeek: [2],
      defaultPriority: "normal",
      version: 1,
      createdAt: TEST_INITIAL_TIME,
      updatedAt: TEST_INITIAL_TIME,
    });
    routineRepo.seed({
      id: ROUTINE_ID_3,
      name: "C",
      daysOfWeek: [3],
      defaultPriority: "normal",
      version: 1,
      createdAt: TEST_INITIAL_TIME,
      updatedAt: TEST_INITIAL_TIME,
    });

    const res = await app.request("/api/v1/routines", {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { routines: Array<{ name: string }> };
    expect(body.routines).toHaveLength(3);
    // name 昇順: "A" < "B" < "C"
    expect(body.routines[0]?.name).toBe("A");
    expect(body.routines[1]?.name).toBe("B");
    expect(body.routines[2]?.name).toBe("C");
  });

  it("シナリオ: ルーティンが 0 件のとき空配列が返る", async () => {
    // Given ルーティンが 1 件も存在しない
    // When  GET /api/v1/routines を送信する
    // Then  200 OK で { routines: [] } が返る
    const res = await app.request("/api/v1/routines", {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { routines: unknown[] };
    expect(body.routines).toHaveLength(0);
  });

  it("シナリオ: 認証なしは拒否される（401）", async () => {
    // Given 未認証クライアントがリクエストを送信する
    // When  GET /api/v1/routines を送信する
    // Then  401 Unauthorized が返る
    const res = await app.request("/api/v1/routines", {
      method: "GET",
    });

    expect(res.status).toBe(401);
  });
});

// ============================================================
// ルーティン編集（FR-035）
// spec.md §「ルーティン編集（FR-035）」と 1:1 対応する.
// ============================================================

describe("PATCH /api/v1/routines/:id (ルーティン編集 FR-035)", () => {
  it("シナリオ: ルーティンの名称・生成曜日・既定優先度を変更できる（version+1）", async () => {
    // Given ルーティン（id=R1, version=1）が存在する
    // When  PATCH /api/v1/routines/R1 に name="夜の運動", daysOfWeek=[6,0], defaultPriority="later",
    //       If-Match="1" を送る
    // Then  HTTP 200 が返り、レスポンスボディのルーティンが更新されており version=2 になっている
    routineRepo.seed({
      id: ROUTINE_ID_1,
      name: "朝の運動",
      daysOfWeek: [1, 2, 3, 4, 5],
      defaultPriority: "normal",
      version: 1,
      createdAt: TEST_INITIAL_TIME,
      updatedAt: TEST_INITIAL_TIME,
    });

    const res = await app.request(`/api/v1/routines/${ROUTINE_ID_1}`, {
      method: "PATCH",
      headers: authHeaders({
        "If-Match": "1",
        "Idempotency-Key": "patch-routine-1",
      }),
      body: JSON.stringify({
        name: "夜の運動",
        daysOfWeek: [6, 0],
        defaultPriority: "later",
      }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      routine: {
        id: string;
        name: string;
        daysOfWeek: number[];
        defaultPriority: string;
        version: number;
        createdAt: string;
        updatedAt: string;
      };
    };
    expect(body.routine).toMatchObject({
      id: ROUTINE_ID_1,
      name: "夜の運動",
      daysOfWeek: [6, 0],
      defaultPriority: "later",
      version: 2,
    });
    // createdAt は変更されない
    expect(body.routine.createdAt).toBe(TEST_INITIAL_TIME);
    expect(body.routine.updatedAt).toBeDefined();

    // ストア側にも反映されている
    const after = await routineRepo.findById(ROUTINE_ID_1);
    expect(after?.name).toBe("夜の運動");
    expect(after?.version).toBe(2);
  });

  it("シナリオ: version 不一致時は 412 が返る", async () => {
    // Given ルーティン（id=R1, version=2）が存在する
    // When  PATCH /api/v1/routines/R1 に If-Match="1" を送る
    // Then  HTTP 412 が返る
    routineRepo.seed({
      id: ROUTINE_ID_1,
      name: "朝の運動",
      daysOfWeek: [1],
      defaultPriority: "normal",
      version: 2,
      createdAt: TEST_INITIAL_TIME,
      updatedAt: TEST_INITIAL_TIME,
    });

    const res = await app.request(`/api/v1/routines/${ROUTINE_ID_1}`, {
      method: "PATCH",
      headers: authHeaders({
        "If-Match": "1",
        "Idempotency-Key": "patch-routine-stale",
      }),
      body: JSON.stringify({ name: "変更後" }),
    });

    expect(res.status).toBe(412);

    // ストアは変更されない
    const after = await routineRepo.findById(ROUTINE_ID_1);
    expect(after?.name).toBe("朝の運動");
    expect(after?.version).toBe(2);
  });

  it("シナリオ: 存在しないルーティンを編集すると 404 ROUTINE_NOT_FOUND が返る", async () => {
    // Given ルーティン R99 が存在しない
    // When  PATCH /api/v1/routines/R99 を送る
    // Then  HTTP 404 / ROUTINE_NOT_FOUND が返る
    const res = await app.request("/api/v1/routines/nonexistent", {
      method: "PATCH",
      headers: authHeaders({
        "If-Match": "1",
        "Idempotency-Key": "patch-routine-notfound",
      }),
      body: JSON.stringify({ name: "変更後" }),
    });

    expect(res.status).toBe(404);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("ROUTINE_NOT_FOUND");
  });
});

// ============================================================
// ルーティン削除（FR-030 補足）
// spec.md §「ルーティン削除（FR-030 補足）」と 1:1 対応する.
// ============================================================

describe("DELETE /api/v1/routines/:id (ルーティン削除 FR-030 補足)", () => {
  it("シナリオ: ルーティンを削除すると紐付くタスクも削除される", async () => {
    // Given ルーティン（id=R1）が存在し、そのルーティンに紐付く今日のタスク T1 が存在する
    // When  DELETE /api/v1/routines/R1 に If-Match="1" を送る
    // Then  HTTP 204 が返る
    // And   GET /api/v1/routines にルーティン R1 が含まれない
    // And   GET /api/v1/tasks?trashed=false にタスク T1 が含まれない
    routineRepo.seed({
      id: ROUTINE_ID_1,
      name: "朝の運動",
      daysOfWeek: [1],
      defaultPriority: "normal",
      version: 1,
      createdAt: TEST_INITIAL_TIME,
      updatedAt: TEST_INITIAL_TIME,
    });
    taskRepo.seed({
      id: TASK_ID_1,
      name: "朝の運動",
      projectId: null,
      dueDate: "today",
      priority: "normal",
      origin: "routine",
      routineId: ROUTINE_ID_1,
      createdAt: TEST_INITIAL_TIME,
      updatedAt: TEST_INITIAL_TIME,
      trashedAt: null,
      trashedReason: null,
      version: 1,
    });

    const res = await app.request(`/api/v1/routines/${ROUTINE_ID_1}`, {
      method: "DELETE",
      headers: authHeaders({
        "If-Match": "1",
        "Idempotency-Key": "delete-routine-1",
      }),
    });

    expect(res.status).toBe(204);

    // ルーティン一覧から消えている
    const listRes = await app.request("/api/v1/routines", {
      method: "GET",
      headers: authHeaders(),
    });
    const list = (await listRes.json()) as { routines: Array<{ id: string }> };
    expect(list.routines.find((r) => r.id === ROUTINE_ID_1)).toBeUndefined();

    // ストアからも消えている
    const storedRoutine = await routineRepo.findById(ROUTINE_ID_1);
    expect(storedRoutine).toBeNull();

    // 紐付くタスクも物理削除されている
    const storedTask = await taskRepo.findById(TASK_ID_1);
    expect(storedTask).toBeNull();
  });

  it("シナリオ: 認証なしは拒否される（401）", async () => {
    // Given 未認証クライアントがリクエストを送信する
    // Then  401 Unauthorized が返る
    routineRepo.seed({
      id: ROUTINE_ID_1,
      name: "朝の運動",
      daysOfWeek: [1],
      defaultPriority: "normal",
      version: 1,
      createdAt: TEST_INITIAL_TIME,
      updatedAt: TEST_INITIAL_TIME,
    });

    const res = await app.request(`/api/v1/routines/${ROUTINE_ID_1}`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        "If-Match": "1",
        "Idempotency-Key": "delete-routine-unauth",
      },
    });

    expect(res.status).toBe(401);

    // ストアは変更されない
    const after = await routineRepo.findById(ROUTINE_ID_1);
    expect(after).not.toBeNull();
  });
});
