/**
 * 設定 E2E スモーク (BL-026 / BL-009).
 *
 * 検証する happy path:
 *   1. 境界時刻を変更 → 保存 → 表示が更新される (PATCH /api/v1/settings)
 *
 * 境界時刻変更が /today の挙動 (未完了タスクの繰越タイミング) に与える影響は
 * 現在時刻と境界時刻の前後関係に依存するため, ここでは設定値の更新が UI と
 * 永続化レイヤに到達することのみを確認する.
 */
import { expect, test } from "@playwright/test";

test("境界時刻を変更すると表示が更新される", async ({ page }) => {
  await page.goto("/settings");

  // 既存値を変更後と区別するため, 現在表示値と異なる時刻を選ぶ.
  const settingsValue = page.getByLabel("設定値");
  const currentValue = (await settingsValue.textContent())?.trim();
  const newValue = currentValue === "05:30" ? "06:00" : "05:30";

  await page.getByLabel("境界時刻").fill(newValue);
  await page.getByRole("button", { name: "保存" }).click();

  await expect(settingsValue).toHaveText(newValue);
});
