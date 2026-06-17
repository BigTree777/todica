import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Priority, Task } from "@todica/domain/task";
import type { JSX } from "react";
/**
 * 「明日のタスク」独立ビュー .
 *
 * 仕様参照:
 *   docs/developer/features/tomorrow-view/spec.md REQ-1〜REQ-7.
 *   docs/developer/features/tomorrow-view/plan.md §「TomorrowView コンポーネント設計」.
 *
 * 役割:
 *   - `/tomorrow` ルートで `dueDate=tomorrow` のタスクを優先度順で一覧表示する.
 *   - 起票フォーム: タスク名 / プロジェクト / 優先度 / 追加 の 4 要素 (期限 UI なし).
 *   - 各カードのアクションは「削除」「今日にする」「完了」の 3 ボタン (REQ-3 / BL-042 REQ-2).
 *   - 「今日にする」は `PATCH /api/v1/tasks/:id { dueDate: "today" }` を発行 (FR-014 逆方向).
 *   - 「削除」は `DELETE /api/v1/tasks/:id` で論理削除 .
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
 *   - online 412 (`OptimisticLockError`) → `ConflictError` に変換し `ConflictDialog` を開く .
 *   - その他のエラー → `notifyError("通信に失敗しました")` .
 *   - offline → 書込キューに enqueue し楽観成功 .
 */
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useConflictDialog } from "../../hooks/use-conflict-dialog.js";
import type { Project, ProjectRepository } from "../../repositories/project-repository.js";
import type {
  CompleteTaskCommand,
  CreateTaskCommand,
  DeleteTaskCommand,
  TaskRepository,
  UpdateTaskCommand,
} from "../../repositories/task-repository.js";
import { generateId } from "../../usecases/mutation-helpers.js";
import { useTaskMutations } from "../../usecases/task-usecases.js";
import { ConflictDialog } from "../conflict-dialog/conflict-dialog.js";
import { TaskCard } from "../task-card/task-card.js";
import { TaskFormCard } from "../task-card/task-form-card.js";
import "../day-view/day-view.css";

export interface TomorrowViewProps {
  repository: TaskRepository;
  projectRepository: ProjectRepository;
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

  // BL-104: 起票フォーム開閉は URL クエリ `?create=1` を単一情報源とする (D-001).
  const [searchParams, setSearchParams] = useSearchParams();
  const formOpen = searchParams.get("create") === "1";

  /** BL-104: フォーム close + 入力 state クリア (REQ-9). */
  const closeForm = useCallback(() => {
    setSearchParams(
      (prev) => {
        prev.delete("create");
        return prev;
      },
      { replace: false },
    );
    setName("");
    setProjectId("");
    setPriority("normal");
  }, [setSearchParams]);

  /** + ボタンへ focus を戻す (REQ-13 / D-005). */
  const focusCreateButton = useCallback(() => {
    const el = document.querySelector<HTMLButtonElement>("button.app-shell__create");
    el?.focus();
  }, []);

  /** キャンセル経路: フォーム close + + ボタンへ focus 復帰. */
  const handleCancel = useCallback(() => {
    closeForm();
    focusCreateButton();
  }, [closeForm, focusCreateButton]);

  // BL-104 / REQ-10: 開いた直後に先頭 input (タスク名) へ focus を移す.
  useEffect(() => {
    if (!formOpen) return;
    const el = document.getElementById("tomorrow-task-name") as HTMLInputElement | null;
    el?.focus();
  }, [formOpen]);

