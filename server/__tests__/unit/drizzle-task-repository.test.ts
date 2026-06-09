/**
 * 単体テスト: DrizzleTaskRepository (better-sqlite3 + drizzle-orm).
 *
 * 受け入れ基準の出典:
 *   - docs/developer/features/task-crud/spec.md §「期限切替」「削除」「名称編集」
 *   - docs/developer/features/task-crud/plan.md §処理フロー / §影響範囲 (永続化アダプタ)
 *
 * 本テストは TaskRepository インターフェース (server/src/data/task-repository.ts) の
 * Drizzle 具象実装 = DrizzleTaskRepository に対する単体テスト.
 *
 * - in-memory SQLite (`new Database(":memory:")`) を直接立てる.
 * - drizzle-orm/better-sqlite3 でラップして DrizzleTaskRepository に渡す.
 * - 本テスト内で CREATE TABLE を発行する (drizzle スキーマは implementer が確定するため,
 *   本ファイルは「最低限テーブルがあればよい」レベルの SQL を持つ).
 *
 * 現状: DrizzleTaskRepository は全メソッドが throw のスタブ. 全テストが red になる想定.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import type { Task } from "@todica/domain/task";
import { schema } from "../../src/db/schema.js";
import { DrizzleTaskRepository } from "../../src/infra/persistence/drizzle/task-repository.js";

const TASK_ID = "11111111-1111-4111-8111-111111111111";
const TASK_ID_2 = "22222222-2222-4222-8222-222222222222";
const CREATED = "2026-06-07T09:00:00.000Z";
const LATER = "2026-06-07T10:00:00.000Z";

/**
 * 本実装で使うことになるテーブル定義の最低限を CREATE TABLE で立てる.
 * カラム名は schema.md §Task と一致させる (snake_case).
 */
const CREATE_TASKS_SQL = `
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  project_id TEXT,
  due_date TEXT NOT NULL,
  priority TEXT NOT NULL,
  origin TEXT NOT NULL,
  routine_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  trashed_at TEXT,
  trashed_reason TEXT,
  version INTEGER NOT NULL DEFAULT 1
);
`;

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: TASK_ID,
    name: "牛乳を買う",
    projectId: null,
    dueDate: "today",
    priority: "normal",
    origin: "manual",
    routineId: null,
    createdAt: CREATED,
    updatedAt: CREATED,
    trashedAt: null,
    trashedReason: null,
    version: 1,
    ...overrides,
  };
}

let sqlite: Database.Database;
let repo: DrizzleTaskRepository;

beforeEach(() => {
  sqlite = new Database(":memory:");
  sqlite.exec(CREATE_TASKS_SQL);
  const db = drizzle(sqlite, { schema });
  repo = new DrizzleTaskRepository({ db });
});

afterEach(() => {
  sqlite.close();
});

