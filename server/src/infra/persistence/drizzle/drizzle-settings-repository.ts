/**
 * DrizzleSettingsRepository: SettingsRepository の本実装 (better-sqlite3 + drizzle-orm).
 *
 * 仕様参照:
 *   - docs/developer/features/settings-day-boundary/spec.md
 *   - docs/developer/features/settings-day-boundary/plan.md §「データモデル」/ D-002
 *
 * 設計:
 *   - 単一レコード前提 (id = "singleton").
 *   - get() 時に存在しなければ初期値 ({ dayBoundaryTime: "04:00", version: 1 }) を upsert して返す.
 *   - update() は version 含めて全フィールドを上書き (アプリ層が dayBoundaryTime / version+1 /
 *     updatedAt 更新済).
 */
import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type { Settings, SettingsRepository } from "../../../data/settings-repository.js";
import { type schema, settings } from "../../../db/schema.js";

const SINGLETON_ID = "singleton";

export interface DrizzleSettingsRepositoryDeps {
  db: BetterSQLite3Database<typeof schema>;
}

export class DrizzleSettingsRepository implements SettingsRepository {
  private readonly db: BetterSQLite3Database<typeof schema>;

  constructor(deps: DrizzleSettingsRepositoryDeps) {
    this.db = deps.db;
  }

  async get(): Promise<Settings> {
    const rows = this.db.select().from(settings).where(eq(settings.id, SINGLETON_ID)).all();
    const row = rows[0];
    if (row) {
      return {
        id: row.id,
        dayBoundaryTime: row.dayBoundaryTime,
        updatedAt: row.updatedAt,
        version: row.version,
      };
    }
    // 不在ならば初期値 INSERT.
    const now = new Date().toISOString();
    const initial: Settings = {
      id: SINGLETON_ID,
      dayBoundaryTime: "04:00",
      updatedAt: now,
      version: 1,
    };
    this.db
      .insert(settings)
      .values({
        id: initial.id,
        dayBoundaryTime: initial.dayBoundaryTime,
        updatedAt: initial.updatedAt,
        version: initial.version,
      })
      .onConflictDoNothing({ target: settings.id })
      .run();
    return initial;
  }

  async update(value: Settings): Promise<void> {
    // upsert: 既存があれば全フィールド上書き. 無ければ新規 INSERT.
    this.db
      .insert(settings)
      .values({
        id: value.id,
        dayBoundaryTime: value.dayBoundaryTime,
        updatedAt: value.updatedAt,
        version: value.version,
      })
      .onConflictDoUpdate({
        target: settings.id,
        set: {
          dayBoundaryTime: value.dayBoundaryTime,
          updatedAt: value.updatedAt,
          version: value.version,
        },
      })
      .run();
  }
}
