/**
 * LocalTaskRepository 単体テスト (BL-020 / AC-LOC-003)
 *
 * 受け入れ基準の出典: docs/developer/features/android-local-mode/spec.md
 *   - AC-LOC-003: ローカルモード時のタスク操作
 *   - FR-LOC-002: LocalTaskRepository は TaskRepository インターフェースを満たす
 *
 * NOTE: LocalTaskRepository はまだ存在しない. このテストは意図的に失敗する (red).
 *       implementer が実装することで green 化する.
 *
 * モック方針 (NFR-LOC-003):
 *   @capacitor-community/sqlite は jsdom 環境で動作しないため vi.mock でモックする.
 *   MockDBConnection は SQLiteDBConnection の最小実装として query/run/execute を持つ.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { LocalTaskRepository } from "./local-task-repository.js";
import { OptimisticLockError } from "./task-repository.js";

// ---------------------------------------------------------------------------
// @capacitor-community/sqlite モック
// ---------------------------------------------------------------------------

vi.mock("@capacitor-community/sqlite", () => ({
  CapacitorSQLite: {},
  SQLiteConnection: vi.fn(),
}));

// ---------------------------------------------------------------------------
// MockDBConnection: SQLiteDBConnection の最小モック
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;

/**
 * インメモリのテーブルデータを保持し、query/run を横取りするモック DB 接続.
 * テストケースで tables に事前データを仕込むことで SQL 操作の結果を制御する.
 */
function makeMockDb(tables: Record<string, Row[]> = {}): {
  db: {
    query: ReturnType<typeof vi.fn>;
    run: ReturnType<typeof vi.fn>;
    execute: ReturnType<typeof vi.fn>;
    beginTransaction: ReturnType<typeof vi.fn>;
    commitTransaction: ReturnType<typeof vi.fn>;
    rollbackTransaction: ReturnType<typeof vi.fn>;
    isTransactionActive: ReturnType<typeof vi.fn>;
    isDBOpen: ReturnType<typeof vi.fn>;
  };
  tables: Record<string, Row[]>;
} {
  const store: Record<string, Row[]> = {};
  for (const [k, v] of Object.entries(tables)) {
    store[k] = v.map((r) => ({ ...r }));
  }

  const db = {
    query: vi.fn(async (sql: string, _values?: unknown[]) => {
      // テーブル名を正規表現で抽出して対応するストアを返す
      const fromMatch = sql.match(/FROM\s+(\w+)/i);
      const tableName = fromMatch?.[1] ?? "";
      const rows = store[tableName] ?? [];
      return { values: rows };
    }),
    run: vi.fn(async (_sql: string, _values?: unknown[]) => {
      return { changes: { changes: 1, lastId: 1 } };
    }),
    execute: vi.fn(async (_sql: string) => {
      return { changes: { changes: 0 } };
    }),
    beginTransaction: vi.fn(async () => {}),
    commitTransaction: vi.fn(async () => {}),
    rollbackTransaction: vi.fn(async () => {}),
    isTransactionActive: vi.fn(async () => ({ result: false })),
    isDBOpen: vi.fn(async () => ({ result: true })),
  };

  return { db, tables: store };
}

// ---------------------------------------------------------------------------
// テスト
// ---------------------------------------------------------------------------

