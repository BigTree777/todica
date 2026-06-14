import type { DueDate, Priority, Task, TrashedReason } from "@todica/domain/task";
import type { Hono } from "hono";
/**
 * 結合テスト: 今日ビュー API (BL-005 / FR-010 / FR-011 / NFR-001 / NFR-013).
 *
 * 受け入れ基準の出典: docs/developer/features/today-view/spec.md
 * 各 describe / it のタイトルに Gherkin シナリオ名を含めて trace 可能とする.
 *
 * 注意: 本ファイルは TDD の "red" を作るためのテスト.
 *       createApp() の GET /api/v1/today はスタブ (501 を返す) のため,
 *       このファイル内のテストはすべて失敗する想定.
 *       implementer がエンドポイントを実装することで green 化する.
 *
 * 既存 GET /api/v1/tasks のサーバソート規則の統一 (plan.md D-003) に伴う
 * regression 検証もここに同梱する.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  TEST_AUTH_TOKEN,
  TEST_INITIAL_TIME,
  authHeaders,
  buildTestApp,
} from "../helpers/build-test-app.js";
import type {
  InMemoryCounterRepository,
  InMemoryTaskRepository,
} from "../helpers/in-memory-repositories.js";

// 並び順検証のため id が lexicographic に区別できる固定値を用意する.
// UUID v4 形式 ("4xxx" 第 3 グループ / "8/9/a/b" 第 4 グループ) で末尾だけ番号で区別する.
const ID_001 = "00000000-0000-4000-8000-000000000001";
const ID_002 = "00000000-0000-4000-8000-000000000002";
const ID_003 = "00000000-0000-4000-8000-000000000003";
const ID_004 = "00000000-0000-4000-8000-000000000004";
const ID_005 = "00000000-0000-4000-8000-000000000005";

let app: Hono;
let taskRepo: InMemoryTaskRepository;
let counterRepo: InMemoryCounterRepository;

beforeEach(() => {
  vi.stubEnv("TZ", "UTC");

  const built = buildTestApp();
  app = built.app;
  taskRepo = built.taskRepository;
  counterRepo = built.counterRepository;
});

afterEach(() => {
  vi.unstubAllEnvs();
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
// GET /api/v1/today の正常系 (spec.md §「表示対象の絞り込み」/ §「並び順の本仕様」/ §「"次の 1 つ" の一意化」)
// ============================================================

describe("GET /api/v1/today (BL-005 正常系)", () => {
  it("シナリオ: 認証付きで取得すると 200 OK と { tasks, nextTaskId } 形式が返る (FR-010)", async () => {
    // 最小ケース: today タスクが 1 件のみ.
    taskRepo.seed(makeTask({ id: ID_001, name: "牛乳" }));

    const res = await app.request("/api/v1/today", {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      tasks: Array<{ id: string }>;
      nextTaskId: string | null;
    };
    // レスポンスは { tasks, nextTaskId } の 2 プロパティを必ず持つ (plan.md D-005).
    expect(Array.isArray(body.tasks)).toBe(true);
    expect("nextTaskId" in body).toBe(true);
    expect(body.tasks).toHaveLength(1);
    expect(body.tasks[0]?.id).toBe(ID_001);
    expect(body.nextTaskId).toBe(ID_001);
  });

  it('シナリオ: 今日ビューには dueDate = "today" のタスクのみが含まれる (tomorrow は除外)', async () => {
    // spec.md §「表示対象の絞り込み」: T_today は含む, T_tomorrow は含まない.
    taskRepo.seed(makeTask({ id: ID_001, name: "today task", dueDate: "today" }));
    taskRepo.seed(makeTask({ id: ID_002, name: "tomorrow task", dueDate: "tomorrow" }));

    const res = await app.request("/api/v1/today", {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { tasks: Array<{ id: string; dueDate: string }> };
    const ids = body.tasks.map((t) => t.id);
    expect(ids).toContain(ID_001);
    expect(ids).not.toContain(ID_002);
    // 念のためすべての要素が dueDate === "today" であること.
    for (const t of body.tasks) {
      expect(t.dueDate).toBe("today");
    }
  });

  it("シナリオ: 今日ビューにはゴミ箱状態 (deleted / completed) のタスクは含まれない", async () => {
    // spec.md §「表示対象の絞り込み」: T_active のみ含まれる.
    taskRepo.seed(makeTask({ id: ID_001, name: "active" }));
    taskRepo.seed(
      makeTask({
        id: ID_002,
        name: "deleted",
        trashedAt: "2026-06-07T08:00:00.000Z",
        trashedReason: "deleted",
      }),
    );
    taskRepo.seed(
      makeTask({
        id: ID_003,
        name: "completed",
        trashedAt: "2026-06-07T08:00:00.000Z",
        trashedReason: "completed",
      }),
    );

    const res = await app.request("/api/v1/today", {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { tasks: Array<{ id: string }> };
    const ids = body.tasks.map((t) => t.id);
    expect(ids).toEqual([ID_001]);
  });

  it("シナリオ: 今日ビューは全プロジェクト横断 + プロジェクト外 + ルーティン由来を含む", async () => {
    // spec.md §「表示対象の絞り込み」: T1〜T4 のすべてが含まれる.
    taskRepo.seed(makeTask({ id: ID_001, name: "T1", projectId: "P1", origin: "manual" }));
    taskRepo.seed(makeTask({ id: ID_002, name: "T2", projectId: "P2", origin: "manual" }));
    taskRepo.seed(makeTask({ id: ID_003, name: "T3", projectId: null, origin: "manual" }));
    taskRepo.seed(makeTask({ id: ID_004, name: "T4", projectId: null, origin: "routine" }));

    const res = await app.request("/api/v1/today", {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { tasks: Array<{ id: string }> };
    const ids = body.tasks.map((t) => t.id);
    expect(ids).toHaveLength(4);
    for (const id of [ID_001, ID_002, ID_003, ID_004]) {
      expect(ids).toContain(id);
    }
  });
});

// ============================================================
// 並び順の本仕様 (FR-011 / NFR-013 / plan.md D-002)
// ============================================================

describe("GET /api/v1/today (並び順: priority → createdAt → id)", () => {
  it("シナリオ: 優先度の昇順 (highest → normal → later) で並ぶ", async () => {
    // spec.md §「並び順の本仕様」第 1 ケース.
    // 同じ createdAt で priority のみ異なる 3 件.
    taskRepo.seed(
      makeTask({
        id: ID_001,
        name: "A",
        priority: "later",
        createdAt: "2026-06-08T08:00:00.000Z",
      }),
    );
    taskRepo.seed(
      makeTask({
        id: ID_002,
        name: "B",
        priority: "normal",
        createdAt: "2026-06-08T08:00:00.000Z",
      }),
    );
    taskRepo.seed(
      makeTask({
        id: ID_003,
        name: "C",
        priority: "highest",
        createdAt: "2026-06-08T08:00:00.000Z",
      }),
    );

    const res = await app.request("/api/v1/today", {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { tasks: Array<{ id: string; priority: string }> };
    // 期待並び: C (highest), B (normal), A (later).
    expect(body.tasks.map((t) => t.id)).toEqual([ID_003, ID_002, ID_001]);
  });

  it("シナリオ: 同一優先度内では createdAt 昇順 (古い順) で並ぶ", async () => {
    // spec.md §「並び順の本仕様」第 2 ケース.
    taskRepo.seed(
      makeTask({
        id: ID_001,
        name: "A",
        priority: "normal",
        createdAt: "2026-06-08T08:00:00.000Z",
      }),
    );
    taskRepo.seed(
      makeTask({
        id: ID_002,
        name: "B",
        priority: "normal",
        createdAt: "2026-06-08T08:00:01.000Z",
      }),
    );
    taskRepo.seed(
      makeTask({
        id: ID_003,
        name: "C",
        priority: "normal",
        createdAt: "2026-06-08T08:00:02.000Z",
      }),
    );

    const res = await app.request("/api/v1/today", {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { tasks: Array<{ id: string; createdAt: string }> };
    expect(body.tasks.map((t) => t.id)).toEqual([ID_001, ID_002, ID_003]);
  });

  it("シナリオ: 優先度と createdAt が同じなら id の昇順で並ぶ (NFR-013 決定論性の最終担保)", async () => {
    // spec.md §「並び順の本仕様」第 3 ケース.
    // 同じ priority / createdAt で id だけ異なる 2 件.
    taskRepo.seed(
      makeTask({
        id: ID_002,
        name: "X",
        priority: "normal",
        createdAt: "2026-06-08T08:00:00.000Z",
      }),
    );
    taskRepo.seed(
      makeTask({
        id: ID_001,
        name: "Y",
        priority: "normal",
        createdAt: "2026-06-08T08:00:00.000Z",
      }),
    );

    const res = await app.request("/api/v1/today", {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { tasks: Array<{ id: string }> };
    // id 昇順: ID_001 (Y) → ID_002 (X).
    expect(body.tasks.map((t) => t.id)).toEqual([ID_001, ID_002]);
  });

  it("シナリオ: 3 段ソートの複合 (priority 第一, createdAt 第二, id 第三) が決定論的に効く", async () => {
    // 複数キーが混在しても安定して priority → createdAt → id で確定する.
    taskRepo.seed(
      makeTask({
        id: ID_005,
        priority: "later",
        createdAt: "2026-06-08T08:00:00.000Z",
      }),
    );
    taskRepo.seed(
      makeTask({
        id: ID_004,
        priority: "normal",
        createdAt: "2026-06-08T08:00:02.000Z",
      }),
    );
    taskRepo.seed(
      makeTask({
        id: ID_003,
        priority: "normal",
        createdAt: "2026-06-08T08:00:01.000Z",
      }),
    );
    taskRepo.seed(
      makeTask({
        id: ID_002,
        priority: "highest",
        createdAt: "2026-06-08T08:00:00.000Z",
      }),
    );
    taskRepo.seed(
      makeTask({
        id: ID_001,
        priority: "highest",
        createdAt: "2026-06-08T08:00:00.000Z",
      }),
    );

    const res = await app.request("/api/v1/today", {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { tasks: Array<{ id: string }> };
    // 期待並び:
    //   1. highest, createdAt 08:00:00, id ID_001 (id 昇順タイブレーク)
    //   2. highest, createdAt 08:00:00, id ID_002
    //   3. normal,  createdAt 08:00:01, id ID_003
    //   4. normal,  createdAt 08:00:02, id ID_004
    //   5. later,   createdAt 08:00:00, id ID_005
    expect(body.tasks.map((t) => t.id)).toEqual([ID_001, ID_002, ID_003, ID_004, ID_005]);
  });

  it("シナリオ: 同じデータ状態であれば 2 回連続取得しても並び順は同一 (決定論性)", async () => {
    // spec.md §「並び順の本仕様」第 4 ケース.
    taskRepo.seed(makeTask({ id: ID_001, priority: "highest" }));
    taskRepo.seed(makeTask({ id: ID_002, priority: "normal" }));
    taskRepo.seed(makeTask({ id: ID_003, priority: "later" }));
    taskRepo.seed(makeTask({ id: ID_004, priority: "normal" }));

    const res1 = await app.request("/api/v1/today", {
      method: "GET",
      headers: authHeaders(),
    });
    const res2 = await app.request("/api/v1/today", {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    const body1 = (await res1.json()) as { tasks: Array<{ id: string }> };
    const body2 = (await res2.json()) as { tasks: Array<{ id: string }> };

    expect(body2.tasks.map((t) => t.id)).toEqual(body1.tasks.map((t) => t.id));
  });
});

// ============================================================
// 「次の 1 つ」の一意化 (FR-011 / plan.md D-005)
// ============================================================

describe("GET /api/v1/today (nextTaskId)", () => {
  it("シナリオ: nextTaskId は並びの先頭タスクの id と一致する", async () => {
    // spec.md §「\"次の 1 つ\" の一意化」第 1 ケース.
    // A (highest) と B (normal) の場合, 先頭 = A.
    taskRepo.seed(
      makeTask({
        id: ID_002,
        name: "A",
        priority: "highest",
        createdAt: "2026-06-08T08:00:00.000Z",
      }),
    );
    taskRepo.seed(
      makeTask({
        id: ID_001,
        name: "B",
        priority: "normal",
        createdAt: "2026-06-08T08:00:00.000Z",
      }),
    );

    const res = await app.request("/api/v1/today", {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      tasks: Array<{ id: string }>;
      nextTaskId: string | null;
    };
    expect(body.tasks[0]?.id).toBe(ID_002); // highest が先頭
    expect(body.nextTaskId).toBe(ID_002);
    expect(body.nextTaskId).toBe(body.tasks[0]?.id);
  });

  it("シナリオ: 今日タスクが 0 件のとき tasks=[] / nextTaskId=null", async () => {
    // spec.md §「\"次の 1 つ\" の一意化」第 2 ケース.
    // 何も seed しない.
    const res = await app.request("/api/v1/today", {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      tasks: unknown[];
      nextTaskId: string | null;
    };
    expect(body.tasks).toEqual([]);
    expect(body.nextTaskId).toBeNull();
  });

  it("シナリオ: today タスクが 0 件 (tomorrow のみ存在) でも tasks=[] / nextTaskId=null", async () => {
    // tomorrow しか無い場合, today ビューとしては空になる.
    taskRepo.seed(makeTask({ id: ID_001, dueDate: "tomorrow" }));

    const res = await app.request("/api/v1/today", {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      tasks: unknown[];
      nextTaskId: string | null;
    };
    expect(body.tasks).toEqual([]);
    expect(body.nextTaskId).toBeNull();
  });

  it("シナリオ: 先頭タスクを完了すると, 再取得で 2 番目だったタスクが先頭 (nextTaskId) になる", async () => {
    // spec.md §「\"次の 1 つ\" の一意化」第 3 ケース.
    // A, B, C を起き, A を complete してから再取得すると B が先頭になる.
    taskRepo.seed(
      makeTask({
        id: ID_001,
        name: "A",
        priority: "highest",
        createdAt: "2026-06-08T08:00:00.000Z",
      }),
    );
    taskRepo.seed(
      makeTask({
        id: ID_002,
        name: "B",
        priority: "highest",
        createdAt: "2026-06-08T08:00:01.000Z",
      }),
    );
    taskRepo.seed(
      makeTask({
        id: ID_003,
        name: "C",
        priority: "normal",
        createdAt: "2026-06-08T08:00:02.000Z",
      }),
    );

    // 取得前の並びは A, B, C.
    const resBefore = await app.request("/api/v1/today", {
      method: "GET",
      headers: authHeaders(),
    });
    expect(resBefore.status).toBe(200);
    const before = (await resBefore.json()) as {
      tasks: Array<{ id: string }>;
      nextTaskId: string | null;
    };
    expect(before.tasks.map((t) => t.id)).toEqual([ID_001, ID_002, ID_003]);
    expect(before.nextTaskId).toBe(ID_001);

    // A を完了.
    const completeRes = await app.request(`/api/v1/tasks/${ID_001}/complete`, {
      method: "POST",
      headers: authHeaders({
        "If-Match": "1",
        "Idempotency-Key": "today-promote-complete-A",
      }),
    });
    expect(completeRes.status).toBe(200);

    // 再取得すると B が先頭になり, nextTaskId も B の id になる.
    const resAfter = await app.request("/api/v1/today", {
      method: "GET",
      headers: authHeaders(),
    });
    expect(resAfter.status).toBe(200);
    const after = (await resAfter.json()) as {
      tasks: Array<{ id: string }>;
      nextTaskId: string | null;
    };
    expect(after.tasks.map((t) => t.id)).toEqual([ID_002, ID_003]);
    expect(after.nextTaskId).toBe(ID_002);
  });
});

// ============================================================
// 認証 / 異常系 (NFR-002 と整合)
// ============================================================

describe("GET /api/v1/today (認証 / 異常系)", () => {
  it("シナリオ: Authorization ヘッダ無しのリクエストは 401 を返す", async () => {
    // spec.md §「認証」相当. 既存 /tasks と同じ認証ミドルウェアが適用される.
    const res = await app.request("/api/v1/today", {
      method: "GET",
      // Authorization 無し.
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(401);
  });

  it("シナリオ: 異なる Bearer トークン値のリクエストは 401 を返す", async () => {
    const res = await app.request("/api/v1/today", {
      method: "GET",
      headers: {
        Authorization: "Bearer WRONG",
        "Content-Type": "application/json",
      },
    });
    expect(res.status).toBe(401);
  });
});

// ============================================================
// NFR-001: 並び順を変えるクエリパラメータが存在しない
//
// spec.md §「並び順を変えるカスタマイズが存在しないこと (NFR-001)」.
// 「クエリパラメータを無視 (= 既定の並び順と同じ結果)」を仕様として固定する.
// implementer がクエリでソート規則を切り替えるようなコードを書くと red になる.
// ============================================================

describe("GET /api/v1/today (NFR-001 並び順カスタマイズ不在)", () => {
  it("シナリオ: 並び替えクエリを付けても既定の並びと同じ結果になる", async () => {
    taskRepo.seed(
      makeTask({
        id: ID_002,
        priority: "highest",
        createdAt: "2026-06-08T08:00:00.000Z",
      }),
    );
    taskRepo.seed(
      makeTask({
        id: ID_001,
        priority: "later",
        createdAt: "2026-06-08T08:00:00.000Z",
      }),
    );

    const resDefault = await app.request("/api/v1/today", {
      method: "GET",
      headers: authHeaders(),
    });
    const resWithQuery = await app.request(
      "/api/v1/today?sort=createdAt&order=desc&priority=later",
      {
        method: "GET",
        headers: authHeaders(),
      },
    );

    expect(resDefault.status).toBe(200);
    expect(resWithQuery.status).toBe(200);

    const bodyDefault = (await resDefault.json()) as { tasks: Array<{ id: string }> };
    const bodyWithQuery = (await resWithQuery.json()) as {
      tasks: Array<{ id: string }>;
    };
    // クエリの有無で結果は変わらない (= 並び順カスタマイズが存在しない).
    expect(bodyWithQuery.tasks.map((t) => t.id)).toEqual(bodyDefault.tasks.map((t) => t.id));
  });
});

// ============================================================
// 既存 GET /api/v1/tasks のソート規則統一 (regression / plan.md D-003)
//
// spec.md §「既存実装との整合 (暫定 → 本実装の差し替え担保)」.
// 既存暫定実装は dueDate (today→tomorrow) → priority → createdAt の 3 段ソートだったが,
// BL-005 で priority → createdAt → id の 3 段に統一する.
// → dueDate を第一キーから外しても結果順序が決定論的に priority → createdAt → id になる.
// ============================================================

describe("GET /api/v1/tasks (BL-005 D-003: ソート規則統一)", () => {
  it("シナリオ: 一覧 API も priority → createdAt → id の順で並ぶ (dueDate は第一キーから外れる)", async () => {
    // 暫定実装 (旧仕様: dueDate → priority → createdAt) なら,
    //   1. T_today_later (today, later)
    //   2. T_tomorrow_highest (tomorrow, highest)  ← dueDate が第二優先扱いだと逆順
    // が期待される. 本仕様 (priority → createdAt → id) では,
    //   1. T_tomorrow_highest (highest)
    //   2. T_today_later     (later)
    // となる必要がある.
    taskRepo.seed(
      makeTask({
        id: ID_001,
        name: "today-later",
        dueDate: "today",
        priority: "later",
        createdAt: "2026-06-08T08:00:00.000Z",
      }),
    );
    taskRepo.seed(
      makeTask({
        id: ID_002,
        name: "tomorrow-highest",
        dueDate: "tomorrow",
        priority: "highest",
        createdAt: "2026-06-08T08:00:00.000Z",
      }),
    );

    const res = await app.request("/api/v1/tasks", {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { tasks: Array<{ id: string; priority: string }> };
    // 本仕様では priority highest が先頭になる. dueDate キーは効かない.
    expect(body.tasks.map((t) => t.id)).toEqual([ID_002, ID_001]);
  });

  it("シナリオ: priority が同じなら createdAt 昇順, 同じなら id 昇順 (一覧 API も同一規則)", async () => {
    taskRepo.seed(
      makeTask({
        id: ID_002,
        priority: "normal",
        createdAt: "2026-06-08T08:00:00.000Z",
      }),
    );
    taskRepo.seed(
      makeTask({
        id: ID_001,
        priority: "normal",
        createdAt: "2026-06-08T08:00:00.000Z",
      }),
    );
    taskRepo.seed(
      makeTask({
        id: ID_003,
        priority: "normal",
        createdAt: "2026-06-08T08:00:01.000Z",
      }),
    );

    const res = await app.request("/api/v1/tasks", {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { tasks: Array<{ id: string }> };
    // 同 priority 同 createdAt は id 昇順. その後 createdAt の遅い ID_003.
    expect(body.tasks.map((t) => t.id)).toEqual([ID_001, ID_002, ID_003]);
  });
});

// ============================================================
// BL-008 / FR-040: GET /api/v1/today レスポンスへの completionCount 同梱
//
// spec.md (completion-counter) §「GET /api/v1/today レスポンスへの同梱 (UI 連携)」.
// plan.md D-006 採用案: 「今日ビューを 1 リクエストで完結」させるため,
// {tasks, nextTaskId, currentTaskId} に completionCount を追加する.
// implementer は /today ハンドラ内で counter-repository.get() を呼んで同梱する.
// ============================================================

describe("GET /api/v1/today (BL-008 completionCount 拡張)", () => {
  it("シナリオ: GET /api/v1/today に completionCount が含まれる", async () => {
    // spec.md §「GET /api/v1/today レスポンスへの同梱」第 1 ケース.
    counterRepo.seed({ completedCount: 3 });
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
      completionCount: number;
    };
    // completionCount フィールドが含まれる.
    expect("completionCount" in body).toBe(true);
    // サーバ正本値 (= counterRepo.completedCount) と一致する.
    expect(body.completionCount).toBe(3);
  });

  it("シナリオ: 初期状態 (Counter 未更新) の /today の completionCount は 0", async () => {
    // counter を seed しない: 初期値 (completedCount = 0).
    taskRepo.seed(makeTask({ id: ID_001 }));

    const res = await app.request("/api/v1/today", {
      method: "GET",
      headers: authHeaders(),
    });
    expect(res.status).toBe(200);

    const body = (await res.json()) as { completionCount: number };
    expect(body.completionCount).toBe(0);
  });

  it("シナリオ: 完了直後に GET /api/v1/today で読むと completionCount が +1 反映されている", async () => {
    // spec.md §「GET /api/v1/today レスポンスへの同梱」第 2 ケース.
    taskRepo.seed(makeTask({ id: ID_001 }));
    taskRepo.seed(makeTask({ id: ID_002 }));

    // 完了前 /today の completionCount は 0.
    const before = await app.request("/api/v1/today", {
      method: "GET",
      headers: authHeaders(),
    });
    expect(before.status).toBe(200);
    const beforeBody = (await before.json()) as { completionCount: number };
    expect(beforeBody.completionCount).toBe(0);

    // 完了アクションを 1 件発行.
    const completeRes = await app.request(`/api/v1/tasks/${ID_001}/complete`, {
      method: "POST",
      headers: authHeaders({
        "If-Match": "1",
        "Idempotency-Key": "today-completion-count-1",
      }),
    });
    expect(completeRes.status).toBe(200);

    // 完了直後の /today で completionCount = 1.
    const after = await app.request("/api/v1/today", {
      method: "GET",
      headers: authHeaders(),
    });
    expect(after.status).toBe(200);
    const afterBody = (await after.json()) as { completionCount: number };
    expect(afterBody.completionCount).toBe(1);
  });
});

// ============================================================
// (補助) 認証ありの正常系で TEST_AUTH_TOKEN が一致することの確認
// ============================================================

describe("補助確認", () => {
  it("TEST_AUTH_TOKEN が定義されており, /today からも疎通すること (実体は他テストで確認)", () => {
    expect(TEST_AUTH_TOKEN).toBeTruthy();
  });
});

// ============================================================
// BL-010 / FR-043 / FR-051: GET /api/v1/today の自動リセット統合
//
// spec.md (daily-reset) §「GET /api/v1/today への自動リセット統合」と 1:1 対応する.
// GET /api/v1/today のハンドラ先頭で maybeRunDailyReset を呼び出し、
// リセット条件を満たす場合は自動でリセットが実行される (plan.md D-003 / U-003).
//
// 注意: 本 describe は TDD の "red" を作るためのテスト.
//       GET /api/v1/today ハンドラへの maybeRunDailyReset 統合が未実装のため,
//       下記テストは失敗する想定.
//       implementer が今日ビューハンドラにリセット呼び出しを追加することで green 化する.
// ============================================================

describe("GET /api/v1/today (BL-010 自動リセット統合)", () => {
  it("シナリオ: 境界時刻を超えた状態で GET /today を叩くと自動リセットが実行される " +
    "(spec.md §「GET /api/v1/today のアクセス時にリセット条件を満たす場合は自動でリセットが実行される」)", async () => {
    // Given counter.completedCount = 3（リセット前）
    // And   "tomorrow" のタスクが 1 件ある
    // And   現在時刻が境界時刻を超えている（lastResetExecutedAt は null）
    // When  GET /api/v1/today を叩く
    // Then  200 OK が返る
    // And   レスポンスの completionCount = 0 になっている（completedCount がリセットされた）

    // 境界時刻（"04:00"）を超えた状態で初期化する。
    // InMemorySettingsRepository の初期 dayBoundaryTime は "04:00"。
    // 初期 clock = "2026-06-07T09:00:00.000Z" は境界時刻（04:00）を超えている（09:00 > 04:00）ので
    // デフォルトの buildTestApp() を使って lastResetExecutedAt = null にすればリセット条件を満たす。

    counterRepo.seed({ completedCount: 3, lastResetExecutedAt: null });
    taskRepo.seed(makeTask({ id: ID_001, dueDate: "tomorrow" }));

    const res = await app.request("/api/v1/today", {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      tasks: Array<{ id: string; dueDate: string }>;
      completionCount: number;
    };

    // 自動リセット後: completionCount = 0 になっている
    expect(body.completionCount).toBe(0);
  });

  it('シナリオ: "tomorrow" タスクがリセット後に今日ビューで表示される（dueDate = "today"）', async () => {
    // 監査指摘 [中] 3-b:
    //   Given "tomorrow" のタスクが 1 件ある
    //   And   境界時刻を超えており lastResetExecutedAt = null
    //   When  GET /api/v1/today
    //   Then  200 OK
    //   And   "tomorrow" タスクがリセット後に今日ビューで表示される（dueDate = "today"）

    counterRepo.seed({ completedCount: 0, lastResetExecutedAt: null });
    taskRepo.seed(makeTask({ id: ID_001, dueDate: "tomorrow" }));

    const res = await app.request("/api/v1/today", {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      tasks: Array<{ id: string; dueDate: string }>;
      completionCount: number;
    };

    // 自動リセット後: "tomorrow" タスクが "today" に変わり、今日ビューに表示される
    const ids = body.tasks.map((t) => t.id);
    expect(ids).toContain(ID_001);
    const task = body.tasks.find((t) => t.id === ID_001);
    expect(task?.dueDate).toBe("today");
  });

  it("シナリオ: 境界時刻を超えていない状態では GET /today は自動リセットしない（completionCount が変わらない）", async () => {
    // 監査指摘 [中] 3-c:
    //   Given 現在時刻が境界時刻を超えていない（例: "2026-06-07T02:00:00.000Z"）
    //   And   completedCount = 3
    //   When  GET /api/v1/today
    //   Then  completionCount = 3 のまま（リセットされない）

    // 境界時刻（"04:00"）を超えていない時刻で再初期化する
    const built = buildTestApp({ initialTime: "2026-06-07T02:00:00.000Z" });
    const appBefore = built.app;
    built.counterRepository.seed({ completedCount: 3, lastResetExecutedAt: null });
    built.taskRepository.seed(makeTask({ id: ID_001 }));

    const res = await appBefore.request("/api/v1/today", {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { completionCount: number };

    // 境界時刻を超えていないためリセットされず completionCount = 3 のまま
    expect(body.completionCount).toBe(3);
  });
});
