/**
 * CounterRepository インターフェース (BL-008 / completion-counter).
 *
 * 仕様: docs/developer/features/completion-counter/spec.md / plan.md §「データモデル」「Repository インターフェース」.
 *
 * - 単一レコード前提 (id = "singleton"). 起動時 / マイグレーション時に 1 件必ず存在する.
 * - get() は singleton レコードを返す. 無ければ初期値で自動生成する.
 * - update() は version 含めて全フィールド上書きする (アプリ層で version++ 済みの値を渡す).
 *
 * 本実装: `server/src/infra/persistence/drizzle/counter-repository.ts` (DrizzleCounterRepository).
 * テスト用 in-memory 実装: `server/__tests__/helpers/in-memory-repositories.ts`.
 */
export interface Counter {
  /** 単一レコードを示す固定値 "singleton". */
  id: string;
  /** 通常状態のタスクが完了に遷移した累計回数 (FR-040). 日次リセットで 0 に戻る (BL-010 責務). */
  completedCount: number;
  /** 最後にリセットを実行した時刻. BL-010 で使う. 本 feature では値を書き込まない. */
  lastResetExecutedAt: string | null;
  /** ISO 8601. 最後に update された時刻. */
  updatedAt: string;
  /** 楽観ロック用. update のたびに +1. */
  version: number;
}

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
