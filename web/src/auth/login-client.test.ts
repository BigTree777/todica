/**
 * 単体テスト: login-client (BL-074 / Step 3).
 *
 * 受け入れ基準の出典:
 *   - docs/developer/features/app-login/spec.md §「共通コンポーネント」/ AC-2 / AC-3
 *   - docs/developer/features/app-login/plan.md §「Web モジュール」(login-client.ts)
 *
 * 観点:
 *   1. `login(password)` が `POST /api/v1/login` を baseUrl 配下に発行する.
 *   2. 200 応答時に `{ token, expiresAt }` を返す.
 *   3. 401 応答時に `InvalidPasswordError` を throw する.
 *   4. ネットワークエラー時に `NetworkError` (または相当の例外) を throw する.
 *   5. `logout(token)` が `POST /api/v1/logout` を Bearer 付きで発行する.
 *
 * 現状: `web/src/auth/login-client.ts` は未実装. インポート不能で red.
 */
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { InvalidPasswordError, NetworkError, login, logout } from "./login-client.js";

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

describe("login(password)", () => {
  it("/api/v1/login に POST し 200 応答で { token, expiresAt } を返す (AC-2)", async () => {
    let receivedBody: { password?: string } | null = null;
    server.use(
      http.post(`${BASE_URL}/api/v1/login`, async ({ request }) => {
        receivedBody = (await request.json()) as { password?: string };
        return HttpResponse.json(
          { token: "f".repeat(64), expiresAt: 1_700_000_000_000 },
          { status: 200 },
        );
      }),
    );

    const result = await login(BASE_URL, "correct-password");

    expect(result.token).toBe("f".repeat(64));
    expect(result.expiresAt).toBe(1_700_000_000_000);
    expect(receivedBody).toEqual({ password: "correct-password" });
  });

  it("401 応答時に InvalidPasswordError を throw する (AC-3)", async () => {
    server.use(
      http.post(`${BASE_URL}/api/v1/login`, async () => {
        return HttpResponse.json(
          { code: "INVALID_PASSWORD", message: "Invalid password" },
          { status: 401 },
        );
      }),
    );

    await expect(login(BASE_URL, "wrong-password")).rejects.toBeInstanceOf(InvalidPasswordError);
  });

  it("ネットワークエラーで NetworkError を throw する", async () => {
    server.use(
      http.post(`${BASE_URL}/api/v1/login`, async () => {
        return HttpResponse.error();
      }),
    );

    await expect(login(BASE_URL, "any")).rejects.toBeInstanceOf(NetworkError);
  });

  it("5xx 応答 (サーバ側エラー) でも例外を throw する (InvalidPassword 以外)", async () => {
    server.use(
      http.post(`${BASE_URL}/api/v1/login`, async () => {
        return new HttpResponse(null, { status: 500 });
      }),
    );

    await expect(login(BASE_URL, "any")).rejects.toThrow();
  });
});

describe("logout(token)", () => {
  it("/api/v1/logout に Bearer <token> 付きで POST する", async () => {
    let receivedAuth: string | null = null;
    server.use(
      http.post(`${BASE_URL}/api/v1/logout`, async ({ request }) => {
        receivedAuth = request.headers.get("Authorization");
        return new HttpResponse(null, { status: 204 });
      }),
    );

    await logout(BASE_URL, "session-token-abc");

    expect(receivedAuth).toBe("Bearer session-token-abc");
  });

  it("logout が 401 を返した場合でも throw せず完了する (冪等な後始末)", async () => {
    server.use(
      http.post(`${BASE_URL}/api/v1/logout`, async () => {
        return HttpResponse.json({ code: "UNAUTHORIZED" }, { status: 401 });
      }),
    );

    // 既に期限切れ / 無効 token の場合でも logout の後始末 (UI 側の token 破棄) は走らせたい.
    await expect(logout(BASE_URL, "expired-token")).resolves.toBeUndefined();
  });
});
