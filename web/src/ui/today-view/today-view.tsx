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
 * BL-018: TanStack Query (useQuery / useMutation) でデータ取得・書込みを管理.
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
import { PriorityStars } from "../priority-stars/priority-stars.js";
import { ProjectToggle } from "../project-toggle/project-toggle.js";

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

/** repository の baseUrl/authToken を安全に取り出す型 */
interface HasBaseUrlAndToken {
  baseUrl?: string;
  authToken?: string;
}

export function TodayView(props: TodayViewProps): JSX.Element {
  const { repository, projectRepository } = props;
  const queryClient = useQueryClient();
  const conflictDialog = useConflictDialog();

  // BL-005: today() でタスク一覧・nextTaskId・completionCount を取得
  const { data: todayData } = useQuery({
    queryKey: ["today"],
    queryFn: () => repository.today(),
    networkMode: "offlineFirst",
  });
  const tasks = todayData?.tasks ?? [];
  const nextTaskId = todayData?.nextTaskId ?? null;
  const completionCount = todayData?.completionCount ?? 0;

  // BL-006: getFocus() で現在のフォーカスを取得
  const { data: focus } = useQuery({
    queryKey: ["focus"],
    queryFn: () => repository.getFocus(),
    networkMode: "offlineFirst",
  });

  // BL-016: プロジェクト一覧を取得
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

  const repo = repository as unknown as HasBaseUrlAndToken;
  const baseUrl = repo.baseUrl ?? "";
  const authToken = repo.authToken ?? "";

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
          Authorization: `Bearer ${authToken}`,
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
        // BL-031 (a): online 412 で repository が OptimisticLockError を throw する.
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
          Authorization: `Bearer ${authToken}`,
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

  // BL-006: 強調対象 = currentTaskId ?? nextTaskId (plan.md D-001 暗黙フォールバック).
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

      {/* BL-006: 現在のタスク強調セクション (NFR-011 "大きく単独で表示").
          BL-040 / AC-10: 旧 cycle ボタン + [優先度: ...] 文字表示を撤去し
          <PriorityStars /> に置き換える.
          BL-042: アクションは「削除」「明日にする」「完了」の 3 ボタンのみに削減
          (編集 / 現在解除 を撤去, ラベルを「明日にする」に統一).
          BL-051 / REQ-3 / D-002: 起票フォームより前 (= header 直後 / 2 段目) に配置.
          BL-051 / REQ-3: section に共通カードクラス day-view__card と強調 variant
          day-view__card--focus を付与. */}
      {focusedTask &&
        (() => {
          const focusedProject = focusedTask.projectId
            ? (projects.find((p) => p.id === focusedTask.projectId) ?? null)
            : null;
          return (
            <section aria-label="現在のタスク" className="day-view__card day-view__card--focus">
              <h2>現在のタスク</h2>
              <div>
                {focusedProject && <span className="project-chip">{focusedProject.name}</span>}
                <span>{focusedTask.name}</span>
                <PriorityStars
                  value={focusedTask.priority}
                  onChange={(next) => handleSetPriority(focusedTask, next)}
                  groupLabel={`${focusedTask.name} の優先度`}
                  idPrefix={`task-${focusedTask.id}`}
                />
                <button type="button" onClick={() => handleDelete(focusedTask)}>
                  削除
                </button>
                {/* BL-017 / FR-033: origin が "routine" でない場合のみ期限切替ボタンを表示.
                BL-042: ラベルは「明日にする / 今日にする」に統一. */}
                {focusedTask.origin !== "routine" && (
                  <button type="button" onClick={() => handleToggleDueDate(focusedTask)}>
                    {focusedTask.dueDate === "today" ? "明日にする" : "今日にする"}
                  </button>
                )}
                <button type="button" onClick={() => handleComplete(focusedTask)}>
                  完了
                </button>
              </div>
            </section>
          );
        })()}

      <form onSubmit={handleCreate} aria-label="タスク起票フォーム" className="day-view__form">
        <div>
          <label htmlFor="task-name">タスク名</label>
          <input
            id="task-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <div>
          {/*
            BL-041 / AC-1 / AC-2 / AC-3 / AC-4:
            <select id="task-project"> を撤去し, <ProjectToggle /> に置き換える.
            親 state (useState("")) との境界で "" ↔ null を変換する (plan D-004).
          */}
          <ProjectToggle
            value={projectId === "" ? null : projectId}
            onChange={(next) => setProjectId(next ?? "")}
            projects={projects}
            idPrefix="create"
            groupLabel="プロジェクト"
          />
        </div>
        {/* BL-040 / AC-1: <select id="task-priority"> を撤去し, 星 UI に置き換える. */}
        <div>
          <span id="task-priority-label">優先度</span>
          <PriorityStars
            value={priority}
            onChange={setPriority}
            groupLabel="優先度"
            idPrefix="create"
          />
        </div>
        <button type="submit">追加</button>
      </form>

      <ul aria-label="タスク一覧" className="day-view__list">
        {otherTasks.map((task) => {
          const project = task.projectId
            ? (projects.find((p) => p.id === task.projectId) ?? null)
            : null;
          return (
            <li key={task.id} className="day-view__card">
              {project && <span className="project-chip">{project.name}</span>}
              <span>{task.name}</span>
              {/* BL-040 / AC-5 / AC-7: 旧 cycle ボタン + [優先度: ...] 文字表示を撤去し
                <PriorityStars /> に置き換える. */}
              <PriorityStars
                value={task.priority}
                onChange={(next) => handleSetPriority(task, next)}
                groupLabel={`${task.name} の優先度`}
                idPrefix={`task-${task.id}`}
              />
              {/* BL-043 / FR-012: 状態系コントロール「現在のタスクにする」.
                PriorityStars と同じ状態系グループ (アクション 3 ボタンのカウント外) として
                アクションボタン群より前に置く (spec REQ-1).
                ネイティブ button のセマンティクスで Tab + Enter / Space に対応 (spec REQ-3). */}
              <button type="button" onClick={() => handleSetFocus(task.id)}>
                現在のタスクにする
              </button>
              {/* BL-042: 各カードのアクションは「削除」「明日にする」「完了」の 3 つだけに削減
                (編集 / 現在に設定 を撤去, ラベルを「明日にする」に統一). */}
              <button type="button" onClick={() => handleDelete(task)}>
                削除
              </button>
              {/* BL-017 / FR-033: origin が "routine" でない場合のみ期限切替ボタンを表示.
                BL-042: ラベルは「明日にする / 今日にする」に統一. */}
              {task.origin !== "routine" && (
                <button type="button" onClick={() => handleToggleDueDate(task)}>
                  {task.dueDate === "today" ? "明日にする" : "今日にする"}
                </button>
              )}
              <button type="button" onClick={() => handleComplete(task)}>
                完了
              </button>
            </li>
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
