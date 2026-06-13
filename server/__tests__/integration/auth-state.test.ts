import { FakeClock } from "@todica/domain/clock";
/**
 * 結合テスト: GET /api/v1/auth-state.
 *
 * 受け入れ基準の出典:
 *   - docs/developer/features/initial-password-setup/spec.md §「受け入れ基準」AC-3 / AC-4
 *   - docs/developer/features/initial-password-setup/plan.md §「サーバ — `app.ts` (`GET /api/v1/auth-state`)」
 *
 * 観点:
 *   1. AC-3: app_password テーブルが空のとき, Authorization なしで GET /api/v1/auth-state
 *           → 200 + { "initialized": false }.
 *   2. AC-4: app_password テーブルに password_hash が存在するとき, Authorization なしで
 *           GET /api/v1/auth-state → 200 + { "initialized": true }.
 *   3. 認証ミドルウェアは /api/v1/auth-state を素通しする (Bearer 不要).
 *
 * 現状: GET /api/v1/auth-state ハンドラは未実装. 全件 red になる想定.
 */
import bcrypt from "bcrypt";
import { describe, expect, it } from "vitest";
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
} from "../helpers/login-for-test.js";

/**
 * DB が空の状態 (= app_password が未 seed) で createApp する.
 * `buildAuthTestApp()` は constructor で hash を seed してしまうため,
 * 本テスト専用に未初期化アプリを別ビルドする.
 */
function buildUninitializedApp() {
  const taskRepository = new InMemoryTaskRepository();
  const projectRepository = new InMemoryProjectRepository();
  const idempotencyStore = new InMemoryIdempotencyStore();
  const focusRepository = new InMemoryFocusRepository();
  const counterRepository = new InMemoryCounterRepository();
  const settingsRepository = new InMemorySettingsRepository();
  const routineRepository = new InMemoryRoutineRepository();
  const sessionRepository = new InMemorySessionRepository();
  const clock = new FakeClock(TEST_INITIAL_TIME);
  // initialHash 省略 = app_password 空.
  const passwordRepository = new InMemoryPasswordRepository();

  const app = createApp({
    taskRepository,
    projectRepository,
    idempotencyStore,
    focusRepository,
    counterRepository,
    settingsRepository,
    routineRepository,
    sessionRepository,
    clock,
    passwordRepository,
  });

  return { app, passwordRepository, sessionRepository, clock };
}

function buildInitializedApp() {
  const built = buildUninitializedApp();
  // app_password に hash を 1 行入れて initialized 状態にする.
  built.passwordRepository.seed(bcrypt.hashSync("any", 4), Date.now());
  return built;
}

describe("GET /api/v1/auth-state — 未初期化 (AC-3)", () => {
  it("DB が空のとき 200 OK + { initialized: false } を返す", async () => {
    const { app } = buildUninitializedApp();

    const res = await app.request("/api/v1/auth-state", { method: "GET" });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { initialized?: unknown };
    expect(body.initialized).toBe(false);
  });

  it("Authorization ヘッダなしでも 200 を返す (認証不要)", async () => {
    const { app } = buildUninitializedApp();

    const res = await app.request("/api/v1/auth-state", {
      method: "GET",
      // 意図的に Authorization なし.
    });

    expect(res.status).toBe(200);
  });
});

describe("GET /api/v1/auth-state — 初期化済み (AC-4)", () => {
  it("DB に password_hash が存在するとき 200 OK + { initialized: true } を返す", async () => {
    const { app } = buildInitializedApp();

    const res = await app.request("/api/v1/auth-state", { method: "GET" });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { initialized?: unknown };
    expect(body.initialized).toBe(true);
  });

  it("Authorization ヘッダなしでも 200 を返す (認証不要)", async () => {
    const { app } = buildInitializedApp();

    const res = await app.request("/api/v1/auth-state", { method: "GET" });

    expect(res.status).toBe(200);
  });
});
