/**
 * FocusSelection ドメイン (FR-012 現在のタスク / FR-013 自動解除).
 *
 * 仕様参照: docs/developer/features/focus-task/spec.md
 *
 * 単一レコード前提 (id = "singleton") の FocusSelection 型と,
 * 現在のタスクを設定 / 解除する純関数を提供する.
 */

/**
 * 「現在のタスク」 (フォーカス対象) を保持する単一レコード.
 */
export interface FocusSelection {
  /** 単一レコードを示す固定値 "singleton". */
  id: string;
  /** 現在のタスク id. 明示未選択時は null. */
  currentTaskId: string | null;
  /** ISO 8601. 最後に update された時刻. */
  updatedAt: string;
  /** 楽観ロック用. update のたびに +1. */
  version: number;
}

/**
 * currentTaskId を指定値で上書きし, version+1 / updatedAt 更新.
 * - taskId = string: そのタスクを現在のタスクに設定 (FR-012)
 * - taskId = null: 現在のタスクを解除
 */
export function setCurrentTask(
  focus: FocusSelection,
  taskId: string | null,
  now: string,
): FocusSelection {
  return {
    ...focus,
    currentTaskId: taskId,
    updatedAt: now,
    version: focus.version + 1,
  };
}

/**
 * focus.currentTaskId が targetId と等しいかを判定する純関数.
 * FR-013 自動解除 (タスクが完了 / 削除 / tomorrow へ移動された時に focus を解除する経路)
 * の判定に使う. 一致しなければ false を返し, 呼び出し側が update を skip する.
 */
export function shouldClearFocus(focus: FocusSelection, targetId: string): boolean {
  return focus.currentTaskId === targetId;
}