describe("LocalTaskRepository.today() (AC-LOC-003 / FR-LOC-002)", () => {
  let db: ReturnType<typeof makeMockDb>["db"];
  let repo: LocalTaskRepository;

  beforeEach(() => {
    const mock = makeMockDb({
      tasks: [
        {
          id: "task-c",
          name: "タスクC",
          due_date: "today",
          priority: "normal",
          origin: "manual",
          trashed_at: null,
          trashed_reason: null,
          created_at: "2026-06-08T01:00:00.000Z",
          updated_at: "2026-06-08T01:00:00.000Z",
          project_id: null,
          routine_id: null,
          version: 1,
        },
        {
          id: "task-a",
          name: "タスクA",
          due_date: "today",
          priority: "highest",
          origin: "manual",
          trashed_at: null,
          trashed_reason: null,
          created_at: "2026-06-08T02:00:00.000Z",
          updated_at: "2026-06-08T02:00:00.000Z",
          project_id: null,
          routine_id: null,
          version: 1,
        },
        {
          id: "task-b",
          name: "タスクB",
          due_date: "today",
          priority: "highest",
          origin: "manual",
          trashed_at: null,
          trashed_reason: null,
          created_at: "2026-06-08T01:30:00.000Z",
          updated_at: "2026-06-08T01:30:00.000Z",
          project_id: null,
          routine_id: null,
          version: 1,
        },
        {
          id: "task-trashed",
          name: "ゴミ箱タスク",
          due_date: "today",
          priority: "normal",
          origin: "manual",
          trashed_at: "2026-06-08T03:00:00.000Z",
          trashed_reason: "deleted",
          created_at: "2026-06-08T00:00:00.000Z",
          updated_at: "2026-06-08T03:00:00.000Z",
          project_id: null,
          routine_id: null,
          version: 2,
        },
      ],
      focus_selection: [
        {
          id: "singleton",
          current_task_id: "task-a",
          updated_at: "2026-06-08T00:00:00.000Z",
          version: 1,
        },
      ],
      counter: [
        {
          id: "singleton",
          completed_count: 3,
          last_reset_executed_at: null,
          updated_at: "2026-06-08T00:00:00.000Z",
          version: 1,
        },
      ],
    });
    db = mock.db;
    repo = new LocalTaskRepository(db as never);
  });

  // spec.md (task-sort-newest-first) シナリオ「Android ローカルモードの today() が
  // サーバと同じ順序を返す」/ plan.md D-001:
  // today() は dueDate='today' かつ trashedAt IS NULL のタスクを
  // priority (highest→normal→later) → createdAt 降順(新しい順) → id 昇順 で返す.
  it("シナリオ: today() が priority→createdAt降順(新しい順)→id昇順 で返す (BL-141)", async () => {
    const result = await repo.today();

    // trashedAt != null のタスクは除外される
    expect(result.tasks.find((t) => t.id === "task-trashed")).toBeUndefined();

    const highestTasks = result.tasks.filter((t) => t.priority === "highest");
    const normalTasks = result.tasks.filter((t) => t.priority === "normal");
    expect(highestTasks.length).toBe(2);
    expect(normalTasks.length).toBe(1);

    // highest (task-a 02:00 が task-b 01:30 より新しい) → normal (task-c) の順.
    //   task-a (highest, 02:00) → task-b (highest, 01:30) → task-c (normal, 01:00).
    expect(result.tasks.map((t) => t.id)).toEqual(["task-a", "task-b", "task-c"]);
  });

  // spec.md (task-sort-newest-first) シナリオ「Android ローカルモードの today() が
  // サーバと同じ順序を返す」: nextTaskId は先頭 (= 最新優先) タスクの id.
  it("シナリオ: today() の nextTaskId が先頭 (最新) タスクの id を返す (BL-141)", async () => {
    const result = await repo.today();

    expect(result.nextTaskId).toBe(result.tasks[0]?.id ?? null);
    // 先頭は highest かつ最新の task-a.
    expect(result.nextTaskId).toBe("task-a");
  });

  // plan.md §D-002: currentTaskId は focus_selection の currentTaskId を返す（未設定の場合は null）
  it("シナリオ: today() の currentTaskId が focus_selection の currentTaskId を返す（設定あり）", async () => {
    const result = await repo.today();

    expect(result.currentTaskId).toBe("task-a");
  });

  it("シナリオ: today() の currentTaskId が null を返す（focus_selection が未設定の場合）", async () => {
    // focus_selection が空の場合
    const mock = makeMockDb({
      tasks: [],
      focus_selection: [],
      counter: [
        {
          id: "singleton",
          completed_count: 0,
          last_reset_executed_at: null,
          updated_at: "2026-06-08T00:00:00.000Z",
          version: 1,
        },
      ],
    });
    const emptyRepo = new LocalTaskRepository(mock.db as never);

    const result = await emptyRepo.today();

    expect(result.currentTaskId).toBeNull();
  });
});

