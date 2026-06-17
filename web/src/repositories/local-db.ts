/**
 * ローカル SQLite 初期化モジュール (BL-020 / FR-LOC-001).
 *
 * @capacitor-community/sqlite を使い todica.db を初期化する。
 * 接続確立後は migration runner（__local_migrations + version 管理）を 1 回呼び、
 * スキーマを最新バージョンへ整合させる（BL-117 / FR-MIG-001）。
 * シングルトンとして DB 接続を保持し、各 Local Repository に注入する。
 */

import { runMigrations } from "./local-migrations/index.js";

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

    // 未適用マイグレーションを昇順に適用し、スキーマを最新へ整合させる（FR-MIG-001）。
    await runMigrations(conn);

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
