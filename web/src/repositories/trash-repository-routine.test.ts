import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
/**
 * 単体テスト: HttpTrashRepository の Routine 対応 (BL-120 / routine-soft-delete).
 *
 * 受け入れ基準の出典: docs/developer/features/routine-soft-delete/spec.md (FR-3 / FR-4 / D-2).
 * server の GET /api/v1/trash は `{ tasks, projects, routines }` の 3 配列を返す (D-2).
 *   - listRoutines() は routines 配列を TrashedRoutine[] として読み出す.
 *   - restore() は Routine 復元時 200 { routine } を読み出して返す (oneOf の routine 枝, D-3).
 *
 * 注意: 本ファイルは TDD の "red" を作るためのテスト.
 *       HttpTrashRepository は listRoutines() を持たず, restore() は { task } / { project }
 *       のみ読むため, すべて失敗する想定. implementer が repository を拡張することで green 化する.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { WebAuthStorage } from "../auth/auth-storage.js";
import { setAuthStorage } from "../auth/authed-fetch.js";
import type { TrashedRoutine } from "./trash-repository.js";
import { HttpTrashRepository } from "./trash-repository.js";

const BASE_URL = "http://localhost:3000";
const AUTH_TOKEN = "test-token";
const ROUTINE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

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

function makeTrashedRoutine(overrides: Partial<TrashedRoutine> = {}): TrashedRoutine {
  return {
    id: ROUTINE_ID,
    name: "削除済みルーティン",
    trashedAt: "2026-06-07T08:00:00.000Z",
    version: 2,
    ...overrides,
  };
}

describe("HttpTrashRepository (Routine 対応)", () => {
  it("listRoutines() は GET /api/v1/trash の routines 配列を TrashedRoutine[] として返す", async () => {
    const R = makeTrashedRoutine({ id: ROUTINE_ID, name: "削除済み R", version: 2 });

    server.use(
      http.get(`${BASE_URL}/api/v1/trash`, () => {
        // D-2: { tasks, projects, routines } の 3 配列.
        return HttpResponse.json({ tasks: [], projects: [], routines: [R] }, { status: 200 });
      }),
    );

    const repo = new HttpTrashRepository(BASE_URL);
    const routines = await repo.listRoutines();

    expect(routines).toHaveLength(1);
    expect(routines[0]?.id).toBe(ROUTINE_ID);
    expect(routines[0]?.name).toBe("削除済み R");
    expect(routines[0]?.version).toBe(2);
    // TrashedRoutine は trashedReason を持たない (D-6).
    expect((routines[0] as unknown as { trashedReason?: unknown }).trashedReason).toBeUndefined();
  });

  it("listRoutines() は routines キーが無いレスポンス (後方互換) でも空配列を返す", async () => {
    server.use(
      http.get(`${BASE_URL}/api/v1/trash`, () => {
        return HttpResponse.json({ tasks: [], projects: [] }, { status: 200 });
      }),
    );

    const repo = new HttpTrashRepository(BASE_URL);
    const routines = await repo.listRoutines();
    expect(routines).toEqual([]);
  });

  it("restore() は Routine 復元時に 200 { routine } を読み出して返す", async () => {
    const restoredRoutine = makeTrashedRoutine({ id: ROUTINE_ID, version: 3, trashedAt: null });

    let receivedIfMatch: string | null = null;
    server.use(
      http.post(`${BASE_URL}/api/v1/trash/:id/restore`, ({ request }) => {
        receivedIfMatch = request.headers.get("If-Match");
        return HttpResponse.json({ routine: restoredRoutine }, { status: 200 });
      }),
    );

    const repo = new HttpTrashRepository(BASE_URL);
    const result = (await repo.restore({
      id: ROUTINE_ID,
      ifMatch: 2,
    })) as unknown as TrashedRoutine;

    expect(receivedIfMatch).toBe("2");
    expect(result.id).toBe(ROUTINE_ID);
    expect(result.version).toBe(3);
  });
});
