/**
 * サーバ起動エントリポイント.
 *
 * - better-sqlite3 で SQLite ファイルを開く.
 * - drizzle-orm でラップし, Drizzle ベースの Repository を構築.
 * - 起動時に server/drizzle/*.sql のマイグレーションを `--> statement-breakpoint` で
 *   split して `sqlite.exec()` で適用する (drizzle-orm の migrator は使わない).
 * - Hono の `app` (fetch ハンドラ) を default export する. 実 listen
 *   (`@hono/node-server` 等での `serve()` 呼び出し) は後続 feature で配線する.
 *
 * 環境変数:
 *   - DATABASE_PATH (default: ./todica.db)
 *   - AUTH_TOKEN (必須: Bearer 認証用の固定トークン)
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { SystemClock } from "@todica/domain/clock";
import { createApp } from "./app.js";
import { schema } from "./db/schema.js";
import { DrizzleTaskRepository } from "./infra/persistence/drizzle/task-repository.js";
import { DrizzleProjectRepository } from "./infra/persistence/drizzle/project-repository.js";
import { DrizzleIdempotencyStore } from "./infra/persistence/drizzle/idempotency-store.js";
import { DrizzleFocusRepository } from "./infra/persistence/drizzle/focus-repository.js";
import { DrizzleCounterRepository } from "./infra/persistence/drizzle/counter-repository.js";

const DATABASE_PATH = process.env.DATABASE_PATH ?? "./todica.db";
const PORT = Number.parseInt(process.env.PORT ?? "3000", 10);
const AUTH_TOKEN = process.env.AUTH_TOKEN ?? "";

if (!AUTH_TOKEN) {
  // eslint-disable-next-line no-console
  console.error("AUTH_TOKEN environment variable is required");
  process.exit(1);
}

/** drizzle のマイグレーション SQL を生 SQL として適用する. */
function applyMigrations(sqlite: Database.Database, migrationsDir: string): void {
  if (!existsSync(migrationsDir)) {
    // eslint-disable-next-line no-console
    console.warn(`migrations dir not found: ${migrationsDir} (skipping)`);
    return;
  }
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const f of files) {
    const sqlText = readFileSync(join(migrationsDir, f), "utf8");
    // statement-breakpoint コメントで分割して順番に実行する
    const statements = sqlText
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    for (const stmt of statements) {
      sqlite.exec(stmt);
    }
  }
}

const sqlite = new Database(DATABASE_PATH);
sqlite.pragma("journal_mode = WAL");
applyMigrations(sqlite, join(process.cwd(), "server", "drizzle"));

const db = drizzle(sqlite, { schema });

const app = createApp({
  taskRepository: new DrizzleTaskRepository({ db }),
  projectRepository: new DrizzleProjectRepository({ db }),
  idempotencyStore: new DrizzleIdempotencyStore({ db }),
  focusRepository: new DrizzleFocusRepository({ db }),
  // BL-008 / completion-counter: SQLite + drizzle-orm による物理永続化.
  counterRepository: new DrizzleCounterRepository({ db }),
  clock: new SystemClock(),
  authToken: AUTH_TOKEN,
});

// @hono/node-server が無い前提で fetch ハンドラを直接 export する.
// 実運用では `serve({ fetch: app.fetch, port: PORT })` を呼ぶか, Bun/Deno で動かす.
// eslint-disable-next-line no-console
console.log(`Todica server ready (PORT=${PORT})`);

export default app;
