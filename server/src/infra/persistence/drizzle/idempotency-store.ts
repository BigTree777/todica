/**
 * DrizzleIdempotencyStore: IdempotencyStore の本実装.
 *
 * 直近の Idempotency-Key 応答 (HTTP status + body JSON) をキャッシュする.
 * plan.md D-010 / R-003 に従う.
 *
 * 本実装ではキャッシュの TTL ロジックは持たない (BL-001 では out of scope).
 * 期限切れ削除は別 feature で扱う.
 */
import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type {
  IdempotencyRecord,
  IdempotencyStore,
} from "../../../data/idempotency-store.js";
import { idempotencyKeys, schema } from "../../../db/schema.js";

export interface DrizzleIdempotencyStoreDeps {
  db: BetterSQLite3Database<typeof schema>;
}

export class DrizzleIdempotencyStore implements IdempotencyStore {
  private readonly db: BetterSQLite3Database<typeof schema>;

  constructor(deps: DrizzleIdempotencyStoreDeps) {
    this.db = deps.db;
  }

  async get(key: string): Promise<IdempotencyRecord | null> {
    const rows = this.db
      .select()
      .from(idempotencyKeys)
      .where(eq(idempotencyKeys.key, key))
      .all();
    const row = rows[0];
    if (!row) return null;
    return {
      status: row.responseStatus,
      body: JSON.parse(row.responseBody) as unknown,
    };
  }

  async save(key: string, record: IdempotencyRecord): Promise<void> {
    this.db
      .insert(idempotencyKeys)
      .values({
        key,
        method: "",
        path: "",
        responseStatus: record.status,
        responseBody: JSON.stringify(record.body ?? null),
      })
      .onConflictDoUpdate({
        target: idempotencyKeys.key,
        set: {
          responseStatus: record.status,
          responseBody: JSON.stringify(record.body ?? null),
        },
      })
      .run();
  }
}
