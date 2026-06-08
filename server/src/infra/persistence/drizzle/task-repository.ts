/**
 * DrizzleTaskRepository: TaskRepository の本実装 (better-sqlite3 + drizzle-orm).
 *
 * 仕様参照:
 *   - docs/developer/features/task-crud/plan.md §処理フロー / §影響範囲 (永続化アダプタ)
 *   - docs/developer/architecture/database/schema.md §Task
 *
 * 設計:
 *   - DB カラムは snake_case (drizzle-orm の text("project_id") 等で定義).
 *   - ドメイン Task は camelCase. drizzle-orm の select は宣言したプロパティ名 (camelCase)
 *     で返してくれるため, このリポジトリは取得結果に対する追加変換を最小化できる.
 *   - ただし返却型は Task と完全一致させる (origin / routineId / trashedReason の null 等を含む).
 */
import { and, eq, isNotNull, isNull, lt } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type { Task } from "@todica/domain/task";
import type {
  ListTasksFilter,
  TaskRepository,
} from "../../../data/task-repository.js";
import { schema, tasks } from "../../../db/schema.js";

export interface DrizzleTaskRepositoryDeps {
  db: BetterSQLite3Database<typeof schema>;
}

/** drizzle select row → Task. */
function rowToTask(row: {
  id: string;
  name: string;
  projectId: string | null;
  dueDate: "today" | "tomorrow";
  priority: "highest" | "normal" | "later";
  origin: "manual" | "routine";
  routineId: string | null;
  createdAt: string;
  updatedAt: string;
  trashedAt: string | null;
  trashedReason: "completed" | "deleted" | null;
  version: number;
}): Task {
  return {
    id: row.id,
    name: row.name,
    projectId: row.projectId,
    dueDate: row.dueDate,
    priority: row.priority,
    origin: row.origin,
    routineId: row.routineId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    trashedAt: row.trashedAt,
    trashedReason: row.trashedReason,
    version: row.version,
  };
}

/** Task → drizzle insert/update values. */
function taskToValues(task: Task) {
  return {
    id: task.id,
    name: task.name,
    projectId: task.projectId,
    dueDate: task.dueDate,
    priority: task.priority,
    origin: task.origin,
    routineId: task.routineId,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    trashedAt: task.trashedAt,
    trashedReason: task.trashedReason,
    version: task.version,
  };
}

export class DrizzleTaskRepository implements TaskRepository {
  private readonly db: BetterSQLite3Database<typeof schema>;

  constructor(deps: DrizzleTaskRepositoryDeps) {
    this.db = deps.db;
  }

  async insert(task: Task): Promise<void> {
    this.db.insert(tasks).values(taskToValues(task)).run();
  }

  async findById(id: string): Promise<Task | null> {
    const rows = this.db
      .select()
      .from(tasks)
      .where(eq(tasks.id, id))
      .all();
    const row = rows[0];
    if (!row) return null;
    return rowToTask(row);
  }

  async list(filter: ListTasksFilter): Promise<Task[]> {
    let rows;
    if (filter.trashed === "true") {
      rows = this.db
        .select()
        .from(tasks)
        .where(isNotNull(tasks.trashedAt))
        .all();
    } else if (filter.trashed === "false") {
      rows = this.db
        .select()
        .from(tasks)
        .where(isNull(tasks.trashedAt))
        .all();
    } else {
      rows = this.db.select().from(tasks).all();
    }
    return rows.map(rowToTask);
  }

  async update(task: Task): Promise<void> {
    this.db
      .update(tasks)
      .set(taskToValues(task))
      .where(eq(tasks.id, task.id))
      .run();
  }

  async hardDelete(id: string): Promise<void> {
    await this.db.delete(tasks).where(eq(tasks.id, id)).run();
  }

  async deleteAllTrashed(): Promise<void> {
    await this.db.delete(tasks).where(isNotNull(tasks.trashedAt)).run();
  }

  async deleteTrashOlderThan(boundaryAt: string): Promise<void> {
    await this.db
      .delete(tasks)
      .where(and(isNotNull(tasks.trashedAt), lt(tasks.trashedAt, boundaryAt)))
      .run();
  }
}
