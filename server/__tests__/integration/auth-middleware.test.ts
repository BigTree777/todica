/**
 * 結合テスト: authMiddleware (sessions lookup).
 *
 * 受け入れ基準の出典:
 *   - docs/developer/features/app-login/spec.md §「受け入れ基準」AC-1 / AC-4 / AC-7
 *   - docs/developer/features/app-login/plan.md §「処理フロー — 一般 API の authMiddleware」
 *
 * 観点:
 *   1. AC-1: Bearer 無しで `/api/v1/tasks` → 401.
 *   2. AC-2 経路: 有効な session token で `/api/v1/tasks` → 200.
 *   3. AC-4: 期限切れ session token で `/api/v1/tasks` → 401.
 *   4. AC-7: sessions に存在しない固定文字列 Bearer で 401.
 *   5. authMiddleware は `/healthz` を素通し (既存挙動の維持).
 *   6. authMiddleware は `/api/v1/login` を素通し (login 時に token 不要).
 *
 * 現状: createApp の sessions lookup 切替 / passwordHash / sessionRepository 受け口は
 *       未実装のため red になる. Step 2 で green 化する.
 */
import type { FakeClock } from "@todica/domain/clock";
import type { Hono } from "hono";
import { beforeEach, describe, expect, it } from "vitest";
import type { InMemorySessionRepository } from "../helpers/login-for-test.js";
import { buildAuthTestApp, loginForTest, TEST_PASSWORD } from "../helpers/login-for-test.js";

let app: Hono;
let sessionRepo: InMemorySessionRepository;
let clock: FakeClock;

beforeEach(() => {
  const built = buildAuthTestApp();
  app = built.app;
  sessionRepo = built.sessionRepository;
  clock = built.clock;
});

describe("authMiddleware (sessions lookup) — AC-1 / AC-2", () => {
  it("AC-1: Bearer ヘッダ無しで /api/v1/tasks は 401 を返す", async () => {
    const res = await app.request("/api/v1/tasks");
    expect(res.status).toBe(401);
  });

  it("AC-2 経路: /login で発行した token を Bearer に乗せれば /api/v1/tasks は 200 を返す", async () => {
    const token = await loginForTest(app, TEST_PASSWORD);

    const res = await app.request("/api/v1/tasks", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
  });

  it("Bearer 形式不正 (Bearer プレフィックス無し) は 401", async () => {
    const token = await loginForTest(app, TEST_PASSWORD);
    const res = await app.request("/api/v1/tasks", {
      headers: { Authorization: token },
    });
    expect(res.status).toBe(401);
  });
});

describe("authMiddleware (sessions lookup) — AC-4 期限切れ", () => {
  it("期限切れ session token で /api/v1/tasks は 401 を返す", async () => {
    const token = await loginForTest(app, TEST_PASSWORD);

    // sessions テーブルに行は入っている (期限内).
    expect(sessionRepo.count()).toBe(1);

    // clock を 30 日 + 1 ms 進めて, token を期限切れにする.
    clock.tick(30 * 24 * 60 * 60 * 1000 + 1);

    const res = await app.request("/api/v1/tasks", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(401);
  });

  it("期限境界ピッタリ (expires_at === now) は 401 を返す (strict > 判定 / plan D-6)", async () => {
    // sessions に直接 seed して境界を作る.
    const nowMs = new Date(clock.now()).getTime();
    const expiredToken = "c".repeat(64);
    sessionRepo.seed({
      token: expiredToken,
      expiresAt: nowMs, // ちょうど境界.
      createdAt: nowMs - 1000,
    });

    const res = await app.request("/api/v1/tasks", {
      headers: { Authorization: `Bearer ${expiredToken}` },
    });
    expect(res.status).toBe(401);
  });
});

describe("authMiddleware (sessions lookup) — AC-7 未知の固定文字列 Bearer 拒否", () => {
  it("sessions に存在しない固定文字列 Bearer で 401 を返す", async () => {
    // AC-7: 古いクライアント (固定 AUTH_TOKEN Bearer) で API を呼ぶと 401.
    const oldStyleTokens = [
      "test-token", // 旧テスト用固定値.
      "production-bearer-token-12345",
      "secret-token",
      "WRONG",
    ];

    for (const oldToken of oldStyleTokens) {
      const res = await app.request("/api/v1/tasks", {
        headers: { Authorization: `Bearer ${oldToken}` },
      });
      expect(res.status).toBe(401);
    }
  });

  it("有効な token が 1 つ存在する状況でも別の任意文字列 Bearer は 401", async () => {
    // 1 つ正規 token を発行しておく → 別文字列で叩いても通らない.
    await loginForTest(app, TEST_PASSWORD);

    const res = await app.request("/api/v1/tasks", {
      headers: { Authorization: "Bearer not-a-real-session-token" },
    });
    expect(res.status).toBe(401);
  });
});

describe("authMiddleware (sessions lookup) — 素通しパス", () => {
  it("/healthz は Bearer 無しでも 200", async () => {
    const res = await app.request("/healthz");
    expect(res.status).toBe(200);
  });

  it("/api/v1/login は Bearer 無しでも 200 を返す (login 時に token 不要 / plan D-15)", async () => {
    const res = await app.request("/api/v1/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: TEST_PASSWORD }),
    });
    expect(res.status).toBe(200);
  });
});
