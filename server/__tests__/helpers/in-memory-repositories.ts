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

  async hardDelete(id: string): Promise<void> {
    this.store.delete(id);
  }

  async deleteAllTrashed(): Promise<void> {
    for (const [id, task] of this.store.entries()) {
      if (task.trashedAt !== null) {
        this.store.delete(id);
      }
    }
  }

  async deleteTrashOlderThan(boundaryAt: string): Promise<void> {
    for (const [id, task] of this.store.entries()) {
      if (task.trashedAt !== null && task.trashedAt < boundaryAt) {
        this.store.delete(id);
      }
    }
  }

  async nullifyProjectId(projectId: string): Promise<void> {
    for (const [id, task] of this.store.entries()) {
      if (task.projectId === projectId) {
        this.store.set(id, { ...task, projectId: null });
      }
    }
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

// BL-016 で使用する Project 型（ProjectRepository 拡張前の暫定定義）
export interface ProjectRecord {
  id: string;
  name: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export class InMemoryProjectRepository implements ProjectRepository {
  private ids = new Set<string>();
  // BL-016: フル CRUD 対応のストア
  private store = new Map<string, ProjectRecord>();

  async exists(id: string): Promise<boolean> {
    // BL-016 実装後は store を参照する. それまでは ids を参照する.
    if (this.store.has(id)) return true;
    return this.ids.has(id);
  }

  // BL-016: insert
  async insert(project: ProjectRecord): Promise<void> {
    this.store.set(project.id, { ...project });
    this.ids.add(project.id);
  }

  // BL-016: findById
  async findById(id: string): Promise<ProjectRecord | null> {
    const p = this.store.get(id);
    return p ? { ...p } : null;
  }

  // BL-016: list (name 昇順, Unicode コードポイント順 = BINARY コレーション相当)
  async list(): Promise<ProjectRecord[]> {
    return Array.from(this.store.values())
      .map((p) => ({ ...p }))
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  }

  // BL-016: update
  async update(project: ProjectRecord): Promise<void> {
    this.store.set(project.id, { ...project });
  }

  // BL-016: delete (物理削除)
  async delete(id: string): Promise<void> {
    this.store.delete(id);
    this.ids.delete(id);
  }

  /** テスト補助: ID のみで seed（既存 BL-001 tests 互換）. */
  seed(id: string): void {
    this.ids.add(id);
  }

  /** テスト補助: フル ProjectRecord で seed（BL-016 tests 用）. */
  seedProject(project: ProjectRecord): void {
    this.store.set(project.id, { ...project });
    this.ids.add(project.id);
  }

  /** テスト補助: 全件を取り出す. */
  all(): ProjectRecord[] {
    return Array.from(this.store.values()).map((p) => ({ ...p }));
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
    // 初期値をリセット済み扱いにする。
    // "2026-06-07T09:00:00.000Z" は dayBoundaryTime="04:00" の境界 "2026-06-07T04:00:00.000Z" より後なので
    // 「当日はリセット済み」とみなされ、自動リセットが誤って起動しない。
    // テストが明示的に null を seed した場合は「初回 / 前日以前リセット」として自動リセットが発動する。
    lastResetExecutedAt: "2026-06-07T09:00:00.000Z",
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
