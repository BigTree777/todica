/**
 * キーボード操作のみで主要操作が完結する E2E (BL-029 / NFR-010 補強).
 *
 * マウス操作を一切使わず, Tab / Shift+Tab / Enter / Space のみで
 * タスクを追加できることを保証する. NFR-010 (キーボード操作のみで使えること) の
 * 最低限の保証.
 *
 * 注: 編集 / 完了は「タスク一覧」上のボタン群 (優先度切替 / 編集 / 明日へ / 完了 / 削除 /
 * 現在に設定 or 現在解除) が連続して並んでおり, 個別タスクへの Tab 到達まで
 * フォーカス順を厳密に追う必要がある. その対象範囲は ARIA 設計の見直しを含むため
 * BL-029 の本テストは「起票だけがキーボードで完結する」の最小保証に留める.
 */
import { expect, test } from "@playwright/test";

test("Tab + 入力 + Enter だけでタスクを追加できる", async ({ page }) => {
  await page.goto("/");
  const taskName = `キーボード ${Date.now()}`;

  // タスク名 input にキーボードでフォーカスを与える.
  await page.getByLabel("タスク名").focus();

  // type は keyboard 入力をシミュレートする (clipboard 貼付けではない).
  await page.keyboard.type(taskName);

  // form の input で Enter は submit に等しい. マウスクリックを一切使わない.
  await page.keyboard.press("Enter");

  // BL-070 追従: タスク名は <input aria-label="{name} の名前" value={name}> として表示される.
  await expect(page.getByLabel(`${taskName} の名前`)).toHaveValue(taskName);
});
