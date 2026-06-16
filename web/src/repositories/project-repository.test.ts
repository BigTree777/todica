import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
/**
 * 単体テスト: HttpProjectRepository (BL-016 / project-crud).
 *
 * 受け入れ基準の出典:
 *   - docs/developer/features/project-crud/spec.md §「Web クライアント - ProjectsView」
 *   - docs/developer/features/authed-fetch-repositories/spec.md §AC-5 / AC-6
 *
 * 観点:
 *   1. list() が GET /api/v1/projects を呼び出し Project[] を返す。
 *   2. create() が POST /api/v1/projects に Idempotency-Key ヘッダを付けて呼び出す。
 *   3. update() が PATCH /api/v1/projects/:id に If-Match と Idempotency-Key ヘッダを付けて呼び出す。
 *   4. delete() が DELETE /api/v1/projects/:id に If-Match と Idempotency-Key ヘッダを付けて呼び出す。
 *
 * AC-5: constructor は `(baseUrl)` の 1 引数のみで宣言され,
 *   `authToken` は受け取らない. token は `authedFetch` が `auth-storage` から都度読む.
 * AC-6: Authorization ヘッダの値は seed した AUTH_TOKEN と一致する.
 *
 * Seed パターン (auth-storage D-13 / D-5):
 *   - beforeEach で WebAuthStorage を生成し setToken(AUTH_TOKEN) で seed,
 *     setAuthStorage(storage) で authedFetch に注入する.
 *   - afterEach で setAuthStorage(null) + localStorage.clear() で state を漏らさない.
 *
 * HTTP スタブ: 既存パターン（trash-repository.test.ts）に合わせ msw を使用する。
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { WebAuthStorage } from "../auth/auth-storage.js";
import { setAuthStorage } from "../auth/authed-fetch.js";
import type { Project } from "./project-repository.js";
import { HttpProjectRepository } from "./project-repository.js";

const BASE_URL = "http://localhost:3000";
const AUTH_TOKEN = "test-token";
const PROJECT_ID_1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PROJECT_ID_2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const NOW = "2026-06-07T09:00:00.000Z";

// UUID v4 形式 (Idempotency-Key として使う).
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const server = setupServer();

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});
beforeEach(async () => {
  // D-5: HttpProjectRepository は constructor の authToken を持たず
  // `authedFetch` 経由で `auth-storage` から token を都度読む.
  // 既存の `Authorization: Bearer ${AUTH_TOKEN}` assertion を満たすため,
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

/** テスト用の Project ファクトリ */
function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: PROJECT_ID_1,
    name: "仕事",
    version: 1,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

// ============================================================
// spec.md §「Web クライアント - ProjectsView」
// ============================================================

