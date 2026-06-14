/**
 * 単体テスト: maybeRunDailyReset のサーバ TZ 経路.
 *
 * 受け入れ基準の出典:
 *   - docs/developer/features/reset-time-rework/spec.md §「(G-1) サーバ TZ 解釈」
 *   - docs/developer/features/reset-time-rework/plan.md §「処理フロー (サーバ日次リセット判定)」
 *
 * 対象モジュール: server/src/use-cases/daily-reset.ts
 *
 * 検証ポイント:
 *   - process.env.TZ = "Asia/Tokyo" の状態で maybeRunDailyReset が
 *     JST の壁時計時刻に基づいて境界判定する.
 *   - JST 04:01 ではリセット発火 (executed: true).
 *   - JST 03:59 ではリセット発火しない (executed: false).
 *   - JST 当日 10:00 で既に当日 04:05 にリセット済みなら no-op (executed: false).
 *
 * 現状実装:
 *   maybeRunDailyReset は calcTodayBoundaryAt(nowIso, dayBoundaryTime) を引数 2 で呼ぶ.
 *   getServerTimeZone() ヘルパは未実装. process.env.TZ を JST にセットしても
 *   現状は UTC として解釈されるため,
 *   JST 04:01 (= UTC 19:01 前日) は境界 (UTC 19:01 前日のはずが UTC 04:00 当日扱い)
 *   と比較されてしまい, テストは失敗する.
 */
import { FakeClock } from "@todica/domain/clock";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { maybeRunDailyReset } from "../../src/use-cases/daily-reset.js";
import {
  InMemoryCounterRepository,
  InMemorySettingsRepository,
  InMemoryTaskRepository,
} from "../helpers/in-memory-repositories.js";

// JST = UTC+9 (DST 非考慮).
// 各時刻の対応:
//   JST 2026-06-08 04:01 ↔ UTC "2026-06-07T19:01:00.000Z"
//   JST 2026-06-08 03:59 ↔ UTC "2026-06-07T18:59:00.000Z"
//   JST 2026-06-08 04:00 ↔ UTC "2026-06-07T19:00:00.000Z" (= 当日境界の UTC ISO)
//   JST 2026-06-08 10:00 ↔ UTC "2026-06-08T01:00:00.000Z"
//   JST 2026-06-08 04:05 ↔ UTC "2026-06-07T19:05:00.000Z"
const NOW_JST_0401_UTC = "2026-06-07T19:01:00.000Z";
const NOW_JST_0359_UTC = "2026-06-07T18:59:00.000Z";
const NOW_JST_1000_UTC = "2026-06-08T01:00:00.000Z";
const BOUNDARY_JST_0400_UTC = "2026-06-07T19:00:00.000Z";
const RESET_JST_0405_UTC = "2026-06-07T19:05:00.000Z";

