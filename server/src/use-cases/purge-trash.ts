/**
 * ゴミ箱清算ユースケース（BL-011 / FR-062）.
 *
 * 仕様: docs/developer/features/trash/spec.md §「日次清算（FR-062 purgeTrash）」
 * 設計: docs/developer/features/trash/plan.md D-004
 */
import type { Clock } from "@todica/domain/clock";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type { SettingsRepository } from "../data/settings-repository.js";
import type { TaskRepository } from "../data/task-repository.js";
import type { schema } from "../db/schema.js";
import { calcTodayBoundaryAt, getServerTimeZone } from "./daily-reset.js";

/**
 * 境界時刻より古いゴミ箱タスクを物理削除する.
 *
 * - settingsRepository / taskRepository が未指定の場合は no-op（後方互換・テスト環境用）.
 * - db は後方互換のために引数に残すが、in-memory テスト環境では使用しない.
 */
export async function purgeTrash(
  _db: BetterSQLite3Database<typeof schema>,
  clock: Clock,
  settingsRepository?: SettingsRepository,
  taskRepository?: TaskRepository,
): Promise<void> {
  if (!settingsRepository || !taskRepository) return;

  const settings = await settingsRepository.get();
  // BL-112: maybeRunDailyReset と同じ境界を計算するため server timezone を必ず渡す.
  // 渡さないと UTC default で清算境界が計算され, 非 UTC TZ ではリセット境界とズレて
  // リセット時刻直前に削除したタスクが purge をすり抜けてゴミ箱に残るバグになる.
  const boundaryAt = calcTodayBoundaryAt(
    clock.now(),
    settings.dayBoundaryTime,
    getServerTimeZone(),
  );
  await taskRepository.deleteTrashOlderThan(boundaryAt);
}
