import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
/**
 * 単体テスト: DrizzleProjectRepository (better-sqlite3 + drizzle-orm).
 *
 * 受け入れ基準の出典:
 *   - docs/developer/features/project-trash/spec.md §「ゴミ箱送り」「復元」「物理削除」
 *   - FR-061: Project の削除は論理削除 (trashed_at セット) であり, ゴミ箱に出て復元可能.
 *
 * 本テストは ProjectRepository インターフェース (server/src/data/project-repository.ts) の
 * Drizzle 具象実装 = DrizzleProjectRepository に対する単体テスト.
 *
 * - in-memory SQLite (`new Database(":memory:")`) を直接立てる.
 * - drizzle-orm/better-sqlite3 でラップして DrizzleProjectRepository に渡す.
 * - 本テスト内で CREATE TABLE を発行する (カラム名は schema.ts §projects と一致).
 *
 * 目的: 実 Drizzle 経路 (better-sqlite3) で trashed_at の取り回しを構造的に被覆する.
 *   - list は trashed_at IS NULL のみ返す.
 *   - listTrashed は trashed_at IS NOT NULL のみ返す.
 *   - 論理削除 (update で trashed_at セット) 後, list から消えて listTrashed に出る.
 *   - deleteAllTrashed で trashed_at != null の project が物理削除される.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Project } from "../../src/data/project-repository.js";
import { schema } from "../../src/db/schema.js";
import { DrizzleProjectRepository } from "../../src/infra/persistence/drizzle/drizzle-project-repository.js";

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const PROJECT_ID_2 = "22222222-2222-4222-8222-222222222222";
const PROJECT_ID_3 = "33333333-3333-4333-8333-333333333333";
const CREATED = "2026-06-07T09:00:00.000Z";
const LATER = "2026-06-07T10:00:00.000Z";

/**
 * projects テーブル定義の最低限を CREATE TABLE で立てる.
 * カラム名は server/src/db/schema.ts §projects と一致させる (snake_case).
 */
const CREATE_PROJECTS_SQL = `
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  trashed_at TEXT,
  version INTEGER NOT NULL DEFAULT 1
);
`;

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: PROJECT_ID,
    name: "仕事",
    version: 1,
    createdAt: CREATED,
    updatedAt: CREATED,
    trashedAt: null,
    ...overrides,
  };
}

let sqlite: Database.Database;
let repo: DrizzleProjectRepository;

beforeEach(() => {
  sqlite = new Database(":memory:");
  sqlite.exec(CREATE_PROJECTS_SQL);
  const db = drizzle(sqlite, { schema });
  repo = new DrizzleProjectRepository({ db });
});

afterEach(() => {
  sqlite.close();
});

describe("DrizzleProjectRepository", () => {
  it("insert で 1 件挿入したものを findById で取得できる (返却データが入力と一致)", async () => {
    const input = makeProject({ name: "趣味" });
    await repo.insert(input);

    const found = await repo.findById(input.id);
    expect(found).not.toBeNull();
    expect(found).toMatchObject({
      id: input.id,
      name: input.name,
      version: input.version,
      createdAt: input.createdAt,
      updatedAt: input.updatedAt,
      trashedAt: input.trashedAt,
    });
  });

  it("update で name / version / updatedAt が更新され, createdAt は不変", async () => {
    const initial = makeProject({ version: 1, createdAt: CREATED, updatedAt: CREATED });
    await repo.insert(initial);

    const updated: Project = { ...initial, name: "edited", updatedAt: LATER, version: 2 };
    await repo.update(updated);

    const found = await repo.findById(initial.id);
    expect(found?.name).toBe("edited");
    expect(found?.version).toBe(2);
    expect(found?.updatedAt).toBe(LATER);
    expect(found?.createdAt).toBe(CREATED);
  });

  it("list は trashed_at IS NULL のみ返す (ゴミ箱状態を除外)", async () => {
    const active = makeProject({ id: PROJECT_ID, trashedAt: null });
    const trashed = makeProject({
      id: PROJECT_ID_2,
      name: "削除済み",
      trashedAt: LATER,
      version: 2,
    });
    await repo.insert(active);
    await repo.insert(trashed);

    const list = await repo.list();
    const ids = list.map((p) => p.id);
    expect(ids).toContain(PROJECT_ID);
    expect(ids).not.toContain(PROJECT_ID_2);
  });

  it("listTrashed は trashed_at IS NOT NULL のみ返す (ゴミ箱状態のみ)", async () => {
    const active = makeProject({ id: PROJECT_ID, trashedAt: null });
    const trashed = makeProject({
      id: PROJECT_ID_2,
      name: "削除済み",
      trashedAt: LATER,
      version: 2,
    });
    await repo.insert(active);
    await repo.insert(trashed);

    const list = await repo.listTrashed();
    const ids = list.map((p) => p.id);
    expect(ids).not.toContain(PROJECT_ID);
    expect(ids).toContain(PROJECT_ID_2);
  });

  // FR-061: 論理削除 (trashed_at セット) で list から消え, listTrashed に出る.
  it("論理削除 (update で trashed_at セット) 後, list から消えて listTrashed に出る", async () => {
    const initial = makeProject({ id: PROJECT_ID, trashedAt: null, version: 1 });
    await repo.insert(initial);

    // 論理削除前: list に出る / listTrashed に出ない.
    expect((await repo.list()).map((p) => p.id)).toContain(PROJECT_ID);
    expect((await repo.listTrashed()).map((p) => p.id)).not.toContain(PROJECT_ID);

    // 論理削除: trashed_at をセットし version+1.
    await repo.update({ ...initial, trashedAt: LATER, updatedAt: LATER, version: 2 });

    // 論理削除後: list から消え / listTrashed に出る.
    expect((await repo.list()).map((p) => p.id)).not.toContain(PROJECT_ID);
    const trashedList = await repo.listTrashed();
    expect(trashedList.map((p) => p.id)).toContain(PROJECT_ID);
    // 物理削除されていない (findById で取得でき, trashedAt が保持される).
    const found = await repo.findById(PROJECT_ID);
    expect(found).not.toBeNull();
    expect(found?.trashedAt).toBe(LATER);
  });

  it("deleteAllTrashed で trashed_at != null の project が全削除され, trashed_at = null は残る", async () => {
    const active = makeProject({ id: PROJECT_ID, trashedAt: null });
    const trashed1 = makeProject({ id: PROJECT_ID_2, name: "削除1", trashedAt: LATER, version: 2 });
    const trashed2 = makeProject({
      id: PROJECT_ID_3,
      name: "削除2",
      trashedAt: CREATED,
      version: 2,
    });
    await repo.insert(active);
    await repo.insert(trashed1);
    await repo.insert(trashed2);

    await repo.deleteAllTrashed();

    expect(await repo.findById(PROJECT_ID)).not.toBeNull();
    expect(await repo.findById(PROJECT_ID_2)).toBeNull();
    expect(await repo.findById(PROJECT_ID_3)).toBeNull();
  });
});
