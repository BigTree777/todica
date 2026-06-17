/**
 * 既存 4 view (settings/trash/routines/projects) のスタイル統一 E2E (BL-045 / secondary-views-shell).
 *
 * 仕様参照:
 *   docs/developer/features/secondary-views-shell/spec.md §「受け入れ基準」.
 *   docs/developer/features/secondary-views-shell/plan.md §「テスト方針」.
 *   docs/developer/features/secondary-views-shell/tasks.md T-1.
 *
 * 本ファイルが検証する受け入れ基準:
 *   - AC-2: 4 view の <main> に view ルートクラス (BEM) が付与されている.
 *   - AC-3: 4 view の <h1> の computed font-size が /tomorrow の <h1> と同値 (24px) である.
 *   - AC-4: 作成 / 設定フォームが角丸枠 (border-radius 12px / border 1px solid, /tomorrow と同値).
 *   - AC-5: trash / routines / projects のリスト項目が角丸カード, 親 ul は list-style-type: none.
 *   - AC-6: /trash の header 内に H1「ゴミ箱」と button「ゴミ箱を空にする」が同居し, 挙動は不変.
 *   - AC-7: 空状態「ゴミ箱は空です」が text-align: center / color: rgb(89, 89, 89) (#595959).
 *
 * 本ファイルで扱わない受け入れ基準 (担保方法が別):
 *   - AC-1 / AC-8: 既存 E2E (sidebar-nav.spec.ts ほか全 spec) と既存単体テストの無改修 green 維持.
 *   - AC-9: e2e/a11y.spec.ts の全 8 スキャン green 維持.
 *   - AC-10: plan.md §「テスト方針」により CI 化しない (auditor の grep チェック項目).
 *
 * 本ファイルは TDD の "red" を作るための E2E.
 *   - 現状 4 view は素の HTML (className / view 専用 CSS なし) のため, 以下は全て失敗する.
 *   - implementer が各 view への CSS 追加 + className 付与 + trash の <header> 化で green 化する.
 *
 * 設計メモ:
 *   - 「/tomorrow と同値」の比較は, /tomorrow で取得した computed style の実値を期待値にする
 *     (plan.md §「重要な決定」: BL-046 のトークン置換で値が変わってもテストが追従する).
 *     ただし /tomorrow 側の実値が仕様の暫定値 (24px / 12px) であることのサニティ確認も行い,
 *     /tomorrow が未スタイルに退行した場合に等値比較だけが空振り green になることを防ぐ.
 *   - 盤面づくりは API 直叩き (tomorrow-view.spec.ts と同じヘルパー慣行).
 *   - 要素の特定はテスト固有の名前 (`Date.now()` suffix) で行い, FakeClock 凍結下の
 *     並び順 tie-break (BL-043 の教訓) に依存しない.
 */
import { type APIRequestContext, expect, type Locator, test } from "@playwright/test";
import { getApiAuthHeader } from "./helpers/api-auth.js";

const API_BASE = "http://localhost:3000";

/** 4 view の一覧 (AC-2 / AC-3 で共用). */
const VIEWS = [
  { path: "/settings", rootClass: "settings-view", heading: "設定" },
  { path: "/trash", rootClass: "trash-view", heading: "ゴミ箱" },
  { path: "/routines", rootClass: "routines-view", heading: "ルーティン" },
  { path: "/projects", rootClass: "projects-view", heading: "プロジェクト" },
] as const;

/** locator の computed style から指定プロパティを取得する. */
async function computedStyle(
  locator: Locator,
  properties: readonly string[],
): Promise<Record<string, string>> {
  return locator.evaluate(
    (el, props) => {
      const style = window.getComputedStyle(el);
      return Object.fromEntries(props.map((p) => [p, style.getPropertyValue(p)]));
    },
    [...properties],
  );
}

// BL-061 (routine-card-component) 追従: /routines は AC-5 から除外したため seedRoutine ヘルパは撤去.

