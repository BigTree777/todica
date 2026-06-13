/**
 * SessionRepository インターフェース.
 *
 * 仕様: docs/developer/features/app-login/spec.md
 * 設計: docs/developer/features/app-login/plan.md §「データモデル」/ D-1 / D-6
 *
 * - token は `crypto.randomBytes(32).toString("hex")` の 64 文字 16 進文字列.
 * - expiresAt / createdAt は Unix epoch ms.
 * - 期限境界は strict > 判定 (`expires_at > now`).
 */

export interface SessionRecord {
  token: string;
  expiresAt: number;
  createdAt: number;
}

export interface SessionRepository {
  /** 新規 session を INSERT する. */
  create(input: SessionRecord): Promise<void>;
  /** token が存在し かつ `expires_at > now` なら行を返し, 期限切れ / 不在なら null. */
  findValidByToken(token: string, now: number): Promise<SessionRecord | null>;
  /** token に対応する行を削除する. 不在なら no-op (冪等). */
  deleteByToken(token: string): Promise<void>;
  /** 全 session を削除する. */
  deleteAll(): Promise<void>;
}
