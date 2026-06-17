/**
 * 単体テスト: purgeTrash のサーバ TZ 経路 (BL-112).
 *
 * 受け入れ基準の出典:
 *   - docs/developer/features/purge-trash-timezone-fix/spec.md
 *     §「受け入れ基準」 AC-1 / AC-2 / AC-3 / AC-4
 *   - docs/developer/features/purge-trash-timezone-fix/plan.md §「テスト方針」
 *
 * 対象モジュール: server/src/use-cases/purge-trash.ts
 *
 * 検証ポイント:
 *   - サーバ TZ = "Asia/Tokyo" の状態で maybeRunDailyReset 経由で purgeTrash が走ったとき,
 *     JST の壁時計時刻に基づく境界で「境界より前に trashed」されたタスクが物理削除される.
 *   - JST 03:30 trashed (= UTC 18:30 前日) のタスクは purge 対象 (削除される).
 *   - JST 04:30 trashed (= UTC 19:30 前日) のタスクは purge 対象外 (残る).
 *   - 回帰ガード: purge 境界 (purge-trash 内部で計算) は maybeRunDailyReset の
 *     appliedBoundaryAt と一致する.
 *   - サーバ TZ = "UTC" の従来挙動が破壊されない.
 *
 * 現状実装:
 *   purgeTrash は calcTodayBoundaryAt(clock.now(), settings.dayBoundaryTime) を引数 2 で呼ぶ
 *   (timeZone = "UTC" 既定). サーバ TZ = "Asia/Tokyo" のとき purge 境界は UTC 当日 04:00 と
 *   なり, JST 03:30 (= 前日 18:30 UTC) で trashed したタスクは
 *   「trashed_at < UTC 当日 04:00」を満たすため削除されるが,
 *   JST 03:30 のシナリオ (clock.now() = JST 10:00 = UTC 当日 01:00) では
 *   purge 境界が UTC 当日 04:00 となり, JST 03:30 trashed (= UTC 前日 18:30) は
 *   削除される — ただし maybeRunDailyReset の appliedBoundaryAt
 *   (UTC 前日 19:00) と purge 境界が一致しないため AC-3 (境界一致) は失敗する.
 *   また AC-2 (JST 04:30 trashed = UTC 前日 19:30 → 残る) も,
 *   現状 purge 境界が UTC 当日 04:00 = UTC 当日 04:00 のため,
 *   UTC 前日 19:30 < UTC 当日 04:00 となり誤って削除される.
 */
import { FakeClock } from "@todica/domain/clock";
import type { DueDate, Priority, Task, TrashedReason } from "@todica/domain/task";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { calcTodayBoundaryAt, maybeRunDailyReset } from "../../src/use-cases/daily-reset.js";
import {
  InMemoryCounterRepository,
  InMemorySettingsRepository,
  InMemoryTaskRepository,
} from "../helpers/in-memory-repositories.js";

// JST = UTC+9 (DST 非考慮).
// 各時刻の対応 (spec.md §「受け入れ基準」凡例と一致):
//   JST 2026-06-08 04:00 ↔ UTC "2026-06-07T19:00:00.000Z" (= リセット境界)
//   JST 2026-06-08 03:30 ↔ UTC "2026-06-07T18:30:00.000Z" (= 境界直前 / purge 対象)
//   JST 2026-06-08 04:30 ↔ UTC "2026-06-07T19:30:00.000Z" (= 境界直後 / purge 対象外)
//   JST 2026-06-08 10:00 ↔ UTC "2026-06-08T01:00:00.000Z" (= 評価時刻)
const NOW_JST_1000_UTC = "2026-06-08T01:00:00.000Z";
const BOUNDARY_JST_0400_UTC = "2026-06-07T19:00:00.000Z";
const TRASHED_JST_0330_UTC = "2026-06-07T18:30:00.000Z";
const TRASHED_JST_0430_UTC = "2026-06-07T19:30:00.000Z";

