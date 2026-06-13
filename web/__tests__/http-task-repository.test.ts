import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
/**
 * 単体テスト: HttpTaskRepository (MSW で fetch をモック).
 *
 * 受け入れ基準の出典:
 *   - docs/developer/features/task-crud/spec.md §「Web クライアント UI」
 *   - docs/developer/features/task-crud/plan.md §処理フロー (Web → HTTP)
 *   - ADR-0010 (Idempotency-Key, If-Match の必須化)
 *
 * 観点:
 *   1. create() が POST /api/v1/tasks に Authorization: Bearer + Idempotency-Key を付ける.
 *   2. update() が PATCH /api/v1/tasks/{id} に If-Match を付ける.
 *   3. delete() が DELETE /api/v1/tasks/{id} に If-Match を付ける.
 *   4. サーバが 412 を返したら OptimisticLockError を throw する.
 *
 * 現状: HttpTaskRepository は全メソッドが throw のスタブ. 全テストが red になる想定.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { WebAuthStorage } from "../src/auth/auth-storage.js";
import { setAuthStorage } from "../src/auth/authed-fetch.js";
import { HttpTaskRepository, OptimisticLockError } from "../src/repositories/task-repository.js";

const BASE_URL = "http://localhost:3000";
const AUTH_TOKEN = "test-token";
const TASK_ID = "11111111-1111-4111-8111-111111111111";

// UUID v4 形式 (HTTP 仕様で Idempotency-Key の値域は限定しないが,
// クライアントの方針として UUID v4 を採用. ADR-0010 / plan.md §処理フロー).
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const server = setupServer();

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});
beforeEach(async () => {
  // HttpTaskRepository は constructor の authToken を持たず
  // `authedFetch` 経由で `auth-storage` から token を都度読む.
  // 既存テストの assertion (`Authorization: Bearer ${AUTH_TOKEN}`) を満たすため
  // `WebAuthStorage` に AUTH_TOKEN を seed する.
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

function defaultTaskResponse(overrides: Record<string, unknown> = {}) {
  return {
    id: TASK_ID,
    name: "牛乳を買う",
    projectId: null,
    dueDate: "today",
    priority: "normal",
    origin: "manual",
    routineId: null,
    createdAt: "2026-06-07T09:00:00.000Z",
    updatedAt: "2026-06-07T09:00:00.000Z",
    trashedAt: null,
    trashedReason: null,
    version: 1,
    ...overrides,
  };
}

describe("HttpTaskRepository", () => {
  it("create() は POST /api/v1/tasks に Authorization: Bearer と Idempotency-Key を付ける", async () => {
    let received: { method: string; auth: string | null; idemKey: string | null } | null = null;
    server.use(
      http.post(`${BASE_URL}/api/v1/tasks`, async ({ request }) => {
        received = {
          method: request.method,
          auth: request.headers.get("Authorization"),
          idemKey: request.headers.get("Idempotency-Key"),
        };
        return HttpResponse.json(
          { task: defaultTaskResponse({ id: TASK_ID, name: "牛乳を買う" }) },
          { status: 201 },
        );
      }),
    );

    const repo = new HttpTaskRepository(BASE_URL);
    const task = await repo.create({ id: TASK_ID, name: "牛乳を買う" });

    expect(task.id).toBe(TASK_ID);
    expect(received).not.toBeNull();
    expect(received!.method).toBe("POST");
    expect(received!.auth).toBe(`Bearer ${AUTH_TOKEN}`);
    // Idempotency-Key は UUID v4 形式. ADR-0010 / plan.md.
    // クライアントの実装が `id` をそのまま Idempotency-Key として使う場合もあるため,
    // TASK_ID または UUID v4 形式の文字列なら通る.
    expect(received!.idemKey).not.toBeNull();
    expect(received!.idemKey === TASK_ID || UUID_V4.test(received!.idemKey ?? "")).toBe(true);
  });

  it("update() は PATCH /api/v1/tasks/{id} に If-Match: <version> を付ける", async () => {
    let received: { method: string; ifMatch: string | null; path: string } | null = null;
    server.use(
      http.patch(`${BASE_URL}/api/v1/tasks/:id`, async ({ request, params }) => {
        received = {
          method: request.method,
          ifMatch: request.headers.get("If-Match"),
          path: String(params.id),
        };
        return HttpResponse.json(
          { task: defaultTaskResponse({ id: TASK_ID, name: "豆乳", version: 2 }) },
          { status: 200 },
        );
      }),
    );

    const repo = new HttpTaskRepository(BASE_URL);
    const task = await repo.update({
      id: TASK_ID,
      ifMatch: 1,
      patch: { name: "豆乳" },
    });

    expect(task.name).toBe("豆乳");
    expect(task.version).toBe(2);
    expect(received).not.toBeNull();
    expect(received!.method).toBe("PATCH");
    expect(received!.path).toBe(TASK_ID);
    expect(received!.ifMatch).toBe("1");
  });

  it("delete() は DELETE /api/v1/tasks/{id} に If-Match: <version> を付ける", async () => {
    let received: { method: string; ifMatch: string | null; path: string } | null = null;
    server.use(
      http.delete(`${BASE_URL}/api/v1/tasks/:id`, async ({ request, params }) => {
        received = {
          method: request.method,
          ifMatch: request.headers.get("If-Match"),
          path: String(params.id),
        };
        return new HttpResponse(null, { status: 204 });
      }),
    );

    const repo = new HttpTaskRepository(BASE_URL);
    await repo.delete({ id: TASK_ID, ifMatch: 3 });

    expect(received).not.toBeNull();
    expect(received!.method).toBe("DELETE");
    expect(received!.path).toBe(TASK_ID);
    expect(received!.ifMatch).toBe("3");
  });

  it("サーバが 412 を返したら OptimisticLockError を throw する", async () => {
    server.use(
      http.patch(`${BASE_URL}/api/v1/tasks/:id`, async () => {
        return HttpResponse.json(
          { task: defaultTaskResponse({ id: TASK_ID, name: "current", version: 5 }) },
          { status: 412 },
        );
      }),
    );

    const repo = new HttpTaskRepository(BASE_URL);
    await expect(
      repo.update({ id: TASK_ID, ifMatch: 1, patch: { name: "stale" } }),
    ).rejects.toBeInstanceOf(OptimisticLockError);
  });
});
