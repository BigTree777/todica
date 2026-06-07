/**
 * 結合テスト用の in-memory Repository 実装.
 *
 * - implementer が後で drizzle-orm + better-sqlite3 で本実装する.
 * - test-designer 段階ではテストの観点を成立させる最低限の実装に留める.
 * - これらヘルパは「テストが要求する振る舞い」を最小限満たせばよく,
 *   実装の正しさは createApp() スタブ側で担保する (= テストは赤になる).
 */
import type { Task } from "@todica/domain/task";
import type {
  ListTasksFilter,
  TaskRepository,
} from "../../src/data/task-repository.js";
import type { ProjectRepository } from "../../src/data/project-repository.js";
import type {
  IdempotencyRecord,
  IdempotencyStore,
} from "../../src/data/idempotency-store.js";

export class InMemoryTaskRepository implements TaskRepository {
  private store = new Map<string, Task>();

  async insert(task: Task): Promise<void> {
    this.store.set(task.id, { ...task });
  }

  async findById(id: string): Promise<Task | null> {
    const t = this.store.get(id);
    return t ? { ...t } : null;
  }

  async list(filter: ListTasksFilter): Promise<Task[]> {
    const all = Array.from(this.store.values()).map((t) => ({ ...t }));
    if (filter.trashed === "all") return all;
    if (filter.trashed === "true") return all.filter((t) => t.trashedAt !== null);
    return all.filter((t) => t.trashedAt === null);
  }

  async update(task: Task): Promise<void> {
    this.store.set(task.id, { ...task });
  }

  /** テスト補助: 直接投入する. */
  seed(task: Task): void {
    this.store.set(task.id, { ...task });
  }

  /** テスト補助: 全件を取り出す. */
  all(): Task[] {
    return Array.from(this.store.values()).map((t) => ({ ...t }));
  }
}

export class InMemoryProjectRepository implements ProjectRepository {
  private ids = new Set<string>();

  async exists(id: string): Promise<boolean> {
    return this.ids.has(id);
  }

  seed(id: string): void {
    this.ids.add(id);
  }
}

export class InMemoryIdempotencyStore implements IdempotencyStore {
  private store = new Map<string, IdempotencyRecord>();

  async get(key: string): Promise<IdempotencyRecord | null> {
    return this.store.get(key) ?? null;
  }

  async save(key: string, record: IdempotencyRecord): Promise<void> {
    this.store.set(key, record);
  }
}
