/**
 * DrizzleCounterRepository: CounterRepository の本実装 (better-sqlite3 + drizzle-orm).
 *
 * 仕様参照:
 *   - docs/developer/features/completion-counter/spec.md
 *   - docs/developer/features/completion-counter/plan.md §「データモデル」/ D-001 / D-004 / D-010
 *
 * 設計:
 *   - 単一レコード前提 (id = "singleton").
 *   - get() 時に存在しなければ初期値 ({ completedCount: 0, lastResetExecutedAt: null, version: 1 })
 *     を upsert して返す (FocusRepository と同一パターン).
 *   - update() は version 含めて全フィールドを上書き (アプリ層が completedCount +1 / version+1 /
 *     updatedAt 更新済).
 */
import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type {
  Counter,
  CounterRepository,
} from "../../../data/counter-repository.js";
import { counter, schema } from "../../../db/schema.js";

const SINGLETON_ID = "singleton";

export interface DrizzleCounterRepositoryDeps {
  db: BetterSQLite3Database<typeof schema>;
}

export class DrizzleCounterRepository implements CounterRepository {
  private readonly db: BetterSQLite3Database<typeof schema>;

  constructor(deps: DrizzleCounterRepositoryDeps) {
    this.db = deps.db;
  }

  async get(): Promise<Counter> {
    const rows = this.db
      .select()
      .from(counter)
      .where(eq(counter.id, SINGLETON_ID))
      .all();
    const row = rows[0];
    if (row) {
      return {
        id: row.id,
        completedCount: row.completedCount,
        lastResetExecutedAt: row.lastResetExecutedAt,
        updatedAt: row.updatedAt,
        version: row.version,
      };
    }
    // 不在ならば初期値 INSERT.
    const now = new Date().toISOString();
    const initial: Counter = {
      id: SINGLETON_ID,
      completedCount: 0,
      lastResetExecutedAt: null,
      updatedAt: now,
      version: 1,
    };
    this.db
      .insert(counter)
      .values({
        id: initial.id,
        completedCount: initial.completedCount,
        lastResetExecutedAt: initial.lastResetExecutedAt,
        updatedAt: initial.updatedAt,
        version: initial.version,
      })
      .onConflictDoNothing({ target: counter.id })
      .run();
    return initial;
  }

  async update(value: Counter): Promise<void> {
    // upsert: 既存があれば全フィールド上書き. 無ければ新規 INSERT.
    this.db
      .insert(counter)
      .values({
        id: value.id,
        completedCount: value.completedCount,
        lastResetExecutedAt: value.lastResetExecutedAt,
        updatedAt: value.updatedAt,
        version: value.version,
      })
      .onConflictDoUpdate({
        target: counter.id,
        set: {
          completedCount: value.completedCount,
          lastResetExecutedAt: value.lastResetExecutedAt,
          updatedAt: value.updatedAt,
          version: value.version,
        },
      })
      .run();
  }
}
