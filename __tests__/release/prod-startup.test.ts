/**
 * 本番ビルド検証.
 *
 * dev mode (vite-node) では検出できない、prod build artifact + Node ランタイムでの
 * 起動可否を確認する。ビルド → 起動 → /healthz を一連の流れで実行する。
 *
 * 対比される dev mode 用テスト: `server/__tests__/integration/startup.test.ts`
 *   (Hono app を直接呼んでヘルスチェックを検証する)
 *
 * 認証経路の検証:
 *   - env に `APP_PASSWORD_HASH` (bcrypt cost=4) を渡す.
 *   - 起動後に `POST /api/v1/login` で token を取得.
 *   - その token で `/api/v1/today` を Bearer 認証付きで叩いて 200 を確認.
 *   - sessions に存在しない固定文字列 Bearer は 401 (AC-7).
 *
 * 本テストは:
 *   1. `npm run build -w domain` を実行
 *   2. `npm run build -w server` を実行
 *   3. ビルドされた `server/dist/src/main.js` を子プロセスで起動
 *   4. `/healthz` を fetch して 200 と {"status":"ok"} を確認
 *   5. `/api/v1/login` で token を取得し `/api/v1/today` を Bearer で 200 確認
 *   6. 子プロセスを終了し、一時 DB を削除
 *
 * ビルド時間が長いため testTimeout を 180 秒に設定している。
 */
import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import bcrypt from "bcrypt";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

describe("本番ビルド + 起動", () => {
  let serverProcess: ChildProcess | null = null;
  let tempDir: string | null = null;
  const PORT = 13901;
  // APP_PASSWORD_HASH (bcrypt cost=4) で起動する.
  const APP_PASSWORD = "prod-startup-test-password";
  const APP_PASSWORD_HASH = bcrypt.hashSync(APP_PASSWORD, 4);

  beforeAll(async () => {
    // domain → server の順にビルドする（server は composite references で domain/dist に依存）.
    const buildDomain = spawnSync("npm", ["run", "build", "-w", "domain"], {
      stdio: "pipe",
      encoding: "utf-8",
      cwd: process.cwd(),
    });
    if (buildDomain.status !== 0) {
      throw new Error(
        `domain build failed (exit ${buildDomain.status}):\n${buildDomain.stderr}\n${buildDomain.stdout}`,
      );
    }

    const buildServer = spawnSync("npm", ["run", "build", "-w", "server"], {
      stdio: "pipe",
      encoding: "utf-8",
      cwd: process.cwd(),
    });
    if (buildServer.status !== 0) {
      throw new Error(
        `server build failed (exit ${buildServer.status}):\n${buildServer.stderr}\n${buildServer.stdout}`,
      );
    }

    tempDir = mkdtempSync(join(tmpdir(), "todica-prod-startup-"));
    const dbPath = join(tempDir, "test.db");

    // ビルドされた dist の main.js を Node で起動する.
    // APP_PASSWORD_HASH を env として渡す.
    // 不要な env (AUTH_TOKEN) を継承先から除去する.
    const { AUTH_TOKEN: _drop, ...inheritedEnv } = process.env;
    void _drop;
    const childEnv: NodeJS.ProcessEnv = {
      ...inheritedEnv,
      APP_PASSWORD_HASH,
      DATABASE_PATH: dbPath,
      PORT: String(PORT),
    };
    serverProcess = spawn("node", ["server/dist/src/main.js"], {
      env: childEnv,
      stdio: "pipe",
      cwd: process.cwd(),
    });

    // "Todica server listening" を待つ. 出ない場合は early-exit を error として扱う.
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("server did not become ready within 15s")),
        15_000,
      );
      let stderr = "";

      serverProcess?.stdout?.on("data", (chunk: Buffer) => {
        if (chunk.toString().includes("Todica server listening")) {
          clearTimeout(timeout);
          resolve();
        }
      });
      serverProcess?.stderr?.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      serverProcess?.on("error", (err) => {
        clearTimeout(timeout);
        reject(err);
      });
      serverProcess?.on("exit", (code) => {
        clearTimeout(timeout);
        reject(new Error(`server exited before ready (code ${code}). stderr:\n${stderr}`));
      });
    });
  }, 180_000);

  afterAll(async () => {
    if (serverProcess && serverProcess.exitCode === null) {
      serverProcess.kill("SIGTERM");
      await new Promise<void>((resolve) => {
        const fallback = setTimeout(() => {
          serverProcess?.kill("SIGKILL");
          resolve();
        }, 2000);
        serverProcess?.on("exit", () => {
          clearTimeout(fallback);
          resolve();
        });
      });
    }
    if (tempDir && existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("prod build の dist から起動して /healthz が 200 と {status:'ok'} を返す", async () => {
    const response = await fetch(`http://localhost:${PORT}/healthz`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { status: string };
    expect(body).toEqual({ status: "ok" });
  });

  it("POST /api/v1/login で APP_PASSWORD で token を取得し /api/v1/today を Bearer で 200 を返す", async () => {
    // 1. login で token を取得.
    const loginRes = await fetch(`http://localhost:${PORT}/api/v1/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: APP_PASSWORD }),
    });
    expect(loginRes.status).toBe(200);
    const loginBody = (await loginRes.json()) as { token: string; expiresAt: number };
    expect(loginBody.token).toMatch(/^[0-9a-f]{64}$/i);

    // 2. token で /api/v1/today を叩く → 200.
    const todayRes = await fetch(`http://localhost:${PORT}/api/v1/today`, {
      headers: { Authorization: `Bearer ${loginBody.token}` },
    });
    expect(todayRes.status).toBe(200);

    // 3. (sessions に存在しない固定文字列 Bearer は 401 — AC-7).
    const oldStyleRes = await fetch(`http://localhost:${PORT}/api/v1/today`, {
      headers: { Authorization: "Bearer prod-startup-test-token" },
    });
    expect(oldStyleRes.status).toBe(401);
  });

  it("AC-1: Bearer 無しで /api/v1/today を叩くと 401", async () => {
    const res = await fetch(`http://localhost:${PORT}/api/v1/today`);
    expect(res.status).toBe(401);
  });
});
