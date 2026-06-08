/**
 * 単体テスト: HttpTrashRepository (BL-014 / web-client-foundation).
 *
 * 受け入れ基準の出典:
 *   - docs/developer/features/web-client-foundation/spec.md §「TrashRepository（HttpTrashRepository）」
 *   - docs/developer/features/web-client-foundation/plan.md §D-003
 *
 * 観点:
 *   1. list() が GET /api/v1/trash を呼び出し TrashedTask[] を返す。
 *   2. restore() が POST /api/v1/trash/:id/restore に Idempotency-Key と If-Match ヘッダを付けて呼び出す。
 *   3. restore() がサーバ 412 を受けると RestoreConflictError を throw する（currentTask を保持）。
 *   4. empty() が DELETE /api/v1/trash に Idempotency-Key ヘッダを付けて呼び出し正常終了する。
 *
 * 本ファイルは TDD の "red" を作るためのテスト。
 * trash-repository.ts は未実装のため、全テストはインポートエラー / 実行失敗する想定。
 * implementer が HttpTrashRepository を実装することで green 化する。
 *
 * HTTP スタブ: 既存パターン（http-task-repository.test.ts）に合わせ msw を使用する。
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import {
  HttpTrashRepository,
  RestoreConflictError,
} from "./trash-repository.js";
import type { TrashedTask } from "./trash-repository.js";

const BASE_URL = "http://localhost:3000";
const AUTH_TOKEN = "test-token";
const TASK_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TASK_ID_2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

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

/** テスト用の TrashedTask ファクトリ */
function makeTrashedTask(overrides: Partial<TrashedTask> = {}): TrashedTask {
  return {
    id: TASK_ID,
    name: "テストタスク",
    trashedAt: "2026-06-07T09:00:00.000Z",
    trashedReason: "deleted",
    version: 2,
    ...overrides,
  };
}

// ============================================================
// spec.md §「TrashRepository（HttpTrashRepository）」
// ============================================================

