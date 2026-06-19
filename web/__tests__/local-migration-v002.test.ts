/**
 * Android ローカル DB v002 マイグレーション 単体テスト (BL-120 / routine-soft-delete)
 *
 * 受け入れ基準の出典: docs/developer/features/routine-soft-delete/spec.md AC-14.
 *   Given trashed_at カラムを持たない local routines テーブルを持つ DB
 *   When  runMigrations を実行する
 *   Then  v002 が適用され routines テーブルに trashed_at カラムが追加される
 *   And   __local_migrations に version=2 が記録される
 *   And   既存 routine レコードの trashed_at は NULL である
 *   And   既に trashed_at を持つ DB に v002 を再適用しても破壊されない (冪等 / FR-MIG-009)
 *
 * NOTE: v002RoutinesTrashedAt はまだ存在しない. 本テストは意図的に失敗する (red).
 *       implementer が web/src/repositories/local-migrations/v002-routines-trashed-at.ts を
 *       追加し migrations 配列へ登録することで green 化する.
 *
 * 設計方針 (spec.md R-3 / 本ファイル冒頭の注意):
 *   - v002 は trashed_at 列の追加に焦点を絞る. v001 DDL の列名不整合
 *     (generate_on_weekdays / last_generated_for_date) に巻き込まれないよう,
 *     seed の routines 行は trashed_at 追加の検証に必要な最小列のみを持たせる.
 *   - up() の冪等性 (PRAGMA で列存在を確認 / ADD COLUMN 重複エラー握り潰し のいずれか) は
 *     実装者の選択に委ねる. 本テストは「再適用しても列が 1 つだけで例外で破壊されない」
 *     という観測可能な結果で冪等性を固定する.
 *
 * モック方針 (NFR-MIG-001 / NFR-MIG-003):
 *   既存 local-* リポジトリテストと同じく @capacitor-community/sqlite を vi.mock する.
 *   ALTER TABLE ADD COLUMN / PRAGMA table_info を解釈する最小 SQL インタプリタ付きモックを
 *   用意し, routines テーブルの列集合と __local_migrations の記録を観測する.
 */

import { describe, expect, it, vi } from "vitest";
import type { LocalDb } from "../src/repositories/local-db.js";
import { migrations, runMigrations } from "../src/repositories/local-migrations/index.js";

vi.mock("@capacitor-community/sqlite", () => ({
  CapacitorSQLite: {},
  SQLiteConnection: vi.fn(),
}));

type Row = Record<string, unknown>;

/**
 * ALTER TABLE ADD COLUMN / PRAGMA table_info / __local_migrations を解釈する最小モック DB.
 *
 * - `__columns` はテーブル名 → 列名集合. 既存ユーザの routines を表現するため seed できる.
 * - `execute` / `run` が `ALTER TABLE <name> ADD COLUMN <col> ...` を解釈し列を追加する.
 *   既に存在する列の ADD COLUMN は SQLite 同様に例外を投げる (冪等性を実装側で担保させる).
 * - `query` が `PRAGMA table_info(<name>)` を解釈し列一覧を返す.
 * - `INSERT INTO __local_migrations` / `SELECT MAX(version)` も解釈する (BL-117 踏襲).
 */
interface MockDb extends LocalDb {
  __columns: Record<string, Set<string>>;
  __store: Record<string, Row[]>;
}

