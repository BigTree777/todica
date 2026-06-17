/**
 * ゴミ箱ビュー .
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
 * TanStack Query (useQuery / useMutation) + 書込キュー統合.
 */
import type { JSX } from "react";
import { useCallback } from "react";
import "./trash-view.css";
import { useQuery } from "@tanstack/react-query";
import { RotateCcw } from "lucide-react";
import { useConflictDialog } from "../../hooks/use-conflict-dialog.js";
import type {
  TrashedProject,
  TrashedTask,
  TrashRepository,
} from "../../repositories/trash-repository.js";
import { useTrashMutations } from "../../usecases/trash-usecases.js";
import { ConflictDialog } from "../conflict-dialog/conflict-dialog.js";

export interface TrashViewProps {
  repository: TrashRepository;
}

export function TrashView(props: TrashViewProps): JSX.Element {
  const { repository } = props;
  const conflictDialog = useConflictDialog();

  const { data: tasksData } = useQuery({
    queryKey: ["trash"],
    queryFn: () => repository.list(),
    networkMode: "offlineFirst",
  });
  const tasks: TrashedTask[] = tasksData ?? [];

  // BL-119: ゴミ箱内 Project の一覧. queryKey は ["trash", ...] のサブキーにして
  // restore mutation の invalidate(["trash"]) で再取得されるようにする.
  const { data: projectsData } = useQuery({
    queryKey: ["trash", "projects"],
    queryFn: () => repository.listProjects(),
    networkMode: "offlineFirst",
  });
  const trashedProjects: TrashedProject[] = projectsData ?? [];

  // BL-118: restore / empty mutation はアプリケーション層 (trash-usecases) へ集約.
  //   - 標準 invalidate は ["trash"] / ["today"]. 衝突時は conflictDialog を起動する.
  const { restore: restoreMutation, empty: emptyMutation } = useTrashMutations(repository, {
    onConflict: conflictDialog.openDialog,
  });

  // 失敗時の通知 / ConflictDialog は onError (usecase 内) で処理済み.
  // mutateAsync の reject を try/catch で握り unhandled rejection を防ぐ
  // (他 view の handleNameBlur 等と同じパターン).
  const handleRestore = useCallback(
    async (task: TrashedTask) => {
      try {
        await restoreMutation.mutateAsync({ id: task.id, ifMatch: task.version });
      } catch {
        // onError で処理済み.
      }
    },
    [restoreMutation],
  );

  // Project 復元も restore({ id, ifMatch }) で呼ぶ (サーバが Task/Project を判別する D-3).
  const handleRestoreProject = useCallback(
    async (project: TrashedProject) => {
      try {
        await restoreMutation.mutateAsync({ id: project.id, ifMatch: project.version });
      } catch {
        // onError で処理済み.
      }
    },
    [restoreMutation],
  );

  const handleEmpty = useCallback(async () => {
    try {
      await emptyMutation.mutateAsync();
    } catch {
      // onError で処理済み.
    }
  }, [emptyMutation]);

  return (
    <main className="trash-view">
      <header className="trash-view__header">
        <h1>ゴミ箱</h1>
        <button type="button" className="button button--danger" onClick={handleEmpty}>
          ゴミ箱を空にする
        </button>
      </header>

      {tasks.length === 0 && trashedProjects.length === 0 ? (
        <p className="trash-view__empty">ゴミ箱は空です</p>
      ) : null}

      {tasks.length > 0 ? (
        <ul aria-label="ゴミ箱のタスク一覧" className="trash-view__list">
          {tasks.map((task) => (
            <li key={task.id} className="trash-view__item">
              <span>{task.name}</span>
              <button
                type="button"
                className="button button--ghost"
                onClick={() => handleRestore(task)}
              >
                復元
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {trashedProjects.length > 0 ? (
        <ul aria-label="ゴミ箱のプロジェクト一覧" className="trash-view__list">
          {trashedProjects.map((project) => (
            <li key={project.id} className="trash-view__item">
              <span>{project.name}</span>
              <button
                type="button"
                className="button button--ghost"
                aria-label="復元"
                onClick={() => handleRestoreProject(project)}
              >
                <RotateCcw aria-hidden="true" size={16} />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

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
