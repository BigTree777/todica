/**
 * 明示的マイグレーション実行スクリプト (`npm run migrate`).
 *
 * 起動時自動適用 (main.ts) と同じ drizzle 標準 `migrate()` を, サーバを起動せず単体で実行する.
 * `drizzle-kit generate` で作ったマイグレーションを適用したい時や, デプロイ前の明示的な
 * 手順として使う. 適用済み migration は `__drizzle_migrations` テーブルで自動追跡されるため,
 * 何度実行しても未適用分のみが適用される (冪等).
 *
 * 環境変数:
 *   - DATABASE_PATH (default: ./todica.db)
 *
 * cwd はリポジトリルートを前提とする (`migrationsFolder` を `<root>/server/drizzle` に解決する).
 */
import { join } from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

const databasePath = process.env.DATABASE_PATH ?? "./todica.db";

const sqlite = new Database(databasePath);
try {
  migrate(drizzle(sqlite), { migrationsFolder: join(process.cwd(), "server", "drizzle") });
  console.log(`✓ migrations applied to ${databasePath}`);
} finally {
  sqlite.close();
}
