/**
 * 日次リセットユースケース (BL-010 / FR-043 / FR-051 / NFR-020).
 *
 * 仕様: docs/developer/features/daily-reset/spec.md
 * 設計: docs/developer/features/daily-reset/plan.md
 */
import type { Clock } from "@todica/domain/clock";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type { TaskRepository } from "../data/task-repository.js";
import type { CounterRepository } from "../data/counter-repository.js";
import type { SettingsRepository } from "../data/settings-repository.js";
import { purgeTrash } from "./purge-trash.js";

/**
 * 今日の境界時刻（ISO 8601）を算出する純関数.
 *
 * plan.md D-001: clock.now() の UTC 日付部分を取り出し、dayBoundaryTime を合成した
 * ISO 8601 文字列を返す。タイムゾーン変換は行わない（BL-020 まで据え置き）。
 */
export function calcTodayBoundaryAt(nowIso: string, dayBoundaryTime: string): string {
  const dateStr = nowIso.slice(0, 10); // "YYYY-MM-DD"
  return `${dateStr}T${dayBoundaryTime}:00.000Z`;
}

/**
 * リセットが必要かどうかを判定する純関数.
 *
 * plan.md D-001 リセット判定式:
 *   needsReset = clock.now() >= todayBoundaryAt
 *             && (lastResetExecutedAt === null || lastResetExecutedAt < todayBoundaryAt)
 */
export function needsDailyReset(
  nowIso: string,
  lastResetExecutedAt: string | null,
  todayBoundaryAt: string,
): boolean {
  if (nowIso < todayBoundaryAt) return false; // 境界時刻を超えていない
  if (lastResetExecutedAt === null) return true; // 初回
  return lastResetExecutedAt < todayBoundaryAt; // 今日の境界時刻より前にリセット済み
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
   * 指定された場合はトランザクション内でリセット処理を実行する（本番用）.
   * 未指定の場合は Repository の非同期メソッドを順次呼ぶフォールバック（テスト用）.
   */
  db?: BetterSQLite3Database;
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
  const todayBoundaryAt = calcTodayBoundaryAt(now, settings.dayBoundaryTime);

  const counter = await deps.counterRepository.get();
  const needs = needsDailyReset(now, counter.lastResetExecutedAt, todayBoundaryAt);

  if (!needs) {
    return { executed: false, appliedBoundaryAt: todayBoundaryAt };
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

  // counter.completedCount を 0 にリセットし、lastResetExecutedAt を now にする（FR-051）.
  const updatedCounter = {
    ...counter,
    completedCount: 0,
    lastResetExecutedAt: now,
    updatedAt: now,
    version: counter.version + 1,
  };
  await deps.counterRepository.update(updatedCounter);

  // purgeTrash を呼び出す（plan.md D-002 d / D-005）.
  // db がある場合（本番）は db を渡す。テスト環境では db なしで in-memory repository を使う。
  await purgeTrash(deps.db as BetterSQLite3Database, deps.clock, deps.settingsRepository, deps.taskRepository);

  return { executed: true, appliedBoundaryAt: todayBoundaryAt };
}
