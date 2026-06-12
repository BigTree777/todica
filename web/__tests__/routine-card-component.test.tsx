// @vitest-environment jsdom

/**
 * RoutineCard / RoutineFormCard コンポーネント新設 + routines-view 適用
 * (BL-061 / routine-card-component) 受け入れ基準テスト.
 *
 * 仕様参照:
 *   docs/developer/features/routine-card-component/spec.md
 *   docs/developer/features/routine-card-component/plan.md
 *   docs/developer/features/routine-card-component/tasks.md
 *
 * 本ファイルが検証する受け入れ基準:
 *   AC-1 : .routine-card 基底クラスが visual 4 宣言 + 1 段 flex 横並び layout を持つ (CSS 直読み).
 *   AC-2 : .routine-card--form が縦並び 2 段構成の override を持つ (CSS 直読み).
 *   AC-3 : .routine-card__main が左ブロックの flex 占有と縦並びを持つ (CSS 直読み).
 *   AC-4 : .routine-card__actions がボタン横並びを持つ (CSS 直読み).
 *   AC-5 : .routine-card__input が flex: 1 + placeholder 薄色を持つ (CSS 直読み).
 *   AC-6 : .routine-card__days-label が小さい字 + 薄色を持つ (CSS 直読み).
 *   AC-7 : .routine-card__day-checkboxes が wrap 横並びを持つ (CSS 直読み).
 *   AC-8 : .visually-hidden ユーティリティが routine-card.css に定義されている (CSS 直読み).
 *   AC-9 : <RoutineCard isEditing=false> が表示モードの DOM を出す (DOM レンダ).
 *   AC-10: <RoutineCard isEditing=true> が編集モードの DOM を出す (DOM レンダ).
 *   AC-11: <RoutineFormCard> が 2 段構成の作成フォームを描画する (DOM レンダ).
 *   AC-12: <RoutineFormCard> の input に placeholder「ルーティン名」が表示される (DOM レンダ).
 *   AC-13: 「変更」 button が「変更」ラベルで表示され「名称変更」 button が存在しない (DOM レンダ).
 *   AC-14: 曜日 checkbox label が「日」〜「土」のテキストを維持する (DOM レンダ).
 *   AC-15: routines-view.tsx が <RoutineCard> / <RoutineFormCard> を使う (ソース直読み).
 *   AC-16: 旧 .routines-view__form / __item / __days / __days-label / __actions が
 *          routines-view.css から撤去されている (CSS 直読み).
 *   AC-17: routines-view.css の維持セレクタが引き続き存在 (CSS 直読み).
 *   AC-18: tokens.css に本 BL で参照するトークンが引き続き定義されている (CSS 直読み).
 *   AC-19: RoutineRepository / mutation 経路が無改修である (ソース直読み).
 *   AC-20: label/input 関連付け (visually-hidden + htmlFor + id) が保持されている (DOM レンダ).
 *   AC-21: 作成 form / 編集 form の aria-label が保持されている (DOM レンダ).
 *   AC-22: .routine-card 系セレクタに box-shadow / transition / animation / :hover が無い (CSS 直読み).
 *   AC-23 / AC-24 / AC-25: 単体テスト全件 / E2E / a11y は本ファイルでは個別 assert せず,
 *          ルート npm test / npx playwright test の継続実行で担保する.
 *
 * 本ファイルは TDD の "red" を作るためのテスト.
 *   - 実装前 (= web/src/ui/routine-card/routine-card.tsx / routine-form-card.tsx /
 *     routine-card.css が存在せず, routines-view.tsx も旧クラスのまま) では,
 *     CSS 直読み系 (AC-1 〜 AC-8 / AC-16 / AC-22), DOM レンダ系 (AC-9 〜 AC-14 / AC-20 / AC-21),
 *     view 適用系 (AC-15) の大半が red になる想定.
 *   - 既存ファイル不変性系 (AC-17 / AC-18 / AC-19) は green が期待値.
 *   - implementer が REQ-1 〜 REQ-9 を実装することで red 群が green 化する.
 *
 * 検証スタイル:
 *   - CSS 直読み: BL-052 / BL-054 / BL-057 / BL-058 / BL-059 / BL-060 と同じ
 *     readFileSync + extractRuleBody (P-005). ヘルパは本ファイル内に再定義する.
 *   - DOM レンダ: BL-060 と同形の動的 import + render パターン.
 *
 * vitest-environment:
 *   DOM レンダ AC は jsdom 必須のため 1 ファイル全体を jsdom で動かす
 *   (= jsdom でも readFileSync は問題なく動く).
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { render, screen } from "@testing-library/react";
import type { ComponentType } from "react";
import { describe, expect, it, vi } from "vitest";

import type { WebRoutine } from "../src/repositories/routine-repository.js";

// ============================================================
// 共通定数 / パス解決
// ============================================================

const repoRoot = resolve(__dirname, "../..");
const webSrcRoot = resolve(repoRoot, "web/src");

// 新規 (本 BL で新設) ファイル群.
const routineCardCssPath = resolve(webSrcRoot, "ui/routine-card/routine-card.css");
const routineCardTsxPath = resolve(webSrcRoot, "ui/routine-card/routine-card.tsx");
const routineFormCardTsxPath = resolve(webSrcRoot, "ui/routine-card/routine-form-card.tsx");

// 既存ファイル群 (撤去 / 維持 / 無改修 の対象).
const routinesViewCssPath = resolve(webSrcRoot, "ui/routines-view/routines-view.css");
const routinesViewTsxPath = resolve(webSrcRoot, "ui/routines-view/routines-view.tsx");
const tokensCssPath = resolve(webSrcRoot, "styles/tokens.css");
const routineRepositoryTsPath = resolve(webSrcRoot, "repositories/routine-repository.ts");

const NOW = "2026-06-12T09:00:00.000Z";
const ROUTINE_ID_1 = "r1r1r1r1-r1r1-4r1r-8r1r-r1r1r1r1r1r1";

// ============================================================
// CSS ルール本文の抽出ヘルパ (P-005 / BL-060 等から再実装)
// ============================================================

/**
 * 指定したセレクタの「ルール本文 (= {} で囲まれた中身)」を抽出する.
 *
 * 単純な /selector\s*\{([^}]*)\}/ では `.routine-card` が `.routine-card--form` /
 * `.routine-card__name` 等の prefix にも一致してしまうため,
 * セレクタ末尾を `{` / 空白で厳密に区切る.
 */
