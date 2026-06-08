/**
 * LocalRoutineRepository — SQLite ローカル実装 (BL-020 / FR-LOC-002).
 *
 * WebRoutineRepository インターフェースを実装し、SQLite の routines テーブルを操作する.
 * generateOnWeekdays (daysOfWeek) は SQLite に JSON 文字列として保存し、
 * 読み出し時に JSON.parse して配列として返す.
 */

import type {
  WebRoutine,
  WebRoutineRepository,
  CreateRoutineCommand,
  UpdateRoutineCommand,
  DeleteRoutineCommand,
} from "./routine-repository.js";

type Row = Record<string, unknown>;

interface DBConnection {
  query(sql: string, values?: unknown[]): Promise<{ values?: Row[] }>;
  run(sql: string, values?: unknown[]): Promise<{ changes?: { changes: number; lastId: number } }>;
  execute(sql: string): Promise<{ changes?: { changes: number } }>;
  beginTransaction(): Promise<void>;
  commitTransaction(): Promise<void>;
  rollbackTransaction(): Promise<void>;
}

function rowToWebRoutine(row: Row): WebRoutine {
  let daysOfWeek: number[] = [];
  const rawDays = row.generate_on_weekdays;
  if (typeof rawDays === "string") {
    try {
      daysOfWeek = JSON.parse(rawDays) as number[];
    } catch {
      daysOfWeek = [];
    }
  } else if (Array.isArray(rawDays)) {
    daysOfWeek = rawDays as number[];
  }

  return {
    id: row.id as string,
    name: row.name as string,
    daysOfWeek,
    defaultPriority: row.default_priority as "highest" | "normal" | "later",
    version: row.version as number,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export class LocalRoutineRepository implements WebRoutineRepository {
  constructor(private readonly db: DBConnection) {}

  async list(): Promise<WebRoutine[]> {
    const result = await this.db.query("SELECT * FROM routines WHERE trashed_at IS NULL");
    return (result.values ?? []).map(rowToWebRoutine);
  }

  async create(cmd: CreateRoutineCommand): Promise<WebRoutine> {
    const now = new Date().toISOString();
    const daysJson = JSON.stringify(cmd.daysOfWeek);

    await this.db.run(
      `INSERT INTO routines (id, name, generate_on_weekdays, default_priority, last_generated_for_date, created_at, updated_at, trashed_at, version)
       VALUES (?, ?, ?, ?, NULL, ?, ?, NULL, 1)`,
      [cmd.id, cmd.name, daysJson, cmd.defaultPriority, now, now],
    );

    const result = await this.db.query("SELECT * FROM routines WHERE id = ?", [cmd.id]);
    const row = (result.values ?? [])[0];
    if (row) return rowToWebRoutine(row);

    return {
      id: cmd.id,
      name: cmd.name,
      daysOfWeek: cmd.daysOfWeek,
      defaultPriority: cmd.defaultPriority as "highest" | "normal" | "later",
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
  }

  async update(cmd: UpdateRoutineCommand): Promise<WebRoutine> {
    const result = await this.db.query("SELECT * FROM routines WHERE id = ?", [cmd.id]);
    const row = (result.values ?? [])[0];
    if (!row) throw new Error(`Routine not found: ${cmd.id}`);

    const now = new Date().toISOString();
    const newVersion = (row.version as number) + 1;
    const newName = cmd.name ?? (row.name as string);
    const newDays =
      cmd.daysOfWeek !== undefined
        ? JSON.stringify(cmd.daysOfWeek)
        : (row.generate_on_weekdays as string);
    const newPriority = cmd.defaultPriority ?? (row.default_priority as string);

    await this.db.run(
      `UPDATE routines SET name = ?, generate_on_weekdays = ?, default_priority = ?, updated_at = ?, version = ? WHERE id = ?`,
      [newName, newDays, newPriority, now, newVersion, cmd.id],
    );

    const afterUpdate = await this.db.query("SELECT * FROM routines WHERE id = ?", [cmd.id]);
    const updatedRow = (afterUpdate.values ?? [])[0];
    if (updatedRow) return rowToWebRoutine(updatedRow);

    return {
      ...rowToWebRoutine(row),
      name: newName,
      daysOfWeek: cmd.daysOfWeek ?? (row.generate_on_weekdays as unknown as number[]),
      defaultPriority: newPriority as "highest" | "normal" | "later",
      version: newVersion,
      updatedAt: now,
    };
  }

  async delete(cmd: DeleteRoutineCommand): Promise<void> {
    const result = await this.db.query("SELECT * FROM routines WHERE id = ?", [cmd.id]);
    const row = (result.values ?? [])[0];
    if (!row) throw new Error(`Routine not found: ${cmd.id}`);

    await this.db.run("DELETE FROM routines WHERE id = ?", [cmd.id]);
  }
}
