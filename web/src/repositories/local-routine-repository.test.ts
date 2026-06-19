/**
 * LocalRoutineRepository 単体テスト (BL-020 / BL-120 / FR-LOC-002)
 *
 * 受け入れ基準の出典:
 *   - docs/developer/features/android-local-mode/spec.md FR-LOC-002 / T-16
 *   - docs/developer/features/routine-soft-delete/spec.md AC-15
 *     (ローカル offline でも Routine 削除がゴミ箱化される = soft delete).
 *
 * モック方針 (NFR-LOC-003):
 *   @capacitor-community/sqlite は jsdom 環境で動作しないため vi.mock でモックする.
 *
 * 特記事項:
 *   daysOfWeek は routines.days_of_week 列に JSON 文字列として保存し、
 *   読み出し時に JSON.parse して配列として返す（plan.md §D-001）.
 *   列名はマイグレーション定義 (local-migrations/v001-initial.ts) と一致させる.
 *   列集合の整合は local-routine-repository-schema.test.ts が別途担保する.
 *
 * 注記:
 *   delete() は物理削除 (DELETE) ではなく soft delete (UPDATE trashed_at) であること
 *   (AC-15 / offline soft delete) を本テストで担保する.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { LocalRoutineRepository } from "./local-routine-repository.js";

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

function makeMockDb(routineRows: Row[] = []) {
  const db = {
    query: vi.fn(async (_sql: string, _values?: unknown[]) => ({
      values: routineRows,
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

describe("LocalRoutineRepository.list() (FR-LOC-002 / T-16)", () => {
  // plan.md §D-001 / T-05: daysOfWeek は JSON パースされた配列で返す
  it("シナリオ: list() が Routine 一覧を返す（daysOfWeek は JSON パースされた配列で返す）", async () => {
    const db = makeMockDb([
      {
        id: "routine-1",
        name: "朝のルーティン",
        days_of_week: JSON.stringify([1, 2, 3, 4, 5]), // JSON 文字列として保存
        default_priority: "normal",
        created_at: "2026-06-08T00:00:00.000Z",
        updated_at: "2026-06-08T00:00:00.000Z",
        trashed_at: null,
        version: 1,
      },
    ]);
    const repo = new LocalRoutineRepository(db as never);

    const result = await repo.list();

    expect(result.length).toBe(1);
    expect(result[0]?.name).toBe("朝のルーティン");

    // daysOfWeek が JSON パース済みの配列として返る
    const routine = result[0];
    expect(Array.isArray(routine?.daysOfWeek)).toBe(true);
    expect(routine?.daysOfWeek).toEqual([1, 2, 3, 4, 5]);
  });

  it("シナリオ: list() が空の場合は空配列を返す", async () => {
    const db = makeMockDb([]);
    const repo = new LocalRoutineRepository(db as never);

    const result = await repo.list();

    expect(result).toEqual([]);
  });

  // BL-120 / AC-15: 通常一覧は trashed_at IS NULL で絞り込む.
  it("シナリオ (AC-15): list() は trashed_at IS NULL で絞り込む SELECT を発行する", async () => {
    const db = makeMockDb([]);
    const repo = new LocalRoutineRepository(db as never);

    await repo.list();

    const queryCalls = db.query.mock.calls as [string, unknown[]?][];
    const listQuery = queryCalls.find(
      ([sql]) =>
        typeof sql === "string" &&
        sql.toLowerCase().includes("from routines") &&
        sql.toLowerCase().includes("trashed_at is null"),
    );
    expect(listQuery).toBeDefined();
  });
});

describe("LocalRoutineRepository.create() (FR-LOC-002 / T-16)", () => {
  let db: ReturnType<typeof makeMockDb>;
  let repo: LocalRoutineRepository;

  beforeEach(() => {
    db = makeMockDb([]);
    repo = new LocalRoutineRepository(db as never);
  });

  // plan.md §T-05: create(name, daysOfWeek) でルーティンが INSERT される
  // daysOfWeek は JSON.stringify してから保存
  it("シナリオ: create(name, daysOfWeek) でルーティンが INSERT される（daysOfWeek は JSON.stringify してから保存）", async () => {
    const newId = crypto.randomUUID();
    db.run.mockResolvedValueOnce({ changes: { changes: 1, lastId: 1 } });
    db.query.mockResolvedValueOnce({
      values: [
        {
          id: newId,
          name: "夕方ルーティン",
          days_of_week: JSON.stringify([1, 3, 5]),
          default_priority: "normal",
          created_at: "2026-06-08T00:00:00.000Z",
          updated_at: "2026-06-08T00:00:00.000Z",
          trashed_at: null,
          version: 1,
        },
      ],
    });

    const routine = await repo.create({
      id: newId,
      name: "夕方ルーティン",
      daysOfWeek: [1, 3, 5],
      defaultPriority: "normal",
    });

    // run が呼ばれた（INSERT）
    expect(db.run).toHaveBeenCalled();

    // run に渡された引数に JSON.stringify された文字列が含まれること
    const runCalls = db.run.mock.calls as [string, unknown[]][];
    const insertCall = runCalls[0];
    expect(insertCall).toBeDefined();
    if (insertCall) {
      const [, values] = insertCall;
      const jsonified = Array.isArray(values)
        ? values.find((v) => typeof v === "string" && v.includes("[") && v.includes("]"))
        : undefined;
      expect(jsonified).toBeDefined();
    }

    expect(routine.name).toBe("夕方ルーティン");
    // 返り値の daysOfWeek も配列として返る
    expect(Array.isArray(routine.daysOfWeek)).toBe(true);
  });
});

describe("LocalRoutineRepository.delete() (BL-120 / AC-15 ゴミ箱送り)", () => {
  let db: ReturnType<typeof makeMockDb>;
  let repo: LocalRoutineRepository;

  beforeEach(() => {
    db = makeMockDb([
      {
        id: "routine-1",
        name: "朝のルーティン",
        days_of_week: JSON.stringify([1, 2, 3, 4, 5]),
        default_priority: "normal",
        created_at: "2026-06-08T00:00:00.000Z",
        updated_at: "2026-06-08T00:00:00.000Z",
        trashed_at: null,
        version: 1,
      },
    ]);
    repo = new LocalRoutineRepository(db as never);
  });

  // BL-120 / AC-15 / FR-1 / FR-061: delete(id, ifMatch) は物理削除ではなく
  // 論理削除 (ゴミ箱送り) でなければならない. trashed_at をセットする UPDATE を
  // 発行し, DELETE は発行しないことを検証する. 物理削除すると復元不能で
  // ゴミ箱に出ないため AC-15 違反になる (offline soft delete 往復が成立しない).
  it("シナリオ (AC-15): delete(id, ifMatch) でルーティンが論理削除 (ゴミ箱送り) される", async () => {
    db.query.mockResolvedValueOnce({
      values: [
        {
          id: "routine-1",
          name: "朝のルーティン",
          days_of_week: JSON.stringify([1, 2, 3, 4, 5]),
          default_priority: "normal",
          created_at: "2026-06-08T00:00:00.000Z",
          updated_at: "2026-06-08T00:00:00.000Z",
          trashed_at: null,
          version: 1,
        },
      ],
    });

    await repo.delete({ id: "routine-1", ifMatch: 1 });

    const allCalls = [
      ...(db.run.mock.calls as [string, unknown[]][]),
      ...(db.execute.mock.calls as unknown as [string, unknown[]][]),
    ];

    // 物理削除 (DELETE) は発行されないこと.
    const deleteCall = allCalls.find(
      ([sql]) => typeof sql === "string" && sql.toUpperCase().includes("DELETE"),
    );
    expect(deleteCall).toBeUndefined();

    // trashed_at をセットする UPDATE が routines に対して発行されること.
    const softDeleteCall = allCalls.find(
      ([sql]) =>
        typeof sql === "string" &&
        sql.toUpperCase().includes("UPDATE") &&
        sql.toLowerCase().includes("routines") &&
        sql.toLowerCase().includes("trashed_at"),
    );
    expect(softDeleteCall).toBeDefined();

    // 対象 id が WHERE 条件として渡されること.
    const [, values] = softDeleteCall as [string, unknown[]];
    expect(values).toContain("routine-1");
  });
});
