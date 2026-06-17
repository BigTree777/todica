import { incrementCompletedCount } from "@todica/domain/counter";
import {
  completeTask,
  createTask,
  trashTask,
  type UpdateTaskInput,
  updateTask,
} from "@todica/domain/task";
import { Hono } from "hono";
import type { AppDeps } from "../app.js";
import { clearFocusIfMatches, saveAndReturn, sortTasks } from "./_shared.js";

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
    if (body.dueDate !== undefined && body.dueDate !== "today" && body.dueDate !== "tomorrow") {
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
    // BL-006 / FR-013: 期限を tomorrow に変更したタスクが currentTaskId と一致するなら null に解除.
    if (patch.dueDate === "tomorrow") {
      await clearFocusIfMatches(deps, id);
    }
    return saveAndReturn(c, deps, 200, { task: updateResult.task });
  });

  // ---------- POST /api/v1/tasks/:id/complete (BL-003 / FR-006 / FR-060) ----------
  // plan.md §処理フロー: findById → 既ゴミ箱なら no-op 200 (If-Match 検証スキップ, D-003)
  //  → If-Match 検証 → version 比較 → completeTask → update → saveAndReturn.
  router.post("/:id/complete", async (c) => {
    const id = c.req.param("id");

    const current = await deps.taskRepository.findById(id);
    if (!current) {
      return saveAndReturn(c, deps, 404, {
        code: "TASK_NOT_FOUND",
        message: "task not found",
      });
    }

    // 既にゴミ箱状態 (completed / deleted いずれでも) → no-op 冪等で 200 OK + 現行 task.
    // If-Match 検証はスキップ (plan.md D-003).
    if (current.trashedAt !== null) {
      return saveAndReturn(c, deps, 200, { task: current });
    }

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
    if (current.version !== ifMatch) {
      return saveAndReturn(c, deps, 412, { task: current });
    }

    const completed = completeTask(current, deps.clock);
    await deps.taskRepository.update(completed);
    // BL-008 / FR-006 / FR-040 (plan.md D-002 / D-007):
    // 通常状態 → 完了の遷移が起きた直後だけ counter を +1 する.
    // 既ゴミ箱状態への no-op 再 complete は上の `current.trashedAt !== null` 経路で
    // 早期 return されるため, ここに到達した時点で「通常 → 完了」の遷移が確定している.
    const currentCounter = await deps.counterRepository.get();
    const updatedCounter = incrementCompletedCount(currentCounter, deps.clock.now());
    await deps.counterRepository.update(updatedCounter);
    // BL-006 / FR-013: 現在のタスクを完了したら focus を解除.
    await clearFocusIfMatches(deps, id);
    return saveAndReturn(c, deps, 200, { task: completed });
  });

  // ---------- DELETE /api/v1/tasks/:id ----------
  router.delete("/:id", async (c) => {
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
    // BL-006 / FR-013: 削除対象が現在のタスクなら focus を解除.
    await clearFocusIfMatches(deps, id);
    return saveAndReturn(c, deps, 204, null);
  });
  return router;
}
