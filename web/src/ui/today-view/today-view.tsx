/**
 * 今日ビュー (BL-005 本実装 + BL-001 / BL-002 / BL-003 を統合).
 *
 * - 起票フォーム (タスク名のみ必須, 期限 = today/tomorrow の 2 値, 優先度 = 3 値)
 * - タスク一覧 (各行に 編集 / 期限切替 / 完了 / 削除 / 優先度切替 を表示)
 * - 編集ダイアログ (名称変更)
 *
 * BL-005 / FR-010 / FR-011 / NFR-013 / plan.md D-004:
 *   - 取得は `repository.today()` を使用 (`list()` は使わない).
 *   - サーバが priority → createdAt → id で並べて返すので, クライアント側で再ソートしない.
 *   - 各書き込み mutation (create / update / delete / complete) の成功時に
 *     `repository.today()` を再呼出して tasks / nextTaskId を更新する (plan.md D-007).
 */
import { useCallback, useEffect, useState } from "react";
import type { DueDate, Priority, Task } from "@todica/domain/task";
import type {
  CompleteTaskCommand,
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
  const [nextTaskId, setNextTaskId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [projectId, setProjectId] = useState("");
  const [dueDate, setDueDate] = useState<DueDate>("today");
  const [priority, setPriority] = useState<Priority>("normal");
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editingName, setEditingName] = useState("");

  /**
   * 今日ビューを再取得する (plan.md D-007: 書き込み mutation 成功時に再フェッチ).
   * cancelled フラグでアンマウント後の setState を防ぐ.
   */
  const refetchToday = useCallback(async (): Promise<void> => {
    const res = await repository.today();
    setTasks(res.tasks);
    setNextTaskId(res.nextTaskId);
  }, [repository]);

  // 初回マウント時の取得 (BL-005 D-004: today() を使う. list() は使わない).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await repository.today();
      if (!cancelled) {
        setTasks(res.tasks);
        setNextTaskId(res.nextTaskId);
      }
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
      await repository.create(cmd);
      setName("");
      setProjectId("");
      setDueDate("today");
      setPriority("normal");
      await refetchToday();
    },
    [name, projectId, dueDate, priority, repository, refetchToday],
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
      await repository.update(cmd);
      cancelEdit();
      await refetchToday();
    },
    [editingTask, editingName, repository, cancelEdit, refetchToday],
  );

  const handleToggleDueDate = useCallback(
    async (task: Task) => {
      const next: DueDate = task.dueDate === "today" ? "tomorrow" : "today";
      const cmd: UpdateTaskCommand = {
        id: task.id,
        ifMatch: task.version,
        patch: { dueDate: next },
      };
      await repository.update(cmd);
      // 楽観 UI: today → tomorrow の場合は即座に今日ビューから除外する (D-007).
      if (next === "tomorrow") {
        setTasks((prev) => prev.filter((t) => t.id !== task.id));
      }
      await refetchToday();
    },
    [repository, refetchToday],
  );

  const handleDelete = useCallback(
    async (task: Task) => {
      const cmd: DeleteTaskCommand = { id: task.id, ifMatch: task.version };
      await repository.delete(cmd);
      // 楽観 UI: 削除したタスクは即座に一覧から除外する (D-007).
      setTasks((prev) => prev.filter((t) => t.id !== task.id));
      await refetchToday();
    },
    [repository, refetchToday],
  );

  const handleComplete = useCallback(
    async (task: Task) => {
      const cmd: CompleteTaskCommand = { id: task.id, ifMatch: task.version };
      await repository.complete(cmd);
      // 楽観 UI: 完了したタスクは即座に今日ビューから除外する (BL-003 / D-007).
      setTasks((prev) => prev.filter((t) => t.id !== task.id));
      await refetchToday();
    },
    [repository, refetchToday],
  );

  const handleCyclePriority = useCallback(
    async (task: Task) => {
      const next = NEXT_PRIORITY[task.priority];
      const cmd: UpdateTaskCommand = {
        id: task.id,
        ifMatch: task.version,
        patch: { priority: next },
      };
      await repository.update(cmd);
      await refetchToday();
    },
    [repository, refetchToday],
  );

  const isEditing = editingTask !== null;
  // 並びはサーバが計算した順序 (plan.md D-004: クライアントで再ソートしない).
  // nextTaskId は state に保持しているが視覚的強調は本 feature では任意 (plan.md §影響範囲 §UI).
  void nextTaskId;

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
        {tasks.map((task) => (
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
            <button type="button" onClick={() => handleComplete(task)}>
              完了
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
