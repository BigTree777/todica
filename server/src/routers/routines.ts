import {
  createRoutine,
  updateRoutine,
  validateDaysOfWeek,
  validateDefaultPriority,
  validateRoutineName,
} from "@todica/domain/routine";
import { and, eq, isNull } from "drizzle-orm";
import { Hono } from "hono";
import type { AppDeps } from "../app.js";
import { routines as routinesTable, tasks as tasksTable } from "../db/schema.js";
import { saveAndReturn } from "./_shared.js";

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

    const nameError = validateRoutineName(body.name);
    if (nameError) {
      return saveAndReturn(c, deps, 400, {
        code: nameError.code,
        message: "routine name is invalid",
      });
    }

    const daysError = validateDaysOfWeek(body.daysOfWeek);
    if (daysError) {
      return saveAndReturn(c, deps, 400, {
        code: daysError.code,
        message: "daysOfWeek is invalid",
      });
    }

    if (body.defaultPriority !== undefined) {
      const priorityError = validateDefaultPriority(body.defaultPriority);
      if (priorityError) {
        return saveAndReturn(c, deps, 400, {
          code: priorityError.code,
          message: "defaultPriority is invalid",
        });
      }
    }

    const createResult = createRoutine(
      {
        id,
        name: body.name as string,
        daysOfWeek: body.daysOfWeek as number[],
        defaultPriority: (body.defaultPriority as string) ?? "normal",
      },
      deps.clock,
    );

    if (!createResult.ok) {
      return saveAndReturn(c, deps, 400, {
        code: createResult.error.code,
        message: "routine validation failed",
      });
    }

    await routineRepo.create(createResult.routine);
    return saveAndReturn(c, deps, 201, { routine: createResult.routine });
  });

  // ---------- GET /api/v1/routines (BL-017 / FR-030) ----------
  router.get("/", async (c) => {
    const routines = await routineRepo.list();
    return c.json({ routines }, 200);
  });

  // ---------- PATCH /api/v1/routines/:id (BL-017 / FR-035) ----------
  router.patch("/:id", async (c) => {
    const id = c.req.param("id");

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

    let body: Record<string, unknown>;
    try {
      body = (await c.req.json()) as Record<string, unknown>;
    } catch {
      return saveAndReturn(c, deps, 400, {
        code: "INVALID_REQUEST_BODY",
        message: "request body must be valid JSON",
      });
    }

    const current = await routineRepo.findById(id);
    if (!current) {
      return saveAndReturn(c, deps, 404, {
        code: "ROUTINE_NOT_FOUND",
        message: "routine not found",
      });
    }

    if (current.version !== ifMatch) {
      return saveAndReturn(c, deps, 412, { routine: current });
    }

    const patch: { name?: string; daysOfWeek?: number[]; defaultPriority?: string } = {};
    if (body.name !== undefined) patch.name = body.name as string;
    if (body.daysOfWeek !== undefined) patch.daysOfWeek = body.daysOfWeek as number[];
    if (body.defaultPriority !== undefined) patch.defaultPriority = body.defaultPriority as string;

    const updateResult = updateRoutine(current, patch, deps.clock);
    if (!updateResult.ok) {
      return saveAndReturn(c, deps, 400, {
        code: updateResult.error.code,
        message: "routine validation failed",
      });
    }

    await routineRepo.update(updateResult.routine);
    return saveAndReturn(c, deps, 200, { routine: updateResult.routine });
  });

  // ---------- DELETE /api/v1/routines/:id (BL-017 / FR-030 補足) ----------
  router.delete("/:id", async (c) => {
    const id = c.req.param("id");

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

    const current = await routineRepo.findById(id);
    if (!current) {
      return saveAndReturn(c, deps, 404, {
        code: "ROUTINE_NOT_FOUND",
        message: "routine not found",
      });
    }

    if (current.version !== ifMatch) {
      return saveAndReturn(c, deps, 412, { routine: current });
    }

    // カスケード削除: 紐付くタスクを先に削除してからルーティンを削除する.
    // deps.db が存在する場合はトランザクション内でアトミックに実行する.
    if (deps.db) {
      deps.db.transaction((tx) => {
        tx.delete(tasksTable)
          .where(and(eq(tasksTable.routineId, id), isNull(tasksTable.trashedAt)))
          .run();
        tx.delete(routinesTable).where(eq(routinesTable.id, id)).run();
      });
    } else {
      await deps.taskRepository.deleteByRoutineId(id);
      await routineRepo.delete(id);
    }
    return saveAndReturn(c, deps, 204, null);
  });

  return router;
}
