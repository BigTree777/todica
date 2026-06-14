import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { DueDate, Priority, Task } from "@todica/domain/task";
/**
 * 今日ビュー (BL-005 本実装 + BL-001 / BL-002 / BL-003 / BL-006 を統合).
 *
 * - 起票フォーム (タスク名のみ必須, dueDate は "today" 固定, 優先度 = 3 値)
 * - タスク一覧 (各行に 削除 / 明日にする / 完了 + 優先度星を表示 / BL-042)
 * - 現在のタスクの強調セクション (BL-006 / FR-012 / NFR-011)
 *
 * BL-005 / FR-010 / FR-011 / NFR-013 / plan.md D-004:
 *   - 取得は `repository.today()` を使用 (`list()` は使わない).
 *   - サーバが priority → createdAt → id で並べて返すので, クライアント側で再ソートしない.
 *   - 各書き込み mutation (create / update / delete / complete) の成功時に
 *     `repository.today()` を再呼出して tasks / nextTaskId を更新する (plan.md D-007).
 *
 * BL-006 / FR-012 / FR-013 / NFR-011 (plan.md D-001 / D-008):
 *   - 起動時に `repository.getFocus()` を並列フェッチ.
 *   - 強調対象 = `currentTaskId ?? nextTaskId` (暗黙フォールバック).
 *   - 強調セクションのタスクは通常リストに含めない (D-008 重複表示禁止).
 *   - 各 mutation 成功時に `getFocus()` も再フェッチする.
 *
 * BL-042 (task-card-actions):
 *   - カード上のアクションは「削除 / 明日にする / 完了」の 3 ボタンに削減.
 *   - 旧「編集」「現在に設定」「現在解除」 button および編集フォームを撤去.
 *
 * BL-043 (set-focus-gesture) / FR-012:
 *   - `setFocusMutation` / `handleSetFocus` を再導入し, 一覧の各カードに
 *     状態系コントロール「現在のタスクにする」 button を追加 (アクション 3 ボタンのカウント外).
 *   - 解除 UI は提供しない (解除は完了 / 削除 / 期限変更によるサーバ側自動解除のみ. plan D-003).
 *   - 失敗時は notifyError + ["focus"] invalidate で最新 version を取り直す (plan D-005).
 *
 * TanStack Query (useQuery / useMutation) でデータ取得・書込みを管理.
 */
import { useCallback, useState } from "react";
import { notifyError } from "../../error-notification.js";
import "./today-view.css";
import "../day-view/day-view.css";
import { useConflictDialog } from "../../hooks/use-conflict-dialog.js";
import { ConflictError, dequeue, enqueue, findEntryByKey, getAll } from "../../offline-queue.js";
import type { Project, ProjectRepository } from "../../repositories/project-repository.js";
import type {
  CompleteTaskCommand,
  CreateTaskCommand,
  DeleteTaskCommand,
  FocusSelection,
  SetFocusCommand,
  TaskRepository,
  UpdateTaskCommand,
} from "../../repositories/task-repository.js";
import { OptimisticLockError } from "../../repositories/task-repository.js";
import { ConflictDialog } from "../conflict-dialog/conflict-dialog.js";
import { TaskCard } from "../task-card/task-card.js";
import { TaskFormCard } from "../task-card/task-form-card.js";

