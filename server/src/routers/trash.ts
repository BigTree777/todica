import { Hono } from "hono";
import { listTrash, purgeTrash, restoreTask } from "../app/trash-usecases.js";
import type { AppDeps } from "../app.js";
import { saveAndReturn } from "./_shared.js";

export function trashRouter(deps: AppDeps): Hono {
  const router = new Hono();
  // ---------- GET /api/v1/trash (BL-011 / FR-062 ゴミ箱閲覧) ----------
  // ゴミ箱にあるタスク（trashedAt != null）をすべて返す.
  // 認証必須 (middleware 済み) / 読取専用 (If-Match / Idempotency-Key 不要).
  router.get("/", async (c) => {
    const trashedTasks = await listTrash(deps);
    return c.json({ tasks: trashedTasks }, 200);
  });

  // ---------- POST /api/v1/trash/:id/restore (BL-011 / FR-061 タスク復元) ----------
  // spec.md §「ゴミ箱のタスクを復元できる（dueDate は 'today' にリセット）」
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

    const result = await restoreTask(deps, { id, ifMatch });
    switch (result.kind) {
      case "notFound":
        return saveAndReturn(c, deps, 404, { code: result.code, message: result.message });
      case "invalid":
        return saveAndReturn(c, deps, 400, { code: result.code, message: result.message });
      case "conflict":
        return saveAndReturn(c, deps, 412, { task: result.current });
      default:
        return saveAndReturn(c, deps, 200, { task: result.value });
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
