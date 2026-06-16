/**
 * LocalResetUsecase 単体テスト (BL-020 / AC-LOC-004 / AC-LOC-007)
 *
 * 受け入れ基準の出典: docs/developer/features/android-local-mode/spec.md
 *   - AC-LOC-004: ローカルモード時のリセット処理
 *   - AC-LOC-007: ゴミ箱清算
 *   - FR-LOC-007: リセット処理の内容
 *   - FR-LOC-008: リセット処理は冪等
 *   - FR-LOC-009: ゴミ箱清算処理
 *   - T-19: LocalResetUsecase の単体テスト
 *
 * NOTE: LocalResetUsecase はまだ存在しない. このテストは意図的に失敗する (red).
 *       implementer が実装することで green 化する.
 *
 * モック方針 (NFR-LOC-003):
 *   @capacitor-community/sqlite は jsdom 環境で動作しないため vi.mock でモックする.
 *
 * テスト前提:
 *   - dayBoundaryTime = '04:00', dayBoundaryTimezone = 'Asia/Tokyo'
 *   - now = 2026-06-08T10:00:00+09:00 (境界時刻 04:00 を超えているので前回境界時刻 = 2026-06-08T04:00:00+09:00)
 *   - 前回境界時刻の UTC 表現 = "2026-06-07T19:00:00.000Z"
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { LocalResetUsecase } from "./local-reset-usecase.js";

// ---------------------------------------------------------------------------
// @capacitor-community/sqlite モック
// ---------------------------------------------------------------------------

vi.mock("@capacitor-community/sqlite", () => ({
  CapacitorSQLite: {},
  SQLiteConnection: vi.fn(),
}));

// ---------------------------------------------------------------------------
// テスト用定数
// ---------------------------------------------------------------------------

// 境界時刻 04:00 Asia/Tokyo、現在時刻 2026-06-08T10:00:00+09:00
// → 前回の境界時刻 = 2026-06-08T04:00:00+09:00 = 2026-06-07T19:00:00.000Z
const NOW = new Date("2026-06-08T01:00:00.000Z"); // 10:00 JST
const BOUNDARY_UTC = "2026-06-07T19:00:00.000Z"; // 前回の境界時刻 UTC

// ---------------------------------------------------------------------------
// MockDBConnection
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;

function makeMockDb(initialData: { settings?: Row[]; tasks?: Row[]; counter?: Row[] } = {}) {
  const data = {
    settings: initialData.settings ?? [
      {
        id: "singleton",
        day_boundary_time: "04:00",
        day_boundary_timezone: "Asia/Tokyo",
        updated_at: "2026-06-08T00:00:00.000Z",
        version: 1,
      },
    ],
    tasks: initialData.tasks ?? [],
    counter: initialData.counter ?? [
      {
        id: "singleton",
        completed_count: 5,
        last_reset_executed_at: null, // 未実行
        updated_at: "2026-06-08T00:00:00.000Z",
        version: 1,
      },
    ],
  };

  const db = {
    query: vi.fn(async (sql: string, _values?: unknown[]) => {
      if (sql.includes("settings")) return { values: data.settings };
      if (sql.includes("counter")) return { values: data.counter };
      if (sql.includes("tasks")) return { values: data.tasks };
      return { values: [] };
    }),
    run: vi.fn(async (_sql: string, _values?: unknown[]) => ({
      changes: { changes: 1, lastId: 1 },
    })),
    execute: vi.fn(async () => ({ changes: { changes: 0 } })),
    beginTransaction: vi.fn(async () => {}),
    commitTransaction: vi.fn(async () => {}),
    rollbackTransaction: vi.fn(async () => {}),
  };

  return { db, data };
}

// ---------------------------------------------------------------------------
// テスト
// ---------------------------------------------------------------------------

describe("LocalResetUsecase.runIfNeeded() 冪等性 (AC-LOC-004 / FR-LOC-008)", () => {
  // spec.md §AC-LOC-004 / FR-LOC-008:
  // lastResetExecutedAt が最新境界時刻以降の場合はリセット処理を実行しない
  it("シナリオ: リセット済みの場合（lastResetExecutedAt >= 前回境界時刻）は何も実行しない（冪等性）", async () => {
    const { db } = makeMockDb({
      counter: [
        {
          id: "singleton",
          completed_count: 0,
          // 境界時刻より後に実行済み → リセット不要
          last_reset_executed_at: "2026-06-07T20:00:00.000Z", // BOUNDARY_UTC より後
          updated_at: "2026-06-08T00:00:00.000Z",
          version: 2,
        },
      ],
    });

    const usecase = new LocalResetUsecase(db as never);
    await usecase.runIfNeeded(NOW);

    // run が呼ばれない（何も更新しない）
    expect(db.run).not.toHaveBeenCalled();
    expect(db.beginTransaction).not.toHaveBeenCalled();
  });
});

describe("LocalResetUsecase.runIfNeeded() リセット処理 (AC-LOC-004 / FR-LOC-007)", () => {
  let db: ReturnType<typeof makeMockDb>["db"];
  let usecase: LocalResetUsecase;

  beforeEach(() => {
    const tasks: Row[] = [
      {
        id: "routine-today-1",
        name: "ルーティン今日タスク1",
        due_date: "today",
        trashed_at: null,
        trashed_reason: null,
        origin: "routine",
        priority: "normal",
        project_id: null,
        routine_id: "r-1",
        created_at: "2026-06-08T00:00:00.000Z",
        updated_at: "2026-06-08T00:00:00.000Z",
        version: 1,
      },
      {
        id: "manual-today-1",
        name: "手動今日タスク1",
        due_date: "today",
        trashed_at: null,
        trashed_reason: null,
        origin: "manual",
        priority: "normal",
        project_id: null,
        routine_id: null,
        created_at: "2026-06-08T00:00:00.000Z",
        updated_at: "2026-06-08T00:00:00.000Z",
        version: 1,
      },
      {
        id: "routine-tomorrow-1",
        name: "ルーティン明日タスク",
        due_date: "tomorrow",
        trashed_at: null,
        trashed_reason: null,
        origin: "routine",
        priority: "normal",
        project_id: null,
        routine_id: "r-2",
        created_at: "2026-06-08T00:00:00.000Z",
        updated_at: "2026-06-08T00:00:00.000Z",
        version: 1,
      },
    ];

    const mock = makeMockDb({
      tasks,
      counter: [
        {
          id: "singleton",
          completed_count: 5,
          last_reset_executed_at: "2026-06-07T18:00:00.000Z", // BOUNDARY_UTC より前 → リセット未実行
          updated_at: "2026-06-08T00:00:00.000Z",
          version: 1,
        },
      ],
    });
    db = mock.db;
    usecase = new LocalResetUsecase(db as never);
  });

  // spec.md §FR-LOC-007 ステップ1:
  // origin='routine' かつ dueDate='today' かつ trashedAt=null のタスクを
  // trashedAt=now, trashedReason='deleted' に更新する
  it("シナリオ: リセット未実行の場合、origin='routine' かつ dueDate='today' かつ trashedAt=null のタスクを trashedAt=now, trashedReason='deleted' に更新する", async () => {
    await usecase.runIfNeeded(NOW);

    // トランザクションが開始されること
    expect(db.beginTransaction).toHaveBeenCalled();
    expect(db.commitTransaction).toHaveBeenCalled();

    // 'deleted' を含む UPDATE が呼ばれること（ルーティンタスクをゴミ箱化）
    const runCalls = db.run.mock.calls as [string, unknown[]][];
    const deletedUpdate = runCalls.find(
      ([sql]) => typeof sql === "string" && sql.includes("deleted"),
    );
    expect(deletedUpdate).toBeDefined();
  });

  // spec.md §FR-LOC-007 ステップ2:
  // origin='manual' かつ dueDate='today' かつ trashedAt=null のタスクの
  // dueDate を 'tomorrow' に更新する
  it("シナリオ: リセット未実行の場合、origin='manual' かつ dueDate='today' かつ trashedAt=null のタスクの dueDate を 'tomorrow' に更新する", async () => {
    await usecase.runIfNeeded(NOW);

    // 'tomorrow' を含む UPDATE が呼ばれること
    const runCalls = db.run.mock.calls as [string, unknown[]][];
    const tomorrowUpdate = runCalls.find(([sql, values]) => {
      if (typeof sql !== "string") return false;
      if (sql.includes("tomorrow")) return true;
      if (Array.isArray(values) && values.includes("tomorrow")) return true;
      return false;
    });
    expect(tomorrowUpdate).toBeDefined();
  });

  // spec.md §FR-LOC-007 ステップ3:
  // Counter の completedCount を 0 にリセット、lastResetExecutedAt を境界時刻に更新
  it("シナリオ: リセット未実行の場合、Counter の completedCount を 0 にリセットし lastResetExecutedAt を境界時刻に更新する", async () => {
    await usecase.runIfNeeded(NOW);

    // Counter の UPDATE が呼ばれること（completedCount=0 または lastResetExecutedAt の更新）
    const runCalls = db.run.mock.calls as [string, unknown[]][];
    const counterUpdate = runCalls.find(([sql, values]) => {
      if (typeof sql !== "string") return false;
      if (sql.includes("counter")) return true;
      if (sql.includes("completed_count") || sql.includes("last_reset_executed_at")) return true;
      if (Array.isArray(values) && values.includes(0)) return true;
      return false;
    });
    expect(counterUpdate).toBeDefined();

    // lastResetExecutedAt に境界時刻が設定されること
    const boundaryUpdate = runCalls.find(([, values]) => {
      if (!Array.isArray(values)) return false;
      return values.some((v) => typeof v === "string" && v === BOUNDARY_UTC);
    });
    expect(boundaryUpdate).toBeDefined();
  });
});

describe("LocalResetUsecase.runIfNeeded() ゴミ箱清算 (AC-LOC-007 / FR-LOC-009)", () => {
  // spec.md §AC-LOC-007:
  // trashedAt < 前回境界時刻 のタスクを物理削除する
  it("シナリオ: ゴミ箱清算: trashedAt < 前回境界時刻 のタスクを物理削除する", async () => {
    const { db } = makeMockDb({
      tasks: [
        {
          id: "old-trash",
          name: "古いゴミ箱タスク",
          due_date: "today",
          trashed_at: "2026-06-07T10:00:00.000Z", // BOUNDARY_UTC より前
          trashed_reason: "deleted",
          origin: "manual",
          priority: "normal",
          project_id: null,
          routine_id: null,
          created_at: "2026-06-07T00:00:00.000Z",
          updated_at: "2026-06-07T10:00:00.000Z",
          version: 2,
        },
      ],
      counter: [
        {
          id: "singleton",
          completed_count: 0,
          last_reset_executed_at: "2026-06-06T19:00:00.000Z", // リセット未実行
          updated_at: "2026-06-08T00:00:00.000Z",
          version: 1,
        },
      ],
    });

    const usecase = new LocalResetUsecase(db as never);
    await usecase.runIfNeeded(NOW);

    // DELETE 文が呼ばれること（物理削除）
    const allCalls = [
      ...(db.run.mock.calls as [string, unknown[]][]),
      ...(db.execute.mock.calls as unknown as [string][]),
    ];
    const deleteCall = allCalls.find(
      ([sql]) => typeof sql === "string" && sql.toUpperCase().includes("DELETE"),
    );
    expect(deleteCall).toBeDefined();
  });

  // spec.md §AC-LOC-007:
  // trashedAt >= 前回境界時刻 のタスクは物理削除されない
  it("シナリオ: ゴミ箱清算: trashedAt >= 前回境界時刻 のタスクは削除しない", async () => {
    const { db } = makeMockDb({
      tasks: [
        {
          id: "new-trash",
          name: "新しいゴミ箱タスク",
          due_date: "today",
          trashed_at: "2026-06-07T20:00:00.000Z", // BOUNDARY_UTC より後
          trashed_reason: "deleted",
          origin: "manual",
          priority: "normal",
          project_id: null,
          routine_id: null,
          created_at: "2026-06-07T00:00:00.000Z",
          updated_at: "2026-06-07T20:00:00.000Z",
          version: 2,
        },
      ],
      counter: [
        {
          id: "singleton",
          completed_count: 0,
          last_reset_executed_at: "2026-06-06T19:00:00.000Z", // リセット未実行
          updated_at: "2026-06-08T00:00:00.000Z",
          version: 1,
        },
      ],
    });

    const usecase = new LocalResetUsecase(db as never);
    await usecase.runIfNeeded(NOW);

    // DELETE の run/execute 呼び出しに新しいタスクの id が含まれないこと
    const allCalls = [
      ...(db.run.mock.calls as [string, unknown[]][]),
      ...(db.execute.mock.calls as unknown as [string][]),
    ];
    const deleteWithNewId = allCalls.find(([sql, values]) => {
      const inSql = typeof sql === "string" && sql.includes("new-trash");
      const inValues = Array.isArray(values) && values.includes("new-trash");
      return inSql || inValues;
    });
    expect(deleteWithNewId).toBeUndefined();
  });
});
