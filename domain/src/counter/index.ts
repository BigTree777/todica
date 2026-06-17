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
 * lastResetExecutedAt は呼び出し側で「何を保存するか」を決める引数として受け取る:
 * - server (daily-reset.ts): リセット実行時刻 (now)
 * - web local (local-reset-usecase.ts): 前回境界時刻 (previousBoundaryIso)
 *
 * 両者とも「次回境界時刻まで needsDailyReset = false を保証する」点では機能等価.
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