function extractRuleBody(css: string, selector: string): string | null {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`, "m");
  const m = css.match(re);
  return m?.[1] ?? null;
}

// ============================================================
// テストフィクスチャ
// ============================================================

function makeRoutine(overrides: Partial<WebRoutine> = {}): WebRoutine {
  return {
    id: ROUTINE_ID_1,
    name: "朝の運動",
    daysOfWeek: [1, 3, 5], // 月水金
    defaultPriority: "normal",
    version: 1,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

// ============================================================
// 動的 import ヘルパ (実装前は routine-card.tsx が存在しないため async import)
// ============================================================

type RoutineCardModule = { RoutineCard: ComponentType<Record<string, unknown>> };
type RoutineFormCardModule = { RoutineFormCard: ComponentType<Record<string, unknown>> };

async function importRoutineCard(): Promise<RoutineCardModule> {
  const path = "../src/ui/routine-card/routine-card.js";
  return (await import(/* @vite-ignore */ path)) as RoutineCardModule;
}

async function importRoutineFormCard(): Promise<RoutineFormCardModule> {
  const path = "../src/ui/routine-card/routine-form-card.js";
  return (await import(/* @vite-ignore */ path)) as RoutineFormCardModule;
}

// ============================================================
// describe ブロック
// ============================================================

describe("RoutineCard / RoutineFormCard コンポーネント新設 (BL-061 / routine-card-component)", () => {
  // ============================================================
  // CSS 直読み系 (AC-1 〜 AC-8 / AC-22)
  // ============================================================

  // ----------------------------------------------------------
  // AC-1: .routine-card 基底クラスが visual 4 宣言 + 1 段 flex 横並び layout を持つ
  // ----------------------------------------------------------
  /**
   * シナリオ AC-1:
   *   Given web/src/ui/routine-card/routine-card.css を開いた
   *   When  .routine-card セレクタのルール本文を観察する
   *   Then  background: var(--color-bg) を含む
   *    かつ border: 1px solid var(--color-border) (または等価分解) を含む
   *    かつ border-radius: var(--radius-lg) を含む
   *    かつ padding: var(--space-md) を含む
   *    かつ display: flex を含む
   *    かつ flex-direction: row を含む (または flex-direction を持たず既定の row)
   *    かつ align-items: center を含む
   *    かつ gap: var(--space-sm) を含む
   */
  describe("AC-1: .routine-card 基底クラスが visual 4 宣言 + 1 段 flex 横並び layout を持つ", () => {
    it("routine-card.css が存在する", () => {
      expect(existsSync(routineCardCssPath)).toBe(true);
    });

    it(".routine-card ルール本文に background: var(--color-bg) を含む", () => {
      const css = readFileSync(routineCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".routine-card");
      expect(body, ".routine-card ルールが見つからない").not.toBeNull();
      expect(body ?? "").toMatch(/background(?:-color)?\s*:\s*var\(--color-bg\)/);
    });

    it(".routine-card ルール本文に border: 1px solid var(--color-border) (または等価分解) を含む", () => {
      const css = readFileSync(routineCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".routine-card");
      expect(body, ".routine-card ルールが見つからない").not.toBeNull();
      const bodyText = body ?? "";
      const hasShorthand = /border\s*:\s*1px\s+solid\s+var\(--color-border\)/.test(bodyText);
      const hasDecomposed =
        /border-width\s*:\s*1px/.test(bodyText) &&
        /border-style\s*:\s*solid/.test(bodyText) &&
        /border-color\s*:\s*var\(--color-border\)/.test(bodyText);
      expect(
        hasShorthand || hasDecomposed,
        ".routine-card に border: 1px solid var(--color-border) 等価宣言が無い",
      ).toBe(true);
    });

    it(".routine-card ルール本文に border-radius: var(--radius-lg) を含む", () => {
      const css = readFileSync(routineCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".routine-card");
      expect(body, ".routine-card ルールが見つからない").not.toBeNull();
      expect(body ?? "").toMatch(/border-radius\s*:\s*var\(--radius-lg\)/);
    });

    it(".routine-card ルール本文に padding: var(--space-md) を含む", () => {
      const css = readFileSync(routineCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".routine-card");
      expect(body, ".routine-card ルールが見つからない").not.toBeNull();
      // gap: var(--space-sm) と padding: var(--space-md) は別宣言.
      expect(body ?? "").toMatch(/(?:^|;|\n)\s*padding\s*:\s*var\(--space-md\)/);
    });

    it(".routine-card ルール本文に display: flex を含む", () => {
      const css = readFileSync(routineCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".routine-card");
      expect(body, ".routine-card ルールが見つからない").not.toBeNull();
      expect(body ?? "").toMatch(/display\s*:\s*flex/);
    });

    it(".routine-card ルール本文に flex-direction: row を含む (または flex-direction を持たない既定値)", () => {
      const css = readFileSync(routineCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".routine-card");
      expect(body, ".routine-card ルールが見つからない").not.toBeNull();
      const bodyText = body ?? "";
      // 基底に明示的に column が指定されていないこと.
      expect(
        bodyText,
        ".routine-card は基底で 1 段横並びのため flex-direction: column であってはならない",
      ).not.toMatch(/flex-direction\s*:\s*column/);
      // flex-direction: row が書かれているか, または書かれていない (既定値 row).
      const hasExplicitRow = /flex-direction\s*:\s*row/.test(bodyText);
      const hasNoFlexDirection = !/flex-direction\s*:/.test(bodyText);
      expect(
        hasExplicitRow || hasNoFlexDirection,
        ".routine-card に flex-direction: row が明示されているか, 宣言なし (既定値 row) であること",
      ).toBe(true);
    });

    it(".routine-card ルール本文に align-items: center を含む", () => {
      const css = readFileSync(routineCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".routine-card");
      expect(body, ".routine-card ルールが見つからない").not.toBeNull();
      expect(body ?? "").toMatch(/align-items\s*:\s*center/);
    });

    it(".routine-card ルール本文に gap: var(--space-sm) を含む", () => {
      const css = readFileSync(routineCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".routine-card");
      expect(body, ".routine-card ルールが見つからない").not.toBeNull();
      expect(body ?? "").toMatch(/gap\s*:\s*var\(--space-sm\)/);
    });
  });

  // ----------------------------------------------------------
  // AC-2: .routine-card--form が縦並び 2 段構成の override を持つ (V-1)
  // ----------------------------------------------------------
  /**
   * シナリオ AC-2:
   *   Given routine-card.css を開いた
   *   When  .routine-card--form セレクタのルール本文を観察する
   *   Then  flex-direction: column の宣言を含む
   *    かつ align-items: stretch の宣言を含む
   */
  describe("AC-2: .routine-card--form が縦並び 2 段構成の override を持つ (V-1)", () => {
    it(".routine-card--form ルール本文に flex-direction: column を含む", () => {
      const css = readFileSync(routineCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".routine-card--form");
      expect(body, ".routine-card--form ルールが見つからない").not.toBeNull();
      expect(body ?? "").toMatch(/flex-direction\s*:\s*column/);
    });

    it(".routine-card--form ルール本文に align-items: stretch を含む", () => {
      const css = readFileSync(routineCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".routine-card--form");
      expect(body, ".routine-card--form ルールが見つからない").not.toBeNull();
      expect(body ?? "").toMatch(/align-items\s*:\s*stretch/);
    });
  });

  // ----------------------------------------------------------
  // AC-3: .routine-card__main が左ブロックの flex 占有と縦並びを持つ (V-4 / V-5)
  // ----------------------------------------------------------
  /**
   * シナリオ AC-3:
   *   Given routine-card.css を開いた
   *   When  .routine-card__main セレクタのルール本文を観察する
   *   Then  flex: 1 (または flex-grow: 1) の宣言を含む
   *    かつ display: flex の宣言を含む
   *    かつ flex-direction: column の宣言を含む
   */
  describe("AC-3: .routine-card__main が左ブロックの flex 占有と縦並びを持つ (V-4 / V-5)", () => {
    it(".routine-card__main ルール本文に flex: 1 (または flex-grow: 1) を含む", () => {
      const css = readFileSync(routineCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".routine-card__main");
      expect(body, ".routine-card__main ルールが見つからない").not.toBeNull();
      const bodyText = body ?? "";
      const hasShorthand = /(?:^|;|\n)\s*flex\s*:\s*1(?:\s|;|$)/.test(bodyText);
      const hasFlexGrow = /flex-grow\s*:\s*1/.test(bodyText);
      expect(
        hasShorthand || hasFlexGrow,
        ".routine-card__main に flex: 1 (または flex-grow: 1) が無い",
      ).toBe(true);
    });

    it(".routine-card__main ルール本文に display: flex を含む", () => {
      const css = readFileSync(routineCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".routine-card__main");
      expect(body, ".routine-card__main ルールが見つからない").not.toBeNull();
      expect(body ?? "").toMatch(/display\s*:\s*flex/);
    });

    it(".routine-card__main ルール本文に flex-direction: column を含む", () => {
      const css = readFileSync(routineCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".routine-card__main");
      expect(body, ".routine-card__main ルールが見つからない").not.toBeNull();
      expect(body ?? "").toMatch(/flex-direction\s*:\s*column/);
    });
  });

  // ----------------------------------------------------------
  // AC-4: .routine-card__actions がボタン横並びを持つ (V-6)
  // ----------------------------------------------------------
  /**
   * シナリオ AC-4:
   *   Given routine-card.css を開いた
   *   When  .routine-card__actions セレクタのルール本文を観察する
   *   Then  display: flex / align-items: center / gap: var(--space-sm) を含む
   */
  describe("AC-4: .routine-card__actions がボタン横並びを持つ (V-6)", () => {
    it(".routine-card__actions ルール本文に display: flex を含む", () => {
      const css = readFileSync(routineCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".routine-card__actions");
      expect(body, ".routine-card__actions ルールが見つからない").not.toBeNull();
      expect(body ?? "").toMatch(/display\s*:\s*flex/);
    });

    it(".routine-card__actions ルール本文に align-items: center を含む", () => {
      const css = readFileSync(routineCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".routine-card__actions");
      expect(body, ".routine-card__actions ルールが見つからない").not.toBeNull();
      expect(body ?? "").toMatch(/align-items\s*:\s*center/);
    });

    it(".routine-card__actions ルール本文に gap: var(--space-sm) を含む", () => {
      const css = readFileSync(routineCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".routine-card__actions");
      expect(body, ".routine-card__actions ルールが見つからない").not.toBeNull();
      expect(body ?? "").toMatch(/gap\s*:\s*var\(--space-sm\)/);
    });
  });

  // ----------------------------------------------------------
  // AC-5: .routine-card__input が flex: 1 + placeholder の薄色を持つ (V-2)
  // ----------------------------------------------------------
  /**
   * シナリオ AC-5:
   *   Given routine-card.css を開いた
   *   When  .routine-card__input / .routine-card__input::placeholder セレクタを観察する
   *   Then  .routine-card__input に flex: 1 (または flex-grow: 1) を含む
   *    かつ .routine-card__input::placeholder に color: var(--color-fg-subtle) を含む
   */
  describe("AC-5: .routine-card__input が flex: 1 + placeholder 薄色を持つ (V-2)", () => {
    it(".routine-card__input ルール本文に flex: 1 (または flex-grow: 1) を含む", () => {
      const css = readFileSync(routineCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".routine-card__input");
      expect(body, ".routine-card__input ルールが見つからない").not.toBeNull();
      const bodyText = body ?? "";
      const hasShorthand = /(?:^|;|\n)\s*flex\s*:\s*1(?:\s|;|$)/.test(bodyText);
      const hasFlexGrow = /flex-grow\s*:\s*1/.test(bodyText);
      expect(
        hasShorthand || hasFlexGrow,
        ".routine-card__input に flex: 1 (または flex-grow: 1) が無い",
      ).toBe(true);
    });

    it(".routine-card__input::placeholder ルール本文に color: var(--color-fg-subtle) を含む", () => {
      const css = readFileSync(routineCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".routine-card__input::placeholder");
      expect(body, ".routine-card__input::placeholder ルールが見つからない").not.toBeNull();
      expect(body ?? "").toMatch(/color\s*:\s*var\(--color-fg-subtle\)/);
    });
  });

  // ----------------------------------------------------------
  // AC-6: .routine-card__days-label が小さい字 + 薄色を持つ (V-5)
  // ----------------------------------------------------------
  /**
   * シナリオ AC-6:
   *   Given routine-card.css を開いた
   *   When  .routine-card__days-label セレクタのルール本文を観察する
   *   Then  font-size: var(--font-size-small) を含む
   *    かつ color: var(--color-fg-subtle) を含む
   */
  describe("AC-6: .routine-card__days-label が小さい字 + 薄色を持つ (V-5)", () => {
    it(".routine-card__days-label ルール本文に font-size: var(--font-size-small) を含む", () => {
      const css = readFileSync(routineCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".routine-card__days-label");
      expect(body, ".routine-card__days-label ルールが見つからない").not.toBeNull();
      expect(body ?? "").toMatch(/font-size\s*:\s*var\(--font-size-small\)/);
    });

    it(".routine-card__days-label ルール本文に color: var(--color-fg-subtle) を含む", () => {
      const css = readFileSync(routineCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".routine-card__days-label");
      expect(body, ".routine-card__days-label ルールが見つからない").not.toBeNull();
      expect(body ?? "").toMatch(/color\s*:\s*var\(--color-fg-subtle\)/);
    });
  });

  // ----------------------------------------------------------
  // AC-7: .routine-card__day-checkboxes が wrap 横並びを持つ (V-1)
  // ----------------------------------------------------------
  /**
   * シナリオ AC-7:
   *   Given routine-card.css を開いた
   *   When  .routine-card__day-checkboxes セレクタのルール本文を観察する
   *   Then  display: flex / flex-wrap: wrap / gap: var(--space-sm) を含む
   */
  describe("AC-7: .routine-card__day-checkboxes が wrap 横並びを持つ (V-1)", () => {
    it(".routine-card__day-checkboxes ルール本文に display: flex を含む", () => {
      const css = readFileSync(routineCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".routine-card__day-checkboxes");
      expect(body, ".routine-card__day-checkboxes ルールが見つからない").not.toBeNull();
      expect(body ?? "").toMatch(/display\s*:\s*flex/);
    });

    it(".routine-card__day-checkboxes ルール本文に flex-wrap: wrap を含む", () => {
      const css = readFileSync(routineCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".routine-card__day-checkboxes");
      expect(body, ".routine-card__day-checkboxes ルールが見つからない").not.toBeNull();
      expect(body ?? "").toMatch(/flex-wrap\s*:\s*wrap/);
    });

    it(".routine-card__day-checkboxes ルール本文に gap: var(--space-sm) を含む", () => {
      const css = readFileSync(routineCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".routine-card__day-checkboxes");
      expect(body, ".routine-card__day-checkboxes ルールが見つからない").not.toBeNull();
      expect(body ?? "").toMatch(/gap\s*:\s*var\(--space-sm\)/);
    });
  });

  // ----------------------------------------------------------
  // AC-8: .visually-hidden ユーティリティが routine-card.css に定義されている (D-008)
  // ----------------------------------------------------------
  /**
   * シナリオ AC-8:
   *   Given routine-card.css を開いた
   *   When  .visually-hidden セレクタのルール本文を観察する
   *   Then  position: absolute / width: 1px / height: 1px / overflow: hidden /
   *         clip: rect(0, 0, 0, 0) の宣言を含む
   */
  describe("AC-8: .visually-hidden ユーティリティが routine-card.css に定義されている (D-008)", () => {
    it(".visually-hidden ルール本文に position: absolute を含む", () => {
      const css = readFileSync(routineCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".visually-hidden");
      expect(body, ".visually-hidden ルールが見つからない").not.toBeNull();
      expect(body ?? "").toMatch(/position\s*:\s*absolute/);
    });

    it(".visually-hidden ルール本文に width: 1px / height: 1px を含む", () => {
      const css = readFileSync(routineCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".visually-hidden");
      expect(body, ".visually-hidden ルールが見つからない").not.toBeNull();
      const bodyText = body ?? "";
      expect(bodyText).toMatch(/width\s*:\s*1px/);
      expect(bodyText).toMatch(/height\s*:\s*1px/);
    });

    it(".visually-hidden ルール本文に overflow: hidden を含む", () => {
      const css = readFileSync(routineCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".visually-hidden");
      expect(body, ".visually-hidden ルールが見つからない").not.toBeNull();
      expect(body ?? "").toMatch(/overflow\s*:\s*hidden/);
    });

    it(".visually-hidden ルール本文に clip: rect(0, 0, 0, 0) を含む", () => {
      const css = readFileSync(routineCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".visually-hidden");
      expect(body, ".visually-hidden ルールが見つからない").not.toBeNull();
      // clip: rect(0, 0, 0, 0) は空白 / カンマの有無で若干変動するためゆるい正規表現で.
      expect(body ?? "").toMatch(/clip\s*:\s*rect\(\s*0[\s,]+0[\s,]+0[\s,]+0\s*\)/);
    });
  });

  // ============================================================
  // jsdom DOM レンダ系 (AC-9 〜 AC-14 / AC-20 / AC-21)
  // ============================================================

  // ----------------------------------------------------------
  // AC-9: <RoutineCard isEditing=false> が表示モードの DOM を出す
  // ----------------------------------------------------------
  /**
   * シナリオ AC-9:
   *   Given <RoutineCard routine={...} isEditing={false} ... /> を render する
   *   When  出力 DOM を観察する
   *   Then  ルート要素は <li class="routine-card"> である
   *    かつ .routine-card 内に .routine-card__main 要素が存在する
   *    かつ .routine-card__main 内に .routine-card__name (routine.name 文字列) が存在する
   *    かつ .routine-card__main 内に .routine-card__days-label (曜日文字列) が存在する
   *    かつ .routine-card 内に .routine-card__actions 要素が存在する
   *    かつ .routine-card__actions 内に「変更」「削除」 button が存在する
   *    かつ DOM 順は「変更」が「削除」より先
   */
  describe("AC-9: <RoutineCard isEditing=false> が表示モードの DOM を出す", () => {
    it("ルート要素は <li class='routine-card'> である", async () => {
      const { RoutineCard } = await importRoutineCard();
      const routine = makeRoutine({ name: "朝の運動" });
      const { container } = render(
        <RoutineCard
          routine={routine}
          isEditing={false}
          editingName=""
          onEditingNameChange={() => {}}
          editingDaysOfWeek={[1]}
          onEditingDaysOfWeekChange={() => {}}
          onStartEdit={() => {}}
          onCancelEdit={() => {}}
          onSaveEdit={(e: React.FormEvent) => {
            e.preventDefault();
          }}
          onDelete={() => {}}
        />,
      );
      const root = container.firstElementChild as HTMLElement | null;
      expect(root, "RoutineCard の root 要素が見つからない").not.toBeNull();
      expect(root?.tagName.toLowerCase()).toBe("li");
      expect(root?.classList.contains("routine-card")).toBe(true);
      // 表示モードでは編集中 modifier は付かない.
      expect(root?.classList.contains("routine-card--editing")).toBe(false);
    });

    it(".routine-card__main が .routine-card 内に存在する", async () => {
      const { RoutineCard } = await importRoutineCard();
      const routine = makeRoutine();
      const { container } = render(
        <RoutineCard
          routine={routine}
          isEditing={false}
          editingName=""
          onEditingNameChange={() => {}}
          editingDaysOfWeek={[1]}
          onEditingDaysOfWeekChange={() => {}}
          onStartEdit={() => {}}
          onCancelEdit={() => {}}
          onSaveEdit={(e: React.FormEvent) => {
            e.preventDefault();
          }}
          onDelete={() => {}}
        />,
      );
      const main = container.querySelector(".routine-card__main");
      expect(main, ".routine-card__main が見つからない").not.toBeNull();
    });

    it(".routine-card__name にルーティン名が描画される", async () => {
      const { RoutineCard } = await importRoutineCard();
      const routine = makeRoutine({ name: "朝の運動" });
      const { container } = render(
        <RoutineCard
          routine={routine}
          isEditing={false}
          editingName=""
          onEditingNameChange={() => {}}
          editingDaysOfWeek={[1]}
          onEditingDaysOfWeekChange={() => {}}
          onStartEdit={() => {}}
          onCancelEdit={() => {}}
          onSaveEdit={(e: React.FormEvent) => {
            e.preventDefault();
          }}
          onDelete={() => {}}
        />,
      );
      const name = container.querySelector(".routine-card__name");
      expect(name, ".routine-card__name が見つからない").not.toBeNull();
      expect(name?.textContent ?? "").toContain("朝の運動");
    });

    it(".routine-card__days-label に曜日文字列 (例: '月・水・金') が描画される", async () => {
      const { RoutineCard } = await importRoutineCard();
      const routine = makeRoutine({ daysOfWeek: [1, 3, 5] }); // 月水金
      const { container } = render(
        <RoutineCard
          routine={routine}
          isEditing={false}
          editingName=""
          onEditingNameChange={() => {}}
          editingDaysOfWeek={[1]}
          onEditingDaysOfWeekChange={() => {}}
          onStartEdit={() => {}}
          onCancelEdit={() => {}}
          onSaveEdit={(e: React.FormEvent) => {
            e.preventDefault();
          }}
          onDelete={() => {}}
        />,
      );
      const daysLabel = container.querySelector(".routine-card__days-label");
      expect(daysLabel, ".routine-card__days-label が見つからない").not.toBeNull();
      const text = daysLabel?.textContent ?? "";
      // 曜日記号「月」「水」「金」がそれぞれ含まれている (区切り文字は "・" を想定).
      expect(text).toContain("月");
      expect(text).toContain("水");
      expect(text).toContain("金");
    });

    it(".routine-card__main の中に name と days-label が含まれる (左ブロック構造)", async () => {
      const { RoutineCard } = await importRoutineCard();
      const routine = makeRoutine();
      const { container } = render(
        <RoutineCard
          routine={routine}
          isEditing={false}
          editingName=""
          onEditingNameChange={() => {}}
          editingDaysOfWeek={[1]}
          onEditingDaysOfWeekChange={() => {}}
          onStartEdit={() => {}}
          onCancelEdit={() => {}}
          onSaveEdit={(e: React.FormEvent) => {
            e.preventDefault();
          }}
          onDelete={() => {}}
        />,
      );
      const main = container.querySelector(".routine-card__main");
      expect(main, ".routine-card__main が見つからない").not.toBeNull();
      const nameInside = main?.querySelector(".routine-card__name");
      const daysLabelInside = main?.querySelector(".routine-card__days-label");
      expect(nameInside, ".routine-card__main 内に .routine-card__name が無い").not.toBeNull();
      expect(
        daysLabelInside,
        ".routine-card__main 内に .routine-card__days-label が無い",
      ).not.toBeNull();
    });

    it(".routine-card__actions 内に「変更」「削除」 button が DOM 順「変更 → 削除」で存在する", async () => {
      const { RoutineCard } = await importRoutineCard();
      const routine = makeRoutine();
      const { container } = render(
        <RoutineCard
          routine={routine}
          isEditing={false}
          editingName=""
          onEditingNameChange={() => {}}
          editingDaysOfWeek={[1]}
          onEditingDaysOfWeekChange={() => {}}
          onStartEdit={() => {}}
          onCancelEdit={() => {}}
          onSaveEdit={(e: React.FormEvent) => {
            e.preventDefault();
          }}
          onDelete={() => {}}
        />,
      );
      const actions = container.querySelector(".routine-card__actions");
      expect(actions, ".routine-card__actions が見つからない").not.toBeNull();
      const buttons = Array.from(actions?.querySelectorAll("button") ?? []);
      const labels = buttons.map((b) => b.textContent?.trim() ?? "");
      expect(labels).toContain("変更");
      expect(labels).toContain("削除");
      // DOM 順「変更 → 削除」.
      const editIdx = labels.findIndex((t) => t === "変更");
      const deleteIdx = labels.findIndex((t) => t === "削除");
      expect(editIdx, "「変更」が actions 内に無い").toBeGreaterThanOrEqual(0);
      expect(deleteIdx, "「削除」が actions 内に無い").toBeGreaterThanOrEqual(0);
      expect(editIdx, "「変更」が「削除」より先に並ぶ").toBeLessThan(deleteIdx);
    });

    it('as="div" を渡すとルートが <div> になる (D-002)', async () => {
      const { RoutineCard } = await importRoutineCard();
      const routine = makeRoutine();
      const { container } = render(
        <RoutineCard
          as="div"
          routine={routine}
          isEditing={false}
          editingName=""
          onEditingNameChange={() => {}}
          editingDaysOfWeek={[1]}
          onEditingDaysOfWeekChange={() => {}}
          onStartEdit={() => {}}
          onCancelEdit={() => {}}
          onSaveEdit={(e: React.FormEvent) => {
            e.preventDefault();
          }}
          onDelete={() => {}}
        />,
      );
      const root = container.firstElementChild as HTMLElement | null;
      expect(root?.tagName.toLowerCase()).toBe("div");
      expect(root?.classList.contains("routine-card")).toBe(true);
    });

    it("「変更」 button をクリックすると onStartEdit が呼ばれる", async () => {
      const { RoutineCard } = await importRoutineCard();
      const routine = makeRoutine();
      const onStartEdit = vi.fn();
      const { container } = render(
        <RoutineCard
          routine={routine}
          isEditing={false}
          editingName=""
          onEditingNameChange={() => {}}
          editingDaysOfWeek={[1]}
          onEditingDaysOfWeekChange={() => {}}
          onStartEdit={onStartEdit}
          onCancelEdit={() => {}}
          onSaveEdit={(e: React.FormEvent) => {
            e.preventDefault();
          }}
          onDelete={() => {}}
        />,
      );
      const editButton = Array.from(container.querySelectorAll("button")).find(
        (b) => (b.textContent ?? "").trim() === "変更",
      );
      expect(editButton, "「変更」 button が無い").toBeDefined();
      editButton?.click();
      expect(onStartEdit).toHaveBeenCalledTimes(1);
    });

    it("「削除」 button をクリックすると onDelete が呼ばれる", async () => {
      const { RoutineCard } = await importRoutineCard();
      const routine = makeRoutine();
      const onDelete = vi.fn();
      const { container } = render(
        <RoutineCard
          routine={routine}
          isEditing={false}
          editingName=""
          onEditingNameChange={() => {}}
          editingDaysOfWeek={[1]}
          onEditingDaysOfWeekChange={() => {}}
          onStartEdit={() => {}}
          onCancelEdit={() => {}}
          onSaveEdit={(e: React.FormEvent) => {
            e.preventDefault();
          }}
          onDelete={onDelete}
        />,
      );
      const deleteButton = Array.from(container.querySelectorAll("button")).find(
        (b) => (b.textContent ?? "").trim() === "削除",
      );
      expect(deleteButton, "「削除」 button が無い").toBeDefined();
      deleteButton?.click();
      expect(onDelete).toHaveBeenCalledTimes(1);
    });
  });

  // ----------------------------------------------------------
  // AC-10: <RoutineCard isEditing=true> が編集モードの DOM を出す
  // ----------------------------------------------------------
  /**
   * シナリオ AC-10:
   *   Given <RoutineCard routine={...} isEditing={true} editingName="..." ... /> を render する
   *   When  出力 DOM を観察する
   *   Then  ルート要素は <li class="routine-card routine-card--editing"> である
   *    かつ ルート内に <form aria-label="ルーティン名称変更フォーム"> が存在する
   *    かつ form 内に visually-hidden な <label class="visually-hidden">ルーティン名</label> + <input>
   *    かつ input の id と label の htmlFor が一致する
   *    かつ form 内に div.routine-card__day-checkboxes (BL-068 で追加 / REQ-2)
   *    かつ form 内に <button type="submit">保存</button>
   *    かつ form 内に <button type="button">キャンセル</button>
   *
   *   BL-068 (routine-card-edit-fields) 追従: 編集モード form の DOM 構造に
   *   `.routine-card__day-checkboxes` (7 個の曜日 checkbox) を追加.
   *   旧 BL-061 では編集モードに曜日 UI が無いことを前提にしていたが,
   *   本 BL で曜日 UI 存在検証へ逆転する (R-001 / P-005).
   */
  describe("AC-10: <RoutineCard isEditing=true> が編集モードの DOM を出す", () => {
    it("ルート要素は <li class='routine-card routine-card--editing'> である", async () => {
      const { RoutineCard } = await importRoutineCard();
      const routine = makeRoutine();
      const { container } = render(
        <RoutineCard
          routine={routine}
          isEditing={true}
          editingName="朝の運動"
          onEditingNameChange={() => {}}
          editingDaysOfWeek={[1]}
          onEditingDaysOfWeekChange={() => {}}
          onStartEdit={() => {}}
          onCancelEdit={() => {}}
          onSaveEdit={(e: React.FormEvent) => {
            e.preventDefault();
          }}
          onDelete={() => {}}
        />,
      );
      const root = container.firstElementChild as HTMLElement | null;
      expect(root, "RoutineCard の root 要素が見つからない").not.toBeNull();
      expect(root?.tagName.toLowerCase()).toBe("li");
      expect(root?.classList.contains("routine-card")).toBe(true);
      expect(root?.classList.contains("routine-card--editing")).toBe(true);
    });

    it("編集モードでは <form aria-label='ルーティン名称変更フォーム'> が root 内に存在する", async () => {
      const { RoutineCard } = await importRoutineCard();
      const routine = makeRoutine();
      const { container } = render(
        <RoutineCard
          routine={routine}
          isEditing={true}
          editingName="朝の運動"
          onEditingNameChange={() => {}}
          editingDaysOfWeek={[1]}
          onEditingDaysOfWeekChange={() => {}}
          onStartEdit={() => {}}
          onCancelEdit={() => {}}
          onSaveEdit={(e: React.FormEvent) => {
            e.preventDefault();
          }}
          onDelete={() => {}}
        />,
      );
      const form = container.querySelector("form");
      expect(form, "編集モードで <form> が見つからない").not.toBeNull();
      expect(form?.getAttribute("aria-label")).toBe("ルーティン名称変更フォーム");
    });

    it("form 内に visually-hidden な <label>ルーティン名</label> + <input> が存在し htmlFor と id が一致する", async () => {
      const { RoutineCard } = await importRoutineCard();
      const routine = makeRoutine();
      const { container } = render(
        <RoutineCard
          routine={routine}
          isEditing={true}
          editingName="朝の運動"
          onEditingNameChange={() => {}}
          editingDaysOfWeek={[1]}
          onEditingDaysOfWeekChange={() => {}}
          onStartEdit={() => {}}
          onCancelEdit={() => {}}
          onSaveEdit={(e: React.FormEvent) => {
            e.preventDefault();
          }}
          onDelete={() => {}}
        />,
      );
      const form = container.querySelector("form");
      expect(form, "form が見つからない").not.toBeNull();
      const label = form?.querySelector("label");
      const input = form?.querySelector("input");
      expect(label, "編集モードの form に <label> が無い").not.toBeNull();
      expect(input, "編集モードの form に <input> が無い").not.toBeNull();
      expect(label?.classList.contains("visually-hidden")).toBe(true);
      expect(label?.textContent ?? "").toContain("ルーティン名");
      const labelFor = label?.getAttribute("for");
      const inputId = input?.getAttribute("id");
      expect(labelFor, "label の htmlFor (for) が空").toBeTruthy();
      expect(inputId, "input の id が空").toBeTruthy();
      expect(labelFor).toBe(inputId);
    });

    it("form 内に <button type='submit'>保存</button> と <button type='button'>キャンセル</button> が存在する", async () => {
      const { RoutineCard } = await importRoutineCard();
      const routine = makeRoutine();
      const { container } = render(
        <RoutineCard
          routine={routine}
          isEditing={true}
          editingName="朝の運動"
          onEditingNameChange={() => {}}
          editingDaysOfWeek={[1]}
          onEditingDaysOfWeekChange={() => {}}
          onStartEdit={() => {}}
          onCancelEdit={() => {}}
          onSaveEdit={(e: React.FormEvent) => {
            e.preventDefault();
          }}
          onDelete={() => {}}
        />,
      );
      const form = container.querySelector("form");
      expect(form, "form が見つからない").not.toBeNull();
      const buttons = Array.from(form?.querySelectorAll("button") ?? []);
      const submit = buttons.find((b) => (b.textContent ?? "").trim() === "保存");
      const cancel = buttons.find((b) => (b.textContent ?? "").trim() === "キャンセル");
      expect(submit, "「保存」 button が編集 form に無い").toBeDefined();
      expect(cancel, "「キャンセル」 button が編集 form に無い").toBeDefined();
      expect(submit?.getAttribute("type")).toBe("submit");
      expect(cancel?.getAttribute("type")).toBe("button");
    });

    it("編集モードの form 内に .routine-card__day-checkboxes (7 個の曜日 checkbox) が存在する (BL-068 REQ-2)", async () => {
      const { RoutineCard } = await importRoutineCard();
      const routine = makeRoutine();
      const { container } = render(
        <RoutineCard
          routine={routine}
          isEditing={true}
          editingName="朝の運動"
          onEditingNameChange={() => {}}
          editingDaysOfWeek={[1]}
          onEditingDaysOfWeekChange={() => {}}
          onStartEdit={() => {}}
          onCancelEdit={() => {}}
          onSaveEdit={(e: React.FormEvent) => {
            e.preventDefault();
          }}
          onDelete={() => {}}
        />,
      );
      const form = container.querySelector("form");
      expect(form, "編集モードの form が見つからない").not.toBeNull();
      const dayCheckboxes = form?.querySelector(".routine-card__day-checkboxes");
      expect(
        dayCheckboxes,
        "編集モードの form に .routine-card__day-checkboxes が無い (BL-068 REQ-2 違反)",
      ).not.toBeNull();
      expect(dayCheckboxes?.getAttribute("role")).toBe("group");
      expect(dayCheckboxes?.getAttribute("aria-label")).toBe("曜日");
      const checkboxes = Array.from(
        dayCheckboxes?.querySelectorAll("input[type='checkbox']") ?? [],
      );
      expect(checkboxes.length, "編集モードの曜日 checkbox が 7 個ではない").toBe(7);
    });

    it("編集モードでは「変更」「削除」 button が出ない (表示モードと排他)", async () => {
      const { RoutineCard } = await importRoutineCard();
      const routine = makeRoutine();
      const { container } = render(
        <RoutineCard
          routine={routine}
          isEditing={true}
          editingName="朝の運動"
          onEditingNameChange={() => {}}
          editingDaysOfWeek={[1]}
          onEditingDaysOfWeekChange={() => {}}
          onStartEdit={() => {}}
          onCancelEdit={() => {}}
          onSaveEdit={(e: React.FormEvent) => {
            e.preventDefault();
          }}
          onDelete={() => {}}
        />,
      );
      const labels = Array.from(container.querySelectorAll("button")).map(
        (b) => b.textContent?.trim() ?? "",
      );
      expect(labels).not.toContain("変更");
      expect(labels).not.toContain("削除");
    });

    it("onSaveEdit prop が <form onSubmit> として渡される", async () => {
      const { RoutineCard } = await importRoutineCard();
      const routine = makeRoutine();
      const onSaveEdit = vi.fn((e: { preventDefault: () => void }) => {
        e.preventDefault();
      });
      const { container } = render(
        <RoutineCard
          routine={routine}
          isEditing={true}
          editingName="朝の運動"
          onEditingNameChange={() => {}}
          editingDaysOfWeek={[1]}
          onEditingDaysOfWeekChange={() => {}}
          onStartEdit={() => {}}
          onCancelEdit={() => {}}
          onSaveEdit={onSaveEdit}
          onDelete={() => {}}
        />,
      );
      const form = container.querySelector("form") as HTMLFormElement | null;
      expect(form).not.toBeNull();
      form?.requestSubmit();
      expect(onSaveEdit).toHaveBeenCalledTimes(1);
    });
  });

  // ----------------------------------------------------------
  // AC-11: <RoutineFormCard> が 2 段構成の作成フォームを描画する
  // ----------------------------------------------------------
  /**
   * シナリオ AC-11:
   *   Given <RoutineFormCard name="" daysOfWeek={[1]} defaultPriority="normal" ... /> を render
   *   When  出力 DOM を観察する
   *   Then  ルートは <form aria-label="ルーティン作成フォーム" class="routine-card routine-card--form">
   *    かつ form 直下に 2 つの .routine-card__form-row 要素が存在する
   *    かつ 1 段目 row 内に visually-hidden label + input + 「追加」 submit button
   *    かつ 2 段目 row 内に .routine-card__day-checkboxes (内に 7 個の checkbox) + div[role="radiogroup"] (PriorityStars)
   *    かつ getByLabelText("ルーティン名") で name input が取得可能
   *
   *   BL-068 (routine-card-edit-fields) 追従: 旧 <select id="routine-priority"> 系 assert を
   *   <PriorityStars /> (= div[role="radiogroup"]) の存在 assert に逆転 (R-001 / P-005).
   */
  describe("AC-11: <RoutineFormCard> が 2 段構成の作成フォームを描画する", () => {
    it("ルートは <form class='routine-card routine-card--form' aria-label='ルーティン作成フォーム'>", async () => {
      const { RoutineFormCard } = await importRoutineFormCard();
      const { container } = render(
        <RoutineFormCard
          name=""
          onNameChange={() => {}}
          daysOfWeek={[1]}
          onToggleDay={() => {}}
          defaultPriority="normal"
          onDefaultPriorityChange={() => {}}
          onSubmit={(e: React.FormEvent) => {
            e.preventDefault();
          }}
        />,
      );
      const root = container.firstElementChild as HTMLElement | null;
      expect(root, "RoutineFormCard の root 要素が見つからない").not.toBeNull();
      expect(root?.tagName.toLowerCase()).toBe("form");
      expect(root?.classList.contains("routine-card")).toBe(true);
      expect(root?.classList.contains("routine-card--form")).toBe(true);
      expect(root?.getAttribute("aria-label")).toBe("ルーティン作成フォーム");
    });

    it("form 直下に 2 つの .routine-card__form-row 要素が存在する (2 段構成)", async () => {
      const { RoutineFormCard } = await importRoutineFormCard();
      const { container } = render(
        <RoutineFormCard
          name=""
          onNameChange={() => {}}
          daysOfWeek={[1]}
          onToggleDay={() => {}}
          defaultPriority="normal"
          onDefaultPriorityChange={() => {}}
          onSubmit={(e: React.FormEvent) => {
            e.preventDefault();
          }}
        />,
      );
      const rows = container.querySelectorAll(".routine-card__form-row");
      expect(rows.length, ".routine-card__form-row 要素が 2 個ではない").toBe(2);
    });

    it("1 段目 row 内に visually-hidden な <label htmlFor='routine-name'>ルーティン名</label> + <input id='routine-name'> + 「追加」 submit button が存在する", async () => {
      const { RoutineFormCard } = await importRoutineFormCard();
      const { container } = render(
        <RoutineFormCard
          name=""
          onNameChange={() => {}}
          daysOfWeek={[1]}
          onToggleDay={() => {}}
          defaultPriority="normal"
          onDefaultPriorityChange={() => {}}
          onSubmit={(e: React.FormEvent) => {
            e.preventDefault();
          }}
        />,
      );
      const rows = container.querySelectorAll(".routine-card__form-row");
      const firstRow = rows[0];
      expect(firstRow, "1 段目 row が見つからない").toBeDefined();
      const label = firstRow?.querySelector("label");
      const input = firstRow?.querySelector("input");
      expect(label, "1 段目 row に label が無い").not.toBeNull();
      expect(input, "1 段目 row に input が無い").not.toBeNull();
      expect(label?.classList.contains("visually-hidden")).toBe(true);
      expect(label?.getAttribute("for")).toBe("routine-name");
      expect(label?.textContent ?? "").toContain("ルーティン名");
      expect(input?.getAttribute("id")).toBe("routine-name");
      expect(input?.getAttribute("type")).toBe("text");
      // 「追加」 submit button.
      const buttons = Array.from(firstRow?.querySelectorAll("button") ?? []);
      const submit = buttons.find((b) => (b.textContent ?? "").trim() === "追加");
      expect(submit, "1 段目 row に「追加」 submit button が無い").toBeDefined();
      expect(submit?.getAttribute("type")).toBe("submit");
    });

    it("2 段目 row 内に .routine-card__day-checkboxes が存在し 7 個の checkbox <input> を含む", async () => {
      const { RoutineFormCard } = await importRoutineFormCard();
      const { container } = render(
        <RoutineFormCard
          name=""
          onNameChange={() => {}}
          daysOfWeek={[]}
          onToggleDay={() => {}}
          defaultPriority="normal"
          onDefaultPriorityChange={() => {}}
          onSubmit={(e: React.FormEvent) => {
            e.preventDefault();
          }}
        />,
      );
      const rows = container.querySelectorAll(".routine-card__form-row");
      const secondRow = rows[1];
      expect(secondRow, "2 段目 row が見つからない").toBeDefined();
      const dayCheckboxes = secondRow?.querySelector(".routine-card__day-checkboxes");
      expect(dayCheckboxes, "2 段目 row に .routine-card__day-checkboxes が無い").not.toBeNull();
      const checkboxes = Array.from(
        dayCheckboxes?.querySelectorAll("input[type='checkbox']") ?? [],
      );
      expect(checkboxes.length, "曜日 checkbox が 7 個ではない").toBe(7);
    });

    it("2 段目 row 内に div[role='radiogroup'] (PriorityStars) が存在し 3 個の星 button (role='radio') を含む (BL-068 で <select> から逆転)", async () => {
      const { RoutineFormCard } = await importRoutineFormCard();
      const { container } = render(
        <RoutineFormCard
          name=""
          onNameChange={() => {}}
          daysOfWeek={[1]}
          onToggleDay={() => {}}
          defaultPriority="normal"
          onDefaultPriorityChange={() => {}}
          onSubmit={(e: React.FormEvent) => {
            e.preventDefault();
          }}
        />,
      );
      const rows = container.querySelectorAll(".routine-card__form-row");
      const secondRow = rows[1];
      expect(secondRow, "2 段目 row が見つからない").toBeDefined();
      // BL-068: 旧 <select id="routine-priority"> 系 assert を <PriorityStars /> 存在 assert に逆転.
      const radiogroup = secondRow?.querySelector("div[role='radiogroup']");
      expect(
        radiogroup,
        "2 段目 row に <PriorityStars /> (= div[role='radiogroup']) が無い (BL-068 REQ-1 違反)",
      ).not.toBeNull();
      const stars = Array.from(radiogroup?.querySelectorAll("button[role='radio']") ?? []);
      expect(stars.length, "PriorityStars の星 button が 3 個ではない").toBe(3);
      // 旧 <select id="routine-priority"> が残存していないこと.
      const select = secondRow?.querySelector("select#routine-priority");
      expect(
        select,
        "2 段目 row に <select id='routine-priority'> が残っている (BL-068 REQ-1 違反)",
      ).toBeNull();
    });

    it('getByLabelText("ルーティン名") で name input が取得可能 (NFR-NAME-LABEL-CHANGE)', async () => {
      const { RoutineFormCard } = await importRoutineFormCard();
      render(
        <RoutineFormCard
          name=""
          onNameChange={() => {}}
          daysOfWeek={[1]}
          onToggleDay={() => {}}
          defaultPriority="normal"
          onDefaultPriorityChange={() => {}}
          onSubmit={(e: React.FormEvent) => {
            e.preventDefault();
          }}
        />,
      );
      const input = screen.getByLabelText("ルーティン名");
      expect(input, "getByLabelText('ルーティン名') で input が取れない").toBeTruthy();
      expect(input.tagName.toLowerCase()).toBe("input");
    });

    it("onSubmit prop が <form onSubmit> として渡される", async () => {
      const { RoutineFormCard } = await importRoutineFormCard();
      const onSubmit = vi.fn((e: { preventDefault: () => void }) => {
        e.preventDefault();
      });
      render(
        <RoutineFormCard
          name="新規ルーティン"
          onNameChange={() => {}}
          daysOfWeek={[1]}
          onToggleDay={() => {}}
          defaultPriority="normal"
          onDefaultPriorityChange={() => {}}
          onSubmit={onSubmit}
        />,
      );
      const form = screen.getByRole("form", { name: "ルーティン作成フォーム" });
      (form as HTMLFormElement).requestSubmit();
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });
  });

  // ----------------------------------------------------------
  // AC-12: <RoutineFormCard> の input に placeholder「ルーティン名」が表示される (V-2)
  // ----------------------------------------------------------
  /**
   * シナリオ AC-12:
   *   Given <RoutineFormCard name="" ... /> を render する
   *   When  出力 DOM の <input id="routine-name"> を観察する
   *   Then  input の placeholder 属性は「ルーティン名」である
   */
  describe("AC-12: <RoutineFormCard> の input に placeholder「ルーティン名」が表示される (V-2)", () => {
    it("input#routine-name の placeholder 属性は「ルーティン名」である", async () => {
      const { RoutineFormCard } = await importRoutineFormCard();
      const { container } = render(
        <RoutineFormCard
          name=""
          onNameChange={() => {}}
          daysOfWeek={[1]}
          onToggleDay={() => {}}
          defaultPriority="normal"
          onDefaultPriorityChange={() => {}}
          onSubmit={(e: React.FormEvent) => {
            e.preventDefault();
          }}
        />,
      );
      const input = container.querySelector("input#routine-name");
      expect(input, "input#routine-name が見つからない").not.toBeNull();
      expect(input?.getAttribute("placeholder")).toBe("ルーティン名");
    });
  });

  // ----------------------------------------------------------
  // AC-13: 「変更」 button が「変更」ラベルで表示される (G-8 / REQ-6)
  // ----------------------------------------------------------
  /**
   * シナリオ AC-13:
   *   Given <RoutineCard routine={...} isEditing={false} ... /> を render する
   *   When  ボタンを観察する
   *   Then  「変更」 button が存在する
   *    かつ 「名称変更」 button は存在しない
   */
  describe("AC-13: 「変更」 button が「変更」ラベルで表示される (G-8 / REQ-6)", () => {
    it("「変更」 button が存在し「名称変更」 button が存在しない", async () => {
      const { RoutineCard } = await importRoutineCard();
      const routine = makeRoutine();
      const { container } = render(
        <RoutineCard
          routine={routine}
          isEditing={false}
          editingName=""
          onEditingNameChange={() => {}}
          editingDaysOfWeek={[1]}
          onEditingDaysOfWeekChange={() => {}}
          onStartEdit={() => {}}
          onCancelEdit={() => {}}
          onSaveEdit={(e: React.FormEvent) => {
            e.preventDefault();
          }}
          onDelete={() => {}}
        />,
      );
      const labels = Array.from(container.querySelectorAll("button")).map(
        (b) => b.textContent?.trim() ?? "",
      );
      expect(labels, "「変更」 button が無い").toContain("変更");
      expect(
        labels,
        "「名称変更」 button が残っている (REQ-6 違反 / 「変更」へ短縮されていない)",
      ).not.toContain("名称変更");
    });
  });

  // ----------------------------------------------------------
  // AC-14: 曜日 checkbox label が「日」〜「土」のテキストを維持する (NFR-DAY-LABEL-PRESERVE)
  // ----------------------------------------------------------
  /**
   * シナリオ AC-14:
   *   Given <RoutineFormCard daysOfWeek={[]} ... /> を render する
   *   When  曜日チェックボックス群の各 label テキストを観察する
   *   Then  「日」「月」「火」「水」「木」「金」「土」が含まれる
   *    かつ getByLabelText("月", { exact: true }) で月曜の checkbox が取得可能
   */
  describe("AC-14: 曜日 checkbox label が「日」〜「土」のテキストを維持する (NFR-DAY-LABEL-PRESERVE)", () => {
    it("曜日 label テキストに「日」「月」「火」「水」「木」「金」「土」が含まれる", async () => {
      const { RoutineFormCard } = await importRoutineFormCard();
      const { container } = render(
        <RoutineFormCard
          name=""
          onNameChange={() => {}}
          daysOfWeek={[]}
          onToggleDay={() => {}}
          defaultPriority="normal"
          onDefaultPriorityChange={() => {}}
          onSubmit={(e: React.FormEvent) => {
            e.preventDefault();
          }}
        />,
      );
      const dayCheckboxes = container.querySelector(".routine-card__day-checkboxes");
      expect(dayCheckboxes, ".routine-card__day-checkboxes が見つからない").not.toBeNull();
      const labelTexts = Array.from(dayCheckboxes?.querySelectorAll("label") ?? []).map(
        (l) => l.textContent?.trim() ?? "",
      );
      for (const day of ["日", "月", "火", "水", "木", "金", "土"]) {
        const matched = labelTexts.some((t) => t.includes(day));
        expect(matched, `曜日 label に「${day}」が含まれていない`).toBe(true);
      }
    });

    it('getByLabelText("月", { exact: true }) で月曜の checkbox が取得可能', async () => {
      const { RoutineFormCard } = await importRoutineFormCard();
      render(
        <RoutineFormCard
          name=""
          onNameChange={() => {}}
          daysOfWeek={[]}
          onToggleDay={() => {}}
          defaultPriority="normal"
          onDefaultPriorityChange={() => {}}
          onSubmit={(e: React.FormEvent) => {
            e.preventDefault();
          }}
        />,
      );
      const monday = screen.getByLabelText("月", { exact: true });
      expect(monday, "「月」 label の checkbox が取得できない").toBeTruthy();
      expect(monday.getAttribute("type")).toBe("checkbox");
    });

    it("曜日 checkbox をクリックすると onToggleDay が呼ばれる", async () => {
      const { RoutineFormCard } = await importRoutineFormCard();
      const onToggleDay = vi.fn();
      render(
        <RoutineFormCard
          name=""
          onNameChange={() => {}}
          daysOfWeek={[]}
          onToggleDay={onToggleDay}
          defaultPriority="normal"
          onDefaultPriorityChange={() => {}}
          onSubmit={(e: React.FormEvent) => {
            e.preventDefault();
          }}
        />,
      );
      const monday = screen.getByLabelText("月", { exact: true }) as HTMLInputElement;
      monday.click();
      expect(onToggleDay).toHaveBeenCalledTimes(1);
      // 1 = 月.
      expect(onToggleDay).toHaveBeenCalledWith(1);
    });
  });

  // ============================================================
  // view 適用 (readFileSync 系) (AC-15)
  // ============================================================

  // ----------------------------------------------------------
  // AC-15: routines-view.tsx が <RoutineCard> / <RoutineFormCard> を使う (REQ-4)
  // ----------------------------------------------------------
  /**
   * シナリオ AC-15:
   *   Given web/src/ui/routines-view/routines-view.tsx を開いた
   *   When  ファイル本文を観察する
   *   Then  import { RoutineCard } from "../routine-card/routine-card.js" 文を含む
   *    かつ import { RoutineFormCard } from "../routine-card/routine-form-card.js" 文を含む
   *    かつ <RoutineCard ... /> の使用が少なくとも 1 か所存在する
   *    かつ <RoutineFormCard ... /> の使用が少なくとも 1 か所存在する
   *    かつ className="routines-view__form" の使用が存在しない
   *    かつ className="routines-view__item" の使用が存在しない
   *    かつ className="routines-view__actions" の使用が存在しない
   *    かつ className="routines-view__days" の使用が存在しない
   *    かつ className="routines-view__days-label" の使用が存在しない
   */
  describe("AC-15: routines-view.tsx が <RoutineCard> / <RoutineFormCard> を使う (REQ-4)", () => {
    it("routines-view.tsx が RoutineCard を import している", () => {
      const src = readFileSync(routinesViewTsxPath, "utf-8");
      expect(src, "routines-view.tsx に RoutineCard の import が無い").toMatch(
        /import\s*\{\s*RoutineCard\s*\}\s*from\s*["']\.\.\/routine-card\/routine-card\.js["']/,
      );
    });

    it("routines-view.tsx が RoutineFormCard を import している", () => {
      const src = readFileSync(routinesViewTsxPath, "utf-8");
      expect(src, "routines-view.tsx に RoutineFormCard の import が無い").toMatch(
        /import\s*\{\s*RoutineFormCard\s*\}\s*from\s*["']\.\.\/routine-card\/routine-form-card\.js["']/,
      );
    });

    it("routines-view.tsx で <RoutineCard ... /> が少なくとも 1 か所使用されている", () => {
      const src = readFileSync(routinesViewTsxPath, "utf-8");
      expect(src, "<RoutineCard が JSX 上に無い").toMatch(/<RoutineCard[\s/>]/);
    });

    it("routines-view.tsx で <RoutineFormCard ... /> が少なくとも 1 か所使用されている", () => {
      const src = readFileSync(routinesViewTsxPath, "utf-8");
      expect(src, "<RoutineFormCard が JSX 上に無い").toMatch(/<RoutineFormCard[\s/>]/);
    });

    it('routines-view.tsx に className="routines-view__form" の使用が残っていない', () => {
      const src = readFileSync(routinesViewTsxPath, "utf-8");
      expect(
        src,
        'routines-view.tsx に className="routines-view__form" が残っている (REQ-4 / AC-15 違反)',
      ).not.toMatch(/className\s*=\s*["'][^"']*routines-view__form[^"']*["']/);
    });

    it('routines-view.tsx に className="routines-view__item" の使用が残っていない', () => {
      const src = readFileSync(routinesViewTsxPath, "utf-8");
      expect(
        src,
        'routines-view.tsx に className="routines-view__item" が残っている (REQ-4 / AC-15 違反)',
      ).not.toMatch(/className\s*=\s*["'][^"']*routines-view__item[^"']*["']/);
    });

    it('routines-view.tsx に className="routines-view__actions" の使用が残っていない', () => {
      const src = readFileSync(routinesViewTsxPath, "utf-8");
      expect(
        src,
        'routines-view.tsx に className="routines-view__actions" が残っている (REQ-4 / AC-15 違反)',
      ).not.toMatch(/className\s*=\s*["'][^"']*routines-view__actions[^"']*["']/);
    });

    it('routines-view.tsx に className="routines-view__days" の使用が残っていない', () => {
      const src = readFileSync(routinesViewTsxPath, "utf-8");
      // 注: routines-view__days-label より長い文字列を含むため, 単語境界を意識した正規表現にする.
      expect(
        src,
        'routines-view.tsx に className="routines-view__days" が残っている (REQ-4 / AC-15 違反)',
      ).not.toMatch(/className\s*=\s*["'][^"']*routines-view__days(?![a-zA-Z_-])[^"']*["']/);
    });

    it('routines-view.tsx に className="routines-view__days-label" の使用が残っていない', () => {
      const src = readFileSync(routinesViewTsxPath, "utf-8");
      expect(
        src,
        'routines-view.tsx に className="routines-view__days-label" が残っている (REQ-4 / AC-15 違反)',
      ).not.toMatch(/className\s*=\s*["'][^"']*routines-view__days-label[^"']*["']/);
    });
  });

  // ============================================================
  // 旧セレクタ撤去 / 維持セレクタ系 (AC-16 / AC-17)
  // ============================================================

  // ----------------------------------------------------------
  // AC-16: 旧 .routines-view__form / __item / __days / __days-label / __actions が
  //        routines-view.css から撤去 (REQ-5)
  // ----------------------------------------------------------
  /**
   * シナリオ AC-16:
   *   Given web/src/ui/routines-view/routines-view.css を開いた
   *   When  ファイル本文を観察する
   *   Then  .routines-view__form セレクタが定義されていない
   *    かつ .routines-view__item セレクタが定義されていない
   *    かつ .routines-view__days セレクタが定義されていない
   *    かつ .routines-view__days-label セレクタが定義されていない
   *    かつ .routines-view__actions セレクタが定義されていない
   */
  describe("AC-16: 旧 .routines-view__form / __item / __days / __days-label / __actions が routines-view.css から撤去 (REQ-5)", () => {
    it(".routines-view__form セレクタが routines-view.css に存在しない", () => {
      const css = readFileSync(routinesViewCssPath, "utf-8");
      const body = extractRuleBody(css, ".routines-view__form");
      expect(body, ".routines-view__form ルールが残存 (REQ-5 / D-009-2 違反)").toBeNull();
    });

    it(".routines-view__item セレクタが routines-view.css に存在しない", () => {
      const css = readFileSync(routinesViewCssPath, "utf-8");
      const body = extractRuleBody(css, ".routines-view__item");
      expect(body, ".routines-view__item ルールが残存 (REQ-5 / D-009-2 違反)").toBeNull();
    });

    it(".routines-view__days セレクタが routines-view.css に存在しない", () => {
      const css = readFileSync(routinesViewCssPath, "utf-8");
      const body = extractRuleBody(css, ".routines-view__days");
      expect(body, ".routines-view__days ルールが残存 (REQ-5 / D-009-2 違反)").toBeNull();
    });

    it(".routines-view__days-label セレクタが routines-view.css に存在しない", () => {
      const css = readFileSync(routinesViewCssPath, "utf-8");
      const body = extractRuleBody(css, ".routines-view__days-label");
      expect(body, ".routines-view__days-label ルールが残存 (REQ-5 / D-009-2 違反)").toBeNull();
    });

    it(".routines-view__actions セレクタが routines-view.css に存在しない", () => {
      const css = readFileSync(routinesViewCssPath, "utf-8");
      const body = extractRuleBody(css, ".routines-view__actions");
      expect(body, ".routines-view__actions ルールが残存 (REQ-5 / D-009-2 違反)").toBeNull();
    });
  });

  // ----------------------------------------------------------
  // AC-17: routines-view.css の維持セレクタが引き続き存在 (NFR-PRESERVE-SHELL)
  // ----------------------------------------------------------
  /**
   * シナリオ AC-17:
   *   Given routines-view.css を開いた
   *   When  ファイル本文を観察する
   *   Then  .routines-view セレクタが定義されている
   *    かつ .routines-view h1 セレクタが定義されている
   *    かつ .routines-view__list セレクタが定義されている
   *    かつ .routines-view__empty セレクタが定義されている
   */
  describe("AC-17: routines-view.css の維持セレクタが引き続き存在 (NFR-PRESERVE-SHELL)", () => {
    it(".routines-view セレクタが定義されている", () => {
      const css = readFileSync(routinesViewCssPath, "utf-8");
      const body = extractRuleBody(css, ".routines-view");
      expect(body, ".routines-view ルールが見つからない (NFR-PRESERVE-SHELL 違反)").not.toBeNull();
    });

    it(".routines-view h1 セレクタが定義されている", () => {
      const css = readFileSync(routinesViewCssPath, "utf-8");
      const body = extractRuleBody(css, ".routines-view h1");
      expect(
        body,
        ".routines-view h1 ルールが見つからない (NFR-PRESERVE-SHELL 違反)",
      ).not.toBeNull();
    });

    it(".routines-view__list セレクタが定義されている", () => {
      const css = readFileSync(routinesViewCssPath, "utf-8");
      const body = extractRuleBody(css, ".routines-view__list");
      expect(
        body,
        ".routines-view__list ルールが見つからない (NFR-PRESERVE-SHELL 違反)",
      ).not.toBeNull();
    });

    it(".routines-view__empty セレクタが定義されている", () => {
      const css = readFileSync(routinesViewCssPath, "utf-8");
      const body = extractRuleBody(css, ".routines-view__empty");
      expect(
        body,
        ".routines-view__empty ルールが見つからない (NFR-PRESERVE-SHELL 違反)",
      ).not.toBeNull();
    });
  });

  // ============================================================
  // 不変性系 (AC-18 / AC-19)
  // ============================================================

  // ----------------------------------------------------------
  // AC-18: tokens.css に本 BL で参照するトークンが引き続き定義されている (NFR-NO-NEW-TOKENS)
  // ----------------------------------------------------------
  /**
   * シナリオ AC-18:
   *   Given 本 BL の実装がマージされた
   *   When  tokens.css を観察する
   *   Then  本 BL で参照する --color-bg / --color-border / --radius-lg / --space-md /
   *         --space-sm / --space-xs / --color-fg-subtle / --font-size-small が引き続き定義
   */
  describe("AC-18: tokens.css に本 BL で参照するトークンが引き続き定義されている (NFR-NO-NEW-TOKENS)", () => {
    const requiredTokens = [
      "--color-bg",
      "--color-border",
      "--radius-lg",
      "--space-md",
      "--space-sm",
      "--space-xs",
      "--color-fg-subtle",
      "--font-size-small",
    ] as const;

    for (const token of requiredTokens) {
      it(`tokens.css に ${token} が定義されている`, () => {
        const css = readFileSync(tokensCssPath, "utf-8");
        const escaped = token.replace(/[-]/g, "\\-");
        const re = new RegExp(`${escaped}\\s*:`);
        expect(css, `tokens.css に ${token} が定義されていない`).toMatch(re);
      });
    }
  });

  // ----------------------------------------------------------
  // AC-19: RoutineRepository / mutation 経路が無改修である (NFR-COMPAT)
  // ----------------------------------------------------------
  /**
   * シナリオ AC-19:
   *   Given web/src/repositories/routine-repository.ts を開いた
   *    かつ routines-view.tsx 内の createMutation / updateMutation / deleteMutation を観察する
   *   When  本 BL の前後で diff を取る
   *   Then  RoutineRepository の API / Mutation 構成に差分が無い
   *    かつ ConflictDialog / useConflictDialog の呼び出しに差分が無い
   */
  describe("AC-19: RoutineRepository / mutation 経路が無改修である (NFR-COMPAT)", () => {
    it("routine-repository.ts に主要シンボル (WebRoutineRepository / WebRoutine / RoutineConflictError 等) が残っている", () => {
      const src = readFileSync(routineRepositoryTsPath, "utf-8");
      expect(src).toMatch(/export\s+interface\s+WebRoutineRepository/);
      expect(src).toMatch(/export\s+interface\s+WebRoutine\b/);
      expect(src).toMatch(/export\s+class\s+RoutineConflictError/);
      expect(src).toMatch(/export\s+interface\s+CreateRoutineCommand/);
      expect(src).toMatch(/export\s+interface\s+UpdateRoutineCommand/);
      expect(src).toMatch(/export\s+interface\s+DeleteRoutineCommand/);
    });

    it("routines-view.tsx に createMutation / updateMutation / deleteMutation が残っている", () => {
      const src = readFileSync(routinesViewTsxPath, "utf-8");
      expect(src, "createMutation が無い").toMatch(/createMutation\s*=/);
      expect(src, "updateMutation が無い").toMatch(/updateMutation\s*=/);
      expect(src, "deleteMutation が無い").toMatch(/deleteMutation\s*=/);
    });

    it("routines-view.tsx に ConflictDialog / useConflictDialog の呼び出しが残っている", () => {
      const src = readFileSync(routinesViewTsxPath, "utf-8");
      expect(src, "useConflictDialog が無い").toMatch(/useConflictDialog/);
      expect(src, "<ConflictDialog が無い").toMatch(/<ConflictDialog\b/);
    });
  });

  // ============================================================
  // ラベル / aria 保持系 (AC-20 / AC-21)
  // ============================================================

  // ----------------------------------------------------------
  // AC-20: label/input 関連付けが保持されている
  //        (NFR-NAME-LABEL-CHANGE / NFR-DAY-LABEL-PRESERVE)
  // ----------------------------------------------------------
  /**
   * シナリオ AC-20:
   *   Given /routines を render する
   *   When  作成フォームの label と input を観察する
   *   Then  <label class="visually-hidden" htmlFor="routine-name">ルーティン名</label> と
   *         <input id="routine-name"> が共存する
   *    かつ getByLabelText("ルーティン名") で name input が取得可能
   *    かつ 7 個の曜日 label (日〜土) と checkbox の関連付けが維持されている
   *    かつ <label htmlFor="routine-priority">優先度</label> と <select id="routine-priority"> が共存
   */
  describe("AC-20: label/input 関連付けが保持されている (NFR-NAME-LABEL-CHANGE / NFR-DAY-LABEL-PRESERVE)", () => {
    it("<RoutineFormCard> の name label class に visually-hidden を含み, htmlFor='routine-name' / input id='routine-name' で関連付けされている", async () => {
      const { RoutineFormCard } = await importRoutineFormCard();
      const { container } = render(
        <RoutineFormCard
          name=""
          onNameChange={() => {}}
          daysOfWeek={[1]}
          onToggleDay={() => {}}
          defaultPriority="normal"
          onDefaultPriorityChange={() => {}}
          onSubmit={(e: React.FormEvent) => {
            e.preventDefault();
          }}
        />,
      );
      const nameLabel = container.querySelector("label[for='routine-name']");
      const nameInput = container.querySelector("input#routine-name");
      expect(nameLabel, "name label が無い").not.toBeNull();
      expect(nameInput, "name input が無い").not.toBeNull();
      expect(nameLabel?.classList.contains("visually-hidden")).toBe(true);
      expect(nameLabel?.textContent ?? "").toContain("ルーティン名");
    });

    it('<RoutineFormCard> の優先度 UI は <PriorityStars /> (radiogroup) で実現され, <label htmlFor="routine-priority"> と <select id="routine-priority"> は撤去されている (BL-068 で D-008-2 を逆転)', async () => {
      const { RoutineFormCard } = await importRoutineFormCard();
      const { container } = render(
        <RoutineFormCard
          name=""
          onNameChange={() => {}}
          daysOfWeek={[1]}
          onToggleDay={() => {}}
          defaultPriority="normal"
          onDefaultPriorityChange={() => {}}
          onSubmit={(e: React.FormEvent) => {
            e.preventDefault();
          }}
        />,
      );
      // BL-068 (routine-card-edit-fields) で D-008-2 を逆転.
      // 旧: 「優先度 label を可視のまま残す」を assert
      // 新: 「優先度 label 自体を撤去し, <PriorityStars /> の groupLabel で a11y を担保」を assert
      const priorityLabel = container.querySelector("label[for='routine-priority']");
      const prioritySelect = container.querySelector("select#routine-priority");
      expect(
        priorityLabel,
        "<label htmlFor='routine-priority'> が残っている (BL-068 REQ-6 / D-003 違反)",
      ).toBeNull();
      expect(
        prioritySelect,
        "<select id='routine-priority'> が残っている (BL-068 REQ-1 違反)",
      ).toBeNull();
      // <PriorityStars /> radiogroup の aria-label に「優先度」が含まれることで a11y を担保 (BL-040 REQ-4).
      const radiogroup = container.querySelector("div[role='radiogroup']");
      expect(radiogroup, "<PriorityStars /> radiogroup が無い").not.toBeNull();
      const ariaLabel = radiogroup?.getAttribute("aria-label") ?? "";
      expect(
        ariaLabel,
        "radiogroup の aria-label に「優先度」が含まれていない (BL-068 D-003 / BL-040 REQ-4 違反)",
      ).toContain("優先度");
    });

    it("7 個の曜日 label (日〜土) と checkbox の関連付けが維持されている", async () => {
      const { RoutineFormCard } = await importRoutineFormCard();
      const { container } = render(
        <RoutineFormCard
          name=""
          onNameChange={() => {}}
          daysOfWeek={[]}
          onToggleDay={() => {}}
          defaultPriority="normal"
          onDefaultPriorityChange={() => {}}
          onSubmit={(e: React.FormEvent) => {
            e.preventDefault();
          }}
        />,
      );
      const dayCheckboxes = container.querySelector(".routine-card__day-checkboxes");
      expect(dayCheckboxes, ".routine-card__day-checkboxes が見つからない").not.toBeNull();
      const labels = Array.from(dayCheckboxes?.querySelectorAll("label") ?? []);
      // 7 個の <label> 要素が並び, 各 label 内に checkbox <input> が含まれる.
      expect(labels.length, "曜日 label が 7 個ではない").toBe(7);
      for (const label of labels) {
        const cb = label.querySelector("input[type='checkbox']");
        expect(cb, "label 内に checkbox が無い").not.toBeNull();
      }
    });
  });

  // ----------------------------------------------------------
  // AC-21: form の aria-label が保持されている (NFR-FORM-ARIA-LABEL-PRESERVE)
  // ----------------------------------------------------------
  /**
   * シナリオ AC-21:
   *   Given /routines を render する
   *   When  form を観察する
   *   Then  作成 form の aria-label は「ルーティン作成フォーム」である
   *    かつ 編集モード form の aria-label は「ルーティン名称変更フォーム」である
   */
  describe("AC-21: form の aria-label が保持されている (NFR-FORM-ARIA-LABEL-PRESERVE)", () => {
    it("<RoutineFormCard> の aria-label は「ルーティン作成フォーム」である", async () => {
      const { RoutineFormCard } = await importRoutineFormCard();
      render(
        <RoutineFormCard
          name=""
          onNameChange={() => {}}
          daysOfWeek={[1]}
          onToggleDay={() => {}}
          defaultPriority="normal"
          onDefaultPriorityChange={() => {}}
          onSubmit={(e: React.FormEvent) => {
            e.preventDefault();
          }}
        />,
      );
      const form = screen.getByRole("form", { name: "ルーティン作成フォーム" });
      expect(form).toBeTruthy();
    });

    it("<RoutineCard isEditing={true}> の form aria-label は「ルーティン名称変更フォーム」である", async () => {
      const { RoutineCard } = await importRoutineCard();
      const routine = makeRoutine();
      render(
        <RoutineCard
          routine={routine}
          isEditing={true}
          editingName="朝の運動"
          onEditingNameChange={() => {}}
          editingDaysOfWeek={[1]}
          onEditingDaysOfWeekChange={() => {}}
          onStartEdit={() => {}}
          onCancelEdit={() => {}}
          onSaveEdit={(e: React.FormEvent) => {
            e.preventDefault();
          }}
          onDelete={() => {}}
        />,
      );
      const form = screen.getByRole("form", { name: "ルーティン名称変更フォーム" });
      expect(form).toBeTruthy();
    });
  });

  // ============================================================
  // 機能制約 (AC-22)
  // ============================================================

  // ----------------------------------------------------------
  // AC-22: .routine-card 系セレクタに box-shadow / transition / animation / :hover が無い
  // ----------------------------------------------------------
  /**
   * シナリオ AC-22:
   *   Given routine-card.css を開いた
   *   When  ファイル全体を観察する
   *   Then  box-shadow キーワードを含む宣言が存在しない
   *    かつ transition 宣言が存在しない
   *    かつ animation 宣言が存在しない
   *    かつ .routine-card:hover / .routine-card--form:hover 等の :hover セレクタが存在しない
   */
  describe("AC-22: .routine-card 系セレクタに box-shadow / transition / animation / :hover が無い (NFR-NO-SHADOW / NFR-NO-HOVER-TRANSITION)", () => {
    it("routine-card.css 全体に box-shadow 宣言が存在しない", () => {
      const css = readFileSync(routineCardCssPath, "utf-8");
      expect(css, "routine-card.css に box-shadow が含まれている (NFR-NO-SHADOW 違反)").not.toMatch(
        /box-shadow\s*:/,
      );
    });

    it("routine-card.css 全体に transition 宣言が存在しない", () => {
      const css = readFileSync(routineCardCssPath, "utf-8");
      expect(
        css,
        "routine-card.css に transition が含まれている (NFR-NO-HOVER-TRANSITION 違反)",
      ).not.toMatch(/(?:^|;|\n|\s)transition\s*:/);
    });

    it("routine-card.css 全体に animation 宣言が存在しない", () => {
      const css = readFileSync(routineCardCssPath, "utf-8");
      expect(
        css,
        "routine-card.css に animation が含まれている (NFR-NO-HOVER-TRANSITION 違反)",
      ).not.toMatch(/(?:^|;|\n|\s)animation\s*:/);
    });

    it("routine-card.css 全体に :hover セレクタが存在しない", () => {
      const css = readFileSync(routineCardCssPath, "utf-8");
      expect(
        css,
        "routine-card.css に :hover セレクタが含まれている (NFR-NO-HOVER-TRANSITION 違反)",
      ).not.toMatch(/:hover\b/);
    });
  });

  // ============================================================
  // 新規ファイル存在の前提 (回帰検出)
  // ============================================================

  describe("前提: 本 BL で新設される component ファイルが存在する", () => {
    it("web/src/ui/routine-card/routine-card.tsx が存在する", () => {
      expect(existsSync(routineCardTsxPath)).toBe(true);
    });

    it("web/src/ui/routine-card/routine-form-card.tsx が存在する", () => {
      expect(existsSync(routineFormCardTsxPath)).toBe(true);
    });
  });
});
