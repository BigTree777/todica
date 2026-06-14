import { Hono } from "hono";
import type { AppDeps } from "../app.js";
import { maybeRunDailyReset } from "../use-cases/daily-reset.js";
import { saveAndReturn } from "./_shared.js";

export function resetRouter(deps: AppDeps): Hono {
  const router = new Hono();
  // ---------- POST /api/v1/reset (BL-010 / FR-043 / FR-051 / NFR-020) ----------
  // spec.md §「POST /api/v1/reset」:
  //   - 認証必須 (middleware 済み)
  //   - Idempotency-Key 必須 (middleware 済み)
  //   - maybeRunDailyReset を呼んでリセット要否を判定・実行する
  //   - 200 OK { executed, appliedBoundaryAt }
  router.post("/", async (c) => {
    const result = await maybeRunDailyReset({
      taskRepository: deps.taskRepository,
      counterRepository: deps.counterRepository,
      settingsRepository: deps.settingsRepository,
      clock: deps.clock,
      db: deps.db,
      routineRepository: deps.routineRepository,
    });
    return saveAndReturn(c, deps, 200, result);
  });

  return router;
}
