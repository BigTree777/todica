import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
/**
 * 単体テスト: DrizzleRoutineRepository (better-sqlite3 + drizzle-orm) の trashed_at 取り回し.
 *
 * 受け入れ基準の出典:
 *   - docs/developer/features/routine-soft-delete/spec.md AC-13
 *     (server schema に trashed_at が追加され既存レコードは NULL 初期化される).
 *   - FR-8 / FR-9: Routine の削除は論理削除 (trashed_at セット) であり, list から除外され
 *     listTrashed に出る. 既存レコードの trashed_at は NULL である.
 *
 * 本テストは RoutineRepository インターフェース (server/src/data/routine-repository.ts) の
 * Drizzle 具象実装 = DrizzleRoutineRepository に対する単体テスト (drizzle-project-repository.test.ts と同型).
 *
 * - in-memory SQLite (`new Database(":memory:")`) を直接立てる.
 * - drizzle-orm/better-sqlite3 でラップして DrizzleRoutineRepository に渡す.
 * - 本テスト内で CREATE TABLE を発行する (カラム名は schema.ts §routines と一致 / trashed_at 含む).
 *
 * 目的: 実 Drizzle 経路 (better-sqlite3) で trashed_at の取り回しを構造的に被覆する.
 *   - insert (trashed_at=NULL) → findById で trashedAt=null が読める.
 *   - list は trashed_at IS NULL のみ返す.
 *   - listTrashed は trashed_at IS NOT NULL のみ返す.
 *   - 論理削除 (update で trashed_at セット) 後, list から消えて listTrashed に出る.
 *   - deleteAllTrashed で trashed_at != null の routine が物理削除される.
 *
 * 注意: 本ファイルは TDD の "red" を作るためのテスト.
 *       schema.ts §routines / DrizzleRoutineRepository は trashed_at を扱っていないため,
 *       trashedAt を読めず / list の絞り込みが無く / listTrashed / deleteAllTrashed が
 *       未実装のため red になる想定. implementer が schema + repository を拡張して green 化する.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Routine } from "../../src/data/routine-repository.js";
import { schema } from "../../src/db/schema.js";
import { DrizzleRoutineRepository } from "../../src/infra/persistence/drizzle/drizzle-routine-repository.js";

const ROUTINE_ID = "11111111-1111-4111-8111-111111111111";
const ROUTINE_ID_2 = "22222222-2222-4222-8222-222222222222";
const ROUTINE_ID_3 = "33333333-3333-4333-8333-333333333333";
const CREATED = "2026-06-07T09:00:00.000Z";
const LATER = "2026-06-07T10:00:00.000Z";

/**
 * routines テーブル定義を CREATE TABLE で立てる.
 * カラム名は server/src/db/schema.ts §routines と一致させる (snake_case / trashed_at 含む).
 */
const CREATE_ROUTINES_SQL = `
CREATE TABLE IF NOT EXISTS routines (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  days_of_week TEXT NOT NULL,
  default_priority TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  trashed_at TEXT
);
`;

// AC-13: 既存レコード (trashed_at カラム導入前) を再現するための CREATE TABLE
// (trashed_at カラムを持たない旧スキーマ). drizzle migration 適用後は trashed_at が
// 追加され NULL 初期化される, という挙動を表で検証する代わりに,
// 「trashed_at 列を持つ表へ既存行が挿入されたとき trashedAt=null として読める」ことで AC-13 を被覆する.

function makeRoutine(overrides: Partial<Routine> = {}): Routine {
  return {
    id: ROUTINE_ID,
    name: "朝の運動",
    daysOfWeek: [1, 2, 3],
    defaultPriority: "normal",
    version: 1,
    createdAt: CREATED,
    updatedAt: CREATED,
    // domain Routine に trashedAt が追加されたら必須になる. それまでは任意フィールド.
    trashedAt: null,
    ...overrides,
  } as Routine;
}

let sqlite: Database.Database;
let repo: DrizzleRoutineRepository;

beforeEach(() => {
  sqlite = new Database(":memory:");
  sqlite.exec(CREATE_ROUTINES_SQL);
  const db = drizzle(sqlite, { schema });
  repo = new DrizzleRoutineRepository({ db });
});

afterEach(() => {
  sqlite.close();
});

