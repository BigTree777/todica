/**
 * Task ドメイン.
 *
 * 仕様の参照元: docs/developer/features/task-crud/spec.md, plan.md §データモデル.
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
  /**
   * BL-002 / FR-004: 編集時の優先度. 指定された場合のみ部分上書きする.
   * 値域外は INVALID_PRIORITY を返す.
   */
  priority?: Priority;
}

/** ドメインバリデーション結果. */
export type ValidationError =
  | { code: "INVALID_TASK_NAME"; message: string }
  | { code: "INVALID_DUE_DATE"; message: string }
  | { code: "INVALID_PRIORITY"; message: string };

const DUE_DATES: readonly DueDate[] = ["today", "tomorrow"];
const PRIORITIES: readonly Priority[] = ["highest", "normal", "later"];

const MAX_NAME_LENGTH = 200;
/**
 * 制御文字判定 (改行 / タブ / NUL を含む). plan.md D-005.
 * Unicode の C0 (U+0000-U+001F) と DEL (U+007F), および C1 (U+0080-U+009F) を制御文字とする.
 */
function containsControlChar(value: string): boolean {
  for (const ch of value) {
    const code = ch.codePointAt(0);
    if (code === undefined) continue;
    if (code <= 0x1f || code === 0x7f) return true;
    if (code >= 0x80 && code <= 0x9f) return true;
  }
  return false;
}

/** タスク名のバリデーション (plan.md D-005). */
export function validateTaskName(name: string): ValidationError | null {
  if (typeof name !== "string") {
    return { code: "INVALID_TASK_NAME", message: "name must be a string" };
  }
  if (name.length < 1) {
    return { code: "INVALID_TASK_NAME", message: "name must be at least 1 character" };
  }
  if (name.length > MAX_NAME_LENGTH) {
    return {
      code: "INVALID_TASK_NAME",
      message: `name must be at most ${MAX_NAME_LENGTH} characters`,
    };
  }
  if (containsControlChar(name)) {
    return { code: "INVALID_TASK_NAME", message: "name must not contain control characters" };
  }
  return null;
}

/** 期限のバリデーション (FR-002). */
export function validateDueDate(value: unknown): ValidationError | null {
  if (typeof value !== "string") {
    return { code: "INVALID_DUE_DATE", message: "dueDate must be 'today' or 'tomorrow'" };
  }
  if (!DUE_DATES.includes(value as DueDate)) {
    return { code: "INVALID_DUE_DATE", message: "dueDate must be 'today' or 'tomorrow'" };
  }
  return null;
}

/** 優先度のバリデーション. */
export function validatePriority(value: unknown): ValidationError | null {
  if (typeof value !== "string") {
    return {
      code: "INVALID_PRIORITY",
      message: "priority must be 'highest' | 'normal' | 'later'",
    };
  }
  if (!PRIORITIES.includes(value as Priority)) {
    return {
      code: "INVALID_PRIORITY",
      message: "priority must be 'highest' | 'normal' | 'later'",
    };
  }
  return null;
}

/**
 * タスク起票. 既定値補完 + バリデーション + version=1, createdAt=updatedAt=clock.now().
 */
export function createTask(
  input: CreateTaskInput,
  clock: Clock,
): { ok: true; task: Task } | { ok: false; error: ValidationError } {
  const nameError = validateTaskName(input.name);
  if (nameError) return { ok: false, error: nameError };

  const dueDate = input.dueDate ?? "today";
  const dueError = validateDueDate(dueDate);
  if (dueError) return { ok: false, error: dueError };

  const priority = input.priority ?? "normal";
  const priorityError = validatePriority(priority);
  if (priorityError) return { ok: false, error: priorityError };

  const now = clock.now();
  const task: Task = {
    id: input.id,
    name: input.name,
    projectId: input.projectId ?? null,
    dueDate,
    priority,
    origin: "manual",
    routineId: null,
    createdAt: now,
    updatedAt: now,
    trashedAt: null,
    trashedReason: null,
    version: 1,
  };
  return { ok: true, task };
}

/**
 * タスク編集. 部分上書き + version+1 + updatedAt 更新. createdAt は不変.
 */
export function updateTask(
  current: Task,
  patch: UpdateTaskInput,
  clock: Clock,
): { ok: true; task: Task } | { ok: false; error: ValidationError } {
  if (patch.name !== undefined) {
    const nameError = validateTaskName(patch.name);
    if (nameError) return { ok: false, error: nameError };
  }
  if (patch.dueDate !== undefined) {
    const dueError = validateDueDate(patch.dueDate);
    if (dueError) return { ok: false, error: dueError };
  }
  if (patch.priority !== undefined) {
    const priorityError = validatePriority(patch.priority);
    if (priorityError) return { ok: false, error: priorityError };
  }

  const next: Task = {
    ...current,
    name: patch.name !== undefined ? patch.name : current.name,
    dueDate: patch.dueDate !== undefined ? patch.dueDate : current.dueDate,
    projectId:
      patch.projectId !== undefined ? patch.projectId : current.projectId,
    priority: patch.priority !== undefined ? patch.priority : current.priority,
    updatedAt: clock.now(),
    version: current.version + 1,
  };
  return { ok: true, task: next };
}

/**
 * タスクをゴミ箱に入れる (DELETE = 論理削除). trashedAt をセットし version+1.
 * 既にゴミ箱状態の場合は no-op (同じ値を返す) で冪等とする (plan.md D-003).
 */
export function trashTask(current: Task, clock: Clock): Task {
  if (current.trashedAt !== null) {
    return { ...current };
  }
  const now = clock.now();
  return {
    ...current,
    trashedAt: now,
    trashedReason: "deleted",
    updatedAt: now,
    version: current.version + 1,
  };
}

/** 既にゴミ箱状態か判定するヘルパ. */
export function isTrashed(task: Task): boolean {
  return task.trashedAt !== null;
}

/**
 * タスクを完了状態に遷移させる (BL-003 / FR-006 / FR-060).
 *
 * 通常状態 (trashedAt === null) のタスクのみ trashedAt をセットし
 * trashedReason = "completed" に書き換える. version +1, updatedAt 更新.
 * 既にゴミ箱状態 (trashedReason === "completed" / "deleted" のいずれでも) なら
 * no-op 冪等扱いで入力を変更せず返す (plan.md D-003).
 */
export function completeTask(current: Task, clock: Clock): Task {
  if (current.trashedAt !== null) {
    return { ...current };
  }
  const now = clock.now();
  return {
    ...current,
    trashedAt: now,
    trashedReason: "completed",
    updatedAt: now,
    version: current.version + 1,
  };
}
