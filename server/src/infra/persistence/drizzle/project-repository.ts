/**
 * DrizzleProjectRepository: ProjectRepository の本実装.
 *
 * BL-001 では Project の CRUD は対象外. exists のみを実装する.
 */
import { and, eq, isNull } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type { ProjectRepository } from "../../../data/project-repository.js";
import { projects, schema } from "../../../db/schema.js";

export interface DrizzleProjectRepositoryDeps {
  db: BetterSQLite3Database<typeof schema>;
}

export class DrizzleProjectRepository implements ProjectRepository {
  private readonly db: BetterSQLite3Database<typeof schema>;

  constructor(deps: DrizzleProjectRepositoryDeps) {
    this.db = deps.db;
  }

  async exists(id: string): Promise<boolean> {
    // ゴミ箱状態のプロジェクトは「存在しない」扱い.
    const rows = this.db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.id, id), isNull(projects.trashedAt)))
      .all();
    return rows.length > 0;
  }
}
