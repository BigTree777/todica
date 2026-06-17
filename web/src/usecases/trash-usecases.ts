/**
 * Trash 系統の Web mutation ユースケース (BL-118).
 *
 * trash-view が直書きしていた restore / empty mutation をアプリケーション層へ集約する.
 * restore は 412 (RestoreConflictError) を ConflictError に昇格する.
 * 標準 invalidate は `["trash"]` / `["today"]`.
 */

import { type UseMutationResult, useMutation, useQueryClient } from "@tanstack/react-query";
import { ConflictError, mapConflict } from "../offline-queue.js";
import type { RestoreTaskCommand, TrashRepository } from "../repositories/trash-repository.js";
import { RestoreConflictError } from "../repositories/trash-repository.js";
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

function extractRestoreServer(err: unknown): unknown {
  return err instanceof RestoreConflictError ? err.currentTask : undefined;
}

export interface TrashMutations {
  restore: UseMutationResult<unknown, Error, RestoreTaskCommand>;
  empty: UseMutationResult<unknown, Error, void>;
}

/** Trash mutation 群をまとめて返すフック. 標準 invalidate は `["trash"]` / `["today"]`. */
export function useTrashMutations(
  repository: TrashRepository,
  deps?: MutationDeps,
): TrashMutations {
  const queryClient = useQueryClient();
  const baseUrl = (repository as { baseUrl?: string }).baseUrl ?? "";

  const onSuccess = (result: unknown) => {
    void queryClient.invalidateQueries({ queryKey: ["trash"] });
    void queryClient.invalidateQueries({ queryKey: ["today"] });
    deps?.afterSuccess?.(queryClient, result);
  };
  const onError = (error: Error) => handleMutationError(error, deps, isConflict);

  const restore = useMutation({
    mutationFn: async (cmd: RestoreTaskCommand) => {
      const idempotencyKey = generateId();
      void safeEnqueue({
        url: `${baseUrl}/api/v1/trash/${cmd.id}/restore`,
        method: "POST",
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
        () => repository.restore(cmd),
        extractRestoreServer,
      );
      void safeDequeueByKey(idempotencyKey);
      return result;
    },
    onSuccess,
    onError,
    networkMode: "offlineFirst",
  });

  const empty = useMutation({
    mutationFn: async () => {
      const idempotencyKey = generateId();
      void safeEnqueue({
        url: `${baseUrl}/api/v1/trash`,
        method: "DELETE",
        headers: {
          "Idempotency-Key": idempotencyKey,
        },
        body: null,
        idempotencyKey,
      });
      if (!navigator.onLine) return undefined;
      await repository.empty();
      void safeDequeueByKey(idempotencyKey);
      return undefined;
    },
    onSuccess,
    networkMode: "offlineFirst",
  });

  return { restore, empty };
}
