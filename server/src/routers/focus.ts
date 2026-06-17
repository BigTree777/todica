import { Hono } from "hono";
import { getFocus, setFocus } from "../app/focus-usecases.js";
import type { AppDeps } from "../app.js";
import { saveAndReturn } from "./_shared.js";

export function focusRouter(deps: AppDeps): Hono {
  const router = new Hono();
  // ---------- GET /api/v1/focus (BL-006 / FR-012) ----------
  // spec.md §「GET /api/v1/focus」: 認証必須 / 読取専用 (If-Match / Idempotency-Key 不要).
  router.get("/", async (c) => {
    const focus = await getFocus(deps);
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

    const result = await setFocus(deps, { taskId, ifMatch });
    if (result.kind === "conflict") {
      return saveAndReturn(c, deps, 412, { focus: result.current });
    }
    if (result.kind === "invalid") {
      return saveAndReturn(c, deps, 400, { code: result.code, message: result.message });
    }
    if (result.kind === "notFound") {
      return saveAndReturn(c, deps, 404, { code: result.code, message: result.message });
    }
    return saveAndReturn(c, deps, 200, { focus: result.value });
  });

  return router;
}
