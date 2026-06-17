/**
 * TrashRepository インターフェース + HTTP 実装 (BL-014 / web-client-foundation).
 *
 * 仕様参照:
 *   - docs/developer/features/web-client-foundation/spec.md §「TrashRepository（HttpTrashRepository）」
 *   - docs/developer/features/web-client-foundation/plan.md §D-003
 *
 * HTTP 呼び出しは `authedFetch` を経由する. 401 を受けた時点で `authedFetch` 側が
 * `auth-storage.clearToken()` + `todica:auth-expired` イベント dispatch を行う.
 */
import { authedFetch } from "../auth/authed-fetch.js";

export interface TrashedTask {
  id: string;
  name: string;
  trashedAt: string;
  trashedReason: "deleted" | "completed";
  version: number;
}

/** ゴミ箱内 Project の射影 (BL-119 / D-2). Project は trashedReason を持たない (D-6). */
export interface TrashedProject {
  id: string;
  name: string;
  trashedAt: string | null;
  version: number;
}

export interface RestoreTaskCommand {
  id: string;
  ifMatch: number;
}

export interface TrashRepository {
  list(): Promise<TrashedTask[]>;
  /** ゴミ箱内 Project を一覧する (BL-119). */
  listProjects(): Promise<TrashedProject[]>;
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
 * HTTP 実装. `authedFetch` を使ってサーバの /api/v1/trash 系エンドポイントを叩く.
 */
export class HttpTrashRepository implements TrashRepository {
  constructor(readonly baseUrl: string) {}

  /** GET /api/v1/trash → { tasks: TrashedTask[], projects: TrashedProject[] } */
  async list(): Promise<TrashedTask[]> {
    const body = await this.fetchTrash();
    return body.tasks;
  }

  /** GET /api/v1/trash の projects 配列を返す (BL-119 / D-2). */
  async listProjects(): Promise<TrashedProject[]> {
    const body = await this.fetchTrash();
    return body.projects ?? [];
  }

  /** GET /api/v1/trash を 1 回呼び { tasks, projects } を読む. */
  private async fetchTrash(): Promise<{ tasks: TrashedTask[]; projects: TrashedProject[] }> {
    const res = await authedFetch(`${this.baseUrl}/api/v1/trash`, {
      method: "GET",
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: failed to list trash`);
    }
    return (await res.json()) as { tasks: TrashedTask[]; projects: TrashedProject[] };
  }

  /**
   * POST /api/v1/trash/:id/restore
   * Idempotency-Key (UUID v4) と If-Match ヘッダを付ける.
   * サーバは Task / Project を判別し 200 で { task } または { project } を返す (D-3).
   * 412 時は body の { task } または { project } を使って RestoreConflictError を throw する.
   */
  async restore(cmd: RestoreTaskCommand): Promise<TrashedTask> {
    const idemKey = uuidV4();
    const res = await authedFetch(`${this.baseUrl}/api/v1/trash/${cmd.id}/restore`, {
      method: "POST",
      headers: {
        "Idempotency-Key": idemKey,
        "If-Match": String(cmd.ifMatch),
      },
    });

    if (res.status === 412) {
      const body = (await res.json()) as { task?: TrashedTask; project?: TrashedProject };
      throw new RestoreConflictError((body.task ?? body.project) as unknown as TrashedTask);
    }
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: failed to restore`);
    }
    const body = (await res.json()) as { task?: TrashedTask; project?: TrashedProject };
    // Task 復元時は { task }, Project 復元時は { project } を返す. 戻り値型は共用.
    return (body.task ?? body.project) as unknown as TrashedTask;
  }

  /**
   * DELETE /api/v1/trash
   * Idempotency-Key (UUID v4) を付ける. Authorization は `authedFetch` が自動付与する.
   * 204 で正常終了 (void を返す).
   */
  async empty(): Promise<void> {
    const idemKey = uuidV4();
    const res = await authedFetch(`${this.baseUrl}/api/v1/trash`, {
      method: "DELETE",
      headers: {
        "Idempotency-Key": idemKey,
      },
    });

    if (res.status === 204) return;
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: failed to empty trash`);
    }
  }
}
