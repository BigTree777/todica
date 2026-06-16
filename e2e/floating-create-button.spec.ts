/**
 * 起票カード + ボタン展開式 E2E (BL-104 / floating-create-button).
 *
 * 仕様参照:
 *   docs/developer/features/floating-create-button/spec.md AC-1〜AC-11.
 *   docs/developer/features/floating-create-button/plan.md D-001〜D-006.
 *
 * 本ファイルが検証する受け入れ基準:
 *   AC-3:  /focus, /settings, /trash で + ボタンが描画されない.
 *   AC-4:  /today で + を押すと TaskFormCard が展開し, 先頭 input に focus が移る.
 *   AC-5:  /tomorrow / /projects / /routines でも + → 対応フォーム展開が同様に動く.
 *   AC-6:  キャンセルボタン押下でフォームが閉じ, + に focus が戻る.
 *   AC-7:  Escape でフォームが閉じ, + に focus が戻る.
 *   AC-8:  起票成功でフォームが自動 close される + 一覧に新規行が現れる.
 *   AC-9:  起票失敗時にフォームと入力値が保持される.
 *   AC-10: + / 更新 / ハンバーガーの座標が重ならない (jsdom 不可な部分).
 *   AC-11: 4 ビューの起票フォームが初期状態で描画されない (常時表示の撤去).
 *
 * 本ファイルで扱わない受け入れ基準:
 *   AC-1 / AC-2 / AC-10 後半 / + ボタンの aria-label 詳細: 単体テスト
 *     (web/__tests__/floating-create-button.test.tsx) で扱う.
 *
 * 設計意図:
 *   - ヘルパは e2e/helpers/floating-create-button.ts に切り出してある (= 各 spec で
 *     重複させない). 本ファイルは AC-3〜AC-11 を「初めから + で開く」フローに統一する.
 *   - AC-9 (起票失敗保持) は route handler で /api/v1/tasks POST に 500 を返すことで
 *     再現する.
 */
import { expect, test } from "@playwright/test";
import {
  CREATE_BUTTON_ARIA_LABELS,
  createFormLocator,
  floatingCreateButton,
  openCreateForm,
} from "./helpers/floating-create-button.js";

const API_BASE = "http://localhost:3000";

// ============================================================
// AC-11: 4 ビューで起票フォームが初期描画されない (常時表示撤去)
// ============================================================

test.describe("BL-104 AC-11: 起票フォームの初期描画", () => {
  // path ごとに明示展開する (Playwright には Vitest の test.each が無い).
  const cases = [
    { path: "/today", formName: /^タスク起票フォーム$/ },
    { path: "/tomorrow", formName: /^(明日のタスク起票フォーム|タスク起票フォーム)$/ },
    { path: "/projects", formName: /^プロジェクト(作成|起票)フォーム$/ },
    { path: "/routines", formName: /^ルーティン(作成|起票)フォーム$/ },
  ];
  for (const { path, formName } of cases) {
    test(`${path} の初期状態では起票フォーム (${formName}) が DOM 上に存在しない`, async ({
      page,
    }) => {
      await page.goto(path);

      // + ボタンは存在する (= ルートは表示対象).
      await expect(
        page.getByRole("button", { name: /タスクを追加|プロジェクトを追加|ルーティンを追加/ }),
      ).toBeVisible();

      // 起票フォームは描画されていない.
      await expect(page.getByRole("form", { name: formName })).toHaveCount(0);
    });
  }
});

// ============================================================
// AC-3: + ボタンの非表示ルート (focus / settings / trash)
// ============================================================

test.describe("BL-104 AC-3: + ボタンが表示されないルート", () => {
  // path ごとに明示展開する (Playwright test.each は signature が test と異なるため,
  // 個別 test で書いた方が型エラーに巻き込まれにくい).
  test("/focus で + ボタンが存在しない", async ({ page }) => {
    await page.goto("/focus");
    await expect(page.locator(".app-shell__create")).toHaveCount(0);
    // aria-label からも到達できない.
    for (const label of Object.values(CREATE_BUTTON_ARIA_LABELS)) {
      await expect(page.getByRole("button", { name: label })).toHaveCount(0);
    }
  });

  test("/settings で + ボタンが存在しない", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.locator(".app-shell__create")).toHaveCount(0);
  });

  test("/trash で + ボタンが存在しない", async ({ page }) => {
    await page.goto("/trash");
    await expect(page.locator(".app-shell__create")).toHaveCount(0);
  });
});

