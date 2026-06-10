/**
 * 全層疎通スモークテスト (BL-025).
 *
 * 実ブラウザ ↔ Vite (5173) ↔ Hono サーバ (3000) ↔ SQLite ファイル
 * のフルパスを 1 経路だけ通す.
 *
 * このテスト 1 件が green になることで以下を同時に保証する:
 *   - CORS preflight が通る (server に hono/cors が設定されている)
 *   - root .env の VITE_API_BASE_URL / VITE_AUTH_TOKEN が web に注入される
 *   - root .env の AUTH_TOKEN で server が起動し Bearer 認証が一致する
 *   - drizzle migrate() で初期テーブルが作成される (空 DB → migration 適用)
 *   - POST /api/v1/tasks → DB 永続化 → GET /api/v1/today → UI 反映の経路全部
 */
import { test, expect } from "@playwright/test";

test("タスクを追加すると今日の一覧に表示される", async ({ page }) => {
  await page.goto("/");

  const taskName = `スモーク ${Date.now()}`;

  await page.getByLabel("タスク名").fill(taskName);
  await page.getByRole("button", { name: "追加", exact: true }).click();

  await expect(page.getByText(taskName)).toBeVisible();
});
