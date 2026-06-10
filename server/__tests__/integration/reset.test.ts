import type { FakeClock } from "@todica/domain/clock";
import type { DueDate, Priority, Task, TrashedReason } from "@todica/domain/task";
import type { Hono } from "hono";
/**
 * 結合テスト: POST /api/v1/reset (BL-010 / FR-043 / FR-051 / NFR-020).
 *
 * 受け入れ基準の出典: docs/developer/features/daily-reset/spec.md
 * 各 describe / it のタイトルに Gherkin シナリオ名を含めて trace 可能とする.
 *
 * 注意: 本ファイルは TDD の "red" を作るためのテスト.
 *       POST /api/v1/reset はまだ実装されていない (404 または 404相当 が返る) ため,
 *       すべて失敗する想定.
 *       implementer がエンドポイントを実装することで green 化する.
 *
 * In-memory テストのトランザクション戦略:
 *   plan.md D-004 では better-sqlite3 の同期 API を使うが、in-memory テストでは
 *   非同期 Repository の update() を通じてリセット処理を模倣する。
 *   テスト観点は「HTTP レスポンスの形状」と「状態変化（counter / taskの dueDate）」とする。
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  TEST_AUTH_TOKEN,
  TEST_INITIAL_TIME,
  authHeaders,
  buildTestApp,
} from "../helpers/build-test-app.js";
import type {
  InMemoryCounterRepository,
  InMemorySettingsRepository,
  InMemoryTaskRepository,
} from "../helpers/in-memory-repositories.js";

// dayBoundaryTime = "04:00" として、境界を「超えた」時刻と「超えていない」時刻を定義する。
const BOUNDARY_TIME = "04:00";

// 境界時刻を超えた状態: 2026-06-08T04:01:00.000Z (04:01 > 04:00)
const TIME_AFTER_BOUNDARY = "2026-06-08T04:01:00.000Z";

// 境界時刻を超えていない状態: 2026-06-08T03:59:00.000Z (03:59 < 04:00)
const TIME_BEFORE_BOUNDARY = "2026-06-08T03:59:00.000Z";

// 今日の境界時刻（UTC）
const TODAY_BOUNDARY_AT = "2026-06-08T04:00:00.000Z";

const TASK_ID_1 = "11111111-1111-4111-8111-111111111111";
const TASK_ID_2 = "22222222-2222-4222-8222-222222222222";
const TASK_ID_3 = "33333333-3333-4333-8333-333333333333";

let app: Hono;
let taskRepo: InMemoryTaskRepository;
let counterRepo: InMemoryCounterRepository;
let settingsRepo: InMemorySettingsRepository;
let clock: FakeClock;

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

beforeEach(() => {
  // 境界を超えた状態（04:01）で初期化する。各テストで clock.set() により変更可能。
  const built = buildTestApp({ initialTime: TIME_AFTER_BOUNDARY });
  app = built.app;
  taskRepo = built.taskRepository;
  counterRepo = built.counterRepository;
  settingsRepo = built.settingsRepository;
  clock = built.clock;

  // デフォルトの境界時刻を "04:00" に設定する（InMemorySettingsRepository の初期値と同じだが明示する）。
  settingsRepo.seed({ dayBoundaryTime: BOUNDARY_TIME });
});

// ============================================================
// 認証 (spec.md §「認証なしの POST /api/v1/reset は 401」)
// ============================================================

describe("POST /api/v1/reset (認証)", () => {
  it("シナリオ: 認証なしの POST /api/v1/reset は 401 を返す", async () => {
    // spec.md:
    //   Given Authorization ヘッダを付けない
    //   When  POST /api/v1/reset を送る
    //   Then  401 UNAUTHORIZED が返る
    const res = await app.request("/api/v1/reset", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": "reset-unauth",
      },
    });

    expect(res.status).toBe(401);
  });
});

// ============================================================
// Idempotency-Key 必須 (spec.md §「POST /api/v1/reset」/ plan.md D-005)
// ============================================================

describe("POST /api/v1/reset (Idempotency-Key 必須)", () => {
  it("シナリオ: Idempotency-Key なしの POST /api/v1/reset は 400 MISSING_IDEMPOTENCY_KEY", async () => {
    // spec.md §「POST /api/v1/reset」: Idempotency-Key ヘッダ必須。
    const res = await app.request("/api/v1/reset", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TEST_AUTH_TOKEN}`,
        "Content-Type": "application/json",
        // Idempotency-Key を意図的に省略する
      },
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("MISSING_IDEMPOTENCY_KEY");
  });
});

// ============================================================
// 新規リセット実行（spec.md §「POST /api/v1/reset のレスポンス」）
// ============================================================

describe("POST /api/v1/reset (新規リセット実行)", () => {
  it("シナリオ: 境界時刻を超えた状態でリセット → 200 { executed: true, appliedBoundaryAt: ... }", async () => {
    // spec.md:
    //   Given dayBoundaryTime = "04:00", clock.now() = 当日 04:01, lastResetExecutedAt = null
    //   When  POST /api/v1/reset を送る
    //   Then  200 OK で { executed: true, appliedBoundaryAt: <当日の境界時刻 ISO 8601> } が返る
    counterRepo.seed({ completedCount: 5, lastResetExecutedAt: null });

    const res = await app.request("/api/v1/reset", {
      method: "POST",
      headers: authHeaders({ "Idempotency-Key": "reset-new-1" }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { executed: boolean; appliedBoundaryAt: string };
    expect(body.executed).toBe(true);
    expect(body.appliedBoundaryAt).toBe(TODAY_BOUNDARY_AT);
  });

  it('シナリオ: "tomorrow" タスクがリセットで "today" に変わる (FR-043)', async () => {
    // spec.md §「タスク繰り越し（FR-043）」:
    //   Given dueDate: "tomorrow", trashedAt: null のタスク T1
    //   When  POST /api/v1/reset を送る
    //   Then  T1 の dueDate が "today" に変わっている
    counterRepo.seed({ completedCount: 0, lastResetExecutedAt: null });
    taskRepo.seed(makeTask({ id: TASK_ID_1, dueDate: "tomorrow" }));

    const res = await app.request("/api/v1/reset", {
      method: "POST",
      headers: authHeaders({ "Idempotency-Key": "reset-tomorrow-to-today" }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { executed: boolean };
    expect(body.executed).toBe(true);

    // タスクの dueDate が "today" に変わっている
    const task = await taskRepo.findById(TASK_ID_1);
    expect(task?.dueDate).toBe("today");
  });

  it('シナリオ: "today" タスクはリセットで変わらない', async () => {
    // spec.md §「タスク繰り越し（FR-043）」:
    //   Given dueDate: "today", trashedAt: null のタスク T2
    //   When  POST /api/v1/reset を送る
    //   Then  T2 の dueDate は "today" のまま変わっていない
    counterRepo.seed({ completedCount: 0, lastResetExecutedAt: null });
    taskRepo.seed(makeTask({ id: TASK_ID_2, dueDate: "today" }));

    const res = await app.request("/api/v1/reset", {
      method: "POST",
      headers: authHeaders({ "Idempotency-Key": "reset-today-unchanged" }),
    });

    expect(res.status).toBe(200);
    const task = await taskRepo.findById(TASK_ID_2);
    expect(task?.dueDate).toBe("today");
  });

  it("シナリオ: ゴミ箱タスクはリセット対象外（dueDate が変わらない）", async () => {
    // spec.md §「タスク繰り越し（FR-043）」:
    //   Given dueDate: "tomorrow", trashedAt: <過去>, trashedReason: "deleted" のタスク T3
    //   When  POST /api/v1/reset を送る
    //   Then  T3 の dueDate は "tomorrow" のまま変わっていない（ゴミ箱は対象外）
    counterRepo.seed({ completedCount: 0, lastResetExecutedAt: null });
    // trashedAt を境界時刻以降（"2026-06-08T05:00:00.000Z"）にする。
    // 境界より古い trashedAt は purgeTrash で物理削除されるため、
    // 「dueDate が変わらない」ことを確認するにはタスクが残存している必要がある。
    taskRepo.seed(
      makeTask({
        id: TASK_ID_3,
        dueDate: "tomorrow",
        trashedAt: "2026-06-08T05:00:00.000Z",
        trashedReason: "deleted",
      }),
    );

    const res = await app.request("/api/v1/reset", {
      method: "POST",
      headers: authHeaders({ "Idempotency-Key": "reset-trashed-unchanged" }),
    });

    expect(res.status).toBe(200);
    const task = await taskRepo.findById(TASK_ID_3);
    // ゴミ箱タスクの dueDate は "tomorrow" のまま（繰り越し対象外）
    expect(task?.dueDate).toBe("tomorrow");
  });

  it("シナリオ: リセット実行で completedCount が 0 になる (FR-051)", async () => {
    // spec.md §「completedCount リセット（FR-051）」:
    //   Given counter.completedCount = 5, lastResetExecutedAt = null
    //   When  POST /api/v1/reset を送る
    //   Then  GET /api/v1/counter は { completedCount: 0 } を返す
    counterRepo.seed({ completedCount: 5, lastResetExecutedAt: null });

    const res = await app.request("/api/v1/reset", {
      method: "POST",
      headers: authHeaders({ "Idempotency-Key": "reset-count-zero" }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { executed: boolean };
    expect(body.executed).toBe(true);

    // counter を確認
    const counterRes = await app.request("/api/v1/counter", {
      method: "GET",
      headers: authHeaders(),
    });
    expect(counterRes.status).toBe(200);
    const counterBody = (await counterRes.json()) as { counter: { completedCount: number } };
    expect(counterBody.counter.completedCount).toBe(0);
  });

  it("シナリオ: リセット実行後に counter.version が +1 される", async () => {
    // 監査指摘 [中] 3-a:
    //   Given 境界時刻を超えており lastResetExecutedAt = null
    //   When  POST /api/v1/reset
    //   Then  200 executed: true
    //   And   GET /api/v1/counter で version が 2 になっている
    counterRepo.seed({ completedCount: 0, lastResetExecutedAt: null, version: 1 });

    const res = await app.request("/api/v1/reset", {
      method: "POST",
      headers: authHeaders({ "Idempotency-Key": "reset-version-increment" }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { executed: boolean };
    expect(body.executed).toBe(true);

    // GET /api/v1/counter で version が 2 になっていることを確認
    const counterRes = await app.request("/api/v1/counter", {
      method: "GET",
      headers: authHeaders(),
    });
    expect(counterRes.status).toBe(200);
    const counterBody2 = (await counterRes.json()) as {
      counter: { completedCount: number; version: number };
    };
    expect(counterBody2.counter.version).toBe(2);
  });
});

// ============================================================
// 冪等性（spec.md §「冪等性（NFR-020）」）
// ============================================================

describe("POST /api/v1/reset (冪等性 NFR-020)", () => {
  it("シナリオ: 同じ条件で 2 回 POST → 2 回目は { executed: false } が返る", async () => {
    // spec.md §「冪等性（NFR-020）」:
    //   Given dayBoundaryTime = "04:00", clock.now() = 当日 04:01
    //   And   counter.completedCount = 5, lastResetExecutedAt = null
    //   And   タスク T1 が { dueDate: "tomorrow", trashedAt: null } で存在する
    //   When  POST /api/v1/reset を 1 回送る
    //   And   続けてもう 1 回 POST /api/v1/reset を送る
    //   Then  2 回目は executed = false で 200 OK が返る
    counterRepo.seed({ completedCount: 5, lastResetExecutedAt: null });
    taskRepo.seed(makeTask({ id: TASK_ID_1, dueDate: "tomorrow" }));

    // 1 回目
    const res1 = await app.request("/api/v1/reset", {
      method: "POST",
      headers: authHeaders({ "Idempotency-Key": "reset-idem-1st" }),
    });
    expect(res1.status).toBe(200);
    const body1 = (await res1.json()) as { executed: boolean };
    expect(body1.executed).toBe(true);

    // 2 回目（別の Idempotency-Key で送るが、リセット条件が満たされないため no-op）
    const res2 = await app.request("/api/v1/reset", {
      method: "POST",
      headers: authHeaders({ "Idempotency-Key": "reset-idem-2nd" }),
    });
    expect(res2.status).toBe(200);
    const body2 = (await res2.json()) as { executed: boolean };
    expect(body2.executed).toBe(false);
  });

  it("シナリオ: 同一 Idempotency-Key で再送しても no-op 応答が返る（NFR-020）", async () => {
    // spec.md §「冪等性（NFR-020）」:
    //   Given POST /api/v1/reset を Idempotency-Key: "k1" で 1 回成功させた
    //   When  まったく同じ Idempotency-Key: "k1" で再送する
    //   Then  2 回目も 200 OK が返り、レスポンスボディは 1 回目と同じ
    counterRepo.seed({ completedCount: 5, lastResetExecutedAt: null });

    const headers = authHeaders({ "Idempotency-Key": "reset-same-key" });

    const res1 = await app.request("/api/v1/reset", {
      method: "POST",
      headers,
    });
    expect(res1.status).toBe(200);
    const body1 = await res1.json();

    const res2 = await app.request("/api/v1/reset", {
      method: "POST",
      headers,
    });
    expect(res2.status).toBe(200);
    const body2 = await res2.json();

    // 2 回目は 1 回目と同じレスポンス
    expect(body2).toEqual(body1);
  });
});

// ============================================================
// リセット不要の場合（spec.md §「POST /api/v1/reset のレスポンス」）
// ============================================================

describe("POST /api/v1/reset (リセット不要の場合)", () => {
  it("シナリオ: 境界時刻を超えていない状態では { executed: false } が返る", async () => {
    // spec.md §「「今日」の境界判定」:
    //   Given dayBoundaryTime = "04:00", clock.now() = 当日 03:59, lastResetExecutedAt = null
    //   When  POST /api/v1/reset を送る
    //   Then  { executed: false } が返る
    clock.set(TIME_BEFORE_BOUNDARY);
    counterRepo.seed({ completedCount: 3, lastResetExecutedAt: null });

    const res = await app.request("/api/v1/reset", {
      method: "POST",
      headers: authHeaders({ "Idempotency-Key": "reset-before-boundary" }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { executed: boolean };
    expect(body.executed).toBe(false);
  });

  it("シナリオ: 今日の境界時刻以降に既にリセット済みなら { executed: false } が返る（冪等）", async () => {
    // spec.md §「POST /api/v1/reset のレスポンス」:
    //   Given dayBoundaryTime = "04:00", clock.now() = 当日 10:00
    //   And   counter.lastResetExecutedAt = 当日 04:05（境界時刻以降）
    //   When  POST /api/v1/reset を送る
    //   Then  200 OK で { executed: false, appliedBoundaryAt: <当日の境界時刻 ISO 8601> } が返る
    clock.set("2026-06-08T10:00:00.000Z");
    counterRepo.seed({
      completedCount: 0,
      lastResetExecutedAt: "2026-06-08T04:05:00.000Z", // 境界時刻以降にリセット済み
    });

    const res = await app.request("/api/v1/reset", {
      method: "POST",
      headers: authHeaders({ "Idempotency-Key": "reset-already-done" }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { executed: boolean; appliedBoundaryAt: string };
    expect(body.executed).toBe(false);
    expect(body.appliedBoundaryAt).toBe(TODAY_BOUNDARY_AT);
  });
});
