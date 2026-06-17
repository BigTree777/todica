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

import { beforeEach, describe, expect, it, vi } from "vitest";
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
      ...(db.execute.mock.calls as unknown as [string][]),
    ];
    const deleteCall = allCalls.find(
      ([sql]) => typeof sql === "string" && sql.toUpperCase().includes("DELETE"),
    );
    expect(deleteCall).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Project 経路 (BL-119 / FR-061 / D-2 / D-3 / D-6)
//   offline (local) モードでも Project の論理削除・復元・物理削除を扱う.
//   local-project-repository.delete には依存せず, trashed な project 行を
//   直接 seed して LocalTrashRepository 単体の経路を検証する.
// ---------------------------------------------------------------------------

describe("LocalTrashRepository.listProjects() (FR-LOC-002 / BL-119 / D-2)", () => {
  // trashed_at IS NOT NULL の project を TrashedProject として返す.
  it("シナリオ: listProjects() が trashed な project を返す", async () => {
    const trashedProjects: Row[] = [
      {
        id: "proj-trash-1",
        name: "ゴミ箱プロジェクト",
        created_at: "2026-06-08T00:00:00.000Z",
        updated_at: "2026-06-08T09:00:00.000Z",
        trashed_at: "2026-06-08T09:00:00.000Z",
        version: 2,
      },
    ];
    const db = makeMockDb(trashedProjects);
    const repo = new LocalTrashRepository(db as never);

    const result = await repo.listProjects();

    expect(result.length).toBe(1);
    expect(result[0]?.id).toBe("proj-trash-1");
    expect(result[0]?.name).toBe("ゴミ箱プロジェクト");
    expect(result[0]?.trashedAt).toBe("2026-06-08T09:00:00.000Z");
    // Project は trashedReason を持たない (D-6).
    expect((result[0] as unknown as Record<string, unknown>).trashedReason).toBeUndefined();
  });
});

describe("LocalTrashRepository.restore() — Project 分岐 (FR-LOC-002 / BL-119 / D-3 / D-6)", () => {
  let db: ReturnType<typeof makeMockDb>;
  let repo: LocalTrashRepository;

  beforeEach(() => {
    db = makeMockDb();
    repo = new LocalTrashRepository(db as never);
  });

  // Task として該当無し → Project として trashed_at を NULL に戻す.
  it("シナリオ: restore(id, ifMatch) で project が復元される (trashed_at=NULL)", async () => {
    // 1) tasks 検索: 該当無し (Project 分岐に進む).
    db.query.mockResolvedValueOnce({ values: [] });
    // 2) projects 検索: trashed な project が見つかる.
    db.query.mockResolvedValueOnce({
      values: [
        {
          id: "proj-1",
          name: "復元対象プロジェクト",
          created_at: "2026-06-08T00:00:00.000Z",
          updated_at: "2026-06-08T09:00:00.000Z",
          trashed_at: "2026-06-08T09:00:00.000Z",
          version: 2,
        },
      ],
    });
    // 3) UPDATE 後の再取得: trashed_at=null の状態.
    db.query.mockResolvedValueOnce({
      values: [
        {
          id: "proj-1",
          name: "復元対象プロジェクト",
          created_at: "2026-06-08T00:00:00.000Z",
          updated_at: "2026-06-08T10:00:00.000Z",
          trashed_at: null,
          version: 3,
        },
      ],
    });

    const restored = await repo.restore({ id: "proj-1", ifMatch: 2 });

    // projects テーブルを trashed_at=NULL に更新する run が呼ばれること.
    const runCalls = db.run.mock.calls as [string, unknown[]][];
    const projectRestore = runCalls.find(
      ([sql]) =>
        typeof sql === "string" &&
        sql.toLowerCase().includes("update projects") &&
        sql.toLowerCase().includes("trashed_at = null"),
    );
    expect(projectRestore).toBeDefined();

    // 復元後は trashed_at=null, version+1.
    expect((restored as unknown as { id: string }).id).toBe("proj-1");
    expect((restored as unknown as { trashedAt: string | null }).trashedAt).toBeNull();
    expect(restored.version).toBe(3);
  });
});

