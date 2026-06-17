import { Hono } from "hono";
import { runDailyResetIfNeeded } from "../app/reset-usecases.js";
import type { AppDeps } from "../app.js";
import { saveAndReturn } from "./_shared.js";

export function resetRouter(deps: AppDeps): Hono {
  const router = new Hono();
  // ---------- POST /api/v1/reset (BL-010 / FR-043 / FR-051 / NFR-020) ----------
  // spec.md §「POST /api/v1/reset」:
  //   - 認証必須 (middleware 済み)
  //   - Idempotency-Key 必須 (middleware 済み)
  //   - リセット要否を判定・実行する
  //   - 200 OK { executed, appliedBoundaryAt }
  router.post("/", async (c) => {
    const result = await runDailyResetIfNeeded(deps);
    return saveAndReturn(c, deps, 200, result);
  });

  return router;
}
