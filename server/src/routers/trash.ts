import { Hono } from "hono";
import { listTrash, purgeTrash, restore } from "../app/trash-usecases.js";
import type { AppDeps } from "../app.js";
import { saveAndReturn } from "./_shared.js";

export function trashRouter(deps: AppDeps): Hono {
  const router = new Hono();
  // ---------- GET /api/v1/trash (BL-011 / BL-119 / FR-062 ゴミ箱閲覧) ----------
  // ゴミ箱にある Task / Project / Routine を { tasks, projects, routines } で返す (D-2).
  // 認証必須 (middleware 済み) / 読取専用 (If-Match / Idempotency-Key 不要).
  router.get("/", async (c) => {
    const { tasks, projects, routines } = await listTrash(deps);
    return c.json({ tasks, projects, routines }, 200);
  });

  // ---------- POST /api/v1/trash/:id/restore (BL-011 / BL-119 / BL-120 / FR-061 復元) ----------
  // Task / Project / Routine を id から判別して復元する (D-3). Task は dueDate を 'today' にリセット.
  // 認証必須 / Idempotency-Key 必須 / If-Match で楽観ロック.
  router.post("/:id/restore", async (c) => {
    const id = c.req.param("id");

    // If-Match 検証.
    const ifMatchHeader = c.req.header("If-Match") ?? c.req.header("if-match");
    if (!ifMatchHeader) {
      return saveAndReturn(c, deps, 400, {
        code: "MISSING_IF_MATCH",
        message: "If-Match header is required",
      });
    }
    const ifMatch = Number.parseInt(ifMatchHeader, 10);
    if (!Number.isFinite(ifMatch)) {
      return saveAndReturn(c, deps, 400, {
        code: "MISSING_IF_MATCH",
        message: "If-Match header must be a numeric version",
      });
    }

    const result = await restore(deps, { id, ifMatch });
    switch (result.kind) {
      case "notFound":
        return saveAndReturn(c, deps, 404, { code: result.code, message: result.message });
      case "invalid":
        return saveAndReturn(c, deps, 400, { code: result.code, message: result.message });
      case "conflict":
        // Task 復元時は { task }, Project 復元時は { project }, Routine 復元時は { routine } を返す (oneOf).
        switch (result.current.entity) {
          case "task":
            return saveAndReturn(c, deps, 412, { task: result.current.task });
          case "project":
            return saveAndReturn(c, deps, 412, { project: result.current.project });
          default:
            return saveAndReturn(c, deps, 412, { routine: result.current.routine });
        }
      default:
        switch (result.value.entity) {
          case "task":
            return saveAndReturn(c, deps, 200, { task: result.value.task });
          case "project":
            return saveAndReturn(c, deps, 200, { project: result.value.project });
          default:
            return saveAndReturn(c, deps, 200, { routine: result.value.routine });
        }
    }
  });

  // ---------- DELETE /api/v1/trash (BL-011 / FR-062 ゴミ箱を空にする) ----------
  // spec.md §「ゴミ箱を空にするとゴミ箱の全タスクが物理削除される」
  // 認証必須 / Idempotency-Key 必須.
  router.delete("/", async (c) => {
    await purgeTrash(deps);
    return saveAndReturn(c, deps, 204, null);
  });

  return router;
}
