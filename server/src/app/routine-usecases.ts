/**
 * ルーティンのユースケース (BL-017 / FR-030 / FR-035).
 *
 * deleteRoutine は配下未ゴミ箱タスク削除のカスケードとトランザクション境界を
 * ユースケース内に閉じ込める (plan.md D-2).
 */
import type { Routine } from "@todica/domain/routine";
import {
  createRoutine as domainCreateRoutine,
  trashRoutine as domainTrashRoutine,
  updateRoutine as domainUpdateRoutine,
  validateDaysOfWeek,
  validateDefaultPriority,
  validateRoutineName,
} from "@todica/domain/routine";
import { and, eq, isNull } from "drizzle-orm";
import type { AppDeps } from "../app.js";
import type { RoutineRepository } from "../data/routine-repository.js";
import { routines as routinesTable, tasks as tasksTable } from "../db/schema.js";
import type { UsecaseResult } from "./result.js";

export interface CreateRoutineInput {
  id: string;
  name: unknown;
  daysOfWeek: unknown;
  defaultPriority: unknown;
}

/** ルーティンを作成する (各 validate* + ドメイン純関数 + create). */
export async function createRoutine(
  deps: AppDeps,
  routineRepo: RoutineRepository,
  input: CreateRoutineInput,
): Promise<UsecaseResult<Routine>> {
  const nameError = validateRoutineName(input.name);
  if (nameError) {
    return { kind: "invalid", code: nameError.code, message: "routine name is invalid" };
  }
  const daysError = validateDaysOfWeek(input.daysOfWeek);
  if (daysError) {
    return { kind: "invalid", code: daysError.code, message: "daysOfWeek is invalid" };
  }
  if (input.defaultPriority !== undefined) {
    const priorityError = validateDefaultPriority(input.defaultPriority);
    if (priorityError) {
      return { kind: "invalid", code: priorityError.code, message: "defaultPriority is invalid" };
    }
  }

  const createResult = domainCreateRoutine(
    {
      id: input.id,
      name: input.name as string,
      daysOfWeek: input.daysOfWeek as number[],
      defaultPriority: (input.defaultPriority as string) ?? "normal",
    },
    deps.clock,
  );
  if (!createResult.ok) {
    return { kind: "invalid", code: createResult.error.code, message: "routine validation failed" };
  }

  await routineRepo.create(createResult.routine);
  return { kind: "ok", value: createResult.routine };
}

export interface UpdateRoutineInput {
  id: string;
  ifMatch: number;
  patch: { name?: string; daysOfWeek?: number[]; defaultPriority?: string };
}

/** ルーティンを更新する (findById → 楽観ロック → ドメイン updateRoutine → update). */
export async function updateRoutine(
  deps: AppDeps,
  routineRepo: RoutineRepository,
  input: UpdateRoutineInput,
): Promise<UsecaseResult<Routine>> {
  const current = await routineRepo.findById(input.id);
  if (!current) {
    return { kind: "notFound", code: "ROUTINE_NOT_FOUND", message: "routine not found" };
  }
  if (current.version !== input.ifMatch) {
    return { kind: "conflict", current };
  }

  const updateResult = domainUpdateRoutine(current, input.patch, deps.clock);
  if (!updateResult.ok) {
    return { kind: "invalid", code: updateResult.error.code, message: "routine validation failed" };
  }

  await routineRepo.update(updateResult.routine);
  return { kind: "ok", value: updateResult.routine };
}

export interface DeleteRoutineInput {
  id: string;
  ifMatch: number;
}

/**
 * ルーティンを削除する (ゴミ箱化 = soft delete).
 *   - findById → 楽観ロック.
 *   - 配下の未ゴミ箱タスクの routineId NULL 化 (デタッチ = カスケード NULL 固定) +
 *     ルーティンの trashedAt セットを同一トランザクション境界で実行する. Routine 自体は物理削除しない.
 *   - ゴミ箱状態のタスクには触れない (FR-2 / D-4).
 *   - deps.db がない場合は Repository の順次呼び出しでフォールバックする.
 */
export async function deleteRoutine(
  deps: AppDeps,
  routineRepo: RoutineRepository,
  input: DeleteRoutineInput,
): Promise<UsecaseResult<Routine>> {
  const current = await routineRepo.findById(input.id);
  if (!current) {
    return { kind: "notFound", code: "ROUTINE_NOT_FOUND", message: "routine not found" };
  }
  if (current.version !== input.ifMatch) {
    return { kind: "conflict", current };
  }

  // ドメイン純関数でゴミ箱化後の状態を算出する (trashedAt=now, version+1, updatedAt 更新).
  const trashed = domainTrashRoutine(current, deps.clock);

  // デタッチ (カスケード NULL): 紐付く未ゴミ箱タスクの routineId を null に更新する (タスクはゴミ箱化しない).
  // deps.db が存在する場合はトランザクション内で実行してアトミック性を保証する.
  if (deps.db) {
    deps.db.transaction((tx) => {
      tx.update(tasksTable)
        .set({ routineId: null })
        .where(and(eq(tasksTable.routineId, input.id), isNull(tasksTable.trashedAt)))
        .run();
      tx.update(routinesTable)
        .set({
          trashedAt: trashed.trashedAt,
          version: trashed.version,
          updatedAt: trashed.updatedAt,
        })
        .where(eq(routinesTable.id, input.id))
        .run();
    });
  } else {
    await deps.taskRepository.nullifyRoutineId(input.id);
    await routineRepo.update(trashed);
  }
  return { kind: "ok", value: trashed };
}