/** API 直叩きでタスクを起票し, すぐ削除してゴミ箱送りの状態を作る. */
async function seedTrashedTask(
  request: APIRequestContext,
  authHeader: { Authorization: string },
  name: string,
): Promise<void> {
  const id = crypto.randomUUID();
  const created = await request.post(`${API_BASE}/api/v1/tasks`, {
    headers: { ...authHeader, "Idempotency-Key": crypto.randomUUID() },
    data: { id, name, dueDate: "today", priority: "normal" },
  });
  expect(created.ok()).toBe(true);
  const body = (await created.json()) as { task: { version: number } };
  const deleted = await request.delete(`${API_BASE}/api/v1/tasks/${id}`, {
    headers: {
      ...authHeader,
      "Idempotency-Key": crypto.randomUUID(),
      "If-Match": String(body.task.version),
    },
  });
  expect(deleted.ok()).toBe(true);
}

/** API 直叩きでゴミ箱を空にする (AC-7 の前提: 空状態を確実に作る). */
async function emptyTrash(
  request: APIRequestContext,
  authHeader: { Authorization: string },
): Promise<void> {
  const res = await request.delete(`${API_BASE}/api/v1/trash`, {
    headers: { ...authHeader, "Idempotency-Key": crypto.randomUUID() },
  });
  expect(res.ok()).toBe(true);
}

