// @vitest-environment jsdom

/**
 * RoutineCard / RoutineFormCard コンポーネント新設 + routines-view 適用
 * 受け入れ基準テスト.
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
 *   - CSS 直読み: / / / / / と同じ
 *     readFileSync + extractRuleBody (P-005). ヘルパは本ファイル内に再定義する.
 *   - DOM レンダ: と同形の動的 import + render パターン.
 *
 * vitest-environment:
 *   DOM レンダ AC は jsdom 必須のため 1 ファイル全体を jsdom で動かす
 *   (= jsdom でも readFileSync は問題なく動く).
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { fireEvent, render, screen } from "@testing-library/react";
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
// CSS ルール本文の抽出ヘルパ (P-005 / 等から再実装)
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

describe("RoutineCard / RoutineFormCard コンポーネント新設", () => {
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
  describe("AC-9: <RoutineCard> が表示 (常時編集) モードの DOM を出す", () => {
    // (inline-edit-all-cards) 追従:
    //   旧 現状は isEditing=false の表示モードで .routine-card__name <span> +
    //   .routine-card__days-label <span> + 「変更」「削除」 button を assert していた.
    //   現状「編集モード」概念を撤去 (REQ-3 / G-3). isEditing prop / editing* 系
    //   prop / 「変更」「保存」「キャンセル」 button は全撤去.
    //   常時 input + 7 個の曜日 checkbox + PriorityStars + 「削除」 button が表示される.
    //   それに合わせて旧 it ブロックを新流儀に書き換える.
    it("ルート要素は <li class='routine-card'> であり routine-card--editing modifier は付かない", async () => {
      const { RoutineCard } = await importRoutineCard();
      const routine = makeRoutine({ name: "朝の運動" });
      const { container } = render(
        <RoutineCard
          routine={routine}
          onNameBlur={() => {}}
          onDaysOfWeekChange={() => {}}
          onDefaultPriorityChange={() => {}}
          onDelete={() => {}}
        />,
      );
      const root = container.firstElementChild as HTMLElement | null;
      expect(root, "RoutineCard の root 要素が見つからない").not.toBeNull();
      expect(root?.tagName.toLowerCase()).toBe("li");
      expect(root?.classList.contains("routine-card")).toBe(true);
      // : routine-card--editing modifier は撤去.
      expect(
        root?.classList.contains("routine-card--editing"),
        "routine-card--editing modifier が残存",
      ).toBe(false);
    });

    it(": .routine-card__name span が撤去され, name は input で常時表示される", async () => {
      const { RoutineCard } = await importRoutineCard();
      const routine = makeRoutine({ id: "r1", name: "朝の運動" });
      const { container } = render(
        <RoutineCard
          routine={routine}
          onNameBlur={() => {}}
          onDaysOfWeekChange={() => {}}
          onDefaultPriorityChange={() => {}}
          onDelete={() => {}}
        />,
      );
      // span は撤去.
      const nameSpan = container.querySelector(".routine-card__name");
      expect(nameSpan, ".routine-card__name span が残存").toBeNull();
      // input が常時表示.
      const input = container.querySelector("input#routine-name-r1") as HTMLInputElement | null;
      expect(input, "input#routine-name-r1 が無い").not.toBeNull();
      expect(input?.value).toBe("朝の運動");
    });

    it(": .routine-card__days-label span が撤去され, 曜日は checkbox 7 個で常時表示される", async () => {
      const { RoutineCard } = await importRoutineCard();
      const routine = makeRoutine({ daysOfWeek: [1, 3, 5] }); // 月水金
      const { container } = render(
        <RoutineCard
          routine={routine}
          onNameBlur={() => {}}
          onDaysOfWeekChange={() => {}}
          onDefaultPriorityChange={() => {}}
          onDelete={() => {}}
        />,
      );
      // days-label span は撤去.
      const daysLabel = container.querySelector(".routine-card__days-label");
      expect(daysLabel, ".routine-card__days-label span が残存").toBeNull();
      // checkbox 7 個が常時表示.
      const group = container.querySelector("div[role='group'][aria-label='曜日']");
      expect(group, "div[role='group'][aria-label='曜日'] が見つからない").not.toBeNull();
      const checkboxes = Array.from(group?.querySelectorAll("input[type='checkbox']") ?? []);
      expect(checkboxes.length, "曜日 checkbox が 7 個ではない").toBe(7);
    });

    it(": .routine-card__actions 内に「変更」 button は存在せず, 「削除」 button が 1 個存在する", async () => {
      const { RoutineCard } = await importRoutineCard();
      const routine = makeRoutine();
      const { container } = render(
        <RoutineCard
          routine={routine}
          onNameBlur={() => {}}
          onDaysOfWeekChange={() => {}}
          onDefaultPriorityChange={() => {}}
          onDelete={() => {}}
        />,
      );
      const actions = container.querySelector(".routine-card__actions");
      expect(actions, ".routine-card__actions が見つからない").not.toBeNull();
      const buttons = Array.from(actions?.querySelectorAll("button") ?? []);
      const labels = buttons.map((b) => b.textContent?.trim() ?? "");
      expect(labels, "「変更」 button が残存").not.toContain("変更");
      expect(labels.filter((t) => t === "削除").length, "「削除」 button が 1 個ではない").toBe(1);
    });

    it('as="div" を渡すとルートが <div> になる (D-002 維持)', async () => {
      const { RoutineCard } = await importRoutineCard();
      const routine = makeRoutine();
      const { container } = render(
        <RoutineCard
          as="div"
          routine={routine}
          onNameBlur={() => {}}
          onDaysOfWeekChange={() => {}}
          onDefaultPriorityChange={() => {}}
          onDelete={() => {}}
        />,
      );
      const root = container.firstElementChild as HTMLElement | null;
      expect(root?.tagName.toLowerCase()).toBe("div");
      expect(root?.classList.contains("routine-card")).toBe(true);
    });

    it("「削除」 button をクリックすると onDelete が呼ばれる", async () => {
      const { RoutineCard } = await importRoutineCard();
      const routine = makeRoutine();
      const onDelete = vi.fn();
      const { container } = render(
        <RoutineCard
          routine={routine}
          onNameBlur={() => {}}
          onDaysOfWeekChange={() => {}}
          onDefaultPriorityChange={() => {}}
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
   *    かつ form 内に div.routine-card__day-checkboxes
   *    かつ form 内に <button type="submit">保存</button>
   *    かつ form 内に <button type="button">キャンセル</button>
   *
   *   (routine-card-edit-fields) 追従: 編集モード form の DOM 構造に
   *   `.routine-card__day-checkboxes` (7 個の曜日 checkbox) を追加.
   *   旧 現状は編集モードに曜日 UI が無いことを前提にしていたが,
   *   本 BL で曜日 UI 存在検証へ逆転する (R-001 / P-005).
   */
  describe("AC-10: <RoutineCard> の常時表示モードに name input / 曜日 checkbox 7 個 / PriorityStars が含まれる", () => {
    // (inline-edit-all-cards) 追従:
    //   旧 / / 現状は isEditing=true の編集モードで
    //   form / 保存 / キャンセル / 7 曜日 checkbox / PriorityStars を assert していた.
    //   現状「編集モード」概念ごと撤去 (REQ-3 / G-3). isEditing prop / editing* 系 prop は撤去.
    //   常時 input + 7 曜日 checkbox + PriorityStars が表示モードで描画される.
    //   form / 保存 / キャンセル button は撤去. 「削除」 button のみ残る.
    it(": ルートは <li class='routine-card'> であり routine-card--editing modifier は付かない", async () => {
      const { RoutineCard } = await importRoutineCard();
      const routine = makeRoutine();
      const { container } = render(
        <RoutineCard
          routine={routine}
          onNameBlur={() => {}}
          onDaysOfWeekChange={() => {}}
          onDefaultPriorityChange={() => {}}
          onDelete={() => {}}
        />,
      );
      const root = container.firstElementChild as HTMLElement | null;
      expect(root, "RoutineCard の root 要素が見つからない").not.toBeNull();
      expect(root?.tagName.toLowerCase()).toBe("li");
      expect(root?.classList.contains("routine-card")).toBe(true);
      expect(
        root?.classList.contains("routine-card--editing"),
        "routine-card--editing modifier が残存",
      ).toBe(false);
    });

    it(": <form aria-label='ルーティン名称変更フォーム'> は存在しない (= 編集モード form 撤去)", async () => {
      const { RoutineCard } = await importRoutineCard();
      const routine = makeRoutine();
      const { container } = render(
        <RoutineCard
          routine={routine}
          onNameBlur={() => {}}
          onDaysOfWeekChange={() => {}}
          onDefaultPriorityChange={() => {}}
          onDelete={() => {}}
        />,
      );
      const form = container.querySelector("form[aria-label='ルーティン名称変更フォーム']");
      expect(form, "編集モード form が残存").toBeNull();
    });

    it(": visually-hidden な <label>ルーティン名</label> + <input> が常時表示で htmlFor と id が一致する", async () => {
      const { RoutineCard } = await importRoutineCard();
      const routine = makeRoutine({ id: "r1" });
      const { container } = render(
        <RoutineCard
          routine={routine}
          onNameBlur={() => {}}
          onDaysOfWeekChange={() => {}}
          onDefaultPriorityChange={() => {}}
          onDelete={() => {}}
        />,
      );
      const label = container.querySelector("label[for='routine-name-r1']");
      const input = container.querySelector("input#routine-name-r1");
      expect(label, "label[for='routine-name-r1'] が無い").not.toBeNull();
      expect(input, "input#routine-name-r1 が無い").not.toBeNull();
      expect(label?.classList.contains("visually-hidden")).toBe(true);
      expect(label?.textContent ?? "").toContain("ルーティン名");
      expect(label?.getAttribute("for")).toBe(input?.getAttribute("id"));
    });

    it(": 「保存」「キャンセル」 button が存在しない (= 編集モード撤去)", async () => {
      const { RoutineCard } = await importRoutineCard();
      const routine = makeRoutine();
      const { container } = render(
        <RoutineCard
          routine={routine}
          onNameBlur={() => {}}
          onDaysOfWeekChange={() => {}}
          onDefaultPriorityChange={() => {}}
          onDelete={() => {}}
        />,
      );
      const labels = Array.from(container.querySelectorAll("button")).map(
        (b) => b.textContent?.trim() ?? "",
      );
      expect(labels, "「保存」 button が残存").not.toContain("保存");
      expect(labels, "「キャンセル」 button が残存").not.toContain("キャンセル");
    });

    it(": 常時表示モードに .routine-card__day-checkboxes (7 個の曜日 checkbox) が存在する", async () => {
      const { RoutineCard } = await importRoutineCard();
      const routine = makeRoutine({ daysOfWeek: [1] });
      const { container } = render(
        <RoutineCard
          routine={routine}
          onNameBlur={() => {}}
          onDaysOfWeekChange={() => {}}
          onDefaultPriorityChange={() => {}}
          onDelete={() => {}}
        />,
      );
      const dayCheckboxes = container.querySelector(".routine-card__day-checkboxes");
      expect(dayCheckboxes, ".routine-card__day-checkboxes が無い").not.toBeNull();
      expect(dayCheckboxes?.getAttribute("role")).toBe("group");
      expect(dayCheckboxes?.getAttribute("aria-label")).toBe("曜日");
      const checkboxes = Array.from(
        dayCheckboxes?.querySelectorAll("input[type='checkbox']") ?? [],
      );
      expect(checkboxes.length, "曜日 checkbox が 7 個ではない").toBe(7);
    });

    it(": 常時表示モードに <PriorityStars /> (= div[role='radiogroup']) が存在する", async () => {
      const { RoutineCard } = await importRoutineCard();
      const routine = makeRoutine();
      const { container } = render(
        <RoutineCard
          routine={routine}
          onNameBlur={() => {}}
          onDaysOfWeekChange={() => {}}
          onDefaultPriorityChange={() => {}}
          onDelete={() => {}}
        />,
      );
      const radiogroup = container.querySelector("div[role='radiogroup']");
      expect(radiogroup, "<PriorityStars /> (= div[role='radiogroup']) が無い").not.toBeNull();
      const stars = Array.from(radiogroup?.querySelectorAll("button[role='radio']") ?? []);
      expect(stars.length, "PriorityStars の星 button が 3 個ではない").toBe(3);
    });

    it(": 「変更」 button も存在しない (= 編集モード概念撤去)", async () => {
      const { RoutineCard } = await importRoutineCard();
      const routine = makeRoutine();
      const { container } = render(
        <RoutineCard
          routine={routine}
          onNameBlur={() => {}}
          onDaysOfWeekChange={() => {}}
          onDefaultPriorityChange={() => {}}
          onDelete={() => {}}
        />,
      );
      const labels = Array.from(container.querySelectorAll("button")).map(
        (b) => b.textContent?.trim() ?? "",
      );
      expect(labels, "「変更」 button が残存").not.toContain("変更");
    });

    it(": input の blur で onNameBlur が呼ばれる (onSaveEdit / form onSubmit 経路は撤去)", async () => {
      const { RoutineCard } = await importRoutineCard();
      const routine = makeRoutine({ id: "r1", name: "古い" });
      const onNameBlur = vi.fn();
      const { container } = render(
        <RoutineCard
          routine={routine}
          onNameBlur={onNameBlur}
          onDaysOfWeekChange={() => {}}
          onDefaultPriorityChange={() => {}}
          onDelete={() => {}}
        />,
      );
      const input = container.querySelector("input#routine-name-r1") as HTMLInputElement | null;
      expect(input, "input が見つからない").not.toBeNull();
      if (!input) return;
      // 現状: React 合成 onBlur を発火するため fireEvent.blur を使う.
      fireEvent.input(input, { target: { value: "新しい" } });
      fireEvent.blur(input);
      expect(onNameBlur).toHaveBeenCalledTimes(1);
      expect(onNameBlur).toHaveBeenCalledWith("新しい");
    });
  });

  // ----------------------------------------------------------
  // AC-11: <RoutineFormCard> が作成フォームを描画する (主要要素)
  // ----------------------------------------------------------
  /**
   * シナリオ AC-11:
   *   Given <RoutineFormCard name="" daysOfWeek={[1]} defaultPriority="normal" ... /> を render
   *   When  出力 DOM を観察する
   *   Then  ルートは <form aria-label="ルーティン作成フォーム" class="routine-card routine-card--form">
   *    かつ visually-hidden label + <input id="routine-name"> + 「追加」 submit button が存在する
   *    かつ .routine-card__day-checkboxes (内に 7 個の checkbox) + div[role="radiogroup"] (PriorityStars) が存在する
   *    かつ getByLabelText("ルーティン名") で name input が取得可能
   *
   *   (routine-card-edit-fields) 追従: 旧 <select id="routine-priority"> 系 assert を
   *   <PriorityStars /> (= div[role="radiogroup"]) の存在 assert に逆転 (R-001 / P-005).
   *   (routine-form-card-header-layout) 追従:
   *     旧 現状は「`.routine-card__form-row` が 2 個」を assert していたが,
   *     現状起票カードを 4 段 (`.routine-card__header` / `__title` /
   *     `__day-checkboxes` / `__actions`) に再編し `.routine-card__form-row` 系を完全撤去するため,
   *     「2 段構成」 assert と「1 段目に input + submit が同居 / 2 段目に曜日 + PriorityStars が同居」
   *     系 assert は廃止. 代替として「主要要素が描画される」までを保つ.
   *     起票カードの新 DOM 構造の網羅 assert は `routine-form-card-header-layout.test.tsx` に集約.
   */
  describe("AC-11: <RoutineFormCard> が作成フォームを描画する (主要要素)", () => {
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

    it("visually-hidden な <label htmlFor='routine-name'>ルーティン名</label> + <input id='routine-name'> + 「追加」 submit button が form 内に存在する", async () => {
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
      const label = container.querySelector("label[for='routine-name']") as HTMLLabelElement | null;
      const input = container.querySelector("input#routine-name") as HTMLInputElement | null;
      expect(label, "form 内に label[for='routine-name'] が無い").not.toBeNull();
      expect(input, "form 内に input#routine-name が無い").not.toBeNull();
      expect(label?.classList.contains("visually-hidden")).toBe(true);
      expect(label?.textContent ?? "").toContain("ルーティン名");
      expect(input?.getAttribute("type")).toBe("text");
      // 「追加」 submit button.
      const buttons = Array.from(container.querySelectorAll("button"));
      const submit = buttons.find((b) => (b.textContent ?? "").trim() === "追加");
      expect(submit, "form 内に「追加」 submit button が無い").toBeDefined();
      expect(submit?.getAttribute("type")).toBe("submit");
    });

    it(".routine-card__day-checkboxes が存在し 7 個の checkbox <input> を含む", async () => {
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
      expect(dayCheckboxes, "form 内に .routine-card__day-checkboxes が無い").not.toBeNull();
      const checkboxes = Array.from(
        dayCheckboxes?.querySelectorAll("input[type='checkbox']") ?? [],
      );
      expect(checkboxes.length, "曜日 checkbox が 7 個ではない").toBe(7);
    });

    it("div[role='radiogroup'] (PriorityStars) が存在し 3 個の星 button (role='radio') を含む", async () => {
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
      // : 旧 <select id="routine-priority"> 系 assert を <PriorityStars /> 存在 assert に逆転.
      const radiogroup = container.querySelector("div[role='radiogroup']");
      expect(
        radiogroup,
        "form 内に <PriorityStars /> (= div[role='radiogroup']) が無い",
      ).not.toBeNull();
      const stars = Array.from(radiogroup?.querySelectorAll("button[role='radio']") ?? []);
      expect(stars.length, "PriorityStars の星 button が 3 個ではない").toBe(3);
      // 旧 <select id="routine-priority"> が残存していないこと.
      const select = container.querySelector("select#routine-priority");
      expect(select, "form 内に <select id='routine-priority'> が残っている").toBeNull();
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
  describe("AC-13: 「変更」 button が撤去されている", () => {
    // 現状: 旧 現状は「変更」 button の存在を assert していたが,
    //   現状「変更」 button 自体が撤去 (REQ-3 / G-3).
    it(": 「変更」「名称変更」 button が共に存在しない", async () => {
      const { RoutineCard } = await importRoutineCard();
      const routine = makeRoutine();
      const { container } = render(
        <RoutineCard
          routine={routine}
          onNameBlur={() => {}}
          onDaysOfWeekChange={() => {}}
          onDefaultPriorityChange={() => {}}
          onDelete={() => {}}
        />,
      );
      const labels = Array.from(container.querySelectorAll("button")).map(
        (b) => b.textContent?.trim() ?? "",
      );
      expect(labels, "「変更」 button が残存").not.toContain("変更");
      expect(labels, "「名称変更」 button が残存").not.toContain("名称変更");
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

    it('<RoutineFormCard> の優先度 UI は <PriorityStars /> (radiogroup) で実現され, <label htmlFor="routine-priority"> と <select id="routine-priority"> は撤去されている', async () => {
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
      // (routine-card-edit-fields) で D-008-2 を逆転.
      // 旧: 「優先度 label を可視のまま残す」を assert
      // 新: 「優先度 label 自体を撤去し, <PriorityStars /> の groupLabel で a11y を担保」を assert
      const priorityLabel = container.querySelector("label[for='routine-priority']");
      const prioritySelect = container.querySelector("select#routine-priority");
      expect(priorityLabel, "<label htmlFor='routine-priority'> が残っている").toBeNull();
      expect(prioritySelect, "<select id='routine-priority'> が残っている").toBeNull();
      // <PriorityStars /> radiogroup の aria-label に「優先度」が含まれることで a11y を担保.
      const radiogroup = container.querySelector("div[role='radiogroup']");
      expect(radiogroup, "<PriorityStars /> radiogroup が無い").not.toBeNull();
      const ariaLabel = radiogroup?.getAttribute("aria-label") ?? "";
      expect(ariaLabel, "radiogroup の aria-label に「優先度」が含まれていない").toContain(
        "優先度",
      );
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

    it(": <RoutineCard> の 「ルーティン名称変更フォーム」 form は撤去されている (= 編集モード form 廃止)", async () => {
      const { RoutineCard } = await importRoutineCard();
      const routine = makeRoutine();
      const { container } = render(
        <RoutineCard
          routine={routine}
          onNameBlur={() => {}}
          onDaysOfWeekChange={() => {}}
          onDefaultPriorityChange={() => {}}
          onDelete={() => {}}
        />,
      );
      const form = container.querySelector("form[aria-label='ルーティン名称変更フォーム']");
      expect(form, "ルーティン名称変更フォーム form が残存").toBeNull();
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
