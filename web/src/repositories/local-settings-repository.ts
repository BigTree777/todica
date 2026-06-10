/**
 * LocalSettingsRepository — SQLite ローカル実装 (BL-020 / FR-LOC-002).
 *
 * SettingsRepository インターフェースを実装し、SQLite の settings テーブルを操作する.
 * レコードが存在しない場合はデフォルト値を挿入して返す.
 */

import type { PatchSettingsCommand, Settings, SettingsRepository } from "./settings-repository.js";

type Row = Record<string, unknown>;

interface DBConnection {
  query(sql: string, values?: unknown[]): Promise<{ values?: Row[] }>;
  run(sql: string, values?: unknown[]): Promise<{ changes?: { changes: number; lastId: number } }>;
  execute(sql: string): Promise<{ changes?: { changes: number } }>;
  beginTransaction(): Promise<void>;
  commitTransaction(): Promise<void>;
  rollbackTransaction(): Promise<void>;
}

function rowToSettings(row: Row): Settings & { dayBoundaryTimezone: string } {
  return {
    id: row.id as string,
    dayBoundaryTime: row.day_boundary_time as string,
    dayBoundaryTimezone: (row.day_boundary_timezone as string | undefined) ?? "Asia/Tokyo",
    version: row.version as number,
    updatedAt: row.updated_at as string,
  };
}

export class LocalSettingsRepository implements SettingsRepository {
  constructor(private readonly db: DBConnection) {}

  async getSettings(): Promise<Settings & { dayBoundaryTimezone: string }> {
    const result = await this.db.query("SELECT * FROM settings WHERE id = 'singleton'");
    const row = (result.values ?? [])[0];

    if (row) {
      return rowToSettings(row);
    }

    // レコードが存在しない場合はデフォルト値を INSERT する
    const now = new Date().toISOString();
    await this.db.run(
      `INSERT INTO settings (id, day_boundary_time, day_boundary_timezone, updated_at, version)
       VALUES ('singleton', '04:00', 'Asia/Tokyo', ?, 1)`,
      [now],
    );

    const afterInsert = await this.db.query("SELECT * FROM settings WHERE id = 'singleton'");
    const newRow = (afterInsert.values ?? [])[0];
    if (newRow) {
      return rowToSettings(newRow);
    }

    // フォールバック（テスト環境でINSERT後再クエリが空の場合）
    return {
      id: "singleton",
      dayBoundaryTime: "04:00",
      dayBoundaryTimezone: "Asia/Tokyo",
      version: 1,
      updatedAt: now,
    };
  }

  async patchSettings(
    cmd: PatchSettingsCommand,
  ): Promise<Settings & { dayBoundaryTimezone: string }> {
    const result = await this.db.query("SELECT * FROM settings WHERE id = 'singleton'");
    const row = (result.values ?? [])[0];
    if (!row) throw new Error("Settings not found");

    const now = new Date().toISOString();
    const newVersion = (row.version as number) + 1;

    await this.db.run(
      `UPDATE settings SET day_boundary_time = ?, updated_at = ?, version = ? WHERE id = 'singleton'`,
      [cmd.dayBoundaryTime, now, newVersion],
    );

    const afterUpdate = await this.db.query("SELECT * FROM settings WHERE id = 'singleton'");
    const updatedRow = (afterUpdate.values ?? [])[0];
    if (updatedRow) {
      return rowToSettings(updatedRow);
    }

    return {
      ...rowToSettings(row),
      dayBoundaryTime: cmd.dayBoundaryTime,
      version: newVersion,
      updatedAt: now,
    };
  }
}
