import { restoreTask } from "@todica/domain/task";
import { Hono } from "hono";
import type { AppDeps } from "../app.js";
import { saveAndReturn } from "./_shared.js";

export function trashRouter(deps: AppDeps): Hono {
  const router = new Hono();
  // ---------- GET /api/v1/trash (BL-011 / FR-062 ゴミ箱閲覧) ----------
  // ゴミ箱にあるタスク（trashedAt != null）をすべて返す.
  // 認証必須 (middleware 済み) / 読取専用 (If-Match / Idempotency-Key 不要).
  router.get("/", async (c) => {
    const trashedTasks = await deps.taskRepository.list({ trashed: "true" });
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

    const current = await deps.taskRepository.findById(id);
    if (!current) {
      return saveAndReturn(c, deps, 404, {
        code: "TASK_NOT_FOUND",
        message: "task not found",
      });
    }

    // ゴミ箱に入っていないタスクへの復元は 400.
    if (current.trashedAt === null) {
      return saveAndReturn(c, deps, 400, {
        code: "TASK_NOT_IN_TRASH",
        message: "task is not in trash",
      });
    }

    // 楽観ロック.
    if (current.version !== ifMatch) {
      return saveAndReturn(c, deps, 412, { task: current });
    }

    const restored = restoreTask(current, deps.clock);
    await deps.taskRepository.update(restored);
    return saveAndReturn(c, deps, 200, { task: restored });
  });

  // ---------- DELETE /api/v1/trash (BL-011 / FR-062 ゴミ箱を空にする) ----------
  // spec.md §「ゴミ箱を空にするとゴミ箱の全タスクが物理削除される」
  // 認証必須 / Idempotency-Key 必須.
  router.delete("/", async (c) => {
    await deps.taskRepository.deleteAllTrashed();
    return saveAndReturn(c, deps, 204, null);
  });

  return router;
}
