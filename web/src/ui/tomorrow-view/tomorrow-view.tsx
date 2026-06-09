/**
 * 「明日のタスク」独立ビュー (BL-038 / tomorrow-view).
 *
 * 仕様参照:
 *   docs/developer/features/tomorrow-view/spec.md REQ-1〜REQ-7.
 *   docs/developer/features/tomorrow-view/plan.md §「TomorrowView コンポーネント設計」.
 *
 * 役割:
 *   - `/tomorrow` ルートで `dueDate=tomorrow` のタスクを優先度順で一覧表示する.
 *   - 起票フォーム: タスク名 / プロジェクト / 優先度 / 追加 の 4 要素 (期限 UI なし).
 *   - 各カードのアクションは「削除」「今日にする」の 2 ボタン (REQ-3).
 *   - 「今日にする」は `PATCH /api/v1/tasks/:id { dueDate: "today" }` を発行 (FR-014 逆方向).
 *   - 「削除」は `DELETE /api/v1/tasks/:id` で論理削除 (BL-001 / BL-012).
 *   - 空状態は「明日のタスクはありません」テキスト. 起票フォームは表示し続ける.
 *
 * 重要な決定 (plan.md):
 *   - D-003: query key を `["tomorrow"]` とする (today ビューの `["today"]` と対称).
 *   - D-004: 「今日にする」成功時は `["tomorrow"]` / `["today"]` / `["focus"]` を invalidate.
 *   - D-005: 起票成功時は `["tomorrow"]` のみ invalidate.
 *   - D-006: 削除成功時は `["tomorrow"]` のみ invalidate (明日タスクは focus 対象外).
 *   - D-012: 起票時 dueDate = "tomorrow" 固定 (UI には出さない).
 *
 * エラー処理:
 *   - online 412 (`OptimisticLockError`) → `ConflictError` に変換し `ConflictDialog` を開く (BL-031).
 *   - その他のエラー → `notifyError("通信に失敗しました")` (BL-034).
 *   - offline → 書込キューに enqueue し楽観成功 (BL-018).
 */
import { useCallback, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Priority, Task } from "@todica/domain/task";
import type {
  CreateTaskCommand,
  DeleteTaskCommand,
  TaskRepository,
  UpdateTaskCommand,
} from "../../repositories/task-repository.js";
import { OptimisticLockError } from "../../repositories/task-repository.js";
import type {
  Project,
  ProjectRepository,
} from "../../repositories/project-repository.js";
import {
  enqueue,
  dequeue,
  getAll,
  findEntryByKey,
  ConflictError,
} from "../../offline-queue.js";
import { notifyError } from "../../error-notification.js";
import { useConflictDialog } from "../../hooks/use-conflict-dialog.js";
import { ConflictDialog } from "../conflict-dialog/conflict-dialog.js";
import { PriorityStars } from "../priority-stars/priority-stars.js";
import "./tomorrow-view.css";

export interface TomorrowViewProps {
  repository: TaskRepository;
  projectRepository: ProjectRepository;
}

/** UUID v4 風の文字列を生成する. crypto.randomUUID が無い jsdom 環境向けのフォールバック. */
function generateId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  const random = (n: number) => Math.floor(Math.random() * n);
  const hex = (n: number) =>
    Array.from({ length: n }, () => random(16).toString(16)).join("");
  return `${hex(8)}-${hex(4)}-4${hex(3)}-8${hex(3)}-${hex(12)}`;
}

/** repository の baseUrl/authToken を安全に取り出す型. */
interface HasBaseUrlAndToken {
  baseUrl?: string;
  authToken?: string;
}

