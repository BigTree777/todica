/**
 * Android ローカル DB マイグレーション版管理機構 単体テスト (BL-117)
 *
 * 受け入れ基準の出典:
 *   docs/developer/features/android-local-migration-versioning/spec.md
 *   - AC-MIG-001: 新規ユーザの初回起動で v001 が適用される
 *   - AC-MIG-002: 既存 v0 ユーザ (__local_migrations 不在 + 旧スキーマ済み) が整合する
 *   - AC-MIG-003: 適用済み端末の再起動で up() が再実行されない
 *   - AC-MIG-004: v002 を追加して起動すると v001→v002 が昇順で流れる
 *   - AC-MIG-005: 複数バージョン未適用を 1 回の起動で昇順に連続適用する
 *   - AC-MIG-006: down/rollback の経路を持たない
 *   - AC-MIG-007: あるバージョンの up() が失敗したらそのバージョンは未記録のまま残る
 *
 * NOTE: runMigrations / LocalMigration / migrations / v001-initial はまだ存在しない.
 *       このテストは意図的に失敗する (red). implementer が実装することで green 化する.
 *
 * モック方針 (NFR-MIG-001 / NFR-MIG-003):
 *   既存 local-* リポジトリテストと同じく @capacitor-community/sqlite を vi.mock する.
 *   runner は LocalDb インターフェースのみに依存するため (NFR-MIG-003),
 *   テストはモック LocalDb を直接 runMigrations に渡し,
 *   __local_migrations の状態 / up() の呼び出し順 / 既存データ保持を検証する.
 *   既存 local-* テストの makeMockDb は run/execute がストアを変更しないため,
 *   本機構の検証には不足する. ここでは migration runner が発行する SQL
 *   (CREATE TABLE IF NOT EXISTS / INSERT (OR IGNORE) / SELECT MAX(version)) を
 *   解釈できる最小 SQL インタプリタ付きモックへ拡張する (拡張もテスト成果物).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LocalDb } from "../src/repositories/local-db.js";
// runner / 登録一覧 / マイグレーション定義型 (まだ未実装)
import {
  type LocalMigration,
  migrations,
  runMigrations,
} from "../src/repositories/local-migrations/index.js";

// ---------------------------------------------------------------------------
// @capacitor-community/sqlite モック (既存 local-* テスト踏襲)
// ---------------------------------------------------------------------------

vi.mock("@capacitor-community/sqlite", () => ({
  CapacitorSQLite: {},
  SQLiteConnection: vi.fn(),
}));

// ---------------------------------------------------------------------------
// SQL インタプリタ付きモック DB
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;

interface MockDb {
  /** テーブル名 → 行配列 のインメモリストア. */
  __store: Record<string, Row[]>;
  /** CREATE TABLE IF NOT EXISTS で「存在する」と確定したテーブル名集合. */
  __createdTables: Set<string>;
  query: ReturnType<typeof vi.fn>;
  run: ReturnType<typeof vi.fn>;
  execute: ReturnType<typeof vi.fn>;
  beginTransaction: ReturnType<typeof vi.fn>;
  commitTransaction: ReturnType<typeof vi.fn>;
  rollbackTransaction: ReturnType<typeof vi.fn>;
  isTransactionActive: ReturnType<typeof vi.fn>;
  isDBOpen: ReturnType<typeof vi.fn>;
}

/** MockDb を LocalDb として runMigrations へ渡す (既存 local-* テストの `as never` 踏襲). */
function asLocalDb(db: MockDb): LocalDb {
  return db as never;
}

