/**
 * 今日ビュー (BL-005 本実装 + BL-001 / BL-002 / BL-003 / BL-006 を統合).
 *
 * - 起票フォーム (タスク名のみ必須, 期限 = today/tomorrow の 2 値, 優先度 = 3 値)
 * - タスク一覧 (各行に 編集 / 期限切替 / 完了 / 削除 / 優先度切替 / 現在に設定 を表示)
 * - 現在のタスクの強調セクション (BL-006 / FR-012 / NFR-011)
 * - 編集ダイアログ (名称変更)
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
 *   - 「現在に設定」「現在解除」操作で `setFocus({ taskId, ifMatch })` を送る.
 *   - 各 mutation 成功時に `getFocus()` も再フェッチする.
 */
import { useCallback, useEffect, useState } from "react";
import type { DueDate, Priority, Task } from "@todica/domain/task";
import type {
  CompleteTaskCommand,
  CreateTaskCommand,
  DeleteTaskCommand,
  FocusSelection,
  SetFocusCommand,
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
  const [focus, setFocus] = useState<FocusSelection | null>(null);
  // BL-008 / FR-040 / NFR-013: 「今日の完了タスク数」のサーバ正本値.
  // today() のレスポンス completionCount で更新される (plan.md D-008: 楽観 UI を持たない).
  const [completionCount, setCompletionCount] = useState<number>(0);
  const [name, setName] = useState("");
  const [projectId, setProjectId] = useState("");
  const [dueDate, setDueDate] = useState<DueDate>("today");
  const [priority, setPriority] = useState<Priority>("normal");
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editingName, setEditingName] = useState("");

  /**
   * 今日ビューと現在のタスクを再取得する (plan.md D-007: 書き込み mutation 成功時に再フェッチ).
   * BL-006: focus も同時に再取得する.
   */
  const refetchToday = useCallback(async (): Promise<void> => {
    const [res, focusRes] = await Promise.all([
      repository.today(),
      repository.getFocus(),
    ]);
    setTasks(res.tasks);
    setNextTaskId(res.nextTaskId);
    setFocus(focusRes);
    // BL-008 / FR-040: サーバ正本値の completionCount で更新 (未同梱なら 0 とみなす).
    setCompletionCount(res.completionCount ?? 0);
  }, [repository]);

  // 初回マウント時の取得 (BL-005 D-004: today() を使う. list() は使わない).
  // BL-006: 並列で getFocus() も呼ぶ.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [res, focusRes] = await Promise.all([
        repository.today(),
        repository.getFocus(),
      ]);
      if (!cancelled) {
        setTasks(res.tasks);
        setNextTaskId(res.nextTaskId);
        setFocus(focusRes);
        setCompletionCount(res.completionCount ?? 0);
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

  // BL-006 / FR-012: 「現在に設定」/「現在解除」操作 (plan.md D-009).
  const handleSetFocus = useCallback(
    async (taskId: string | null) => {
      if (!focus) return;
      const cmd: SetFocusCommand = { taskId, ifMatch: focus.version };
      await repository.setFocus(cmd);
      await refetchToday();
    },
    [focus, repository, refetchToday],
  );

  const isEditing = editingTask !== null;
  // BL-006: 強調対象 = currentTaskId ?? nextTaskId (plan.md D-001 暗黙フォールバック).
  const focusedId: string | null = focus?.currentTaskId ?? nextTaskId;
  const focusedTask: Task | null = focusedId
    ? tasks.find((t) => t.id === focusedId) ?? null
    : null;
  // 通常リストから強調対象を除外 (D-008 重複表示禁止).
  const otherTasks = focusedTask
    ? tasks.filter((t) => t.id !== focusedTask.id)
    : tasks;

  return (
    <main>
      <h1>今日</h1>

      {/* BL-008 / FR-040 / NFR-013: 今日の完了タスク数を画面上部に常時表示する.
          plan.md §UI 設計 D-008: 楽観 UI を持たず, サーバ正本値 (completionCount) を
          再フェッチで反映する. */}
      <div aria-label="今日の完了タスク数">
        <span>今日の完了: {completionCount}</span>
      </div>

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

      {/* BL-006: 現在のタスク強調セクション (NFR-011 "大きく単独で表示"). */}
      {focusedTask && (
        <section aria-label="現在のタスク">
          <h2>現在のタスク</h2>
          <div>
            <span>{focusedTask.name}</span>
            <span>[優先度: {PRIORITY_LABEL[focusedTask.priority]}]</span>
            <button
              type="button"
              onClick={() => handleCyclePriority(focusedTask)}
              aria-label={`優先度を切替 (現在: ${PRIORITY_LABEL[focusedTask.priority]})`}
            >
              優先度: {PRIORITY_LABEL[focusedTask.priority]}
            </button>
            <button type="button" onClick={() => openEdit(focusedTask)}>
              編集
            </button>
            <button type="button" onClick={() => handleToggleDueDate(focusedTask)}>
              {focusedTask.dueDate === "today" ? "明日へ" : "今日へ"}
            </button>
            <button type="button" onClick={() => handleComplete(focusedTask)}>
              完了
            </button>
            <button type="button" onClick={() => handleDelete(focusedTask)}>
              削除
            </button>
            <button type="button" onClick={() => handleSetFocus(null)}>
              現在解除
            </button>
          </div>
        </section>
      )}

      <ul aria-label="タスク一覧">
        {otherTasks.map((task) => (
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
            <button type="button" onClick={() => handleSetFocus(task.id)}>
              現在に設定
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}
