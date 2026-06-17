/**
 * v001 初期スキーマ マイグレーション定義 (BL-117 / FR-MIG-006).
 *
 * 仕様: docs/developer/features/android-local-migration-versioning/spec.md
 *
 * 現行 local-db.ts が直書きしていた 6 テーブルの CREATE TABLE IF NOT EXISTS と,
 * counter / settings / focus_selection の singleton レコード INSERT OR IGNORE を
 * v001 の up() に逐語移植する. up() は冪等であり, 旧スキーマ済みの v0 ユーザで
 * 再適用してもデータを失わない (UD-1 案A / FR-MIG-009).
 */

import type { LocalDb } from "../local-db.js";
import type { LocalMigration } from "./index.js";

/** v001: 既存 6 テーブルの初期スキーマと singleton レコードを冪等に構築する. */
async function up(db: LocalDb): Promise<void> {
  await db.execute(`
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

  await db.execute(`
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        trashed_at TEXT,
        version INTEGER NOT NULL DEFAULT 1
      );
    `);

  await db.execute(`
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

  await db.execute(`
      CREATE TABLE IF NOT EXISTS counter (
        id TEXT PRIMARY KEY NOT NULL,
        completed_count INTEGER NOT NULL DEFAULT 0,
        last_reset_executed_at TEXT,
        updated_at TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 1
      );
    `);

  await db.execute(`
      CREATE TABLE IF NOT EXISTS settings (
        id TEXT PRIMARY KEY NOT NULL,
        day_boundary_time TEXT NOT NULL DEFAULT '04:00',
        day_boundary_timezone TEXT NOT NULL DEFAULT 'Asia/Tokyo',
        updated_at TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 1
      );
    `);

  await db.execute(`
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
  await db.run(
    `INSERT OR IGNORE INTO counter (id, completed_count, last_reset_executed_at, updated_at, version)
       VALUES ('singleton', 0, NULL, ?, 1)`,
    [now],
  );

  await db.run(
    `INSERT OR IGNORE INTO settings (id, day_boundary_time, day_boundary_timezone, updated_at, version)
       VALUES ('singleton', '04:00', 'Asia/Tokyo', ?, 1)`,
    [now],
  );

  await db.run(
    `INSERT OR IGNORE INTO focus_selection (id, current_task_id, created_at, updated_at, version)
       VALUES ('singleton', NULL, ?, ?, 1)`,
    [now, now],
  );
}

/** v001 マイグレーション定義. */
export const v001Initial: LocalMigration = {
  version: 1,
  name: "v001-initial",
  up,
};
