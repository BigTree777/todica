/**
 * Counter ドメイン (FR-040 今日の完了タスク数 / FR-051 リセット).
 *
 * 仕様参照: docs/developer/features/completion-counter/spec.md
 *
 * 単一レコード前提 (id = "singleton") の Counter 型と, +1 / 0 リセットの
 * 状態遷移純関数を提供する.
 */

/**
 * 今日の完了タスク数とリセット進捗を保持する単一レコード.
 */
export interface Counter {
  /** 単一レコードを示す固定値 "singleton". */
  id: string;
  /** 通常状態のタスクが完了に遷移した累計回数 (FR-040). 日次リセットで 0 に戻る. */
  completedCount: number;
  /** 最後にリセットを実行した時刻 (NFR-020 冪等性判定用). */
  lastResetExecutedAt: string | null;
  /** ISO 8601. 最後に update された時刻. */
  updatedAt: string;
  /** 楽観ロック用. update のたびに +1. */
  version: number;
}

/**
 * completedCount を +1 し, version と updatedAt を更新する.
 * 通常状態のタスクが完了に遷移した直後にアプリ層から呼ぶ (BL-003 / FR-006 / FR-040).
 */
export function incrementCompletedCount(counter: Counter, now: string): Counter {
  return {
    ...counter,
    completedCount: counter.completedCount + 1,
    updatedAt: now,
    version: counter.version + 1,
  };
}

/**
 * completedCount を 0 にリセットし, lastResetExecutedAt を指定された値で更新する.
 * 日次リセット成功時にアプリ層から呼ぶ (BL-010 / FR-051).
 *
 * lastResetExecutedAt には「今回適用した境界時刻」を保存する（呼び出し側が引数で渡す）:
 * - server (daily-reset.ts): todayBoundaryAt
 * - web local (local-reset-usecase.ts): previousBoundaryIso
 *
 * どちらも境界時刻なので「次回境界時刻まで needsDailyReset = false」が決定的に保証される.
 */
export function resetCompletedCount(
  counter: Counter,
  lastResetExecutedAt: string,
  now: string,
): Counter {
  return {
    ...counter,
    completedCount: 0,
    lastResetExecutedAt,
    updatedAt: now,
    version: counter.version + 1,
  };
}
