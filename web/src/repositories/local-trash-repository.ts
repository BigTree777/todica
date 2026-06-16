/**
 * LocalTrashRepository — SQLite ローカル実装 (BL-020 / FR-LOC-002).
 *
 * TrashRepository インターフェースを実装し、SQLite の tasks テーブルのうち
 * trashedAt IS NOT NULL のレコードを操作する.
 */

import type { LocalDb } from "./local-db.js";
import type { RestoreTaskCommand, TrashedTask, TrashRepository } from "./trash-repository.js";

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

export class LocalTrashRepository implements TrashRepository {
  constructor(private readonly db: LocalDb) {}

  async list(): Promise<TrashedTask[]> {
    const result = await this.db.query(
      "SELECT * FROM tasks WHERE trashed_at IS NOT NULL ORDER BY trashed_at DESC",
    );
    return (result.values ?? []).map(rowToTrashedTask);
  }

  async restore(cmd: RestoreTaskCommand): Promise<TrashedTask> {
    const result = await this.db.query("SELECT * FROM tasks WHERE id = ?", [cmd.id]);
    const row = (result.values ?? [])[0];
    if (!row) throw new Error(`Task not found: ${cmd.id}`);

    const now = new Date().toISOString();
    const newVersion = (row.version as number) + 1;

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
      ...rowToTrashedTask(row),
      trashedAt: null as unknown as string,
      trashedReason: null as unknown as "deleted" | "completed",
      version: newVersion,
    };
  }

  async empty(): Promise<void> {
    await this.db.run("DELETE FROM tasks WHERE trashed_at IS NOT NULL", []);
  }
}