test.describe("secondary-views-shell (BL-045) のスタイル統一", () => {
  test("AC-2: 4 view の <main> に view ルートクラスが付与されている", async ({ page }) => {
    for (const view of VIEWS) {
      await page.goto(view.path);
      await expect(page.getByRole("heading", { name: view.heading, level: 1 })).toBeVisible();
      // class 属性に BEM ルートクラスを「単語として」含む (部分文字列の偶然一致を排除).
      await expect(page.locator("main")).toHaveClass(new RegExp(`(^|\\s)${view.rootClass}(\\s|$)`));
    }
  });

  test("AC-3: 4 view の <h1> の font-size が /tomorrow の <h1> と同値である", async ({ page }) => {
    // Given: /tomorrow の <h1> の computed font-size を期待値として記録する.
    await page.goto("/tomorrow");
    const tomorrowH1 = page.getByRole("heading", { name: "明日", level: 1 });
    await expect(tomorrowH1).toBeVisible();
    const expected = (await computedStyle(tomorrowH1, ["font-size"]))["font-size"];
    // サニティ: 参照基準の /tomorrow が仕様の暫定値 24px であること (spec.md AC-3 の括弧書き).
    expect(expected).toBe("24px");

    // When / Then: 4 view の <h1> が同値である.
    for (const view of VIEWS) {
      await page.goto(view.path);
      const h1 = page.getByRole("heading", { name: view.heading, level: 1 });
      await expect(h1).toBeVisible();
      const actual = (await computedStyle(h1, ["font-size"]))["font-size"];
      expect(actual, `${view.path} の <h1> font-size`).toBe(expected);
    }
  });

  test("AC-4: 作成 / 設定フォームが角丸枠 (--radius-md = 12px) で表示される (BL-059 / BL-060 / BL-061 追従)", async ({
    page,
  }) => {
    // BL-059 追従: 旧テストは「/tomorrow 起票フォームと同値 (= --radius-md = 12px)」を
    // verify していたが, BL-059 で /tomorrow 起票は <TaskFormCard> (= .task-card 系) に
    // 置換され, border-radius: var(--radius-lg) = 16px に変わった (D-001 系統間独立).
    // BL-060 追従: 同様に /projects 作成フォームも <ProjectFormCard> (= .project-card 系) に
    // 置換され, border-radius: var(--radius-lg) = 16px に変わった (D-001 系統間独立).
    // BL-061 追従: 同様に /routines 作成フォームも <RoutineFormCard> (= .routine-card 系) に
    // 置換され, border-radius: var(--radius-lg) = 16px に変わった (D-001 系統間独立 / D-013).
    // 本テストは secondary-views フォーム同士が引き続き --radius-md = 12px で揃っている
    // ことの確認に再設計する (現時点では settings のみ対象).
    const expectedRadius = "12px";

    // When / Then: 各フォームが border-radius 12px / border 1px solid.
    // settings はネイティブ専用セクションを除く境界時刻フォームのみ対象 (spec.md U-1).
    const forms = [{ path: "/settings", formName: "設定フォーム" }] as const;
    for (const target of forms) {
      await page.goto(target.path);
      const form = page.getByRole("form", { name: target.formName });
      await expect(form).toBeVisible();
      const style = await computedStyle(form, [
        "border-radius",
        "border-top-width",
        "border-top-style",
      ]);
      expect(style["border-radius"], `${target.formName} の border-radius`).toBe(expectedRadius);
      expect(style["border-top-width"], `${target.formName} の border 幅`).toBe("1px");
      expect(style["border-top-style"], `${target.formName} の border スタイル`).toBe("solid");
    }
  });

  test("AC-5: trash のリスト項目が角丸カードで表示される (BL-060 / BL-061 追従)", async ({
    page,
    request,
  }) => {
    // BL-060 追従: /projects の <li> は <ProjectCard> (= .project-card 系) に置換され,
    // border-radius: var(--radius-lg) = 16px に変わった (D-001 系統間独立).
    // BL-061 追従: /routines の <li> も <RoutineCard> (= .routine-card 系) に置換され,
    // border-radius: var(--radius-lg) = 16px に変わった (D-001 系統間独立 / D-013).
    // 本テストは secondary-views リスト項目同士が引き続き --radius-md = 12px で
    // 揃っていることの確認に再設計する (現時点では trash のみ対象).
    // Given: 各 view に 1 件以上の項目を API 直叩きで用意する.
    const authHeader = await getApiAuthHeader(request, API_BASE);
    const suffix = Date.now();
    const trashedName = `STYLEゴミ箱カード ${suffix}`;
    await seedTrashedTask(request, authHeader, trashedName);

    const targets = [{ path: "/trash", itemText: trashedName }] as const;

    for (const target of targets) {
      await page.goto(target.path);
      const item = page.locator("main").getByRole("listitem").filter({ hasText: target.itemText });
      await expect(item).toBeVisible();

      // When / Then: li が角丸カード (border-radius 12px / border 1px solid).
      const itemStyle = await computedStyle(item, [
        "border-radius",
        "border-top-width",
        "border-top-style",
      ]);
      expect(itemStyle["border-radius"], `${target.path} の li border-radius`).toBe("12px");
      expect(itemStyle["border-top-width"], `${target.path} の li border 幅`).toBe("1px");
      expect(itemStyle["border-top-style"], `${target.path} の li border スタイル`).toBe("solid");

      // かつ: 親 ul にリストマーカーが表示されない (list-style-type: none).
      const ulListStyleType = await item.evaluate((el) => {
        const ul = el.closest("ul");
        return ul ? window.getComputedStyle(ul).listStyleType : null;
      });
      expect(ulListStyleType, `${target.path} の ul list-style-type`).toBe("none");
    }
  });

  test("AC-6: /trash の header に H1 と「ゴミ箱を空にする」が同居し, クリックで空になる", async ({
    page,
    request,
  }) => {
    // Given: ゴミ箱にタスクが 1 件以上ある状態で /trash を開く.
    const authHeader = await getApiAuthHeader(request, API_BASE);
    const trashedName = `STYLEヘッダ ${Date.now()}`;
    await seedTrashedTask(request, authHeader, trashedName);
    await page.goto("/trash");
    await expect(
      page
        .getByRole("list", { name: "ゴミ箱のタスク一覧" })
        .getByRole("listitem")
        .filter({ hasText: trashedName }),
    ).toBeVisible();

    // Then: <main> 内の header に見出し「ゴミ箱」と button「ゴミ箱を空にする」が同居する.
    const header = page.locator("main header");
    await expect(header.getByRole("heading", { name: "ゴミ箱", level: 1 })).toBeVisible();
    const emptyButton = header.getByRole("button", { name: "ゴミ箱を空にする" });
    await expect(emptyButton).toBeVisible();

    // かつ: クリックでゴミ箱が空になる (既存挙動の維持. 確認ダイアログなしで実行される).
    await emptyButton.click();
    await expect(page.getByText("ゴミ箱は空です")).toBeVisible();
  });

  test("AC-7: 空状態「ゴミ箱は空です」が中央寄せ + #595959 で表示される", async ({
    page,
    request,
  }) => {
    // Given: ゴミ箱が空の状態で /trash を開く (前のテストの残骸を API で確実に除去する).
    const authHeader = await getApiAuthHeader(request, API_BASE);
    await emptyTrash(request, authHeader);
    await page.goto("/trash");
    const emptyText = page.getByText("ゴミ箱は空です");
    await expect(emptyText).toBeVisible();

    // When / Then: computed style が text-align: center / color: rgb(89, 89, 89) (#595959).
    const style = await computedStyle(emptyText, ["text-align", "color"]);
    expect(style["text-align"]).toBe("center");
    expect(style.color).toBe("rgb(89, 89, 89)");
  });
});
