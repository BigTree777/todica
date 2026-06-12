import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
/**
 * プロジェクト管理ビュー (BL-016 / project-crud).
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
 * BL-018: TanStack Query (useQuery / useMutation) でデータ取得・書込みを管理.
 */
import { useCallback, useState } from "react";
import "./projects-view.css";
import { notifyError } from "../../error-notification.js";
import { useConflictDialog } from "../../hooks/use-conflict-dialog.js";
import { ConflictError, dequeue, enqueue, getAll, mapConflict } from "../../offline-queue.js";
import type { Project, ProjectRepository } from "../../repositories/project-repository.js";
import { ProjectConflictError } from "../../repositories/project-repository.js";
import { ConflictDialog } from "../conflict-dialog/conflict-dialog.js";
import { ProjectCard } from "../project-card/project-card.js";
import { ProjectFormCard } from "../project-card/project-form-card.js";

/** UUID v4 風の文字列を生成する. crypto.randomUUID が無い jsdom 環境向けのフォールバック. */
function generateId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  const random = (n: number) => Math.floor(Math.random() * n);
  const hex = (n: number) => Array.from({ length: n }, () => random(16).toString(16)).join("");
  return `${hex(8)}-${hex(4)}-4${hex(3)}-8${hex(3)}-${hex(12)}`;
}

export interface ProjectsViewProps {
  repository: ProjectRepository;
}

/** repository の baseUrl/authToken を安全に取り出す型 */
interface HasBaseUrlAndToken {
  baseUrl?: string;
  authToken?: string;
}

export function ProjectsView(props: ProjectsViewProps): JSX.Element {
  const { repository } = props;
  const queryClient = useQueryClient();
  const conflictDialog = useConflictDialog();
  const repo = repository as unknown as HasBaseUrlAndToken;
  const baseUrl = repo.baseUrl ?? "";
  const authToken = repo.authToken ?? "";

  const { data: projectsData } = useQuery({
    queryKey: ["projects"],
    queryFn: () => repository.list(),
    networkMode: "offlineFirst",
  });
  const projects: Project[] = projectsData ?? [];

  const [newName, setNewName] = useState("");

  const invalidateProjects = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["projects"] });
  }, [queryClient]);

  /** enqueue を安全に呼び出す。IDB が利用できない環境ではエラーを無視する。 */
  const safeEnqueue = async (entry: Parameters<typeof enqueue>[0]) => {
    try {
      await enqueue(entry);
    } catch {
      // IDB が利用できない環境ではキューへの保存をスキップ
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
    mutationFn: async (cmd: { id: string; name: string }) => {
      const idempotencyKey = generateId();
      void safeEnqueue({
        url: `${baseUrl}/api/v1/projects`,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({ ...cmd }),
        idempotencyKey,
      });
      if (!navigator.onLine) return undefined;
      const result = await repository.create(cmd);
      void safeDequeueByKey(idempotencyKey);
      return result;
    },
    onSuccess: invalidateProjects,
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
    mutationFn: async (cmd: { id: string; ifMatch: number; name: string }) => {
      const idempotencyKey = generateId();
      void safeEnqueue({
        url: `${baseUrl}/api/v1/projects/${cmd.id}`,
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
          "Idempotency-Key": idempotencyKey,
          "If-Match": String(cmd.ifMatch),
        },
        body: JSON.stringify({ name: cmd.name }),
        idempotencyKey,
      });
      if (!navigator.onLine) return undefined;
      const result = await mapConflict(
        idempotencyKey,
        () => repository.update(cmd),
        (err) => (err instanceof ProjectConflictError ? err.currentProject : undefined),
      );
      void safeDequeueByKey(idempotencyKey);
      return result;
    },
    onSuccess: invalidateProjects,
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
    mutationFn: async (cmd: { id: string; ifMatch: number }) => {
      const idempotencyKey = generateId();
      void safeEnqueue({
        url: `${baseUrl}/api/v1/projects/${cmd.id}`,
        method: "DELETE",
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
        () => repository.delete(cmd),
        (err) => (err instanceof ProjectConflictError ? err.currentProject : undefined),
      );
      void safeDequeueByKey(idempotencyKey);
      return result;
    },
    onSuccess: invalidateProjects,
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
      if (!newName) return;
      const id = generateId();
      await createMutation.mutateAsync({ id, name: newName });
      setNewName("");
    },
    [newName, createMutation],
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

      <ProjectFormCard name={newName} onNameChange={setNewName} onSubmit={handleCreate} />

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