const TASK_ID_PRE = "11111111-1111-4111-8111-111111111111";
const TASK_ID_POST = "22222222-2222-4222-8222-222222222222";
const TASK_ID_UTC_OLD = "33333333-3333-4333-8333-333333333333";
const TASK_ID_UTC_NEW = "44444444-4444-4444-8444-444444444444";

/** Task のテストフィクスチャ. trashed-task の最低限を作る. */
function makeTrashedTask(overrides: Partial<Task> & { id: string; trashedAt: string }): Task {
  const base: Task = {
    id: overrides.id,
    name: "trashed-task",
    projectId: null,
    dueDate: "today" as DueDate,
    priority: "normal" as Priority,
    origin: "manual",
    routineId: null,
    createdAt: overrides.trashedAt,
    updatedAt: overrides.trashedAt,
    trashedAt: overrides.trashedAt,
    trashedReason: "deleted" as TrashedReason,
    version: 2,
  };
  return { ...base, ...overrides };
}

describe("purgeTrash: サーバ TZ = JST のとき JST の壁時計境界より前のゴミ箱タスクが物理削除される (spec.md AC-1 / AC-2 / AC-3)", () => {
  beforeEach(() => {
    // vi.stubEnv は vi.unstubAllEnvs で元に戻るため savedTz の保存は不要.
    vi.stubEnv("TZ", "Asia/Tokyo");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("シナリオ AC-1: JST 03:30 (= UTC 前日 18:30) trashed のタスクは purge 対象 → 物理削除される", async () => {
    // spec.md AC-1
    //   Given process.env.TZ = "Asia/Tokyo"
    //   And   settings.dayBoundaryTime = "04:00"
    //   And   counter.lastResetExecutedAt = null
    //   And   clock.now() = "2026-06-08T01:00:00.000Z" (= JST 2026-06-08 10:00)
    //   And   タスク T1 が { trashedAt: "2026-06-07T18:30:00.000Z" } (= JST 03:30) でゴミ箱にある
    //   When  maybeRunDailyReset が実行される
    //   Then  result.executed === true
    //   And   result.appliedBoundaryAt === "2026-06-07T19:00:00.000Z"
    //   And   taskRepository.findById(T1) === null (= 物理削除されている)
    const taskRepository = new InMemoryTaskRepository();
    const counterRepository = new InMemoryCounterRepository();
    const settingsRepository = new InMemorySettingsRepository();
    settingsRepository.seed({ dayBoundaryTime: "04:00" });
    counterRepository.seed({ completedCount: 0, lastResetExecutedAt: null });
    taskRepository.seed(
      makeTrashedTask({
        id: TASK_ID_PRE,
        trashedAt: TRASHED_JST_0330_UTC,
      }),
    );
    const clock = new FakeClock(NOW_JST_1000_UTC);

    const result = await maybeRunDailyReset({
      taskRepository,
      counterRepository,
      settingsRepository,
      clock,
    });

    expect(result.executed).toBe(true);
    expect(result.appliedBoundaryAt).toBe(BOUNDARY_JST_0400_UTC);

    // T1 は物理削除されている
    expect(await taskRepository.findById(TASK_ID_PRE)).toBeNull();
  });

  it("シナリオ AC-2: JST 04:30 (= UTC 前日 19:30) trashed のタスクは purge 対象外 → ゴミ箱に残る", async () => {
    // spec.md AC-2
    //   Given process.env.TZ = "Asia/Tokyo"
    //   And   settings.dayBoundaryTime = "04:00"
    //   And   counter.lastResetExecutedAt = null
    //   And   clock.now() = "2026-06-08T01:00:00.000Z" (= JST 2026-06-08 10:00)
    //   And   タスク T2 が { trashedAt: "2026-06-07T19:30:00.000Z" } (= JST 04:30) でゴミ箱にある
    //   When  maybeRunDailyReset が実行される
    //   Then  result.executed === true
    //   And   taskRepository.findById(T2) !== null
    //   And   T2.trashedAt === "2026-06-07T19:30:00.000Z"
    const taskRepository = new InMemoryTaskRepository();
    const counterRepository = new InMemoryCounterRepository();
    const settingsRepository = new InMemorySettingsRepository();
    settingsRepository.seed({ dayBoundaryTime: "04:00" });
    counterRepository.seed({ completedCount: 0, lastResetExecutedAt: null });
    taskRepository.seed(
      makeTrashedTask({
        id: TASK_ID_POST,
        trashedAt: TRASHED_JST_0430_UTC,
      }),
    );
    const clock = new FakeClock(NOW_JST_1000_UTC);

    const result = await maybeRunDailyReset({
      taskRepository,
      counterRepository,
      settingsRepository,
      clock,
    });

    expect(result.executed).toBe(true);

    // T2 はゴミ箱に残っている
    const stored = await taskRepository.findById(TASK_ID_POST);
    expect(stored).not.toBeNull();
    expect(stored?.trashedAt).toBe(TRASHED_JST_0430_UTC);
  });

  it("シナリオ AC-1 + AC-2 同居: JST 03:30 trashed は削除され, JST 04:30 trashed は残る", async () => {
    // spec.md AC-1 / AC-2 を 1 シナリオで束ねたケース.
    // purge 境界の評価が「境界より前: 削除」「境界以降: 残す」の対称性を満たすことを確認する.
    const taskRepository = new InMemoryTaskRepository();
    const counterRepository = new InMemoryCounterRepository();
    const settingsRepository = new InMemorySettingsRepository();
    settingsRepository.seed({ dayBoundaryTime: "04:00" });
    counterRepository.seed({ completedCount: 0, lastResetExecutedAt: null });
    taskRepository.seed(makeTrashedTask({ id: TASK_ID_PRE, trashedAt: TRASHED_JST_0330_UTC }));
    taskRepository.seed(makeTrashedTask({ id: TASK_ID_POST, trashedAt: TRASHED_JST_0430_UTC }));
    const clock = new FakeClock(NOW_JST_1000_UTC);

    const result = await maybeRunDailyReset({
      taskRepository,
      counterRepository,
      settingsRepository,
      clock,
    });

    expect(result.executed).toBe(true);
    expect(result.appliedBoundaryAt).toBe(BOUNDARY_JST_0400_UTC);

    expect(await taskRepository.findById(TASK_ID_PRE)).toBeNull();
    const stored = await taskRepository.findById(TASK_ID_POST);
    expect(stored).not.toBeNull();
    expect(stored?.trashedAt).toBe(TRASHED_JST_0430_UTC);
  });

  it("シナリオ AC-3: purge 境界 === reset 境界 (回帰ガード)", async () => {
    // spec.md AC-3
    //   Given process.env.TZ = "Asia/Tokyo"
    //   And   settings.dayBoundaryTime = "04:00"
    //   And   clock.now() = "2026-06-08T01:00:00.000Z"
    //   When  calcTodayBoundaryAt(now, "04:00", "Asia/Tokyo") を評価する
    //   Then  返り値 === "2026-06-07T19:00:00.000Z"
    //   And   この値は maybeRunDailyReset の result.appliedBoundaryAt と一致する
    //   And   この値は purgeTrash 内部で taskRepository.deleteTrashOlderThan に渡される
    //         boundaryAt と一致する
    //
    // 「purgeTrash 内部で渡される boundaryAt」は直接観測できないため,
    // 「reset 境界より前に trashed (= 前日 18:59:59) は削除され,
    //  reset 境界ちょうど (= 前日 19:00:00) は残る」という挙動で間接的に検証する.
    // これにより purge 境界が reset 境界 "2026-06-07T19:00:00.000Z" と一致することが
    // assert される (deleteTrashOlderThan は `trashed_at < boundaryAt` で評価する).
    const taskRepository = new InMemoryTaskRepository();
    const counterRepository = new InMemoryCounterRepository();
    const settingsRepository = new InMemorySettingsRepository();
    settingsRepository.seed({ dayBoundaryTime: "04:00" });
    counterRepository.seed({ completedCount: 0, lastResetExecutedAt: null });

    const justBeforeBoundary = "2026-06-07T18:59:59.999Z"; // reset 境界より 1ms 前
    const exactlyAtBoundary = BOUNDARY_JST_0400_UTC; // reset 境界ちょうど
    taskRepository.seed(makeTrashedTask({ id: TASK_ID_PRE, trashedAt: justBeforeBoundary }));
    taskRepository.seed(makeTrashedTask({ id: TASK_ID_POST, trashedAt: exactlyAtBoundary }));

    const clock = new FakeClock(NOW_JST_1000_UTC);

    // 1) calcTodayBoundaryAt の純関数評価が期待値を返すこと
    const computedBoundary = calcTodayBoundaryAt(clock.now(), "04:00", "Asia/Tokyo");
    expect(computedBoundary).toBe(BOUNDARY_JST_0400_UTC);

    const result = await maybeRunDailyReset({
      taskRepository,
      counterRepository,
      settingsRepository,
      clock,
    });

    // 2) maybeRunDailyReset の appliedBoundaryAt と一致
    expect(result.appliedBoundaryAt).toBe(BOUNDARY_JST_0400_UTC);

    // 3) purge 側の境界と一致することの間接確認:
    //    境界より前 (1ms 前) は削除され, 境界ちょうどは残る.
    expect(await taskRepository.findById(TASK_ID_PRE)).toBeNull();
    const onBoundary = await taskRepository.findById(TASK_ID_POST);
    expect(onBoundary).not.toBeNull();
    expect(onBoundary?.trashedAt).toBe(exactlyAtBoundary);
  });
});

describe("purgeTrash: サーバ TZ = UTC のとき従来挙動が保たれる (spec.md AC-4)", () => {
  beforeEach(() => {
    vi.stubEnv("TZ", "UTC");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("シナリオ AC-4: UTC TZ + dayBoundaryTime=04:00 で T_old (UTC 前日 10:00) は削除, T_new (UTC 当日 05:00) は残る", async () => {
    // spec.md AC-4
    //   Given process.env.TZ = "UTC"
    //   And   settings.dayBoundaryTime = "04:00"
    //   And   clock.now() = "2026-06-08T10:00:00.000Z"
    //   And   タスク T_old が { trashedAt: "2026-06-07T10:00:00.000Z" } でゴミ箱にある
    //         (= UTC 当日 04:00 より前)
    //   And   タスク T_new が { trashedAt: "2026-06-08T05:00:00.000Z" } でゴミ箱にある
    //         (= UTC 当日 04:00 以降)
    //   When  maybeRunDailyReset が実行される
    //   Then  taskRepository.findById(T_old) === null
    //   And   taskRepository.findById(T_new) !== null
    const taskRepository = new InMemoryTaskRepository();
    const counterRepository = new InMemoryCounterRepository();
    const settingsRepository = new InMemorySettingsRepository();
    settingsRepository.seed({ dayBoundaryTime: "04:00" });
    counterRepository.seed({ completedCount: 0, lastResetExecutedAt: null });
    taskRepository.seed(
      makeTrashedTask({
        id: TASK_ID_UTC_OLD,
        trashedAt: "2026-06-07T10:00:00.000Z",
      }),
    );
    taskRepository.seed(
      makeTrashedTask({
        id: TASK_ID_UTC_NEW,
        trashedAt: "2026-06-08T05:00:00.000Z",
      }),
    );
    const clock = new FakeClock("2026-06-08T10:00:00.000Z");

    const result = await maybeRunDailyReset({
      taskRepository,
      counterRepository,
      settingsRepository,
      clock,
    });

    expect(result.executed).toBe(true);
    expect(result.appliedBoundaryAt).toBe("2026-06-08T04:00:00.000Z");

    expect(await taskRepository.findById(TASK_ID_UTC_OLD)).toBeNull();
    const tNew = await taskRepository.findById(TASK_ID_UTC_NEW);
    expect(tNew).not.toBeNull();
    expect(tNew?.trashedAt).toBe("2026-06-08T05:00:00.000Z");
  });
});