describe("maybeRunDailyReset: サーバ TZ = JST のとき JST の壁時計時刻で境界判定する (spec.md G-1)", () => {
  beforeEach(() => {
    // vi.stubEnv は vi.unstubAllEnvs で元に戻るため savedTz の保存は不要.
    vi.stubEnv("TZ", "Asia/Tokyo");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("シナリオ: JST 04:01 + dayBoundaryTime='04:00' + lastReset=null → executed:true & appliedBoundaryAt = JST 04:00 の UTC ISO", async () => {
    // spec.md §G-1 シナリオ「サーバ TZ = JST, dayBoundaryTime = '04:00', JST 04:01 にリセット判定するとリセット必要」
    const taskRepository = new InMemoryTaskRepository();
    const counterRepository = new InMemoryCounterRepository();
    const settingsRepository = new InMemorySettingsRepository();
    settingsRepository.seed({ dayBoundaryTime: "04:00" });
    counterRepository.seed({ completedCount: 0, lastResetExecutedAt: null });
    const clock = new FakeClock(NOW_JST_0401_UTC);

    const result = await maybeRunDailyReset({
      taskRepository,
      counterRepository,
      settingsRepository,
      clock,
    });

    expect(result.executed).toBe(true);
    expect(result.appliedBoundaryAt).toBe(BOUNDARY_JST_0400_UTC);
  });

  it("シナリオ: JST 03:59 + dayBoundaryTime='04:00' + lastReset=null → executed:false (境界未到来)", async () => {
    // spec.md §G-1 シナリオ「サーバ TZ = JST, dayBoundaryTime = '04:00', JST 03:59 にリセット判定するとリセット不要」
    const taskRepository = new InMemoryTaskRepository();
    const counterRepository = new InMemoryCounterRepository();
    const settingsRepository = new InMemorySettingsRepository();
    settingsRepository.seed({ dayBoundaryTime: "04:00" });
    counterRepository.seed({ completedCount: 0, lastResetExecutedAt: null });
    const clock = new FakeClock(NOW_JST_0359_UTC);

    const result = await maybeRunDailyReset({
      taskRepository,
      counterRepository,
      settingsRepository,
      clock,
    });

    expect(result.executed).toBe(false);
    // appliedBoundaryAt は「サーバ TZ 上の当日 04:00」を返す (= JST 2026-06-08 04:00 の UTC ISO)
    expect(result.appliedBoundaryAt).toBe(BOUNDARY_JST_0400_UTC);
  });

  it("シナリオ: JST 10:00 + 当日 JST 04:05 リセット済み → executed:false (冪等)", async () => {
    // spec.md §G-1 シナリオ「当日 04:00 以降にリセット済みなら no-op」
    const taskRepository = new InMemoryTaskRepository();
    const counterRepository = new InMemoryCounterRepository();
    const settingsRepository = new InMemorySettingsRepository();
    settingsRepository.seed({ dayBoundaryTime: "04:00" });
    counterRepository.seed({
      completedCount: 0,
      lastResetExecutedAt: RESET_JST_0405_UTC, // 当日 JST 04:05 にリセット済み
    });
    const clock = new FakeClock(NOW_JST_1000_UTC);

    const result = await maybeRunDailyReset({
      taskRepository,
      counterRepository,
      settingsRepository,
      clock,
    });

    expect(result.executed).toBe(false);
    expect(result.appliedBoundaryAt).toBe(BOUNDARY_JST_0400_UTC);
  });

  it("シナリオ: JST 10:00 + 前日 JST 04:05 リセット済み → executed:true (今日の境界をまだ超えていないリセット済み状態)", async () => {
    // Given サーバ TZ = JST, nowIso = JST 2026-06-08 10:00
    // And   lastResetExecutedAt = JST 2026-06-07 04:05 ("2026-06-06T19:05:00.000Z")
    //       → 当日境界 (JST 2026-06-08 04:00) より前のリセット済み
    // Then  executed = true
    const taskRepository = new InMemoryTaskRepository();
    const counterRepository = new InMemoryCounterRepository();
    const settingsRepository = new InMemorySettingsRepository();
    settingsRepository.seed({ dayBoundaryTime: "04:00" });
    counterRepository.seed({
      completedCount: 5,
      lastResetExecutedAt: "2026-06-06T19:05:00.000Z", // 前日 JST 04:05
    });
    const clock = new FakeClock(NOW_JST_1000_UTC);

    const result = await maybeRunDailyReset({
      taskRepository,
      counterRepository,
      settingsRepository,
      clock,
    });

    expect(result.executed).toBe(true);
    expect(result.appliedBoundaryAt).toBe(BOUNDARY_JST_0400_UTC);
  });
});

describe("maybeRunDailyReset: サーバ TZ = UTC のとき UTC の壁時計時刻で境界判定する (spec.md G-1)", () => {
  beforeEach(() => {
    vi.stubEnv("TZ", "UTC");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("シナリオ: UTC 04:01 + dayBoundaryTime='04:00' + lastReset=null → executed:true & appliedBoundaryAt = UTC 04:00", async () => {
    // spec.md §G-1 シナリオ「サーバ TZ = UTC, dayBoundaryTime = '04:00', UTC 04:01 にリセット必要」
    const taskRepository = new InMemoryTaskRepository();
    const counterRepository = new InMemoryCounterRepository();
    const settingsRepository = new InMemorySettingsRepository();
    settingsRepository.seed({ dayBoundaryTime: "04:00" });
    counterRepository.seed({ completedCount: 0, lastResetExecutedAt: null });
    const clock = new FakeClock("2026-06-08T04:01:00.000Z");

    const result = await maybeRunDailyReset({
      taskRepository,
      counterRepository,
      settingsRepository,
      clock,
    });

    expect(result.executed).toBe(true);
    expect(result.appliedBoundaryAt).toBe("2026-06-08T04:00:00.000Z");
  });
});
