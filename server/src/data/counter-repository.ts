/**
 * CounterRepository インターフェース (BL-008 / completion-counter).
 *
 * 仕様: docs/developer/features/completion-counter/spec.md / plan.md §「データモデル」「Repository インターフェース」.
 *
 * - 単一レコード前提 (id = "singleton"). 起動時 / マイグレーション時に 1 件必ず存在する.
 * - get() は singleton レコードを返す. 無ければ初期値で自動生成する実装でも可
 *   (spec.md §「Counter の初期状態」).
 * - update() は version 含めて全フィールド上書きする (アプリ層で version++ 済みの値を渡す).
 *
 * 本ファイルは test-designer 段階のインターフェース定義. 物理スキーマ (drizzle) /
 * 本実装は implementer が `server/src/infra/persistence/drizzle/counter-repository.ts`
 * (相当) で追加する.
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

/**
 * StubCounterRepository: test-designer 段階のプレースホルダ実装.
 *
 * - `createApp({ counterRepository })` の型を満たすためだけに存在する.
 * - 値は singleton の初期値固定で, update() は in-memory にしか反映しない.
 * - 物理永続化 (better-sqlite3 + drizzle) は implementer が
 *   `server/src/infra/persistence/drizzle/counter-repository.ts` で本実装する.
 * - 本実装が green 化された時点で本クラスは差し替えられる想定.
 */
export class StubCounterRepository implements CounterRepository {
  private state: Counter = {
    id: "singleton",
    completedCount: 0,
    lastResetExecutedAt: null,
    updatedAt: "1970-01-01T00:00:00.000Z",
    version: 1,
  };

  async get(): Promise<Counter> {
    return { ...this.state };
  }

  async update(counter: Counter): Promise<void> {
    this.state = { ...counter };
  }
}