// ============================================================
// AC-4 / AC-5: + 押下でフォーム展開 + 先頭 input に focus
// ============================================================

test.describe("BL-104 AC-4 / AC-5: + 押下でフォーム展開と focus 移動", () => {
  test("/today で + を押すと TaskFormCard が出て タスク名 input に focus が移る", async ({
    page,
  }) => {
    await page.goto("/today");
    await openCreateForm(page, "today");

    const form = createFormLocator(page, "today");
    const nameInput = form.getByLabel(/タスク名/);
    await expect(nameInput).toBeFocused();
  });

  test("/tomorrow で + を押すと TaskFormCard が出て タスク名 input に focus が移る", async ({
    page,
  }) => {
    await page.goto("/tomorrow");
    await openCreateForm(page, "tomorrow");

    const form = createFormLocator(page, "tomorrow");
    const nameInput = form.getByLabel(/タスク名/);
    await expect(nameInput).toBeFocused();
  });

  test("/projects で + を押すと ProjectFormCard が出て プロジェクト名 input に focus が移る", async ({
    page,
  }) => {
    await page.goto("/projects");
    await openCreateForm(page, "projects");

    const form = createFormLocator(page, "projects");
    const nameInput = form.getByLabel("プロジェクト名");
    await expect(nameInput).toBeFocused();
  });

  test("/routines で + を押すと RoutineFormCard が出て ルーティン名 input に focus が移る", async ({
    page,
  }) => {
    await page.goto("/routines");
    await openCreateForm(page, "routines");

    const form = createFormLocator(page, "routines");
    const nameInput = form.getByLabel("ルーティン名");
    await expect(nameInput).toBeFocused();
  });
});

// ============================================================
// AC-6: キャンセルボタンで閉じる + + に focus 復帰
// ============================================================

test.describe("BL-104 AC-6: キャンセルボタンで閉じる", () => {
  test("/today でキャンセルを押すと TaskFormCard が消え + に focus が戻り 再開で空になる", async ({
    page,
  }) => {
    await page.goto("/today");
    await openCreateForm(page, "today");

    const form = createFormLocator(page, "today");
    const nameInput = form.getByLabel(/タスク名/);
    await nameInput.fill("一時入力テキスト");

    // 「キャンセル」ボタンを押す (REQ-5).
    await form.getByRole("button", { name: "キャンセル" }).click();

    // フォームが消える.
    await expect(createFormLocator(page, "today")).toHaveCount(0);
    // aria-expanded が false に戻る.
    const button = floatingCreateButton(page, "today");
    await expect(button).toHaveAttribute("aria-expanded", "false");
    // + ボタンに focus が戻る (REQ-13 / D-005).
    await expect(button).toBeFocused();

    // 再度 + を押すと入力欄は空である (REQ-9).
    await openCreateForm(page, "today");
    await expect(createFormLocator(page, "today").getByLabel(/タスク名/)).toHaveValue("");
  });
});

// ============================================================
// AC-7: Escape で閉じる + + に focus 復帰
// ============================================================

test.describe("BL-104 AC-7: Escape キーで閉じる", () => {
  test("/today で Escape を押すと TaskFormCard が消え + に focus が戻る", async ({ page }) => {
    await page.goto("/today");
    await openCreateForm(page, "today");

    // 先頭 input に focus が当たっている前提で Escape を押す.
    await page.keyboard.press("Escape");

    await expect(createFormLocator(page, "today")).toHaveCount(0);
    const button = floatingCreateButton(page, "today");
    await expect(button).toHaveAttribute("aria-expanded", "false");
    await expect(button).toBeFocused();
  });
});

// ============================================================
// AC-8: 起票成功で自動 close
// ============================================================

test.describe("BL-104 AC-8: 起票成功でフォームが自動 close される", () => {
  test("/today で + → 入力 → 「追加」で TaskFormCard が消え 一覧に新規行が出る", async ({
    page,
  }) => {
    await page.goto("/today");
    await openCreateForm(page, "today");

    const taskName = `BL104自動close ${Date.now()}`;
    const form = createFormLocator(page, "today");
    await form.getByLabel(/タスク名/).fill(taskName);
    await form.getByRole("button", { name: "追加", exact: true }).click();

    // フォームが消える (D-004 自動 close).
    await expect(createFormLocator(page, "today")).toHaveCount(0);
    // + ボタンの aria-expanded が false に戻る.
    await expect(floatingCreateButton(page, "today")).toHaveAttribute("aria-expanded", "false");
    // 一覧に新規行が現れる.
    await expect(page.getByLabel(`${taskName} の名前`).first()).toHaveValue(taskName);

    // 再度 + を押すと入力欄は空 (REQ-9).
    await openCreateForm(page, "today");
    await expect(createFormLocator(page, "today").getByLabel(/タスク名/)).toHaveValue("");
  });
});

