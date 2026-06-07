/**
 * Hono アプリ本体.
 *
 * - 認証 / Idempotency-Key / If-Match ミドルウェア
 * - POST /api/v1/tasks / GET /api/v1/tasks / PATCH /api/v1/tasks/:id / DELETE /api/v1/tasks/:id
 * - 詳細は docs/developer/features/task-crud/plan.md §処理フロー
 */
import { Hono } from "hono";
import type { Context, MiddlewareHandler } from "hono";
import type { Clock } from "@todica/domain/clock";
import {
  createTask,
  trashTask,
  updateTask,
  type Task,
  type UpdateTaskInput,
} from "@todica/domain/task";
import type { TaskRepository } from "./data/task-repository.js";
import type { ProjectRepository } from "./data/project-repository.js";
import type { IdempotencyStore } from "./data/idempotency-store.js";

/**
 * テストおよびアプリ起動の双方で使う依存性の束.
 */
export interface AppDeps {
  taskRepository: TaskRepository;
  projectRepository: ProjectRepository;
  idempotencyStore: IdempotencyStore;
  clock: Clock;
  /** Bearer 認証に使う固定トークン. テストでは任意の値を渡す. */
  authToken: string;
}

const WRITE_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);

function errorJson(c: Context, status: number, code: string, message: string) {
  return c.json({ code, message }, status as 400 | 401 | 404 | 412 | 500);
}

/**
 * Hono アプリを生成する.
 */
export function createApp(deps: AppDeps): Hono {
  const app = new Hono();

  // ---------- 認証ミドルウェア ----------
  const authMiddleware: MiddlewareHandler = async (c, next) => {
    if (!c.req.path.startsWith("/api/")) {
      await next();
      return;
    }
    const header = c.req.header("Authorization") ?? c.req.header("authorization");
    if (!header) {
      return errorJson(c, 401, "UNAUTHORIZED", "Authorization header missing");
    }
    const match = /^Bearer\s+(.+)$/i.exec(header);
    if (!match || match[1] !== deps.authToken) {
      return errorJson(c, 401, "UNAUTHORIZED", "Invalid Bearer token");
    }
    await next();
  };
  app.use("*", authMiddleware);

  // ---------- Idempotency-Key ミドルウェア ----------
  const idempotencyMiddleware: MiddlewareHandler = async (c, next) => {
    if (!WRITE_METHODS.has(c.req.method)) {
      await next();
      return;
    }
    if (!c.req.path.startsWith("/api/")) {
      await next();
      return;
    }
    const key = c.req.header("Idempotency-Key") ?? c.req.header("idempotency-key");
    if (!key) {
      return errorJson(
        c,
        400,
        "MISSING_IDEMPOTENCY_KEY",
        "Idempotency-Key header is required",
      );
    }
    // 既に処理済みのキーなら保存済み応答を返す.
    const saved = await deps.idempotencyStore.get(key);
    if (saved) {
      if (saved.status === 204) {
        return c.body(null, 204);
      }
      return c.json(saved.body, saved.status as 200 | 201 | 400 | 401 | 404 | 412);
    }
    c.set("idempotencyKey", key);
    await next();
  };
  app.use("*", idempotencyMiddleware);

  // ---------- POST /api/v1/tasks ----------
  app.post("/api/v1/tasks", async (c) => {
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

    // projectId 参照整合性チェック
    if (projectIdInput !== undefined && projectIdInput !== null) {
      const exists = await deps.projectRepository.exists(projectIdInput);
      if (!exists) {
        return saveAndReturn(c, deps, 400, {
          code: "PROJECT_NOT_FOUND",
          message: "projectId does not exist",
        });
      }
    }

    const createResult = createTask(
      {
        id,
        name,
        projectId: projectIdInput ?? null,
        ...(dueDateInput !== undefined ? { dueDate: dueDateInput as "today" | "tomorrow" } : {}),
        ...(priorityInput !== undefined
          ? { priority: priorityInput as "highest" | "normal" | "later" }
          : {}),
      },
      deps.clock,
    );
    if (!createResult.ok) {
      return saveAndReturn(c, deps, 400, {
        code: createResult.error.code,
        message: createResult.error.message,
      });
    }

    await deps.taskRepository.insert(createResult.task);
    return saveAndReturn(c, deps, 201, { task: createResult.task });
  });

  // ---------- GET /api/v1/tasks ----------
  app.get("/api/v1/tasks", async (c) => {
    const trashedParam = c.req.query("trashed");
    let trashed: "true" | "false" | "all" = "false";
    if (trashedParam === "true" || trashedParam === "false" || trashedParam === "all") {
      trashed = trashedParam;
    }
    const tasks = await deps.taskRepository.list({ trashed });
    const sorted = sortTasks(tasks);
    return c.json({ tasks: sorted }, 200);
  });

  // ---------- PATCH /api/v1/tasks/:id ----------
  app.patch("/api/v1/tasks/:id", async (c) => {
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

    const current = await deps.taskRepository.findById(id);
    if (!current) {
      return saveAndReturn(c, deps, 404, {
        code: "TASK_NOT_FOUND",
        message: "task not found",
      });
    }

    if (current.version !== ifMatch) {
      // 412: 現行 task を返す
      return saveAndReturn(c, deps, 412, { task: current });
    }

    // 入力フィールドの検証 (バリデーション)
    if (
      body.dueDate !== undefined &&
      body.dueDate !== "today" &&
      body.dueDate !== "tomorrow"
    ) {
      return saveAndReturn(c, deps, 400, {
        code: "INVALID_DUE_DATE",
        message: "dueDate must be 'today' or 'tomorrow'",
      });
    }
    if (body.name !== undefined && typeof body.name !== "string") {
      return saveAndReturn(c, deps, 400, {
        code: "INVALID_TASK_NAME",
        message: "name must be a string",
      });
    }
    if (
      body.priority !== undefined &&
      body.priority !== "highest" &&
      body.priority !== "normal" &&
      body.priority !== "later"
    ) {
      return saveAndReturn(c, deps, 400, {
        code: "INVALID_PRIORITY",
        message: "priority must be 'highest' | 'normal' | 'later'",
      });
    }

    if (
      body.projectId !== undefined &&
      body.projectId !== null &&
      typeof body.projectId === "string"
    ) {
      const exists = await deps.projectRepository.exists(body.projectId);
      if (!exists) {
        return saveAndReturn(c, deps, 400, {
          code: "PROJECT_NOT_FOUND",
          message: "projectId does not exist",
        });
      }
    }

    const patch: UpdateTaskInput = {};
    if (body.name !== undefined) patch.name = body.name as string;
    if (body.dueDate !== undefined) patch.dueDate = body.dueDate as "today" | "tomorrow";
    if (body.projectId !== undefined) patch.projectId = body.projectId as string | null;
    if (body.priority !== undefined)
      patch.priority = body.priority as "highest" | "normal" | "later";

    const updateResult = updateTask(current, patch, deps.clock);
    if (!updateResult.ok) {
      return saveAndReturn(c, deps, 400, {
        code: updateResult.error.code,
        message: updateResult.error.message,
      });
    }

    await deps.taskRepository.update(updateResult.task);
    return saveAndReturn(c, deps, 200, { task: updateResult.task });
  });

  // ---------- DELETE /api/v1/tasks/:id ----------
  app.delete("/api/v1/tasks/:id", async (c) => {
    const id = c.req.param("id");

    const ifMatchHeader = c.req.header("If-Match") ?? c.req.header("if-match");

    const current = await deps.taskRepository.findById(id);
    if (!current) {
      return saveAndReturn(c, deps, 404, {
        code: "TASK_NOT_FOUND",
        message: "task not found",
      });
    }

    // 既にゴミ箱状態 → no-op (204). version 検証もスキップ.
    if (current.trashedAt !== null && current.trashedReason === "deleted") {
      return saveAndReturn(c, deps, 204, null);
    }

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
    if (current.version !== ifMatch) {
      return saveAndReturn(c, deps, 412, { task: current });
    }

    const trashed = trashTask(current, deps.clock);
    await deps.taskRepository.update(trashed);
    return saveAndReturn(c, deps, 204, null);
  });

  return app;
}

