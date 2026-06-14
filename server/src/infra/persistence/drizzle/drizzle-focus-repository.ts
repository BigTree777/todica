/**
 * DrizzleFocusRepository: FocusRepository の本実装 (better-sqlite3 + drizzle-orm).
 *
 * 仕様参照:
 *   - docs/developer/features/focus-task/spec.md
 *   - docs/developer/features/focus-task/plan.md §「データモデル」/ D-007 / D-011
 *
 * 設計:
 *   - 単一レコード前提 (id = "singleton").
 *   - get() 時に存在しなければ初期値 ({ currentTaskId: null, version: 1 }) を upsert して返す.
 *   - update() は version 含めて全フィールドを上書き (アプリ層が version+1 / updatedAt 更新済).
 */
import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type { FocusRepository, FocusSelection } from "../../../data/focus-repository.js";
import { focusSelection, type schema } from "../../../db/schema.js";

const SINGLETON_ID = "singleton";

export interface DrizzleFocusRepositoryDeps {
  db: BetterSQLite3Database<typeof schema>;
}

export class DrizzleFocusRepository implements FocusRepository {
  private readonly db: BetterSQLite3Database<typeof schema>;

  constructor(deps: DrizzleFocusRepositoryDeps) {
    this.db = deps.db;
  }

  async get(): Promise<FocusSelection> {
    const rows = this.db
      .select()
      .from(focusSelection)
      .where(eq(focusSelection.id, SINGLETON_ID))
      .all();
    const row = rows[0];
    if (row) {
      return {
        id: row.id,
        currentTaskId: row.currentTaskId,
        updatedAt: row.updatedAt,
        version: row.version,
      };
    }
    // 不在ならば初期値 INSERT.
    const now = new Date().toISOString();
    const initial: FocusSelection = {
      id: SINGLETON_ID,
      currentTaskId: null,
      updatedAt: now,
      version: 1,
    };
    this.db
      .insert(focusSelection)
      .values({
        id: initial.id,
        currentTaskId: initial.currentTaskId,
        createdAt: now,
        updatedAt: initial.updatedAt,
        version: initial.version,
      })
      .onConflictDoNothing({ target: focusSelection.id })
      .run();
    return initial;
  }

  async update(focus: FocusSelection): Promise<void> {
    // upsert: 既存があれば全フィールド上書き. 無ければ新規 INSERT.
    const now = focus.updatedAt;
    this.db
      .insert(focusSelection)
      .values({
        id: focus.id,
        currentTaskId: focus.currentTaskId,
        createdAt: now,
        updatedAt: focus.updatedAt,
        version: focus.version,
      })
      .onConflictDoUpdate({
        target: focusSelection.id,
        set: {
          currentTaskId: focus.currentTaskId,
          updatedAt: focus.updatedAt,
          version: focus.version,
        },
      })
      .run();
  }
}
