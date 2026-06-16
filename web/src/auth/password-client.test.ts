/**
 * 単体テスト: password-client.
 *
 * 受け入れ基準の出典:
 *   - docs/developer/features/password-change/spec.md §「FR-PWD-6」/ AC-2 / AC-3 / AC-12
 *   - docs/developer/features/password-change/plan.md §「Web クライアント設計」(password-client.ts)
 *   - docs/developer/features/initial-password-setup/spec.md §「FR-IPS-5」
 *   - docs/developer/features/initial-password-setup/plan.md §「Web — `password-client.ts` (`setupInitialPassword` 追加)」
 *
 * 観点:
 *   1. `changePassword(baseUrl, token, currentPassword, newPassword)` が
 *      `POST <baseUrl>/api/v1/password` を発行する.
 *      - Authorization: Bearer <token> が付与される.
 *      - Body は { currentPassword, newPassword } の JSON.
 *      - Content-Type: application/json.
 *   2. 200 応答時に void で resolve する (AC-2).
 *   3. 401 応答時に `InvalidPasswordError` を throw する (AC-3).
 *   4. 400 応答時に `BadRequestError` (または相当の Error) を throw する (AC-12).
 *   5. ネットワークエラー時に `NetworkError` を throw する.
 *   6. 5xx 応答 (サーバ側エラー) でも例外を throw する.
 *   7. `setupInitialPassword(baseUrl, newPassword)` が
 *      `POST <baseUrl>/api/v1/password` を **Authorization 無し** + `{ newPassword }` で発行する.
 *      200 で `{ token, expiresAt }` を resolve / 400 で `BadRequestError` / network で `NetworkError`.
 *
 * 現状: `web/src/auth/password-client.ts` の setupInitialPassword は未実装. 追加分は red.
 */
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  BadRequestError,
  changePassword,
  InvalidPasswordError,
  NetworkError,
  setupInitialPassword,
} from "./password-client.js";

const BASE_URL = "http://localhost:3000";
const TOKEN = "session-token-abc";

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

describe("changePassword(baseUrl, token, currentPassword, newPassword) — 正常系", () => {
  it("/api/v1/password に POST し 200 応答で resolve する (AC-2)", async () => {
    let receivedAuth: string | null = null;
    let receivedContentType: string | null = null;
    let receivedBody: { currentPassword?: string; newPassword?: string } | null = null;

    server.use(
      http.post(`${BASE_URL}/api/v1/password`, async ({ request }) => {
        receivedAuth = request.headers.get("Authorization");
        receivedContentType = request.headers.get("Content-Type");
        receivedBody = (await request.json()) as {
          currentPassword?: string;
          newPassword?: string;
        };
        return new HttpResponse(null, { status: 200 });
      }),
    );

    await expect(changePassword(BASE_URL, TOKEN, "P0", "P1")).resolves.toBeUndefined();

    expect(receivedAuth).toBe(`Bearer ${TOKEN}`);
    expect(receivedContentType).toMatch(/application\/json/);
    expect(receivedBody).toEqual({ currentPassword: "P0", newPassword: "P1" });
  });
});

describe("changePassword — 401 応答 (AC-3)", () => {
  it("401 INVALID_PASSWORD で InvalidPasswordError を throw する", async () => {
    server.use(
      http.post(`${BASE_URL}/api/v1/password`, async () => {
        return HttpResponse.json(
          { code: "INVALID_PASSWORD", message: "password is incorrect" },
          { status: 401 },
        );
      }),
    );

    await expect(changePassword(BASE_URL, TOKEN, "WRONG", "P1")).rejects.toBeInstanceOf(
      InvalidPasswordError,
    );
  });

  it("401 UNAUTHORIZED (Bearer 不正) でも InvalidPasswordError 相当の例外として扱う", async () => {
    // サーバが UNAUTHORIZED を返すケース (token 失効) もクライアントには
    // 認証情報の問題として伝わる必要がある.
    server.use(
      http.post(`${BASE_URL}/api/v1/password`, async () => {
        return HttpResponse.json(
          { code: "UNAUTHORIZED", message: "Invalid Bearer token" },
          { status: 401 },
        );
      }),
    );

    await expect(changePassword(BASE_URL, "expired", "P0", "P1")).rejects.toBeInstanceOf(
      InvalidPasswordError,
    );
  });
});

