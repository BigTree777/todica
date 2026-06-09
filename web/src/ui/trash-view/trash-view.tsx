/**
 * ゴミ箱ビュー (BL-014 / web-client-foundation).
 *
 * 仕様参照:
 *   - docs/developer/features/web-client-foundation/spec.md §「TrashView」
 *   - docs/developer/features/web-client-foundation/plan.md §D-004 §D-005
 *
 * 機能:
 *   - マウント時に repository.list() でゴミ箱のタスク一覧を取得して表示.
 *   - タスクが 0 件のとき「ゴミ箱は空です」を表示.
 *   - 各タスク行に「復元」ボタン → repository.restore() → 一覧再取得.
 *   - 「ゴミ箱を空にする」ボタン → repository.empty() → 一覧再取得.
 *
 * BL-018: TanStack Query (useQuery / useMutation) + 書込キュー統合.
 */
import { useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { TrashRepository, TrashedTask } from "../../repositories/trash-repository.js";
import { RestoreConflictError } from "../../repositories/trash-repository.js";
import { enqueue, dequeue, getAll, mapConflict, ConflictError } from "../../offline-queue.js";
import { useConflictDialog } from "../../hooks/use-conflict-dialog.js";
import { ConflictDialog } from "../conflict-dialog/conflict-dialog.js";

interface HasBaseUrlAndToken {
  baseUrl?: string;
  authToken?: string;
}

function generateId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  const random = (n: number) => Math.floor(Math.random() * n);
  const hex = (n: number) =>
    Array.from({ length: n }, () => random(16).toString(16)).join("");
  return `${hex(8)}-${hex(4)}-4${hex(3)}-8${hex(3)}-${hex(12)}`;
}

export interface TrashViewProps {
  repository: TrashRepository;
}

export function TrashView(props: TrashViewProps): JSX.Element {
  const { repository } = props;
  const queryClient = useQueryClient();
  const conflictDialog = useConflictDialog();

  const repo = repository as unknown as HasBaseUrlAndToken;
  const baseUrl = repo.baseUrl ?? "";
  const authToken = repo.authToken ?? "";

  const { data: tasksData } = useQuery({
    queryKey: ["trash"],
    queryFn: () => repository.list(),
    networkMode: "offlineFirst",
  });
  const tasks: TrashedTask[] = tasksData ?? [];

  const invalidateTrash = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["trash"] });
    void queryClient.invalidateQueries({ queryKey: ["today"] });
  }, [queryClient]);

  const safeEnqueue = async (entry: Parameters<typeof enqueue>[0]) => {
    try {
      await enqueue(entry);
    } catch {
      // IDB が利用できない環境ではスキップ
    }
  };

  const safeDequeueByKey = async (idempotencyKey: string) => {
    try {
      const all = await getAll();
      const match = all.find((e) => e.idempotencyKey === idempotencyKey);
      if (match?.id !== undefined) await dequeue(match.id);
    } catch {
      // IDB が利用できない環境ではスキップ
    }
  };

  const restoreMutation = useMutation({
    mutationFn: async (cmd: { id: string; ifMatch: number }) => {
      const idempotencyKey = generateId();
      void safeEnqueue({
        url: `${baseUrl}/api/v1/trash/${cmd.id}/restore`,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
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
        (err) => (err instanceof RestoreConflictError ? err.currentTask : undefined),
      );
      void safeDequeueByKey(idempotencyKey);
      return result;
    },
    onSuccess: invalidateTrash,
    onError: (error) => {
      if (error instanceof ConflictError) {
        conflictDialog.openDialog(error.entry, error.serverValue);
      }
    },
    networkMode: "offlineFirst",
  });

  const emptyMutation = useMutation({
    mutationFn: async () => {
      const idempotencyKey = generateId();
      void safeEnqueue({
        url: `${baseUrl}/api/v1/trash`,
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${authToken}`,
          "Idempotency-Key": idempotencyKey,
        },
        body: null,
        idempotencyKey,
      });
      if (!navigator.onLine) return undefined;
      await repository.empty();
      void safeDequeueByKey(idempotencyKey);
    },
    onSuccess: invalidateTrash,
    networkMode: "offlineFirst",
  });

  const handleRestore = useCallback(
    async (task: TrashedTask) => {
      await restoreMutation.mutateAsync({ id: task.id, ifMatch: task.version });
    },
    [restoreMutation],
  );

  const handleEmpty = useCallback(async () => {
    await emptyMutation.mutateAsync();
  }, [emptyMutation]);

  return (
    <main>
      <h1>ゴミ箱</h1>

      <button type="button" onClick={handleEmpty}>
        ゴミ箱を空にする
      </button>

      {tasks.length === 0 ? (
        <p>ゴミ箱は空です</p>
      ) : (
        <ul aria-label="ゴミ箱のタスク一覧">
          {tasks.map((task) => (
            <li key={task.id}>
              <span>{task.name}</span>
              <button type="button" onClick={() => handleRestore(task)}>
                復元
              </button>
            </li>
          ))}
        </ul>
      )}

      <ConflictDialog
        open={conflictDialog.dialogState.open}
        localValue={conflictDialog.dialogState.localValue}
        serverValue={conflictDialog.dialogState.serverValue}
        onAcceptServer={conflictDialog.onAcceptServer}
        onRetryWithServer={conflictDialog.onRetryWithServer}
      />
    </main>
  );
}
