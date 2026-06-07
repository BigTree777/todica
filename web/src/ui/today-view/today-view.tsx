/**
 * 今日ビュー (BL-001 の最小ビュー兼用).
 *
 * - 起票フォーム (タスク名のみ必須, 期限 = today/tomorrow の 2 値)
 * - タスク一覧 (各行に 編集 / 期限切替 / 削除 を表示)
 * - 編集ダイアログ (名称変更)
 *
 * 本実装は Repository をプロパティ注入する. TanStack Query は本機能の単体テストの
 * 観点 (描画 / 引数 / 楽観 UI 反映) には不要なので, useState による最小実装に留める.
 */
import { useCallback, useEffect, useState } from "react";
import type { DueDate, Priority, Task } from "@todica/domain/task";
import type {
  CreateTaskCommand,
  DeleteTaskCommand,
  TaskRepository,
  UpdateTaskCommand,
} from "../../repositories/task-repository.js";

/** 優先度の日本語表記 (plan.md D-004 「最優先 / 普通 / 後回し」). */
const PRIORITY_LABEL: Record<Priority, string> = {
  highest: "最優先",
  normal: "普通",
  later: "後回し",
};

/** cycle ボタンの次段階 (plan.md D-001: normal → highest → later → normal). */
const NEXT_PRIORITY: Record<Priority, Priority> = {
  normal: "highest",
  highest: "later",
  later: "normal",
};

export interface TodayViewProps {
  repository: TaskRepository;
}

const PRIORITY_ORDER: Record<string, number> = { highest: 0, normal: 1, later: 2 };
const DUE_DATE_ORDER: Record<string, number> = { today: 0, tomorrow: 1 };

function sortTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    const dd = (DUE_DATE_ORDER[a.dueDate] ?? 99) - (DUE_DATE_ORDER[b.dueDate] ?? 99);
    if (dd !== 0) return dd;
    const pp = (PRIORITY_ORDER[a.priority] ?? 99) - (PRIORITY_ORDER[b.priority] ?? 99);
    if (pp !== 0) return pp;
    return a.createdAt.localeCompare(b.createdAt);
  });
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

export function TodayView(props: TodayViewProps): JSX.Element {
  const { repository } = props;
  const [tasks, setTasks] = useState<Task[]>([]);
  const [name, setName] = useState("");
  const [projectId, setProjectId] = useState("");
  const [dueDate, setDueDate] = useState<DueDate>("today");
  const [priority, setPriority] = useState<Priority>("normal");
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editingName, setEditingName] = useState("");

  // 一覧の取得
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const list = await repository.list();
      if (!cancelled) setTasks(list);
    })();
    return () => {
      cancelled = true;
    };
  }, [repository]);

  const handleCreate = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!name) return;
      const cmd: CreateTaskCommand = {
        id: generateId(),
        name,
        projectId: projectId ? projectId : null,
        dueDate,
        priority,
      };
      const created = await repository.create(cmd);
      setTasks((prev) => [...prev, created]);
      setName("");
      setProjectId("");
      setDueDate("today");
      setPriority("normal");
    },
    [name, projectId, dueDate, priority, repository],
  );

  const openEdit = useCallback((task: Task) => {
    setEditingTask(task);
    setEditingName(task.name);
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingTask(null);
    setEditingName("");
  }, []);

  const handleSaveEdit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!editingTask) return;
      const cmd: UpdateTaskCommand = {
        id: editingTask.id,
        ifMatch: editingTask.version,
        patch: { name: editingName },
      };
      const updated = await repository.update(cmd);
      setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      cancelEdit();
    },
    [editingTask, editingName, repository, cancelEdit],
  );

  const handleToggleDueDate = useCallback(
    async (task: Task) => {
      const next: DueDate = task.dueDate === "today" ? "tomorrow" : "today";
      const cmd: UpdateTaskCommand = {
        id: task.id,
        ifMatch: task.version,
        patch: { dueDate: next },
      };
      const updated = await repository.update(cmd);
      setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    },
    [repository],
  );

  const handleDelete = useCallback(
    async (task: Task) => {
      const cmd: DeleteTaskCommand = { id: task.id, ifMatch: task.version };
      await repository.delete(cmd);
      setTasks((prev) => prev.filter((t) => t.id !== task.id));
    },
    [repository],
  );

  const handleCyclePriority = useCallback(
    async (task: Task) => {
      const next = NEXT_PRIORITY[task.priority];
      const cmd: UpdateTaskCommand = {
        id: task.id,
        ifMatch: task.version,
        patch: { priority: next },
      };
      const updated = await repository.update(cmd);
      setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    },
    [repository],
  );

  const sorted = sortTasks(tasks);
  const isEditing = editingTask !== null;

  return (
    <main>
      <h1>今日</h1>

      {/* 編集中は起票フォームを隠す (ラベル衝突回避). */}
      {!isEditing && (
        <form onSubmit={handleCreate} aria-label="タスク起票フォーム">
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
            <label htmlFor="task-project">プロジェクト (任意)</label>
            <input
              id="task-project"
              type="text"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="task-due-date">期限</label>
            <select
              id="task-due-date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value as DueDate)}
            >
              <option value="today">今日</option>
              <option value="tomorrow">明日</option>
            </select>
          </div>
          <div>
            <label htmlFor="task-priority">優先度</label>
            <select
              id="task-priority"
              value={priority}
              onChange={(e) => setPriority(e.target.value as Priority)}
            >
              <option value="highest">最優先</option>
              <option value="normal">普通</option>
              <option value="later">後回し</option>
            </select>
          </div>
          <button type="submit">追加</button>
        </form>
      )}

      {isEditing && (
        <form onSubmit={handleSaveEdit} aria-label="タスク編集フォーム">
          <div>
            <label htmlFor="edit-name">名称</label>
            <input
              id="edit-name"
              type="text"
              value={editingName}
              onChange={(e) => setEditingName(e.target.value)}
              required
            />
          </div>
          <button type="submit">保存</button>
          <button type="button" onClick={cancelEdit}>
            キャンセル
          </button>
        </form>
      )}

      <ul aria-label="タスク一覧">
        {sorted.map((task) => (
          <li key={task.id}>
            <span>{task.name}</span>
            <span>[優先度: {PRIORITY_LABEL[task.priority]}]</span>
            <button
              type="button"
              onClick={() => handleCyclePriority(task)}
              aria-label={`優先度を切替 (現在: ${PRIORITY_LABEL[task.priority]})`}
            >
              優先度: {PRIORITY_LABEL[task.priority]}
            </button>
            <button type="button" onClick={() => openEdit(task)}>
              編集
            </button>
            <button type="button" onClick={() => handleToggleDueDate(task)}>
              {task.dueDate === "today" ? "明日へ" : "今日へ"}
            </button>
            <button type="button" onClick={() => handleDelete(task)}>
              削除
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}
