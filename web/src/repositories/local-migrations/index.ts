/**
 * Android ローカル DB マイグレーション登録ポイント / runner (BL-117).
 *
 * 仕様: docs/developer/features/android-local-migration-versioning/spec.md
 *   - FR-MIG-002 / 003 / 004 / 005 / 010 / 011
 *
 * トランザクション境界は案T1 を採用する (UD-3 / NFR-MIG-002):
 *   beginTransaction → up(db) → __local_migrations 記録 → commitTransaction.
 *   失敗時は rollbackTransaction して例外を再 throw する.
 */

import type { LocalDb } from "../local-db.js";
import { v001Initial } from "./v001-initial.js";

/** マイグレーション定義 (UD-3 確定: { version, name, up }). */
export interface LocalMigration {
  version: number;
  name: string;
  up(db: LocalDb): Promise<void>;
}

/**
 * 本番のマイグレーション登録一覧.
 *
 * 死蔵の v002 は置かない (UD-2 案X). v001 のみを本番一覧とする.
 * v002 (routines.trashed_at 追加) は BL-120 の責務.
 */
export const migrations: LocalMigration[] = [v001Initial];

/** __local_migrations の現在の適用済み最大バージョンを取得する (不在/NULL → 0). */
async function currentVersion(db: LocalDb): Promise<number> {
  const result = await db.query("SELECT MAX(version) AS version FROM __local_migrations");
  const row = result.values?.[0];
  const value = row?.version;
  return typeof value === "number" ? value : 0;
}

/**
 * migration runner.
 *
 * `__local_migrations` の適用済み最大バージョンより大きい定義を,
 * バージョン昇順に up() 実行し version を記録する (FR-MIG-003 / 004).
 * 既定引数が本番一覧, テストはダミー定義を注入する (FR-MIG-010).
 */
export async function runMigrations(
  db: LocalDb,
  migrationList: LocalMigration[] = migrations,
): Promise<void> {
  // __local_migrations を冪等に用意する (FR-MIG-002 / UD-4).
  await db.execute(`
    CREATE TABLE IF NOT EXISTS __local_migrations (
      version INTEGER PRIMARY KEY NOT NULL,
      applied_at TEXT NOT NULL,
      name TEXT
    );
  `);

  const current = await currentVersion(db);

  // version > current の定義のみをバージョン昇順に処理する (FR-MIG-003).
  const pending = migrationList
    .filter((m) => m.version > current)
    .sort((a, b) => a.version - b.version);

  for (const migration of pending) {
    // 案T1: 1 バージョン = 1 トランザクション (UD-3 / NFR-MIG-002).
    await db.beginTransaction();
    try {
      await migration.up(db);
      await db.run("INSERT INTO __local_migrations (version, applied_at, name) VALUES (?, ?, ?)", [
        migration.version,
        new Date().toISOString(),
        migration.name,
      ]);
      await db.commitTransaction();
    } catch (error) {
      // up() 失敗時は当該バージョンを記録せず rollback して例外を伝播する (AC-MIG-007).
      await db.rollbackTransaction();
      throw error;
    }
  }
}
