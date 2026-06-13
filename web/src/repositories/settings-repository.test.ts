import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
/**
 * 単体テスト: HttpSettingsRepository (BL-009 / settings-day-boundary, BL-076 で新規追加).
 *
 * 受け入れ基準の出典:
 *   - docs/developer/features/settings-day-boundary/spec.md
 *   - docs/developer/features/authed-fetch-repositories/spec.md §AC-7 (settings-repository.test.ts 新規追加)
 *   - docs/developer/features/authed-fetch-repositories/spec.md §AC-5 (constructor から authToken 撤去)
 *   - docs/developer/features/authed-fetch-repositories/spec.md §AC-6 (Repository API 互換)
 *
 * 観点:
 *   1. getSettings() が GET /api/v1/settings を呼び出し Settings を返す.
 *   2. getSettings() が Authorization: Bearer ${AUTH_TOKEN} を付ける.
 *   3. patchSettings() が PATCH /api/v1/settings に Idempotency-Key (UUID v4) と If-Match を付ける.
 *   4. patchSettings() が 412 を受けると PatchConflictError を throw し,
 *      error.settings に response body の settings が入る.
 *
 * BL-076 / AC-5: constructor は `(baseUrl)` の 1 引数のみで宣言され,
 *   `authToken` は受け取らない. token は `authedFetch` が `auth-storage` から都度読む.
 *
 * Seed パターン (BL-074 D-13 / BL-076 D-5):
 *   - beforeEach で WebAuthStorage を生成し setToken(AUTH_TOKEN) で seed,
 *     setAuthStorage(storage) で authedFetch に注入する.
 *   - afterEach で setAuthStorage(null) + localStorage.clear() で state を漏らさない.
 *
 * HTTP スタブ: 既存パターン (project-repository.test.ts / routine-repository.test.ts) に合わせ msw を使用.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { WebAuthStorage } from "../auth/auth-storage.js";
import { setAuthStorage } from "../auth/authed-fetch.js";
import { HttpSettingsRepository, PatchConflictError } from "./settings-repository.js";
import type { Settings } from "./settings-repository.js";

const BASE_URL = "http://localhost:3000";
const AUTH_TOKEN = "test-token";
const SETTINGS_ID = "singleton";
const NOW = "2026-06-08T09:00:00.000Z";

// UUID v4 形式 (Idempotency-Key として使う).
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const server = setupServer();

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});
beforeEach(async () => {
  // BL-076 / D-5: HttpSettingsRepository は constructor の authToken を持たず
  // `authedFetch` 経由で `auth-storage` から token を都度読む.
  // 既存の `Authorization: Bearer ${AUTH_TOKEN}` assertion を満たすため,
  // `WebAuthStorage` に AUTH_TOKEN を seed する.
  localStorage.clear();
  const storage = new WebAuthStorage();
  await storage.setToken(AUTH_TOKEN);
  setAuthStorage(storage);
});
afterEach(() => {
  server.resetHandlers();
  setAuthStorage(null);
  localStorage.clear();
});
afterAll(() => {
  server.close();
});

/** テスト用の Settings ファクトリ */
function makeSettings(overrides: Partial<Settings> = {}): Settings {
  return {
    id: SETTINGS_ID,
    dayBoundaryTime: "04:00",
    version: 1,
    updatedAt: NOW,
    ...overrides,
  };
}

// ============================================================
// spec.md §「Settings (dayBoundaryTime)」
// ============================================================