/**
 * migration runner が発行する SQL を解釈する最小モック.
 *
 * - `seedTables` は v0 既存ユーザ検証用に, 旧スキーマで作られたテーブル + データを
 *   事前投入する (AC-MIG-002). seed されたテーブルは「存在する」とみなす.
 * - `execute` は `CREATE TABLE IF NOT EXISTS <name>` を解釈し, テーブル存在を記録する.
 * - `run` は `INSERT [OR IGNORE] INTO <name> (...) VALUES (...)` を解釈し,
 *   値プレースホルダを順に対応列へ割り当てて行を追加する.
 *   OR IGNORE は PRIMARY KEY (id / version) 重複時に挿入をスキップする.
 * - `query` は `SELECT MAX(version) FROM __local_migrations` および
 *   汎用 `SELECT ... FROM <name>` を解釈して行を返す.
 */
function makeMockDb(seedTables: Record<string, Row[]> = {}): MockDb {
  const store: Record<string, Row[]> = {};
  const createdTables = new Set<string>();
  for (const [name, rows] of Object.entries(seedTables)) {
    store[name] = rows.map((r) => ({ ...r }));
    createdTables.add(name);
  }

  const ensureTable = (name: string): Row[] => {
    const existing = store[name];
    if (existing) return existing;
    const created: Row[] = [];
    store[name] = created;
    return created;
  };

  /** INSERT 文の列名一覧を抽出する. */
  const parseColumns = (sql: string): string[] => {
    const m = sql.match(/INSERT(?:\s+OR\s+\w+)?\s+INTO\s+\w+\s*\(([^)]*)\)/i);
    const body = m?.[1];
    if (!body) return [];
    return body.split(",").map((c) => c.trim());
  };

  /** VALUES(...) の各トークンを返す. `?` はプレースホルダ, それ以外はリテラル. */
  const parseValueTokens = (sql: string): string[] => {
    const m = sql.match(/VALUES\s*\(([^)]*)\)/i);
    const body = m?.[1];
    if (!body) return [];
    return body.split(",").map((c) => c.trim());
  };

  /** リテラルトークンを JS 値へ変換する. */
  const literal = (token: string): unknown => {
    if (/^null$/i.test(token)) return null;
    if (/^'.*'$/.test(token)) return token.slice(1, -1);
    if (/^-?\d+$/.test(token)) return Number(token);
    return token;
  };

  const db: MockDb = {
    __store: store,
    __createdTables: createdTables,

    execute: vi.fn(async (sql: string) => {
      const m = sql.match(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+(\w+)/i);
      const name = m?.[1];
      if (name) {
        createdTables.add(name);
        ensureTable(name);
      }
      return { changes: { changes: 0 } };
    }),

    run: vi.fn(async (sql: string, values: unknown[] = []) => {
      const tableMatch = sql.match(/INSERT(?:\s+OR\s+\w+)?\s+INTO\s+(\w+)/i);
      const table = tableMatch?.[1];
      if (!table) return { changes: { changes: 0, lastId: 0 } };
      const rows = ensureTable(table);

      const cols = parseColumns(sql);
      const tokens = parseValueTokens(sql);
      const row: Row = {};
      let placeholderIdx = 0;
      cols.forEach((col, i) => {
        const token = tokens[i];
        if (token === "?") {
          row[col] = values[placeholderIdx++];
        } else if (token !== undefined) {
          row[col] = literal(token);
        }
      });

      const isIgnore = /INSERT\s+OR\s+IGNORE/i.test(sql);
      if (isIgnore) {
        // PRIMARY KEY 相当 (id または version) の重複は挿入しない.
        const dupBy = (key: string) =>
          row[key] !== undefined && rows.some((r) => r[key] === row[key]);
        if (dupBy("id") || dupBy("version")) {
          return { changes: { changes: 0, lastId: 0 } };
        }
      }

      rows.push(row);
      return { changes: { changes: 1, lastId: rows.length } };
    }),

    query: vi.fn(async (sql: string, _values?: unknown[]) => {
      const fromMatch = sql.match(/FROM\s+(\w+)/i);
      const table = fromMatch?.[1] ?? "";
      const rows = store[table] ?? [];

      // SELECT MAX(version) [AS alias] FROM __local_migrations
      const maxMatch = sql.match(/MAX\s*\(\s*(\w+)\s*\)(?:\s+AS\s+(\w+))?/i);
      const col = maxMatch?.[1];
      if (col) {
        const alias = maxMatch?.[2] ?? `MAX(${col})`;
        if (rows.length === 0) {
          // SQLite は集約のみの SELECT で 1 行 (値は NULL) を返す.
          return { values: [{ [alias]: null }] };
        }
        const max = rows.reduce<number | null>((acc, r) => {
          const v = r[col];
          if (typeof v === "number") return acc === null ? v : Math.max(acc, v);
          return acc;
        }, null);
        return { values: [{ [alias]: max }] };
      }

      return { values: rows.map((r) => ({ ...r })) };
    }),

    beginTransaction: vi.fn(async () => {}),
    commitTransaction: vi.fn(async () => {}),
    rollbackTransaction: vi.fn(async () => {}),
    isTransactionActive: vi.fn(async () => ({ result: false })),
    isDBOpen: vi.fn(async () => ({ result: true })),
  };

  return db;
}

