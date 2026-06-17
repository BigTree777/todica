/**
 * RoutineRepository インターフェース (BL-017 / routine).
 *
 * 仕様参照: docs/developer/features/routine/spec.md
 * 設計参照: docs/developer/features/routine/plan.md §D-005
 */

export type { Routine } from "@todica/domain/routine";

import type { Routine } from "@todica/domain/routine";

export interface RoutineRepository {
  create(routine: Routine): Promise<void>;
  list(): Promise<Routine[]>; // name 昇順（BINARY）/ 通常状態 (trashed_at IS NULL) のみ
  findById(id: string): Promise<Routine | null>;
  update(routine: Routine): Promise<void>;
  delete(id: string): Promise<void>; // 物理削除
  findByDayOfWeek(day: number): Promise<Routine[]>;
  /** ゴミ箱状態 (trashed_at IS NOT NULL) の Routine を一覧する (BL-120 / FR-3). */
  listTrashed(): Promise<Routine[]>;
  /** ゴミ箱状態 (trashed_at IS NOT NULL) の Routine を全件物理削除する (BL-120 / FR-5). */
  deleteAllTrashed(): Promise<void>;
}