describe("HttpSettingsRepository", () => {
  /**
   * シナリオ: getSettings() が GET /api/v1/settings を呼び出し Settings を返す
   *   Given サーバが GET /api/v1/settings に 200 OK と { settings: S } を返す
   *   When  HttpSettingsRepository.getSettings() を呼ぶ
   *   Then  Authorization ヘッダを付けた GET リクエストが送られる
   *   And   S が返る
   */
  it("getSettings() は GET /api/v1/settings を Authorization: Bearer 付きで呼び出し Settings を返す", async () => {
    const S = makeSettings({ dayBoundaryTime: "05:30", version: 2 });

    let receivedMethod: string | null = null;
    let receivedAuth: string | null = null;

    server.use(
      http.get(`${BASE_URL}/api/v1/settings`, ({ request }) => {
        receivedMethod = request.method;
        receivedAuth = request.headers.get("Authorization");
        return HttpResponse.json({ settings: S }, { status: 200 });
      }),
    );

    const repo = new HttpSettingsRepository(BASE_URL);
    const settings = await repo.getSettings();

    expect(receivedMethod).toBe("GET");
    expect(receivedAuth).toBe(`Bearer ${AUTH_TOKEN}`);
    expect(settings.id).toBe(SETTINGS_ID);
    expect(settings.dayBoundaryTime).toBe("05:30");
    expect(settings.version).toBe(2);
  });

  /**
   * シナリオ: patchSettings() が PATCH /api/v1/settings に Idempotency-Key と If-Match を付ける
   *   Given サーバが PATCH /api/v1/settings に 200 OK と { settings: S } を返す
   *   When  HttpSettingsRepository.patchSettings({ dayBoundaryTime: "06:00", ifMatch: 1 }) を呼ぶ
   *   Then  Authorization・Content-Type・Idempotency-Key (UUID v4)・If-Match: 1 を付けた
   *         PATCH リクエストが送られる
   *   And   レスポンス body の S が返る
   */
  it("patchSettings() は PATCH /api/v1/settings に Idempotency-Key (UUID v4) と If-Match を付ける", async () => {
    const updated = makeSettings({ dayBoundaryTime: "06:00", version: 2 });

    let receivedMethod: string | null = null;
    let receivedAuth: string | null = null;
    let receivedContentType: string | null = null;
    let receivedIdemKey: string | null = null;
    let receivedIfMatch: string | null = null;
    let receivedBody: unknown = null;

    server.use(
      http.patch(`${BASE_URL}/api/v1/settings`, async ({ request }) => {
        receivedMethod = request.method;
        receivedAuth = request.headers.get("Authorization");
        receivedContentType = request.headers.get("Content-Type");
        receivedIdemKey = request.headers.get("Idempotency-Key");
        receivedIfMatch = request.headers.get("If-Match");
        receivedBody = await request.json();
        return HttpResponse.json({ settings: updated }, { status: 200 });
      }),
    );

    const repo = new HttpSettingsRepository(BASE_URL);
    const result = await repo.patchSettings({ dayBoundaryTime: "06:00", ifMatch: 1 });

    expect(receivedMethod).toBe("PATCH");
    expect(receivedAuth).toBe(`Bearer ${AUTH_TOKEN}`);
    expect(receivedContentType).toContain("application/json");
    // Idempotency-Key は UUID v4 形式であること
    expect(receivedIdemKey).not.toBeNull();
    expect(UUID_V4.test(receivedIdemKey ?? "")).toBe(true);
    // If-Match は ifMatch 引数の値の文字列
    expect(receivedIfMatch).toBe("1");
    // リクエストボディに dayBoundaryTime が含まれる
    expect((receivedBody as Record<string, unknown>).dayBoundaryTime).toBe("06:00");
    // レスポンスが正しく返る
    expect(result.dayBoundaryTime).toBe("06:00");
    expect(result.version).toBe(2);
  });

  /**
   * シナリオ: patchSettings() がサーバ 412 を受けると PatchConflictError を throw する
   *   Given サーバが PATCH /api/v1/settings に 412 と { settings: S } を返す
   *   When  HttpSettingsRepository.patchSettings({ dayBoundaryTime, ifMatch: 1 }) を呼ぶ
   *   Then  PatchConflictError が throw される
   *   And   PatchConflictError.settings が S である
   */
  it("patchSettings() が 412 を受けると PatchConflictError を throw し error.settings に最新値を保持する", async () => {
    const currentSettings = makeSettings({ dayBoundaryTime: "07:00", version: 5 });

    server.use(
      http.patch(`${BASE_URL}/api/v1/settings`, () => {
        return HttpResponse.json({ settings: currentSettings }, { status: 412 });
      }),
    );

    const repo = new HttpSettingsRepository(BASE_URL);
    let caughtError: unknown = null;
    try {
      await repo.patchSettings({ dayBoundaryTime: "06:00", ifMatch: 1 });
    } catch (err) {
      caughtError = err;
    }

    expect(caughtError).toBeInstanceOf(PatchConflictError);
    const conflictError = caughtError as PatchConflictError;
    expect(conflictError.settings).toBeDefined();
    expect(conflictError.settings.dayBoundaryTime).toBe("07:00");
    expect(conflictError.settings.version).toBe(5);
  });
});
