/**
 * TaskRepository インターフェース.
 *
 * 永続化機構 (better-sqlite3 + drizzle-orm) の詳細はドメインから隠す.
 * 結合テストでは in-memory 実装を注入する.
 */
import type { Task } from "@todica/domain/task";

export interface ListTasksFilter {
  /** "true" = ゴミ箱のみ, "false" = ゴミ箱以外 (既定), "all" = すべて. plan.md D-006. */
  trashed: "true" | "false" | "all";
}

export interface TaskRepository {
  insert(task: Task): Promise<void>;
  findById(id: string): Promise<Task | null>;
  list(filter: ListTasksFilter): Promise<Task[]>;
  update(task: Task): Promise<void>;
}