describe("changePassword — 400 応答 (AC-12)", () => {
  it("400 INVALID_REQUEST_BODY で BadRequestError を throw する", async () => {
    server.use(
      http.post(`${BASE_URL}/api/v1/password`, async () => {
        return HttpResponse.json(
          { code: "INVALID_REQUEST_BODY", message: "newPassword is required" },
          { status: 400 },
        );
      }),
    );

    await expect(changePassword(BASE_URL, TOKEN, "P0", "")).rejects.toBeInstanceOf(BadRequestError);
  });
});

describe("changePassword — ネットワーク / その他エラー", () => {
  it("ネットワークエラーで NetworkError を throw する", async () => {
    server.use(
      http.post(`${BASE_URL}/api/v1/password`, async () => {
        return HttpResponse.error();
      }),
    );

    await expect(changePassword(BASE_URL, TOKEN, "P0", "P1")).rejects.toBeInstanceOf(NetworkError);
  });

  it("5xx 応答 (サーバ側エラー) で何らかの例外を throw する", async () => {
    server.use(
      http.post(`${BASE_URL}/api/v1/password`, async () => {
        return new HttpResponse(null, { status: 500 });
      }),
    );

    await expect(changePassword(BASE_URL, TOKEN, "P0", "P1")).rejects.toThrow();
  });
});

// ============================================================
// setupInitialPassword (initial-password-setup FR-IPS-5)
//
// 初期設定モード用のクライアント. DB 空時の POST /api/v1/password を
// Authorization 無し / { newPassword } で叩き, 200 で { token, expiresAt } を resolve する.
// ============================================================

describe("setupInitialPassword(baseUrl, newPassword) — 正常系", () => {
  it("/api/v1/password に Authorization 無しで { newPassword } を POST し 200 で { token, expiresAt } を resolve する", async () => {
    let receivedAuth: string | null = null;
    let receivedContentType: string | null = null;
    let receivedBody: { newPassword?: string; currentPassword?: string } | null = null;

    server.use(
      http.post(`${BASE_URL}/api/v1/password`, async ({ request }) => {
        receivedAuth = request.headers.get("Authorization");
        receivedContentType = request.headers.get("Content-Type");
        receivedBody = (await request.json()) as {
          newPassword?: string;
          currentPassword?: string;
        };
        return HttpResponse.json(
          { token: "t".repeat(64), expiresAt: 1_800_000_000_000 },
          {
            status: 200,
          },
        );
      }),
    );

    await expect(setupInitialPassword(BASE_URL, "P0")).resolves.toEqual({
      token: "t".repeat(64),
      expiresAt: 1_800_000_000_000,
    });

    // 認証ヘッダは付与しない.
    expect(receivedAuth).toBeNull();
    expect(receivedContentType).toMatch(/application\/json/);
    // currentPassword は送らない.
    expect(receivedBody).toEqual({ newPassword: "P0" });
  });
});

describe("setupInitialPassword — 異常系", () => {
  it("400 INVALID_REQUEST_BODY で BadRequestError を throw する", async () => {
    server.use(
      http.post(`${BASE_URL}/api/v1/password`, async () => {
        return HttpResponse.json(
          { code: "INVALID_REQUEST_BODY", message: "newPassword is required" },
          { status: 400 },
        );
      }),
    );

    await expect(setupInitialPassword(BASE_URL, "")).rejects.toBeInstanceOf(BadRequestError);
  });

  it("ネットワークエラーで NetworkError を throw する", async () => {
    server.use(
      http.post(`${BASE_URL}/api/v1/password`, async () => {
        return HttpResponse.error();
      }),
    );

    await expect(setupInitialPassword(BASE_URL, "P0")).rejects.toBeInstanceOf(NetworkError);
  });

  it("401 / 409 など 200 以外の応答で何らかの例外を throw する (初期設定状態不一致)", async () => {
    server.use(
      http.post(`${BASE_URL}/api/v1/password`, async () => {
        return new HttpResponse(null, { status: 409 });
      }),
    );

    await expect(setupInitialPassword(BASE_URL, "P0")).rejects.toThrow();
  });

  it("5xx 応答で何らかの例外を throw する", async () => {
    server.use(
      http.post(`${BASE_URL}/api/v1/password`, async () => {
        return new HttpResponse(null, { status: 500 });
      }),
    );

    await expect(setupInitialPassword(BASE_URL, "P0")).rejects.toThrow();
  });

  it("レスポンスに token / expiresAt が無い 200 応答は例外を throw する", async () => {
    server.use(
      http.post(`${BASE_URL}/api/v1/password`, async () => {
        return HttpResponse.json({}, { status: 200 });
      }),
    );

    await expect(setupInitialPassword(BASE_URL, "P0")).rejects.toThrow();
  });
});
