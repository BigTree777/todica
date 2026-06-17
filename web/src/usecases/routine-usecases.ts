/**
 * Routine 系統の Web mutation ユースケース (BL-118).
 *
 * routines-view が直書きしていた routine mutation (create / update / delete) を
 * アプリケーション層へ集約する. update / delete は 412 (RoutineConflictError) を
 * ConflictError に昇格する. create は If-Match を持たないため衝突変換を行わない.
 */

import { type UseMutationResult, useMutation, useQueryClient } from "@tanstack/react-query";
import { ConflictError, mapConflict } from "../offline-queue.js";
import type {
  CreateRoutineCommand,
  DeleteRoutineCommand,
  UpdateRoutineCommand,
  WebRoutine,
  WebRoutineRepository,
} from "../repositories/routine-repository.js";
import { RoutineConflictError } from "../repositories/routine-repository.js";
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

function extractRoutineServer(err: unknown): unknown {
  return err instanceof RoutineConflictError ? err.currentRoutine : undefined;
}

export interface RoutineMutations {
  create: UseMutationResult<WebRoutine | undefined, Error, CreateRoutineCommand>;
  update: UseMutationResult<unknown, Error, UpdateRoutineCommand>;
  delete: UseMutationResult<unknown, Error, DeleteRoutineCommand>;
}

/** Routine mutation 群をまとめて返すフック. 標準 invalidate は `["routines"]`. */
export function useRoutineMutations(
  repository: WebRoutineRepository,
  deps?: MutationDeps,
): RoutineMutations {
  const queryClient = useQueryClient();
  const baseUrl = (repository as { baseUrl?: string }).baseUrl ?? "";

  const onSuccess = (result: unknown) => {
    void queryClient.invalidateQueries({ queryKey: ["routines"] });
    deps?.afterSuccess?.(queryClient, result);
  };
  const onError = (error: Error) => handleMutationError(error, deps, isConflict);

  const create = useMutation({
    mutationFn: async (cmd: CreateRoutineCommand): Promise<WebRoutine | undefined> => {
      const idempotencyKey = generateId();
      void safeEnqueue({
        url: `${baseUrl}/api/v1/routines`,
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
    mutationFn: async (cmd: UpdateRoutineCommand) => {
      const idempotencyKey = generateId();
      void safeEnqueue({
        url: `${baseUrl}/api/v1/routines/${cmd.id}`,
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
          "If-Match": String(cmd.ifMatch),
        },
        body: JSON.stringify({
          name: cmd.name,
          daysOfWeek: cmd.daysOfWeek,
          defaultPriority: cmd.defaultPriority,
        }),
        idempotencyKey,
      });
      if (!navigator.onLine) return undefined;
      const result = await mapConflict(
        idempotencyKey,
        () => repository.update(cmd),
        extractRoutineServer,
      );
      void safeDequeueByKey(idempotencyKey);
      return result;
    },
    onSuccess,
    onError,
    networkMode: "offlineFirst",
  });

  const del = useMutation({
    mutationFn: async (cmd: DeleteRoutineCommand) => {
      const idempotencyKey = generateId();
      void safeEnqueue({
        url: `${baseUrl}/api/v1/routines/${cmd.id}`,
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
        extractRoutineServer,
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