describe("LocalTaskRepository.list() (BL-141 明日ビューの並び順)", () => {
  // spec.md (task-sort-newest-first) シナリオ「Android ローカルモードの list()(明日ビュー)が
  // 並び順を適用する」/ plan.md D-001 (R-001):
  //   list({ dueDate: "tomorrow" }) は DB 返却順ではなく共有比較器順
  //   (priority → createdAt 降順 → id 昇順) で並べて返す.
  //
  // モック DB は WHERE を解釈せず tasks テーブルの行を挿入順でそのまま返すため,
  // 「DB 返却順 != 期待順」を作り込むことで並び替えが実装されているかを検証できる.
  // 列名は実マイグレーション (web/src/repositories/local-migrations/v001-initial.ts) の
  // tasks テーブル列集合に一致させる.
  it("シナリオ: list({ dueDate: 'tomorrow' }) が DB 返却順ではなく新しい順で並ぶ", async () => {
    // 挿入順 (= DB 返却順): M が先, N が後. どちらも normal / tomorrow.
    const mock = makeMockDb({
      tasks: [
        {
          id: "task-m",
          name: "M",
          due_date: "tomorrow",
          priority: "normal",
          origin: "manual",
          project_id: null,
          routine_id: null,
          created_at: "2026-01-01T10:00:00.000Z",
          updated_at: "2026-01-01T10:00:00.000Z",
          trashed_at: null,
          trashed_reason: null,
          version: 1,
        },
        {
          id: "task-n",
          name: "N",
          due_date: "tomorrow",
          priority: "normal",
          origin: "manual",
          project_id: null,
          routine_id: null,
          created_at: "2026-01-01T11:00:00.000Z",
          updated_at: "2026-01-01T11:00:00.000Z",
          trashed_at: null,
          trashed_reason: null,
          version: 1,
        },
      ],
    });
    const repo = new LocalTaskRepository(mock.db as never);

    const result = await repo.list({ dueDate: "tomorrow" });

    // DB 返却順は [M, N] だが, 新しい N が先頭になる.
    expect(result.map((t) => t.id)).toEqual(["task-n", "task-m"]);
  });
});

describe("LocalTaskRepository.create() (AC-LOC-003 / FR-LOC-002)", () => {
  let db: ReturnType<typeof makeMockDb>["db"];
  let repo: LocalTaskRepository;

  beforeEach(() => {
    const mock = makeMockDb({ tasks: [], focus_selection: [], counter: [] });
    db = mock.db;
    repo = new LocalTaskRepository(db as never);
  });

  // spec.md §AC-LOC-003: ローカルモードでタスクを作成できる
  it("シナリオ: create(name, dueDate, projectId) でタスクが SQLite に INSERT され、返り値の id が UUID 形式", async () => {
    db.run.mockResolvedValueOnce({ changes: { changes: 1, lastId: 1 } });

    const task = await repo.create({
      id: crypto.randomUUID(),
      name: "新しいタスク",
      dueDate: "today",
    });

    // run (INSERT) が呼ばれていること
    expect(db.run).toHaveBeenCalled();

    // 返り値の id が UUID v4 形式
    expect(task.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );

    expect(task.name).toBe("新しいタスク");
    expect(task.dueDate).toBe("today");
  });
});

