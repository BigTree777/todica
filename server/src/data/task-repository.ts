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
  /** 指定 ID のタスクを物理削除する（ゴミ箱に入っているかどうかに関わらず削除）。 */
  hardDelete(id: string): Promise<void>;
  /** ゴミ箱タスク（trashedAt != null）を全件物理削除する。 */
  deleteAllTrashed(): Promise<void>;
  /** trashedAt が boundaryAt より古いゴミ箱タスクを物理削除する（日次清算用）。 */
  deleteTrashOlderThan(boundaryAt: string): Promise<void>;
  /**
   * 指定プロジェクトに紐付くタスクの projectId を null に更新する (BL-016 / FR-022 カスケード NULL).
   * version / updatedAt は変更しない.
   */
  nullifyProjectId(projectId: string): Promise<void>;
}
