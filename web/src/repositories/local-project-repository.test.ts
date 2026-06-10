/**
 * LocalProjectRepository 単体テスト (BL-020 / FR-LOC-002)
 *
 * 受け入れ基準の出典: docs/developer/features/android-local-mode/spec.md
 *   - FR-LOC-002: LocalProjectRepository は ProjectRepository インターフェースを満たす
 *   - T-15: LocalProjectRepository の単体テスト
 *
 * NOTE: LocalProjectRepository はまだ存在しない. このテストは意図的に失敗する (red).
 *       implementer が実装することで green 化する.
 *
 * モック方針 (NFR-LOC-003):
 *   @capacitor-community/sqlite は jsdom 環境で動作しないため vi.mock でモックする.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { LocalProjectRepository } from "./local-project-repository.js";

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

function makeMockDb(projectRows: Row[] = []) {
  const db = {
    query: vi.fn(async (_sql: string, _values?: unknown[]) => ({
      values: projectRows,
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

describe("LocalProjectRepository.list() (FR-LOC-002 / T-15)", () => {
  // plan.md §T-04: list() が Projects 一覧を返す（空の場合は空配列）
  it("シナリオ: list() が Projects 一覧を返す（空の場合は空配列）", async () => {
    const db = makeMockDb([]); // 空
    const repo = new LocalProjectRepository(db as never);

    const result = await repo.list();

    expect(result).toEqual([]);
  });

  it("シナリオ: list() がプロジェクト一覧を返す", async () => {
    const db = makeMockDb([
      {
        id: "proj-1",
        name: "プロジェクトA",
        created_at: "2026-06-08T00:00:00.000Z",
        updated_at: "2026-06-08T00:00:00.000Z",
        version: 1,
        trashed_at: null,
      },
      {
        id: "proj-2",
        name: "プロジェクトB",
        created_at: "2026-06-08T01:00:00.000Z",
        updated_at: "2026-06-08T01:00:00.000Z",
        version: 1,
        trashed_at: null,
      },
    ]);
    const repo = new LocalProjectRepository(db as never);

    const result = await repo.list();

    expect(result.length).toBe(2);
    expect(result[0]?.name).toBe("プロジェクトA");
  });
});

describe("LocalProjectRepository.create() (FR-LOC-002 / T-15)", () => {
  let db: ReturnType<typeof makeMockDb>;
  let repo: LocalProjectRepository;

  beforeEach(() => {
    db = makeMockDb([]);
    repo = new LocalProjectRepository(db as never);
  });

  // plan.md §T-04: create(name) でプロジェクトが INSERT される
  it("シナリオ: create(name) でプロジェクトが INSERT される", async () => {
    const newId = crypto.randomUUID();
    db.run.mockResolvedValueOnce({ changes: { changes: 1, lastId: 1 } });
    db.query.mockResolvedValueOnce({
      values: [
        {
          id: newId,
          name: "新プロジェクト",
          created_at: "2026-06-08T00:00:00.000Z",
          updated_at: "2026-06-08T00:00:00.000Z",
          version: 1,
          trashed_at: null,
        },
      ],
    });

    const project = await repo.create({ id: newId, name: "新プロジェクト" });

    expect(db.run).toHaveBeenCalled();
    expect(project.name).toBe("新プロジェクト");
    expect(project.id).toBe(newId);
  });
});

describe("LocalProjectRepository.update() (FR-LOC-002 / T-15)", () => {
  let db: ReturnType<typeof makeMockDb>;
  let repo: LocalProjectRepository;

  beforeEach(() => {
    db = makeMockDb([
      {
        id: "proj-1",
        name: "旧プロジェクト名",
        created_at: "2026-06-08T00:00:00.000Z",
        updated_at: "2026-06-08T00:00:00.000Z",
        version: 1,
        trashed_at: null,
      },
    ]);
    repo = new LocalProjectRepository(db as never);
  });

  // plan.md §T-04: update(id, ifMatch, fields) でプロジェクトの name が更新され、version が +1 される
  it("シナリオ: update(id, ifMatch, fields) でプロジェクトの name が更新され、version が +1 される", async () => {
    db.query.mockResolvedValueOnce({
      values: [
        {
          id: "proj-1",
          name: "旧プロジェクト名",
          version: 1,
          created_at: "2026-06-08T00:00:00.000Z",
          updated_at: "2026-06-08T00:00:00.000Z",
          trashed_at: null,
        },
      ],
    });
    db.query.mockResolvedValueOnce({
      values: [
        {
          id: "proj-1",
          name: "新プロジェクト名",
          version: 2,
          created_at: "2026-06-08T00:00:00.000Z",
          updated_at: "2026-06-08T10:00:00.000Z",
          trashed_at: null,
        },
      ],
    });

    const updated = await repo.update({ id: "proj-1", ifMatch: 1, name: "新プロジェクト名" });

    expect(db.run).toHaveBeenCalled();
    expect(updated.name).toBe("新プロジェクト名");
    expect(updated.version).toBe(2);
  });
});

describe("LocalProjectRepository.delete() (FR-LOC-002 / T-15)", () => {
  let db: ReturnType<typeof makeMockDb>;
  let repo: LocalProjectRepository;

  beforeEach(() => {
    db = makeMockDb([
      {
        id: "proj-1",
        name: "プロジェクトA",
        created_at: "2026-06-08T00:00:00.000Z",
        updated_at: "2026-06-08T00:00:00.000Z",
        version: 1,
        trashed_at: null,
      },
    ]);
    repo = new LocalProjectRepository(db as never);
  });

  // plan.md §T-04: delete(id, ifMatch) でプロジェクトが物理削除される
  it("シナリオ: delete(id, ifMatch) でプロジェクトが物理削除される", async () => {
    db.query.mockResolvedValueOnce({
      values: [
        {
          id: "proj-1",
          name: "プロジェクトA",
          version: 1,
          created_at: "2026-06-08T00:00:00.000Z",
          updated_at: "2026-06-08T00:00:00.000Z",
          trashed_at: null,
        },
      ],
    });

    await repo.delete({ id: "proj-1", ifMatch: 1 });

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
