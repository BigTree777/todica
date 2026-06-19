/**
 * 日次リセットユースケース (BL-010 / FR-043 / FR-051 / NFR-020).
 *
 * 仕様: docs/developer/features/daily-reset/spec.md
 * 設計: docs/developer/features/daily-reset/plan.md
 */
import type { Clock } from "@todica/domain/clock";
import { resetCompletedCount } from "@todica/domain/counter";
import { calcTodayBoundaryAt, needsDailyReset } from "@todica/domain/settings";
import { sql } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type { CounterRepository } from "../data/counter-repository.js";
import type { RoutineRepository } from "../data/routine-repository.js";
import type { SettingsRepository } from "../data/settings-repository.js";
import type { TaskRepository } from "../data/task-repository.js";
import type { schema } from "../db/schema.js";
import { purgeTrash } from "./purge-trash.js";

/**
 * 既存呼び出し側 (server/__tests__/unit/daily-reset.test.ts 等) の import 経路を維持するため
 * domain/settings から re-export する.
 */
export { calcTodayBoundaryAt, needsDailyReset } from "@todica/domain/settings";

/**
 * サーバプロセスのタイムゾーン (IANA) を返す.
 * process.env.TZ を参照する I/O のため domain 層には置けず, server 側に残す
 * (module-boundaries.md §2 ドメイン層は I/O を持たない原則).
 */
export function getServerTimeZone(): string {
  return process.env.TZ ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export interface DailyResetResult {
  executed: boolean;
  appliedBoundaryAt: string;
}

export interface DailyResetDeps {
  taskRepository: TaskRepository;
  counterRepository: CounterRepository;
  settingsRepository: SettingsRepository;
  clock: Clock;
  /**
   * plan.md D-004: トランザクション実行のための Drizzle DB インスタンス（オプショナル）.
   * 指定された場合は BEGIN / COMMIT / ROLLBACK でリセット書き込み処理を実行する（本番用）.
   * 未指定の場合は Repository の非同期メソッドを順次呼ぶフォールバック（テスト用）.
   */
  db?: BetterSQLite3Database<typeof schema>;
  /**
   * BL-017: RoutineRepository（オプショナル）.
   * 注入された場合、日次リセット時にルーティンタスクの削除と生成を行う.
   * 未注入の場合は既存の動作のみ実行する（後方互換）.
   */
  routineRepository?: RoutineRepository;
}

/**
 * 現在時刻の ISO 文字列から曜日（UTC）を取得する純関数.
 *
 * plan.md D-004: UTC 日付の曜日を返す（0=日, 1=月, ..., 6=土）.
 */
export function calcDayOfWeek(nowIso: string): number {
  const dateStr = nowIso.slice(0, 10);
  return new Date(`${dateStr}T00:00:00.000Z`).getUTCDay();
}

async function runDailyResetWrites(
  deps: DailyResetDeps,
  now: string,
  counter: Awaited<ReturnType<CounterRepository["get"]>>,
): Promise<void> {
  // [新規 BL-017] FR-033: 前日ルーティンタスク削除
  // origin="routine" かつ dueDate="today" かつ trashedAt=null のタスクを物理削除する.
  if (deps.routineRepository) {
    await deps.taskRepository.deleteRoutineTasksForToday();
  }

  // dueDate === "tomorrow" かつ trashedAt === null のタスクを "today" に更新する（FR-043）.
  const allTasks = await deps.taskRepository.list({ trashed: "all" });
  for (const task of allTasks) {
    if (task.dueDate === "tomorrow" && task.trashedAt === null) {
      await deps.taskRepository.update({
        ...task,
        dueDate: "today",
        updatedAt: now,
        version: task.version + 1,
      });
    }
  }

  // [新規 BL-017] FR-031: 当日分ルーティンタスク生成
  if (deps.routineRepository) {
    const dayOfWeek = calcDayOfWeek(now);
    const routines = await deps.routineRepository.findByDayOfWeek(dayOfWeek);
    for (const routine of routines) {
      const existing = await deps.taskRepository.findTodayRoutineTask(routine.id);
      if (!existing) {
        const id = crypto.randomUUID();
        await deps.taskRepository.createRoutineTask({
          id,
          routineId: routine.id,
          name: routine.name,
          priority: routine.defaultPriority,
          now,
        });
      }
    }
  }

  // counter.completedCount を 0 にリセットし、lastResetExecutedAt を now にする（FR-051）.
  const updatedCounter = resetCompletedCount(counter, now, now);
  await deps.counterRepository.update(updatedCounter);

  // purgeTrash を呼び出す（plan.md D-002 d / D-005）.
  // 境界時刻より古いゴミ箱タスクを物理削除する（通常タスク・完了済みルーティンタスクを含む）.
  await purgeTrash(
    deps.db as BetterSQLite3Database<typeof schema>,
    deps.clock,
    deps.settingsRepository,
    deps.taskRepository,
  );
}

/**
 * リセット要否を判定し、必要なら実行する.
 *
 * - リセット条件を満たさない場合は { executed: false, appliedBoundaryAt } を返す.
 * - リセット条件を満たす場合:
 *   1. dueDate === "tomorrow" かつ trashedAt === null のタスクを "today" に更新する（FR-043）.
 *   2. counter.completedCount を 0 にリセットし、lastResetExecutedAt を now にする（FR-051）.
 *   3. { executed: true, appliedBoundaryAt } を返す.
 */
export async function maybeRunDailyReset(deps: DailyResetDeps): Promise<DailyResetResult> {
  const now = deps.clock.now();
  const settings = await deps.settingsRepository.get();
  const todayBoundaryAt = calcTodayBoundaryAt(now, settings.dayBoundaryTime, getServerTimeZone());

  const counter = await deps.counterRepository.get();
  const needs = needsDailyReset(now, counter.lastResetExecutedAt, todayBoundaryAt);

  if (!needs) {
    return { executed: false, appliedBoundaryAt: todayBoundaryAt };
  }

  if (!deps.db) {
    await runDailyResetWrites(deps, now, counter);
    return { executed: true, appliedBoundaryAt: todayBoundaryAt };
  }

  deps.db.run(sql`BEGIN`);
  try {
    await runDailyResetWrites(deps, now, counter);
    deps.db.run(sql`COMMIT`);
  } catch (error) {
    deps.db.run(sql`ROLLBACK`);
    throw error;
  }

  return { executed: true, appliedBoundaryAt: todayBoundaryAt };
}
