/**
 * DrizzleSessionRepository: SessionRepository の本実装 (better-sqlite3 + drizzle-orm).
 *
 * 仕様参照:
 *   - docs/developer/features/app-login/spec.md
 *   - docs/developer/features/app-login/plan.md §「データモデル」/ D-1 / D-6
 *
 * 設計:
 *   - findValidByToken は `expires_at > now` の strict > 判定 (D-6).
 *   - deleteByToken は不在 token に対しても throw せず no-op (二重 logout 想定).
 */
import { and, eq, gt } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type { SessionRecord, SessionRepository } from "../../../data/session-repository.js";
import { type schema, sessions } from "../../../db/schema.js";

export interface DrizzleSessionRepositoryDeps {
  db: BetterSQLite3Database<typeof schema>;
}

export class DrizzleSessionRepository implements SessionRepository {
  private readonly db: BetterSQLite3Database<typeof schema>;

  constructor(deps: DrizzleSessionRepositoryDeps) {
    this.db = deps.db;
  }

  async create(input: SessionRecord): Promise<void> {
    this.db
      .insert(sessions)
      .values({
        token: input.token,
        expiresAt: input.expiresAt,
        createdAt: input.createdAt,
      })
      .run();
  }

  async findValidByToken(token: string, now: number): Promise<SessionRecord | null> {
    const rows = this.db
      .select()
      .from(sessions)
      .where(and(eq(sessions.token, token), gt(sessions.expiresAt, now)))
      .all();
    const row = rows[0];
    if (!row) return null;
    return {
      token: row.token,
      expiresAt: row.expiresAt,
      createdAt: row.createdAt,
    };
  }

  async deleteByToken(token: string): Promise<void> {
    this.db.delete(sessions).where(eq(sessions.token, token)).run();
  }
}
