/**
 * 結合テスト: POST /api/v1/logout.
 *
 * 受け入れ基準の出典:
 *   - docs/developer/features/app-login/spec.md §「受け入れ基準」AC-5
 *   - docs/developer/features/app-login/plan.md §「処理フロー — ログアウト」/ D-15 / D-16
 *
 * 観点:
 *   1. AC-5: 有効 Bearer token で 200/204 を返し sessions から該当行 DELETE.
 *   2. 既に logout 済み (sessions に行が無い) token で 401 (token 無効 = authMiddleware 拒否).
 *   3. Bearer 無しで 401.
 *   4. Idempotency-Key 無しでも 400 にならない (plan D-16 除外).
 */
import type { FakeClock } from "@todica/domain/clock";
import type { Hono } from "hono";
import { beforeEach, describe, expect, it } from "vitest";
import type { InMemorySessionRepository } from "../helpers/login-for-test.js";
import { buildAuthTestApp, loginForTest } from "../helpers/login-for-test.js";

let app: Hono;
let sessionRepo: InMemorySessionRepository;
let clock: FakeClock;
let password: string;
let token: string;

beforeEach(async () => {
  const built = buildAuthTestApp();
  app = built.app;
  sessionRepo = built.sessionRepository;
  clock = built.clock;
  password = built.password;
  token = await loginForTest(app, password);
});

describe("POST /api/v1/logout — 正常系 (AC-5)", () => {
  it("有効 Bearer token で 200 または 204 を返し sessions から該当行が DELETE される", async () => {
    expect(sessionRepo.count()).toBe(1);

    const res = await app.request("/api/v1/logout", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });

    // plan §「処理フロー — ログアウト」: 204 No Content を返す.
    // (200 を返す実装も許容するため 200 / 204 の両方を受理する.)
    expect([200, 204]).toContain(res.status);

    // sessions テーブルから該当行が消えている.
    expect(sessionRepo.count()).toBe(0);
    expect(sessionRepo.get(token)).toBeUndefined();
  });

  it("logout は Idempotency-Key 無しでも 400 にならない (plan D-16 除外)", async () => {
    const res = await app.request("/api/v1/logout", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    expect([200, 204]).toContain(res.status);
  });
});

describe("POST /api/v1/logout — 認証 (AC-1)", () => {
  it("Bearer ヘッダ無しで 401 を返す", async () => {
    const res = await app.request("/api/v1/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(401);
    // sessions は変化しない.
    expect(sessionRepo.count()).toBe(1);
  });

  it("既に logout 済み (sessions に無い) token で 401 を返す (二重 logout)", async () => {
    // 1 回目の logout で削除.
    const first = await app.request("/api/v1/logout", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    expect([200, 204]).toContain(first.status);
    expect(sessionRepo.count()).toBe(0);

    // 2 回目: token は sessions に存在しないので authMiddleware が 401 で弾く.
    const second = await app.request("/api/v1/logout", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(second.status).toBe(401);
  });

  it("存在しない token で 401 を返す", async () => {
    const res = await app.request("/api/v1/logout", {
      method: "POST",
      headers: { Authorization: `Bearer ${"f".repeat(64)}` },
    });
    expect(res.status).toBe(401);
    // 既存 session は影響を受けない.
    expect(sessionRepo.count()).toBe(1);
  });

  it("clock 時刻に依存しない (期限内であれば logout 成功)", async () => {
    // clock を少し進めても期限内であれば logout は成功する.
    clock.tick(1000);
    const res = await app.request("/api/v1/logout", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    expect([200, 204]).toContain(res.status);
    expect(sessionRepo.count()).toBe(0);
  });
});
