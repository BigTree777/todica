/**
 * ローカル SQLite 初期化モジュール (BL-020 / FR-LOC-001).
 *
 * @capacitor-community/sqlite を使い todica.db を初期化する。
 * DDL（CREATE TABLE IF NOT EXISTS）を実行し、シングルトンレコードを挿入する。
 * シングルトンとして DB 接続を保持し、各 Local Repository に注入する。
 */

type Row = Record<string, unknown>;

export interface LocalDb {
  query(sql: string, values?: unknown[]): Promise<{ values?: Row[] }>;
  run(sql: string, values?: unknown[]): Promise<{ changes?: { changes: number; lastId: number } }>;
  execute(sql: string): Promise<{ changes?: { changes: number } }>;
  beginTransaction(): Promise<void>;
  commitTransaction(): Promise<void>;
  rollbackTransaction(): Promise<void>;
  isTransactionActive?(): Promise<{ result: boolean }>;
  isDBOpen?(): Promise<{ result: boolean }>;
}

let db: LocalDb | null = null;

export async function getDb(): Promise<LocalDb> {
  if (db) return db;

  try {
    const { CapacitorSQLite, SQLiteConnection } = await import("@capacitor-community/sqlite");
    const sqlite = new SQLiteConnection(CapacitorSQLite);
    const sqliteConn = await sqlite.createConnection("todica.db", false, "no-encryption", 1, false);
    await sqliteConn.open();
    const conn: LocalDb = sqliteConn as unknown as LocalDb;

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        project_id TEXT,
        due_date TEXT NOT NULL CHECK(due_date IN ('today', 'tomorrow')),
        priority TEXT NOT NULL DEFAULT 'normal',
        origin TEXT NOT NULL DEFAULT 'manual',
        routine_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        trashed_at TEXT,
        trashed_reason TEXT,
        version INTEGER NOT NULL DEFAULT 1
      );
    `);

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        trashed_at TEXT,
        version INTEGER NOT NULL DEFAULT 1
      );
    `);

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS routines (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        days_of_week TEXT NOT NULL,
        default_priority TEXT NOT NULL DEFAULT 'normal',
        version INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS counter (
        id TEXT PRIMARY KEY NOT NULL,
        completed_count INTEGER NOT NULL DEFAULT 0,
        last_reset_executed_at TEXT,
        updated_at TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 1
      );
    `);

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS settings (
        id TEXT PRIMARY KEY NOT NULL,
        day_boundary_time TEXT NOT NULL DEFAULT '04:00',
        day_boundary_timezone TEXT NOT NULL DEFAULT 'Asia/Tokyo',
        updated_at TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 1
      );
    `);

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS focus_selection (
        id TEXT PRIMARY KEY NOT NULL,
        current_task_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 1
      );
    `);

    const now = new Date().toISOString();

    // シングルトンレコードを挿入（存在しない場合のみ）
    await conn.run(
      `INSERT OR IGNORE INTO counter (id, completed_count, last_reset_executed_at, updated_at, version)
       VALUES ('singleton', 0, NULL, ?, 1)`,
      [now],
    );

    await conn.run(
      `INSERT OR IGNORE INTO settings (id, day_boundary_time, day_boundary_timezone, updated_at, version)
       VALUES ('singleton', '04:00', 'Asia/Tokyo', ?, 1)`,
      [now],
    );

    await conn.run(
      `INSERT OR IGNORE INTO focus_selection (id, current_task_id, created_at, updated_at, version)
       VALUES ('singleton', NULL, ?, ?, 1)`,
      [now, now],
    );

    db = conn;
    return conn;
  } catch {
    throw new Error(
      "SQLite の初期化に失敗しました。@capacitor-community/sqlite が利用できない環境です。",
    );
  }
}

export function resetDbCache(): void {
  db = null;
}
