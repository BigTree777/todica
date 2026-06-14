import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type { PasswordRepository } from "../../../data/password-repository.js";
import { appPassword, type schema } from "../../../db/schema.js";

export interface DrizzlePasswordRepositoryDeps {
  db: BetterSQLite3Database<typeof schema>;
}

export class DrizzlePasswordRepository implements PasswordRepository {
  private readonly db: BetterSQLite3Database<typeof schema>;

  constructor(deps: DrizzlePasswordRepositoryDeps) {
    this.db = deps.db;
  }

  async getHash(): Promise<string | null> {
    const row = this.db
      .select({ passwordHash: appPassword.passwordHash })
      .from(appPassword)
      .where(eq(appPassword.id, "current"))
      .get();
    return row?.passwordHash ?? null;
  }

  async setHash(hash: string, now: number): Promise<void> {
    this.db
      .insert(appPassword)
      .values({ id: "current", passwordHash: hash, updatedAt: now })
      .onConflictDoUpdate({
        target: appPassword.id,
        set: { passwordHash: hash, updatedAt: now },
      })
      .run();
  }
}
