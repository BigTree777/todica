/**
 * Project 系統の Web mutation ユースケース (BL-118).
 *
 * projects-view / project-create-dialog が直書きしていた project mutation
 * (create / update / delete) をアプリケーション層へ集約する.
 * update / delete は 412 (ProjectConflictError) を ConflictError に昇格する.
 * create は If-Match を持たず 412 が発生しないため衝突変換を行わない.
 */

import { type UseMutationResult, useMutation, useQueryClient } from "@tanstack/react-query";
import { ConflictError, mapConflict } from "../offline-queue.js";
import type {
  CreateProjectCommand,
  DeleteProjectCommand,
  Project,
  ProjectRepository,
  UpdateProjectCommand,
} from "../repositories/project-repository.js";
import { ProjectConflictError } from "../repositories/project-repository.js";
import {
  generateId,
  handleMutationError,
  type MutationDeps,
  safeDequeueByKey,
  safeEnqueue,
} from "./mutation-helpers.js";

function isConflict(error: unknown): error is ConflictError {
  return error instanceof ConflictError;
}

function extractProjectServer(err: unknown): unknown {
  return err instanceof ProjectConflictError ? err.currentProject : undefined;
}

export interface ProjectMutations {
  create: UseMutationResult<Project | undefined, Error, CreateProjectCommand>;
  update: UseMutationResult<unknown, Error, UpdateProjectCommand>;
  delete: UseMutationResult<unknown, Error, DeleteProjectCommand>;
}

/** Project mutation 群をまとめて返すフック. 標準 invalidate は `["projects"]`. */
export function useProjectMutations(
  repository: ProjectRepository,
  deps?: MutationDeps,
): ProjectMutations {
  const queryClient = useQueryClient();
  const baseUrl = (repository as { baseUrl?: string }).baseUrl ?? "";

  const onSuccess = (result: unknown) => {
    void queryClient.invalidateQueries({ queryKey: ["projects"] });
    deps?.afterSuccess?.(queryClient, result);
  };
  const onError = (error: Error) => handleMutationError(error, deps, isConflict);

  const create = useMutation({
    mutationFn: async (cmd: CreateProjectCommand): Promise<Project | undefined> => {
      const idempotencyKey = generateId();
      void safeEnqueue({
        url: `${baseUrl}/api/v1/projects`,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({ ...cmd }),
        idempotencyKey,
      });
      if (!navigator.onLine) return undefined;
      const result = await repository.create(cmd);
      void safeDequeueByKey(idempotencyKey);
      return result;
    },
    onSuccess,
    onError,
    networkMode: "offlineFirst",
  });

  const update = useMutation({
    mutationFn: async (cmd: UpdateProjectCommand) => {
      const idempotencyKey = generateId();
      void safeEnqueue({
        url: `${baseUrl}/api/v1/projects/${cmd.id}`,
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
          "If-Match": String(cmd.ifMatch),
        },
        body: JSON.stringify({ name: cmd.name }),
        idempotencyKey,
      });
      if (!navigator.onLine) return undefined;
      const result = await mapConflict(
        idempotencyKey,
        () => repository.update(cmd),
        extractProjectServer,
      );
      void safeDequeueByKey(idempotencyKey);
      return result;
    },
    onSuccess,
    onError,
    networkMode: "offlineFirst",
  });

  const del = useMutation({
    mutationFn: async (cmd: DeleteProjectCommand) => {
      const idempotencyKey = generateId();
      void safeEnqueue({
        url: `${baseUrl}/api/v1/projects/${cmd.id}`,
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
          "If-Match": String(cmd.ifMatch),
        },
        body: null,
        idempotencyKey,
      });
      if (!navigator.onLine) return undefined;
      const result = await mapConflict(
        idempotencyKey,
        () => repository.delete(cmd),
        extractProjectServer,
      );
      void safeDequeueByKey(idempotencyKey);
      return result;
    },
    onSuccess,
    onError,
    networkMode: "offlineFirst",
  });

  return { create, update, delete: del };
}
