/**
 * ゴミ箱清算ユースケース（BL-011 で実装予定）.
 *
 * 本 feature（BL-010）では no-op スタブとして提供する.
 */
import type { Clock } from "@todica/domain/clock";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";

/** BL-011 でゴミ箱清算ロジックが実装される。本 feature では no-op。 */
export async function purgeTrash(
  _db: BetterSQLite3Database,
  _clock: Clock,
): Promise<void> {
  // BL-011 で実装予定
}
