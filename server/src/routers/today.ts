import { Hono } from "hono";
import type { AppDeps } from "../app.js";
import { filterToday, pickNextTaskId, sortToday } from "../today.js";
import { maybeRunDailyReset } from "../use-cases/daily-reset.js";

export function todayRouter(deps: AppDeps): Hono {
  const router = new Hono();
  // ---------- GET /api/v1/today (BL-005 / FR-010 / FR-011 / NFR-013) ----------
  // plan.md §処理フロー / D-001 / D-005:
  //   1. BL-010 自動リセット: maybeRunDailyReset を先頭で呼び出す (plan.md D-003 / U-003).
  //   2. task-repository.list({ trashed: "false" }) で全 active タスクを取得.
  //   3. filterToday: dueDate === "today" のみに絞る.
  //   4. sortToday:   priority → createdAt → id の 3 段で安定ソート.
  //   5. nextTaskId = tasks[0]?.id ?? null.
  //   6. 200 OK { tasks, nextTaskId }.
  // クエリパラメータは存在しない (NFR-001 / spec.md §「並び順を変えるカスタマイズが存在しないこと」).
  router.get("/", async (c) => {
    // BL-010 / FR-043 / FR-051: 自動リセット（境界時刻を超えていればリセット実行）.
    await maybeRunDailyReset({
      taskRepository: deps.taskRepository,
      counterRepository: deps.counterRepository,
      settingsRepository: deps.settingsRepository,
      clock: deps.clock,
      db: deps.db,
      routineRepository: deps.routineRepository,
    });
    const active = await deps.taskRepository.list({ trashed: "false" });
    const todayTasks = sortToday(filterToday(active));
    const nextTaskId = pickNextTaskId(todayTasks);
    // BL-006 / FR-012: FocusSelection.currentTaskId をミラーしてクライアントに返す.
    const focus = await deps.focusRepository.get();
    // BL-008 / FR-040 (plan.md D-006): Counter.completedCount を /today に同梱する.
    const counter = await deps.counterRepository.get();
    return c.json(
      {
        tasks: todayTasks,
        nextTaskId,
        currentTaskId: focus.currentTaskId,
        completionCount: counter.completedCount,
      },
      200,
    );
  });

  return router;
}
