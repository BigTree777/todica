import { Hono } from "hono";
import { getTodayView } from "../app/today-usecases.js";
import type { AppDeps } from "../app.js";

export function todayRouter(deps: AppDeps): Hono {
  const router = new Hono();
  // ---------- GET /api/v1/today (BL-005 / FR-010 / FR-011 / NFR-013) ----------
  // 並び順を変えるカスタマイズは存在しない (NFR-001 / spec.md). クエリパラメータは取らない.
  router.get("/", async (c) => {
    const view = await getTodayView(deps);
    return c.json(view, 200);
  });

  return router;
}