/** __local_migrations に記録された version 一覧を昇順で返す. */
function recordedVersions(db: MockDb): number[] {
  const rows = db.__store.__local_migrations ?? [];
  return rows
    .map((r) => r.version)
    .filter((v): v is number => typeof v === "number")
    .sort((a, b) => a - b);
}

/** テスト注入用のダミーマイグレーション定義を作る. */
function makeMigration(version: number, up: (db: LocalDb) => Promise<void>): LocalMigration {
  return {
    version,
    name: `v${String(version).padStart(3, "0")}-test`,
    up,
  };
}

// 旧スキーマ (v001 相当) のテーブルを seed として表現するためのヘルパ.
// AC-MIG-002 / 003 で「既に存在する」状態を再現する.
function seedV001Schema(extra: Record<string, Row[]> = {}): Record<string, Row[]> {
  return {
    tasks: [],
    projects: [],
    routines: [],
    counter: [
      { id: "singleton", completed_count: 0, updated_at: "2026-01-01T00:00:00.000Z", version: 1 },
    ],
    settings: [
      {
        id: "singleton",
        day_boundary_time: "04:00",
        day_boundary_timezone: "Asia/Tokyo",
        updated_at: "2026-01-01T00:00:00.000Z",
        version: 1,
      },
    ],
    focus_selection: [
      {
        id: "singleton",
        current_task_id: null,
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
        version: 1,
      },
    ],
    ...extra,
  };
}

const APP_TABLES = [
  "tasks",
  "projects",
  "routines",
  "counter",
  "settings",
  "focus_selection",
] as const;
const SINGLETON_TABLES = ["counter", "settings", "focus_selection"] as const;

// ---------------------------------------------------------------------------
// AC-MIG-001: 新規ユーザの初回起動で v001 が適用される
// ---------------------------------------------------------------------------

describe("runMigrations 新規ユーザ初回起動 (AC-MIG-001)", () => {
  let db: MockDb;

  beforeEach(async () => {
    // Given: __local_migrations もアプリのテーブルも存在しない空の DB
    db = makeMockDb();
    // When: migration runner を実行する (本番登録一覧 = v001 を含む)
    await runMigrations(asLocalDb(db), migrations);
  });

  it("__local_migrations に version=1 が記録される", () => {
    expect(recordedVersions(db)).toContain(1);
  });

  it("6 つのアプリテーブルが存在する", () => {
    for (const t of APP_TABLES) {
      expect(db.__createdTables.has(t)).toBe(true);
    }
  });

  it("counter / settings / focus_selection に singleton レコードが 1 件ずつ存在する", () => {
    for (const t of SINGLETON_TABLES) {
      const rows = db.__store[t] ?? [];
      const singletons = rows.filter((r) => r.id === "singleton");
      expect(singletons).toHaveLength(1);
    }
  });
});

// ---------------------------------------------------------------------------
// AC-MIG-002: 既存 v0 ユーザ (__local_migrations 不在 + 旧スキーマ済み) が整合する
// ---------------------------------------------------------------------------

