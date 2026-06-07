/**
 * DrizzleTaskRepository: TaskRepository の本実装 (better-sqlite3 + drizzle-orm).
 *
 * 本ファイルは test-designer 段階のスタブ.
 * implementer が drizzle-orm 経由で本実装する.
 * 型解決のためにクラスシグネチャだけを公開し, 全メソッドは `throw new Error('not implemented')` で red を担保する.
 *
 * 仕様参照:
 *   - docs/developer/features/task-crud/plan.md §処理フロー / §影響範囲 (永続化アダプタ)
 *   - docs/developer/architecture/database/schema.md §Task
 */
import type { Task } from "@todica/domain/task";
import type {
  ListTasksFilter,
  TaskRepository,
} from "../../../data/task-repository.js";

/**
 * 本実装の依存性: drizzle-orm の `BetterSQLite3Database` を受け取る.
 * test-designer 段階では型を緩く `unknown` 相当としておき, implementer が `BetterSQLite3Database`
 * (drizzle-orm/better-sqlite3) を import して厳密化する.
 */
export interface DrizzleTaskRepositoryDeps {
  /** drizzle インスタンス. 本実装で `BetterSQLite3Database<typeof schema>` に置き換える. */
  db: unknown;
}

export class DrizzleTaskRepository implements TaskRepository {
  constructor(private readonly _deps: DrizzleTaskRepositoryDeps) {}

  async insert(_task: Task): Promise<void> {
    throw new Error("not implemented: DrizzleTaskRepository.insert");
  }

  async findById(_id: string): Promise<Task | null> {
    throw new Error("not implemented: DrizzleTaskRepository.findById");
  }

  async list(_filter: ListTasksFilter): Promise<Task[]> {
    throw new Error("not implemented: DrizzleTaskRepository.list");
  }

  async update(_task: Task): Promise<void> {
    throw new Error("not implemented: DrizzleTaskRepository.update");
  }
}
