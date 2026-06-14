/**
 * LocalResetUsecase — ローカルモード日次リセット処理 (BL-020 / AC-LOC-004).
 *
 * アプリ起動時 / フォアグラウンド境界到達時に呼ばれ、必要であればリセット処理を実行する.
 * 冪等性チェック: lastResetExecutedAt >= 前回境界時刻 なら何もしない.
 *
 * アルゴリズム (plan.md D-006):
 *   1. settings から dayBoundaryTime・dayBoundaryTimezone を取得
 *   2. counter から lastResetExecutedAt を取得
 *   3. 前回の境界時刻を計算
 *   4. lastResetExecutedAt >= 前回境界時刻 なら return（冪等性）
 *   5. トランザクションで:
 *      - origin='routine', dueDate='today', trashedAt=null → trashedAt=now, trashedReason='deleted'
 *      - origin='manual', dueDate='today', trashedAt=null → dueDate='tomorrow'
 *      - Counter: completedCount=0, lastResetExecutedAt=境界時刻.toISOString()
 *      - ゴミ箱清算: trashedAt < 前回境界時刻 → DELETE
 */

import type { LocalDb } from "../repositories/local-db.js";

type Row = Record<string, unknown>;

/**
 * 前回の境界時刻を計算する.
 *
 * now のタイムゾーン内での日付を使い、当日の境界時刻 UTC を計算する.
 * now が当日境界時刻を超えていれば当日境界時刻を、超えていなければ前日境界時刻を返す.
 */
function calcPreviousBoundary(now: Date, boundaryTime: string, timezone: string): Date {
  const [hStr, mStr] = boundaryTime.split(":");
  const boundaryHour = Number.parseInt(hStr ?? "4", 10);
  const boundaryMinute = Number.parseInt(mStr ?? "0", 10);

  // now をタイムゾーンでフォーマットして現地の年月日を取得
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(now);
  const getPart = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";

  const year = Number.parseInt(getPart("year"), 10);
  const month = Number.parseInt(getPart("month"), 10);
  const day = Number.parseInt(getPart("day"), 10);
  const localHour = Number.parseInt(getPart("hour"), 10);
  const localMinute = Number.parseInt(getPart("minute"), 10);

  // 現在時刻の現地時間が境界時刻以上かどうかチェック
  const localTimeMinutes = localHour * 60 + localMinute;
  const boundaryMinutes = boundaryHour * 60 + boundaryMinute;

  let targetYear = year;
  let targetMonth = month;
  let targetDay = day;

  if (localTimeMinutes < boundaryMinutes) {
    // 境界時刻より前なら前日の境界時刻
    const prevDay = new Date(Date.UTC(year, month - 1, day - 1));
    targetYear = prevDay.getUTCFullYear();
    targetMonth = prevDay.getUTCMonth() + 1;
    targetDay = prevDay.getUTCDate();
  }

  // targetDay の境界時刻を UTC に変換する
  // Intl.DateTimeFormat を使って、その日のタイムゾーンオフセットを逆算する
  const candidateLocal = `${String(targetYear).padStart(4, "0")}-${String(targetMonth).padStart(2, "0")}-${String(targetDay).padStart(2, "0")}T${String(boundaryHour).padStart(2, "0")}:${String(boundaryMinute).padStart(2, "0")}:00`;

  // 二分探索でオフセットを求める代わりに、単純アプローチ:
  // UTC 時刻 = ローカル時刻 - UTC オフセット
  // オフセットを推定するために候補日の正午で計算
  const noonUtc = new Date(Date.UTC(targetYear, targetMonth - 1, targetDay, 12, 0, 0));
  const noonLocal = formatter.formatToParts(noonUtc);
  const getNoonPart = (type: string) => noonLocal.find((p) => p.type === type)?.value ?? "0";
  const noonLocalHour = Number.parseInt(getNoonPart("hour"), 10);
  const noonLocalDay = Number.parseInt(getNoonPart("day"), 10);
  const noonLocalMonth = Number.parseInt(getNoonPart("month"), 10);
  const noonLocalYear = Number.parseInt(getNoonPart("year"), 10);

  // ローカルの正午から UTC の正午を引いてオフセット（分）を求める
  const noonLocalMs = Date.UTC(
    noonLocalYear,
    noonLocalMonth - 1,
    noonLocalDay,
    noonLocalHour,
    0,
    0,
  );
  const offsetMs = noonLocalMs - noonUtc.getTime();

  // 境界時刻のローカルタイムスタンプ（UTC で表現）
  const boundaryLocalMs = Date.UTC(
    targetYear,
    targetMonth - 1,
    targetDay,
    boundaryHour,
    boundaryMinute,
    0,
    0,
  );
  const boundaryUtcMs = boundaryLocalMs - offsetMs;

  return new Date(boundaryUtcMs);
}

export class LocalResetUsecase {
  constructor(private readonly db: LocalDb) {}

  async runIfNeeded(now: Date): Promise<void> {
    // 1. settings から境界時刻設定を取得
    const settingsResult = await this.db.query("SELECT * FROM settings WHERE id = 'singleton'");
    const settingsRow = (settingsResult.values ?? [])[0];

    const boundaryTime = (settingsRow?.day_boundary_time as string | undefined) ?? "04:00";
    const timezone =
      (settingsRow?.day_boundary_timezone as string | undefined) ??
      Intl.DateTimeFormat().resolvedOptions().timeZone;

    // 2. counter から lastResetExecutedAt を取得
    const counterResult = await this.db.query("SELECT * FROM counter WHERE id = 'singleton'");
    const counterRow = (counterResult.values ?? [])[0];
    const lastResetExecutedAt =
      (counterRow?.last_reset_executed_at as string | null | undefined) ?? null;

    // 3. 前回の境界時刻を計算
    const previousBoundary = calcPreviousBoundary(now, boundaryTime, timezone);
    const previousBoundaryIso = previousBoundary.toISOString();

    // 4. 冪等性チェック: lastResetExecutedAt >= 前回境界時刻 なら何もしない
    if (lastResetExecutedAt !== null && lastResetExecutedAt >= previousBoundaryIso) {
      return;
    }

    const nowIso = now.toISOString();

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
      const counterVersion = ((counterRow?.version as number | undefined) ?? 0) + 1;
      await this.db.run(
        `UPDATE counter SET completed_count = 0, last_reset_executed_at = ?, updated_at = ?, version = ?
         WHERE id = 'singleton'`,
        [previousBoundaryIso, nowIso, counterVersion],
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
