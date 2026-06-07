/**
 * 結合テスト: 今日の完了数 Counter API (BL-008 / FR-040 / FR-006 / FR-007 / NFR-020).
 *
 * 受け入れ基準の出典: docs/developer/features/completion-counter/spec.md
 * 各 describe / it のタイトルに Gherkin シナリオ名を含めて trace 可能とする.
 *
 * 注意: 本ファイルは TDD の "red" を作るためのテスト.
 *       createApp() の GET /api/v1/counter は 501 NOT_IMPLEMENTED を返すスタブで,
 *       complete ハンドラにも counter 連動はまだ無いため, このファイル内のテストは
 *       すべて失敗する想定. implementer がエンドポイント / 連動ロジックを実装することで
 *       green 化する.
 *
 * スコープ:
 *   - GET /api/v1/counter 正常系 / 認証
 *   - POST /api/v1/tasks/:id/complete による completedCount +1 集計 (FR-006 / FR-040)
 *   - 既ゴミ箱への no-op complete では +1 しない (D-002 / D-003 整合)
 *   - DELETE /api/v1/tasks/:id では +1 しない (FR-007)
 *   - PATCH (期限変更) でも +1 しない (FR-007 周辺)
 *   - Idempotency-Key 再送による二重カウント防止 (NFR-020)
 */
import { beforeEach, describe, expect, it } from "vitest";
import type { Hono } from "hono";
import {
  authHeaders,
  buildTestApp,
  TEST_INITIAL_TIME,
} from "../helpers/build-test-app.js";
import type {
  InMemoryCounterRepository,
  InMemoryTaskRepository,
} from "../helpers/in-memory-repositories.js";
import type { Task, Priority, DueDate, TrashedReason } from "@todica/domain/task";

const ID_001 = "00000000-0000-4000-8000-000000000001";
const ID_002 = "00000000-0000-4000-8000-000000000002";
const ID_TRASHED = "00000000-0000-4000-8000-0000000000aa";
const ID_DELETED = "00000000-0000-4000-8000-0000000000bb";

let app: Hono;
let taskRepo: InMemoryTaskRepository;
let counterRepo: InMemoryCounterRepository;