describe("HttpProjectRepository", () => {
  /**
   * シナリオ: list() が GET /api/v1/projects を呼び出し Project[] を返す
   *   Given サーバが GET /api/v1/projects に 200 OK と { projects: [P1, P2] } を返す
   *   When  HttpProjectRepository.list() を呼ぶ
   *   Then  Authorization ヘッダを付けた GET リクエストが送られる
   *   And   [P1, P2] が返る
   */
  it("list() は GET /api/v1/projects を呼び出し Project[] を返す", async () => {
    const P1 = makeProject({ id: PROJECT_ID_1, name: "個人" });
    const P2 = makeProject({ id: PROJECT_ID_2, name: "仕事" });

    let receivedMethod: string | null = null;
    let receivedAuth: string | null = null;

    server.use(
      http.get(`${BASE_URL}/api/v1/projects`, ({ request }) => {
        receivedMethod = request.method;
        receivedAuth = request.headers.get("Authorization");
        return HttpResponse.json({ projects: [P1, P2] }, { status: 200 });
      }),
    );

    const repo = new HttpProjectRepository(BASE_URL);
    const projects = await repo.list();

    expect(receivedMethod).toBe("GET");
    expect(receivedAuth).toBe(`Bearer ${AUTH_TOKEN}`);
    expect(projects).toHaveLength(2);
    expect(projects[0]?.id).toBe(PROJECT_ID_1);
    expect(projects[0]?.name).toBe("個人");
    expect(projects[1]?.id).toBe(PROJECT_ID_2);
    expect(projects[1]?.name).toBe("仕事");
  });

  /**
   * シナリオ: create() が POST /api/v1/projects に Idempotency-Key ヘッダを付けて呼び出す
   *   Given サーバが POST /api/v1/projects に 201 Created と { project: P } を返す
   *   When  HttpProjectRepository.create({ id, name }) を呼ぶ
   *   Then  Authorization・Idempotency-Key ヘッダを付けた POST リクエストが送られる
   *   And   P が返る
   */
  it("create() は POST /api/v1/projects に Idempotency-Key ヘッダを付けて呼び出す", async () => {
    const created = makeProject({ id: PROJECT_ID_1, name: "仕事", version: 1 });

    let receivedMethod: string | null = null;
    let receivedAuth: string | null = null;
    let receivedIdemKey: string | null = null;
    let receivedBody: unknown = null;

    server.use(
      http.post(`${BASE_URL}/api/v1/projects`, async ({ request }) => {
        receivedMethod = request.method;
        receivedAuth = request.headers.get("Authorization");
        receivedIdemKey = request.headers.get("Idempotency-Key");
        receivedBody = await request.json();
        return HttpResponse.json({ project: created }, { status: 201 });
      }),
    );

    const repo = new HttpProjectRepository(BASE_URL);
    const result = await repo.create({ id: PROJECT_ID_1, name: "仕事" });

    expect(receivedMethod).toBe("POST");
    expect(receivedAuth).toBe(`Bearer ${AUTH_TOKEN}`);
    // Idempotency-Key は UUID v4 形式であること
    expect(receivedIdemKey).not.toBeNull();
    expect(UUID_V4.test(receivedIdemKey ?? "")).toBe(true);
    // リクエストボディに id と name が含まれる
    expect((receivedBody as Record<string, unknown>).name).toBe("仕事");
    // レスポンスが正しく返る
    expect(result.id).toBe(PROJECT_ID_1);
    expect(result.name).toBe("仕事");
    expect(result.version).toBe(1);
  });

  /**
   * シナリオ: update() が PATCH /api/v1/projects/:id に If-Match と Idempotency-Key ヘッダを付けて呼び出す
   *   Given サーバが PATCH /api/v1/projects/:id に 200 OK と { project: P } を返す
   *   When  HttpProjectRepository.update({ id, ifMatch: 1, name: "仕事2" }) を呼ぶ
   *   Then  Authorization・If-Match: 1・Idempotency-Key ヘッダを付けた PATCH リクエストが送られる
   *   And   P が返る
   */
  it("update() は PATCH /api/v1/projects/:id に If-Match と Idempotency-Key ヘッダを付けて呼び出す", async () => {
    const updated = makeProject({ id: PROJECT_ID_1, name: "仕事2", version: 2 });

    let receivedMethod: string | null = null;
    let receivedAuth: string | null = null;
    let receivedIdemKey: string | null = null;
    let receivedIfMatch: string | null = null;
    let receivedPath: string | null = null;
    let receivedBody: unknown = null;

    server.use(
      http.patch(`${BASE_URL}/api/v1/projects/:id`, async ({ request, params }) => {
        receivedMethod = request.method;
        receivedAuth = request.headers.get("Authorization");
        receivedIdemKey = request.headers.get("Idempotency-Key");
        receivedIfMatch = request.headers.get("If-Match");
        receivedPath = String(params.id);
        receivedBody = await request.json();
        return HttpResponse.json({ project: updated }, { status: 200 });
      }),
    );

    const repo = new HttpProjectRepository(BASE_URL);
    const result = await repo.update({ id: PROJECT_ID_1, ifMatch: 1, name: "仕事2" });

    expect(receivedMethod).toBe("PATCH");
    expect(receivedAuth).toBe(`Bearer ${AUTH_TOKEN}`);
    // Idempotency-Key は UUID v4 形式であること
    expect(receivedIdemKey).not.toBeNull();
    expect(UUID_V4.test(receivedIdemKey ?? "")).toBe(true);
    // If-Match は ifMatch 引数の値の文字列
    expect(receivedIfMatch).toBe("1");
    expect(receivedPath).toBe(PROJECT_ID_1);
    // リクエストボディに name が含まれる
    expect((receivedBody as Record<string, unknown>).name).toBe("仕事2");
    // レスポンスが正しく返る
    expect(result.id).toBe(PROJECT_ID_1);
    expect(result.name).toBe("仕事2");
    expect(result.version).toBe(2);
  });

  /**
   * シナリオ: delete() が DELETE /api/v1/projects/:id に If-Match と Idempotency-Key ヘッダを付けて呼び出す
   *   Given サーバが DELETE /api/v1/projects/:id に 204 No Content を返す
   *   When  HttpProjectRepository.delete({ id, ifMatch: 1 }) を呼ぶ
   *   Then  Authorization・If-Match: 1・Idempotency-Key ヘッダを付けた DELETE リクエストが送られる
   *   And   正常終了する（void が返る）
   */
  it("delete() は DELETE /api/v1/projects/:id に If-Match と Idempotency-Key ヘッダを付けて呼び出す", async () => {
    let receivedMethod: string | null = null;
    let receivedAuth: string | null = null;
    let receivedIdemKey: string | null = null;
    let receivedIfMatch: string | null = null;
    let receivedPath: string | null = null;

    server.use(
      http.delete(`${BASE_URL}/api/v1/projects/:id`, ({ request, params }) => {
        receivedMethod = request.method;
        receivedAuth = request.headers.get("Authorization");
        receivedIdemKey = request.headers.get("Idempotency-Key");
        receivedIfMatch = request.headers.get("If-Match");
        receivedPath = String(params.id);
        return new HttpResponse(null, { status: 204 });
      }),
    );

    const repo = new HttpProjectRepository(BASE_URL);
    await expect(repo.delete({ id: PROJECT_ID_1, ifMatch: 1 })).resolves.toBeUndefined();

    expect(receivedMethod).toBe("DELETE");
    expect(receivedAuth).toBe(`Bearer ${AUTH_TOKEN}`);
    // Idempotency-Key は UUID v4 形式であること
    expect(receivedIdemKey).not.toBeNull();
    expect(UUID_V4.test(receivedIdemKey ?? "")).toBe(true);
    // If-Match は ifMatch 引数の値の文字列
    expect(receivedIfMatch).toBe("1");
    expect(receivedPath).toBe(PROJECT_ID_1);
  });
});