  // BL-104 / REQ-6: Escape でフォームを閉じ, + へ focus を戻す.
  useEffect(() => {
    if (!formOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      closeForm();
      focusCreateButton();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [formOpen, closeForm, focusCreateButton]);

  // 「今日にする」/「完了」成功時: ["tomorrow"] / ["today"] / ["focus"] を invalidate (D-004 / BL-042).
  // ["today"] / ["focus"] は TomorrowView 内に observer がいないため, invalidate だけでは
  // 再フェッチが走らない. queryClient.fetchQuery で明示的にフェッチして, today カウンタの
  // 更新 (BL-042 spec AC-6) と focus 状態の更新 (今日に移動した場合の繰上げ) を確実に伝搬する.
  const fetchTodayAndFocus = useCallback(() => {
    void queryClient.fetchQuery({
      queryKey: ["today"],
      queryFn: () => repository.today(),
    });
    void queryClient.fetchQuery({
      queryKey: ["focus"],
      queryFn: () => repository.getFocus(),
    });
  }, [queryClient, repository]);

  // BL-118: task mutation 群はアプリケーション層 (task-usecases) へ集約.
  //   - 起票 / 削除は ["tomorrow"] のみ invalidate (D-005 / D-006).
  //   - 「今日にする」/「完了」は ["tomorrow"] / ["today"] / ["focus"] を invalidate し,
  //     observer 不在の ["today"] / ["focus"] を fetchQuery で明示再フェッチする (D-004).
  const { create: createMutation, delete: deleteMutation } = useTaskMutations(repository, {
    onConflict: conflictDialog.openDialog,
    invalidateKeys: [["tomorrow"]],
  });
  const { update: updateMutation, complete: completeMutation } = useTaskMutations(repository, {
    onConflict: conflictDialog.openDialog,
    invalidateKeys: [["tomorrow"], ["today"], ["focus"]],
    afterSuccess: fetchTodayAndFocus,
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
        // BL-104 / REQ-8: 失敗時はフォームを閉じない (入力値も保持).
        return;
      }
      // BL-104 / REQ-7 / D-004: 成功時のみ自動 close.
      closeForm();
    },
    [name, projectId, priority, createMutation, closeForm],
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

  // BL-070 REQ-9 / D-001 / D-002: name 編集は input blur 経由.
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

  // BL-108 (task-card-project-change) REQ-5 / REQ-6 / REQ-7:
  //   - 明日タスクのプロジェクト変更で PATCH /api/v1/tasks/:id { projectId } を発行.
  //   - 同値短絡 (next === task.projectId) は親側で行う.
  //   - 既存 updateMutation (onSuccess: invalidateAfterMoveToToday) を流用するため,
  //     成功時の invalidate 先は ["tomorrow"] / ["today"] / ["focus"] になる.
  const handleChangeProject = useCallback(
    async (task: Task, next: string | null) => {
      if (task.projectId === next) return;
      const cmd: UpdateTaskCommand = {
        id: task.id,
        ifMatch: task.version,
        patch: { projectId: next },
      };
      try {
        await updateMutation.mutateAsync(cmd);
      } catch {
        // onError で処理済み.
      }
    },
    [updateMutation],
  );

  // 「完了」クリックで complete API を呼ぶ.
  const handleComplete = useCallback(
    (task: Task) => {
      const cmd: CompleteTaskCommand = {
        id: task.id,
        ifMatch: task.version,
      };
      completeMutation.mutate(cmd);
    },
    [completeMutation],
  );

  return (
    <main className="day-view">
      {/* BL-051 / REQ-2 / D-006: <h1> を <header className="day-view__header"> でラップし
          today-view と同じ 1 段目構造に揃える. 旧 <section aria-label="明日のタスク">
          ランドマークは <main> に統合 (h1 が見出しとして十分なため aria-label は撤去). */}
      <header className="day-view__header">
        <h1>明日</h1>
      </header>

      {/* BL-059 / REQ-5-2: 起票フォームを <TaskFormCard> に置換 (V-6 / V-7 反映).
          BL-104 / REQ-4: `?create=1` のときのみ条件付き描画 (D-001). */}
      {formOpen && (
        <TaskFormCard
          projects={projects}
          projectId={projectId}
          onProjectIdChange={setProjectId}
          priority={priority}
          onPriorityChange={setPriority}
          name={name}
          onNameChange={setName}
          onSubmit={handleCreate}
          onCancel={handleCancel}
          idPrefix="tomorrow-create"
          inputId="tomorrow-task-name"
          formAriaLabel="明日のタスク起票フォーム"
        />
      )}

      {/* REQ-6: 空状態は <ul> の外に出し, listitem role と分離する.
          (テストは tasks > 0 のときだけ listitem 数を assert する想定.)
          BL-051 / REQ-6: className を共通 day-view__empty に統一. */}
      {tasks.length === 0 && <p className="day-view__empty">明日のタスクはありません</p>}

      <ul aria-label="明日のタスク一覧" className="day-view__list">
        {tasks.length === 0
          ? null
          : tasks.map((task) => {
              const project = task.projectId
                ? (projects.find((p) => p.id === task.projectId) ?? null)
                : null;
              // BL-059 / REQ-5-1: tomorrow-view は PriorityStars を持たない既存仕様
              // (showPriority=false). dueDateMode="tomorrow" で「今日にする」ボタンを出す.
              // task.origin === "routine" のとき期限切替 button が非表示になる挙動は
              // <TaskCard> 内に内蔵 (D-010).
              return (
                <TaskCard
                  key={task.id}
                  as="li"
                  variant="default"
                  task={task}
                  project={project}
                  projects={projects}
                  onChangeProject={(next) => handleChangeProject(task, next)}
                  showPriority={false}
                  showSetFocus={false}
                  actionSet="full"
                  dueDateMode="tomorrow"
                  onNameBlur={(next) => handleNameBlur(task, next)}
                  onDelete={() => handleDelete(task)}
                  onToggleDueDate={() => handleMoveToToday(task)}
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