export function TomorrowView(props: TomorrowViewProps): JSX.Element {
  const { repository, projectRepository } = props;
  const queryClient = useQueryClient();
  const conflictDialog = useConflictDialog();

  // D-003: query key を ["tomorrow"] とする. dueDate=tomorrow をサーバ側で絞り込む.
  const { data: tasksData } = useQuery({
    queryKey: ["tomorrow"],
    queryFn: () => repository.list({ dueDate: "tomorrow" }),
    networkMode: "offlineFirst",
  });
  const tasks: Task[] = tasksData ?? [];

  // 起票フォーム用のプロジェクト一覧 + カード行の project 名表示用.
  const { data: projectsData } = useQuery({
    queryKey: ["projects"],
    queryFn: () => projectRepository.list(),
    networkMode: "offlineFirst",
  });
  const projects: Project[] = projectsData ?? [];

  // フォーム state (期限 state は持たない / D-012).
  const [name, setName] = useState("");
  const [projectId, setProjectId] = useState("");
  const [priority, setPriority] = useState<Priority>("normal");

  // 起票成功時: ["tomorrow"] のみ invalidate (D-005).
  const invalidateTomorrow = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["tomorrow"] });
  }, [queryClient]);

  // 「今日にする」成功時: ["tomorrow"] / ["today"] / ["focus"] を invalidate (D-004).
  const invalidateAfterMoveToToday = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["tomorrow"] });
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

  const createMutation = useMutation({
    mutationFn: async (cmd: CreateTaskCommand) => {
      const idempotencyKey = generateId();
      void safeEnqueue({
        url: `${baseUrl}/api/v1/tasks`,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({ ...cmd }),
        idempotencyKey,
      });
      if (!navigator.onLine) {
        return undefined;
      }
      try {
        const result = await repository.create(cmd);
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
    onSuccess: invalidateTomorrow,
    onError: (error) => {
      if (error instanceof ConflictError) {
        conflictDialog.openDialog(error.entry, error.serverValue);
        return;
      }
      notifyError("通信に失敗しました");
    },
    networkMode: "offlineFirst",
  });

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
    onSuccess: invalidateAfterMoveToToday,
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
    onSuccess: invalidateTomorrow,
    onError: (error) => {
      if (error instanceof ConflictError) {
        conflictDialog.openDialog(error.entry, error.serverValue);
        return;
      }
      notifyError("通信に失敗しました");
    },
    networkMode: "offlineFirst",
  });

  const handleCreate = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!name) return;
      const cmd: CreateTaskCommand = {
        id: generateId(),
        name,
        projectId: projectId ? projectId : null,
        // D-012: dueDate は "tomorrow" 固定 (UI には出さない).
        dueDate: "tomorrow",
        priority,
      };
      try {
        await createMutation.mutateAsync(cmd);
      } catch {
        // 失敗時の通知は onError で処理済み. unhandled rejection を抑制する.
      }
      setName("");
      setProjectId("");
      setPriority("normal");
    },
    [name, projectId, priority, createMutation],
  );

  const handleMoveToToday = useCallback(
    (task: Task) => {
      const cmd: UpdateTaskCommand = {
        id: task.id,
        ifMatch: task.version,
        patch: { dueDate: "today" },
      };
      // mutate は onError で例外を処理する. mutate なら戻りの promise を待たない.
      updateMutation.mutate(cmd);
    },
    [updateMutation],
  );

  const handleDelete = useCallback(
    (task: Task) => {
      const cmd: DeleteTaskCommand = {
        id: task.id,
        ifMatch: task.version,
      };
      deleteMutation.mutate(cmd);
    },
    [deleteMutation],
  );

  return (
    <section aria-label="明日のタスク" className="tomorrow-view">
      <h1>明日のタスク</h1>

      <form
        onSubmit={handleCreate}
        aria-label="明日のタスク起票フォーム"
        className="tomorrow-view__form"
      >
        <div>
          <label htmlFor="tomorrow-task-name">タスク名</label>
          <input
            id="tomorrow-task-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <div>
          <label htmlFor="tomorrow-task-project">プロジェクト (任意)</label>
          <select
            id="tomorrow-task-project"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
          >
            <option value="">（未分類）</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        {/* BL-040 / AC-4: <select id="tomorrow-task-priority"> を撤去し, 星 UI に置き換える. */}
        <div>
          <span id="tomorrow-task-priority-label">優先度</span>
          <PriorityStars
            value={priority}
            onChange={setPriority}
            groupLabel="優先度"
            idPrefix="tomorrow-create"
          />
        </div>
        <button type="submit">追加</button>
      </form>

      {/* REQ-6: 空状態は <ul> の外に出し, listitem role と分離する.
          (テストは tasks > 0 のときだけ listitem 数を assert する想定.) */}
      {tasks.length === 0 && (
        <p className="tomorrow-view__empty">明日のタスクはありません</p>
      )}

      <ul aria-label="明日のタスク一覧" className="tomorrow-view__list">
        {tasks.length === 0 ? null : (
          tasks.map((task) => {
            const project = task.projectId
              ? projects.find((p) => p.id === task.projectId) ?? null
              : null;
            return (
              <li key={task.id} className="tomorrow-view__item">
                <div className="tomorrow-view__item-body">
                  {project && (
                    <span className="tomorrow-view__project">{project.name}</span>
                  )}
                  <span className="tomorrow-view__name">{task.name}</span>
                  {/* BL-040 / plan D-004: [優先度: ...] 補助表示は撤去.
                      tomorrow カードは「削除」「今日にする」のみ (BL-038 REQ-3) で,
                      優先度 UI 自体を持たないため, ここでは何も描画しない. */}
                </div>
                <div className="tomorrow-view__actions">
                  <button type="button" onClick={() => handleDelete(task)}>
                    削除
                  </button>
                  <button type="button" onClick={() => handleMoveToToday(task)}>
                    今日にする
                  </button>
                </div>
              </li>
            );
          })
        )}
      </ul>

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