function makeMockDb(
  seedColumns: Record<string, string[]> = {},
  seedRows: Record<string, Row[]> = {},
): MockDb {
  const columns: Record<string, Set<string>> = {};
  for (const [name, cols] of Object.entries(seedColumns)) {
    columns[name] = new Set(cols);
  }
  const store: Record<string, Row[]> = {};
  for (const [name, rows] of Object.entries(seedRows)) {
    store[name] = rows.map((r) => ({ ...r }));
  }

  const ensureTable = (name: string) => {
    if (!columns[name]) columns[name] = new Set();
    if (!store[name]) store[name] = [];
  };

  /** CREATE TABLE / ALTER TABLE ADD COLUMN を解釈する共通処理. */
  const applyDdl = (sql: string): void => {
    const create = sql.match(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+(\w+)\s*\(([\s\S]*)\)/i);
    if (create) {
      const name = create[1] as string;
      ensureTable(name);
      const body = create[2] ?? "";
      for (const line of body.split(",")) {
        const colMatch = line.trim().match(/^(\w+)\s+/);
        const col = colMatch?.[1];
        if (col && !/^(PRIMARY|FOREIGN|UNIQUE|CHECK|CONSTRAINT)$/i.test(col)) {
          columns[name]?.add(col);
        }
      }
      return;
    }
    const alter = sql.match(/ALTER\s+TABLE\s+(\w+)\s+ADD\s+COLUMN\s+(\w+)/i);
    if (alter) {
      const name = alter[1] as string;
      const col = alter[2] as string;
      ensureTable(name);
      const set = columns[name] as Set<string>;
      if (set.has(col)) {
        // SQLite は重複列の ADD COLUMN で "duplicate column name" を投げる.
        // 実装側が PRAGMA チェック or エラー握り潰しで冪等にすることを要求する.
        throw new Error(`duplicate column name: ${col}`);
      }
      set.add(col);
    }
  };

  const db: MockDb = {
    __columns: columns,
    __store: store,

    execute: vi.fn(async (sql: string) => {
      applyDdl(sql);
      return { changes: { changes: 0 } };
    }),

    run: vi.fn(async (sql: string, values: unknown[] = []) => {
      // ALTER TABLE は run 経由でも来うる.
      if (/ALTER\s+TABLE/i.test(sql) || /CREATE\s+TABLE/i.test(sql)) {
        applyDdl(sql);
        return { changes: { changes: 0, lastId: 0 } };
      }
      const ins = sql.match(/INSERT(?:\s+OR\s+\w+)?\s+INTO\s+(\w+)\s*\(([^)]*)\)/i);
      if (ins) {
        const name = ins[1] as string;
        ensureTable(name);
        const cols = (ins[2] ?? "").split(",").map((c) => c.trim());
        const row: Row = {};
        cols.forEach((c, i) => {
          row[c] = values[i];
        });
        (store[name] as Row[]).push(row);
        return { changes: { changes: 1, lastId: (store[name] as Row[]).length } };
      }
      // UPDATE routines SET trashed_at = NULL ... 等は列集合へ影響しない.
      return { changes: { changes: 0, lastId: 0 } };
    }),

    query: vi.fn(async (sql: string, _values?: unknown[]) => {
      const pragma = sql.match(/PRAGMA\s+table_info\s*\(\s*(\w+)\s*\)/i);
      if (pragma) {
        const name = pragma[1] as string;
        const cols = columns[name] ?? new Set<string>();
        return { values: Array.from(cols).map((name) => ({ name })) };
      }
      const max = sql.match(/MAX\s*\(\s*(\w+)\s*\)(?:\s+AS\s+(\w+))?/i);
      if (max) {
        const col = max[1] as string;
        const alias = max[2] ?? `MAX(${col})`;
        const rows = store.__local_migrations ?? [];
        const value = rows.reduce<number | null>((acc, r) => {
          const v = r[col];
          if (typeof v === "number") return acc === null ? v : Math.max(acc, v);
          return acc;
        }, null);
        return { values: [{ [alias]: value }] };
      }
      const from = sql.match(/FROM\s+(\w+)/i);
      const name = from?.[1] ?? "";
      return { values: (store[name] ?? []).map((r) => ({ ...r })) };
    }),

    beginTransaction: vi.fn(async () => {}),
    commitTransaction: vi.fn(async () => {}),
    rollbackTransaction: vi.fn(async () => {}),
    isTransactionActive: vi.fn(async () => ({ result: false })),
    isDBOpen: vi.fn(async () => ({ result: true })),
  };

  return db;
}

function recordedVersions(db: MockDb): number[] {
  const rows = db.__store.__local_migrations ?? [];
  return rows
    .map((r) => r.version)
    .filter((v): v is number => typeof v === "number")
    .sort((a, b) => a - b);
}

/** v001 適用済みだが routines に trashed_at が無い既存端末の列集合 (v001-initial.ts §routines に一致). */
const V001_ROUTINES_COLUMNS = [
  "id",
  "name",
  "days_of_week",
  "default_priority",
  "version",
  "created_at",
  "updated_at",
];

describe("v002 routines.trashed_at マイグレーション (AC-14)", () => {
  it("本番 migrations 配列に version=2 (v002) が登録されている", () => {
    const versions = migrations.map((m) => m.version);
    expect(versions).toContain(2);
  });

  it("v001 済み (trashed_at 無し) の DB に runMigrations すると routines に trashed_at が追加される", async () => {
    // Given: v001 適用済み (routines に trashed_at が無い) 既存端末.
    const db = makeMockDb(
      { routines: V001_ROUTINES_COLUMNS },
      {
        __local_migrations: [
          { version: 1, applied_at: "2026-05-01T00:00:00.000Z", name: "v001-initial" },
        ],
        routines: [
          {
            id: "existing-routine",
            name: "既存ルーティン",
            days_of_week: "[1]",
            default_priority: "normal",
            version: 1,
            created_at: "2026-05-01T00:00:00.000Z",
            updated_at: "2026-05-01T00:00:00.000Z",
          },
        ],
      },
    );

    // When: 本番 migrations を実行する (v002 が差分適用される).
    await runMigrations(db, migrations);

    // Then: routines に trashed_at 列が追加される.
    expect(db.__columns.routines?.has("trashed_at")).toBe(true);
    // version=2 が記録される.
    expect(recordedVersions(db)).toContain(2);
    // 既存 routine レコードは失われない.
    const rows = db.__store.routines ?? [];
    expect(rows.some((r) => r.id === "existing-routine")).toBe(true);
  });

  it("既に trashed_at を持つ DB に v002 を再適用しても破壊されない (冪等 / FR-MIG-009)", async () => {
    // Given: v002 まで適用済み (routines に trashed_at が既にある) 端末.
    const db = makeMockDb(
      { routines: [...V001_ROUTINES_COLUMNS, "trashed_at"] },
      {
        __local_migrations: [
          { version: 1, applied_at: "2026-05-01T00:00:00.000Z", name: "v001-initial" },
        ],
      },
    );

    // When: v002 の up() を直接冪等適用する (current=1 とみなし v002 のみ流れる).
    //       trashed_at が既に存在しても例外で落ちず, 列は 1 つのまま.
    await expect(runMigrations(db, migrations)).resolves.toBeUndefined();

    // Then: trashed_at は依然として存在し, version=2 が記録される.
    expect(db.__columns.routines?.has("trashed_at")).toBe(true);
    expect(recordedVersions(db)).toContain(2);
  });
});
