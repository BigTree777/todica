/**
 * FocusSelectionRepository インターフェース.
 *
 * 仕様: docs/developer/features/focus-task/spec.md / plan.md §「データモデル」「Repository」.
 *
 * - 単一レコード前提 (id = "singleton"). 起動時 / マイグレーション時に 1 件必ず存在する.
 * - get() は singleton レコードを返す. 無ければ初期値で自動生成する実装でも可
 *   (spec.md §「初回アクセス時の FocusSelection はサーバ初期化時に 1 件存在し currentTaskId は null」).
 * - update() は version 含めて全フィールド上書きする (アプリ層で version++ 済みの値を渡す).
 *
 * 本ファイルはインターフェース定義. 物理スキーマ (drizzle) を含む本実装は
 * `server/src/infra/persistence/drizzle/drizzle-focus-repository.ts` にある.
 */
export interface FocusSelection {
  /** 単一レコードを示す固定値 "singleton". */
  id: string;
  /** 現在のタスク id. 明示未選択時は null. */
  currentTaskId: string | null;
  /** ISO 8601. 最後に update された時刻. */
  updatedAt: string;
  /** 楽観ロック用. update のたびに +1. */
  version: number;
}

export interface FocusRepository {
  /**
   * singleton レコードを返す. 起動時 / マイグレーション時に必ず存在する想定.
   * 仕様上 GET /api/v1/focus は初回でも 200 OK を返すため, 実装は無ければ
   * `{ id: "singleton", currentTaskId: null, version: 1, updatedAt: <now> }` を
   * lazy に生成 / INSERT する形でも良い.
   */
  get(): Promise<FocusSelection>;
  /**
   * singleton レコードを丸ごと上書きする. アプリ層が version + 1 / updatedAt 更新
   * 済みの値を渡す前提.
   */
  update(focus: FocusSelection): Promise<void>;
}
