import type { Clock } from "@todica/domain/clock";
import type { Task } from "@todica/domain/task";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { schema } from "../../src/db/schema.js";
import { DrizzleCounterRepository } from "../../src/infra/persistence/drizzle/drizzle-counter-repository.js";
import { DrizzleSettingsRepository } from "../../src/infra/persistence/drizzle/drizzle-settings-repository.js";
import { DrizzleTaskRepository } from "../../src/infra/persistence/drizzle/drizzle-task-repository.js";
import { maybeRunDailyReset } from "../../src/use-cases/daily-reset.js";

const NOW = "2026-06-08T04:01:00.000Z";
const INITIAL = "2026-06-07T10:00:00.000Z";
const TASK_ID = "11111111-1111-4111-8111-111111111111";
const TRASHED_TASK_ID = "22222222-2222-4222-8222-222222222222";

const CREATE_TABLES_SQL = `
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  project_id TEXT,
  due_date TEXT NOT NULL,
  priority TEXT NOT NULL,
  origin TEXT NOT NULL,
  routine_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  trashed_at TEXT,
  trashed_reason TEXT,
  version INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS counter (
  id TEXT PRIMARY KEY NOT NULL,
  completed_count INTEGER NOT NULL DEFAULT 0,
  last_reset_executed_at TEXT,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS settings (
  id TEXT PRIMARY KEY NOT NULL,
  day_boundary_time TEXT NOT NULL DEFAULT '04:00',
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);
`;

function makeTask(overrides: Partial<Task> & { id: string }): Task {
  const { id, ...rest } = overrides;
  return {
    id,
    name: "task",
    projectId: null,
    dueDate: "today",
    priority: "normal",
    origin: "manual",
    routineId: null,
    createdAt: INITIAL,
    updatedAt: INITIAL,
    trashedAt: null,
    trashedReason: null,
    version: 1,
    ...rest,
  };
}

let sqlite: Database.Database;
let db: ReturnType<typeof drizzle<typeof schema>>;
let taskRepository: DrizzleTaskRepository;
let counterRepository: DrizzleCounterRepository;
let settingsRepository: DrizzleSettingsRepository;
const clock: Clock = { now: () => NOW };

async function seedResetState(): Promise<void> {
  await settingsRepository.update({
    id: "singleton",
    dayBoundaryTime: "04:00",
    updatedAt: INITIAL,
    version: 1,
  });
  await counterRepository.update({
    id: "singleton",
    completedCount: 5,
    lastResetExecutedAt: null,
    updatedAt: INITIAL,
    version: 1,
  });
  await taskRepository.insert(makeTask({ id: TASK_ID, dueDate: "tomorrow" }));
  await taskRepository.insert(
    makeTask({
      id: TRASHED_TASK_ID,
      dueDate: "today",
      trashedAt: "2026-06-08T03:00:00.000Z",
      trashedReason: "deleted",
    }),
  );
}

beforeEach(() => {
  vi.stubEnv("TZ", "UTC");
  sqlite = new Database(":memory:");
  sqlite.exec(CREATE_TABLES_SQL);
  db = drizzle(sqlite, { schema });
  taskRepository = new DrizzleTaskRepository({ db });
  counterRepository = new DrizzleCounterRepository({ db });
  settingsRepository = new DrizzleSettingsRepository({ db });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  sqlite.close();
});

describe("maybeRunDailyReset transaction (better-sqlite3 + drizzle)", () => {
  it("deps.db 指定時はリセット書き込みを COMMIT する", async () => {
    await seedResetState();

    const result = await maybeRunDailyReset({
      taskRepository,
      counterRepository,
      settingsRepository,
      clock,
      db,
    });

    expect(result).toEqual({
      executed: true,
      appliedBoundaryAt: "2026-06-08T04:00:00.000Z",
    });
    await expect(taskRepository.findById(TASK_ID)).resolves.toMatchObject({
      dueDate: "today",
      updatedAt: NOW,
      version: 2,
    });
    await expect(counterRepository.get()).resolves.toMatchObject({
      completedCount: 0,
      lastResetExecutedAt: NOW,
      updatedAt: NOW,
      version: 2,
    });
    await expect(taskRepository.findById(TRASHED_TASK_ID)).resolves.toBeNull();
  });

  it("書き込み途中で例外が起きたら ROLLBACK し、リセット前の DB 状態を残す", async () => {
    await seedResetState();
    const originalUpdate = taskRepository.update.bind(taskRepository);
    vi.spyOn(taskRepository, "update").mockImplementation(async (task) => {
      await originalUpdate(task);
      throw new Error("forced reset failure");
    });

    await expect(
      maybeRunDailyReset({
        taskRepository,
        counterRepository,
        settingsRepository,
        clock,
        db,
      }),
    ).rejects.toThrow("forced reset failure");

    await expect(taskRepository.findById(TASK_ID)).resolves.toMatchObject({
      dueDate: "tomorrow",
      updatedAt: INITIAL,
      version: 1,
    });
    await expect(counterRepository.get()).resolves.toMatchObject({
      completedCount: 5,
      lastResetExecutedAt: null,
      updatedAt: INITIAL,
      version: 1,
    });
    await expect(taskRepository.findById(TRASHED_TASK_ID)).resolves.toMatchObject({
      trashedAt: "2026-06-08T03:00:00.000Z",
      trashedReason: "deleted",
    });
  });
});
