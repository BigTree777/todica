import { Hono } from "hono";
import { completeTask, createTask, deleteTask, updateTask } from "../app/task-usecases.js";
import type { AppDeps } from "../app.js";
import { saveAndReturn, sortTasks } from "./_shared.js";

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

export function tasksRouter(deps: AppDeps): Hono {
  const router = new Hono();
  // ---------- POST /api/v1/tasks ----------
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
    if (typeof name !== "string") {
      return saveAndReturn(c, deps, 400, {
        code: "INVALID_TASK_NAME",
        message: "name must be a string",
      });
    }

    const projectIdInput =
      body.projectId === undefined ? undefined : (body.projectId as string | null);
    const dueDateInput = body.dueDate;
    const priorityInput = body.priority;

    // dueDate が明示されたが値域外なら 400
    if (dueDateInput !== undefined && dueDateInput !== "today" && dueDateInput !== "tomorrow") {
      return saveAndReturn(c, deps, 400, {
        code: "INVALID_DUE_DATE",
        message: "dueDate must be 'today' or 'tomorrow'",
      });
    }
    if (
      priorityInput !== undefined &&
      priorityInput !== "highest" &&
      priorityInput !== "normal" &&
      priorityInput !== "later"
    ) {
      return saveAndReturn(c, deps, 400, {
        code: "INVALID_PRIORITY",
        message: "priority must be 'highest' | 'normal' | 'later'",
      });
    }

    const result = await createTask(deps, {
      id,
      name,
      ...(projectIdInput !== undefined ? { projectId: projectIdInput } : {}),
      ...(dueDateInput !== undefined ? { dueDate: dueDateInput as "today" | "tomorrow" } : {}),
      ...(priorityInput !== undefined
        ? { priority: priorityInput as "highest" | "normal" | "later" }
        : {}),
    });
    if (result.kind !== "ok") {
      // createTask は ok / invalid のみ返す.
      return saveAndReturn(c, deps, 400, {
        code: result.kind === "invalid" ? result.code : "INVALID_REQUEST_BODY",
        message: result.kind === "invalid" ? result.message : "request is invalid",
      });
    }
    return saveAndReturn(c, deps, 201, { task: result.value });
  });

  // ---------- GET /api/v1/tasks ----------
  router.get("/", async (c) => {
    const trashedParam = c.req.query("trashed");
    let trashed: "true" | "false" | "all" = "false";
    if (trashedParam === "true" || trashedParam === "false" || trashedParam === "all") {
      trashed = trashedParam;
    }
    // BL-038 / tomorrow-view: ?dueDate=today|tomorrow を受理する.
    // 不正値は寛容バリデーション (= undefined にフォールバック / 既存 trashed と整合).
    // 詳細は docs/developer/features/tomorrow-view/plan.md §「サーバ補強の手順」.
    const dueDateParam = c.req.query("dueDate");
    const dueDate: "today" | "tomorrow" | undefined =
      dueDateParam === "today" || dueDateParam === "tomorrow" ? dueDateParam : undefined;
    const tasks = await deps.taskRepository.list({
      trashed,
      ...(dueDate ? { dueDate } : {}),
    });
    const sorted = sortTasks(tasks);
    return c.json({ tasks: sorted }, 200);
  });

  // ---------- PATCH /api/v1/tasks/:id ----------
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

    // パース済みの patch を組み立てる. 値域検証 (dueDate / name / priority /
    // projectId 参照整合) はユースケース側が楽観ロック後に行う.
    const patch: {
      name?: string;
      dueDate?: "today" | "tomorrow";
      projectId?: string | null;
      priority?: "highest" | "normal" | "later";
    } = {};
    if (body.name !== undefined) patch.name = body.name as string;
    if (body.dueDate !== undefined) patch.dueDate = body.dueDate as "today" | "tomorrow";
    if (body.projectId !== undefined) patch.projectId = body.projectId as string | null;
    if (body.priority !== undefined)
      patch.priority = body.priority as "highest" | "normal" | "later";

    const result = await updateTask(deps, { id, ifMatch: ifMatch.value, patch });
    switch (result.kind) {
      case "notFound":
        return saveAndReturn(c, deps, 404, { code: result.code, message: result.message });
      case "conflict":
        return saveAndReturn(c, deps, 412, { task: result.current });
      case "invalid":
        return saveAndReturn(c, deps, 400, { code: result.code, message: result.message });
      default:
        return saveAndReturn(c, deps, 200, { task: result.value });
    }
  });

  // ---------- POST /api/v1/tasks/:id/complete (BL-003 / FR-006 / FR-060) ----------
  router.post("/:id/complete", async (c) => {
    const id = c.req.param("id");
    const ifMatch = parseIfMatch(c);

    const result = await completeTask(deps, {
      id,
      ifMatch: ifMatch.value,
      ifMatchPresent: ifMatch.present,
    });
    switch (result.kind) {
      case "notFound":
        return saveAndReturn(c, deps, 404, { code: result.code, message: result.message });
      case "conflict":
        return saveAndReturn(c, deps, 412, { task: result.current });
      case "invalid":
        return saveAndReturn(c, deps, 400, { code: result.code, message: result.message });
      case "noop":
        return saveAndReturn(c, deps, 200, { task: result.value });
      default:
        return saveAndReturn(c, deps, 200, { task: result.value });
    }
  });

  // ---------- DELETE /api/v1/tasks/:id ----------
  router.delete("/:id", async (c) => {
    const id = c.req.param("id");
    const ifMatch = parseIfMatch(c);

    const result = await deleteTask(deps, {
      id,
      ifMatch: ifMatch.value,
      ifMatchPresent: ifMatch.present,
    });
    switch (result.kind) {
      case "notFound":
        return saveAndReturn(c, deps, 404, { code: result.code, message: result.message });
      case "conflict":
        return saveAndReturn(c, deps, 412, { task: result.current });
      case "invalid":
        return saveAndReturn(c, deps, 400, { code: result.code, message: result.message });
      default:
        // ok / noop はいずれも 204.
        return saveAndReturn(c, deps, 204, null);
    }
  });
  return router;
}
