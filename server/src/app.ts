import { randomBytes } from "node:crypto";
import type { Clock, FakeClock } from "@todica/domain/clock";
import { createProject, updateProject, validateProjectName } from "@todica/domain/project";
import {
  createRoutine,
  updateRoutine,
  validateDaysOfWeek,
  validateDefaultPriority,
  validateRoutineName,
} from "@todica/domain/routine";
import {
  type Task,
  type UpdateTaskInput,
  completeTask,
  createTask,
  restoreTask,
  trashTask,
  updateTask,
} from "@todica/domain/task";
import bcrypt from "bcrypt";
import { and, eq, isNull } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
/**
 * Hono アプリ本体.
 *
 * - 認証 / Idempotency-Key / If-Match ミドルウェア
 * - POST /api/v1/tasks / GET /api/v1/tasks / PATCH /api/v1/tasks/:id / DELETE /api/v1/tasks/:id
 * - 詳細は docs/developer/features/task-crud/plan.md §処理フロー
 */
import { Hono } from "hono";
import type { Context, MiddlewareHandler } from "hono";
import { cors } from "hono/cors";
import type { CounterRepository } from "./data/counter-repository.js";
import type { FocusRepository } from "./data/focus-repository.js";
import type { IdempotencyStore } from "./data/idempotency-store.js";
import type { PasswordRepository } from "./data/password-repository.js";
import type { ProjectRepository } from "./data/project-repository.js";
import type { RoutineRepository } from "./data/routine-repository.js";
import type { SessionRepository } from "./data/session-repository.js";
import type { SettingsRepository } from "./data/settings-repository.js";
import type { TaskRepository } from "./data/task-repository.js";
import {
  projects as projectsTable,
  routines as routinesTable,
  type schema,
  tasks as tasksTable,
} from "./db/schema.js";
import { filterToday, pickNextTaskId, sortToday } from "./today.js";
import { maybeRunDailyReset } from "./use-cases/daily-reset.js";

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
  /**
   * BL-009 / settings-day-boundary: Settings (境界時刻) の永続化.
   */
  settingsRepository: SettingsRepository;
  clock: Clock;
  /** 現在の bcrypt パスワードハッシュの永続化. */
  passwordRepository: PasswordRepository;
  /**
   * セッション永続化.
   */
  sessionRepository: SessionRepository;
  /**
   * BL-010 / daily-reset: plan.md D-004 トランザクション実行のための Drizzle DB インスタンス（オプショナル）.
   * 本番では渡す. テストでは省略し、Repository の非同期メソッドを使うフォールバックで動作する.
   */
  db?: BetterSQLite3Database<typeof schema>;
  /**
   * BL-017 / routine: RoutineRepository.
   */
  routineRepository?: RoutineRepository;
  /**
   * BL-030: E2E テスト用. `TEST_NOW` 環境変数が設定された時に main.ts が `FakeClock`
   * インスタンスを渡す. 渡された場合のみ `/api/v1/test/clock/*` エンドポイントが
   * 生え, 時刻を tick / set できる. 本番では `undefined`.
   */
  testClock?: FakeClock;
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

  // ---------- CORS（認証より先に通す）----------
  // ブラウザ (例: Vite dev server localhost:5173) や Android Capacitor (capacitor://localhost) からの
  // cross-origin リクエストを許可する. 認証は Bearer トークンで担保するため origin は `*` で良い.
  // OPTIONS preflight には Authorization が付かないので, この CORS を authMiddleware より先に置く必要がある.
  app.use(
    "*",
    cors({
      origin: "*",
      allowHeaders: ["Content-Type", "Authorization", "Idempotency-Key", "If-Match"],
      exposeHeaders: ["ETag"],
      maxAge: 600,
    }),
  );

  // ---------- ヘルスチェック（認証不要）----------
  app.get("/healthz", (c) => c.json({ status: "ok" }));

  // ---------- 認証ミドルウェア (sessions lookup) ----------
  // plan.md D-11 / D-15:
  //   - /api/v1/login は token を持たないクライアントから呼ばれるため素通し.
  //   - /healthz も素通し (既存仕様の維持).
  //   - 上記以外は Authorization: Bearer <token> を sessions テーブルから lookup し,
  //     `expires_at > clock.now()` を満たすときのみ通過.
  const authMiddleware: MiddlewareHandler = async (c, next) => {
    if (!c.req.path.startsWith("/api/")) {
      await next();
      return;
    }
    if (c.req.path === "/api/v1/login") {
      await next();
      return;
    }
    const header = c.req.header("Authorization") ?? c.req.header("authorization");
    if (!header) {
      return errorJson(c, 401, "UNAUTHORIZED", "Authorization header missing");
    }
    const match = /^Bearer\s+(.+)$/i.exec(header);
    if (!match) {
      return errorJson(c, 401, "UNAUTHORIZED", "Invalid Bearer token");
    }
    const token = match[1] as string;
    const nowMs = new Date(deps.clock.now()).getTime();
    const session = await deps.sessionRepository.findValidByToken(token, nowMs);
    if (!session) {
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
    // BL-030: テスト用エンドポイントは冪等性管理対象外.
    if (c.req.path.startsWith("/api/v1/test/")) {
      await next();
      return;
    }
    // 認証操作は Idempotency-Key 必須ガードの対象外.
    if (
      c.req.path === "/api/v1/login" ||
      c.req.path === "/api/v1/logout" ||
      c.req.path === "/api/v1/password"
    ) {
      await next();
      return;
    }
    const key = c.req.header("Idempotency-Key") ?? c.req.header("idempotency-key");
    if (!key) {
      return errorJson(c, 400, "MISSING_IDEMPOTENCY_KEY", "Idempotency-Key header is required");
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

  // ---------- POST /api/v1/login ----------
  // plan.md §「処理フロー — ログイン」/ D-2 / D-6 / D-14:
  //   1. body = { password: string }. 不正なら 400.
  //   2. DB の現在ハッシュと照合し, 不一致なら 401 INVALID_PASSWORD.
  //   3. token = randomBytes(32).toString("hex"). expiresAt = clock.now() + 30 日.
  //   4. sessionRepository.create({ token, expiresAt, createdAt }).
  //   5. 200 OK { token, expiresAt }.
  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
  app.post("/api/v1/login", async (c) => {
    let body: Record<string, unknown>;
    try {
      body = (await c.req.json()) as Record<string, unknown>;
    } catch {
      return errorJson(c, 400, "INVALID_REQUEST_BODY", "request body must be valid JSON");
    }
    const password = body.password;
    if (typeof password !== "string" || password.length === 0) {
      return errorJson(c, 400, "INVALID_REQUEST_BODY", "password must be a non-empty string");
    }
    const passwordHash = await deps.passwordRepository.getHash();
    if (passwordHash === null) {
      return errorJson(c, 500, "INTERNAL_ERROR", "password is not configured");
    }
    let match: boolean;
    try {
      match = await bcrypt.compare(password, passwordHash);
    } catch {
      return errorJson(c, 500, "INTERNAL_ERROR", "password verification failed");
    }
    if (!match) {
      return errorJson(c, 401, "INVALID_PASSWORD", "password is incorrect");
    }
    const token = randomBytes(32).toString("hex");
    const nowMs = new Date(deps.clock.now()).getTime();
    const expiresAt = nowMs + THIRTY_DAYS_MS;
    await deps.sessionRepository.create({ token, expiresAt, createdAt: nowMs });
    return c.json({ token, expiresAt }, 200);
  });

  app.post("/api/v1/password", async (c) => {
    let body: Record<string, unknown>;
    try {
      body = (await c.req.json()) as Record<string, unknown>;
    } catch {
      return errorJson(c, 400, "INVALID_REQUEST_BODY", "request body must be valid JSON");
    }

    const currentPassword = body.currentPassword;
    const newPassword = body.newPassword;
    if (
      typeof currentPassword !== "string" ||
      currentPassword.length === 0 ||
      typeof newPassword !== "string" ||
      newPassword.length === 0 ||
      currentPassword === newPassword
    ) {
      return errorJson(
        c,
        400,
        "INVALID_REQUEST_BODY",
        "currentPassword and newPassword must be different non-empty strings",
      );
    }

    try {
      const currentHash = await deps.passwordRepository.getHash();
      if (currentHash === null) {
        return errorJson(c, 500, "INTERNAL_ERROR", "password is not configured");
      }
      if (!(await bcrypt.compare(currentPassword, currentHash))) {
        return errorJson(c, 401, "INVALID_PASSWORD", "password is incorrect");
      }

      const newHash = bcrypt.hashSync(newPassword, 12);
      await deps.passwordRepository.setHash(newHash, Date.now());
      await deps.sessionRepository.deleteAll();
      return c.json({}, 200);
    } catch {
      return errorJson(c, 500, "INTERNAL_ERROR", "password change failed");
    }
  });

  // ---------- POST /api/v1/logout ----------
  // plan.md §「処理フロー — ログアウト」: 有効な session でないと到達しない (authMiddleware が 401).
  // 通過時は Authorization から token を抽出し sessions から DELETE して 204 を返す.
  app.post("/api/v1/logout", async (c) => {
    const header = c.req.header("Authorization") ?? c.req.header("authorization");
    if (header) {
      const match = /^Bearer\s+(.+)$/i.exec(header);
      if (match) {
        await deps.sessionRepository.deleteByToken(match[1] as string);
      }
    }
    return c.body(null, 204);
  });

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
  // counter-repository.get() の戻り値をそのまま 200 OK で返す.
  app.get("/api/v1/counter", async (c) => {
    const counter = await deps.counterRepository.get();
    return c.json({ counter }, 200);
  });

  // ---------- POST /api/v1/reset (BL-010 / FR-043 / FR-051 / NFR-020) ----------
  // spec.md §「POST /api/v1/reset」:
  //   - 認証必須 (middleware 済み)
  //   - Idempotency-Key 必須 (middleware 済み)
  //   - maybeRunDailyReset を呼んでリセット要否を判定・実行する
  //   - 200 OK { executed, appliedBoundaryAt }
  app.post("/api/v1/reset", async (c) => {
    const result = await maybeRunDailyReset({
      taskRepository: deps.taskRepository,
      counterRepository: deps.counterRepository,
      settingsRepository: deps.settingsRepository,
      clock: deps.clock,
      db: deps.db,
      routineRepository: deps.routineRepository,
    });
    return saveAndReturn(c, deps, 200, result);
  });

  // ---------- GET /api/v1/today (BL-005 / FR-010 / FR-011 / NFR-013) ----------
  // plan.md §処理フロー / D-001 / D-005:
  //   1. BL-010 自動リセット: maybeRunDailyReset を先頭で呼び出す (plan.md D-003 / U-003).
  //   2. task-repository.list({ trashed: "false" }) で全 active タスクを取得.
  //   3. filterToday: dueDate === "today" のみに絞る.
  //   4. sortToday:   priority → createdAt → id の 3 段で安定ソート.
  //   5. nextTaskId = tasks[0]?.id ?? null.
  //   6. 200 OK { tasks, nextTaskId }.
  // クエリパラメータは存在しない (NFR-001 / spec.md §「並び順を変えるカスタマイズが存在しないこと」).
  app.get("/api/v1/today", async (c) => {
    // BL-010 / FR-043 / FR-051: 自動リセット（境界時刻を超えていればリセット実行）.
    await maybeRunDailyReset({
      taskRepository: deps.taskRepository,
      counterRepository: deps.counterRepository,
      settingsRepository: deps.settingsRepository,
      clock: deps.clock,
      db: deps.db,
      routineRepository: deps.routineRepository,
    });
    const active = await deps.taskRepository.list({ trashed: "false" });
    const todayTasks = sortToday(filterToday(active));
    const nextTaskId = pickNextTaskId(todayTasks);
    // BL-006 / FR-012: FocusSelection.currentTaskId をミラーしてクライアントに返す.
    const focus = await deps.focusRepository.get();
    // BL-008 / FR-040 (plan.md D-006): Counter.completedCount を /today に同梱する.
    const counter = await deps.counterRepository.get();
    return c.json(
      {
        tasks: todayTasks,
        nextTaskId,
        currentTaskId: focus.currentTaskId,
        completionCount: counter.completedCount,
      },
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
    // BL-008 / FR-006 / FR-040 (plan.md D-002 / D-007):
    // 通常状態 → 完了の遷移が起きた直後だけ counter を +1 する.
    // 既ゴミ箱状態への no-op 再 complete は上の `current.trashedAt !== null` 経路で
    // 早期 return されるため, ここに到達した時点で「通常 → 完了」の遷移が確定している.
    // version + 1, updatedAt は clock.now() で更新する.
    const currentCounter = await deps.counterRepository.get();
    const updatedCounter = {
      ...currentCounter,
      completedCount: currentCounter.completedCount + 1,
      version: currentCounter.version + 1,
      updatedAt: deps.clock.now(),
    };
    await deps.counterRepository.update(updatedCounter);
    // BL-006 / FR-013: 現在のタスクを完了したら focus を解除.
    await clearFocusIfMatches(deps, id);
    return saveAndReturn(c, deps, 200, { task: completed });
  });

  // ---------- GET /api/v1/settings (BL-009 / FR-041 / FR-042) ----------
  // spec.md §「Settings の初期状態」: 認証必須 / 読取専用.
  // settingsRepository.get() の戻り値をそのまま 200 OK で返す.
  app.get("/api/v1/settings", async (c) => {
    const settings = await deps.settingsRepository.get();
    return c.json({ settings }, 200);
  });

  // ---------- PATCH /api/v1/settings (BL-009 / FR-041 / FR-042) ----------
  // spec.md §「境界時刻の更新」: Idempotency-Key 必須 / If-Match で楽観ロック.
  app.patch("/api/v1/settings", async (c) => {
    // body バリデーション.
    let body: Record<string, unknown>;
    try {
      body = (await c.req.json()) as Record<string, unknown>;
    } catch {
      return saveAndReturn(c, deps, 400, {
        code: "INVALID_REQUEST_BODY",
        message: "request body must be valid JSON",
      });
    }

    if (!("dayBoundaryTime" in body)) {
      return saveAndReturn(c, deps, 400, {
        code: "INVALID_REQUEST_BODY",
        message: "dayBoundaryTime is required",
      });
    }

    const dayBoundaryTime = body.dayBoundaryTime;
    if (typeof dayBoundaryTime !== "string") {
      return saveAndReturn(c, deps, 400, {
        code: "INVALID_REQUEST_BODY",
        message: "dayBoundaryTime must be a string",
      });
    }

    // dayBoundaryTime 形式バリデーション: ^([01]\d|2[0-3]):[0-5]\d$
    const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
    if (!timePattern.test(dayBoundaryTime)) {
      return saveAndReturn(c, deps, 400, {
        code: "INVALID_DAY_BOUNDARY_TIME",
        message: "dayBoundaryTime must be in HH:MM format (00:00 - 23:59)",
      });
    }

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

    // 楽観ロック.
    const current = await deps.settingsRepository.get();
    if (current.version !== ifMatch) {
      return saveAndReturn(c, deps, 412, { settings: current });
    }

    const updated = {
      ...current,
      dayBoundaryTime,
      version: current.version + 1,
      updatedAt: deps.clock.now(),
    };
    await deps.settingsRepository.update(updated);
    return saveAndReturn(c, deps, 200, { settings: updated });
  });

  // ---------- GET /api/v1/trash (BL-011 / FR-062 ゴミ箱閲覧) ----------
  // ゴミ箱にあるタスク（trashedAt != null）をすべて返す.
  // 認証必須 (middleware 済み) / 読取専用 (If-Match / Idempotency-Key 不要).
  app.get("/api/v1/trash", async (c) => {
    const trashedTasks = await deps.taskRepository.list({ trashed: "true" });
    return c.json({ tasks: trashedTasks }, 200);
  });

  // ---------- POST /api/v1/trash/:id/restore (BL-011 / FR-061 タスク復元) ----------
  // spec.md §「ゴミ箱のタスクを復元できる（dueDate は 'today' にリセット）」
  // 認証必須 / Idempotency-Key 必須 / If-Match で楽観ロック.
  app.post("/api/v1/trash/:id/restore", async (c) => {
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
  app.delete("/api/v1/trash", async (c) => {
    await deps.taskRepository.deleteAllTrashed();
    return saveAndReturn(c, deps, 204, null);
  });

  // ---------- POST /api/v1/projects (BL-016 / FR-020) ----------
  app.post("/api/v1/projects", async (c) => {
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
  app.get("/api/v1/projects", async (c) => {
    const projects = await deps.projectRepository.list();
    return c.json({ projects }, 200);
  });

  // ---------- PATCH /api/v1/projects/:id (BL-016 / FR-021) ----------
  app.patch("/api/v1/projects/:id", async (c) => {
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
  app.delete("/api/v1/projects/:id", async (c) => {
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

  // ---------- POST /api/v1/routines (BL-017 / FR-030) ----------
  if (deps.routineRepository) {
    const routineRepo = deps.routineRepository;

    app.post("/api/v1/routines", async (c) => {
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
    app.get("/api/v1/routines", async (c) => {
      const routines = await routineRepo.list();
      return c.json({ routines }, 200);
    });

    // ---------- PATCH /api/v1/routines/:id (BL-017 / FR-035) ----------
    app.patch("/api/v1/routines/:id", async (c) => {
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
      if (body.defaultPriority !== undefined)
        patch.defaultPriority = body.defaultPriority as string;

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
    app.delete("/api/v1/routines/:id", async (c) => {
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
  }

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

  // ---------- E2E テスト用エンドポイント (BL-030) ----------
  // `deps.testClock` が渡された時 (main.ts で `TEST_NOW` env が設定された時) のみ生やす.
  // 本番では `undefined` のためルートそのものが存在せず, 誤って public expose されない.
  // 認証は `/api/` 全般の Bearer middleware で担保される.
  if (deps.testClock) {
    const testClock = deps.testClock;

    // 現在の fake 時刻を確認する.
    app.get("/api/v1/test/clock", (c) => c.json({ now: testClock.now() }, 200));

    // 任意の時刻 (ISO 8601) にジャンプ.
    app.post("/api/v1/test/clock/set", async (c) => {
      const body = (await c.req.json()) as { now?: unknown };
      if (typeof body.now !== "string") {
        return errorJson(c, 400, "INVALID_REQUEST_BODY", "now must be ISO 8601 string");
      }
      testClock.set(body.now);
      return c.json({ now: testClock.now() }, 200);
    });

    // 現在時刻を ms 進める. 境界時刻またぎを再現するのに使う.
    app.post("/api/v1/test/clock/advance", async (c) => {
      const body = (await c.req.json()) as { ms?: unknown };
      if (typeof body.ms !== "number" || !Number.isFinite(body.ms)) {
        return errorJson(c, 400, "INVALID_REQUEST_BODY", "ms must be a finite number");
      }
      testClock.tick(body.ms);
      return c.json({ now: testClock.now() }, 200);
    });
  }

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
async function saveAndReturn(c: Context, deps: AppDeps, status: number, body: unknown) {
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
