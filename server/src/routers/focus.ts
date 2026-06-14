import { Hono } from "hono";
import type { AppDeps } from "../app.js";
import { saveAndReturn } from "./_shared.js";

export function focusRouter(deps: AppDeps): Hono {
  const router = new Hono();
  // ---------- GET /api/v1/focus (BL-006 / FR-012) ----------
  // spec.md §「GET /api/v1/focus」: 認証必須 / 読取専用 (If-Match / Idempotency-Key 不要).
  // focus-selection-repository.get() の戻り値をそのまま 200 OK で返す.
  router.get("/", async (c) => {
    const focus = await deps.focusRepository.get();
    return c.json({ focus }, 200);
  });

  // ---------- PUT /api/v1/focus (BL-006 / FR-012) ----------
  // spec.md §「PUT /api/v1/focus」: body { taskId: string | null } を受け,
  // If-Match で楽観ロック, Idempotency-Key 必須 (middleware で確認済).
  // INVALID_FOCUS_TARGET: 存在しない / ゴミ箱中 / dueDate !== "today".
  router.put("/", async (c) => {
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

    // body 解析.
    let body: Record<string, unknown>;
    try {
      body = (await c.req.json()) as Record<string, unknown>;
    } catch {
      return saveAndReturn(c, deps, 400, {
        code: "INVALID_REQUEST_BODY",
        message: "request body must be valid JSON",
      });
    }

    if (!("taskId" in body)) {
      return saveAndReturn(c, deps, 400, {
        code: "INVALID_REQUEST_BODY",
        message: "taskId is required",
      });
    }
    const taskId = body.taskId;
    if (taskId !== null && typeof taskId !== "string") {
      return saveAndReturn(c, deps, 400, {
        code: "INVALID_FOCUS_TARGET",
        message: "taskId must be string or null",
      });
    }

    // 楽観ロック.
    const current = await deps.focusRepository.get();
    if (current.version !== ifMatch) {
      return saveAndReturn(c, deps, 412, { focus: current });
    }

    // 設定値の妥当性検証 (null は解除なので skip).
    if (taskId !== null) {
      const task = await deps.taskRepository.findById(taskId);
      if (!task) {
        return saveAndReturn(c, deps, 400, {
          code: "INVALID_FOCUS_TARGET",
          message: "task not found",
        });
      }
      if (task.trashedAt !== null) {
        return saveAndReturn(c, deps, 400, {
          code: "INVALID_FOCUS_TARGET",
          message: "task is trashed",
        });
      }
      if (task.dueDate !== "today") {
        return saveAndReturn(c, deps, 400, {
          code: "INVALID_FOCUS_TARGET",
          message: "task dueDate is not today",
        });
      }
    }

    const updated = {
      ...current,
      currentTaskId: taskId,
      version: current.version + 1,
      updatedAt: deps.clock.now(),
    };
    await deps.focusRepository.update(updated);
    return saveAndReturn(c, deps, 200, { focus: updated });
  });

  return router;
}