describe("HttpTrashRepository", () => {
  /**
   * シナリオ: list() が GET /api/v1/trash を呼び出し { tasks } を返す
   *   Given サーバが GET /api/v1/trash に 200 OK と { tasks: [T1] } を返す
   *   When  HttpTrashRepository.list() を呼ぶ
   *   Then  [T1] が返る
   */
  it("list() は GET /api/v1/trash を呼び出し TrashedTask[] を返す", async () => {
    const T1 = makeTrashedTask({ id: TASK_ID, name: "削除済みタスク", trashedReason: "deleted", version: 1 });
    const T2 = makeTrashedTask({ id: TASK_ID_2, name: "完了済みタスク", trashedReason: "completed", version: 3 });

    let receivedMethod: string | null = null;
    let receivedAuth: string | null = null;

    server.use(
      http.get(`${BASE_URL}/api/v1/trash`, ({ request }) => {
        receivedMethod = request.method;
        receivedAuth = request.headers.get("Authorization");
        return HttpResponse.json({ tasks: [T1, T2] }, { status: 200 });
      }),
    );

    const repo = new HttpTrashRepository(BASE_URL, AUTH_TOKEN);
    const tasks = await repo.list();

    expect(receivedMethod).toBe("GET");
    expect(receivedAuth).toBe(`Bearer ${AUTH_TOKEN}`);
    expect(tasks).toHaveLength(2);
    expect(tasks[0]?.id).toBe(TASK_ID);
    expect(tasks[0]?.trashedReason).toBe("deleted");
    expect(tasks[1]?.id).toBe(TASK_ID_2);
    expect(tasks[1]?.trashedReason).toBe("completed");
  });

  /**
   * シナリオ: restore() が POST /api/v1/trash/:id/restore を Idempotency-Key と If-Match 付きで呼び出す
   *   Given サーバが POST /api/v1/trash/<id>/restore に 200 OK と { task: T } を返す
   *   When  HttpTrashRepository.restore({ id, ifMatch: 2 }) を呼ぶ
   *   Then  Authorization・Idempotency-Key・If-Match: 2 ヘッダを付けたリクエストが送られる
   *   And   T が返る
   */
  it("restore() は POST /api/v1/trash/:id/restore に Idempotency-Key と If-Match ヘッダを付けて呼び出す", async () => {
    const restoredTask = makeTrashedTask({ id: TASK_ID, version: 3 });

    let receivedMethod: string | null = null;
    let receivedAuth: string | null = null;
    let receivedIdemKey: string | null = null;
    let receivedIfMatch: string | null = null;
    let receivedPath: string | null = null;

    server.use(
      http.post(`${BASE_URL}/api/v1/trash/:id/restore`, ({ request, params }) => {
        receivedMethod = request.method;
        receivedAuth = request.headers.get("Authorization");
        receivedIdemKey = request.headers.get("Idempotency-Key");
        receivedIfMatch = request.headers.get("If-Match");
        receivedPath = String(params.id);
        return HttpResponse.json({ task: restoredTask }, { status: 200 });
      }),
    );

    const repo = new HttpTrashRepository(BASE_URL, AUTH_TOKEN);
    const result = await repo.restore({ id: TASK_ID, ifMatch: 2 });

    expect(receivedMethod).toBe("POST");
    expect(receivedAuth).toBe(`Bearer ${AUTH_TOKEN}`);
    // Idempotency-Key は UUID v4 形式であること (plan.md §D-003)
    expect(receivedIdemKey).not.toBeNull();
    expect(UUID_V4.test(receivedIdemKey ?? "")).toBe(true);
    // If-Match は ifMatch 引数の値の文字列
    expect(receivedIfMatch).toBe("2");
    expect(receivedPath).toBe(TASK_ID);
    expect(result.id).toBe(TASK_ID);
    expect(result.version).toBe(3);
  });

  /**
   * シナリオ: restore() がサーバ 412 を受けると RestoreConflictError を throw する
   *   Given サーバが POST /api/v1/trash/<id>/restore に 412 と { task: T } を返す
   *   When  HttpTrashRepository.restore({ id, ifMatch: 1 }) を呼ぶ
   *   Then  RestoreConflictError が throw される
   *   And   RestoreConflictError.currentTask が T である
   */
  it("restore() がサーバ 412 を受けると RestoreConflictError を throw し currentTask を保持する", async () => {
    const currentTask = makeTrashedTask({ id: TASK_ID, version: 3 });

    server.use(
      http.post(`${BASE_URL}/api/v1/trash/:id/restore`, () => {
        return HttpResponse.json({ task: currentTask }, { status: 412 });
      }),
    );

    const repo = new HttpTrashRepository(BASE_URL, AUTH_TOKEN);
    let caughtError: unknown = null;

    try {
      await repo.restore({ id: TASK_ID, ifMatch: 1 });
    } catch (err) {
      caughtError = err;
    }

    expect(caughtError).toBeInstanceOf(RestoreConflictError);
    const conflictError = caughtError as RestoreConflictError;
    expect(conflictError.currentTask).toBeDefined();
    expect(conflictError.currentTask.id).toBe(TASK_ID);
    expect(conflictError.currentTask.version).toBe(3);
  });

  /**
   * シナリオ: empty() が DELETE /api/v1/trash を Idempotency-Key 付きで呼び出し 204 を返す
   *   Given サーバが DELETE /api/v1/trash に 204 を返す
   *   When  HttpTrashRepository.empty() を呼ぶ
   *   Then  Idempotency-Key ヘッダを付けたリクエストが送られる
   *   And   正常終了する（void が返る）
   */
  it("empty() は DELETE /api/v1/trash に Idempotency-Key ヘッダを付けて呼び出し正常終了する", async () => {
    let receivedMethod: string | null = null;
    let receivedAuth: string | null = null;
    let receivedIdemKey: string | null = null;

    server.use(
      http.delete(`${BASE_URL}/api/v1/trash`, ({ request }) => {
        receivedMethod = request.method;
        receivedAuth = request.headers.get("Authorization");
        receivedIdemKey = request.headers.get("Idempotency-Key");
        return new HttpResponse(null, { status: 204 });
      }),
    );

    const repo = new HttpTrashRepository(BASE_URL, AUTH_TOKEN);
    // void が返る (例外が投げられない) ことを確認する
    await expect(repo.empty()).resolves.toBeUndefined();

    expect(receivedMethod).toBe("DELETE");
    expect(receivedAuth).toBe(`Bearer ${AUTH_TOKEN}`);
    // Idempotency-Key は UUID v4 形式であること (plan.md §D-003)
    expect(receivedIdemKey).not.toBeNull();
    expect(UUID_V4.test(receivedIdemKey ?? "")).toBe(true);
  });
});
