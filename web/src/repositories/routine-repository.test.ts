import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
/**
 * 単体テスト: HttpRoutineRepository (BL-017 / routine).
 *
 * 受け入れ基準の出典:
 *   - docs/developer/features/routine/spec.md §「ルーティン作成・一覧・編集・削除」
 *
 * 観点:
 *   1. list() が GET /api/v1/routines を呼び出し WebRoutine[] を返す。
 *   2. create() が POST /api/v1/routines に Idempotency-Key ヘッダを付けて呼び出す。
 *   3. update() が PATCH /api/v1/routines/:id に If-Match と Idempotency-Key ヘッダを付けて呼び出す。
 *   4. delete() が DELETE /api/v1/routines/:id に If-Match と Idempotency-Key ヘッダを付けて呼び出す。
 *
 * 本ファイルは TDD の "red" を作るためのテスト。
 * routine-repository.ts は未実装のため、全テストはインポートエラー / 実行失敗する想定。
 * implementer が HttpRoutineRepository を実装することで green 化する。
 *
 * HTTP スタブ: 既存パターン（project-repository.test.ts）に合わせ msw を使用する。
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { HttpRoutineRepository } from "./routine-repository.js";
import type { WebRoutine } from "./routine-repository.js";

const BASE_URL = "http://localhost:3000";
const AUTH_TOKEN = "test-token";
const ROUTINE_ID_1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ROUTINE_ID_2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const NOW = "2026-06-08T09:00:00.000Z";

// UUID v4 形式 (Idempotency-Key として使う).
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const server = setupServer();

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});
afterEach(() => {
  server.resetHandlers();
});
afterAll(() => {
  server.close();
});

/** テスト用の WebRoutine ファクトリ */
function makeRoutine(overrides: Partial<WebRoutine> = {}): WebRoutine {
  return {
    id: ROUTINE_ID_1,
    name: "朝の運動",
    daysOfWeek: [1, 2, 3, 4, 5],
    defaultPriority: "normal",
    version: 1,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

// ============================================================
// spec.md §「ルーティン一覧取得」
// ============================================================

describe("HttpRoutineRepository (BL-017 / routine)", () => {
  /**
   * シナリオ: list() が GET /api/v1/routines を呼び出し WebRoutine[] を返す
   *   Given サーバが GET /api/v1/routines に 200 OK と { routines: [R1, R2] } を返す
   *   When  HttpRoutineRepository.list() を呼ぶ
   *   Then  Authorization ヘッダを付けた GET リクエストが送られる
   *   And   [R1, R2] が返る
   */
  it("list() は GET /api/v1/routines を呼び出し WebRoutine[] を返す", async () => {
    const R1 = makeRoutine({ id: ROUTINE_ID_1, name: "朝の運動" });
    const R2 = makeRoutine({ id: ROUTINE_ID_2, name: "夜の読書", daysOfWeek: [6] });

    let receivedMethod: string | null = null;
    let receivedAuth: string | null = null;

    server.use(
      http.get(`${BASE_URL}/api/v1/routines`, ({ request }) => {
        receivedMethod = request.method;
        receivedAuth = request.headers.get("Authorization");
        return HttpResponse.json({ routines: [R1, R2] }, { status: 200 });
      }),
    );

    const repo = new HttpRoutineRepository(BASE_URL, AUTH_TOKEN);
    const routines = await repo.list();

    expect(receivedMethod).toBe("GET");
    expect(receivedAuth).toBe(`Bearer ${AUTH_TOKEN}`);
    expect(routines).toHaveLength(2);
    expect(routines[0]?.id).toBe(ROUTINE_ID_1);
    expect(routines[0]?.name).toBe("朝の運動");
    expect(routines[1]?.id).toBe(ROUTINE_ID_2);
    expect(routines[1]?.name).toBe("夜の読書");
  });

  /**
   * シナリオ: create() が POST /api/v1/routines に Idempotency-Key ヘッダを付けて呼び出す
   *   Given サーバが POST /api/v1/routines に 201 Created と { routine: R } を返す
   *   When  HttpRoutineRepository.create({ id, name, daysOfWeek, defaultPriority }) を呼ぶ
   *   Then  Authorization・Idempotency-Key ヘッダを付けた POST リクエストが送られる
   *   And   R が返る
   */
  it("create() は POST /api/v1/routines に Idempotency-Key ヘッダを付けて呼び出す", async () => {
    const created = makeRoutine({ id: ROUTINE_ID_1, name: "朝の運動", version: 1 });

    let receivedMethod: string | null = null;
    let receivedAuth: string | null = null;
    let receivedIdemKey: string | null = null;
    let receivedBody: unknown = null;

    server.use(
      http.post(`${BASE_URL}/api/v1/routines`, async ({ request }) => {
        receivedMethod = request.method;
        receivedAuth = request.headers.get("Authorization");
        receivedIdemKey = request.headers.get("Idempotency-Key");
        receivedBody = await request.json();
        return HttpResponse.json({ routine: created }, { status: 201 });
      }),
    );

    const repo = new HttpRoutineRepository(BASE_URL, AUTH_TOKEN);
    const result = await repo.create({
      id: ROUTINE_ID_1,
      name: "朝の運動",
      daysOfWeek: [1, 2, 3, 4, 5],
      defaultPriority: "normal",
    });

    expect(receivedMethod).toBe("POST");
    expect(receivedAuth).toBe(`Bearer ${AUTH_TOKEN}`);
    // Idempotency-Key は UUID v4 形式であること
    expect(receivedIdemKey).not.toBeNull();
    expect(UUID_V4.test(receivedIdemKey ?? "")).toBe(true);
    // リクエストボディに id, name, daysOfWeek, defaultPriority が含まれる
    const body = receivedBody as Record<string, unknown>;
    expect(body.name).toBe("朝の運動");
    expect(body.daysOfWeek).toEqual([1, 2, 3, 4, 5]);
    expect(body.defaultPriority).toBe("normal");
    // レスポンスが正しく返る
    expect(result.id).toBe(ROUTINE_ID_1);
    expect(result.name).toBe("朝の運動");
    expect(result.version).toBe(1);
  });

  /**
   * シナリオ: update() が PATCH /api/v1/routines/:id に If-Match と Idempotency-Key ヘッダを付けて呼び出す
   *   Given サーバが PATCH /api/v1/routines/:id に 200 OK と { routine: R } を返す
   *   When  HttpRoutineRepository.update({ id, ifMatch: 1, name: "夜の運動" }) を呼ぶ
   *   Then  Authorization・If-Match: 1・Idempotency-Key ヘッダを付けた PATCH リクエストが送られる
   *   And   R が返る
   */
  it("update() は PATCH /api/v1/routines/:id に If-Match と Idempotency-Key ヘッダを付けて呼び出す", async () => {
    const updated = makeRoutine({ id: ROUTINE_ID_1, name: "夜の運動", version: 2 });

    let receivedMethod: string | null = null;
    let receivedAuth: string | null = null;
    let receivedIdemKey: string | null = null;
    let receivedIfMatch: string | null = null;
    let receivedPath: string | null = null;
    let receivedBody: unknown = null;

    server.use(
      http.patch(`${BASE_URL}/api/v1/routines/:id`, async ({ request, params }) => {
        receivedMethod = request.method;
        receivedAuth = request.headers.get("Authorization");
        receivedIdemKey = request.headers.get("Idempotency-Key");
        receivedIfMatch = request.headers.get("If-Match");
        receivedPath = String(params.id);
        receivedBody = await request.json();
        return HttpResponse.json({ routine: updated }, { status: 200 });
      }),
    );

    const repo = new HttpRoutineRepository(BASE_URL, AUTH_TOKEN);
    const result = await repo.update({ id: ROUTINE_ID_1, ifMatch: 1, name: "夜の運動" });

    expect(receivedMethod).toBe("PATCH");
    expect(receivedAuth).toBe(`Bearer ${AUTH_TOKEN}`);
    // Idempotency-Key は UUID v4 形式であること
    expect(receivedIdemKey).not.toBeNull();
    expect(UUID_V4.test(receivedIdemKey ?? "")).toBe(true);
    // If-Match は ifMatch 引数の値の文字列
    expect(receivedIfMatch).toBe("1");
    expect(receivedPath).toBe(ROUTINE_ID_1);
    // リクエストボディに name が含まれる
    expect((receivedBody as Record<string, unknown>).name).toBe("夜の運動");
    // レスポンスが正しく返る
    expect(result.id).toBe(ROUTINE_ID_1);
    expect(result.name).toBe("夜の運動");
    expect(result.version).toBe(2);
  });

  /**
   * シナリオ: delete() が DELETE /api/v1/routines/:id に If-Match と Idempotency-Key ヘッダを付けて呼び出す
   *   Given サーバが DELETE /api/v1/routines/:id に 204 No Content を返す
   *   When  HttpRoutineRepository.delete({ id, ifMatch: 1 }) を呼ぶ
   *   Then  Authorization・If-Match: 1・Idempotency-Key ヘッダを付けた DELETE リクエストが送られる
   *   And   正常終了する（void が返る）
   */
  it("delete() は DELETE /api/v1/routines/:id に If-Match と Idempotency-Key ヘッダを付けて呼び出す", async () => {
    let receivedMethod: string | null = null;
    let receivedAuth: string | null = null;
    let receivedIdemKey: string | null = null;
    let receivedIfMatch: string | null = null;
    let receivedPath: string | null = null;

    server.use(
      http.delete(`${BASE_URL}/api/v1/routines/:id`, ({ request, params }) => {
        receivedMethod = request.method;
        receivedAuth = request.headers.get("Authorization");
        receivedIdemKey = request.headers.get("Idempotency-Key");
        receivedIfMatch = request.headers.get("If-Match");
        receivedPath = String(params.id);
        return new HttpResponse(null, { status: 204 });
      }),
    );

    const repo = new HttpRoutineRepository(BASE_URL, AUTH_TOKEN);
    await expect(repo.delete({ id: ROUTINE_ID_1, ifMatch: 1 })).resolves.toBeUndefined();

    expect(receivedMethod).toBe("DELETE");
    expect(receivedAuth).toBe(`Bearer ${AUTH_TOKEN}`);
    // Idempotency-Key は UUID v4 形式であること
    expect(receivedIdemKey).not.toBeNull();
    expect(UUID_V4.test(receivedIdemKey ?? "")).toBe(true);
    // If-Match は ifMatch 引数の値の文字列
    expect(receivedIfMatch).toBe("1");
    expect(receivedPath).toBe(ROUTINE_ID_1);
  });
});
