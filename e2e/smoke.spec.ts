/**
 * 全層疎通スモークテスト (BL-025).
 *
 * 実ブラウザ ↔ Vite (5173) ↔ Hono サーバ (3000) ↔ SQLite ファイル
 * のフルパスを 1 経路だけ通す.
 *
 * このテスト 1 件が green になることで以下を同時に保証する:
 *   - CORS preflight が通る (server に hono/cors が設定されている)
 *   - root .env の VITE_API_BASE_URL が web に注入される (token はビルド時に埋め込まない)
 *   - playwright.config.ts の起動時に `POST /api/v1/password` で初期パスワードを設定し,
 *     LoginView 経由でセッショントークンを取得 → Bearer 認証が一致する
 *   - drizzle migrate() で初期テーブルが作成される (空 DB → migration 適用)
 *   - POST /api/v1/tasks → DB 永続化 → GET /api/v1/today → UI 反映の経路全部
 */
import { expect, test } from "@playwright/test";
import { openCreateForm } from "./helpers/floating-create-button.js";

test("タスクを追加すると今日の一覧に表示される", async ({ page }) => {
  await page.goto("/today");

  const taskName = `スモーク ${Date.now()}`;

  await openCreateForm(page, "today");
  await page.getByLabel("タスク名").fill(taskName);
  await page.getByRole("button", { name: "追加", exact: true }).click();

  // BL-070 (inline-edit-all-cards) 追従:
  //   タスク名は <span> ではなく <input aria-label="{name} の名前" value="{name}"> として描画される.
  //   起票直後の表示 input を aria-label から取り, value が name と一致することを確認する.
  await expect(page.getByLabel(`${taskName} の名前`)).toHaveValue(taskName);
});
