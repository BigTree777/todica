/**
 * LocalTrashRepository 単体テスト (BL-020 / FR-LOC-002)
 *
 * 受け入れ基準の出典: docs/developer/features/android-local-mode/spec.md
 *   - FR-LOC-002: LocalTrashRepository は TrashRepository インターフェースを満たす
 *   - T-17: LocalTrashRepository の単体テスト
 *
 * NOTE: LocalTrashRepository はまだ存在しない. このテストは意図的に失敗する (red).
 *       implementer が実装することで green 化する.
 *
 * モック方針 (NFR-LOC-003):
 *   @capacitor-community/sqlite は jsdom 環境で動作しないため vi.mock でモックする.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { LocalTrashRepository } from "./local-trash-repository.js";

// ---------------------------------------------------------------------------
// @capacitor-community/sqlite モック
// ---------------------------------------------------------------------------

vi.mock("@capacitor-community/sqlite", () => ({
  CapacitorSQLite: {},
  SQLiteConnection: vi.fn(),
}));

// ---------------------------------------------------------------------------
// MockDBConnection
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;

function makeMockDb(tasksRows: Row[] = []) {
  const db = {
    query: vi.fn(async (_sql: string, _values?: unknown[]) => ({
      values: tasksRows,
    })),
    run: vi.fn(async (_sql: string, _values?: unknown[]) => ({
      changes: { changes: 1, lastId: 1 },
    })),
    execute: vi.fn(async () => ({ changes: { changes: 0 } })),
    beginTransaction: vi.fn(async () => {}),
    commitTransaction: vi.fn(async () => {}),
    rollbackTransaction: vi.fn(async () => {}),
  };
  return db;
}

// ---------------------------------------------------------------------------
// テスト
// ---------------------------------------------------------------------------

describe("LocalTrashRepository.list() (FR-LOC-002 / T-17)", () => {
  // plan.md §T-06: list() が trashedAt IS NOT NULL のタスクを trashedAt 降順で返す
  it("シナリオ: list() が trashedAt IS NOT NULL のタスクを trashedAt 降順で返す", async () => {
    const trashedTasks: Row[] = [
      {
        id: "task-newer",
        name: "新しいゴミ箱タスク",
        trashed_at: "2026-06-08T10:00:00.000Z",
        trashed_reason: "completed",
        due_date: "today",
        priority: "normal",
        origin: "manual",
        project_id: null,
        routine_id: null,
        created_at: "2026-06-08T00:00:00.000Z",
        updated_at: "2026-06-08T10:00:00.000Z",
        version: 2,
      },
      {
        id: "task-older",
        name: "古いゴミ箱タスク",
        trashed_at: "2026-06-08T09:00:00.000Z",
        trashed_reason: "deleted",
        due_date: "today",
        priority: "normal",
        origin: "manual",
        project_id: null,
        routine_id: null,
        created_at: "2026-06-07T00:00:00.000Z",
        updated_at: "2026-06-08T09:00:00.000Z",
        version: 2,
      },
    ];

    const db = makeMockDb(trashedTasks);
    const repo = new LocalTrashRepository(db as never);

    const result = await repo.list();

    // trashedAt IS NOT NULL のタスクが返る
    expect(result.length).toBe(2);
    expect(result.every((t) => t.trashedAt !== null && t.trashedAt !== undefined)).toBe(true);

    // trashedAt 降順（新しい方が先）
    const newerIndex = result.findIndex((t) => t.id === "task-newer");
    const olderIndex = result.findIndex((t) => t.id === "task-older");
    expect(newerIndex).toBeLessThan(olderIndex);
  });
});

describe("LocalTrashRepository.restore() (FR-LOC-002 / T-17)", () => {
  let db: ReturnType<typeof makeMockDb>;
  let repo: LocalTrashRepository;

  beforeEach(() => {
    db = makeMockDb([
      {
        id: "task-1",
        name: "タスク1",
        trashed_at: "2026-06-08T09:00:00.000Z",
        trashed_reason: "deleted",
        due_date: "today",
        priority: "normal",
        origin: "manual",
        project_id: null,
        routine_id: null,
        created_at: "2026-06-08T00:00:00.000Z",
        updated_at: "2026-06-08T09:00:00.000Z",
        version: 2,
      },
    ]);
    repo = new LocalTrashRepository(db as never);
  });

  // plan.md §T-06: restore で trashedAt=null, trashedReason=null に更新される
  it("シナリオ: restore(id, ifMatch) でタスクの trashedAt=null, trashedReason=null に更新される", async () => {
    db.query.mockResolvedValueOnce({
      values: [
        {
          id: "task-1",
          name: "タスク1",
          trashed_at: "2026-06-08T09:00:00.000Z",
          trashed_reason: "deleted",
          version: 2,
          due_date: "today",
          priority: "normal",
          origin: "manual",
          project_id: null,
          routine_id: null,
          created_at: "2026-06-08T00:00:00.000Z",
          updated_at: "2026-06-08T09:00:00.000Z",
        },
      ],
    });
    // UPDATE 後の再取得（trashedAt=null の状態）
    db.query.mockResolvedValueOnce({
      values: [
        {
          id: "task-1",
          name: "タスク1",
          trashed_at: null,
          trashed_reason: null,
          version: 3,
          due_date: "today",
          priority: "normal",
          origin: "manual",
          project_id: null,
          routine_id: null,
          created_at: "2026-06-08T00:00:00.000Z",
          updated_at: "2026-06-08T10:00:00.000Z",
        },
      ],
    });

    await repo.restore({ id: "task-1", ifMatch: 2 });

    // run が呼ばれ、SQL に NULL が含まれること（trashed_at を NULL に更新）
    const runCalls = db.run.mock.calls as [string, unknown[]][];
    expect(runCalls.length).toBeGreaterThan(0);
    // NULL を含む SQL または NULL を値として渡す呼び出しが存在すること
    const nullUpdate = runCalls.find(
      ([sql, values]) =>
        (typeof sql === "string" && sql.toLowerCase().includes("null")) ||
        (Array.isArray(values) && values.includes(null)),
    );
    expect(nullUpdate).toBeDefined();
  });
});

describe("LocalTrashRepository.empty() (FR-LOC-002 / T-17)", () => {
  // plan.md §T-06: empty() で trashedAt IS NOT NULL のすべてのタスクが物理削除される
  it("シナリオ: empty() で trashedAt IS NOT NULL のすべてのタスクが物理削除される", async () => {
    const db = makeMockDb([
      {
        id: "task-trash-1",
        trashed_at: "2026-06-08T09:00:00.000Z",
        version: 2,
        name: "タスク1",
        trashed_reason: "deleted",
        due_date: "today",
        priority: "normal",
        origin: "manual",
        project_id: null,
        routine_id: null,
        created_at: "2026-06-08T00:00:00.000Z",
        updated_at: "2026-06-08T09:00:00.000Z",
      },
    ]);
    const repo = new LocalTrashRepository(db as never);

    await repo.empty();

    // run または execute に DELETE 文が呼ばれること
    const allCalls = [
      ...(db.run.mock.calls as [string, unknown[]][]),
      ...(db.execute.mock.calls as [string][]),
    ];
    const deleteCall = allCalls.find(([sql]) =>
      typeof sql === "string" && sql.toUpperCase().includes("DELETE"),
    );
    expect(deleteCall).toBeDefined();
  });
});
