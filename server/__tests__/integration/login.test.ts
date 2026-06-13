/**
 * 結合テスト: POST /api/v1/login.
 *
 * 受け入れ基準の出典:
 *   - docs/developer/features/app-login/spec.md §「受け入れ基準」AC-2 / AC-3
 *   - docs/developer/features/app-login/plan.md §「処理フロー — ログイン」/ D-14
 *   - docs/developer/features/initial-password-setup/spec.md §「受け入れ基準」AC-7
 *   - docs/developer/features/initial-password-setup/plan.md §「サーバ — `app.ts` (`POST /api/v1/login` の 412 分岐)」
 *
 * 観点:
 *   1. AC-2: 正しいパスワードで 200 + { token, expiresAt }, sessions テーブルに 1 行追加.
 *   2. AC-3: 誤ったパスワードで 401 { code: "INVALID_PASSWORD" }, sessions に影響なし.
 *   3. body 不正 (password 欠落 / 非文字列 / 空文字) で 400.
 *   4. login は Idempotency-Key ガードの対象外 (`Idempotency-Key` 無しで 400 にならない).
 *   5. login パスは認証ミドルウェアの前で受け付ける (Bearer 無しでも到達できる).
 *   6. AC-7 (initial-password-setup): DB が空のとき POST /api/v1/login は
 *      412 { code: "INITIAL_SETUP_REQUIRED" } を返し sessions に INSERT しない.
 *
 * 現状: /api/v1/login ハンドラは未実装. buildAuthTestApp 経由で createApp に
 *       passwordHash / sessionRepository を渡しても受け口が無く全件 red になる想定.
 */
import { FakeClock } from "@todica/domain/clock";
import type { Hono } from "hono";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import {
  InMemoryCounterRepository,
  InMemoryFocusRepository,
  InMemoryIdempotencyStore,
  InMemoryProjectRepository,
  InMemoryRoutineRepository,
  InMemorySettingsRepository,
  InMemoryTaskRepository,
} from "../helpers/in-memory-repositories.js";
import {
  InMemoryPasswordRepository,
  InMemorySessionRepository,
  TEST_INITIAL_TIME,
  TEST_PASSWORD,
  buildAuthTestApp,
} from "../helpers/login-for-test.js";

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

// ============================================================
// 412 INITIAL_SETUP_REQUIRED 分岐 (initial-password-setup AC-7)
//
// DB の app_password が空のとき, POST /api/v1/login は内容を問わず
// 412 INITIAL_SETUP_REQUIRED を返し sessions に行を作らない.
// クライアントは事前に GET /api/v1/auth-state で initialized を判定するが,
// 古いクライアントが直接 /login を叩いた場合のシグナルとして 412 を返す.
// ============================================================

describe("POST /api/v1/login — 未初期化サーバ (initial-password-setup AC-7)", () => {
  /** DB が空 (= app_password 未 seed) の状態でアプリを構築する. */
  function buildUninitializedApp() {
    const taskRepository = new InMemoryTaskRepository();
    const projectRepository = new InMemoryProjectRepository();
    const idempotencyStore = new InMemoryIdempotencyStore();
    const focusRepository = new InMemoryFocusRepository();
    const counterRepository = new InMemoryCounterRepository();
    const settingsRepository = new InMemorySettingsRepository();
    const routineRepository = new InMemoryRoutineRepository();
    const sessionRepository = new InMemorySessionRepository();
    const clockUninit = new FakeClock(TEST_INITIAL_TIME);
    // initialHash 省略 = app_password 空.
    const passwordRepository = new InMemoryPasswordRepository();

    const appUninit = createApp({
      taskRepository,
      projectRepository,
      idempotencyStore,
      focusRepository,
      counterRepository,
      settingsRepository,
      routineRepository,
      sessionRepository,
      clock: clockUninit,
      passwordRepository,
    });

    return { app: appUninit, sessionRepository };
  }

  it("DB 空 + 任意の password で 412 { code: 'INITIAL_SETUP_REQUIRED' } を返す", async () => {
    const { app: uninitApp, sessionRepository } = buildUninitializedApp();

    const res = await uninitApp.request("/api/v1/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "anything" }),
    });

    expect(res.status).toBe(412);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe("INITIAL_SETUP_REQUIRED");
    // sessions に行は追加されない.
    expect(sessionRepository.count()).toBe(0);
  });

  it("DB 空 + 空 body でも 412 を返す (body 形式は問わない)", async () => {
    const { app: uninitApp, sessionRepository } = buildUninitializedApp();

    const res = await uninitApp.request("/api/v1/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(412);
    expect(sessionRepository.count()).toBe(0);
  });

  it("DB に hash 投入後は通常どおり 200 を返す (= 412 は DB 空時のみ)", async () => {
    // sanity: 通常時 (DB あり) の 200 経路は 既存 buildAuthTestApp の正常系で担保.
    const built = buildAuthTestApp();
    const res = await built.app.request("/api/v1/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: TEST_PASSWORD }),
    });
    expect(res.status).toBe(200);
  });
});
