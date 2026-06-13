import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Task } from "@todica/domain/task";
/**
 * 「現在のタスク」独立ビュー .
 *
 * 仕様参照:
 *   docs/developer/features/focus-view/spec.md REQ-1〜REQ-8.
 *   docs/developer/features/focus-view/plan.md §「FocusView コンポーネント設計」.
 *
 * 役割:
 *   - `/focus` ルートでフォーカス対象 (currentTaskId ?? nextTaskId) を単独大表示する.
 *   - アクションは「削除」「完了」の 2 ボタンのみ (REQ-4).
 *   - 起票フォーム / 編集 / 優先度切替 / 期限切替 / 「現在解除」/「現在に設定」は出さない.
 *   - フォーカス対象が無い時は枠だけ残し中央に「現在のタスクはありません」を表示 (REQ-2).
 *
 * 重要な決定:
 *   - D-001: `setFocus` を呼ばない. 自動解除はサーバ側 (FR-013 / BL-006 `clearFocusIfMatches`) に委ねる.
 *   - D-002: 暗黙フォールバック `focusData.currentTaskId ?? nextTaskId` で対象を決定 (今日ビューと同じ).
 *   - D-003: query key (`["today"]` / `["focus"]` / `["projects"]`) を今日ビューと共有.
 *   - D-008: 空状態でボタンは「非表示」(押下経路を絶つ).
 *
 * エラー処理:
 *   - online 412 (`OptimisticLockError`) → `ConflictError` に変換し `ConflictDialog` を開く .
 *   - その他のエラー → `notifyError("通信に失敗しました")` .
 *   - offline → 書込キューに enqueue し楽観成功 .
 */
import { useCallback } from "react";
import { notifyError } from "../../error-notification.js";
import { useConflictDialog } from "../../hooks/use-conflict-dialog.js";
import { ConflictError, dequeue, enqueue, findEntryByKey, getAll } from "../../offline-queue.js";
import type { Project, ProjectRepository } from "../../repositories/project-repository.js";
import type {
  CompleteTaskCommand,
  DeleteTaskCommand,
  FocusSelection,
  TaskRepository,
  UpdateTaskCommand,
} from "../../repositories/task-repository.js";
import { OptimisticLockError } from "../../repositories/task-repository.js";
import { ConflictDialog } from "../conflict-dialog/conflict-dialog.js";
import { TaskCard } from "../task-card/task-card.js";
import "./focus-view.css";

export interface FocusViewProps {
  repository: TaskRepository;
  projectRepository: ProjectRepository;
}

/** UUID v4 風の文字列を生成する. crypto.randomUUID が無い jsdom 環境向けのフォールバック. */
function generateId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  const random = (n: number) => Math.floor(Math.random() * n);
  const hex = (n: number) => Array.from({ length: n }, () => random(16).toString(16)).join("");
  return `${hex(8)}-${hex(4)}-4${hex(3)}-8${hex(3)}-${hex(12)}`;
}

/** repository の baseUrl/authToken を安全に取り出す型. */
interface HasBaseUrlAndToken {
  baseUrl?: string;
  authToken?: string;
}

