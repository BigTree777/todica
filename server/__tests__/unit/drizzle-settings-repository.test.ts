/**
 * 単体テスト: DrizzleSettingsRepository (better-sqlite3 + drizzle-orm).
 *
 * 受け入れ基準の出典:
 *   - docs/developer/features/settings-day-boundary/spec.md
 *   - docs/developer/features/settings-day-boundary/plan.md §「データモデル」/ D-002
 *
 * NFR-012 の代替検証: DB レベルで永続化されることを確認する.
 *
 * - in-memory SQLite (`new Database(":memory:")`) を直接立てる.
 * - drizzle-orm/better-sqlite3 でラップして DrizzleSettingsRepository に渡す.
 * - 本テスト内で CREATE TABLE を発行する.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { DrizzleSettingsRepository } from "../../src/infra/persistence/drizzle/settings-repository.js";
import { schema } from "../../src/db/schema.js";

const CREATE_SETTINGS_SQL = `
CREATE TABLE IF NOT EXISTS settings (
  id TEXT PRIMARY KEY NOT NULL,
  day_boundary_time TEXT NOT NULL DEFAULT '04:00',
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);
`;

let sqlite: Database.Database;
let repo: DrizzleSettingsRepository;

beforeEach(() => {
  sqlite = new Database(":memory:");
  sqlite.exec(CREATE_SETTINGS_SQL);
  const db = drizzle(sqlite, { schema });
  repo = new DrizzleSettingsRepository({ db });
});

afterEach(() => {
  sqlite.close();
});

describe("DrizzleSettingsRepository", () => {
  it("get() が初回呼び出し時に dayBoundaryTime = '04:00', version = 1 を返す", async () => {
    const result = await repo.get();

    expect(result.dayBoundaryTime).toBe("04:00");
    expect(result.version).toBe(1);
    expect(result.id).toBe("singleton");
    expect(result.updatedAt).toBeTruthy();
  });

  it("update() 後に get() を呼ぶと更新された値が返る（NFR-012: DB レベル永続化）", async () => {
    // 初回 get() で singleton レコードを生成する.
    const initial = await repo.get();
    expect(initial.dayBoundaryTime).toBe("04:00");

    // update() で dayBoundaryTime を変更する.
    const updated = {
      ...initial,
      dayBoundaryTime: "06:00",
      version: initial.version + 1,
      updatedAt: new Date().toISOString(),
    };
    await repo.update(updated);

    // get() で更新後の値が返ることを確認する.
    const result = await repo.get();
    expect(result.dayBoundaryTime).toBe("06:00");
    expect(result.version).toBe(2);
  });
});
