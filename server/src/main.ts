/**
 * サーバ起動エントリポイント.
 *
 * - better-sqlite3 で SQLite ファイルを開く.
 * - drizzle-orm でラップし, Drizzle ベースの Repository を構築.
 * - 起動時に drizzle 標準 `migrate()` で server/drizzle/*.sql を適用する.
 *   適用済み migration は `__drizzle_migrations` テーブルで自動追跡されるため,
 *   何度起動しても安全 (冪等).
 * - Hono の `app` (fetch ハンドラ) を default export する. 実 listen
 *   (`@hono/node-server` 等での `serve()` 呼び出し) は後続 feature で配線する.
 *
 * 環境変数:
 *   - DATABASE_PATH (default: ./todica.db)
 *   - APP_PASSWORD_HASH (DB が空のときの初期 bcrypt ハッシュ)
 */
import { join } from "node:path";
import { serve } from "@hono/node-server";
import { type Clock, FakeClock, SystemClock } from "@todica/domain/clock";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { createApp } from "./app.js";
import { schema } from "./db/schema.js";
import { DrizzleCounterRepository } from "./infra/persistence/drizzle/counter-repository.js";
import { DrizzleFocusRepository } from "./infra/persistence/drizzle/focus-repository.js";
import { DrizzleIdempotencyStore } from "./infra/persistence/drizzle/idempotency-store.js";
import { DrizzlePasswordRepository } from "./infra/persistence/drizzle/password-repository.js";
import { DrizzleProjectRepository } from "./infra/persistence/drizzle/project-repository.js";
import { DrizzleRoutineRepository } from "./infra/persistence/drizzle/routine-repository.js";
import { DrizzleSessionRepository } from "./infra/persistence/drizzle/session-repository.js";
import { DrizzleSettingsRepository } from "./infra/persistence/drizzle/settings-repository.js";
import { DrizzleTaskRepository } from "./infra/persistence/drizzle/task-repository.js";
import { seedPasswordIfEmpty } from "./password-seed.js";

const DATABASE_PATH = process.env.DATABASE_PATH ?? "./todica.db";
const PORT = Number.parseInt(process.env.PORT ?? "3000", 10);
const APP_PASSWORD_HASH = process.env.APP_PASSWORD_HASH ?? "";
const TEST_NOW = process.env.TEST_NOW;

const sqlite = new Database(DATABASE_PATH);
sqlite.pragma("journal_mode = WAL");
const db = drizzle(sqlite, { schema });
migrate(db, { migrationsFolder: join(process.cwd(), "server", "drizzle") });
const passwordRepository = new DrizzlePasswordRepository({ db });
await seedPasswordIfEmpty(passwordRepository, APP_PASSWORD_HASH, Date.now());
if ((await passwordRepository.getHash()) === null) {
  // eslint-disable-next-line no-console
  console.error("APP_PASSWORD_HASH environment variable is required when app_password is empty");
  process.exit(1);
}

// E2E テスト用 (BL-030): `TEST_NOW` が設定されていればその時刻を初期値とする
// `FakeClock` を使う. `/api/v1/test/clock/*` エンドポイントがこの clock を進める手段を提供する.
// 本番では `TEST_NOW` を立てない (= 常に `SystemClock`).
const clock: Clock = TEST_NOW ? new FakeClock(TEST_NOW) : new SystemClock();

const app = createApp({
  taskRepository: new DrizzleTaskRepository({ db }),
  projectRepository: new DrizzleProjectRepository({ db }),
  idempotencyStore: new DrizzleIdempotencyStore({ db }),
  focusRepository: new DrizzleFocusRepository({ db }),
  // BL-008 / completion-counter: SQLite + drizzle-orm による物理永続化.
  counterRepository: new DrizzleCounterRepository({ db }),
  // BL-009 / settings-day-boundary: SQLite + drizzle-orm による物理永続化.
  settingsRepository: new DrizzleSettingsRepository({ db }),
  // BL-017 / routine: SQLite + drizzle-orm による物理永続化.
  routineRepository: new DrizzleRoutineRepository({ db }),
  // sessions テーブルの永続化.
  sessionRepository: new DrizzleSessionRepository({ db }),
  passwordRepository,
  clock,
  // BL-030: testClock が渡されると app は test-only エンドポイントを生やす.
  testClock: clock instanceof FakeClock ? clock : undefined,
  db,
});

serve({ fetch: app.fetch, port: PORT }, (info) => {
  // eslint-disable-next-line no-console
  console.log(`Todica server listening on http://localhost:${info.port}`);
});

export default app; // テスト用に残す
