/**
 * フォーカス選択のユースケース (BL-006 / FR-012).
 *
 * - getFocus: 現在のフォーカス選択を取得する.
 * - setFocus: 対象タスクの存在・ゴミ箱・dueDate 検証 + setCurrentTask で更新する.
 * - clearFocusIfMatches: 指定タスクが現在のフォーカス対象なら解除する
 *   (task-usecases からの内部利用. focus 自動解除はビジネス手続き).
 *
 * HTTP には依存しない (plan.md D-1). 結果は UsecaseResult で返す.
 */
import type { FocusSelection } from "@todica/domain/focus-selection";
import { setCurrentTask, shouldClearFocus } from "@todica/domain/focus-selection";
import type { AppDeps } from "../app.js";
import type { UsecaseResult } from "./result.js";

/** 現在のフォーカス選択を取得する. */
export async function getFocus(deps: AppDeps): Promise<FocusSelection> {
  return deps.focusRepository.get();
}

/**
 * focus.currentTaskId が targetId と一致する場合に選択を解除する.
 */
export async function clearFocusIfMatches(deps: AppDeps, targetId: string): Promise<void> {
  const focus = await deps.focusRepository.get();
  if (!shouldClearFocus(focus, targetId)) return;
  const updated = setCurrentTask(focus, null, deps.clock.now());
  await deps.focusRepository.update(updated);
}

export interface SetFocusInput {
  taskId: string | null;
  ifMatch: number;
}

/**
 * フォーカス対象を設定する.
 *   - 楽観ロック (version 不一致なら conflict).
 *   - taskId !== null のとき対象タスクの存在 / ゴミ箱 / dueDate=today を検証する.
 *   - taskId === null は解除.
 */
export async function setFocus(
  deps: AppDeps,
  input: SetFocusInput,
): Promise<UsecaseResult<FocusSelection>> {
  const current = await deps.focusRepository.get();
  if (current.version !== input.ifMatch) {
    return { kind: "conflict", current };
  }

  if (input.taskId !== null) {
    const task = await deps.taskRepository.findById(input.taskId);
    if (!task) {
      return { kind: "invalid", code: "INVALID_FOCUS_TARGET", message: "task not found" };
    }
    if (task.trashedAt !== null) {
      return { kind: "invalid", code: "INVALID_FOCUS_TARGET", message: "task is trashed" };
    }
    if (task.dueDate !== "today") {
      return {
        kind: "invalid",
        code: "INVALID_FOCUS_TARGET",
        message: "task dueDate is not today",
      };
    }
  }

  const updated = setCurrentTask(current, input.taskId, deps.clock.now());
  await deps.focusRepository.update(updated);
  return { kind: "ok", value: updated };
}
