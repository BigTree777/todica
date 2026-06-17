/**
 * タスクのユースケース (BL-001 / BL-003 / BL-006 / BL-008 など).
 *
 * 各 API ルータのハンドラに直書きされていた「ドメイン純関数の呼び出し順序の組み立て・
 * Repository アクセス順序・counter +1 / focus 自動解除のオーケストレーション」を
 * HTTP 非依存のユースケースとして所管する (plan.md D-1).
 *
 * 結果は UsecaseResult で返し, HTTP への写像はルータが行う.
 */
import { incrementCompletedCount } from "@todica/domain/counter";
import type { Task } from "@todica/domain/task";
import {
  completeTask as domainCompleteTask,
  createTask as domainCreateTask,
  updateTask as domainUpdateTask,
  trashTask,
  type UpdateTaskInput,
} from "@todica/domain/task";
import type { AppDeps } from "../app.js";
import { clearFocusIfMatches } from "./focus-usecases.js";
import type { UsecaseResult } from "./result.js";

export interface CreateTaskInput {
  id: string;
  name: string;
  projectId?: string | null;
  dueDate?: "today" | "tomorrow";
  priority?: "highest" | "normal" | "later";
}

/**
 * タスクを作成する.
 *   - projectId 指定時は参照整合性チェック.
 *   - ドメイン createTask の検証 → taskRepository.insert.
 */
export async function createTask(
  deps: AppDeps,
  input: CreateTaskInput,
): Promise<UsecaseResult<Task>> {
  if (input.projectId !== undefined && input.projectId !== null) {
    const exists = await deps.projectRepository.exists(input.projectId);
    if (!exists) {
      return { kind: "invalid", code: "PROJECT_NOT_FOUND", message: "projectId does not exist" };
    }
  }

  const createResult = domainCreateTask(
    {
      id: input.id,
      name: input.name,
      projectId: input.projectId ?? null,
      ...(input.dueDate !== undefined ? { dueDate: input.dueDate } : {}),
      ...(input.priority !== undefined ? { priority: input.priority } : {}),
    },
    deps.clock,
  );
  if (!createResult.ok) {
    return { kind: "invalid", code: createResult.error.code, message: createResult.error.message };
  }

  await deps.taskRepository.insert(createResult.task);
  return { kind: "ok", value: createResult.task };
}

export interface UpdateTaskUsecaseInput {
  id: string;
  ifMatch: number;
  patch: UpdateTaskInput;
}

/**
 * タスクを更新する.
 *   - findById → 楽観ロック → 入力フィールド検証 → projectId 参照整合 → ドメイン updateTask → update.
 *   - 検証は楽観ロック (conflict) より後に行う (現挙動の優先順位を踏襲).
 *   - dueDate=tomorrow に変更したタスクが現在のフォーカス対象なら解除する (FR-013).
 */
export async function updateTask(
  deps: AppDeps,
  input: UpdateTaskUsecaseInput,
): Promise<UsecaseResult<Task>> {
  const current = await deps.taskRepository.findById(input.id);
  if (!current) {
    return { kind: "notFound", code: "TASK_NOT_FOUND", message: "task not found" };
  }
  if (current.version !== input.ifMatch) {
    return { kind: "conflict", current };
  }

  // 入力フィールド検証 (dueDate / name / priority). ドメイン純関数の検証より先に
  // ルータ相当の値域チェックを行い, 現挙動のコード / メッセージを維持する.
  if (
    input.patch.dueDate !== undefined &&
    input.patch.dueDate !== "today" &&
    input.patch.dueDate !== "tomorrow"
  ) {
    return {
      kind: "invalid",
      code: "INVALID_DUE_DATE",
      message: "dueDate must be 'today' or 'tomorrow'",
    };
  }
  if (input.patch.name !== undefined && typeof input.patch.name !== "string") {
    return { kind: "invalid", code: "INVALID_TASK_NAME", message: "name must be a string" };
  }
  if (
    input.patch.priority !== undefined &&
    input.patch.priority !== "highest" &&
    input.patch.priority !== "normal" &&
    input.patch.priority !== "later"
  ) {
    return {
      kind: "invalid",
      code: "INVALID_PRIORITY",
      message: "priority must be 'highest' | 'normal' | 'later'",
    };
  }

  if (
    input.patch.projectId !== undefined &&
    input.patch.projectId !== null &&
    typeof input.patch.projectId === "string"
  ) {
    const exists = await deps.projectRepository.exists(input.patch.projectId);
    if (!exists) {
      return { kind: "invalid", code: "PROJECT_NOT_FOUND", message: "projectId does not exist" };
    }
  }

  const updateResult = domainUpdateTask(current, input.patch, deps.clock);
  if (!updateResult.ok) {
    return { kind: "invalid", code: updateResult.error.code, message: updateResult.error.message };
  }

  await deps.taskRepository.update(updateResult.task);
  // FR-013: 期限を tomorrow に変更したタスクが currentTaskId と一致するなら解除.
  if (input.patch.dueDate === "tomorrow") {
    await clearFocusIfMatches(deps, input.id);
  }
  return { kind: "ok", value: updateResult.task };
}

