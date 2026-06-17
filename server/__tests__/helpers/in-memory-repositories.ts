/**
 * 結合テスト用の in-memory Repository 実装.
 *
 * - implementer が後で drizzle-orm + better-sqlite3 で本実装する.
 * - test-designer 段階ではテストの観点を成立させる最低限の実装に留める.
 * - これらヘルパは「テストが要求する振る舞い」を最小限満たせばよく,
 *   実装の正しさは createApp() スタブ側で担保する (= テストは赤になる).
 */
import type { Task } from "@todica/domain/task";
import type { Counter, CounterRepository } from "../../src/data/counter-repository.js";
import type { FocusRepository, FocusSelection } from "../../src/data/focus-repository.js";
import type { IdempotencyRecord, IdempotencyStore } from "../../src/data/idempotency-store.js";
import type { Project, ProjectRepository } from "../../src/data/project-repository.js";
// BL-017: RoutineRepository インターフェース（未実装のため型のみ参照）
import type { Routine, RoutineRepository } from "../../src/data/routine-repository.js";
import type { Settings, SettingsRepository } from "../../src/data/settings-repository.js";
import type { ListTasksFilter, TaskRepository } from "../../src/data/task-repository.js";

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
    const byTrashed =
      filter.trashed === "all"
        ? all
        : filter.trashed === "true"
          ? all.filter((t) => t.trashedAt !== null)
          : all.filter((t) => t.trashedAt === null);
    // BL-038 / tomorrow-view: dueDate フィルタ.
    if (filter.dueDate) {
      return byTrashed.filter((t) => t.dueDate === filter.dueDate);
    }
    return byTrashed;
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

  // BL-017: ルーティンタスク関連メソッド（TaskRepository 拡張 / plan.md D-006）

  /**
   * origin="routine" かつ dueDate="today" かつ trashedAt=null のタスクを物理削除する.
   * 翌日リセット時の前日ルーティンタスク削除に使用する（FR-033）.
   */
  async deleteRoutineTasksForToday(): Promise<void> {
    for (const [id, task] of this.store.entries()) {
      if (task.origin === "routine" && task.dueDate === "today" && task.trashedAt === null) {
        this.store.delete(id);
      }
    }
  }

  /**
   * 指定 routineId かつ dueDate="today" かつ trashedAt=null のタスクを 1 件取得する.
   * 当日分の重複生成チェックに使用する（plan.md D-004 重複生成防止）.
   */
  async findTodayRoutineTask(routineId: string): Promise<Task | null> {
    for (const task of this.store.values()) {
      if (task.routineId === routineId && task.dueDate === "today" && task.trashedAt === null) {
        return { ...task };
      }
    }
    return null;
  }

  /**
   * ルーティンタスクを起票する（origin="routine" 固定）.
   * 日次リセット時のルーティンタスク生成に使用する（FR-031）.
   */
  async createRoutineTask(input: {
    id: string;
    name: string;
    routineId: string;
    priority: "highest" | "normal" | "later";
    now: string;
  }): Promise<void> {
    const task: Task = {
      id: input.id,
      name: input.name,
      projectId: null,
      dueDate: "today",
      priority: input.priority,
      origin: "routine",
      routineId: input.routineId,
      createdAt: input.now,
      updatedAt: input.now,
      trashedAt: null,
      trashedReason: null,
      version: 1,
    };
    this.store.set(task.id, { ...task });
  }

  /**
   * 指定 routineId に紐付く未ゴミ箱タスクを物理削除する.
   * ルーティン削除時のカスケード削除に使用する（plan.md D-003）.
   */
  async deleteByRoutineId(routineId: string): Promise<void> {
    for (const [id, task] of this.store.entries()) {
      if (task.routineId === routineId && task.trashedAt === null) {
        this.store.delete(id);
      }
    }
  }

  /**
   * 指定 routineId に紐付く未ゴミ箱タスクの routineId を NULL に更新する
   * (BL-120 / FR-2 / D-4 デタッチ = カスケード NULL). ゴミ箱状態のタスクには触れない.
   * version / updatedAt は変更しない (nullifyProjectId と同型).
   */
  async nullifyRoutineId(routineId: string): Promise<void> {
    for (const [id, task] of this.store.entries()) {
      if (task.routineId === routineId && task.trashedAt === null) {
        this.store.set(id, { ...task, routineId: null });
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

// ============================================================
// BL-017: InMemoryRoutineRepository
//
// plan.md D-005 RoutineRepository インターフェースの in-memory 実装.
// テスト段階では実際の RoutineRepository インターフェースが未定義のため,
// 型は後で合わせる（実装が入ってから import 解決される）.
// ============================================================

// BL-120 (routine-soft-delete): trashedAt を任意フィールドとして許容する.
// 既存 seed (trashedAt 未指定) は通常状態 (null 相当) として扱い,
// ゴミ箱状態の Routine を seed で投入できるようにする (ProjectRecord と同型).
// domain Routine に trashedAt が入るまでの暫定型.
export interface RoutineRecord {
  id: string;
  name: string;
  daysOfWeek: number[];
  defaultPriority: "highest" | "normal" | "later";
  version: number;
  createdAt: string;
  updatedAt: string;
  trashedAt?: string | null;
}

export class InMemoryRoutineRepository implements RoutineRepository {
  private store = new Map<string, RoutineRecord>();

  async create(routine: Routine): Promise<void> {
    const r = routine as RoutineRecord;
    this.store.set(routine.id, { ...r, trashedAt: r.trashedAt ?? null });
  }

  // BL-120: 通常状態 (trashedAt が null / 未指定) のみを返す.
  async list(): Promise<Routine[]> {
    // name 昇順（BINARY コレーション相当）
    return Array.from(this.store.values())
      .filter((r) => (r.trashedAt ?? null) === null)
      .map((r) => ({ ...r, trashedAt: r.trashedAt ?? null }) as Routine)
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  }

  // BL-120: listTrashed (ゴミ箱状態 trashedAt != null のみ)
  async listTrashed(): Promise<Routine[]> {
    return Array.from(this.store.values())
      .filter((r) => (r.trashedAt ?? null) !== null)
      .map((r) => ({ ...r, trashedAt: r.trashedAt ?? null }) as Routine)
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  }

  async findById(id: string): Promise<Routine | null> {
    const r = this.store.get(id);
    return r ? ({ ...r, trashedAt: r.trashedAt ?? null } as Routine) : null;
  }

  async update(routine: Routine): Promise<void> {
    const r = routine as RoutineRecord;
    this.store.set(routine.id, { ...r, trashedAt: r.trashedAt ?? null });
  }

  async delete(id: string): Promise<void> {
    this.store.delete(id);
  }

  // BL-120: deleteAllTrashed (ゴミ箱状態を全件物理削除)
  async deleteAllTrashed(): Promise<void> {
    for (const [id, routine] of this.store.entries()) {
      if ((routine.trashedAt ?? null) !== null) {
        this.store.delete(id);
      }
    }
  }

  async findByDayOfWeek(day: number): Promise<Routine[]> {
    return Array.from(this.store.values())
      .filter((r) => (r.trashedAt ?? null) === null)
      .filter((r) => r.daysOfWeek.includes(day))
      .map((r) => ({ ...r, trashedAt: r.trashedAt ?? null }) as Routine);
  }

  /** テスト補助: 直接投入する. */
  seed(routine: RoutineRecord): void {
    this.store.set(routine.id, { ...routine });
  }

  /** テスト補助: 全件を取り出す. */
  all(): RoutineRecord[] {
    return Array.from(this.store.values()).map((r) => ({ ...r }));
  }
}

// BL-016 で使用する Project 型（ProjectRepository 拡張前の暫定定義）
// BL-119 (project-soft-delete): trashedAt を任意フィールドとして許容する.
// 既存 seed (trashedAt 未指定) は通常状態 (null 相当) として扱い,
// ゴミ箱状態の Project を seedProject で投入できるようにする.
export interface ProjectRecord {
  id: string;
  name: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  trashedAt?: string | null;
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

  // BL-016: findById (trashedAt は必須 null に正規化して返す)
  async findById(id: string): Promise<Project | null> {
    const p = this.store.get(id);
    // trashedAt 未指定の seed は通常状態 (null) として正規化する.
    return p ? { ...p, trashedAt: p.trashedAt ?? null } : null;
  }

  // BL-016: list (name 昇順, Unicode コードポイント順 = BINARY コレーション相当)
  // BL-119: 通常状態 (trashedAt が null / 未指定) のみを返す.
  async list(): Promise<Project[]> {
    return Array.from(this.store.values())
      .filter((p) => (p.trashedAt ?? null) === null)
      .map((p) => ({ ...p, trashedAt: p.trashedAt ?? null }))
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  }

  // BL-119: listTrashed (ゴミ箱状態 trashedAt != null のみ)
  async listTrashed(): Promise<Project[]> {
    return Array.from(this.store.values())
      .filter((p) => (p.trashedAt ?? null) !== null)
      .map((p) => ({ ...p, trashedAt: p.trashedAt ?? null }))
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

  // BL-119: deleteAllTrashed (ゴミ箱状態を全件物理削除)
  async deleteAllTrashed(): Promise<void> {
    for (const [id, project] of this.store.entries()) {
      if ((project.trashedAt ?? null) !== null) {
        this.store.delete(id);
        this.ids.delete(id);
      }
    }
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
