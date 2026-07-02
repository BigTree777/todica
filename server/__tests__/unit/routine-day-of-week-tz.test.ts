/**
 * 単体テスト: 日次リセットのルーティン生成曜日をサーバ TZ の壁時計日付で判定する.
 *
 * 受け入れ基準の出典:
 *   docs/developer/features/routine-day-of-week-tz/spec.md §「受け入れ基準」
 *   （AC-5 / AC-6）
 *
 * 対象モジュール: server/src/use-cases/daily-reset.ts の maybeRunDailyReset / runDailyResetWrites
 *
 * 期待仕様（FR-C）:
 *   runDailyResetWrites は境界判定と同一の TZ（getServerTimeZone() = process.env.TZ）を
 *   calcDayOfWeek に渡し, その曜日で routineRepository.findByDayOfWeek を引く.
 *   これにより「アプリ上の今日」の曜日のルーティンが生成される.
 *
 * シナリオ共通条件:
 *   サーバ TZ = "Asia/Tokyo", dayBoundaryTime = "04:00",
 *   clock.now() = "2026-07-02T19:00:00.000Z"（JST で金曜 2026-07-03 04:00）,
 *   counter.lastResetExecutedAt = null（未リセット）.
 *   金(5)に紐づく R5 と 木(4)に紐づく R4 を用意する.
 *
 * 曜日: 0=日, 1=月, 2=火, 3=水, 4=木, 5=金, 6=土.
 */
import { FakeClock } from "@todica/domain/clock";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { maybeRunDailyReset } from "../../src/use-cases/daily-reset.js";
import {
  InMemoryCounterRepository,
  InMemoryRoutineRepository,
  InMemorySettingsRepository,
  InMemoryTaskRepository,
} from "../helpers/in-memory-repositories.js";

// JST で金曜 2026-07-03 04:00:00（当日境界）に一致する UTC 瞬間.
// UTC としては木曜 2026-07-02 19:00:00 であり, 曜日ズレ条件（東経オフセット × 早朝境界）に該当する.
const NOW_JST_FRI_0400_UTC = "2026-07-02T19:00:00.000Z";

const ROUTINE_ID_FRIDAY = "55555555-5555-4555-8555-555555555555"; // R5（金）
const ROUTINE_ID_THURSDAY = "44444444-4444-4444-8444-444444444444"; // R4（木）

let taskRepo: InMemoryTaskRepository;
let counterRepo: InMemoryCounterRepository;
let settingsRepo: InMemorySettingsRepository;
let routineRepo: InMemoryRoutineRepository;

beforeEach(() => {
  vi.stubEnv("TZ", "Asia/Tokyo");

  taskRepo = new InMemoryTaskRepository();
  counterRepo = new InMemoryCounterRepository();
  settingsRepo = new InMemorySettingsRepository();
  routineRepo = new InMemoryRoutineRepository();

  settingsRepo.seed({ dayBoundaryTime: "04:00" });
  counterRepo.seed({ completedCount: 0, lastResetExecutedAt: null });

  // R5: 金曜(5) のルーティン
  routineRepo.seed({
    id: ROUTINE_ID_FRIDAY,
    name: "金曜ルーティン",
    daysOfWeek: [5],
    defaultPriority: "normal",
    version: 1,
    createdAt: NOW_JST_FRI_0400_UTC,
    updatedAt: NOW_JST_FRI_0400_UTC,
  });
  // R4: 木曜(4) のルーティン
  routineRepo.seed({
    id: ROUTINE_ID_THURSDAY,
    name: "木曜ルーティン",
    daysOfWeek: [4],
    defaultPriority: "normal",
    version: 1,
    createdAt: NOW_JST_FRI_0400_UTC,
    updatedAt: NOW_JST_FRI_0400_UTC,
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("maybeRunDailyReset: JST 早朝境界発火で当日（金）の曜日のルーティンを生成する (spec.md AC-5/AC-6)", () => {
  it("(AC-5) executed=true で 金(5) の R5 は生成され, 木(4) の R4 は生成されない", async () => {
    // When  maybeRunDailyReset を実行する
    const clock = new FakeClock(NOW_JST_FRI_0400_UTC);
    const result = await maybeRunDailyReset({
      taskRepository: taskRepo,
      counterRepository: counterRepo,
      settingsRepository: settingsRepo,
      clock,
      routineRepository: routineRepo,
    });

    // Then  リセットが実行される
    expect(result.executed).toBe(true);

    const tasks = taskRepo.all();

    // And 金(5) の R5 から今日のルーティンタスクが生成される
    const fridayTasks = tasks.filter(
      (t) => t.origin === "routine" && t.routineId === ROUTINE_ID_FRIDAY,
    );
    expect(fridayTasks).toHaveLength(1);
    expect(fridayTasks[0]?.dueDate).toBe("today");

    // And 木(4) の R4 からはルーティンタスクが生成されない
    const thursdayTasks = tasks.filter(
      (t) => t.origin === "routine" && t.routineId === ROUTINE_ID_THURSDAY,
    );
    expect(thursdayTasks).toHaveLength(0);
  });

  it("(AC-6) findByDayOfWeek は 5（金）で呼ばれ, 4（木）では呼ばれない", async () => {
    // findByDayOfWeek に渡された曜日を記録する.
    const spy = vi.spyOn(routineRepo, "findByDayOfWeek");

    const clock = new FakeClock(NOW_JST_FRI_0400_UTC);
    await maybeRunDailyReset({
      taskRepository: taskRepo,
      counterRepository: counterRepo,
      settingsRepository: settingsRepo,
      clock,
      routineRepository: routineRepo,
    });

    const calledDays = spy.mock.calls.map((call) => call[0]);
    // Then  5（金）で呼び出される
    expect(calledDays).toContain(5);
    // And   4（木）では呼び出されない
    expect(calledDays).not.toContain(4);
  });
});