export interface CompleteTaskInput {
  id: string;
  /** If-Match ヘッダのパース結果. 未指定 / 非数値は undefined. */
  ifMatch: number | undefined;
  /** If-Match ヘッダが存在したか. */
  ifMatchPresent: boolean;
}

/**
 * タスクを完了する (BL-003 / FR-006 / FR-060).
 *   - findById なし → notFound.
 *   - 既ゴミ箱 → no-op 200 (If-Match 検証スキップ).
 *   - If-Match 検証 → 楽観ロック.
 *   - completeTask → update → counter +1 (通常→完了の遷移時のみ) → focus 解除.
 */
export async function completeTask(
  deps: AppDeps,
  input: CompleteTaskInput,
): Promise<UsecaseResult<Task>> {
  const current = await deps.taskRepository.findById(input.id);
  if (!current) {
    return { kind: "notFound", code: "TASK_NOT_FOUND", message: "task not found" };
  }

  // 既にゴミ箱状態 → no-op 冪等 (If-Match 検証スキップ).
  if (current.trashedAt !== null) {
    return { kind: "noop", value: current };
  }

  if (!input.ifMatchPresent) {
    return { kind: "invalid", code: "MISSING_IF_MATCH", message: "If-Match header is required" };
  }
  if (input.ifMatch === undefined) {
    return {
      kind: "invalid",
      code: "MISSING_IF_MATCH",
      message: "If-Match header must be a numeric version",
    };
  }
  if (current.version !== input.ifMatch) {
    return { kind: "conflict", current };
  }

  const completed = domainCompleteTask(current, deps.clock);
  await deps.taskRepository.update(completed);
  // FR-006 / FR-040: 通常 → 完了の遷移が確定したここでのみ counter を +1 する.
  const currentCounter = await deps.counterRepository.get();
  const updatedCounter = incrementCompletedCount(currentCounter, deps.clock.now());
  await deps.counterRepository.update(updatedCounter);
  // FR-013: 完了対象が現在のフォーカスなら解除.
  await clearFocusIfMatches(deps, input.id);
  return { kind: "ok", value: completed };
}

export interface DeleteTaskInput {
  id: string;
  ifMatch: number | undefined;
  ifMatchPresent: boolean;
}

/**
 * タスクを削除する (ゴミ箱へ移動).
 *   - findById なし → notFound.
 *   - 既 deleted → no-op 204 (version 検証スキップ).
 *   - If-Match 検証 → 楽観ロック → trashTask → update → focus 解除.
 */
export async function deleteTask(
  deps: AppDeps,
  input: DeleteTaskInput,
): Promise<UsecaseResult<Task>> {
  const current = await deps.taskRepository.findById(input.id);
  if (!current) {
    return { kind: "notFound", code: "TASK_NOT_FOUND", message: "task not found" };
  }

  // 既にゴミ箱状態 (deleted) → no-op (version 検証スキップ).
  if (current.trashedAt !== null && current.trashedReason === "deleted") {
    return { kind: "noop", value: current };
  }

  if (!input.ifMatchPresent) {
    return { kind: "invalid", code: "MISSING_IF_MATCH", message: "If-Match header is required" };
  }
  if (input.ifMatch === undefined) {
    return {
      kind: "invalid",
      code: "MISSING_IF_MATCH",
      message: "If-Match header must be a numeric version",
    };
  }
  if (current.version !== input.ifMatch) {
    return { kind: "conflict", current };
  }

  const trashed = trashTask(current, deps.clock);
  await deps.taskRepository.update(trashed);
  // FR-013: 削除対象が現在のフォーカスなら解除.
  await clearFocusIfMatches(deps, input.id);
  return { kind: "ok", value: trashed };
}
