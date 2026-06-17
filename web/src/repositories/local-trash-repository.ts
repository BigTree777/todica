/**
 * LocalTrashRepository — SQLite ローカル実装 (BL-020 / FR-LOC-002).
 *
 * TrashRepository インターフェースを実装し、SQLite の tasks テーブルのうち
 * trashedAt IS NOT NULL のレコードを操作する.
 */

import type { LocalDb } from "./local-db.js";
import type {
  RestoreTaskCommand,
  TrashedProject,
  TrashedTask,
  TrashRepository,
} from "./trash-repository.js";

type Row = Record<string, unknown>;

function rowToTrashedTask(row: Row): TrashedTask {
  return {
    id: row.id as string,
    name: row.name as string,
    trashedAt: row.trashed_at as string,
    trashedReason: row.trashed_reason as "deleted" | "completed",
    version: row.version as number,
  };
}

function rowToTrashedProject(row: Row): TrashedProject {
  return {
    id: row.id as string,
    name: row.name as string,
    trashedAt: row.trashed_at as string | null,
    version: row.version as number,
  };
}

export class LocalTrashRepository implements TrashRepository {
  constructor(private readonly db: LocalDb) {}

  async list(): Promise<TrashedTask[]> {
    const result = await this.db.query(
      "SELECT * FROM tasks WHERE trashed_at IS NOT NULL ORDER BY trashed_at DESC",
    );
    return (result.values ?? []).map(rowToTrashedTask);
  }

  async listProjects(): Promise<TrashedProject[]> {
    const result = await this.db.query(
      "SELECT * FROM projects WHERE trashed_at IS NOT NULL ORDER BY trashed_at DESC",
    );
    return (result.values ?? []).map(rowToTrashedProject);
  }

  async restore(cmd: RestoreTaskCommand): Promise<TrashedTask> {
    // Task → Project の順に判別して復元する (D-3).
    const taskResult = await this.db.query("SELECT * FROM tasks WHERE id = ?", [cmd.id]);
    const taskRow = (taskResult.values ?? [])[0];
    if (taskRow) {
      const now = new Date().toISOString();
      const newVersion = (taskRow.version as number) + 1;

      await this.db.run(
        "UPDATE tasks SET trashed_at = NULL, trashed_reason = NULL, updated_at = ?, version = ? WHERE id = ?",
        [now, newVersion, cmd.id],
      );

      const afterUpdate = await this.db.query("SELECT * FROM tasks WHERE id = ?", [cmd.id]);
      const updatedRow = (afterUpdate.values ?? [])[0];
      if (updatedRow) {
        return rowToTrashedTask(updatedRow);
      }

      return {
        ...rowToTrashedTask(taskRow),
        trashedAt: null as unknown as string,
        trashedReason: null as unknown as "deleted" | "completed",
        version: newVersion,
      };
    }

    // Project 復元 (trashed_at を NULL に戻す. trashed_reason は持たない D-6).
    const projectResult = await this.db.query("SELECT * FROM projects WHERE id = ?", [cmd.id]);
    const projectRow = (projectResult.values ?? [])[0];
    if (!projectRow) throw new Error(`Trash entry not found: ${cmd.id}`);

    const now = new Date().toISOString();
    const newVersion = (projectRow.version as number) + 1;
    await this.db.run(
      "UPDATE projects SET trashed_at = NULL, updated_at = ?, version = ? WHERE id = ?",
      [now, newVersion, cmd.id],
    );

    const afterUpdate = await this.db.query("SELECT * FROM projects WHERE id = ?", [cmd.id]);
    const updatedRow = (afterUpdate.values ?? [])[0];
    const restoredProject = updatedRow
      ? rowToTrashedProject(updatedRow)
      : { ...rowToTrashedProject(projectRow), trashedAt: null, version: newVersion };
    // 戻り値型は Task/Project で共用 (呼び出し側はサーバ判別前提).
    return restoredProject as unknown as TrashedTask;
  }

  async empty(): Promise<void> {
    await this.db.run("DELETE FROM tasks WHERE trashed_at IS NOT NULL", []);
    await this.db.run("DELETE FROM projects WHERE trashed_at IS NOT NULL", []);
  }
}
