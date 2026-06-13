/**
 * 結合テスト: POST /api/v1/login (BL-074 / Step 2).
 *
 * 受け入れ基準の出典:
 *   - docs/developer/features/app-login/spec.md §「受け入れ基準」AC-2 / AC-3
 *   - docs/developer/features/app-login/plan.md §「処理フロー — ログイン」/ D-14
 *
 * 観点:
 *   1. AC-2: 正しいパスワードで 200 + { token, expiresAt }, sessions テーブルに 1 行追加.
 *   2. AC-3: 誤ったパスワードで 401 { code: "INVALID_PASSWORD" }, sessions に影響なし.
 *   3. body 不正 (password 欠落 / 非文字列 / 空文字) で 400.
 *   4. login は Idempotency-Key ガードの対象外 (`Idempotency-Key` 無しで 400 にならない).
 *   5. login パスは認証ミドルウェアの前で受け付ける (Bearer 無しでも到達できる).
 *
 * 現状: /api/v1/login ハンドラは未実装. buildAuthTestApp 経由で createApp に
 *       passwordHash / sessionRepository を渡しても受け口が無く全件 red になる想定.
 */
import type { FakeClock } from "@todica/domain/clock";
import type { Hono } from "hono";
import { beforeEach, describe, expect, it } from "vitest";
import type { InMemorySessionRepository } from "../helpers/login-for-test.js";
import { TEST_PASSWORD, buildAuthTestApp } from "../helpers/login-for-test.js";

let app: Hono;
let sessionRepo: InMemorySessionRepository;
let clock: FakeClock;

beforeEach(() => {
  const built = buildAuthTestApp();
  app = built.app;
  sessionRepo = built.sessionRepository;
  clock = built.clock;
});

describe("POST /api/v1/login — 正常系 (AC-2)", () => {
  it("正しいパスワードで 200 + { token, expiresAt } を返し sessions に 1 行追加される", async () => {
    expect(sessionRepo.count()).toBe(0);

    const res = await app.request("/api/v1/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: TEST_PASSWORD }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { token: string; expiresAt: number };

    // token は crypto.randomBytes(32).toString("hex") = 64 文字 16 進数 (plan D-2).
    expect(typeof body.token).toBe("string");
    expect(body.token).toMatch(/^[0-9a-f]{64}$/i);
    // expiresAt は Unix epoch ms. clock.now() + 30 日 (plan D-6).
    expect(typeof body.expiresAt).toBe("number");

    // sessions テーブルに 1 行追加されている.
    expect(sessionRepo.count()).toBe(1);
    const stored = sessionRepo.get(body.token);
    expect(stored).not.toBeUndefined();
    expect(stored?.expiresAt).toBe(body.expiresAt);
    // expiresAt = clock.now() + 30 日.
    const nowMs = new Date(clock.now()).getTime();
    expect(body.expiresAt).toBe(nowMs + 30 * 24 * 60 * 60 * 1000);
  });

  it("Bearer / Authorization ヘッダ無しでも 200 を返す (authMiddleware 素通し / plan D-15)", async () => {
    // /api/v1/login は token を持っていないクライアントから呼ばれる経路のため,
    // authMiddleware の前で受け付ける.
    const res = await app.request("/api/v1/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: TEST_PASSWORD }),
    });
    expect(res.status).toBe(200);
  });

  it("Idempotency-Key 無しでも 400 MISSING_IDEMPOTENCY_KEY にならない (plan D-16)", async () => {
    // /api/v1/login / /api/v1/logout は idempotencyMiddleware の除外パス.
    const res = await app.request("/api/v1/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: TEST_PASSWORD }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { token: string };
    expect(body.token).toMatch(/^[0-9a-f]{64}$/i);
  });
});

describe("POST /api/v1/login — 異常系 (AC-3)", () => {
  it("誤ったパスワードで 401 + { code: 'INVALID_PASSWORD' } を返す", async () => {
    const res = await app.request("/api/v1/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "wrong-password" }),
    });

    expect(res.status).toBe(401);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("INVALID_PASSWORD");
  });

  it("誤ったパスワード時, sessions に行は追加されない", async () => {
    expect(sessionRepo.count()).toBe(0);
    await app.request("/api/v1/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "wrong-password" }),
    });
    expect(sessionRepo.count()).toBe(0);
  });
});

describe("POST /api/v1/login — body バリデーション (plan D-14)", () => {
  it("password 欠落で 400", async () => {
    const res = await app.request("/api/v1/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    expect(sessionRepo.count()).toBe(0);
  });

  it("password が非文字列 (number) で 400", async () => {
    const res = await app.request("/api/v1/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: 123 }),
    });
    expect(res.status).toBe(400);
    expect(sessionRepo.count()).toBe(0);
  });

  it("password が空文字で 400", async () => {
    const res = await app.request("/api/v1/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "" }),
    });
    expect(res.status).toBe(400);
    expect(sessionRepo.count()).toBe(0);
  });

  it("body が JSON として不正で 400", async () => {
    const res = await app.request("/api/v1/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not-json",
    });
    expect(res.status).toBe(400);
    expect(sessionRepo.count()).toBe(0);
  });
});
