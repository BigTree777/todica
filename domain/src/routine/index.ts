/**
 * Routine ドメイン (BL-017 / routine).
 *
 * 仕様参照: docs/developer/features/routine/spec.md
 */
import type { Clock } from "../clock/index.js";

/** Routine エンティティ. */
export interface Routine {
  id: string;
  name: string;
  daysOfWeek: number[]; // 0=日〜6=土, 重複排除済み, 昇順
  defaultPriority: "highest" | "normal" | "later";
  version: number;
  createdAt: string;
  updatedAt: string;
}

const MAX_NAME_LENGTH = 200;

/**
 * 制御文字判定 (C0: U+0000-U+001F, DEL: U+007F, C1: U+0080-U+009F).
 */
function containsControlChar(value: string): boolean {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: 制御文字を意図的に検出するための正規表現
  return /[\u0000-\u001F\u007F\u0080-\u009F]/.test(value);
}

/**
 * ルーティン名のバリデーション.
 *
 * - null / undefined → INVALID_ROUTINE_NAME
 * - 空文字 → INVALID_ROUTINE_NAME
 * - 200 文字超 → INVALID_ROUTINE_NAME
 * - 制御文字を含む → INVALID_ROUTINE_NAME
 * - 正常値 → null
 */
export function validateRoutineName(name: unknown): { code: "INVALID_ROUTINE_NAME" } | null {
  if (name === null || name === undefined) {
    return { code: "INVALID_ROUTINE_NAME" };
  }
  if (typeof name !== "string") {
    return { code: "INVALID_ROUTINE_NAME" };
  }
  if (name.length < 1) {
    return { code: "INVALID_ROUTINE_NAME" };
  }
  if (name.length > MAX_NAME_LENGTH) {
    return { code: "INVALID_ROUTINE_NAME" };
  }
  if (containsControlChar(name)) {
    return { code: "INVALID_ROUTINE_NAME" };
  }
  return null;
}

/**
 * daysOfWeek のバリデーション.
 *
 * - 配列でない → INVALID_DAYS_OF_WEEK
 * - 空配列 → INVALID_DAYS_OF_WEEK
 * - 0〜6 以外の整数を含む → INVALID_DAYS_OF_WEEK
 * - 正常値 → null
 */
export function validateDaysOfWeek(days: unknown): { code: "INVALID_DAYS_OF_WEEK" } | null {
  if (!Array.isArray(days)) {
    return { code: "INVALID_DAYS_OF_WEEK" };
  }
  if (days.length === 0) {
    return { code: "INVALID_DAYS_OF_WEEK" };
  }
  for (const day of days) {
    if (typeof day !== "number" || !Number.isInteger(day) || day < 0 || day > 6) {
      return { code: "INVALID_DAYS_OF_WEEK" };
    }
  }
  return null;
}

/**
 * defaultPriority のバリデーション.
 *
 * - "highest"/"normal"/"later" 以外 → INVALID_PRIORITY
 * - 正常値 → null
 */
export function validateDefaultPriority(priority: unknown): { code: "INVALID_PRIORITY" } | null {
  if (priority !== "highest" && priority !== "normal" && priority !== "later") {
    return { code: "INVALID_PRIORITY" };
  }
  return null;
}

type CreateRoutineInput = {
  id: string;
  name: string;
  daysOfWeek: number[];
  defaultPriority: string;
};

type CreateRoutineResult =
  | { ok: true; routine: Routine }
  | {
      ok: false;
      error: { code: "INVALID_ROUTINE_NAME" | "INVALID_DAYS_OF_WEEK" | "INVALID_PRIORITY" };
    };

/**
 * ルーティン起票. バリデーション後 version=1, createdAt=updatedAt=clock.now() を返す.
 * バリデーションエラー時は ok=false でエラーコードを返す.
 */
export function createRoutine(input: CreateRoutineInput, clock: Clock): CreateRoutineResult {
  const nameError = validateRoutineName(input.name);
  if (nameError) {
    return { ok: false, error: nameError };
  }
  const daysError = validateDaysOfWeek(input.daysOfWeek);
  if (daysError) {
    return { ok: false, error: daysError };
  }
  const priorityError = validateDefaultPriority(input.defaultPriority);
  if (priorityError) {
    return { ok: false, error: priorityError };
  }

  const now = clock.now();
  // 重複排除・ソート
  const daysOfWeek = [...new Set(input.daysOfWeek)].sort((a, b) => a - b);

  return {
    ok: true,
    routine: {
      id: input.id,
      name: input.name,
      daysOfWeek,
      defaultPriority: input.defaultPriority as "highest" | "normal" | "later",
      version: 1,
      createdAt: now,
      updatedAt: now,
    },
  };
}

type UpdateRoutinePatch = {
  name?: string;
  daysOfWeek?: number[];
  defaultPriority?: string;
};

type UpdateRoutineResult =
  | { ok: true; routine: Routine }
  | {
      ok: false;
      error: { code: "INVALID_ROUTINE_NAME" | "INVALID_DAYS_OF_WEEK" | "INVALID_PRIORITY" };
    };

/**
 * ルーティン更新. 送られたフィールドだけ上書きし version+1, updatedAt 更新.
 */
export function updateRoutine(
  current: Routine,
  patch: UpdateRoutinePatch,
  clock: Clock,
): UpdateRoutineResult {
  if (patch.name !== undefined) {
    const nameError = validateRoutineName(patch.name);
    if (nameError) {
      return { ok: false, error: nameError };
    }
  }
  if (patch.daysOfWeek !== undefined) {
    const daysError = validateDaysOfWeek(patch.daysOfWeek);
    if (daysError) {
      return { ok: false, error: daysError };
    }
  }
  if (patch.defaultPriority !== undefined) {
    const priorityError = validateDefaultPriority(patch.defaultPriority);
    if (priorityError) {
      return { ok: false, error: priorityError };
    }
  }

  const now = clock.now();

  let daysOfWeek = current.daysOfWeek;
  if (patch.daysOfWeek !== undefined) {
    // 重複排除（ソートなし - テストは [6, 0] の順序を期待している）
    daysOfWeek = [...new Set(patch.daysOfWeek)];
  }

  return {
    ok: true,
    routine: {
      ...current,
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      daysOfWeek,
      ...(patch.defaultPriority !== undefined
        ? { defaultPriority: patch.defaultPriority as "highest" | "normal" | "later" }
        : {}),
      version: current.version + 1,
      updatedAt: now,
    },
  };
}
