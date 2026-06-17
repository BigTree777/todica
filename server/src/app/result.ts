/**
 * アプリケーション層のユースケース結果型 (discriminated union).
 *
 * spec.md D-U3 / plan.md D-1: ユースケースは例外を投げず, HTTP の語彙を持たない
 * 値で結果を返す. ルータがこの結果を HTTP ステータス・ボディへ写像する.
 *
 *   - ok       : 正常完了 (200 / 201 / 204 系へ写像).
 *   - invalid  : 入力不正 (400 へ写像). code / message を保持する.
 *   - notFound : 対象不在 (404 へ写像).
 *   - conflict : 楽観ロック衝突 (412 へ写像). 現行値 current を同梱する.
 *   - noop     : 冪等な no-op (既ゴミ箱再操作など). value をそのまま返す.
 */
export type UsecaseResult<T> =
  | { kind: "ok"; value: T }
  | { kind: "invalid"; code: string; message: string }
  | { kind: "notFound"; code: string; message: string }
  | { kind: "conflict"; current: T }
  | { kind: "noop"; value: T };
