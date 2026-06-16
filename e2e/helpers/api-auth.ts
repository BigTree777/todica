/**
 * E2E 共通ヘルパ: server API を直接叩く際に Authorization ヘッダを得る.
 *
 * - 各 spec が `POST /api/v1/login` で session token を都度取得するための薄いラッパ.
 * - storageState (BL-106) で browser context は認証済みだが, Playwright の
 *   `request` fixture は別 context のため改めて token が必要になる.
 * - パスワードは `playwright.config.ts` の `E2E_TEST_PASSWORD` と同値.
 */
import type { APIRequestContext } from "@playwright/test";

const E2E_TEST_PASSWORD = "test-password";

interface LoginResponse {
  token: string;
}

export async function getApiAuthHeader(
  request: APIRequestContext,
  apiBase: string,
): Promise<{ Authorization: string }> {
  const res = await request.post(`${apiBase}/api/v1/login`, {
    data: { password: E2E_TEST_PASSWORD },
  });
  if (!res.ok()) {
    throw new Error(`E2E login failed: status=${res.status()} body=${await res.text()}`);
  }
  const json = (await res.json()) as LoginResponse;
  return { Authorization: `Bearer ${json.token}` };
}
