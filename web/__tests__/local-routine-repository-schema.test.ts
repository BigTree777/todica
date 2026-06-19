/**
 * LocalRoutineRepository スキーマ整合テスト (BL-122)
 *
 * 目的:
 *   LocalRoutineRepository が発行する INSERT / UPDATE の列名が, ローカル DB の
 *   実マイグレーション (local-migrations) で定義された routines テーブルの列集合に
 *   収まっていることを保証する.
 *
 * 背景:
 *   既存の local-routine-repository.test.ts はモック DB が SQL を解釈せず行をそのまま
 *   echo するため, リポジトリが存在しない列 (generate_on_weekdays / last_generated_for_date)
 *   へ書き込んでも検出できなかった (偽 green). 本テストはマイグレーション SQL から
 *   実際の列集合を抽出し, リポジトリの参照列がその部分集合であることを assert する.
 *
 * モック方針:
 *   @capacitor-community/sqlite は jsdom で動かないため vi.mock する (既存テスト踏襲).
 */

import { describe, expect, it, vi } from "vitest";
import { migrations } from "../src/repositories/local-migrations/index.js";
import { LocalRoutineRepository } from "../src/repositories/local-routine-repository.js";

vi.mock("@capacitor-community/sqlite", () => ({
  CapacitorSQLite: {},
  SQLiteConnection: vi.fn(),
}));

type Row = Record<string, unknown>;

/** CREATE TABLE の列定義部から列名一覧を抽出する (テーブルレベル制約行は除外). */
function parseCreateTableColumns(sql: string): string[] {
  const inner = sql.slice(sql.indexOf("(") + 1, sql.lastIndexOf(")"));
  return inner
    .split(",")
    .map((entry) => entry.trim().split(/\s+/)[0] ?? "")
    .filter(
      (name) => name.length > 0 && !/^(PRIMARY|FOREIGN|UNIQUE|CHECK|CONSTRAINT)$/i.test(name),
    );
}

/** 実マイグレーションを流して routines テーブルの実列集合を組み立てる. */
async function buildRoutinesColumnSet(): Promise<Set<string>> {
  const executeSql: string[] = [];
  const recorder = {
    query: vi.fn(async (sql: string) => {
      if (/pragma\s+table_info/i.test(sql)) return { values: [] as Row[] };
      if (/max\s*\(\s*version\s*\)/i.test(sql)) return { values: [{ version: 0 }] };
      return { values: [] as Row[] };
    }),
    run: vi.fn(async () => ({ changes: { changes: 1, lastId: 1 } })),
    execute: vi.fn(async (sql: string) => {
      executeSql.push(sql);
      return { changes: { changes: 0 } };
    }),
    beginTransaction: vi.fn(async () => {}),
    commitTransaction: vi.fn(async () => {}),
    rollbackTransaction: vi.fn(async () => {}),
  };

  // runMigrations を経由せず up() を昇順に直接適用する (routines の CREATE / ALTER を捕捉).
  for (const m of migrations) await m.up(recorder as never);

  const columns = new Set<string>();
  for (const sql of executeSql) {
    if (/create\s+table\s+(?:if\s+not\s+exists\s+)?routines\s*\(/i.test(sql)) {
      for (const c of parseCreateTableColumns(sql)) columns.add(c);
    }
    const alter = sql.match(/alter\s+table\s+routines\s+add\s+column\s+(\w+)/i);
    if (alter?.[1]) columns.add(alter[1]);
  }
  return columns;
}

/** INSERT INTO routines (...) の列名一覧を返す. */
function parseInsertColumns(sql: string): string[] {
  const m = sql.match(/insert(?:\s+or\s+\w+)?\s+into\s+routines\s*\(([^)]*)\)/i);
  return (m?.[1] ?? "")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
}

/** UPDATE routines SET ... の代入対象列名一覧を返す. */
function parseUpdateSetColumns(sql: string): string[] {
  const m = sql.match(/update\s+routines\s+set\s+(.*?)\s+where/i);
  return (m?.[1] ?? "")
    .split(",")
    .map((c) => c.trim().split(/\s*=/)[0]?.trim() ?? "")
    .filter(Boolean);
}

function makeCapturingDb(existingRow: Row) {
  const runSql: string[] = [];
  return {
    runSql,
    db: {
      query: vi.fn(async () => ({ values: [existingRow] })),
      run: vi.fn(async (sql: string) => {
        runSql.push(sql);
        return { changes: { changes: 1, lastId: 1 } };
      }),
      execute: vi.fn(async () => ({ changes: { changes: 0 } })),
      beginTransaction: vi.fn(async () => {}),
      commitTransaction: vi.fn(async () => {}),
      rollbackTransaction: vi.fn(async () => {}),
    },
  };
}

const existingRow: Row = {
  id: "routine-1",
  name: "朝のルーティン",
  days_of_week: JSON.stringify([1, 2, 3, 4, 5]),
  default_priority: "normal",
  created_at: "2026-06-08T00:00:00.000Z",
  updated_at: "2026-06-08T00:00:00.000Z",
  trashed_at: null,
  version: 1,
};

describe("LocalRoutineRepository が参照する列はマイグレーション定義に存在する (BL-122)", () => {
  it("routines DDL 列集合に days_of_week が含まれ generate_on_weekdays / last_generated_for_date は含まれない", async () => {
    const columns = await buildRoutinesColumnSet();
    expect(columns.has("days_of_week")).toBe(true);
    expect(columns.has("generate_on_weekdays")).toBe(false);
    expect(columns.has("last_generated_for_date")).toBe(false);
  });

  it("create() の INSERT 列がすべて routines DDL 列集合の部分集合である", async () => {
    const ddl = await buildRoutinesColumnSet();
    const { db, runSql } = makeCapturingDb(existingRow);
    const repo = new LocalRoutineRepository(db as never);

    await repo.create({
      id: "routine-2",
      name: "夕方ルーティン",
      daysOfWeek: [1, 3, 5],
      defaultPriority: "normal",
    });

    const insertSql = runSql.find((s) => /insert\s+(?:or\s+\w+\s+)?into\s+routines/i.test(s));
    expect(insertSql).toBeDefined();
    const insertCols = parseInsertColumns(insertSql ?? "");
    expect(insertCols.length).toBeGreaterThan(0);
    const unknown = insertCols.filter((c) => !ddl.has(c));
    expect(unknown).toEqual([]);
  });

  it("update() の UPDATE 代入列がすべて routines DDL 列集合の部分集合である", async () => {
    const ddl = await buildRoutinesColumnSet();
    const { db, runSql } = makeCapturingDb(existingRow);
    const repo = new LocalRoutineRepository(db as never);

    await repo.update({ id: "routine-1", name: "改名", daysOfWeek: [2, 4], ifMatch: 1 });

    const updateSql = runSql.find(
      (s) => /update\s+routines\s+set/i.test(s) && /days_of_week|generate_on_weekdays/i.test(s),
    );
    expect(updateSql).toBeDefined();
    const setCols = parseUpdateSetColumns(updateSql ?? "");
    const unknown = setCols.filter((c) => !ddl.has(c));
    expect(unknown).toEqual([]);
  });
});
