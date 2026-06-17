/**
 * ゴミ箱のユースケース (BL-011 / FR-061 / FR-062).
 *
 * - listTrash: ゴミ箱タスクの一覧.
 * - restoreTask: 復元 (未ゴミ箱なら 400 相当 / 楽観ロック / dueDate を today にリセット).
 * - purgeTrash: ゴミ箱を空にする (全件物理削除).
 */
import type { Task } from "@todica/domain/task";
import { restoreTask as domainRestoreTask } from "@todica/domain/task";
import type { AppDeps } from "../app.js";
import type { UsecaseResult } from "./result.js";

/** ゴミ箱にあるタスク (trashedAt != null) を一覧する. */
export async function listTrash(deps: AppDeps): Promise<Task[]> {
  return deps.taskRepository.list({ trashed: "true" });
}

export interface RestoreTaskInput {
  id: string;
  ifMatch: number;
}

/**
 * ゴミ箱のタスクを復元する.
 *   - findById なし → notFound.
 *   - 未ゴミ箱 → invalid (TASK_NOT_IN_TRASH).
 *   - 楽観ロック → ドメイン restoreTask (dueDate を today にリセット) → update.
 */
export async function restoreTask(
  deps: AppDeps,
  input: RestoreTaskInput,
): Promise<UsecaseResult<Task>> {
  const current = await deps.taskRepository.findById(input.id);
  if (!current) {
    return { kind: "notFound", code: "TASK_NOT_FOUND", message: "task not found" };
  }
  if (current.trashedAt === null) {
    return { kind: "invalid", code: "TASK_NOT_IN_TRASH", message: "task is not in trash" };
  }
  if (current.version !== input.ifMatch) {
    return { kind: "conflict", current };
  }

  const restored = domainRestoreTask(current, deps.clock);
  await deps.taskRepository.update(restored);
  return { kind: "ok", value: restored };
}

/** ゴミ箱を空にする (全ゴミ箱タスクを物理削除). */
export async function purgeTrash(deps: AppDeps): Promise<void> {
  await deps.taskRepository.deleteAllTrashed();
}
