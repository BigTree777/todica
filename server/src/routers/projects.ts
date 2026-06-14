import { createProject, updateProject, validateProjectName } from "@todica/domain/project";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import type { AppDeps } from "../app.js";
import { projects as projectsTable, tasks as tasksTable } from "../db/schema.js";
import { saveAndReturn } from "./_shared.js";

export function projectsRouter(deps: AppDeps): Hono {
  const router = new Hono();
  // ---------- POST /api/v1/projects (BL-016 / FR-020) ----------
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
    const name = body.name;
    const nameError = validateProjectName(name);
    if (nameError) {
      return saveAndReturn(c, deps, 400, {
        code: "INVALID_PROJECT_NAME",
        message: "project name is invalid",
      });
    }

    const project = createProject(id, name as string, deps.clock);
    await deps.projectRepository.insert(project);
    return saveAndReturn(c, deps, 201, { project });
  });

  // ---------- GET /api/v1/projects (BL-016) ----------
  router.get("/", async (c) => {
    const projects = await deps.projectRepository.list();
    return c.json({ projects }, 200);
  });

  // ---------- PATCH /api/v1/projects/:id (BL-016 / FR-021) ----------
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

    const current = await deps.projectRepository.findById(id);
    if (!current) {
      return saveAndReturn(c, deps, 404, {
        code: "PROJECT_NOT_FOUND",
        message: "project not found",
      });
    }

    if (current.version !== ifMatch) {
      return saveAndReturn(c, deps, 412, { project: current });
    }

    const name = body.name;
    const nameError = validateProjectName(name);
    if (nameError) {
      return saveAndReturn(c, deps, 400, {
        code: "INVALID_PROJECT_NAME",
        message: "project name is invalid",
      });
    }

    const updated = updateProject(current, name as string, deps.clock);
    await deps.projectRepository.update(updated);
    return saveAndReturn(c, deps, 200, { project: updated });
  });

  // ---------- DELETE /api/v1/projects/:id (BL-016 / FR-022) ----------
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

    const current = await deps.projectRepository.findById(id);
    if (!current) {
      return saveAndReturn(c, deps, 404, {
        code: "PROJECT_NOT_FOUND",
        message: "project not found",
      });
    }

    if (current.version !== ifMatch) {
      return saveAndReturn(c, deps, 412, { project: current });
    }

    // カスケード NULL: 紐付くタスクの projectId を null に更新してから削除する.
    // deps.db が存在する場合はトランザクション内で実行してアトミック性を保証する.
    if (deps.db) {
      deps.db.transaction((tx) => {
        tx.update(tasksTable).set({ projectId: null }).where(eq(tasksTable.projectId, id)).run();
        tx.delete(projectsTable).where(eq(projectsTable.id, id)).run();
      });
    } else {
      await deps.taskRepository.nullifyProjectId(id);
      await deps.projectRepository.delete(id);
    }
    return saveAndReturn(c, deps, 204, null);
  });

  return router;
}
