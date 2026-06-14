/**
 * SettingsRepository インターフェース (BL-009 / settings-day-boundary).
 *
 * 仕様: docs/developer/features/settings-day-boundary/spec.md / plan.md §「Repository インターフェース」.
 *
 * - 単一レコード前提 (id = "singleton"). get() 内 lazy upsert で常に 1 件確保する.
 * - get() は singleton レコードを返す. 未存在時は dayBoundaryTime = "04:00" で lazy upsert して返す.
 * - update() は version 含めて全フィールド上書きする (アプリ層で dayBoundaryTime / version+ 1 / updatedAt を渡す前提).
 *
 * 本実装: `server/src/infra/persistence/drizzle/drizzle-settings-repository.ts` (DrizzleSettingsRepository).
 * テスト用 in-memory 実装: `server/__tests__/helpers/in-memory-repositories.ts`.
 */

export interface Settings {
  /** 単一レコードを示す固定値 "singleton". */
  id: string;
  /** 境界時刻. "HH:MM" 形式 (例: "04:00", "23:30"). デフォルト "04:00" (FR-042). */
  dayBoundaryTime: string;
  /** ISO 8601. 最後に update された時刻. */
  updatedAt: string;
  /** 楽観ロック用. update のたびに +1. */
  version: number;
}

export interface SettingsRepository {
  /**
   * singleton レコードを返す.
   * 未存在時は dayBoundaryTime = "04:00", version = 1 で lazy upsert して返す (D-002).
   */
  get(): Promise<Settings>;
  /**
   * singleton レコードを丸ごと上書きする.
   * アプリ層が dayBoundaryTime / version / updatedAt 更新済みの値を渡す前提.
   */
  update(settings: Settings): Promise<void>;
}
