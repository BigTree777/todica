/**
 * ページリロード後の状態復元 E2E (BL-027).
 *
 * 検証する観点:
 *   1. 完了タスクのカウント (BL-008) — `/today` の `completionCount` 経路で復元される
 *   2. 明示的に設定したフォーカス対象タスク (BL-006) — `/focus` の `currentTaskId` 経路で復元される
 *   3. 境界時刻設定 (BL-009) — `/settings` の永続化が復元される
 *
 * 単体・統合テストでは「ページリロード」というブラウザの全 React state リセット
 * イベントを再現できず, サーバ側 state からの初期化経路が壊れていても検出できない.
 */
import { expect, type Page, test } from "@playwright/test";

function taskRow(page: Page, taskName: string) {
  // BL-057: タスクカードが 3 段ゾーン化されたため ancestor::li で <li> を取得.
  // BL-070 (inline-edit-all-cards) 追従: タスク名は <input aria-label="{name} の名前"> に入る.
  return page.getByLabel(`${taskName} の名前`).first().locator("xpath=ancestor::li");
}

test("リロード後も完了タスクのカウントが復元される", async ({ page }) => {
  // 先行する他 spec の完了が /today refetch でカウンタに反映され終えるのを待つ.
  // 初期ロード時の counter が「0 → サーバ正本値」と変化する間に beforeText を読むと,
  // 後続の完了で counter+1 ではなく +2 のように見える flaky を防ぐ.
  const todayResponsePromise = page.waitForResponse(
    (res) => res.url().includes("/api/v1/today") && res.status() === 200,
  );
  await page.goto("/");
  await todayResponsePromise;

  const taskName = `カウント復元 ${Date.now()}`;
  const countDisplay = page.getByLabel("今日の完了タスク数");

  // 既存テスト由来の累積を考慮し, before 値を読み取って delta で検証する.
  const beforeText = (await countDisplay.textContent()) ?? "";
  const beforeCount = Number.parseInt(beforeText.match(/今日の完了:\s*(\d+)/)?.[1] ?? "0", 10);
  const expectedAfter = `今日の完了: ${beforeCount + 1}`;

  await page.getByLabel("タスク名").fill(taskName);
  await page.getByRole("button", { name: "追加", exact: true }).click();
  await taskRow(page, taskName).getByRole("button", { name: "完了" }).click();
  await expect(countDisplay).toHaveText(expectedAfter);

  await page.reload();

  await expect(countDisplay).toHaveText(expectedAfter);
});

// BL-043 (set-focus-gesture) AC-4: 一覧カードの「現在のタスクにする」button (BL-042 で
// 撤去された「現在に設定」の後継) で明示設定した focus がリロード後も復元されることを
// 検証する. currentTaskId が DB に永続化されており, 暗黙フォールバック (並び先頭) では
// なく明示 focus 経路で復元されることの確認.
test("リロード後も明示的に設定したフォーカス対象が復元される (BL-043 で UI 再導入)", async ({
  page,
  request,
}) => {
  // ダミー (normal) + テスト対象 (later) の 2 件を作る. ダミーが nextTaskId
  // フォールバックを吸収し, テスト対象は「タスク一覧」側に来る.
  // setup は API 直叩きで行う. 起票フォームを連続使用すると, 前の handleCreate の
  // setName/setPriority リセットと次の fill/selectOption が交錯して priority が
  // "normal" に戻った状態で submit されるレース条件が起きるため.
  const focusName = `フォーカス復元 ${Date.now()}`;
  const apiBase = "http://localhost:3000";
  const authHeader = { Authorization: "Bearer dev-token" };

  await request.post(`${apiBase}/api/v1/tasks`, {
    headers: { ...authHeader, "Idempotency-Key": crypto.randomUUID() },
    data: { id: crypto.randomUUID(), name: `ダミー ${Date.now()}` },
  });
  await request.post(`${apiBase}/api/v1/tasks`, {
    headers: { ...authHeader, "Idempotency-Key": crypto.randomUUID() },
    data: { id: crypto.randomUUID(), name: focusName, priority: "later" },
  });

  await page.goto("/");

  // タスク一覧側に現れるまで待ち, 「現在のタスクにする」をクリック (BL-043 の新ラベル).
  // BL-070 追従: タスク名は input value に入るため hasText では matches しない.
  // aria-label 一致の input を持つ <li> でフィルタする.
  const list = page.getByRole("list", { name: "タスク一覧" });
  const listRow = list.getByRole("listitem").filter({
    has: page.getByLabel(`${focusName} の名前`),
  });
  await expect(listRow).toBeVisible();
  await listRow.getByRole("button", { name: "現在のタスクにする" }).click();

  // 「現在のタスク」セクションに移動.
  const focusedRegion = page.getByRole("region", { name: "現在のタスク" });
  // BL-070 追従: タスク名は input value に表示される.
  await expect(focusedRegion.getByLabel(`${focusName} の名前`)).toHaveValue(focusName);

  await page.reload();

  // リロード後も「現在のタスク」に残る = currentTaskId が DB に永続化されており
  // fallback ではなく明示 focus 経路で復元されている.
  await expect(focusedRegion.getByLabel(`${focusName} の名前`)).toHaveValue(focusName);
});

test("リロード後も保存した境界時刻設定が復元される", async ({ page }) => {
  await page.goto("/settings");
  const settingsValue = page.getByLabel("設定値");

  // 既存値と異なる時刻を入れる.
  const currentValue = (await settingsValue.textContent())?.trim();
  const newValue = currentValue === "23:45" ? "22:15" : "23:45";

  await page.getByLabel("境界時刻").fill(newValue);
  await page.getByRole("button", { name: "保存" }).click();
  await expect(settingsValue).toHaveText(newValue);

  await page.reload();

  await expect(settingsValue).toHaveText(newValue);
});
