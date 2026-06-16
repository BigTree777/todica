/**
 * 単体テスト: auth-state-client.
 *
 * 受け入れ基準の出典:
 *   - docs/developer/features/initial-password-setup/spec.md §「FR-IPS-5」/ AC-3 / AC-4
 *   - docs/developer/features/initial-password-setup/plan.md §「Web — `auth-state-client.ts` (新設)」
 *
 * 観点:
 *   1. `fetchAuthState(baseUrl)` が `GET <baseUrl>/api/v1/auth-state` を発行する.
 *      Authorization ヘッダは付与しない (認証不要 API).
 *   2. 200 + { initialized: false } で `{ initialized: false }` を resolve する.
 *   3. 200 + { initialized: true } で `{ initialized: true }` を resolve する.
 *   4. ネットワークエラー時に `NetworkError` を throw する.
 *   5. 5xx 応答時にも何らかの例外を throw する.
 *   6. レスポンスに initialized フィールドが無い / 型が違うとき例外を throw する.
 *
 * 現状: `web/src/auth/auth-state-client.ts` は未実装. インポート不能で red.
 */
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { fetchAuthState, NetworkError } from "./auth-state-client.js";

const BASE_URL = "http://localhost:3000";

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

describe("fetchAuthState(baseUrl) — 正常系", () => {
  it("GET /api/v1/auth-state を発行し 200 + { initialized: false } を resolve する", async () => {
    let receivedAuth: string | null = null;
    let receivedMethod: string | null = null;

    server.use(
      http.get(`${BASE_URL}/api/v1/auth-state`, async ({ request }) => {
        receivedAuth = request.headers.get("Authorization");
        receivedMethod = request.method;
        return HttpResponse.json({ initialized: false }, { status: 200 });
      }),
    );

    await expect(fetchAuthState(BASE_URL)).resolves.toEqual({ initialized: false });

    // Authorization ヘッダは付与しない (認証不要 API).
    expect(receivedAuth).toBeNull();
    expect(receivedMethod).toBe("GET");
  });

  it("200 + { initialized: true } を resolve する", async () => {
    server.use(
      http.get(`${BASE_URL}/api/v1/auth-state`, async () => {
        return HttpResponse.json({ initialized: true }, { status: 200 });
      }),
    );

    await expect(fetchAuthState(BASE_URL)).resolves.toEqual({ initialized: true });
  });
});

describe("fetchAuthState — ネットワーク / その他エラー", () => {
  it("ネットワークエラーで NetworkError を throw する", async () => {
    server.use(
      http.get(`${BASE_URL}/api/v1/auth-state`, async () => {
        return HttpResponse.error();
      }),
    );

    await expect(fetchAuthState(BASE_URL)).rejects.toBeInstanceOf(NetworkError);
  });

  it("5xx 応答で何らかの例外を throw する", async () => {
    server.use(
      http.get(`${BASE_URL}/api/v1/auth-state`, async () => {
        return new HttpResponse(null, { status: 500 });
      }),
    );

    await expect(fetchAuthState(BASE_URL)).rejects.toThrow();
  });

  it("レスポンスボディに initialized が無いと例外を throw する", async () => {
    server.use(
      http.get(`${BASE_URL}/api/v1/auth-state`, async () => {
        return HttpResponse.json({}, { status: 200 });
      }),
    );

    await expect(fetchAuthState(BASE_URL)).rejects.toThrow();
  });

  it("initialized が boolean でないと例外を throw する", async () => {
    server.use(
      http.get(`${BASE_URL}/api/v1/auth-state`, async () => {
        return HttpResponse.json({ initialized: "yes" }, { status: 200 });
      }),
    );

    await expect(fetchAuthState(BASE_URL)).rejects.toThrow();
  });
});