export interface TodayViewProps {
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

export function TodayView(props: TodayViewProps): JSX.Element {
  const { repository, projectRepository } = props;
  const queryClient = useQueryClient();
  const conflictDialog = useConflictDialog();

  // today() でタスク一覧・nextTaskId・completionCount を取得
  const { data: todayData } = useQuery({
    queryKey: ["today"],
    queryFn: () => repository.today(),
    networkMode: "offlineFirst",
  });
  const tasks = todayData?.tasks ?? [];
  const nextTaskId = todayData?.nextTaskId ?? null;
  const completionCount = todayData?.completionCount ?? 0;

  // getFocus() で現在のフォーカスを取得
  const { data: focus } = useQuery({
    queryKey: ["focus"],
    queryFn: () => repository.getFocus(),
    networkMode: "offlineFirst",
  });

  // プロジェクト一覧を取得
  const { data: projectsData } = useQuery({
    queryKey: ["projects"],
    queryFn: () => projectRepository.list(),
    networkMode: "offlineFirst",
  });
  const projects: Project[] = projectsData ?? [];

  const [name, setName] = useState("");
  const [projectId, setProjectId] = useState("");
  const [priority, setPriority] = useState<Priority>("normal");

  /** mutation 成功時に today / focus を再フェッチする */
  const invalidateAll = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["today"] });
    void queryClient.invalidateQueries({ queryKey: ["focus"] });
  }, [queryClient]);

  const repo = repository as { baseUrl?: string };
  const baseUrl = repo.baseUrl ?? "";

  /** enqueue を安全に呼び出す。IDB が利用できない環境ではエラーを無視する。 */
  const safeEnqueue = async (entry: Parameters<typeof enqueue>[0]) => {
    try {
      await enqueue(entry);
    } catch {
      // IDB が利用できない環境（テスト環境等）ではキューへの保存をスキップ
    }
  };

  /** dequeue を安全に呼び出す。IDB が利用できない環境ではエラーを無視する。 */
  const safeDequeueByKey = async (idempotencyKey: string) => {
    try {
      const all = await getAll();
      const match = all.find((e) => e.idempotencyKey === idempotencyKey);
      if (match?.id !== undefined) await dequeue(match.id);
    } catch {
      // IDB が利用できない環境ではスキップ
    }
  };

  const createMutation = useMutation({
    mutationFn: async (cmd: CreateTaskCommand) => {
      const idempotencyKey = generateId();
      // キューへの書込は非同期で行う（書込完了を待たない）
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
      if (!navigator.onLine) {
        // オフライン時: キューに保存のみ（楽観的に成功を返す）
        return undefined;
      }
      const result = await repository.create(cmd);
      // 成功したら対応キューエントリを削除（非同期・結果は待たない）
      void safeDequeueByKey(idempotencyKey);
      return result;
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

  const updateMutation = useMutation({
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
      if (!navigator.onLine) {
        return undefined;
      }
      try {
        const result = await repository.update(cmd);
        void safeDequeueByKey(idempotencyKey);
        return result;
      } catch (error) {
        // online 412 で repository が OptimisticLockError を throw する.
        // ConflictDialog を開くために queue 内の entry を引いて ConflictError に変換する.
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

  const completeMutation = useMutation({
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
      if (!navigator.onLine) {
        return undefined;
      }
      try {
        const result = await repository.complete(cmd);
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

  // BL-043 / FR-012: 明示 focus 設定 (PUT /api/v1/focus).
  //   - ConflictDialog は task エントリ前提の機構のため FocusSelection には適用しない (plan D-006).
  //   - 失敗時 (412 / ネットワークエラー) も ["focus"] を invalidate して最新 version を
  //     取り直し, 再試行可能にする (plan D-005. 旧 BL-006 実装からの改善点).
  const setFocusMutation = useMutation({
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
      if (!navigator.onLine) {
        return undefined;
      }
      const result = await repository.setFocus(cmd);
      void safeDequeueByKey(idempotencyKey);
      return result;
    },
    onSuccess: invalidateAll,
    onError: () => {
      notifyError("通信に失敗しました");
      void queryClient.invalidateQueries({ queryKey: ["focus"] });
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
        dueDate: "today",
        priority,
      };
      await createMutation.mutateAsync(cmd);
      setName("");
      setProjectId("");
      setPriority("normal");
    },
    [name, projectId, priority, createMutation],
  );

  const handleToggleDueDate = useCallback(
    async (task: Task) => {
      const next: DueDate = task.dueDate === "today" ? "tomorrow" : "today";
      const cmd: UpdateTaskCommand = {
        id: task.id,
        ifMatch: task.version,
        patch: { dueDate: next },
      };
      await updateMutation.mutateAsync(cmd);
    },
    [updateMutation],
  );

  const handleDelete = useCallback(
    async (task: Task) => {
      const cmd: DeleteTaskCommand = { id: task.id, ifMatch: task.version };
      await deleteMutation.mutateAsync(cmd);
    },
    [deleteMutation],
  );

  const handleComplete = useCallback(
    async (task: Task) => {
      const cmd: CompleteTaskCommand = { id: task.id, ifMatch: task.version };
      await completeMutation.mutateAsync(cmd);
    },
    [completeMutation],
  );

  // BL-040 / AC-5 / AC-6 / AC-10: タップで直接 priority 値に飛ばす.
  //   - cycle ロジックは不要 (`<PriorityStars />` が「クリックされた星」に対応する値を返す).
  //   - 同値クリックは `<PriorityStars />` 側で no-op になるため, ここに来た時点で next !== task.priority.
  const handleSetPriority = useCallback(
    async (task: Task, next: Priority) => {
      if (task.priority === next) return; // 二重ガード (AC-6).
      const cmd: UpdateTaskCommand = {
        id: task.id,
        ifMatch: task.version,
        patch: { priority: next },
      };
      await updateMutation.mutateAsync(cmd);
    },
    [updateMutation],
  );

  // BL-070 REQ-9 / D-001 / D-002: name 編集は input blur 経由.
  //   - 空文字 → 短絡 (元値復元 / D-002).
  //   - 同値 → 短絡 (PATCH 抑制 / D-001).
  //   - 実値変更時のみ updateMutation を呼ぶ.
  // 失敗時の通知は onError で処理済み. mutateAsync の reject を try/catch で吸収して
  // unhandled rejection を防ぐ.
  const handleNameBlur = useCallback(
    async (task: Task, next: string) => {
      if (next === "" || next === task.name) return;
      const cmd: UpdateTaskCommand = {
        id: task.id,
        ifMatch: task.version,
        patch: { name: next },
      };
      try {
        await updateMutation.mutateAsync(cmd);
      } catch {
        // onError で処理済み.
      }
    },
    [updateMutation],
  );

  // BL-043 / FR-012: 一覧カードの「現在のタスクにする」.
  //   - FocusSelection 未ロード中は no-op (spec REQ-2. 旧 BL-006 実装の踏襲).
  //   - 解除用の null 引数経路は実装しない (spec REQ-4 / plan D-003).
  const handleSetFocus = useCallback(
    async (taskId: string) => {
      if (!focus) return;
      const cmd: SetFocusCommand = { taskId, ifMatch: focus.version };
      await setFocusMutation.mutateAsync(cmd);
    },
    [focus, setFocusMutation],
  );

  // 強調対象 = currentTaskId ?? nextTaskId (plan.md D-001 暗黙フォールバック).
  const focusData = focus as FocusSelection | undefined;
  const focusedId: string | null = focusData?.currentTaskId ?? nextTaskId;
  const focusedTask: Task | null = focusedId
    ? (tasks.find((t) => t.id === focusedId) ?? null)
    : null;
  // 通常リストから強調対象を除外 (D-008 重複表示禁止).
  const otherTasks = focusedTask ? tasks.filter((t) => t.id !== focusedTask.id) : tasks;

  return (
    <main className="day-view">
      {/* BL-050 / spec REQ-1: ヘッダ領域には <h1>今日</h1> と
          「今日の完了タスク数」カウンタの 2 要素のみを配置する
          (BL-044 で導入したインライン「＋プロジェクトの追加」button は撤去).
          BL-047 / REQ-1 / REQ-2: カウンタは header 内に置く.
          BL-051 / REQ-2: header の className を共通 day-view__header に統一. */}
      <header className="day-view__header">
        <h1>今日</h1>
        {/* BL-008 / FR-040 / NFR-013: 今日の完了タスク数を画面上部に常時表示する.
            BL-047 / REQ-2: <div> から <span> に変更し, header 内に配置する.
            plan.md §UI 設計 D-008: 楽観 UI を持たず, サーバ正本値 (completionCount) を
            再フェッチで反映する. */}
        <span className="today-view__completion-count" aria-label="今日の完了タスク数">
          今日の完了: {completionCount}
        </span>
      </header>

      {/* 現在のタスク強調セクション (NFR-011 "大きく単独で表示").
          BL-059 / REQ-4 / V-5: 旧 h2 見出しは撤去. landmark は section の aria-label で維持.
          BL-059 / REQ-4: <TaskCard as="section" variant="focus" /> に置換 (focusedTask 用). */}
      {focusedTask &&
        (() => {
          const focusedProject = focusedTask.projectId
            ? (projects.find((p) => p.id === focusedTask.projectId) ?? null)
            : null;
          return (
            <TaskCard
              as="section"
              variant="focus"
              aria-label="現在のタスク"
              task={focusedTask}
              project={focusedProject}
              showPriority
              showSetFocus={false}
              actionSet="full"
              dueDateMode="today"
              onNameBlur={(next) => handleNameBlur(focusedTask, next)}
              onSetPriority={(next) => handleSetPriority(focusedTask, next)}
              onDelete={() => handleDelete(focusedTask)}
              onToggleDueDate={() => handleToggleDueDate(focusedTask)}
              onComplete={() => handleComplete(focusedTask)}
            />
          );
        })()}

      {/* BL-059 / REQ-4-4: 起票フォームを <TaskFormCard> に置換 (V-6 / V-7 反映). */}
      <TaskFormCard
        projects={projects}
        projectId={projectId}
        onProjectIdChange={setProjectId}
        priority={priority}
        onPriorityChange={setPriority}
        name={name}
        onNameChange={setName}
        onSubmit={handleCreate}
        idPrefix="create"
        inputId="task-name"
        formAriaLabel="タスク起票フォーム"
      />

      <ul aria-label="タスク一覧" className="day-view__list">
        {otherTasks.map((task) => {
          const project = task.projectId
            ? (projects.find((p) => p.id === task.projectId) ?? null)
            : null;
          return (
            <TaskCard
              key={task.id}
              as="li"
              variant="default"
              task={task}
              project={project}
              showPriority
              showSetFocus
              actionSet="full"
              dueDateMode="today"
              onNameBlur={(next) => handleNameBlur(task, next)}
              onSetPriority={(next) => handleSetPriority(task, next)}
              onSetFocus={() => handleSetFocus(task.id)}
              onDelete={() => handleDelete(task)}
              onToggleDueDate={() => handleToggleDueDate(task)}
              onComplete={() => handleComplete(task)}
            />
          );
        })}
      </ul>

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