// ============================================================
// AC-9: 起票失敗でフォームと入力値が保持される
// ============================================================

test.describe("BL-104 AC-9: 起票失敗でフォームと入力値が保持される", () => {
  test("/today でサーバが 500 を返すとフォームと入力値が残る", async ({ page }) => {
    // POST /api/v1/tasks に 500 を返すルートハンドラを差し込む.
    await page.route(`${API_BASE}/api/v1/tasks`, async (route) => {
      const request = route.request();
      if (request.method() === "POST") {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: "internal" }),
        });
        return;
      }
      await route.continue();
    });

    await page.goto("/today");
    await openCreateForm(page, "today");

    const form = createFormLocator(page, "today");
    const nameInput = form.getByLabel(/タスク名/);
    const taskName = `BL104失敗保持 ${Date.now()}`;
    await nameInput.fill(taskName);
    await form.getByRole("button", { name: "追加", exact: true }).click();

    // フォームは閉じない (REQ-8).
    await expect(createFormLocator(page, "today")).toBeVisible();
    // 入力値も保持されている.
    await expect(createFormLocator(page, "today").getByLabel(/タスク名/)).toHaveValue(taskName);
  });
});

// ============================================================
// AC-10: + / 更新 / ハンバーガーの 3 ボタン座標
// ============================================================

test.describe("BL-104 AC-10: 3 ボタンの座標が重ならない", () => {
  /**
   * シナリオ AC-10 前半:
   *   /today で + ボタンは「更新ボタンの左」かつ「重ならない」.
   *   AC-10 後半: /focus に切り替えても更新ボタンの座標は /today の時と同じ.
   *
   * boundingBox を実ブラウザで取って横軸 (x) の関係を assert する.
   */
  test("/today で + は更新ボタンの左にあり, 互いに重ならない", async ({ page }) => {
    await page.goto("/today");

    const create = floatingCreateButton(page, "today");
    const reload = page.getByLabel("アップデートを確認して再読み込み");
    await expect(create).toBeVisible();
    await expect(reload).toBeVisible();

    const createBox = await create.boundingBox();
    const reloadBox = await reload.boundingBox();
    expect(createBox).not.toBeNull();
    expect(reloadBox).not.toBeNull();
    if (!createBox || !reloadBox) return;

    // + の右端 ≤ 更新の左端 (= 重ならない & + が左).
    expect(createBox.x + createBox.width).toBeLessThanOrEqual(reloadBox.x);
  });

  test("/today → /focus で更新ボタンの x 座標が変わらない", async ({ page }) => {
    await page.goto("/today");
    const reloadOnToday = await page.getByLabel("アップデートを確認して再読み込み").boundingBox();
    expect(reloadOnToday).not.toBeNull();

    // ハンバーガー経由で /focus に遷移する.
    await page.goto("/focus");
    const reloadOnFocus = await page.getByLabel("アップデートを確認して再読み込み").boundingBox();
    expect(reloadOnFocus).not.toBeNull();
    if (!reloadOnToday || !reloadOnFocus) return;

    // 同じ x 座標を持つ (REQ-15 / AC-10 後半).
    expect(reloadOnFocus.x).toBeCloseTo(reloadOnToday.x, 0);
  });
});

// ============================================================
// スモーク: + 押下後の aria-expanded 観察 (失敗の切り分け用)
// ============================================================

test.describe("BL-104 + ボタンのスモーク", () => {
  /**
   * + ボタンを押した後の aria-expanded 観察を 1 回だけ通しで行う.
   * 失敗の原因切り分け (= フォーム展開以前か, 展開後か) のためのスモーク.
   */
  test("/today で + 押下後に aria-expanded='true' になる", async ({ page }) => {
    await page.goto("/today");
    const button = floatingCreateButton(page, "today");
    await expect(button).toHaveAttribute("aria-expanded", "false");
    await button.click();
    await expect(button).toHaveAttribute("aria-expanded", "true");
  });
});