describe("runMigrations 既存 v0 ユーザの整合 (AC-MIG-002)", () => {
  let db: MockDb;

  beforeEach(async () => {
    // Given: __local_migrations は無いが旧スキーマ済みで, tasks 等にユーザデータが入っている DB
    db = makeMockDb(
      seedV001Schema({
        tasks: [
          {
            id: "user-task-1",
            name: "既存ユーザのタスク",
            due_date: "today",
            priority: "normal",
            origin: "manual",
            created_at: "2026-05-01T00:00:00.000Z",
            updated_at: "2026-05-01T00:00:00.000Z",
            version: 1,
          },
        ],
        projects: [
          {
            id: "user-project-1",
            name: "既存ユーザのプロジェクト",
            created_at: "2026-05-01T00:00:00.000Z",
            updated_at: "2026-05-01T00:00:00.000Z",
            version: 1,
          },
        ],
      }),
    );
    // When: migration runner を実行する (current=0 とみなし v001 が冪等再適用される)
    await runMigrations(asLocalDb(db), migrations);
  });

  it("既存のユーザデータ (tasks) が失われない", () => {
    const tasks = db.__store.tasks ?? [];
    expect(tasks.some((r) => r.id === "user-task-1")).toBe(true);
  });

  it("既存のユーザデータ (projects) が失われない", () => {
    const projects = db.__store.projects ?? [];
    expect(projects.some((r) => r.id === "user-project-1")).toBe(true);
  });

  it("singleton レコードが重複しない (冪等な INSERT OR IGNORE)", () => {
    for (const t of SINGLETON_TABLES) {
      const rows = db.__store[t] ?? [];
      const singletons = rows.filter((r) => r.id === "singleton");
      expect(singletons).toHaveLength(1);
    }
  });

  it("__local_migrations に version=1 が記録される (v001 適用済みとみなされる)", () => {
    expect(recordedVersions(db)).toContain(1);
  });
});

// ---------------------------------------------------------------------------
// AC-MIG-003: 適用済み端末の再起動で up() が再実行されない
// ---------------------------------------------------------------------------

