import { Hono } from "hono";
import { createRoutine, deleteRoutine, updateRoutine } from "../app/routine-usecases.js";
import type { AppDeps } from "../app.js";
import { saveAndReturn } from "./_shared.js";

/** If-Match ヘッダを取得し, 存在有無とパース済みの数値を返す. */
function parseIfMatch(c: { req: { header(name: string): string | undefined } }): {
  present: boolean;
  value: number | undefined;
} {
  const header = c.req.header("If-Match") ?? c.req.header("if-match");
  if (!header) return { present: false, value: undefined };
  const parsed = Number.parseInt(header, 10);
  return { present: true, value: Number.isFinite(parsed) ? parsed : undefined };
}

export function routinesRouter(deps: AppDeps): Hono {
  const router = new Hono();
  const routineRepo = deps.routineRepository;
  if (!routineRepo) return router;
  // ---------- POST /api/v1/routines (BL-017 / FR-030) ----------
  router.post("/", async (c) => {
    let body: Record<string, unknown>;
    try {
      body = (await c.req.json()) as Record<string, unknown>;
    } catch {
      return saveAndReturn(c, deps, 400, {
        code: "INVALID_REQUEST_BODY",
        message: "request body must be valid JSON",
      });
    }

    const id = typeof body.id === "string" ? body.id : undefined;
    if (!id) {
      return saveAndReturn(c, deps, 400, {
        code: "INVALID_REQUEST_BODY",
        message: "id is required",
      });
    }

    const result = await createRoutine(deps, routineRepo, {
      id,
      name: body.name,
      daysOfWeek: body.daysOfWeek,
      defaultPriority: body.defaultPriority,
    });
    if (result.kind !== "ok") {
      return saveAndReturn(c, deps, 400, {
        code: result.kind === "invalid" ? result.code : "INVALID_REQUEST_BODY",
        message: result.kind === "invalid" ? result.message : "request is invalid",
      });
    }
    return saveAndReturn(c, deps, 201, { routine: result.value });
  });

  // ---------- GET /api/v1/routines (BL-017 / FR-030) ----------
  router.get("/", async (c) => {
    const routines = await routineRepo.list();
    return c.json({ routines }, 200);
  });

  // ---------- PATCH /api/v1/routines/:id (BL-017 / FR-035) ----------
  router.patch("/:id", async (c) => {
    const id = c.req.param("id");

    const ifMatch = parseIfMatch(c);
    if (!ifMatch.present) {
      return saveAndReturn(c, deps, 400, {
        code: "MISSING_IF_MATCH",
        message: "If-Match header is required",
      });
    }
    if (ifMatch.value === undefined) {
      return saveAndReturn(c, deps, 400, {
        code: "MISSING_IF_MATCH",
        message: "If-Match header must be a numeric version",
      });
    }

    let body: Record<string, unknown>;
    try {
      body = (await c.req.json()) as Record<string, unknown>;
    } catch {
      return saveAndReturn(c, deps, 400, {
        code: "INVALID_REQUEST_BODY",
        message: "request body must be valid JSON",
      });
    }

    const patch: { name?: string; daysOfWeek?: number[]; defaultPriority?: string } = {};
    if (body.name !== undefined) patch.name = body.name as string;
    if (body.daysOfWeek !== undefined) patch.daysOfWeek = body.daysOfWeek as number[];
    if (body.defaultPriority !== undefined) patch.defaultPriority = body.defaultPriority as string;

    const result = await updateRoutine(deps, routineRepo, { id, ifMatch: ifMatch.value, patch });
    switch (result.kind) {
      case "notFound":
        return saveAndReturn(c, deps, 404, { code: result.code, message: result.message });
      case "conflict":
        return saveAndReturn(c, deps, 412, { routine: result.current });
      case "invalid":
        return saveAndReturn(c, deps, 400, { code: result.code, message: result.message });
      default:
        return saveAndReturn(c, deps, 200, { routine: result.value });
    }
  });

  // ---------- DELETE /api/v1/routines/:id (BL-017 / FR-030 補足) ----------
  router.delete("/:id", async (c) => {
    const id = c.req.param("id");

    const ifMatch = parseIfMatch(c);
    if (!ifMatch.present) {
      return saveAndReturn(c, deps, 400, {
        code: "MISSING_IF_MATCH",
        message: "If-Match header is required",
      });
    }
    if (ifMatch.value === undefined) {
      return saveAndReturn(c, deps, 400, {
        code: "MISSING_IF_MATCH",
        message: "If-Match header must be a numeric version",
      });
    }

    const result = await deleteRoutine(deps, routineRepo, { id, ifMatch: ifMatch.value });
    switch (result.kind) {
      case "notFound":
        return saveAndReturn(c, deps, 404, { code: result.code, message: result.message });
      case "conflict":
        return saveAndReturn(c, deps, 412, { routine: result.current });
      default:
        return saveAndReturn(c, deps, 204, null);
    }
  });

  return router;
}
