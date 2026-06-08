/**
 * DrizzleProjectRepository: ProjectRepository の本実装 (BL-001 / BL-016).
 *
 * BL-001: exists のみを実装していたが、BL-016 で CRUD を追加.
 */
import { and, asc, eq, isNull } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type { Project, ProjectRepository } from "../../../data/project-repository.js";
import { projects, tasks, schema } from "../../../db/schema.js";

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

  async insert(project: Project): Promise<void> {
    this.db
      .insert(projects)
      .values({
        id: project.id,
        name: project.name,
        version: project.version,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
      })
      .run();
  }

  async findById(id: string): Promise<Project | null> {
    const rows = this.db
      .select()
      .from(projects)
      .where(eq(projects.id, id))
      .all();
    const row = rows[0];
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      version: row.version,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async list(): Promise<Project[]> {
    const rows = this.db
      .select()
      .from(projects)
      .orderBy(asc(projects.name))
      .all();
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      version: row.version,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));
  }

  async update(project: Project): Promise<void> {
    this.db
      .update(projects)
      .set({
        name: project.name,
        version: project.version,
        updatedAt: project.updatedAt,
      })
      .where(eq(projects.id, project.id))
      .run();
  }

  async delete(id: string): Promise<void> {
    this.db.delete(projects).where(eq(projects.id, id)).run();
  }
}