describe("LocalTaskRepository.complete() (AC-LOC-003 / FR-LOC-002)", () => {
  let db: ReturnType<typeof makeMockDb>["db"];
  let repo: LocalTaskRepository;

  beforeEach(() => {
    const mock = makeMockDb({
      tasks: [
        {
          id: "task-1",
          name: "タスク1",
          due_date: "today",
          priority: "normal",
          origin: "manual",
          trashed_at: null,
          trashed_reason: null,
          created_at: "2026-06-08T00:00:00.000Z",
          updated_at: "2026-06-08T00:00:00.000Z",
          project_id: null,
          routine_id: null,
          version: 1,
        },
      ],
      counter: [
        {
          id: "singleton",
          completed_count: 0,
          last_reset_executed_at: null,
          updated_at: "2026-06-08T00:00:00.000Z",
          version: 1,
        },
      ],
      focus_selection: [],
    });
    db = mock.db;
    repo = new LocalTaskRepository(db as never);
  });

  // spec.md §AC-LOC-003: タスクを完了できる（trashedReason='completed', Counter.completedCount +1）
  it("シナリオ: complete(id, ifMatch) でタスクが trashedAt=now, trashedReason='completed' に更新され、Counter.completedCount が +1 される", async () => {
    db.query
      .mockResolvedValueOnce({
        values: [
          {
            id: "task-1",
            trashed_at: null,
            trashed_reason: null,
            version: 1,
            name: "タスク1",
            due_date: "today",
            priority: "normal",
            origin: "manual",
            created_at: "2026-06-08T00:00:00.000Z",
            updated_at: "2026-06-08T00:00:00.000Z",
            project_id: null,
            routine_id: null,
          },
        ],
      }) // SELECT task
      .mockResolvedValueOnce({
        values: [
          {
            id: "singleton",
            completed_count: 0,
            version: 1,
          },
        ],
      }); // SELECT counter

    await repo.complete({ id: "task-1", ifMatch: 1 });

    // beginTransaction, commitTransaction が呼ばれていること（1トランザクション）
    expect(db.beginTransaction).toHaveBeenCalled();
    expect(db.commitTransaction).toHaveBeenCalled();

    // run が複数回呼ばれ、trashedReason='completed' の UPDATE が含まれること
    const runCalls = db.run.mock.calls as [string, unknown[]][];
    const completedUpdate = runCalls.find(
      ([sql]) => typeof sql === "string" && sql.includes("completed"),
    );
    expect(completedUpdate).toBeDefined();
  });

  // plan.md §D-002: ifMatch が version と不一致の場合は OptimisticLockError
  it("シナリオ: complete(id, ifMatch) で ifMatch が現在の version と一致しない場合に 412 相当の OptimisticLockError が throw される", async () => {
    db.query.mockResolvedValueOnce({
      values: [
        {
          id: "task-1",
          version: 2, // サーバ側 version=2 なのに ifMatch=1 を渡す
          trashed_at: null,
          trashed_reason: null,
          name: "タスク1",
          due_date: "today",
          priority: "normal",
          origin: "manual",
          created_at: "2026-06-08T00:00:00.000Z",
          updated_at: "2026-06-08T00:00:00.000Z",
          project_id: null,
          routine_id: null,
        },
      ],
    });

    await expect(repo.complete({ id: "task-1", ifMatch: 1 })).rejects.toThrow(OptimisticLockError);
  });
});

describe("LocalTaskRepository.delete() (AC-LOC-003 / FR-LOC-002)", () => {
  let db: ReturnType<typeof makeMockDb>["db"];
  let repo: LocalTaskRepository;

  beforeEach(() => {
    const mock = makeMockDb({
      tasks: [
        {
          id: "task-1",
          name: "タスク1",
          due_date: "today",
          priority: "normal",
          origin: "manual",
          trashed_at: null,
          trashed_reason: null,
          created_at: "2026-06-08T00:00:00.000Z",
          updated_at: "2026-06-08T00:00:00.000Z",
          project_id: null,
          routine_id: null,
          version: 1,
        },
      ],
      counter: [
        {
          id: "singleton",
          completed_count: 5,
          last_reset_executed_at: null,
          updated_at: "2026-06-08T00:00:00.000Z",
          version: 1,
        },
      ],
    });
    db = mock.db;
    repo = new LocalTaskRepository(db as never);
  });

  // spec.md §AC-LOC-003: タスクを削除できる（trashedReason='deleted', completedCount は変化しない）
  it("シナリオ: delete(id, ifMatch) でタスクが trashedAt=now, trashedReason='deleted' に更新され、Counter.completedCount は変化しない", async () => {
    db.query.mockResolvedValueOnce({
      values: [
        {
          id: "task-1",
          version: 1,
          trashed_at: null,
          trashed_reason: null,
          name: "タスク1",
          due_date: "today",
          priority: "normal",
          origin: "manual",
          created_at: "2026-06-08T00:00:00.000Z",
          updated_at: "2026-06-08T00:00:00.000Z",
          project_id: null,
          routine_id: null,
        },
      ],
    });

    await repo.delete({ id: "task-1", ifMatch: 1 });

    // run に 'deleted' を含む SQL が渡されること
    const runCalls = db.run.mock.calls as [string, unknown[]][];
    const deletedUpdate = runCalls.find(
      ([sql]) => typeof sql === "string" && sql.includes("deleted"),
    );
    expect(deletedUpdate).toBeDefined();

    // Counter の UPDATE は呼ばれない（completedCount 変化なし）
    const counterUpdate = runCalls.find(
      ([sql]) =>
        typeof sql === "string" && sql.includes("counter") && sql.includes("completed_count"),
    );
    expect(counterUpdate).toBeUndefined();
  });
});