beforeEach(() => {
  const built = buildTestApp();
  app = built.app;
  taskRepo = built.taskRepository;
  counterRepo = built.counterRepository;
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
// GET /api/v1/counter (spec.md §「Counter の初期状態」)
// ============================================================

describe("GET /api/v1/counter", () => {
  it("シナリオ: 初回アクセス時の Counter は completedCount = 0 で 1 件存在する", async () => {
    // spec.md §「Counter の初期状態」第 1 ケース.
    const res = await app.request("/api/v1/counter", {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      counter: {
        id: string;
        completedCount: number;
        lastResetExecutedAt: string | null;
        version: number;
        updatedAt: string;
      };
    };
    expect(body.counter.id).toBe("singleton");
    expect(body.counter.completedCount).toBe(0);
    expect(body.counter.lastResetExecutedAt).toBeNull();
    expect(body.counter.version).toBe(1);
    expect(typeof body.counter.updatedAt).toBe("string");
  });

  it("シナリオ: completedCount が設定済みのとき GET /api/v1/counter は当該値を返す", async () => {
    // spec.md §「Counter の初期状態」より, 任意の値を seed しても read で同じ値が返ることを確認.
    counterRepo.seed({
      completedCount: 7,
      version: 5,
      updatedAt: "2026-06-07T10:00:00.000Z",
    });

    const res = await app.request("/api/v1/counter", {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      counter: { completedCount: number; version: number };
    };
    expect(body.counter.completedCount).toBe(7);
    expect(body.counter.version).toBe(5);
  });

  it("シナリオ: 認証なしの GET /api/v1/counter は 401", async () => {
    // spec.md §「Counter の初期状態」第 2 ケース.
    const res = await app.request("/api/v1/counter", {
      method: "GET",
      // Authorization 無し.
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(401);
  });
});

// ============================================================
// 完了アクションによる +1 (spec.md §「完了アクションによる +1 (FR-006 / FR-040)」)
// ============================================================

describe("POST /api/v1/tasks/{id}/complete (completedCount +1 集計)", () => {
  it("シナリオ: 通常状態のタスクを完了すると completedCount が +1 になる", async () => {
    // spec.md §「完了アクションによる +1」第 1 ケース.
    taskRepo.seed(makeTask({ id: ID_001 }));

    const res = await app.request(`/api/v1/tasks/${ID_001}/complete`, {
      method: "POST",
      headers: authHeaders({
        "If-Match": "1",
        "Idempotency-Key": "counter-complete-1",
      }),
    });
    expect(res.status).toBe(200);

    // GET /api/v1/counter は completedCount = 1.
    const getRes = await app.request("/api/v1/counter", {
      method: "GET",
      headers: authHeaders(),
    });
    expect(getRes.status).toBe(200);
    const body = (await getRes.json()) as {
      counter: { completedCount: number; version: number };
    };
    expect(body.counter.completedCount).toBe(1);
    // counter は更新されているので version は 2 以上.
    expect(body.counter.version).toBeGreaterThanOrEqual(2);

    // 永続化レイヤ側も同じ値.
    expect(counterRepo.current().completedCount).toBe(1);
  });

  it("シナリオ: 2 件続けて完了すると completedCount は 2 になる", async () => {
    // spec.md §「完了アクションによる +1」第 2 ケース.
    taskRepo.seed(makeTask({ id: ID_001 }));
    taskRepo.seed(makeTask({ id: ID_002 }));

    const res1 = await app.request(`/api/v1/tasks/${ID_001}/complete`, {
      method: "POST",
      headers: authHeaders({
        "If-Match": "1",
        "Idempotency-Key": "counter-complete-seq-1",
      }),
    });
    expect(res1.status).toBe(200);

    const res2 = await app.request(`/api/v1/tasks/${ID_002}/complete`, {
      method: "POST",
      headers: authHeaders({
        "If-Match": "1",
        "Idempotency-Key": "counter-complete-seq-2",
      }),
    });
    expect(res2.status).toBe(200);

    const getRes = await app.request("/api/v1/counter", {
      method: "GET",
      headers: authHeaders(),
    });
    const body = (await getRes.json()) as { counter: { completedCount: number } };
    expect(body.counter.completedCount).toBe(2);
  });

  it("シナリオ: 既にゴミ箱状態 (trashedReason = \"completed\") のタスクへの再 complete では completedCount は増えない", async () => {
    // spec.md §「完了アクションによる +1」第 3 ケース (既 completed への no-op).
    counterRepo.seed({ completedCount: 1, version: 2 });
    taskRepo.seed(
      makeTask({
        id: ID_TRASHED,
        trashedAt: "2026-06-07T08:00:00.000Z",
        trashedReason: "completed",
        version: 2,
      }),
    );

    const res = await app.request(`/api/v1/tasks/${ID_TRASHED}/complete`, {
      method: "POST",
      headers: authHeaders({
        // 既ゴミ箱経路は If-Match 検証スキップ (BL-003 D-003) だが,
        // 念のため何か入れて再送に依存しない実装にも耐えるようにする.
        "If-Match": "2",
        "Idempotency-Key": "counter-no-op-already-completed",
      }),
    });
    expect(res.status).toBe(200);

    // counter は 1 のまま.
    expect(counterRepo.current().completedCount).toBe(1);

    const getRes = await app.request("/api/v1/counter", {
      method: "GET",
      headers: authHeaders(),
    });
    const body = (await getRes.json()) as { counter: { completedCount: number } };
    expect(body.counter.completedCount).toBe(1);
  });

  it("シナリオ: 既に削除済 (trashedReason = \"deleted\") のタスクへの complete は completedCount を増やさない", async () => {
    // spec.md §「完了アクションによる +1」第 4 ケース.
    taskRepo.seed(
      makeTask({
        id: ID_DELETED,
        trashedAt: "2026-06-07T08:00:00.000Z",
        trashedReason: "deleted",
        version: 2,
      }),
    );

    const res = await app.request(`/api/v1/tasks/${ID_DELETED}/complete`, {
      method: "POST",
      headers: authHeaders({
        "If-Match": "2",
        "Idempotency-Key": "counter-no-op-already-deleted",
      }),
    });
    expect(res.status).toBe(200);

    // counter は 0 のまま.
    expect(counterRepo.current().completedCount).toBe(0);
  });
});

// ============================================================
// 削除 / 期限変更ではカウントを変えない (spec.md §「削除アクションはカウントを変えない」)
// ============================================================

describe("DELETE / PATCH ではカウントを変えない (FR-007)", () => {
  it("シナリオ: 通常状態のタスクを削除しても completedCount は変わらない", async () => {
    // spec.md §「削除アクションはカウントを変えない」第 1 ケース.
    taskRepo.seed(makeTask({ id: ID_001 }));

    const res = await app.request(`/api/v1/tasks/${ID_001}`, {
      method: "DELETE",
      headers: authHeaders({
        "If-Match": "1",
        "Idempotency-Key": "counter-delete-no-bump",
      }),
    });
    expect(res.status).toBe(204);

    expect(counterRepo.current().completedCount).toBe(0);
    // counter レコードの version も削除では変わらない (counter に触れていないので).
    expect(counterRepo.current().version).toBe(1);

    const getRes = await app.request("/api/v1/counter", {
      method: "GET",
      headers: authHeaders(),
    });
    const body = (await getRes.json()) as { counter: { completedCount: number } };
    expect(body.counter.completedCount).toBe(0);
  });

  it("シナリオ: 期限変更 (today → tomorrow) も completedCount を変えない", async () => {
    // spec.md §「削除アクションはカウントを変えない」第 2 ケース.
    taskRepo.seed(makeTask({ id: ID_001, dueDate: "today" }));

    const res = await app.request(`/api/v1/tasks/${ID_001}`, {
      method: "PATCH",
      headers: authHeaders({
        "If-Match": "1",
        "Idempotency-Key": "counter-patch-no-bump",
      }),
      body: JSON.stringify({ dueDate: "tomorrow" }),
    });
    expect(res.status).toBe(200);

    expect(counterRepo.current().completedCount).toBe(0);
  });
});

// ============================================================
// Idempotency-Key 再送による二重カウント防止 (NFR-020)
//
// spec.md §「Idempotency-Key 再送による二重カウント防止」.
// 同じ Idempotency-Key + 同じ If-Match で 2 回 complete を送っても,
// 1 回目の保存応答が返るだけで, completedCount は +1 にとどまる.
// ============================================================

describe("Idempotency-Key 再送による二重カウント防止 (NFR-020)", () => {
  it("シナリオ: 同じ Idempotency-Key で 2 回 complete を送っても completedCount は +1 だけ", async () => {
    taskRepo.seed(makeTask({ id: ID_001, version: 1 }));

    const headers = authHeaders({
      "If-Match": "1",
      "Idempotency-Key": "counter-idem-1",
    });

    const res1 = await app.request(`/api/v1/tasks/${ID_001}/complete`, {
      method: "POST",
      headers,
    });
    expect(res1.status).toBe(200);
    const body1 = await res1.json();

    const res2 = await app.request(`/api/v1/tasks/${ID_001}/complete`, {
      method: "POST",
      headers,
    });
    expect(res2.status).toBe(200);
    const body2 = await res2.json();

    // 2 回目は 1 回目と同じ保存応答.
    expect(body2).toEqual(body1);
    // completedCount は +1 のまま (= 2 に進まない).
    expect(counterRepo.current().completedCount).toBe(1);

    const getRes = await app.request("/api/v1/counter", {
      method: "GET",
      headers: authHeaders(),
    });
    const counterBody = (await getRes.json()) as {
      counter: { completedCount: number };
    };
    expect(counterBody.counter.completedCount).toBe(1);
  });
});

// ============================================================
// 非ゴール / スコープ境界の明示 (spec.md §「スコープ境界の明示」)
//
// 本 feature では PUT /api/v1/counter / POST /api/v1/counter/reset
// などの書き込み経路を提供しない. 404 (= 該当ハンドラ未登録) で返ることを確認.
// ============================================================

describe("スコープ境界 (本 feature が触らないこと)", () => {
  it("シナリオ: 本 feature ではリセット API / 手動補正 API は提供しない (404)", async () => {
    // spec.md §「スコープ境界の明示」第 1 ケース.
    const resPut = await app.request("/api/v1/counter", {
      method: "PUT",
      headers: authHeaders({
        "If-Match": "1",
        "Idempotency-Key": "counter-no-put",
      }),
      body: JSON.stringify({ completedCount: 0 }),
    });
    expect(resPut.status).toBe(404);

    const resReset = await app.request("/api/v1/counter/reset", {
      method: "POST",
      headers: authHeaders({
        "Idempotency-Key": "counter-no-reset",
      }),
    });
    expect(resReset.status).toBe(404);
  });
});
