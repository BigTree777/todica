import { useQuery } from "@tanstack/react-query";
import type { JSX } from "react";
/**
 * プロジェクト管理ビュー .
 *
 * 仕様参照:
 *   - docs/developer/features/project-crud/spec.md §「Web クライアント - ProjectsView」
 *
 * 機能:
 *   - マウント時に repository.list() でプロジェクト一覧を取得して表示.
 *   - 作成フォーム: 名称を入力して追加ボタンを押すと repository.create() → 一覧再取得.
 *   - 各行: プロジェクト名 + 名称変更ボタン（インライン編集）+ 削除ボタン.
 *   - 名称変更: 行の「名称変更」ボタンで編集モード, 保存で repository.update() → 一覧再取得.
 *   - 削除: 削除ボタンで repository.delete() → 一覧再取得.
 *
 * TanStack Query (useQuery / useMutation) でデータ取得・書込みを管理.
 */
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import "./projects-view.css";
import { useConflictDialog } from "../../hooks/use-conflict-dialog.js";
import type { Project, ProjectRepository } from "../../repositories/project-repository.js";
import { generateId } from "../../usecases/mutation-helpers.js";
import { useProjectMutations } from "../../usecases/project-usecases.js";
import { ConflictDialog } from "../conflict-dialog/conflict-dialog.js";
import { ProjectCard } from "../project-card/project-card.js";
import { ProjectFormCard } from "../project-card/project-form-card.js";

export interface ProjectsViewProps {
  repository: ProjectRepository;
}

export function ProjectsView(props: ProjectsViewProps): JSX.Element {
  const { repository } = props;
  const conflictDialog = useConflictDialog();

  const { data: projectsData } = useQuery({
    queryKey: ["projects"],
    queryFn: () => repository.list(),
    networkMode: "offlineFirst",
  });
  const projects: Project[] = projectsData ?? [];

  const [newName, setNewName] = useState("");

  // BL-104: 起票フォーム開閉は URL クエリ `?create=1` を単一情報源とする (D-001).
  const [searchParams, setSearchParams] = useSearchParams();
  const formOpen = searchParams.get("create") === "1";

  const closeForm = useCallback(() => {
    setSearchParams(
      (prev) => {
        prev.delete("create");
        return prev;
      },
      { replace: false },
    );
    setNewName("");
  }, [setSearchParams]);

  const focusCreateButton = useCallback(() => {
    const el = document.querySelector<HTMLButtonElement>("button.app-shell__create");
    el?.focus();
  }, []);

  const handleCancel = useCallback(() => {
    closeForm();
    focusCreateButton();
  }, [closeForm, focusCreateButton]);

  useEffect(() => {
    if (!formOpen) return;
    const el = document.getElementById("project-name") as HTMLInputElement | null;
    el?.focus();
  }, [formOpen]);

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

  // BL-118: project mutation 群はアプリケーション層 (project-usecases) へ集約.
  //   - 標準 invalidate は ["projects"]. 衝突時は conflictDialog を起動する.
  const projectMutations = useProjectMutations(repository, {
    onConflict: conflictDialog.openDialog,
  });
  const createMutation = projectMutations.create;
  const updateMutation = projectMutations.update;
  const deleteMutation = projectMutations.delete;

  const handleCreate = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!newName) return;
      const id = generateId();
      try {
        await createMutation.mutateAsync({ id, name: newName });
      } catch {
        // BL-104 / REQ-8: 失敗時はフォームを閉じない (入力値も保持).
        return;
      }
      // BL-104 / REQ-7 / D-004: 成功時のみ自動 close.
      closeForm();
    },
    [newName, createMutation, closeForm],
  );

  // BL-070 REQ-9 / D-001 / D-002: name 編集は input blur 経由.
  //   - 空文字 → 短絡 (元値復元).
  //   - 同値 → 短絡 (PATCH 抑制).
  //   - 実値変更時のみ updateMutation を呼ぶ.
  // 失敗時の通知は onError で処理済み (ConflictDialog / notifyError).
  // mutateAsync が reject しても unhandled rejection を発生させないよう try/catch で吸収する
  // (tomorrow-view handleSubmit と同じパターン).
  const handleNameBlur = useCallback(
    async (project: Project, next: string) => {
      if (next === "" || next === project.name) return;
      try {
        await updateMutation.mutateAsync({
          id: project.id,
          ifMatch: project.version,
          name: next,
        });
      } catch {
        // onError で処理済み.
      }
    },
    [updateMutation],
  );

  const handleDelete = useCallback(
    async (project: Project) => {
      await deleteMutation.mutateAsync({ id: project.id, ifMatch: project.version });
    },
    [deleteMutation],
  );

  return (
    <main className="projects-view">
      <h1>プロジェクト</h1>

      {/* BL-104 / REQ-4: `?create=1` のときのみ条件付き描画 (D-001). */}
      {formOpen && (
        <ProjectFormCard
          name={newName}
          onNameChange={setNewName}
          onSubmit={handleCreate}
          onCancel={handleCancel}
        />
      )}

      <ul className="projects-view__list">
        {projects.map((project) => (
          <ProjectCard
            key={project.id}
            project={project}
            onNameBlur={(next) => handleNameBlur(project, next)}
            onDelete={() => handleDelete(project)}
          />
        ))}
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