describe("runMigrations 適用済み端末の再起動 (AC-MIG-003)", () => {
  let db: MockDb;
  const upSpy = vi.fn(async (_db: LocalDb) => {});
  let registered: LocalMigration[];

  beforeEach(async () => {
    upSpy.mockClear();
    registered = [makeMigration(1, upSpy)];
    // Given: __local_migrations に version=1 が記録済みの DB
    db = makeMockDb({
      __local_migrations: [
        { version: 1, applied_at: "2026-05-01T00:00:00.000Z", name: "v001-initial" },
      ],
    });
    // When: migration runner を再度実行する
    await runMigrations(asLocalDb(db), registered);
  });

  it("v001 の up() が再実行されない", () => {
    expect(upSpy).not.toHaveBeenCalled();
  });

  it("__local_migrations の version=1 レコードが重複しない", () => {
    const rows = db.__store.__local_migrations ?? [];
    const v1 = rows.filter((r) => r.version === 1);
    expect(v1).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// AC-MIG-004: v002 を追加して起動すると v001→v002 が昇順で流れる
// ---------------------------------------------------------------------------

describe("runMigrations v002 追加で差分適用 (AC-MIG-004)", () => {
  let db: MockDb;
  const v001Up = vi.fn(async (_db: LocalDb) => {});
  const v002Up = vi.fn(async (_db: LocalDb) => {});

  beforeEach(async () => {
    v001Up.mockClear();
    v002Up.mockClear();
    // Given: v001 まで適用済みの DB と, 登録一覧に追加された v002 定義
    db = makeMockDb({
      __local_migrations: [
        { version: 1, applied_at: "2026-05-01T00:00:00.000Z", name: "v001-initial" },
      ],
    });
    const registered = [makeMigration(1, v001Up), makeMigration(2, v002Up)];
    // When: migration runner を実行する
    await runMigrations(asLocalDb(db), registered);
  });

  it("v002 の up() が実行される", () => {
    expect(v002Up).toHaveBeenCalledTimes(1);
  });

  it("v001 の up() は再実行されない", () => {
    expect(v001Up).not.toHaveBeenCalled();
  });

  it("__local_migrations に version=2 が記録される", () => {
    expect(recordedVersions(db)).toContain(2);
  });
});

// ---------------------------------------------------------------------------
// AC-MIG-005: 複数バージョン未適用を 1 回の起動で昇順に連続適用する
// ---------------------------------------------------------------------------

describe("runMigrations 複数未適用の昇順連続適用 (AC-MIG-005)", () => {
  let db: MockDb;
  const callOrder: number[] = [];

  beforeEach(async () => {
    callOrder.length = 0;
    // Given: __local_migrations が空で, 登録一覧に v001 と v002 が存在する DB
    db = makeMockDb();
    const registered = [
      makeMigration(1, async () => {
        callOrder.push(1);
      }),
      makeMigration(2, async () => {
        callOrder.push(2);
      }),
    ];
    // When: migration runner を実行する
    await runMigrations(asLocalDb(db), registered);
  });

  it("v001 → v002 の順に up() が実行される", () => {
    expect(callOrder).toEqual([1, 2]);
  });

  it("__local_migrations に version=1 と version=2 の両方が記録される", () => {
    expect(recordedVersions(db)).toEqual([1, 2]);
  });
});

// ---------------------------------------------------------------------------
// AC-MIG-006: down/rollback の経路を持たない
// ---------------------------------------------------------------------------

describe("マイグレーション機構の公開 API (AC-MIG-006)", () => {
  it("登録済みマイグレーション定義に down / rollback の関数が無い", () => {
    for (const m of migrations) {
      const record = m as unknown as Record<string, unknown>;
      expect(record.down).toBeUndefined();
      expect(record.rollback).toBeUndefined();
    }
  });

  it("index モジュールが down / rollback を実行する関数を export しない", async () => {
    const mod = (await import("../src/repositories/local-migrations/index.js")) as Record<
      string,
      unknown
    >;
    const exported = Object.keys(mod);
    expect(exported.some((k) => /down|rollback|revert/i.test(k))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// AC-MIG-007: あるバージョンの up() が失敗したらそのバージョンは未記録のまま残る
// ---------------------------------------------------------------------------

describe("runMigrations up() 失敗時の振る舞い (AC-MIG-007)", () => {
  let db: MockDb;
  const failure = new Error("v002 up() で意図的に失敗");

  beforeEach(() => {
    // Given: v001 適用済み + v002 の up() が途中で例外を投げる DB
    db = makeMockDb({
      __local_migrations: [
        { version: 1, applied_at: "2026-05-01T00:00:00.000Z", name: "v001-initial" },
      ],
    });
  });

  it("up() の例外が呼び出し元へ伝播する", async () => {
    const registered = [
      makeMigration(1, async () => {}),
      makeMigration(2, async () => {
        throw failure;
      }),
    ];
    await expect(runMigrations(asLocalDb(db), registered)).rejects.toThrow(failure);
  });

  it("失敗したバージョン (version=2) が __local_migrations に記録されない", async () => {
    const registered = [
      makeMigration(1, async () => {}),
      makeMigration(2, async () => {
        throw failure;
      }),
    ];
    await runMigrations(asLocalDb(db), registered).catch(() => {});
    expect(recordedVersions(db)).not.toContain(2);
  });

  it("失敗時にトランザクションが rollback され version=2 が残らない", async () => {
    const registered = [
      makeMigration(2, async () => {
        throw failure;
      }),
    ];
    // version=1 のみ記録済みなので v002 だけが未適用対象.
    await runMigrations(asLocalDb(db), registered).catch(() => {});
    const rows = db.__store.__local_migrations ?? [];
    expect(rows.some((r) => r.version === 2)).toBe(false);
  });
});
