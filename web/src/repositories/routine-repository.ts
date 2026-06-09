/**
 * RoutineRepository インターフェース + HTTP 実装 (BL-017 / routine).
 *
 * 仕様参照:
 *   - docs/developer/features/routine/spec.md §「Web クライアント - RoutinesView」
 */

export interface WebRoutine {
  id: string;
  name: string;
  daysOfWeek: number[];
  defaultPriority: "highest" | "normal" | "later";
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateRoutineCommand {
  id: string;
  name: string;
  daysOfWeek: number[];
  defaultPriority: string;
}

export interface UpdateRoutineCommand {
  id: string;
  ifMatch: number;
  name?: string;
  daysOfWeek?: number[];
  defaultPriority?: string;
}

export interface DeleteRoutineCommand {
  id: string;
  ifMatch: number;
}

export interface WebRoutineRepository {
  list(): Promise<WebRoutine[]>;
  create(cmd: CreateRoutineCommand): Promise<WebRoutine>;
  update(cmd: UpdateRoutineCommand): Promise<WebRoutine>;
  delete(cmd: DeleteRoutineCommand): Promise<void>;
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
 * HTTP 実装. fetch を使ってサーバの /api/v1/routines 系エンドポイントを叩く.
 */
export class HttpRoutineRepository implements WebRoutineRepository {
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

  /** GET /api/v1/routines → { routines: WebRoutine[] } */
  async list(): Promise<WebRoutine[]> {
    const res = await fetch(`${this.baseUrl}/api/v1/routines`, {
      method: "GET",
      headers: this.authHeaders(),
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: failed to list routines`);
    }
    const body = (await res.json()) as { routines: WebRoutine[] };
    return body.routines;
  }

  /** POST /api/v1/routines → { routine: WebRoutine } */
  async create(cmd: CreateRoutineCommand): Promise<WebRoutine> {
    const idemKey = uuidV4();
    const res = await fetch(`${this.baseUrl}/api/v1/routines`, {
      method: "POST",
      headers: this.authHeaders({
        "Content-Type": "application/json",
        "Idempotency-Key": idemKey,
      }),
      body: JSON.stringify({
        id: cmd.id,
        name: cmd.name,
        daysOfWeek: cmd.daysOfWeek,
        defaultPriority: cmd.defaultPriority,
      }),
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: failed to create routine`);
    }
    const body = (await res.json()) as { routine: WebRoutine };
    return body.routine;
  }

  /** PATCH /api/v1/routines/:id → { routine: WebRoutine } */
  async update(cmd: UpdateRoutineCommand): Promise<WebRoutine> {
    const idemKey = uuidV4();
    const patch: Record<string, unknown> = {};
    if (cmd.name !== undefined) patch.name = cmd.name;
    if (cmd.daysOfWeek !== undefined) patch.daysOfWeek = cmd.daysOfWeek;
    if (cmd.defaultPriority !== undefined) patch.defaultPriority = cmd.defaultPriority;

    const res = await fetch(`${this.baseUrl}/api/v1/routines/${cmd.id}`, {
      method: "PATCH",
      headers: this.authHeaders({
        "Content-Type": "application/json",
        "Idempotency-Key": idemKey,
        "If-Match": String(cmd.ifMatch),
      }),
      body: JSON.stringify(patch),
    });
    if (res.status === 412) {
      const errBody = (await res.json()) as { routine?: WebRoutine };
      throw new RoutineConflictError(errBody.routine);
    }
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: failed to update routine`);
    }
    const body = (await res.json()) as { routine: WebRoutine };
    return body.routine;
  }

  /** DELETE /api/v1/routines/:id → 204 No Content */
  async delete(cmd: DeleteRoutineCommand): Promise<void> {
    const idemKey = uuidV4();
    const res = await fetch(`${this.baseUrl}/api/v1/routines/${cmd.id}`, {
      method: "DELETE",
      headers: this.authHeaders({
        "Idempotency-Key": idemKey,
        "If-Match": String(cmd.ifMatch),
      }),
    });
    if (res.status === 204) return;
    if (res.status === 412) {
      const errBody = (await res.json()) as { routine?: WebRoutine };
      throw new RoutineConflictError(errBody.routine);
    }
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: failed to delete routine`);
    }
  }
}

/** 412 (楽観ロック競合) 時にスローされるエラー. ボディから取得した最新 routine を保持する (BL-033). */
export class RoutineConflictError extends Error {
  constructor(public readonly currentRoutine?: WebRoutine) {
    super("Conflict: version mismatch on routine");
    this.name = "RoutineConflictError";
  }
}
