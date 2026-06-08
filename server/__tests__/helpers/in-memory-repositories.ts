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
import type {
  FocusRepository,
  FocusSelection,
} from "../../src/data/focus-repository.js";
import type {
  Counter,
  CounterRepository,
} from "../../src/data/counter-repository.js";
import type {
  Settings,
  SettingsRepository,
} from "../../src/data/settings-repository.js";

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

/**
 * In-memory FocusRepository (BL-006 / focus-task テスト用).
 *
 * - 単一レコード前提. 初期値は `{ id: "singleton", currentTaskId: null, version: 1, updatedAt: TEST_INITIAL_TIME }`.
 * - get() は常に値を返す (singleton 保証. spec.md §「初回アクセス時の FocusSelection」).
 * - update() は version 含めて全フィールド上書き.
 * - seed() / current() はテストの直接観察 / 直接操作用ヘルパ.
 */
export class InMemoryFocusRepository implements FocusRepository {
  private state: FocusSelection = {
    id: "singleton",
    currentTaskId: null,
    updatedAt: "2026-06-07T09:00:00.000Z",
    version: 1,
  };

  async get(): Promise<FocusSelection> {
    return { ...this.state };
  }

  async update(focus: FocusSelection): Promise<void> {
    this.state = { ...focus };
  }

  /** テスト補助: 直接書き換える. */
  seed(focus: Partial<FocusSelection>): void {
    this.state = { ...this.state, ...focus };
  }

  /** テスト補助: 現在値を取り出す (await 不要). */
  current(): FocusSelection {
    return { ...this.state };
  }
}

/**
 * In-memory CounterRepository (BL-008 / completion-counter テスト用).
 *
 * - 単一レコード前提. 初期値は
 *   `{ id: "singleton", completedCount: 0, lastResetExecutedAt: null, version: 1, updatedAt: TEST_INITIAL_TIME }`.
 * - get() は常に値を返す (singleton 保証. spec.md §「Counter の初期状態」).
 * - update() は version 含めて全フィールド上書き.
 * - seed() / current() はテストの直接観察 / 直接操作用ヘルパ.
 */
export class InMemoryCounterRepository implements CounterRepository {
  private state: Counter = {
    id: "singleton",
    completedCount: 0,
    lastResetExecutedAt: null,
    updatedAt: "2026-06-07T09:00:00.000Z",
    version: 1,
  };

  async get(): Promise<Counter> {
    return { ...this.state };
  }

  async update(counter: Counter): Promise<void> {
    this.state = { ...counter };
  }

  /** テスト補助: 直接書き換える. */
  seed(counter: Partial<Counter>): void {
    this.state = { ...this.state, ...counter };
  }

  /** テスト補助: 現在値を取り出す (await 不要). */
  current(): Counter {
    return { ...this.state };
  }
}

/**
 * In-memory SettingsRepository (BL-009 / settings-day-boundary テスト用).
 *
 * - 単一レコード前提. 初期値は
 *   `{ id: "singleton", dayBoundaryTime: "04:00", updatedAt: TEST_INITIAL_TIME, version: 1 }`.
 * - get() は常に値を返す (singleton 保証. spec.md §「Settings の初期状態」).
 * - update() は version 含めて全フィールド上書き.
 * - seed() / current() はテストの直接観察 / 直接操作用ヘルパ.
 */
export class InMemorySettingsRepository implements SettingsRepository {
  private state: Settings = {
    id: "singleton",
    dayBoundaryTime: "04:00",
    updatedAt: "2026-06-07T09:00:00.000Z",
    version: 1,
  };

  async get(): Promise<Settings> {
    return { ...this.state };
  }

  async update(settings: Settings): Promise<void> {
    this.state = { ...settings };
  }

  /** テスト補助: 直接書き換える. */
  seed(settings: Partial<Settings>): void {
    this.state = { ...this.state, ...settings };
  }

  /** テスト補助: 現在値を取り出す (await 不要). */
  current(): Settings {
    return { ...this.state };
  }
}
