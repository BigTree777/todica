import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
/**
 * 単体テスト: HttpTrashRepository の Project 対応 (BL-119 / project-soft-delete).
 *
 * 受け入れ基準の出典: docs/developer/features/project-soft-delete/spec.md (FR-3 / FR-4 / D-2).
 * server の GET /api/v1/trash は `{ tasks, projects }` の 2 配列を返す (D-2).
 *   - listProjects() は projects 配列を TrashedProject[] として読み出す.
 *   - restore() は Project 復元時 200 { project } を読み出して返す (oneOf の project 枝, D-3).
 *
 * 注意: 本ファイルは TDD の "red" を作るためのテスト.
 *       HttpTrashRepository は listProjects() を持たず, restore() は { task } 固定で
 *       読むため, すべて失敗する想定. implementer が repository を拡張することで green 化する.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { WebAuthStorage } from "../auth/auth-storage.js";
import { setAuthStorage } from "../auth/authed-fetch.js";
import type { TrashedProject } from "./trash-repository.js";
import { HttpTrashRepository } from "./trash-repository.js";

const BASE_URL = "http://localhost:3000";
const AUTH_TOKEN = "test-token";
const PROJECT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const server = setupServer();

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});
beforeEach(async () => {
  localStorage.clear();
  const storage = new WebAuthStorage();
  await storage.setToken(AUTH_TOKEN);
  setAuthStorage(storage);
});
afterEach(() => {
  server.resetHandlers();
  setAuthStorage(null);
  localStorage.clear();
});
afterAll(() => {
  server.close();
});

function makeTrashedProject(overrides: Partial<TrashedProject> = {}): TrashedProject {
  return {
    id: PROJECT_ID,
    name: "削除済みプロジェクト",
    trashedAt: "2026-06-07T08:00:00.000Z",
    version: 2,
    ...overrides,
  };
}

describe("HttpTrashRepository (Project 対応)", () => {
  it("listProjects() は GET /api/v1/trash の projects 配列を TrashedProject[] として返す", async () => {
    const P = makeTrashedProject({ id: PROJECT_ID, name: "削除済み P", version: 2 });

    server.use(
      http.get(`${BASE_URL}/api/v1/trash`, () => {
        // D-2: { tasks, projects } の 2 配列.
        return HttpResponse.json({ tasks: [], projects: [P] }, { status: 200 });
      }),
    );

    const repo = new HttpTrashRepository(BASE_URL);
    const projects = await repo.listProjects();

    expect(projects).toHaveLength(1);
    expect(projects[0]?.id).toBe(PROJECT_ID);
    expect(projects[0]?.name).toBe("削除済み P");
    expect(projects[0]?.version).toBe(2);
    // TrashedProject は trashedReason を持たない (D-6).
    expect((projects[0] as unknown as { trashedReason?: unknown }).trashedReason).toBeUndefined();
  });

  it("restore() は Project 復元時に 200 { project } を読み出して返す", async () => {
    const restoredProject = makeTrashedProject({ id: PROJECT_ID, version: 3, trashedAt: null });

    let receivedIfMatch: string | null = null;
    server.use(
      http.post(`${BASE_URL}/api/v1/trash/:id/restore`, ({ request }) => {
        receivedIfMatch = request.headers.get("If-Match");
        return HttpResponse.json({ project: restoredProject }, { status: 200 });
      }),
    );

    const repo = new HttpTrashRepository(BASE_URL);
    const result = (await repo.restore({
      id: PROJECT_ID,
      ifMatch: 2,
    })) as unknown as TrashedProject;

    expect(receivedIfMatch).toBe("2");
    expect(result.id).toBe(PROJECT_ID);
    expect(result.version).toBe(3);
  });
});
