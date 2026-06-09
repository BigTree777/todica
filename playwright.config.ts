/**
 * Playwright E2E テスト設定.
 *
 * - server (Hono / port 3000) と Vite (port 5173) を webServer 配列で
 *   テスト開始前に自動起動し, 終了時に落とす.
 * - E2E 専用の DB ファイル (`./.e2e-data/e2e.db`) を `DATABASE_PATH` で渡し,
 *   開発用 `./todica.db` を汚さない. このファイルは `.gitignore` 対象.
 * - 認証トークンは `.env` の `AUTH_TOKEN` / `VITE_AUTH_TOKEN` をそのまま使う
 *   (server / web どちらも root `.env` を読む).
 * - 当面は chromium のみ. クロスブラウザ対応はテスト本数が増えてから検討する.
 */
import { mkdirSync, rmSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

const E2E_DATA_DIR = "./.e2e-data";
const E2E_DB_PATH = `${E2E_DATA_DIR}/e2e.db`;

// テスト実行前に毎回 .e2e-data を空ディレクトリにする.
// (1) 前回の DB を引きずらない. (2) better-sqlite3 は親ディレクトリ不在で
// 失敗するため, dir 自体は必ず作っておく必要がある.
// `globalSetup` ではなくこの module load タイミングで実行することで,
// `webServer` 起動より確実に先に走ることが保証される.
rmSync(E2E_DATA_DIR, { recursive: true, force: true });
mkdirSync(E2E_DATA_DIR, { recursive: true });

export default defineConfig({
  testDir: "./e2e",
  testMatch: /.*\.spec\.ts$/,
  fullyParallel: false, // SQLite ファイルを 1 個共有しているため
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // DB 共有のため
  reporter: process.env.CI ? "github" : "list",

  use: {
    baseURL: "http://localhost:5173",
    trace: "on-first-retry",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  webServer: [
    {
      command: "npm run dev -w server",
      port: 3000,
      timeout: 30_000,
      reuseExistingServer: !process.env.CI,
      env: {
        DATABASE_PATH: E2E_DB_PATH,
      },
    },
    {
      command: "npm run dev -w web",
      port: 5173,
      timeout: 30_000,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