describe("DrizzleRoutineRepository (trashed_at 取り回し / AC-13)", () => {
  it("create で挿入したものを findById で取得でき trashedAt=null が読める (AC-13 NULL 初期化)", async () => {
    const input = makeRoutine({ name: "趣味のルーティン" });
    await repo.create(input);

    const found = await repo.findById(input.id);
    expect(found).not.toBeNull();
    expect(found?.name).toBe("趣味のルーティン");
    expect(found?.version).toBe(1);
    // trashed_at は NULL 初期化されている.
    expect((found as unknown as { trashedAt: string | null })?.trashedAt).toBeNull();
  });

  it("list は trashed_at IS NULL のみ返す (ゴミ箱状態を除外)", async () => {
    const active = makeRoutine({ id: ROUTINE_ID, trashedAt: null });
    const trashed = makeRoutine({
      id: ROUTINE_ID_2,
      name: "削除済み",
      trashedAt: LATER,
      version: 2,
    });
    await repo.create(active);
    await repo.create(trashed);

    const list = await repo.list();
    const ids = list.map((r) => r.id);
    expect(ids).toContain(ROUTINE_ID);
    expect(ids).not.toContain(ROUTINE_ID_2);
  });

  it("listTrashed は trashed_at IS NOT NULL のみ返す (ゴミ箱状態のみ)", async () => {
    const active = makeRoutine({ id: ROUTINE_ID, trashedAt: null });
    const trashed = makeRoutine({
      id: ROUTINE_ID_2,
      name: "削除済み",
      trashedAt: LATER,
      version: 2,
    });
    await repo.create(active);
    await repo.create(trashed);

    const list = await repo.listTrashed();
    const ids = list.map((r) => r.id);
    expect(ids).not.toContain(ROUTINE_ID);
    expect(ids).toContain(ROUTINE_ID_2);
  });

  // FR-8: 論理削除 (trashed_at セット) で list から消え, listTrashed に出る.
  it("論理削除 (update で trashed_at セット) 後, list から消えて listTrashed に出る", async () => {
    const initial = makeRoutine({ id: ROUTINE_ID, trashedAt: null, version: 1 });
    await repo.create(initial);

    // 論理削除前: list に出る / listTrashed に出ない.
    expect((await repo.list()).map((r) => r.id)).toContain(ROUTINE_ID);
    expect((await repo.listTrashed()).map((r) => r.id)).not.toContain(ROUTINE_ID);

    // 論理削除: trashed_at をセットし version+1.
    await repo.update(
      makeRoutine({ id: ROUTINE_ID, trashedAt: LATER, updatedAt: LATER, version: 2 }),
    );

    // 論理削除後: list から消え / listTrashed に出る.
    expect((await repo.list()).map((r) => r.id)).not.toContain(ROUTINE_ID);
    const trashedList = await repo.listTrashed();
    expect(trashedList.map((r) => r.id)).toContain(ROUTINE_ID);
    // 物理削除されていない (findById で取得でき, trashedAt が保持される).
    const found = await repo.findById(ROUTINE_ID);
    expect(found).not.toBeNull();
    expect((found as unknown as { trashedAt: string | null })?.trashedAt).toBe(LATER);
  });

  it("deleteAllTrashed で trashed_at != null の routine が全削除され, trashed_at = null は残る", async () => {
    const active = makeRoutine({ id: ROUTINE_ID, trashedAt: null });
    const trashed1 = makeRoutine({ id: ROUTINE_ID_2, name: "削除1", trashedAt: LATER, version: 2 });
    const trashed2 = makeRoutine({
      id: ROUTINE_ID_3,
      name: "削除2",
      trashedAt: CREATED,
      version: 2,
    });
    await repo.create(active);
    await repo.create(trashed1);
    await repo.create(trashed2);

    await repo.deleteAllTrashed();

    expect(await repo.findById(ROUTINE_ID)).not.toBeNull();
    expect(await repo.findById(ROUTINE_ID_2)).toBeNull();
    expect(await repo.findById(ROUTINE_ID_3)).toBeNull();
  });

  it("findByDayOfWeek はゴミ箱状態の Routine を返さない (日次リセットで生成させない)", async () => {
    const active = makeRoutine({ id: ROUTINE_ID, daysOfWeek: [1], trashedAt: null });
    const trashed = makeRoutine({
      id: ROUTINE_ID_2,
      name: "削除済み",
      daysOfWeek: [1],
      trashedAt: LATER,
      version: 2,
    });
    await repo.create(active);
    await repo.create(trashed);

    const onMonday = await repo.findByDayOfWeek(1);
    const ids = onMonday.map((r) => r.id);
    expect(ids).toContain(ROUTINE_ID);
    expect(ids).not.toContain(ROUTINE_ID_2);
  });
});
