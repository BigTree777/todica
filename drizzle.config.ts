/**
 * drizzle-kit 設定.
 *
 * - スキーマ定義は server/src/db/schema.ts.
 * - マイグレーション出力先は server/drizzle/.
 * - SQLite (better-sqlite3) を採用 (overview.md §8.1).
 */
import type { Config } from "drizzle-kit";

export default {
  schema: "./server/src/db/schema.ts",
  out: "./server/drizzle",
  dialect: "sqlite",
} satisfies Config;
