/**
 * プロジェクトのユースケース (BL-016 / FR-020 / FR-021 / FR-022).
 *
 * deleteProject はタスクの projectId NULL 化のカスケードとトランザクション境界を
 * ユースケース内に閉じ込める (plan.md D-2). ルータからは関数 1 呼び出しで完結する.
 */
import {
  createProject as domainCreateProject,
  updateProject as domainUpdateProject,
  validateProjectName,
} from "@todica/domain/project";
import { eq } from "drizzle-orm";
import type { AppDeps } from "../app.js";
import type { Project } from "../data/project-repository.js";
import { projects as projectsTable, tasks as tasksTable } from "../db/schema.js";
import type { UsecaseResult } from "./result.js";

export interface CreateProjectInput {
  id: string;
  name: unknown;
}

/** プロジェクトを作成する (名前検証 + ドメイン純関数 + insert). */
export async function createProject(
  deps: AppDeps,
  input: CreateProjectInput,
): Promise<UsecaseResult<Project>> {
  const nameError = validateProjectName(input.name);
  if (nameError) {
    return { kind: "invalid", code: "INVALID_PROJECT_NAME", message: "project name is invalid" };
  }
  const project = domainCreateProject(input.id, input.name as string, deps.clock);
  await deps.projectRepository.insert(project);
  return { kind: "ok", value: project };
}

export interface UpdateProjectInput {
  id: string;
  ifMatch: number;
  name: unknown;
}

/** プロジェクトを更新する (findById → 楽観ロック → 名前検証 → update). */
export async function updateProject(
  deps: AppDeps,
  input: UpdateProjectInput,
): Promise<UsecaseResult<Project>> {
  const current = await deps.projectRepository.findById(input.id);
  if (!current) {
    return { kind: "notFound", code: "PROJECT_NOT_FOUND", message: "project not found" };
  }
  if (current.version !== input.ifMatch) {
    return { kind: "conflict", current };
  }
  const nameError = validateProjectName(input.name);
  if (nameError) {
    return { kind: "invalid", code: "INVALID_PROJECT_NAME", message: "project name is invalid" };
  }
  const updated = domainUpdateProject(current, input.name as string, deps.clock);
  await deps.projectRepository.update(updated);
  return { kind: "ok", value: updated };
}

export interface DeleteProjectInput {
  id: string;
  ifMatch: number;
}

/**
 * プロジェクトを削除する.
 *   - findById → 楽観ロック.
 *   - 紐付くタスクの projectId NULL 化 + プロジェクト削除を同一トランザクション境界で実行する.
 *   - deps.db がない場合は Repository の順次呼び出しでフォールバックする.
 */
export async function deleteProject(
  deps: AppDeps,
  input: DeleteProjectInput,
): Promise<UsecaseResult<Project>> {
  const current = await deps.projectRepository.findById(input.id);
  if (!current) {
    return { kind: "notFound", code: "PROJECT_NOT_FOUND", message: "project not found" };
  }
  if (current.version !== input.ifMatch) {
    return { kind: "conflict", current };
  }

  // カスケード NULL: 紐付くタスクの projectId を null に更新してから削除する.
  // deps.db が存在する場合はトランザクション内で実行してアトミック性を保証する.
  if (deps.db) {
    deps.db.transaction((tx) => {
      tx.update(tasksTable)
        .set({ projectId: null })
        .where(eq(tasksTable.projectId, input.id))
        .run();
      tx.delete(projectsTable).where(eq(projectsTable.id, input.id)).run();
    });
  } else {
    await deps.taskRepository.nullifyProjectId(input.id);
    await deps.projectRepository.delete(input.id);
  }
  return { kind: "ok", value: current };
}
