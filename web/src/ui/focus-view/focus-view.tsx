import { useQuery } from "@tanstack/react-query";
import type { Task } from "@todica/domain/task";
import type { JSX } from "react";
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
import { useConflictDialog } from "../../hooks/use-conflict-dialog.js";
import type { Project, ProjectRepository } from "../../repositories/project-repository.js";
import type {
  CompleteTaskCommand,
  DeleteTaskCommand,
  FocusSelection,
  TaskRepository,
  UpdateTaskCommand,
} from "../../repositories/task-repository.js";
import { useTaskMutations } from "../../usecases/task-usecases.js";
import { ConflictDialog } from "../conflict-dialog/conflict-dialog.js";
import { TaskCard } from "../task-card/task-card.js";
import "./focus-view.css";

export interface FocusViewProps {
  repository: TaskRepository;
  projectRepository: ProjectRepository;
}

export function FocusView(props: FocusViewProps): JSX.Element {
  const { repository, projectRepository } = props;
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

  // BL-118: task mutation 群はアプリケーション層 (task-usecases) へ集約.
  //   - 標準 invalidate は ["today"] / ["focus"] (focus-view 相当).
  const {
    update: updateMutation,
    delete: deleteMutation,
    complete: completeMutation,
  } = useTaskMutations(repository, {
    onConflict: conflictDialog.openDialog,
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

  // BL-108 (task-card-project-change) REQ-5 / REQ-6 / REQ-7:
  //   - focusedTask のプロジェクト変更で PATCH /api/v1/tasks/:id { projectId } を発行.
  //   - 同値短絡 (next === focusedTask.projectId) は親側で行う.
  //   - 既存 updateMutation (onSuccess: invalidateAll = ["today"] / ["focus"]) を流用.
  const handleChangeProject = useCallback(
    async (next: string | null) => {
      if (!focusedTask) return;
      if (focusedTask.projectId === next) return;
      const cmd: UpdateTaskCommand = {
        id: focusedTask.id,
        ifMatch: focusedTask.version,
        patch: { projectId: next },
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
      <h1>現在</h1>
      {/* BL-059 / REQ-6: focusedTask があれば <TaskCard variant="focus" actionSet="minimal" />.
          無ければ「現在のタスクはありません」placeholder を維持 (D-007 / 空状態維持). */}
      {focusedTask ? (
        <TaskCard
          as="div"
          variant="focus"
          task={focusedTask}
          project={project}
          projects={projectsData ?? []}
          onChangeProject={handleChangeProject}
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
