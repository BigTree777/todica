/**
 * 結合テスト: POST /api/v1/reset 経由の purgeTrash のサーバ TZ 解釈 (BL-112).
 *
 * 受け入れ基準の出典:
 *   - docs/developer/features/purge-trash-timezone-fix/spec.md
 *     §「受け入れ基準」 AC-5
 *   - docs/developer/features/purge-trash-timezone-fix/plan.md §「テスト方針」
 *
 * 検証ポイント:
 *   - process.env.TZ = "Asia/Tokyo" の状態で POST /api/v1/reset を送ったとき,
 *     purgeTrash が JST の壁時計境界より前に trashed されたタスクを物理削除する.
 *   - 境界直前 (JST 03:30 = UTC 前日 18:30) は物理削除される (T_pre).
 *   - 境界直後 (JST 04:30 = UTC 前日 19:30) はゴミ箱に残る (T_post).
 *   - HTTP レスポンスの appliedBoundaryAt は reset 境界 (= JST 04:00 の UTC ISO) と一致する.
 *
 * 現状実装:
 *   POST /api/v1/reset が呼ぶ maybeRunDailyReset 内の purgeTrash は
 *   calcTodayBoundaryAt(now, dayBoundaryTime) を引数 2 で呼ぶため
 *   purge 境界が UTC 解釈になる. その結果 appliedBoundaryAt (= JST 04:00 の UTC ISO)
 *   と purge 境界が一致せず, JST 04:30 trashed (= UTC 前日 19:30) のタスクが
 *   誤って削除されてしまう (UTC 当日 04:00 境界より前のため).
 */
import type { FakeClock } from "@todica/domain/clock";
import type { DueDate, Priority, Task, TrashedReason } from "@todica/domain/task";
import type { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authHeaders, buildTestApp } from "../helpers/build-test-app.js";
import type {
  InMemoryCounterRepository,
  InMemorySettingsRepository,
  InMemoryTaskRepository,
} from "../helpers/in-memory-repositories.js";

// JST 2026-06-08 10:00 ↔ UTC "2026-06-08T01:00:00.000Z" (= 評価時刻)
// JST 2026-06-08 04:00 ↔ UTC "2026-06-07T19:00:00.000Z" (= リセット境界)
// JST 2026-06-08 03:30 ↔ UTC "2026-06-07T18:30:00.000Z" (= 境界直前 / purge 対象)
// JST 2026-06-08 04:30 ↔ UTC "2026-06-07T19:30:00.000Z" (= 境界直後 / purge 対象外)
const NOW_JST_1000_UTC = "2026-06-08T01:00:00.000Z";
const BOUNDARY_JST_0400_UTC = "2026-06-07T19:00:00.000Z";
const TRASHED_JST_0330_UTC = "2026-06-07T18:30:00.000Z";
const TRASHED_JST_0430_UTC = "2026-06-07T19:30:00.000Z";

const TASK_ID_PRE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TASK_ID_POST = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

let app: Hono;
let taskRepo: InMemoryTaskRepository;
let counterRepo: InMemoryCounterRepository;
let settingsRepo: InMemorySettingsRepository;
let clock: FakeClock;

/** trashed task の最低限のフィクスチャ. */
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

beforeEach(() => {
  // vi.stubEnv は vi.unstubAllEnvs で元に戻るため savedTz の保存は不要.
  vi.stubEnv("TZ", "Asia/Tokyo");

  const built = buildTestApp({ initialTime: NOW_JST_1000_UTC });
  app = built.app;
  taskRepo = built.taskRepository;
  counterRepo = built.counterRepository;
  settingsRepo = built.settingsRepository;
  clock = built.clock;

  settingsRepo.seed({ dayBoundaryTime: "04:00" });
  counterRepo.seed({ completedCount: 0, lastResetExecutedAt: null });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/v1/reset 経由の purgeTrash (サーバ TZ = JST) (spec.md AC-5)", () => {
  it("シナリオ AC-5: JST 03:30 trashed は物理削除, JST 04:30 trashed は残る, appliedBoundaryAt = JST 04:00 の UTC ISO", async () => {
    // spec.md AC-5
    //   Given process.env.TZ = "Asia/Tokyo"
    //   And   settings.dayBoundaryTime = "04:00"
    //   And   counter.lastResetExecutedAt = null
    //   And   clock.now() = "2026-06-08T01:00:00.000Z"
    //   And   タスク T_pre  が { trashedAt: "2026-06-07T18:30:00.000Z" } でゴミ箱にある
    //   And   タスク T_post が { trashedAt: "2026-06-07T19:30:00.000Z" } でゴミ箱にある
    //   When  POST /api/v1/reset を送る (Idempotency-Key 付き / 認証済み)
    //   Then  HTTP 200 OK が返る
    //   And   body.executed === true
    //   And   body.appliedBoundaryAt === "2026-06-07T19:00:00.000Z"
    //   And   taskRepository.findById(T_pre)  === null
    //   And   taskRepository.findById(T_post) !== null
    taskRepo.seed(makeTrashedTask({ id: TASK_ID_PRE, trashedAt: TRASHED_JST_0330_UTC }));
    taskRepo.seed(makeTrashedTask({ id: TASK_ID_POST, trashedAt: TRASHED_JST_0430_UTC }));

    const res = await app.request("/api/v1/reset", {
      method: "POST",
      headers: authHeaders({ "Idempotency-Key": "reset-purge-tz-jst-1" }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { executed: boolean; appliedBoundaryAt: string };
    expect(body.executed).toBe(true);
    expect(body.appliedBoundaryAt).toBe(BOUNDARY_JST_0400_UTC);

    // T_pre は物理削除されている (purge 境界より前)
    expect(await taskRepo.findById(TASK_ID_PRE)).toBeNull();

    // T_post はゴミ箱に残っている (purge 境界以降)
    const post = await taskRepo.findById(TASK_ID_POST);
    expect(post).not.toBeNull();
    expect(post?.trashedAt).toBe(TRASHED_JST_0430_UTC);
  });

  it("シナリオ AC-5 (GET /api/v1/today 経由): 自動リセットでも同じ TZ 解釈で purge が走る", async () => {
    // AC-5 と同じ前提・期待値を GET /api/v1/today の自動リセット経路で検証する.
    // spec.md §背景「日次リセット (POST /api/v1/reset あるいは GET 経路の自動リセット) を
    //  実行しても, リセット時刻直前 (例: JST 03:30) に削除したゴミ箱タスクが物理削除されずに残る」
    // を HTTP レイヤで担保する.
    //
    // clock は beforeEach 時点で NOW_JST_1000_UTC. counter.lastResetExecutedAt = null
    // により GET /today が自動リセットを発火させる.
    expect(clock.now()).toBe(NOW_JST_1000_UTC);

    taskRepo.seed(makeTrashedTask({ id: TASK_ID_PRE, trashedAt: TRASHED_JST_0330_UTC }));
    taskRepo.seed(makeTrashedTask({ id: TASK_ID_POST, trashedAt: TRASHED_JST_0430_UTC }));

    const res = await app.request("/api/v1/today", {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);

    // T_pre は物理削除されている
    expect(await taskRepo.findById(TASK_ID_PRE)).toBeNull();

    // T_post はゴミ箱に残っている
    const post = await taskRepo.findById(TASK_ID_POST);
    expect(post).not.toBeNull();
    expect(post?.trashedAt).toBe(TRASHED_JST_0430_UTC);
  });
});
