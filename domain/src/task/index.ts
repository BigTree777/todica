/**
 * Task ドメイン.
 *
 * 仕様の参照元: docs/developer/features/task-crud/spec.md, plan.md §データモデル.
 * 本ファイルは test-designer が用意したスタブ. 関数本体は implementer が実装する.
 */
import type { Clock } from "../clock/index.js";

/** 期限の値域. FR-002. */
export type DueDate = "today" | "tomorrow";

/** 優先度. FR-003 / FR-004. 本機能では起票時の既定値のみ扱う. */
export type Priority = "highest" | "normal" | "later";

/** 由来. 本機能では "manual" のみを起票. */
export type Origin = "manual" | "routine";

/** ゴミ箱化の理由. 本機能の DELETE は "deleted" のみセット. */
export type TrashedReason = "completed" | "deleted";

/**
 * Task エンティティ.
 * docs/developer/architecture/database/schema.md §Task と一致させる.
 */
export interface Task {
  id: string;
  name: string;
  projectId: string | null;
  dueDate: DueDate;
  priority: Priority;
  origin: Origin;
  routineId: string | null;
  createdAt: string;
  updatedAt: string;
  trashedAt: string | null;
  trashedReason: TrashedReason | null;
  version: number;
}

/** 起票時の入力. id は外部 (クライアント) が UUID v4 で先行採番する. */
export interface CreateTaskInput {
  id: string;
  name: string;
  projectId?: string | null;
  dueDate?: DueDate;
  priority?: Priority;
}

/** 編集時の入力 (部分上書き). plan.md D-002. */
export interface UpdateTaskInput {
  name?: string;
  dueDate?: DueDate;
  projectId?: string | null;
}

/** ドメインバリデーション結果. */
export type ValidationError =
  | { code: "INVALID_TASK_NAME"; message: string }
  | { code: "INVALID_DUE_DATE"; message: string }
  | { code: "INVALID_PRIORITY"; message: string };

/** タスク名のバリデーション (plan.md D-005). */
export function validateTaskName(_name: string): ValidationError | null {
  throw new Error("not implemented: validateTaskName");
}

/** 期限のバリデーション (FR-002). */
export function validateDueDate(_value: unknown): ValidationError | null {
  throw new Error("not implemented: validateDueDate");
}

/** 優先度のバリデーション. */
export function validatePriority(_value: unknown): ValidationError | null {
  throw new Error("not implemented: validatePriority");
}

/**
 * タスク起票. 既定値補完 + バリデーション + version=1, createdAt=updatedAt=clock.now().
 */
export function createTask(
  _input: CreateTaskInput,
  _clock: Clock,
): { ok: true; task: Task } | { ok: false; error: ValidationError } {
  throw new Error("not implemented: createTask");
}

/**
 * タスク編集. 部分上書き + version+1 + updatedAt 更新. createdAt は不変.
 */
export function updateTask(
  _current: Task,
  _patch: UpdateTaskInput,
  _clock: Clock,
): { ok: true; task: Task } | { ok: false; error: ValidationError } {
  throw new Error("not implemented: updateTask");
}

/**
 * タスクをゴミ箱に入れる (DELETE = 論理削除). trashedAt をセットし version+1.
 * 既にゴミ箱状態の場合は no-op (同じ値を返す) で冪等とする (plan.md D-003).
 */
export function trashTask(_current: Task, _clock: Clock): Task {
  throw new Error("not implemented: trashTask");
}

/** 既にゴミ箱状態か判定するヘルパ. */
export function isTrashed(task: Task): boolean {
  return task.trashedAt !== null;
}
