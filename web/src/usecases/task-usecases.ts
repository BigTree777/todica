/**
 * Task 系統の Web mutation ユースケース (BL-118).
 *
 * today / tomorrow / focus の各 view が直書きしていた task mutation
 * (create / update / delete / complete / setFocus) をアプリケーション層へ集約する.
 * offline-queue 連携 / 衝突変換 (OptimisticLockError → ConflictError) /
 * 標準 invalidate をユースケース内に閉じ, view 差異は `deps.afterSuccess` で吸収する.
 */

import { type UseMutationResult, useMutation, useQueryClient } from "@tanstack/react-query";
import { notifyError } from "../error-notification.js";
import { ConflictError, findEntryByKey } from "../offline-queue.js";
import type {
  CompleteTaskCommand,
  CreateTaskCommand,
  DeleteTaskCommand,
  SetFocusCommand,
  TaskRepository,
  UpdateTaskCommand,
} from "../repositories/task-repository.js";
import { OptimisticLockError } from "../repositories/task-repository.js";
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

/** online 412 の OptimisticLockError を ConflictError に昇格する. */
async function mapTaskConflict(idempotencyKey: string, error: unknown): Promise<never> {
  if (error instanceof OptimisticLockError) {
    const entry = await findEntryByKey(idempotencyKey);
    if (entry) throw new ConflictError(entry, error.currentTask ?? {});
  }
  throw error;
}

export interface TaskMutations {
  create: UseMutationResult<unknown, Error, CreateTaskCommand>;
  update: UseMutationResult<unknown, Error, UpdateTaskCommand>;
  delete: UseMutationResult<unknown, Error, DeleteTaskCommand>;
  complete: UseMutationResult<unknown, Error, CompleteTaskCommand>;
  setFocus: UseMutationResult<unknown, Error, SetFocusCommand>;
}

/**
 * Task mutation 群をまとめて返すフック (案B).
 *
 * 標準 invalidate は `["today"]` / `["focus"]` (today-view / focus-view 相当).
 * tomorrow-view など別キーを使う view は `deps.afterSuccess` で上書き / 追加する.
 */
export function useTaskMutations(repository: TaskRepository, deps?: MutationDeps): TaskMutations {
  const queryClient = useQueryClient();
  const baseUrl = (repository as { baseUrl?: string }).baseUrl ?? "";

  // 標準 invalidate キー. 未指定なら ["today"] / ["focus"] (today-view / focus-view 相当).
  const invalidateKeys = deps?.invalidateKeys ?? [["today"], ["focus"]];
  const onSuccess = (result: unknown) => {
    for (const key of invalidateKeys) {
      void queryClient.invalidateQueries({ queryKey: [...key] });
    }
    deps?.afterSuccess?.(queryClient, result);
  };
  const onError = (error: Error) => handleMutationError(error, deps, isConflict);

  const create = useMutation({
    mutationFn: async (cmd: CreateTaskCommand) => {
      const idempotencyKey = generateId();
      void safeEnqueue({
        url: `${baseUrl}/api/v1/tasks`,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({ ...cmd }),
        idempotencyKey,
      });
      if (!navigator.onLine) return undefined;
      try {
        const result = await repository.create(cmd);
        void safeDequeueByKey(idempotencyKey);
        return result;
      } catch (error) {
        return await mapTaskConflict(idempotencyKey, error);
      }
    },
    onSuccess,
    onError,
    networkMode: "offlineFirst",
  });

  const update = useMutation({
    mutationFn: async (cmd: UpdateTaskCommand) => {
      const idempotencyKey = generateId();
      void safeEnqueue({
        url: `${baseUrl}/api/v1/tasks/${cmd.id}`,
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
          "If-Match": String(cmd.ifMatch),
        },
        body: JSON.stringify(cmd.patch),
        idempotencyKey,
      });
      if (!navigator.onLine) return undefined;
      try {
        const result = await repository.update(cmd);
        void safeDequeueByKey(idempotencyKey);
        return result;
      } catch (error) {
        return await mapTaskConflict(idempotencyKey, error);
      }
    },
    onSuccess,
    onError,
    networkMode: "offlineFirst",
  });

  const del = useMutation({
    mutationFn: async (cmd: DeleteTaskCommand) => {
      const idempotencyKey = generateId();
      void safeEnqueue({
        url: `${baseUrl}/api/v1/tasks/${cmd.id}`,
        method: "DELETE",
        headers: {
          "Idempotency-Key": idempotencyKey,
          "If-Match": String(cmd.ifMatch),
        },
        body: null,
        idempotencyKey,
      });
      if (!navigator.onLine) return undefined;
      try {
        const result = await repository.delete(cmd);
        void safeDequeueByKey(idempotencyKey);
        return result;
      } catch (error) {
        return await mapTaskConflict(idempotencyKey, error);
      }
    },
    onSuccess,
    onError,
    networkMode: "offlineFirst",
  });

  const complete = useMutation({
    mutationFn: async (cmd: CompleteTaskCommand) => {
      const idempotencyKey = generateId();
      void safeEnqueue({
        url: `${baseUrl}/api/v1/tasks/${cmd.id}/complete`,
        method: "POST",
        headers: {
          "Idempotency-Key": idempotencyKey,
          "If-Match": String(cmd.ifMatch),
        },
        body: null,
        idempotencyKey,
      });
      if (!navigator.onLine) return undefined;
      try {
        const result = await repository.complete(cmd);
        void safeDequeueByKey(idempotencyKey);
        return result;
      } catch (error) {
        return await mapTaskConflict(idempotencyKey, error);
      }
    },
    onSuccess,
    onError,
    networkMode: "offlineFirst",
  });

  // setFocus は ConflictDialog 機構の対象外 (FocusSelection は task entry 前提でない).
  // 失敗時は notifyError + ["focus"] invalidate で最新 version を取り直す.
  const setFocus = useMutation({
    mutationFn: async (cmd: SetFocusCommand) => {
      const idempotencyKey = generateId();
      void safeEnqueue({
        url: `${baseUrl}/api/v1/focus`,
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
          "If-Match": String(cmd.ifMatch),
        },
        body: JSON.stringify({ taskId: cmd.taskId }),
        idempotencyKey,
      });
      if (!navigator.onLine) return undefined;
      const result = await repository.setFocus(cmd);
      void safeDequeueByKey(idempotencyKey);
      return result;
    },
    onSuccess,
    onError: () => {
      // setFocus は ConflictDialog 経路を持たないため, 常に通知 + ["focus"] 再取得.
      notifyError("通信に失敗しました");
      void queryClient.invalidateQueries({ queryKey: ["focus"] });
    },
    networkMode: "offlineFirst",
  });

  return { create, update, delete: del, complete, setFocus };
}
