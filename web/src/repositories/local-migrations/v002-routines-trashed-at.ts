/**
 * v002 routines.trashed_at 追加 マイグレーション定義 (BL-120 / routine-soft-delete / FR-10).
 *
 * 仕様: docs/developer/features/routine-soft-delete/spec.md AC-14 / D-5.
 *
 * v001-initial.ts の routines DDL には trashed_at 列が無いため, v002 として
 * `ALTER TABLE routines ADD COLUMN trashed_at TEXT` を冪等に追加する.
 * up() は PRAGMA table_info で列存在を確認してから ADD COLUMN し,
 * 既に trashed_at を持つ DB に再適用しても破壊しない (冪等 / FR-MIG-009).
 */

import type { LocalDb } from "../local-db.js";
import type { LocalMigration } from "./index.js";

/** routines テーブルが trashed_at 列を既に持つか PRAGMA table_info で判定する. */
async function hasTrashedAtColumn(db: LocalDb): Promise<boolean> {
  const result = await db.query("PRAGMA table_info(routines)");
  return (result.values ?? []).some((row) => (row as { name?: unknown }).name === "trashed_at");
}

/** v002: routines に trashed_at 列を冪等に追加する. */
async function up(db: LocalDb): Promise<void> {
  if (await hasTrashedAtColumn(db)) {
    return;
  }
  await db.execute("ALTER TABLE routines ADD COLUMN trashed_at TEXT");
}

/** v002 マイグレーション定義. */
export const v002RoutinesTrashedAt: LocalMigration = {
  version: 2,
  name: "v002-routines-trashed-at",
  up,
};