describe("LocalTaskRepository.update() (FR-LOC-002)", () => {
  let db: ReturnType<typeof makeMockDb>["db"];
  let repo: LocalTaskRepository;

  beforeEach(() => {
    const mock = makeMockDb({ tasks: [], counter: [], focus_selection: [] });
    db = mock.db;
    repo = new LocalTaskRepository(db as never);
  });

  // plan.md §D-002: update でフィールドが更新され version が +1 される
  it("シナリオ: update(id, ifMatch, fields) でタスクの name/priority/dueDate が更新され、version が +1 される", async () => {
    db.query.mockResolvedValueOnce({
      values: [
        {
          id: "task-1",
          name: "旧名前",
          due_date: "today",
          priority: "normal",
          origin: "manual",
          trashed_at: null,
          trashed_reason: null,
          created_at: "2026-06-08T00:00:00.000Z",
          updated_at: "2026-06-08T00:00:00.000Z",
          project_id: null,
          routine_id: null,
          version: 3,
        },
      ],
    });

    await repo.update({
      id: "task-1",
      ifMatch: 3,
      patch: { name: "新しい名前", priority: "highest", dueDate: "tomorrow" },
    });

    // run が呼ばれた SQL に version+1 と更新内容が含まれること
    const runCalls = db.run.mock.calls as [string, unknown[]][];
    expect(runCalls.length).toBeGreaterThan(0);
  });
});

describe("LocalTaskRepository.setFocus() / getFocus() (FR-LOC-002)", () => {
  let db: ReturnType<typeof makeMockDb>["db"];
  let repo: LocalTaskRepository;

  beforeEach(() => {
    const mock = makeMockDb({
      focus_selection: [
        {
          id: "singleton",
          current_task_id: "old-task",
          updated_at: "2026-06-08T00:00:00.000Z",
          version: 1,
        },
      ],
      tasks: [],
      counter: [],
    });
    db = mock.db;
    repo = new LocalTaskRepository(db as never);
  });

  // plan.md §D-002: setFocus で focus_selection が更新される
  it("シナリオ: setFocus(taskId) で focus_selection の currentTaskId が更新される", async () => {
    db.query.mockResolvedValueOnce({
      values: [
        {
          id: "singleton",
          current_task_id: "old-task",
          updated_at: "2026-06-08T00:00:00.000Z",
          version: 1,
        },
      ],
    });

    await repo.setFocus({ taskId: "new-task", ifMatch: 1 });

    const runCalls = db.run.mock.calls as [string, unknown[]][];
    // focus_selection の UPDATE が呼ばれること
    const focusUpdate = runCalls.find(
      ([sql]) =>
        typeof sql === "string" &&
        (sql.includes("focus_selection") || sql.includes("current_task_id")),
    );
    expect(focusUpdate).toBeDefined();
  });

  // plan.md §D-002: getFocus で focus_selection の currentTaskId を返す
  it("シナリオ: getFocus() で focus_selection の currentTaskId を返す", async () => {
    db.query.mockResolvedValueOnce({
      values: [
        {
          id: "singleton",
          current_task_id: "old-task",
          updated_at: "2026-06-08T00:00:00.000Z",
          version: 1,
        },
      ],
    });

    const focus = await repo.getFocus();

    expect(focus.currentTaskId).toBe("old-task");
    expect(focus.id).toBe("singleton");
  });
});
