/**
 * ゴミ箱のユースケース (BL-011 / BL-119 / BL-120 / FR-061 / FR-062).
 *
 * - listTrash: ゴミ箱の Task / Project / Routine を { tasks, projects, routines } で一覧する.
 * - restore: 復元 (id から Task→Project→Routine の順に判別. 未ゴミ箱は 400 相当 / 楽観ロック /
 *   Task は dueDate を today にリセット).
 * - purgeTrash: ゴミ箱を空にする (Task / Project / Routine を全件物理削除).
 */
import type { Project } from "@todica/domain/project";
import { restoreProject as domainRestoreProject } from "@todica/domain/project";
import type { Routine } from "@todica/domain/routine";
import { restoreRoutine as domainRestoreRoutine } from "@todica/domain/routine";
import type { Task } from "@todica/domain/task";
import { restoreTask as domainRestoreTask } from "@todica/domain/task";
import type { AppDeps } from "../app.js";
import type { UsecaseResult } from "./result.js";

/** ゴミ箱表示用の Project 射影 (D-2: TrashedProject = { id, name, trashedAt, version }). */
export interface TrashedProject {
  id: string;
  name: string;
  trashedAt: string | null;
  version: number;
}

/** ゴミ箱表示用の Routine 射影 (D-2: TrashedRoutine = { id, name, trashedAt, version }). */
export interface TrashedRoutine {
  id: string;
  name: string;
  trashedAt: string | null;
  version: number;
}

/** ゴミ箱一覧の戻り値 (D-2: 3 配列構成). */
export interface TrashListing {
  tasks: Task[];
  projects: TrashedProject[];
  routines: TrashedRoutine[];
}

/** ゴミ箱にある Task / Project / Routine を一覧する. */
export async function listTrash(deps: AppDeps): Promise<TrashListing> {
  const tasks = await deps.taskRepository.list({ trashed: "true" });
  const trashedProjects = await deps.projectRepository.listTrashed();
  const projects: TrashedProject[] = trashedProjects.map((p) => ({
    id: p.id,
    name: p.name,
    trashedAt: p.trashedAt,
    version: p.version,
  }));
  const trashedRoutines = (await deps.routineRepository?.listTrashed()) ?? [];
  const routines: TrashedRoutine[] = trashedRoutines.map((r) => ({
    id: r.id,
    name: r.name,
    trashedAt: r.trashedAt,
    version: r.version,
  }));
  return { tasks, projects, routines };
}

export interface RestoreInput {
  id: string;
  ifMatch: number;
}

/** restore の成功値: Task / Project / Routine のどれを復元したかを判別できる discriminated union. */
export type RestoreResult =
  | { entity: "task"; task: Task }
  | { entity: "project"; project: Project }
  | { entity: "routine"; routine: Routine };

/**
 * ゴミ箱の Task / Project / Routine を復元する.
 *   - taskRepository.findById(id) でヒットすれば Task 復元 (dueDate を today にリセット).
 *   - 非ヒットなら projectRepository.findById(id) を試す.
 *   - さらに非ヒットなら routineRepository.findById(id):
 *       なし → notFound, 未ゴミ箱 → invalid (ROUTINE_NOT_IN_TRASH), version 不一致 → conflict.
 *       それ以外 → restoreRoutine (trashedAt=null, version+1). 再紐付け (カスケード復元) はしない (D-4).
 */
export async function restore(
  deps: AppDeps,
  input: RestoreInput,
): Promise<UsecaseResult<RestoreResult>> {
  const task = await deps.taskRepository.findById(input.id);
  if (task) {
    if (task.trashedAt === null) {
      return { kind: "invalid", code: "TASK_NOT_IN_TRASH", message: "task is not in trash" };
    }
    if (task.version !== input.ifMatch) {
      return { kind: "conflict", current: { entity: "task", task } };
    }
    const restored = domainRestoreTask(task, deps.clock);
    await deps.taskRepository.update(restored);
    return { kind: "ok", value: { entity: "task", task: restored } };
  }

  const project = await deps.projectRepository.findById(input.id);
  if (project) {
    if (project.trashedAt === null) {
      return { kind: "invalid", code: "PROJECT_NOT_IN_TRASH", message: "project is not in trash" };
    }
    if (project.version !== input.ifMatch) {
      return { kind: "conflict", current: { entity: "project", project } };
    }
    const restored = domainRestoreProject(project, deps.clock);
    await deps.projectRepository.update(restored);
    return { kind: "ok", value: { entity: "project", project: restored } };
  }

  const routine = await deps.routineRepository?.findById(input.id);
  if (!routine) {
    return { kind: "notFound", code: "TASK_NOT_FOUND", message: "task not found" };
  }
  if (routine.trashedAt === null) {
    return { kind: "invalid", code: "ROUTINE_NOT_IN_TRASH", message: "routine is not in trash" };
  }
  if (routine.version !== input.ifMatch) {
    return { kind: "conflict", current: { entity: "routine", routine } };
  }
  const restored = domainRestoreRoutine(routine, deps.clock);
  await deps.routineRepository?.update(restored);
  return { kind: "ok", value: { entity: "routine", routine: restored } };
}

/** ゴミ箱を空にする (ゴミ箱の Task / Project / Routine を物理削除). */
export async function purgeTrash(deps: AppDeps): Promise<void> {
  await deps.taskRepository.deleteAllTrashed();
  await deps.projectRepository.deleteAllTrashed();
  await deps.routineRepository?.deleteAllTrashed();
}
