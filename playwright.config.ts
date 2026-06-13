/**
 * Playwright E2E テスト設定.
 *
 * - server (Hono / port 3000) と Vite (port 5173) を webServer 配列で
 *   テスト開始前に自動起動し, 終了時に落とす.
 * - E2E 専用の DB ファイル (`./.e2e-data/e2e.db`) を `DATABASE_PATH` で渡し,
 *   開発用 `./todica.db` を汚さない. このファイルは `.gitignore` 対象.
 * - E2E 用サーバは空 DB で起動し、Web 起動前に初期設定 API でパスワードを登録する.
 *   E2E スペック側は `E2E_TEST_PASSWORD` で `/api/v1/login` を叩く.
 * - 当面は chromium のみ. クロスブラウザ対応はテスト本数が増えてから検討する.
 */
import { mkdirSync, readdirSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { defineConfig, devices } from "@playwright/test";

const E2E_DATA_DIR = "./.e2e-data";
const E2E_DB_PATH = `${E2E_DATA_DIR}/e2e.db`;

const E2E_TEST_PASSWORD = "test-password";
const INITIALIZE_E2E_PASSWORD_COMMAND = `node -e "fetch('http://localhost:3000/api/v1/password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({newPassword:'${E2E_TEST_PASSWORD}'})}).then(r=>{if(!r.ok&&r.status!==401)throw new Error('setup failed: '+r.status)})"`;

// テスト実行前に毎回 .e2e-data を空ディレクトリにする.
// (1) 前回の DB を引きずらない. (2) better-sqlite3 は親ディレクトリ不在で
// 失敗するため, dir 自体は必ず作っておく必要がある.
// `globalSetup` ではなくこの module load タイミングで実行することで,
// `webServer` 起動より確実に先に走ることが保証される.
rmSync(E2E_DATA_DIR, { recursive: true, force: true });
mkdirSync(E2E_DATA_DIR, { recursive: true });

// BL-032: PWA テストには full Chromium バイナリが必要 (Playwright のデフォルト
// chromium-headless-shell では Service Worker が起動しない). Playwright が
// `npx playwright install chromium` で同時に取ってくる full バイナリのパスを
// `~/.cache/ms-playwright/chromium-*/chrome-linux64/chrome` から拾う.
function resolveFullChromium(): string | undefined {
  try {
    const cacheDir = join(homedir(), ".cache", "ms-playwright");
    const entries = readdirSync(cacheDir);
    const chromiumDir = entries.find(
      (name) => name.startsWith("chromium-") && !name.includes("headless_shell"),
    );
    if (!chromiumDir) return undefined;
    return join(cacheDir, chromiumDir, "chrome-linux64", "chrome");
  } catch {
    return undefined;
  }
}
const FULL_CHROMIUM_PATH = resolveFullChromium();

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
      // 通常テスト. デフォルト (chromium-headless-shell) で動く. dev server (5173) を見る.
      testIgnore: /pwa-prod\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], baseURL: "http://localhost:5173" },
    },
    {
      // BL-032: PWA 系テストは prod build (`vite build` + `vite preview`) を full Chromium で見る.
      // (a) dev mode の vite-plugin-pwa は SW スクリプト評価が失敗するため Service Worker が
      //     登録されない. prod build は injectManifest で単一の `/service-worker.js` を吐くので
      //     正しく登録される. (b) full Chromium 必須 = headless-shell では SW が動かない.
      name: "chromium-pwa",
      testMatch: /pwa-prod\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        baseURL: "http://localhost:4173",
        launchOptions: FULL_CHROMIUM_PATH ? { executablePath: FULL_CHROMIUM_PATH } : undefined,
      },
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
        // BL-030: server に FakeClock を注入 + `/api/v1/test/clock/*` エンドポイントを
        // 有効化. 境界時刻またぎの自動 reset を再現可能にする. 値は UTC 5 時で,
        // デフォルト境界時刻 04:00 を既に通過しているため初回 /today で自動 reset が
        // 1 回走り, 以降の clock advance(24h) で再度 reset が triggered される.
        TEST_NOW: "2026-06-09T05:00:00.000Z",
      },
    },
    {
      command: `${INITIALIZE_E2E_PASSWORD_COMMAND} && npm run dev -w web`,
      port: 5173,
      timeout: 30_000,
      reuseExistingServer: !process.env.CI,
    },
    {
      // BL-032: PWA テスト用 prod build を vite preview で配信する (port 4173).
      // ビルドが必要なので timeout を長めに取る. CI でビルドが冪等であれば
      // reuseExistingServer で 2 回目以降は再ビルドをスキップしたいが,
      // Playwright の webServer は command 全体を毎回実行する点に注意.
      //
      command: `${INITIALIZE_E2E_PASSWORD_COMMAND} && npm run build -w web && npm run preview -w web`,
      port: 4173,
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
    },
  ],
});

export { E2E_TEST_PASSWORD };
