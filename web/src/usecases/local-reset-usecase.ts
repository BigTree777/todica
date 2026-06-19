/**
 * LocalResetUsecase — ローカルモード日次リセット処理 (BL-020 / AC-LOC-004).
 *
 * アプリ起動時 / フォアグラウンド境界到達時に呼ばれ、必要であればリセット処理を実行する.
 * 冪等性チェック: lastResetExecutedAt >= 前回境界時刻 なら何もしない.
 *
 * アルゴリズム (plan.md D-006):
 *   1. settings から dayBoundaryTime を取得 (TZ は実行時の端末 TZ を都度参照)
 *   2. counter から lastResetExecutedAt を取得
 *   3. 前回の境界時刻を計算
 *   4. lastResetExecutedAt >= 前回境界時刻 なら return（冪等性）
 *   5. トランザクションで:
 *      - origin='routine', dueDate='today', trashedAt=null → trashedAt=now, trashedReason='deleted'
 *      - origin='manual', dueDate='today', trashedAt=null → dueDate='tomorrow'
 *      - Counter: completedCount=0, lastResetExecutedAt=境界時刻.toISOString()
 *      - ゴミ箱清算: trashedAt < 前回境界時刻 → DELETE
 */

import { type Counter, resetCompletedCount } from "@todica/domain/counter";
import { calcPreviousBoundaryAt } from "@todica/domain/settings";
import type { LocalDb } from "../repositories/local-db.js";

export class LocalResetUsecase {
  constructor(private readonly db: LocalDb) {}

  async runIfNeeded(now: Date): Promise<void> {
    // 1. settings から境界時刻設定を取得
    const settingsResult = await this.db.query("SELECT * FROM settings WHERE id = 'singleton'");
    const settingsRow = (settingsResult.values ?? [])[0];

    const boundaryTime = (settingsRow?.day_boundary_time as string | undefined) ?? "04:00";
    // ローカルモードは実行時の端末 TZ を境界判定に使う (BL-091 設計意図). 設定の保存値ではなく
    // Intl の解決結果を都度参照することで, 端末ロケールに追従する.
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    // 2. counter から lastResetExecutedAt を取得
    const counterResult = await this.db.query("SELECT * FROM counter WHERE id = 'singleton'");
    const counterRow = (counterResult.values ?? [])[0];
    const lastResetExecutedAt =
      (counterRow?.last_reset_executed_at as string | null | undefined) ?? null;

    // 3. 前回の境界時刻を計算 (domain/settings の純関数を呼ぶ)
    const nowIso = now.toISOString();
    const previousBoundaryIso = calcPreviousBoundaryAt(nowIso, boundaryTime, timezone);

    // 4. 冪等性チェック: lastResetExecutedAt >= 前回境界時刻 なら何もしない
    if (lastResetExecutedAt !== null && lastResetExecutedAt >= previousBoundaryIso) {
      return;
    }

    // 5. トランザクションでリセット処理を実行
    await this.db.beginTransaction();
    try {
      // 5-1. origin='routine', dueDate='today', trashedAt=null → trashedAt=now, trashedReason='deleted'
      await this.db.run(
        `UPDATE tasks SET trashed_at = ?, trashed_reason = 'deleted', updated_at = ?, version = version + 1
         WHERE origin = 'routine' AND due_date = 'today' AND trashed_at IS NULL`,
        [nowIso, nowIso],
      );

      // 5-2. origin='manual', dueDate='today', trashedAt=null → dueDate='tomorrow'
      await this.db.run(
        `UPDATE tasks SET due_date = 'tomorrow', updated_at = ?, version = version + 1
         WHERE origin = 'manual' AND due_date = 'today' AND trashed_at IS NULL`,
        [nowIso],
      );

      // 5-3. Counter: completedCount=0, lastResetExecutedAt=境界時刻
      // local-db.ts の getDb() が INSERT OR IGNORE でシングルトンレコードを保証する
      const currentCounter: Counter = {
        id: (counterRow?.id as string | undefined) ?? "singleton",
        completedCount: (counterRow?.completed_count as number | undefined) ?? 0,
        lastResetExecutedAt: lastResetExecutedAt,
        updatedAt: (counterRow?.updated_at as string | undefined) ?? nowIso,
        version: (counterRow?.version as number | undefined) ?? 0,
      };
      const updatedCounter = resetCompletedCount(currentCounter, previousBoundaryIso, nowIso);
      await this.db.run(
        `UPDATE counter SET completed_count = ?, last_reset_executed_at = ?, updated_at = ?, version = ?
         WHERE id = 'singleton'`,
        [
          updatedCounter.completedCount,
          updatedCounter.lastResetExecutedAt,
          updatedCounter.updatedAt,
          updatedCounter.version,
        ],
      );

      // 5-4. ゴミ箱清算: trashedAt IS NOT NULL AND trashedAt < 前回境界時刻 → DELETE
      await this.db.run("DELETE FROM tasks WHERE trashed_at IS NOT NULL AND trashed_at < ?", [
        previousBoundaryIso,
      ]);

      await this.db.commitTransaction();
    } catch (e) {
      await this.db.rollbackTransaction();
      throw e;
    }
  }
}
