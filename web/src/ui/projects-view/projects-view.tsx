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
 */
import { useCallback, useEffect, useState } from "react";
import type {
  Project,
  ProjectRepository,
} from "../../repositories/project-repository.js";

/** UUID v4 風の文字列を生成する. crypto.randomUUID が無い jsdom 環境向けのフォールバック. */
function generateId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  const random = (n: number) => Math.floor(Math.random() * n);
  const hex = (n: number) =>
    Array.from({ length: n }, () => random(16).toString(16)).join("");
  return `${hex(8)}-${hex(4)}-4${hex(3)}-8${hex(3)}-${hex(12)}`;
}

export interface ProjectsViewProps {
  repository: ProjectRepository;
}

export function ProjectsView(props: ProjectsViewProps): JSX.Element {
  const { repository } = props;
  const [projects, setProjects] = useState<Project[]>([]);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  const fetchList = useCallback(async (): Promise<void> => {
    const result = await repository.list();
    setProjects(result);
  }, [repository]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await repository.list();
      if (!cancelled) {
        setProjects(result);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [repository]);

  const handleCreate = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!newName) return;
      const id = generateId();
      await repository.create({ id, name: newName });
      setNewName("");
      await fetchList();
    },
    [newName, repository, fetchList],
  );

  const openEdit = useCallback((project: Project) => {
    setEditingId(project.id);
    setEditingName(project.name);
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setEditingName("");
  }, []);

  const handleSaveEdit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!editingId) return;
      const project = projects.find((p) => p.id === editingId);
      if (!project) return;
      await repository.update({ id: editingId, ifMatch: project.version, name: editingName });
      cancelEdit();
      await fetchList();
    },
    [editingId, editingName, projects, repository, cancelEdit, fetchList],
  );

  const handleDelete = useCallback(
    async (project: Project) => {
      await repository.delete({ id: project.id, ifMatch: project.version });
      await fetchList();
    },
    [repository, fetchList],
  );

  return (
    <main>
      <h1>プロジェクト</h1>

      <form onSubmit={handleCreate} aria-label="プロジェクト作成フォーム">
        <div>
          <label htmlFor="project-name">プロジェクト名</label>
          <input
            id="project-name"
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            required
          />
        </div>
        <button type="submit">追加</button>
      </form>

      <ul>
        {projects.map((project) => (
          <li key={project.id}>
            {editingId === project.id ? (
              <form onSubmit={handleSaveEdit} aria-label="プロジェクト名称変更フォーム">
                <input
                  type="text"
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  required
                />
                <button type="submit">保存</button>
                <button type="button" onClick={cancelEdit}>
                  キャンセル
                </button>
              </form>
            ) : (
              <>
                <span>{project.name}</span>
                <button type="button" onClick={() => openEdit(project)}>
                  名称変更
                </button>
                <button type="button" onClick={() => handleDelete(project)}>
                  削除
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}