export function FocusView(props: FocusViewProps): JSX.Element {
  const { repository, projectRepository } = props;
  const queryClient = useQueryClient();
  const conflictDialog = useConflictDialog();

  // D-003: today / focus / projects を今日ビューと同じ query key で取得.
  const { data: todayData } = useQuery({
    queryKey: ["today"],
    queryFn: () => repository.today(),
    networkMode: "offlineFirst",
  });
  const { data: focus } = useQuery({
    queryKey: ["focus"],
    queryFn: () => repository.getFocus(),
    networkMode: "offlineFirst",
  });
  const { data: projectsData } = useQuery({
    queryKey: ["projects"],
    queryFn: () => projectRepository.list(),
    networkMode: "offlineFirst",
  });

  const tasks = todayData?.tasks ?? [];
  const nextTaskId = todayData?.nextTaskId ?? null;
  const focusData = focus as FocusSelection | undefined;
  // D-002: 暗黙フォールバック.
  const focusedId: string | null = focusData?.currentTaskId ?? nextTaskId;
  const focusedTask: Task | null = focusedId
    ? (tasks.find((t) => t.id === focusedId) ?? null)
    : null;
  const project: Project | null = focusedTask?.projectId
    ? ((projectsData ?? []).find((p) => p.id === focusedTask.projectId) ?? null)
    : null;

  /** mutation 成功時に today / focus を再フェッチ. */
  const invalidateAll = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["today"] });
    void queryClient.invalidateQueries({ queryKey: ["focus"] });
  }, [queryClient]);

  const repo = repository as unknown as HasBaseUrlAndToken;
  const baseUrl = repo.baseUrl ?? "";
  const authToken = repo.authToken ?? "";

  /** enqueue を安全に呼び出す. IDB 不可環境ではエラーを無視. */
  const safeEnqueue = async (entry: Parameters<typeof enqueue>[0]) => {
    try {
      await enqueue(entry);
    } catch {
      // IDB が利用できない環境 (テスト等) ではスキップ.
    }
  };

  /** dequeue を安全に呼び出す. */
  const safeDequeueByKey = async (idempotencyKey: string) => {
    try {
      const all = await getAll();
      const match = all.find((e) => e.idempotencyKey === idempotencyKey);
      if (match?.id !== undefined) await dequeue(match.id);
    } catch {
      // IDB が利用できない環境ではスキップ.
    }
  };

  const completeMutation = useMutation({
    mutationFn: async (cmd: CompleteTaskCommand) => {
      const idempotencyKey = generateId();
      void safeEnqueue({
        url: `${baseUrl}/api/v1/tasks/${cmd.id}/complete`,
        method: "POST",
        headers: {
          Authorization: `Bearer ${authToken}`,
          "Idempotency-Key": idempotencyKey,
          "If-Match": String(cmd.ifMatch),
        },
        body: null,
        idempotencyKey,
      });
      if (!navigator.onLine) {
        return undefined;
      }
      try {
        const result = await repository.complete(cmd);
        void safeDequeueByKey(idempotencyKey);
        return result;
      } catch (error) {
        // online 412 → OptimisticLockError → ConflictError 変換.
        if (error instanceof OptimisticLockError) {
          const entry = await findEntryByKey(idempotencyKey);
          if (entry) throw new ConflictError(entry, error.currentTask ?? {});
        }
        throw error;
      }
    },
    onSuccess: invalidateAll,
    onError: (error) => {
      if (error instanceof ConflictError) {
        conflictDialog.openDialog(error.entry, error.serverValue);
        return;
      }
      notifyError("通信に失敗しました");
    },
    networkMode: "offlineFirst",
  });

  // REQ-9: focus-view でも name 編集経路を提供. 既存 complete/delete と同形.
  const updateMutation = useMutation({
    mutationFn: async (cmd: UpdateTaskCommand) => {
      const idempotencyKey = generateId();
      void safeEnqueue({
        url: `${baseUrl}/api/v1/tasks/${cmd.id}`,
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
          "Idempotency-Key": idempotencyKey,
          "If-Match": String(cmd.ifMatch),
        },
        body: JSON.stringify(cmd.patch),
        idempotencyKey,
      });
      if (!navigator.onLine) {
        return undefined;
      }
      try {
        const result = await repository.update(cmd);
        void safeDequeueByKey(idempotencyKey);
        return result;
      } catch (error) {
        if (error instanceof OptimisticLockError) {
          const entry = await findEntryByKey(idempotencyKey);
          if (entry) throw new ConflictError(entry, error.currentTask ?? {});
        }
        throw error;
      }
    },
    onSuccess: invalidateAll,
    onError: (error) => {
      if (error instanceof ConflictError) {
        conflictDialog.openDialog(error.entry, error.serverValue);
        return;
      }
      notifyError("通信に失敗しました");
    },
    networkMode: "offlineFirst",
  });

  const deleteMutation = useMutation({
    mutationFn: async (cmd: DeleteTaskCommand) => {
      const idempotencyKey = generateId();
      void safeEnqueue({
        url: `${baseUrl}/api/v1/tasks/${cmd.id}`,
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${authToken}`,
          "Idempotency-Key": idempotencyKey,
          "If-Match": String(cmd.ifMatch),
        },
        body: null,
        idempotencyKey,
      });
      if (!navigator.onLine) {
        return undefined;
      }
      try {
        const result = await repository.delete(cmd);
        void safeDequeueByKey(idempotencyKey);
        return result;
      } catch (error) {
        if (error instanceof OptimisticLockError) {
          const entry = await findEntryByKey(idempotencyKey);
          if (entry) throw new ConflictError(entry, error.currentTask ?? {});
        }
        throw error;
      }
    },
    onSuccess: invalidateAll,
    onError: (error) => {
      if (error instanceof ConflictError) {
        conflictDialog.openDialog(error.entry, error.serverValue);
        return;
      }
      notifyError("通信に失敗しました");
    },
    networkMode: "offlineFirst",
  });

  const handleComplete = useCallback(() => {
    if (!focusedTask) return;
    const cmd: CompleteTaskCommand = {
      id: focusedTask.id,
      ifMatch: focusedTask.version,
    };
    // 失敗は mutation の onError (ConflictDialog / notifyError) で処理済み.
    // 呼び出し側ではエラーを無視して unhandled rejection を防ぐ.
    completeMutation.mutate(cmd);
  }, [focusedTask, completeMutation]);

  // BL-070 REQ-9 / D-001 / D-002: name 編集は input blur 経由.
  // 失敗時の通知は onError で処理済み. mutateAsync の reject を try/catch で吸収して
  // unhandled rejection を防ぐ.
  const handleNameBlur = useCallback(
    async (next: string) => {
      if (!focusedTask) return;
      if (next === "" || next === focusedTask.name) return;
      const cmd: UpdateTaskCommand = {
        id: focusedTask.id,
        ifMatch: focusedTask.version,
        patch: { name: next },
      };
      try {
        await updateMutation.mutateAsync(cmd);
      } catch {
        // onError で処理済み.
      }
    },
    [focusedTask, updateMutation],
  );

  const handleDelete = useCallback(() => {
    if (!focusedTask) return;
    const cmd: DeleteTaskCommand = {
      id: focusedTask.id,
      ifMatch: focusedTask.version,
    };
    deleteMutation.mutate(cmd);
  }, [focusedTask, deleteMutation]);

  return (
    <section aria-label="現在のタスク" className="focus-view">
      <h1>現在のタスク</h1>
      {/* BL-059 / REQ-6: focusedTask があれば <TaskCard variant="focus" actionSet="minimal" />.
          無ければ「現在のタスクはありません」placeholder を維持 (D-007 / 空状態維持). */}
      {focusedTask ? (
        <TaskCard
          as="div"
          variant="focus"
          task={focusedTask}
          project={project}
          showPriority={false}
          showSetFocus={false}
          actionSet="minimal"
          onNameBlur={handleNameBlur}
          onDelete={handleDelete}
          onComplete={handleComplete}
        />
      ) : (
        <div className="focus-view__empty">現在のタスクはありません</div>
      )}
      <ConflictDialog
        open={conflictDialog.dialogState.open}
        localValue={conflictDialog.dialogState.localValue}
        serverValue={conflictDialog.dialogState.serverValue}
        onAcceptServer={conflictDialog.onAcceptServer}
        onRetryWithServer={conflictDialog.onRetryWithServer}
      />
    </section>
  );
}
