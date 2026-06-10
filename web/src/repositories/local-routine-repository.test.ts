/**
 * LocalRoutineRepository 単体テスト (BL-020 / FR-LOC-002)
 *
 * 受け入れ基準の出典: docs/developer/features/android-local-mode/spec.md
 *   - FR-LOC-002: LocalRoutineRepository は WebRoutineRepository インターフェースを満たす
 *   - T-16: LocalRoutineRepository の単体テスト
 *
 * NOTE: LocalRoutineRepository はまだ存在しない. このテストは意図的に失敗する (red).
 *       implementer が実装することで green 化する.
 *
 * モック方針 (NFR-LOC-003):
 *   @capacitor-community/sqlite は jsdom 環境で動作しないため vi.mock でモックする.
 *
 * 特記事項:
 *   generateOnWeekdays（daysOfWeek）は SQLite に JSON 文字列として保存し、
 *   読み出し時に JSON.parse して配列として返す（plan.md §D-001）.
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
  // plan.md §D-001 / T-05: generateOnWeekdays は JSON パースされた配列で返す
  it("シナリオ: list() が Routine 一覧を返す（generateOnWeekdays は JSON パースされた配列で返す）", async () => {
    const db = makeMockDb([
      {
        id: "routine-1",
        name: "朝のルーティン",
        generate_on_weekdays: JSON.stringify([1, 2, 3, 4, 5]), // JSON 文字列として保存
        default_priority: "normal",
        last_generated_for_date: null,
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

    // generateOnWeekdays（daysOfWeek）が JSON パース済みの配列として返る
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
});

describe("LocalRoutineRepository.create() (FR-LOC-002 / T-16)", () => {
  let db: ReturnType<typeof makeMockDb>;
  let repo: LocalRoutineRepository;

  beforeEach(() => {
    db = makeMockDb([]);
    repo = new LocalRoutineRepository(db as never);
  });

  // plan.md §T-05: create(name, generateOnWeekdays) でルーティンが INSERT される
  // generateOnWeekdays は JSON.stringify してから保存
  it("シナリオ: create(name, generateOnWeekdays) でルーティンが INSERT される（generateOnWeekdays は JSON.stringify してから保存）", async () => {
    const newId = crypto.randomUUID();
    db.run.mockResolvedValueOnce({ changes: { changes: 1, lastId: 1 } });
    db.query.mockResolvedValueOnce({
      values: [
        {
          id: newId,
          name: "夕方ルーティン",
          generate_on_weekdays: JSON.stringify([1, 3, 5]),
          default_priority: "normal",
          last_generated_for_date: null,
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

describe("LocalRoutineRepository.delete() (FR-LOC-002 / T-16)", () => {
  let db: ReturnType<typeof makeMockDb>;
  let repo: LocalRoutineRepository;

  beforeEach(() => {
    db = makeMockDb([
      {
        id: "routine-1",
        name: "朝のルーティン",
        generate_on_weekdays: JSON.stringify([1, 2, 3, 4, 5]),
        default_priority: "normal",
        last_generated_for_date: null,
        created_at: "2026-06-08T00:00:00.000Z",
        updated_at: "2026-06-08T00:00:00.000Z",
        trashed_at: null,
        version: 1,
      },
    ]);
    repo = new LocalRoutineRepository(db as never);
  });

  // plan.md §T-05: delete(id, ifMatch) でルーティンが物理削除される
  it("シナリオ: delete(id, ifMatch) でルーティンが物理削除される", async () => {
    db.query.mockResolvedValueOnce({
      values: [
        {
          id: "routine-1",
          name: "朝のルーティン",
          generate_on_weekdays: JSON.stringify([1, 2, 3, 4, 5]),
          default_priority: "normal",
          last_generated_for_date: null,
          created_at: "2026-06-08T00:00:00.000Z",
          updated_at: "2026-06-08T00:00:00.000Z",
          trashed_at: null,
          version: 1,
        },
      ],
    });

    await repo.delete({ id: "routine-1", ifMatch: 1 });

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
