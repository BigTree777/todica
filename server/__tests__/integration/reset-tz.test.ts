/**
 * 結合テスト: POST /api/v1/reset のサーバ TZ 解釈.
 *
 * 受け入れ基準の出典:
 *   - docs/developer/features/reset-time-rework/spec.md §「(G-1) サーバ TZ 解釈」最終シナリオ
 *     「POST /api/v1/reset の appliedBoundaryAt はサーバ TZ 04:00 を UTC ISO 表現に正規化した値を返す」
 *
 * 検証ポイント:
 *   - process.env.TZ = "Asia/Tokyo" の状態で POST /api/v1/reset を送ったとき,
 *     appliedBoundaryAt が「JST 当日 04:00 に対応する UTC ISO」になっている.
 *   - JST 03:59 では executed:false で 200 が返り, appliedBoundaryAt は依然
 *     「JST 当日 04:00 に対応する UTC ISO」を指す.
 *
 * 現状実装:
 *   POST /api/v1/reset が呼ぶ maybeRunDailyReset 内で
 *   calcTodayBoundaryAt(nowIso, dayBoundaryTime) が UTC 解釈する.
 *   process.env.TZ = "Asia/Tokyo" を反映しないため,
 *   appliedBoundaryAt が "2026-06-07T04:00:00.000Z" (= UTC 当日 04:00)
 *   になってしまい, 期待値 "2026-06-07T19:00:00.000Z" と一致しない.
 */
import type { FakeClock } from "@todica/domain/clock";
import type { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authHeaders, buildTestApp } from "../helpers/build-test-app.js";
import type {
  InMemoryCounterRepository,
  InMemorySettingsRepository,
} from "../helpers/in-memory-repositories.js";

// JST 2026-06-08 04:01 ↔ UTC "2026-06-07T19:01:00.000Z"
const NOW_JST_0401_UTC = "2026-06-07T19:01:00.000Z";
// JST 2026-06-08 03:59 ↔ UTC "2026-06-07T18:59:00.000Z"
const NOW_JST_0359_UTC = "2026-06-07T18:59:00.000Z";
// JST 2026-06-08 04:00 ↔ UTC "2026-06-07T19:00:00.000Z"
const BOUNDARY_JST_0400_UTC = "2026-06-07T19:00:00.000Z";

let app: Hono;
let counterRepo: InMemoryCounterRepository;
let settingsRepo: InMemorySettingsRepository;
let clock: FakeClock;

beforeEach(() => {
  // vi.stubEnv は vi.unstubAllEnvs で元に戻るため savedTz の保存は不要.
  vi.stubEnv("TZ", "Asia/Tokyo");

  const built = buildTestApp({ initialTime: NOW_JST_0401_UTC });
  app = built.app;
  counterRepo = built.counterRepository;
  settingsRepo = built.settingsRepository;
  clock = built.clock;

  settingsRepo.seed({ dayBoundaryTime: "04:00" });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/v1/reset (サーバ TZ = JST)", () => {
  it("シナリオ: JST 04:01 + lastReset=null で POST → 200 { executed:true, appliedBoundaryAt: JST 当日 04:00 の UTC ISO }", async () => {
    // spec.md §G-1 シナリオ「POST /api/v1/reset の appliedBoundaryAt はサーバ TZ 04:00 を UTC ISO 表現に正規化した値を返す」
    // Given サーバ TZ = "Asia/Tokyo", dayBoundaryTime = "04:00",
    //       clock.now() = "2026-06-07T19:01:00.000Z" (JST 2026-06-08 04:01),
    //       counter.lastResetExecutedAt = null
    // When  POST /api/v1/reset を送る
    // Then  200 OK で { executed: true, appliedBoundaryAt: "2026-06-07T19:00:00.000Z" } が返る
    counterRepo.seed({ completedCount: 5, lastResetExecutedAt: null });

    const res = await app.request("/api/v1/reset", {
      method: "POST",
      headers: authHeaders({ "Idempotency-Key": "reset-tz-jst-0401" }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { executed: boolean; appliedBoundaryAt: string };
    expect(body.executed).toBe(true);
    expect(body.appliedBoundaryAt).toBe(BOUNDARY_JST_0400_UTC);
  });

  it("シナリオ: JST 03:59 で POST → 200 { executed:false, appliedBoundaryAt: JST 当日 04:00 の UTC ISO } (境界未到来)", async () => {
    // spec.md §G-1 シナリオ「JST 03:59 にリセット判定するとリセット不要」を HTTP 経路で確認.
    clock.set(NOW_JST_0359_UTC);
    counterRepo.seed({ completedCount: 5, lastResetExecutedAt: null });

    const res = await app.request("/api/v1/reset", {
      method: "POST",
      headers: authHeaders({ "Idempotency-Key": "reset-tz-jst-0359" }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { executed: boolean; appliedBoundaryAt: string };
    expect(body.executed).toBe(false);
    expect(body.appliedBoundaryAt).toBe(BOUNDARY_JST_0400_UTC);
  });
});
