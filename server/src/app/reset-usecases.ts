/**
 * 日次リセットのユースケース (BL-010 / FR-043 / FR-051 / NFR-020).
 *
 * spec.md D-U1 / plan.md D-4: 既存 server/src/use-cases/daily-reset.ts の
 * maybeRunDailyReset を呼ぶ薄いラッパとする. reset ルータと today ユースケースが共用する.
 */
import type { AppDeps } from "../app.js";
import { type DailyResetResult, maybeRunDailyReset } from "../use-cases/daily-reset.js";

export type { DailyResetResult };

/**
 * リセット要否を判定し, 必要なら実行する.
 * 結果 { executed, appliedBoundaryAt } を返す.
 */
export async function runDailyResetIfNeeded(deps: AppDeps): Promise<DailyResetResult> {
  return maybeRunDailyReset({
    taskRepository: deps.taskRepository,
    counterRepository: deps.counterRepository,
    settingsRepository: deps.settingsRepository,
    clock: deps.clock,
    db: deps.db,
    routineRepository: deps.routineRepository,
  });
}
