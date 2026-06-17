/**
 * Trash ドメイン (FR-062 ゴミ箱清算).
 *
 * 仕様参照: docs/developer/features/trash/spec.md §「日次清算（FR-062 purgeTrash）」
 *
 * Trash 状態にあるエンティティの清算判定純関数を提供する.
 * エンティティ固有の状態遷移 (trashTask / restoreTask 等) は各エンティティドメイン
 * (domain/task 等) に置く. 本モジュールは entity-agnostic な共通 predicate のみ持つ.
 */

/**
 * 指定された trashedAt が境界時刻 boundaryAt より前なら true.
 *
 * - trashedAt が null (アクティブな状態) の場合は false.
 * - 境界値 (trashedAt === boundaryAt) は false (半開区間 < の semantic).
 *
 * Repository の deleteTrashOlderThan(boundaryAt) が SQL で実装する
 * `trashed_at IS NOT NULL AND trashed_at < boundaryAt` と同じ意味.
 */
export function shouldPurge(trashedAt: string | null, boundaryAt: string): boolean {
  if (trashedAt === null) return false;
  return trashedAt < boundaryAt;
}
