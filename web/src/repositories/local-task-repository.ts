/**
 * LocalTaskRepository — SQLite ローカル実装 (BL-020 / AC-LOC-003).
 *
 * @capacitor-community/sqlite の SQLiteLocalDb を受け取り、
 * TaskRepository インターフェースを満たす実装を提供する.
 *
 * テスト環境では SQLiteLocalDb をモックして利用する (NFR-LOC-003).
 */

import type { DueDate, Priority, Task } from "@todica/domain/task";
import type {
  CompleteTaskCommand,
  Counter,
  CreateTaskCommand,
  DeleteTaskCommand,
  FocusSelection,
  ListTasksFilter,
  SetFocusCommand,
  TaskRepository,
  TodayViewResponse,
  UpdateTaskCommand,
} from "./task-repository.js";
import { OptimisticLockError } from "./task-repository.js";

import type { LocalDb } from "./local-db.js";

type Row = Record<string, unknown>;

/** DB の row を Task に変換 */
function rowToTask(row: Row): Task {
  return {
    id: row.id as string,
    name: row.name as string,
    dueDate: row.due_date as DueDate,
    priority: row.priority as Priority,
    origin: row.origin as "manual" | "routine",
    projectId: (row.project_id as string | null) ?? null,
    routineId: (row.routine_id as string | null) ?? null,
    trashedAt: (row.trashed_at as string | null) ?? null,
    trashedReason: (row.trashed_reason as "completed" | "deleted" | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    version: row.version as number,
  };
}

/** priority を数値に変換（ソート用: 小さいほど高優先度） */
function priorityOrder(priority: string): number {
  if (priority === "highest") return 0;
  if (priority === "normal") return 1;
  return 2; // later
}

export class LocalTaskRepository implements TaskRepository {
  constructor(private readonly db: LocalDb) {}

  async list(filter?: ListTasksFilter): Promise<Task[]> {
    // BL-038: filter.dueDate が渡されたら SQL にも条件を反映する.
    if (filter?.dueDate) {
      const result = await this.db.query(
        "SELECT * FROM tasks WHERE trashed_at IS NULL AND due_date = ?",
        [filter.dueDate],
      );
      return (result.values ?? []).map(rowToTask);
    }
    const result = await this.db.query("SELECT * FROM tasks WHERE trashed_at IS NULL");
    return (result.values ?? []).map(rowToTask);
  }

  async create(cmd: CreateTaskCommand): Promise<Task> {
    const now = new Date().toISOString();
    const id = cmd.id;
    const dueDate = cmd.dueDate ?? "today";
    const priority = cmd.priority ?? "normal";
    const projectId = cmd.projectId ?? null;

    await this.db.run(
      `INSERT INTO tasks (id, name, due_date, priority, origin, project_id, routine_id, trashed_at, trashed_reason, created_at, updated_at, version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, cmd.name, dueDate, priority, "manual", projectId, null, null, null, now, now, 1],
    );

    return {
      id,
      name: cmd.name,
      dueDate,
      priority,
      origin: "manual",
      projectId,
      routineId: null,
      trashedAt: null,
      trashedReason: null,
      createdAt: now,
      updatedAt: now,
      version: 1,
    };
  }

  async update(cmd: UpdateTaskCommand): Promise<Task> {
    const result = await this.db.query("SELECT * FROM tasks WHERE id = ?", [cmd.id]);
    const row = (result.values ?? [])[0];
    if (!row) throw new Error(`Task not found: ${cmd.id}`);
    if (row.version !== cmd.ifMatch) {
      throw new OptimisticLockError("version mismatch", rowToTask(row));
    }

    const now = new Date().toISOString();
    const newName = cmd.patch.name ?? (row.name as string);
    const newDueDate = cmd.patch.dueDate ?? (row.due_date as DueDate);
    const newPriority = cmd.patch.priority ?? (row.priority as Priority);
    const newProjectId =
      cmd.patch.projectId !== undefined ? cmd.patch.projectId : (row.project_id as string | null);
    const newVersion = (row.version as number) + 1;

    await this.db.run(
      `UPDATE tasks SET name = ?, due_date = ?, priority = ?, project_id = ?, updated_at = ?, version = ?
       WHERE id = ?`,
      [newName, newDueDate, newPriority, newProjectId, now, newVersion, cmd.id],
    );

    return {
      ...rowToTask(row),
      name: newName,
      dueDate: newDueDate,
      priority: newPriority,
      projectId: newProjectId ?? null,
      updatedAt: now,
      version: newVersion,
    };
  }

  async delete(cmd: DeleteTaskCommand): Promise<void> {
    const result = await this.db.query("SELECT * FROM tasks WHERE id = ?", [cmd.id]);
    const row = (result.values ?? [])[0];
    if (!row) throw new Error(`Task not found: ${cmd.id}`);
    if (row.version !== cmd.ifMatch) {
      throw new OptimisticLockError("version mismatch", rowToTask(row));
    }

    const now = new Date().toISOString();
    await this.db.run(
      `UPDATE tasks SET trashed_at = ?, trashed_reason = 'deleted', updated_at = ?, version = ? WHERE id = ?`,
      [now, now, (row.version as number) + 1, cmd.id],
    );
  }

  async complete(cmd: CompleteTaskCommand): Promise<Task> {
    const taskResult = await this.db.query("SELECT * FROM tasks WHERE id = ?", [cmd.id]);
    const taskRow = (taskResult.values ?? [])[0];
    if (!taskRow) throw new Error(`Task not found: ${cmd.id}`);
    if (taskRow.version !== cmd.ifMatch) {
      throw new OptimisticLockError("version mismatch", rowToTask(taskRow));
    }

    const counterResult = await this.db.query("SELECT * FROM counter WHERE id = 'singleton'");
    const counterRow = (counterResult.values ?? [])[0];

    const now = new Date().toISOString();
    const newVersion = (taskRow.version as number) + 1;

    await this.db.beginTransaction();
    try {
      await this.db.run(
        `UPDATE tasks SET trashed_at = ?, trashed_reason = 'completed', updated_at = ?, version = ? WHERE id = ?`,
        [now, now, newVersion, cmd.id],
      );

      if (counterRow) {
        const newCount = (counterRow.completed_count as number) + 1;
        const counterVersion = (counterRow.version as number) + 1;
        await this.db.run(
          `UPDATE counter SET completed_count = ?, updated_at = ?, version = ? WHERE id = 'singleton'`,
          [newCount, now, counterVersion],
        );
      }

      await this.db.commitTransaction();
    } catch (e) {
      await this.db.rollbackTransaction();
      throw e;
    }

    return {
      ...rowToTask(taskRow),
      trashedAt: now,
      trashedReason: "completed",
      updatedAt: now,
      version: newVersion,
    };
  }

  async today(): Promise<TodayViewResponse> {
    const tasksResult = await this.db.query(
      "SELECT * FROM tasks WHERE due_date = 'today' AND trashed_at IS NULL",
    );
    // モック環境では WHERE 条件が無視されることがあるため、アプリ側でもフィルタリングする
    const rows = (tasksResult.values ?? []).filter(
      (r) => r.due_date === "today" && (r.trashed_at === null || r.trashed_at === undefined),
    );

    // priority → createdAt → id 順でソート
    const sorted = rows.slice().sort((a, b) => {
      const pa = priorityOrder(a.priority as string);
      const pb = priorityOrder(b.priority as string);
      if (pa !== pb) return pa - pb;
      const ca = a.created_at as string;
      const cb = b.created_at as string;
      if (ca !== cb) return ca < cb ? -1 : 1;
      return (a.id as string) < (b.id as string) ? -1 : 1;
    });

    const tasks = sorted.map(rowToTask);
    const nextTaskId = tasks[0]?.id ?? null;

    // focus_selection から currentTaskId を取得
    const focusResult = await this.db.query("SELECT * FROM focus_selection WHERE id = 'singleton'");
    const focusRow = (focusResult.values ?? [])[0];
    const currentTaskId = focusRow ? ((focusRow.current_task_id as string | null) ?? null) : null;

    // counter から completionCount を取得
    const counterResult = await this.db.query("SELECT * FROM counter WHERE id = 'singleton'");
    const counterRow = (counterResult.values ?? [])[0];
    const completionCount = counterRow ? ((counterRow.completed_count as number) ?? 0) : 0;

    return { tasks, nextTaskId, currentTaskId, completionCount };
  }

  async getFocus(): Promise<FocusSelection> {
    const result = await this.db.query("SELECT * FROM focus_selection WHERE id = 'singleton'");
    const row = (result.values ?? [])[0];
    if (!row) {
      return {
        id: "singleton",
        currentTaskId: null,
        version: 1,
        updatedAt: new Date().toISOString(),
      };
    }
    return {
      id: row.id as string,
      currentTaskId: (row.current_task_id as string | null) ?? null,
      version: row.version as number,
      updatedAt: row.updated_at as string,
    };
  }

  async setFocus(cmd: SetFocusCommand): Promise<FocusSelection> {
    const result = await this.db.query("SELECT * FROM focus_selection WHERE id = 'singleton'");
    const row = (result.values ?? [])[0];

    const now = new Date().toISOString();

    if (!row) {
      await this.db.run(
        `INSERT INTO focus_selection (id, current_task_id, updated_at, version) VALUES ('singleton', ?, ?, 1)`,
        [cmd.taskId, now],
      );
      return { id: "singleton", currentTaskId: cmd.taskId, version: 1, updatedAt: now };
    }

    if (row.version !== cmd.ifMatch) {
      throw new OptimisticLockError("version mismatch");
    }

    const newVersion = (row.version as number) + 1;
    await this.db.run(
      `UPDATE focus_selection SET current_task_id = ?, updated_at = ?, version = ? WHERE id = 'singleton'`,
      [cmd.taskId, now, newVersion],
    );

    return { id: "singleton", currentTaskId: cmd.taskId, version: newVersion, updatedAt: now };
  }

  async getCounter(): Promise<Counter> {
    const result = await this.db.query("SELECT * FROM counter WHERE id = 'singleton'");
    const row = (result.values ?? [])[0];
    if (!row) {
      return {
        id: "singleton",
        completedCount: 0,
        lastResetExecutedAt: null,
        version: 1,
        updatedAt: new Date().toISOString(),
      };
    }
    return {
      id: row.id as string,
      completedCount: row.completed_count as number,
      lastResetExecutedAt: (row.last_reset_executed_at as string | null) ?? null,
      version: row.version as number,
      updatedAt: row.updated_at as string,
    };
  }
}
