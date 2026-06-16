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
import { createFormLocator, openCreateForm } from "./helpers/floating-create-button.js";

test("Tab + 入力 + Enter だけでタスクを追加できる", async ({ page }) => {
  await page.goto("/");
  const taskName = `キーボード ${Date.now()}`;

  // BL-104 追従: + ボタンを押して起票フォームを開いた直後, 先頭 input にフォーカスが
  // 移る (REQ-10). よって明示的に focus() を呼び直さなくても type が効く.
  await openCreateForm(page, "today");

  // type は keyboard 入力をシミュレートする (clipboard 貼付けではない).
  await page.keyboard.type(taskName);

  // form の input で Enter は submit に等しい. マウスクリックを一切使わない.
  await page.keyboard.press("Enter");

  // 起票が完了したかは a11y form locator 経由で待たず, タスク表示で確認する.
  // (フォームは成功で auto-close されるため form 自体が消える / AC-8.)
  void createFormLocator(page, "today");

  // BL-070 追従: タスク名は <input aria-label="{name} の名前" value={name}> として表示される.
  await expect(page.getByLabel(`${taskName} の名前`)).toHaveValue(taskName);
});