describe("LocalTrashRepository.empty() — projects 物理削除 (FR-LOC-002 / BL-119)", () => {
  // empty() は trashed な tasks に加え trashed な projects も物理削除する.
  it("シナリオ: empty() で trashed な projects に対する DELETE が発行される", async () => {
    const db = makeMockDb();
    const repo = new LocalTrashRepository(db as never);

    await repo.empty();

    const runCalls = db.run.mock.calls as [string, unknown[]][];
    const projectDelete = runCalls.find(
      ([sql]) =>
        typeof sql === "string" &&
        sql.toUpperCase().includes("DELETE") &&
        sql.toLowerCase().includes("from projects") &&
        sql.toLowerCase().includes("trashed_at is not null"),
    );
    expect(projectDelete).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Routine 経路 (BL-120 / FR-061 / D-2 / D-3 / D-6)
//   offline (local) モードでも Routine の論理削除・復元・物理削除を扱う.
//   local-routine-repository.delete には依存せず, trashed な routine 行を
//   直接 seed して LocalTrashRepository 単体の経路を検証する.
//
//   注意: 本ファイルは TDD の "red" を作るためのテスト. LocalTrashRepository は
//         listRoutines() を持たず, restore の Routine 分岐 / empty の routines 削除も
//         未実装のため red になる. implementer が repository を拡張して green 化する.
// ---------------------------------------------------------------------------

describe("LocalTrashRepository.listRoutines() (FR-LOC-002 / BL-120 / D-2)", () => {
  // trashed_at IS NOT NULL の routine を TrashedRoutine として返す.
  it("シナリオ: listRoutines() が trashed な routine を返す", async () => {
    const trashedRoutines: Row[] = [
      {
        id: "routine-trash-1",
        name: "ゴミ箱ルーティン",
        generate_on_weekdays: "[1,2,3]",
        default_priority: "normal",
        created_at: "2026-06-08T00:00:00.000Z",
        updated_at: "2026-06-08T09:00:00.000Z",
        trashed_at: "2026-06-08T09:00:00.000Z",
        version: 2,
      },
    ];
    const db = makeMockDb(trashedRoutines);
    const repo = new LocalTrashRepository(db as never);

    const result = await repo.listRoutines();

    expect(result.length).toBe(1);
    expect(result[0]?.id).toBe("routine-trash-1");
    expect(result[0]?.name).toBe("ゴミ箱ルーティン");
    expect(result[0]?.trashedAt).toBe("2026-06-08T09:00:00.000Z");
    // Routine は trashedReason を持たない (D-6).
    expect((result[0] as unknown as Record<string, unknown>).trashedReason).toBeUndefined();
  });
});

describe("LocalTrashRepository.restore() — Routine 分岐 (FR-LOC-002 / BL-120 / D-3 / D-6)", () => {
  let db: ReturnType<typeof makeMockDb>;
  let repo: LocalTrashRepository;

  beforeEach(() => {
    db = makeMockDb();
    repo = new LocalTrashRepository(db as never);
  });

  // Task / Project として該当無し → Routine として trashed_at を NULL に戻す.
  it("シナリオ: restore(id, ifMatch) で routine が復元される (trashed_at=NULL)", async () => {
    // 1) tasks 検索: 該当無し.
    db.query.mockResolvedValueOnce({ values: [] });
    // 2) projects 検索: 該当無し (Routine 分岐に進む).
    db.query.mockResolvedValueOnce({ values: [] });
    // 3) routines 検索: trashed な routine が見つかる.
    db.query.mockResolvedValueOnce({
      values: [
        {
          id: "routine-1",
          name: "復元対象ルーティン",
          generate_on_weekdays: "[1,2,3]",
          default_priority: "normal",
          created_at: "2026-06-08T00:00:00.000Z",
          updated_at: "2026-06-08T09:00:00.000Z",
          trashed_at: "2026-06-08T09:00:00.000Z",
          version: 2,
        },
      ],
    });
    // 4) UPDATE 後の再取得: trashed_at=null の状態.
    db.query.mockResolvedValueOnce({
      values: [
        {
          id: "routine-1",
          name: "復元対象ルーティン",
          generate_on_weekdays: "[1,2,3]",
          default_priority: "normal",
          created_at: "2026-06-08T00:00:00.000Z",
          updated_at: "2026-06-08T10:00:00.000Z",
          trashed_at: null,
          version: 3,
        },
      ],
    });

    const restored = await repo.restore({ id: "routine-1", ifMatch: 2 });

    // routines テーブルを trashed_at=NULL に更新する run が呼ばれること.
    const runCalls = db.run.mock.calls as [string, unknown[]][];
    const routineRestore = runCalls.find(
      ([sql]) =>
        typeof sql === "string" &&
        sql.toLowerCase().includes("update routines") &&
        sql.toLowerCase().includes("trashed_at = null"),
    );
    expect(routineRestore).toBeDefined();

    // 復元後は trashed_at=null, version+1.
    expect((restored as unknown as { id: string }).id).toBe("routine-1");
    expect((restored as unknown as { trashedAt: string | null }).trashedAt).toBeNull();
    expect(restored.version).toBe(3);
  });
});

describe("LocalTrashRepository.empty() — routines 物理削除 (FR-LOC-002 / BL-120)", () => {
  // empty() は trashed な tasks / projects に加え trashed な routines も物理削除する.
  it("シナリオ: empty() で trashed な routines に対する DELETE が発行される", async () => {
    const db = makeMockDb();
    const repo = new LocalTrashRepository(db as never);

    await repo.empty();

    const runCalls = db.run.mock.calls as [string, unknown[]][];
    const routineDelete = runCalls.find(
      ([sql]) =>
        typeof sql === "string" &&
        sql.toUpperCase().includes("DELETE") &&
        sql.toLowerCase().includes("from routines") &&
        sql.toLowerCase().includes("trashed_at is not null"),
    );
    expect(routineDelete).toBeDefined();
  });
});
