/**
 * TrashRepository インターフェース + HTTP 実装 (BL-014 / web-client-foundation).
 *
 * 仕様参照:
 *   - docs/developer/features/web-client-foundation/spec.md §「TrashRepository（HttpTrashRepository）」
 *   - docs/developer/features/web-client-foundation/plan.md §D-003
 */

export interface TrashedTask {
  id: string;
  name: string;
  trashedAt: string;
  trashedReason: "deleted" | "completed";
  version: number;
}

export interface RestoreTaskCommand {
  id: string;
  ifMatch: number;
}

export interface TrashRepository {
  list(): Promise<TrashedTask[]>;
  restore(cmd: RestoreTaskCommand): Promise<TrashedTask>;
  empty(): Promise<void>;
}

/** 412 (バージョン衝突) 時にスローされるエラー. ボディから取得した最新 task を保持する. */
export class RestoreConflictError extends Error {
  constructor(public readonly currentTask: TrashedTask) {
    super("Conflict: version mismatch on restore");
    this.name = "RestoreConflictError";
  }
}

/**
 * UUID v4 を生成する.
 *
 * - ブラウザ / Node 19+ では `crypto.randomUUID()` を優先する.
 * - 利用不可な環境では `crypto.getRandomValues` ベースの fallback を使う.
 */
function uuidV4(): string {
  const g = globalThis as { crypto?: Crypto };
  if (g.crypto && typeof g.crypto.randomUUID === "function") {
    return g.crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (g.crypto && typeof g.crypto.getRandomValues === "function") {
    g.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  // RFC 4122 v4
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex
    .slice(6, 8)
    .join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10, 16).join("")}`;
}

/**
 * HTTP 実装. fetch を使ってサーバの /api/v1/trash 系エンドポイントを叩く.
 */
export class HttpTrashRepository implements TrashRepository {
  constructor(
    readonly baseUrl: string,
    readonly authToken: string,
  ) {}

  private authHeaders(extra: Record<string, string> = {}): Record<string, string> {
    return {
      Authorization: `Bearer ${this.authToken}`,
      ...extra,
    };
  }

  /** GET /api/v1/trash → { tasks: TrashedTask[] } */
  async list(): Promise<TrashedTask[]> {
    const res = await fetch(`${this.baseUrl}/api/v1/trash`, {
      method: "GET",
      headers: this.authHeaders(),
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: failed to list trash`);
    }
    const body = (await res.json()) as { tasks: TrashedTask[] };
    return body.tasks;
  }

  /**
   * POST /api/v1/trash/:id/restore
   * Idempotency-Key (UUID v4) と If-Match ヘッダを付ける.
   * 412 時は body の { task } を使って RestoreConflictError を throw する.
   */
  async restore(cmd: RestoreTaskCommand): Promise<TrashedTask> {
    const idemKey = uuidV4();
    const res = await fetch(`${this.baseUrl}/api/v1/trash/${cmd.id}/restore`, {
      method: "POST",
      headers: this.authHeaders({
        "Idempotency-Key": idemKey,
        "If-Match": String(cmd.ifMatch),
      }),
    });

    if (res.status === 412) {
      const body = (await res.json()) as { task: TrashedTask };
      throw new RestoreConflictError(body.task);
    }
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: failed to restore task`);
    }
    const body = (await res.json()) as { task: TrashedTask };
    return body.task;
  }

  /**
   * DELETE /api/v1/trash
   * Idempotency-Key (UUID v4) と Authorization ヘッダを付ける.
   * 204 で正常終了 (void を返す).
   */
  async empty(): Promise<void> {
    const idemKey = uuidV4();
    const res = await fetch(`${this.baseUrl}/api/v1/trash`, {
      method: "DELETE",
      headers: this.authHeaders({
        "Idempotency-Key": idemKey,
      }),
    });

    if (res.status === 204) return;
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: failed to empty trash`);
    }
  }
}
