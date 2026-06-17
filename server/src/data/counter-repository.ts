/**
 * CounterRepository インターフェース (BL-008 / completion-counter).
 *
 * 仕様: docs/developer/features/completion-counter/spec.md / plan.md §「データモデル」「Repository インターフェース」.
 *
 * - 単一レコード前提 (id = "singleton"). 起動時 / マイグレーション時に 1 件必ず存在する.
 * - get() は singleton レコードを返す. 無ければ初期値で自動生成する.
 * - update() は version 含めて全フィールド上書きする (アプリ層で version++ 済みの値を渡す).
 *
 * 本実装: `server/src/infra/persistence/drizzle/drizzle-counter-repository.ts` (DrizzleCounterRepository).
 * テスト用 in-memory 実装: `server/__tests__/helpers/in-memory-repositories.ts`.
 *
 * Counter 型は `@todica/domain/counter` に集約済み (server / web 共通).
 */
import type { Counter } from "@todica/domain/counter";

export type { Counter };

export interface CounterRepository {
  /**
   * singleton レコードを返す. 起動時 / マイグレーション時に必ず存在する想定.
   * 仕様上 GET /api/v1/counter は初回でも 200 OK を返すため, 実装は無ければ
   * `{ id: "singleton", completedCount: 0, lastResetExecutedAt: null, version: 1, updatedAt: <now> }`
   * を lazy に生成 / INSERT する形でも良い.
   */
  get(): Promise<Counter>;
  /**
   * singleton レコードを丸ごと上書きする. アプリ層が completedCount / version + 1 /
   * updatedAt 更新済みの値を渡す前提.
   */
  update(counter: Counter): Promise<void>;
}
