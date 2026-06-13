/**
 * ProjectRepository インターフェース + HTTP 実装 (BL-016 / project-crud).
 *
 * 仕様参照:
 *   - docs/developer/features/project-crud/spec.md §「Web クライアント - ProjectsView」
 *
 * HTTP 呼び出しは `authedFetch` を経由する. 401 を受けた時点で `authedFetch` 側が
 * `auth-storage.clearToken()` + `todica:auth-expired` イベント dispatch を行う.
 */
import { authedFetch } from "../auth/authed-fetch.js";

export interface Project {
  id: string;
  name: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProjectCommand {
  id: string;
  name: string;
}

export interface UpdateProjectCommand {
  id: string;
  ifMatch: number;
  name: string;
}

export interface DeleteProjectCommand {
  id: string;
  ifMatch: number;
}

export interface ProjectRepository {
  list(): Promise<Project[]>;
  create(cmd: CreateProjectCommand): Promise<Project>;
  update(cmd: UpdateProjectCommand): Promise<Project>;
  delete(cmd: DeleteProjectCommand): Promise<void>;
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
 * HTTP 実装. `authedFetch` を使ってサーバの /api/v1/projects 系エンドポイントを叩く.
 */
export class HttpProjectRepository implements ProjectRepository {
  constructor(readonly baseUrl: string) {}

  /** GET /api/v1/projects → { projects: Project[] } */
  async list(): Promise<Project[]> {
    const res = await authedFetch(`${this.baseUrl}/api/v1/projects`, {
      method: "GET",
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: failed to list projects`);
    }
    const body = (await res.json()) as { projects: Project[] };
    return body.projects;
  }

  /** POST /api/v1/projects → { project: Project } */
  async create(cmd: CreateProjectCommand): Promise<Project> {
    const idemKey = uuidV4();
    const res = await authedFetch(`${this.baseUrl}/api/v1/projects`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": idemKey,
      },
      body: JSON.stringify({ id: cmd.id, name: cmd.name }),
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: failed to create project`);
    }
    const body = (await res.json()) as { project: Project };
    return body.project;
  }

  /** PATCH /api/v1/projects/:id → { project: Project } */
  async update(cmd: UpdateProjectCommand): Promise<Project> {
    const idemKey = uuidV4();
    const res = await authedFetch(`${this.baseUrl}/api/v1/projects/${cmd.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": idemKey,
        "If-Match": String(cmd.ifMatch),
      },
      body: JSON.stringify({ name: cmd.name }),
    });
    if (res.status === 412) {
      const errBody = (await res.json()) as { project?: Project };
      throw new ProjectConflictError(errBody.project);
    }
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: failed to update project`);
    }
    const body = (await res.json()) as { project: Project };
    return body.project;
  }

  /** DELETE /api/v1/projects/:id → 204 No Content */
  async delete(cmd: DeleteProjectCommand): Promise<void> {
    const idemKey = uuidV4();
    const res = await authedFetch(`${this.baseUrl}/api/v1/projects/${cmd.id}`, {
      method: "DELETE",
      headers: {
        "Idempotency-Key": idemKey,
        "If-Match": String(cmd.ifMatch),
      },
    });
    if (res.status === 204) return;
    if (res.status === 412) {
      const errBody = (await res.json()) as { project?: Project };
      throw new ProjectConflictError(errBody.project);
    }
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: failed to delete project`);
    }
  }
}

/** 412 (楽観ロック競合) 時にスローされるエラー. ボディから取得した最新 project を保持する (BL-033). */
export class ProjectConflictError extends Error {
  constructor(public readonly currentProject?: Project) {
    super("Conflict: version mismatch on project");
    this.name = "ProjectConflictError";
  }
}
