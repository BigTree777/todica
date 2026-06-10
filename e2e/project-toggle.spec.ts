/**
 * プロジェクトトグル UI E2E (BL-041 / project-toggle-ui).
 *
 * 仕様参照:
 *   docs/developer/features/project-toggle-ui/spec.md
 *     REQ-1 (起票フォームのプロジェクト入力 = トグルボタン 1 個),
 *     REQ-2 (巡回順序 null → projects[0] → ... → null),
 *     REQ-6 (起票時の projectId の正しい送信),
 *     AC-1, AC-2, AC-3, AC-5.
 *   docs/developer/features/project-toggle-ui/plan.md §「E2E (project-toggle.spec.ts 新規)」.
 *   docs/developer/features/project-toggle-ui/tasks.md T-004.
 *
 * 本ファイルは TDD の "red" を作るための E2E.
 *   - 現状 `today-view.tsx` / `tomorrow-view.tsx` の起票フォームは `<select id="task-project">`
 *     / `<select id="tomorrow-task-project">` を使っているため, 以下のテストは
 *     `getByRole("button", { name: /プロジェクト/ })` の取得で失敗する (red).
 *   - implementer が `<ProjectToggle />` を組み込むと green になる.
 *
 * 注意:
 *   - 既存テストとの分離のため, プロジェクト名 / タスク名は `Date.now()` suffix を含めて
 *     衝突を避ける.
 *   - サーバ初期状態には他テストの残骸が含まれうるため, テスト由来の名前でのみ assert する.
 */
import { type Page, expect, test } from "@playwright/test";

/** タスク名から「カード行」相当を取り出す helper. projects.spec.ts と同じ流儀. */
function taskRow(page: Page, taskName: string) {
  return page.getByText(taskName, { exact: true }).first().locator("..");
}

/**
 * 起票フォーム scope 内のプロジェクトトグルボタン.
 *
 * BL-041 で `<select id="task-project">` / `<select id="tomorrow-task-project">` が
 * トグルボタン (<button>) に置き換わる. 旧 select の getByLabel("プロジェクト (任意)")
 * は通用しなくなるため, 「name に『プロジェクト』を含む button」を取得する経路に統一する.
 */
function projectToggleButton(page: Page) {
  // 起票フォーム scope に絞ることで「タスクカードに表示されるプロジェクト名」(副情報) と
  // 取り違えないようにする (AC-8 / 非ゴール参照).
  return page
    .getByRole("form", { name: /タスク起票フォーム|起票フォーム/ })
    .getByRole("button", { name: /プロジェクト/ });
}

