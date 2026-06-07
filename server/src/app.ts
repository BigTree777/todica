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
  completeTask,
  createTask,
  trashTask,
  updateTask,
  type Task,
  type UpdateTaskInput,
} from "@todica/domain/task";
import type { TaskRepository } from "./data/task-repository.js";
import type { ProjectRepository } from "./data/project-repository.js";
import type { IdempotencyStore } from "./data/idempotency-store.js";
import type { FocusRepository } from "./data/focus-repository.js";
import type { CounterRepository } from "./data/counter-repository.js";
import { filterToday, pickNextTaskId, sortToday } from "./today.js";

/**
 * テストおよびアプリ起動の双方で使う依存性の束.
 */
export interface AppDeps {
  taskRepository: TaskRepository;
  projectRepository: ProjectRepository;
  idempotencyStore: IdempotencyStore;
  /**
   * BL-006 / focus-task: FocusSelection (現在のタスク) の永続化.
   * 本フィールドは test-designer 段階の依存. 本ハンドラ実装 (GET/PUT /api/v1/focus,
   * complete / delete / patch のフォーカス連動) は implementer が green 化する.
   */
  focusRepository: FocusRepository;
  /**
   * BL-008 / completion-counter: Counter (今日の完了タスク数) の永続化.
   * 本フィールドは test-designer 段階の依存. 本ハンドラ実装 (GET /api/v1/counter,
   * complete ハンドラでの +1 集計, /today レスポンスへの completionCount 同梱) は
   * implementer が green 化する.
   */
  counterRepository: CounterRepository;
  clock: Clock;
  /** Bearer 認証に使う固定トークン. テストでは任意の値を渡す. */
  authToken: string;
}

const WRITE_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);

function errorJson(c: Context, status: number, code: string, message: string) {
  return c.json({ code, message }, status as 400 | 401 | 404 | 412 | 500 | 501);
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

  // ---------- GET /api/v1/focus (BL-006 / FR-012) ----------
  // spec.md §「GET /api/v1/focus」: 認証必須 / 読取専用 (If-Match / Idempotency-Key 不要).
  // focus-selection-repository.get() の戻り値をそのまま 200 OK で返す.
  app.get("/api/v1/focus", async (c) => {
    const focus = await deps.focusRepository.get();
    return c.json({ focus }, 200);
  });

  // ---------- PUT /api/v1/focus (BL-006 / FR-012) ----------
  // spec.md §「PUT /api/v1/focus」: body { taskId: string | null } を受け,
  // If-Match で楽観ロック, Idempotency-Key 必須 (middleware で確認済).
  // INVALID_FOCUS_TARGET: 存在しない / ゴミ箱中 / dueDate !== "today".
  app.put("/api/v1/focus", async (c) => {
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

  // ---------- GET /api/v1/counter (BL-008 / FR-040) ----------
  // spec.md §「Counter の初期状態」: 認証必須 / 読取専用 (If-Match / Idempotency-Key 不要).
  // 本ハンドラは test-designer 段階のスタブ. implementer が
  // counter-repository.get() を呼び 200 OK { counter } を返す本実装で green 化する.
  app.get("/api/v1/counter", async (c) => {
    return errorJson(c, 501, "NOT_IMPLEMENTED", "GET /api/v1/counter is not implemented yet");
  });

  // ---------- GET /api/v1/today (BL-005 / FR-010 / FR-011 / NFR-013) ----------
  // plan.md §処理フロー / D-001 / D-005:
  //   1. task-repository.list({ trashed: "false" }) で全 active タスクを取得.
  //   2. filterToday: dueDate === "today" のみに絞る.
  //   3. sortToday:   priority → createdAt → id の 3 段で安定ソート.
  //   4. nextTaskId = tasks[0]?.id ?? null.
  //   5. 200 OK { tasks, nextTaskId }.
  // クエリパラメータは存在しない (NFR-001 / spec.md §「並び順を変えるカスタマイズが存在しないこと」).
  app.get("/api/v1/today", async (c) => {
    const active = await deps.taskRepository.list({ trashed: "false" });
    const todayTasks = sortToday(filterToday(active));
    const nextTaskId = pickNextTaskId(todayTasks);
    // BL-006 / FR-012: FocusSelection.currentTaskId をミラーしてクライアントに返す.
    const focus = await deps.focusRepository.get();
    return c.json(
      { tasks: todayTasks, nextTaskId, currentTaskId: focus.currentTaskId },
      200,
    );
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
    // BL-006 / FR-013: 期限を tomorrow に変更したタスクが currentTaskId と一致するなら null に解除.
    if (patch.dueDate === "tomorrow") {
      await clearFocusIfMatches(deps, id);
    }
    return saveAndReturn(c, deps, 200, { task: updateResult.task });
  });

  // ---------- POST /api/v1/tasks/:id/complete (BL-003 / FR-006 / FR-060) ----------
  // plan.md §処理フロー: findById → 既ゴミ箱なら no-op 200 (If-Match 検証スキップ, D-003)
  //  → If-Match 検証 → version 比較 → completeTask → update → saveAndReturn.
  app.post("/api/v1/tasks/:id/complete", async (c) => {
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
    // BL-006 / FR-013: 現在のタスクを完了したら focus を解除.
    await clearFocusIfMatches(deps, id);
    return saveAndReturn(c, deps, 200, { task: completed });
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
    // BL-006 / FR-013: 削除対象が現在のタスクなら focus を解除.
    await clearFocusIfMatches(deps, id);
    return saveAndReturn(c, deps, 204, null);
  });

  return app;
}

/**
 * BL-006 / FR-013: focus.currentTaskId が targetId と一致するなら null に解除する.
 *
 * 完了 / 削除 / 期限変更 (today → tomorrow) の各経路で呼び出す.
 * version は +1, updatedAt は clock.now() で更新.
 * 一致しない / null の場合は no-op (副作用なし).
 */
async function clearFocusIfMatches(deps: AppDeps, targetId: string): Promise<void> {
  const focus = await deps.focusRepository.get();
  if (focus.currentTaskId !== targetId) return;
  const updated = {
    ...focus,
    currentTaskId: null,
    version: focus.version + 1,
    updatedAt: deps.clock.now(),
  };
  await deps.focusRepository.update(updated);
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
  return c.json(body, status as 200 | 201 | 400 | 401 | 404 | 412 | 500 | 501);
}

/**
 * GET /api/v1/tasks のサーバ側ソート規則 (BL-005 / plan.md D-003).
 *
 * 本仕様の並び順 (priority → createdAt → id) に統一する.
 * 暫定実装の第一キーだった dueDate (today→tomorrow) は本実装で削除.
 * 今日ビュー (GET /api/v1/today) と並びの規則を揃え, monorepo 内で
 * 「タスクの並び」の正本を 1 箇所に閉じ込める (sortToday と同等規則).
 */
function sortTasks(tasks: Task[]): Task[] {
  return sortToday(tasks);
}
