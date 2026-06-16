/**
 * E2E 共通ヘルパ: 起票カード + ボタン展開式 (BL-104 / floating-create-button).
 *
 * 仕様参照:
 *   docs/developer/features/floating-create-button/spec.md AC-1〜AC-11.
 *   docs/developer/features/floating-create-button/plan.md D-001〜D-006.
 *
 * 役割:
 *   - 各 E2E spec で + ボタン押下 → 起票フォーム展開のフローを共通化する.
 *   - 「フォーム描画前に getByLabel("タスク名") 等を叩く」と element not found に
 *     なるため, 起票前に必ず本ヘルパで openCreateForm を呼ぶ.
 *   - aria-label はルートに応じて変化する (REQ-11 / D-006) ため, ルートごとの
 *     正規表現ベースで取得する.
 *
 * 注意:
 *   - 本ヘルパは BL-104 実装後に green になることが前提. 実装前は
 *     + ボタンが存在しないため `floatingCreateButton(page).click()` が
 *     タイムアウトで失敗する想定.
 */
import { expect, type Locator, type Page } from "@playwright/test";

/** + ボタンのルート別 aria-label. */
export const CREATE_BUTTON_ARIA_LABELS = {
  today: "タスクを追加",
  tomorrow: "タスクを追加",
  projects: "プロジェクトを追加",
  routines: "ルーティンを追加",
} as const;

export type CreateRouteKey = keyof typeof CREATE_BUTTON_ARIA_LABELS;

/**
 * 画面右上の + ボタン (`.app-shell__create`) を取得する.
 *
 * 取得は aria-label で行う (テストが DOM 構造に依存しすぎないようにする).
 */
export function floatingCreateButton(page: Page, route: CreateRouteKey): Locator {
  return page.getByRole("button", { name: CREATE_BUTTON_ARIA_LABELS[route] });
}

/**
 * + ボタンを押して起票フォームを展開する.
 *
 * 展開後, ルートに対応する form (`role="form"` + `aria-label`) が visible に
 * なるまで待つ. これにより呼出側は直後にフォーム内入力欄を fill できる.
 */
export async function openCreateForm(page: Page, route: CreateRouteKey): Promise<void> {
  const button = floatingCreateButton(page, route);
  await expect(button).toBeVisible();
  await button.click();
  await expect(button).toHaveAttribute("aria-expanded", "true");

  const form = createFormLocator(page, route);
  await expect(form).toBeVisible();
}

/**
 * 展開された起票フォーム (`<form aria-label="...">`) を取得する.
 *
 * - today / tomorrow: TaskFormCard (aria-label="タスク起票フォーム" /
 *   "明日のタスク起票フォーム")
 * - projects: ProjectFormCard (aria-label="プロジェクト作成フォーム")
 * - routines: RoutineFormCard (aria-label="ルーティン作成フォーム")
 */
export function createFormLocator(page: Page, route: CreateRouteKey): Locator {
  const name = formAriaLabelPattern(route);
  return page.getByRole("form", { name });
}

function formAriaLabelPattern(route: CreateRouteKey): RegExp {
  switch (route) {
    case "today":
      return /^タスク起票フォーム$/;
    case "tomorrow":
      return /^(明日のタスク起票フォーム|タスク起票フォーム)$/;
    case "projects":
      return /^プロジェクト(作成|起票)フォーム$/;
    case "routines":
      return /^ルーティン(作成|起票)フォーム$/;
  }
}
