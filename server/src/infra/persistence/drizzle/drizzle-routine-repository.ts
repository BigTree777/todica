import type { Routine } from "@todica/domain/routine";
/**
 * DrizzleRoutineRepository: RoutineRepository の本実装 (BL-017 / routine).
 *
 * - daysOfWeek は JSON 文字列としてシリアライズ / デシリアライズする.
 * - 保存時に重複排除: [...new Set(routine.daysOfWeek)].sort((a, b) => a - b).
 * - list(): ORDER BY name ASC.
 * - findByDayOfWeek(day): 全件取得してアプリケーション層でフィルタ.
 */
import { asc, eq, isNotNull, isNull } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type { RoutineRepository } from "../../../data/routine-repository.js";
import { routines, type schema } from "../../../db/schema.js";

export interface DrizzleRoutineRepositoryDeps {
  db: BetterSQLite3Database<typeof schema>;
}

function rowToRoutine(row: {
  id: string;
  name: string;
  daysOfWeek: string;
  defaultPriority: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  trashedAt: string | null;
}): Routine {
  return {
    id: row.id,
    name: row.name,
    daysOfWeek: JSON.parse(row.daysOfWeek) as number[],
    defaultPriority: row.defaultPriority as "highest" | "normal" | "later",
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    trashedAt: row.trashedAt,
  };
}

function routineToValues(routine: Routine) {
  const daysOfWeek = [...new Set(routine.daysOfWeek)].sort((a, b) => a - b);
  return {
    id: routine.id,
    name: routine.name,
    daysOfWeek: JSON.stringify(daysOfWeek),
    defaultPriority: routine.defaultPriority,
    version: routine.version,
    createdAt: routine.createdAt,
    updatedAt: routine.updatedAt,
    trashedAt: routine.trashedAt,
  };
}

export class DrizzleRoutineRepository implements RoutineRepository {
  private readonly db: BetterSQLite3Database<typeof schema>;

  constructor(deps: DrizzleRoutineRepositoryDeps) {
    this.db = deps.db;
  }

  async create(routine: Routine): Promise<void> {
    this.db.insert(routines).values(routineToValues(routine)).run();
  }

  async list(): Promise<Routine[]> {
    // 通常状態 (trashed_at IS NULL) のみを name 昇順で返す.
    const rows = this.db
      .select()
      .from(routines)
      .where(isNull(routines.trashedAt))
      .orderBy(asc(routines.name))
      .all();
    return rows.map(rowToRoutine);
  }

  async listTrashed(): Promise<Routine[]> {
    // ゴミ箱状態 (trashed_at IS NOT NULL) を name 昇順で返す.
    const rows = this.db
      .select()
      .from(routines)
      .where(isNotNull(routines.trashedAt))
      .orderBy(asc(routines.name))
      .all();
    return rows.map(rowToRoutine);
  }

  async findById(id: string): Promise<Routine | null> {
    const rows = this.db.select().from(routines).where(eq(routines.id, id)).all();
    const row = rows[0];
    if (!row) return null;
    return rowToRoutine(row);
  }

  async update(routine: Routine): Promise<void> {
    const vals = routineToValues(routine);
    this.db
      .update(routines)
      .set({
        name: vals.name,
        daysOfWeek: vals.daysOfWeek,
        defaultPriority: vals.defaultPriority,
        version: vals.version,
        updatedAt: vals.updatedAt,
        trashedAt: vals.trashedAt,
      })
      .where(eq(routines.id, routine.id))
      .run();
  }

  async delete(id: string): Promise<void> {
    this.db.delete(routines).where(eq(routines.id, id)).run();
  }

  async deleteAllTrashed(): Promise<void> {
    this.db.delete(routines).where(isNotNull(routines.trashedAt)).run();
  }

  async findByDayOfWeek(day: number): Promise<Routine[]> {
    const all = await this.list();
    return all.filter((r) => r.daysOfWeek.includes(day));
  }
}