/**
 * 応答を Idempotency-Key に保存しつつ HTTP レスポンスを返す.
 * 書き込み系 (POST / PATCH / DELETE) は middleware が key を c.set("idempotencyKey") に積む.
 */
async function saveAndReturn(
  c: Context,
  deps: AppDeps,
  status: number,
  body: unknown,
) {
  const key = c.get("idempotencyKey") as string | undefined;
  if (key) {
    await deps.idempotencyStore.save(key, { status, body });
  }
  if (status === 204) {
    return c.body(null, 204);
  }
  return c.json(body, status as 200 | 201 | 400 | 401 | 404 | 412);
}

/**
 * 暫定 3 段ソート: dueDate (today→tomorrow), priority (highest→normal→later), createdAt 昇順.
 * plan.md §影響範囲 §UI.
 */
function sortTasks(tasks: Task[]): Task[] {
  const dueDateOrder: Record<string, number> = { today: 0, tomorrow: 1 };
  const priorityOrder: Record<string, number> = { highest: 0, normal: 1, later: 2 };
  return [...tasks].sort((a, b) => {
    const dd = (dueDateOrder[a.dueDate] ?? 99) - (dueDateOrder[b.dueDate] ?? 99);
    if (dd !== 0) return dd;
    const pp = (priorityOrder[a.priority] ?? 99) - (priorityOrder[b.priority] ?? 99);
    if (pp !== 0) return pp;
    return a.createdAt.localeCompare(b.createdAt);
  });
}
