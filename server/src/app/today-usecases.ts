/**
 * 今日ビューのユースケース (BL-005 / FR-010 / FR-011 / NFR-013).
 *
 * plan.md §処理フロー / D-5:
 *   1. runDailyResetIfNeeded で自動リセット (境界時刻超過時).
 *   2. taskRepository.list({ trashed: "false" }) で active タスクを取得.
 *   3. filterToday → sortToday → pickNextTaskId (server/src/today.ts 純関数).
 *   4. focus / counter を取得し, ビュー DTO を返す.
 */
import type { Task } from "@todica/domain/task";
import type { AppDeps } from "../app.js";
import { filterToday, pickNextTaskId, sortToday } from "../today.js";
import { runDailyResetIfNeeded } from "./reset-usecases.js";

export interface TodayView {
  tasks: Task[];
  nextTaskId: string | null;
  currentTaskId: string | null;
  completionCount: number;
}

/** 今日ビューを組み立てて返す. */
export async function getTodayView(deps: AppDeps): Promise<TodayView> {
  await runDailyResetIfNeeded(deps);
  const active = await deps.taskRepository.list({ trashed: "false" });
  const todayTasks = sortToday(filterToday(active));
  const nextTaskId = pickNextTaskId(todayTasks);
  const focus = await deps.focusRepository.get();
  const counter = await deps.counterRepository.get();
  return {
    tasks: todayTasks,
    nextTaskId,
    currentTaskId: focus.currentTaskId,
    completionCount: counter.completedCount,
  };
}
