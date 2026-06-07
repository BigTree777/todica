/**
 * Idempotency-Key の応答キャッシュ (plan.md D-010, R-003).
 *
 * 直近 24 時間内に同じキーで処理されたリクエストの応答 (HTTP status + body) を返す.
 */
export interface IdempotencyRecord {
  status: number;
  body: unknown;
}

export interface IdempotencyStore {
  get(key: string): Promise<IdempotencyRecord | null>;
  save(key: string, record: IdempotencyRecord): Promise<void>;
}
