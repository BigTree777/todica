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
  list(): Promise<Routine[]>;         // name 昇順（BINARY）
  findById(id: string): Promise<Routine | null>;
  update(routine: Routine): Promise<void>;
  delete(id: string): Promise<void>;  // 物理削除
  findByDayOfWeek(day: number): Promise<Routine[]>;
}