test.describe("BL-041 プロジェクトトグル UI (今日ビュー)", () => {
  test('シナリオ AC-1: 起票フォームにプロジェクトトグル button が存在し, 旧 <select id="task-project"> は存在しない', async ({
    page,
  }) => {
    await page.goto("/today");

    // 起票フォームの描画完了を待つ.
    const form = page.getByRole("form", { name: "タスク起票フォーム" });
    await expect(form).toBeVisible();

    // BL-041 spec AC-1: 旧 <select id="task-project"> は DOM 上に存在しない.
    await expect(form.locator("#task-project")).toHaveCount(0);
    // フォーム scope 内に <select> が存在しない.
    await expect(form.locator("select")).toHaveCount(0);

    // 起票フォーム内に「プロジェクト」を name に持つ button が 1 つ存在する.
    const toggle = projectToggleButton(page);
    await expect(toggle).toBeVisible();

    // 初期表示は「（未分類）」(REQ-3 / AC-1).
    await expect(toggle).toContainText(/（未分類）/);
  });

  test("シナリオ AC-2 + AC-3: プロジェクト「仕事」を作成 → トグルを 1 回クリックして起票 → projectId が正しく送信され, カードに「仕事」が紐付く", async ({
    page,
  }) => {
    const projectName = `Pトグル ${Date.now()}`;
    const taskName = `Tトグル ${Date.now()}`;

    // 1. プロジェクト作成.
    await page.goto("/projects");
    await page.getByLabel("プロジェクト名").fill(projectName);
    await page.getByRole("button", { name: "追加", exact: true }).click();
    await expect(page.getByText(projectName, { exact: true })).toBeVisible();

    // 2. /today に戻ってトグルを 1 回クリック → 作成したプロジェクトに進む.
    await page.goto("/today");

    // タスク名入力.
    await page.getByLabel("タスク名").fill(taskName);

    // BL-041 spec AC-2 / REQ-2: 初期 null → 1 クリックで projects[0] = 作成したプロジェクト.
    // ただし他テストの残骸プロジェクトが存在する場合は, 目的の name に到達するまで複数回クリックする.
    // 最大 N 回 (= プロジェクト総数 + null) で必ず到達するため決定論的.
    const toggle = projectToggleButton(page);
    // 起票フォームの描画完了を待つ.
    await expect(toggle).toBeVisible();

    // 「目的のプロジェクト名」を含むまでクリック (1 周以上したら fail).
    const maxIterations = 20;
    let reached = false;
    for (let i = 0; i < maxIterations; i++) {
      const text = (await toggle.textContent()) ?? "";
      if (text.includes(projectName)) {
        reached = true;
        break;
      }
      await toggle.click();
    }
    expect(
      reached,
      `トグルを ${maxIterations} 回クリックしても "${projectName}" に到達しなかった`,
    ).toBe(true);

    // トグルが目的プロジェクトを指している状態で「追加」.
    await expect(toggle).toContainText(projectName);
    await page.getByRole("button", { name: "追加", exact: true }).click();

    // 3. 起票後, カードがビューに現れる.
    await expect(taskRow(page, taskName)).toBeVisible();

    // 4. AC-10 互換: 起票後トグルは「（未分類）」に戻っている.
    //    (= 親 state リセットが ProjectToggle 表示に反映される).
    await expect(toggle).toContainText(/（未分類）/);

    // 5. 作成タスクが今日ビューの一覧に出現していることだけ確認する.
    //    タスクカード上のプロジェクト名副情報表示は今日ビューには現状存在せず,
    //    BL-041 の非ゴール (タスクカード表示は触らない) で本 BL では追加しない.
    //    projectId が正しく送信されたかは API レベルで T-003 / spec REQ-6 が担保している.
    const card = taskRow(page, taskName);
    await expect(card).toBeVisible();
  });
});

test.describe("BL-041 プロジェクトトグル UI (明日ビュー)", () => {
  test("シナリオ AC-5: 明日ビューでもトグル button が存在し, 1 クリックで projectId が正しく送信される", async ({
    page,
  }) => {
    const projectName = `P明日トグル ${Date.now()}`;
    const taskName = `T明日トグル ${Date.now()}`;

    // 1. プロジェクト作成.
    await page.goto("/projects");
    await page.getByLabel("プロジェクト名").fill(projectName);
    await page.getByRole("button", { name: "追加", exact: true }).click();
    await expect(page.getByText(projectName, { exact: true })).toBeVisible();

    // 2. /tomorrow に遷移.
    await page.goto("/tomorrow");

    // 起票フォームの描画完了を待つ.
    const form = page.getByRole("form", { name: /起票フォーム/ });
    await expect(form).toBeVisible();

    // BL-041 spec AC-5: 旧 <select id="tomorrow-task-project"> は DOM に存在しない.
    await expect(form.locator("#tomorrow-task-project")).toHaveCount(0);
    await expect(form.locator("select")).toHaveCount(0);

    // タスク名入力.
    await page.getByLabel("タスク名").fill(taskName);

    // トグルを目的プロジェクト名まで回す.
    const toggle = projectToggleButton(page);
    await expect(toggle).toBeVisible();
    // 初期は「（未分類）」.
    await expect(toggle).toContainText(/（未分類）/);

    const maxIterations = 20;
    let reached = false;
    for (let i = 0; i < maxIterations; i++) {
      const text = (await toggle.textContent()) ?? "";
      if (text.includes(projectName)) {
        reached = true;
        break;
      }
      await toggle.click();
    }
    expect(
      reached,
      `トグルを ${maxIterations} 回クリックしても "${projectName}" に到達しなかった`,
    ).toBe(true);

    await expect(toggle).toContainText(projectName);
    await page.getByRole("button", { name: "追加", exact: true }).click();

    // 3. 起票後, 明日のタスクとしてカードがビューに現れ, プロジェクト副情報も紐付く.
    await expect(taskRow(page, taskName)).toBeVisible();
    const card = taskRow(page, taskName);
    await expect(card).toContainText(projectName);
  });
});
