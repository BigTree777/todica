/**
 * Playwright global setup: E2E テスト共通のログイン状態を 1 回だけ作る.
 *
 * - `webServer` の起動完了後にこの module が呼ばれる.
 * - `POST /api/v1/login` を叩いて session token を取得し, browser context の
 *   `localStorage['todica.auth.token']` に格納した状態を `state.json` に書き出す.
 * - `playwright.config.ts` の `use.storageState` がこの `state.json` を全 spec で
 *   読み込むため, 各 spec は `page.goto("/")` 直後に本体ビューへ到達できる.
 *
 * 例外:
 *   - `login.spec.ts` は冒頭 `beforeEach` で `context.clearCookies()` +
 *     `localStorage.clear()` するため, storageState で持ち込んだ token は無効化
 *     される (= 未認証から start). 既存の AC-1〜AC-5 は維持される.
 *
 * 設計判断:
 *   - UI 経由 (LoginView を操作) ではなく **API 経由** (`/api/v1/login` を直接叩く)
 *     を採用. UI の DOM 変更による flake を避ける + 高速.
 *   - `chromium` だけでなく `chromium-pwa` でも同じ state.json を使う (port 4173).
 *     web 側は同一 origin で localStorage を持つので, baseURL が違ってもキーは共通.
 *     ただし storageState は origin スコープなので, 各 baseURL ごとに state を作る.
 */
import { chromium, type FullConfig, request } from "@playwright/test";

const E2E_TEST_PASSWORD = "test-password";

// `.e2e-data/` ではなく `.e2e-auth/` に置く. 前者は playwright.config.ts の
// module top-level で `rmSync` されるため, config 再ロードのタイミングで
// せっかく作った state.json が消えて test 開始時に ENOENT になる.
export const AUTH_STATE_DIR = "./.e2e-auth";
const AUTH_STATE_PATH_DEV = `${AUTH_STATE_DIR}/state-dev.json`;
const AUTH_STATE_PATH_PROD = `${AUTH_STATE_DIR}/state-prod.json`;

interface LoginResponse {
  token: string;
}

async function loginAndGetToken(serverBaseUrl: string): Promise<string> {
  const ctx = await request.newContext();
  try {
    const res = await ctx.post(`${serverBaseUrl}/api/v1/login`, {
      data: { password: E2E_TEST_PASSWORD },
    });
    if (!res.ok()) {
      throw new Error(`E2E login failed: status=${res.status()} body=${await res.text()}`);
    }
    const json = (await res.json()) as LoginResponse;
    if (typeof json.token !== "string" || json.token.length === 0) {
      throw new Error(`E2E login response missing token: ${JSON.stringify(json)}`);
    }
    return json.token;
  } finally {
    await ctx.dispose();
  }
}

async function writeStorageState(
  webBaseUrl: string,
  token: string,
  outPath: string,
): Promise<void> {
  // localStorage は origin スコープなので, baseURL を開いた context の中で書く.
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ baseURL: webBaseUrl });
    const page = await context.newPage();
    await page.goto(webBaseUrl);
    await page.evaluate(
      ({ key, value }) => {
        localStorage.setItem(key, value);
      },
      { key: "todica.auth.token", value: token },
    );
    await context.storageState({ path: outPath });
    await context.close();
  } finally {
    await browser.close();
  }
}

async function globalSetup(_config: FullConfig): Promise<void> {
  console.log("[global-setup] start");
  const { mkdirSync } = await import("node:fs");
  mkdirSync(AUTH_STATE_DIR, { recursive: true });

  try {
    const token = await loginAndGetToken("http://localhost:3000");
    console.log(`[global-setup] login ok (token len=${token.length})`);

    // dev (chromium project, port 5173) と prod (chromium-pwa project, port 4173) は
    // origin が異なる localStorage を持つので, それぞれ state を作る.
    await writeStorageState("http://localhost:5173", token, AUTH_STATE_PATH_DEV);
    console.log(`[global-setup] dev state written: ${AUTH_STATE_PATH_DEV}`);
    await writeStorageState("http://localhost:4173", token, AUTH_STATE_PATH_PROD);
    console.log(`[global-setup] prod state written: ${AUTH_STATE_PATH_PROD}`);
  } catch (err) {
    console.error("[global-setup] failed:", err);
    throw err;
  }
}

export default globalSetup;
export { AUTH_STATE_PATH_DEV, AUTH_STATE_PATH_PROD };