describe("DrizzleTaskRepository", () => {
  it("insert で 1 件挿入したものを findById で取得できる (返却データが入力と一致)", async () => {
    const input = makeTask({ name: "豆乳を買う" });
    await repo.insert(input);

    const found = await repo.findById(input.id);
    expect(found).not.toBeNull();
    // 返却データの全フィールドが入力と一致 (順序非依存)
    expect(found).toMatchObject({
      id: input.id,
      name: input.name,
      projectId: input.projectId,
      dueDate: input.dueDate,
      priority: input.priority,
      origin: input.origin,
      routineId: input.routineId,
      createdAt: input.createdAt,
      updatedAt: input.updatedAt,
      trashedAt: input.trashedAt,
      trashedReason: input.trashedReason,
      version: input.version,
    });
  });

  it("update で version + 1, updatedAt 更新, createdAt 不変", async () => {
    const initial = makeTask({ version: 1, createdAt: CREATED, updatedAt: CREATED });
    await repo.insert(initial);

    const updated: Task = {
      ...initial,
      name: "edited",
      updatedAt: LATER,
      version: 2,
    };
    await repo.update(updated);

    const found = await repo.findById(initial.id);
    expect(found?.name).toBe("edited");
    expect(found?.version).toBe(2);
    expect(found?.updatedAt).toBe(LATER);
    // createdAt は不変 (= 最初の値のまま)
    expect(found?.createdAt).toBe(CREATED);
  });

  it("update (trash 化) で trashedAt がセットされる (論理削除)", async () => {
    const initial = makeTask({ trashedAt: null, trashedReason: null, version: 1 });
    await repo.insert(initial);

    const trashed: Task = {
      ...initial,
      trashedAt: LATER,
      trashedReason: "deleted",
      updatedAt: LATER,
      version: 2,
    };
    await repo.update(trashed);

    const found = await repo.findById(initial.id);
    expect(found?.trashedAt).toBe(LATER);
    expect(found?.trashedReason).toBe("deleted");
    // 物理削除されていないことを担保
    expect(found).not.toBeNull();
  });

  it("list({ trashed: 'false' }) でゴミ箱状態を除外する", async () => {
    const active = makeTask({ id: TASK_ID, trashedAt: null });
    const trashed = makeTask({
      id: TASK_ID_2,
      trashedAt: LATER,
      trashedReason: "deleted",
    });
    await repo.insert(active);
    await repo.insert(trashed);

    const list = await repo.list({ trashed: "false" });
    const ids = list.map((t) => t.id);
    expect(ids).toContain(TASK_ID);
    expect(ids).not.toContain(TASK_ID_2);
  });

  it("list({ trashed: 'true' }) でゴミ箱状態のみ返す", async () => {
    const active = makeTask({ id: TASK_ID, trashedAt: null });
    const trashed = makeTask({
      id: TASK_ID_2,
      trashedAt: LATER,
      trashedReason: "deleted",
    });
    await repo.insert(active);
    await repo.insert(trashed);

    const list = await repo.list({ trashed: "true" });
    const ids = list.map((t) => t.id);
    expect(ids).not.toContain(TASK_ID);
    expect(ids).toContain(TASK_ID_2);
  });

  it("hardDelete(id) で指定 ID のタスクが削除される。他タスクは残る", async () => {
    const task1 = makeTask({ id: TASK_ID });
    const task2 = makeTask({ id: TASK_ID_2, name: "残すタスク" });
    await repo.insert(task1);
    await repo.insert(task2);

    await repo.hardDelete(TASK_ID);

    expect(await repo.findById(TASK_ID)).toBeNull();
    expect(await repo.findById(TASK_ID_2)).not.toBeNull();
  });

  it("deleteAllTrashed() で trashedAt != null のタスクが全削除される。trashedAt = null のタスクは残る", async () => {
    const TASK_ID_3 = "33333333-3333-4333-8333-333333333333";
    const active = makeTask({ id: TASK_ID, trashedAt: null });
    const trashed1 = makeTask({ id: TASK_ID_2, trashedAt: LATER, trashedReason: "deleted" });
    const trashed2 = makeTask({ id: TASK_ID_3, trashedAt: CREATED, trashedReason: "completed" });
    await repo.insert(active);
    await repo.insert(trashed1);
    await repo.insert(trashed2);

    await repo.deleteAllTrashed();

    expect(await repo.findById(TASK_ID)).not.toBeNull();
    expect(await repo.findById(TASK_ID_2)).toBeNull();
    expect(await repo.findById(TASK_ID_3)).toBeNull();
  });

  it("deleteTrashOlderThan(boundaryAt) で trashedAt < boundaryAt のタスクが削除される", async () => {
    const TASK_ID_3 = "33333333-3333-4333-8333-333333333333";
    const TASK_ID_4 = "44444444-4444-4444-8444-444444444444";
    const BOUNDARY = "2026-06-07T09:30:00.000Z";
    // CREATED = "2026-06-07T09:00:00.000Z" < BOUNDARY → 削除対象
    const oldTrashed = makeTask({ id: TASK_ID, trashedAt: CREATED, trashedReason: "deleted" });
    // LATER = "2026-06-07T10:00:00.000Z" >= BOUNDARY → 残る
    const newTrashed = makeTask({ id: TASK_ID_2, trashedAt: LATER, trashedReason: "completed" });
    // 境界値: ちょうど BOUNDARY と等しい → 削除されない
    const boundaryTrashed = makeTask({ id: TASK_ID_3, trashedAt: BOUNDARY, trashedReason: "deleted" });
    // trashedAt = null → 削除されない
    const active = makeTask({ id: TASK_ID_4, trashedAt: null });

    await repo.insert(oldTrashed);
    await repo.insert(newTrashed);
    await repo.insert(boundaryTrashed);
    await repo.insert(active);

    await repo.deleteTrashOlderThan(BOUNDARY);

    expect(await repo.findById(TASK_ID)).toBeNull();
    expect(await repo.findById(TASK_ID_2)).not.toBeNull();
    expect(await repo.findById(TASK_ID_3)).not.toBeNull();
    expect(await repo.findById(TASK_ID_4)).not.toBeNull();
  });
});
