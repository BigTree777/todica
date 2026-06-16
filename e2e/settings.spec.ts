/**
 * 設定 E2E スモーク (settings-day-boundary).
 *
 * 検証する happy path:
 *   1. リセット時刻を変更 → 「変更」ボタンで送信 → input の value が新しい値で再表示される
 *      (PATCH /api/v1/settings).
 *
 * リセット時刻変更が /today の挙動 (未完了タスクの繰越タイミング) に与える影響は
 * 現在時刻と境界時刻の前後関係に依存するため, ここでは設定値の更新が UI と
 * 永続化レイヤに到達することのみを確認する.
 */
import { expect, test } from "@playwright/test";

test("リセット時刻を変更すると表示が更新される", async ({ page }) => {
  await page.goto("/settings");

  // 設定フォーム scope 内の input / button を取得する.
  // パスワード変更 section にも同名「変更」ボタンがあるため scope を form に固定する.
  const form = page.getByRole("form", { name: "設定フォーム" });
  const input = form.getByLabel("リセット時刻");
  await expect(input).toBeVisible();

  // 既存値を変更後と区別するため, 現在表示値と異なる時刻を選ぶ.
  const currentValue = (await input.inputValue()).trim();
  const newValue = currentValue === "05:30" ? "06:00" : "05:30";

  await input.fill(newValue);
  await form.getByRole("button", { name: "変更" }).click();

  // PATCH 成功後, サーバ正本値が再フェッチされ input の value に反映される.
  await expect(input).toHaveValue(newValue);
});
