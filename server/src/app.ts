import type { Clock, FakeClock } from "@todica/domain/clock";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { Hono } from "hono";
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
import type { schema } from "./db/schema.js";
import { authMiddleware, idempotencyMiddleware } from "./middleware.js";
import { errorJson } from "./routers/_shared.js";
import { authRouter } from "./routers/auth.js";
import { counterRouter } from "./routers/counter.js";
import { focusRouter } from "./routers/focus.js";
import { projectsRouter } from "./routers/projects.js";
import { resetRouter } from "./routers/reset.js";
import { routinesRouter } from "./routers/routines.js";
import { settingsRouter } from "./routers/settings.js";
import { tasksRouter } from "./routers/tasks.js";
import { todayRouter } from "./routers/today.js";
import { trashRouter } from "./routers/trash.js";

const DEFAULT_ALLOWED_ORIGINS = ["http://localhost:5173", "capacitor://localhost"];

/**
 * ALLOWED_ORIGINS のカンマ区切り値を CORS 許可リストへ変換する.
 */
export function parseAllowedOrigins(envValue: string | undefined): string[] {
  const origins = envValue
    ?.split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  return origins?.length ? origins : [...DEFAULT_ALLOWED_ORIGINS];
}

/**
 * テストおよびアプリ起動の双方で使う依存性の束.
 */
export interface AppDeps {
  taskRepository: TaskRepository;
  projectRepository: ProjectRepository;
  idempotencyStore: IdempotencyStore;
  focusRepository: FocusRepository;
  counterRepository: CounterRepository;
  settingsRepository: SettingsRepository;
  clock: Clock;
  passwordRepository: PasswordRepository;
  sessionRepository: SessionRepository;
  db?: BetterSQLite3Database<typeof schema>;
  routineRepository?: RoutineRepository;
  testClock?: FakeClock;
}

/**
 * Hono アプリを生成する.
 */
export function createApp(deps: AppDeps): Hono {
  const app = new Hono();
  const allowedOrigins = parseAllowedOrigins(process.env.ALLOWED_ORIGINS);

  app.use(
    "*",
    cors({
      origin: (origin) => (allowedOrigins.includes(origin) ? origin : null),
      allowHeaders: ["Content-Type", "Authorization", "Idempotency-Key", "If-Match"],
      exposeHeaders: ["ETag"],
      maxAge: 600,
    }),
  );

  app.get("/healthz", (c) => c.json({ status: "ok" }));
  app.use("*", authMiddleware(deps));
  app.use("*", idempotencyMiddleware(deps));

  app.route("/api/v1", authRouter(deps));
  app.route("/api/v1/tasks", tasksRouter(deps));
  app.route("/api/v1/today", todayRouter(deps));
  app.route("/api/v1/focus", focusRouter(deps));
  app.route("/api/v1/counter", counterRouter(deps));
  app.route("/api/v1/settings", settingsRouter(deps));
  app.route("/api/v1/projects", projectsRouter(deps));
  app.route("/api/v1/trash", trashRouter(deps));
  app.route("/api/v1/reset", resetRouter(deps));
  if (deps.routineRepository) {
    app.route("/api/v1/routines", routinesRouter(deps));
  }

  if (deps.testClock) {
    const testClock = deps.testClock;
    app.get("/api/v1/test/clock", (c) => c.json({ now: testClock.now() }, 200));
    app.post("/api/v1/test/clock/set", async (c) => {
      const body = (await c.req.json()) as { now?: unknown };
      if (typeof body.now !== "string") {
        return errorJson(c, 400, "INVALID_REQUEST_BODY", "now must be ISO 8601 string");
      }
      testClock.set(body.now);
      return c.json({ now: testClock.now() }, 200);
    });
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
