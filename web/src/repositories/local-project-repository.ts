/**
 * LocalProjectRepository — SQLite ローカル実装 (BL-020 / FR-LOC-002).
 *
 * ProjectRepository インターフェースを実装し、SQLite の projects テーブルを操作する.
 */

import type {
  CreateProjectCommand,
  DeleteProjectCommand,
  Project,
  ProjectRepository,
  UpdateProjectCommand,
} from "./project-repository.js";

import type { LocalDb } from "./local-db.js";

type Row = Record<string, unknown>;

function rowToProject(row: Row): Project {
  return {
    id: row.id as string,
    name: row.name as string,
    version: row.version as number,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export class LocalProjectRepository implements ProjectRepository {
  constructor(private readonly db: LocalDb) {}

  async list(): Promise<Project[]> {
    const result = await this.db.query("SELECT * FROM projects WHERE trashed_at IS NULL");
    return (result.values ?? []).map(rowToProject);
  }

  async create(cmd: CreateProjectCommand): Promise<Project> {
    const now = new Date().toISOString();

    await this.db.run(
      `INSERT INTO projects (id, name, created_at, updated_at, version, trashed_at)
       VALUES (?, ?, ?, ?, 1, NULL)`,
      [cmd.id, cmd.name, now, now],
    );

    const result = await this.db.query("SELECT * FROM projects WHERE id = ?", [cmd.id]);
    const row = (result.values ?? [])[0];
    if (row) return rowToProject(row);

    return {
      id: cmd.id,
      name: cmd.name,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
  }

  async update(cmd: UpdateProjectCommand): Promise<Project> {
    const result = await this.db.query("SELECT * FROM projects WHERE id = ?", [cmd.id]);
    const row = (result.values ?? [])[0];
    if (!row) throw new Error(`Project not found: ${cmd.id}`);

    const now = new Date().toISOString();
    const newVersion = (row.version as number) + 1;

    await this.db.run("UPDATE projects SET name = ?, updated_at = ?, version = ? WHERE id = ?", [
      cmd.name,
      now,
      newVersion,
      cmd.id,
    ]);

    const afterUpdate = await this.db.query("SELECT * FROM projects WHERE id = ?", [cmd.id]);
    const updatedRow = (afterUpdate.values ?? [])[0];
    if (updatedRow) return rowToProject(updatedRow);

    return { ...rowToProject(row), name: cmd.name, version: newVersion, updatedAt: now };
  }

  async delete(cmd: DeleteProjectCommand): Promise<void> {
    const result = await this.db.query("SELECT * FROM projects WHERE id = ?", [cmd.id]);
    const row = (result.values ?? [])[0];
    if (!row) throw new Error(`Project not found: ${cmd.id}`);

    await this.db.run("DELETE FROM projects WHERE id = ?", [cmd.id]);
  }
}
