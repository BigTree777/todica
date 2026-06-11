// @vitest-environment node

/**
 * 起票フォームのカード化 (BL-054 / form-card-design) 受け入れ基準テスト.
 *
 * 仕様参照:
 *   docs/developer/features/form-card-design/spec.md
 *   docs/developer/features/form-card-design/plan.md
 *   docs/developer/features/form-card-design/tasks.md
 *
 * 本ファイルは BL-054 の TDD red を作る原ファイルだが,
 * BL-059 (task-card-component) で起票カードの責務を `.day-view__form` から
 * `.task-card.task-card--form` へ全面移譲したため,
 * AC-1 / AC-2 / AC-6 / AC-7 / AC-8 の assertion を「新クラスでの確認」+
 * 「旧クラスが撤去されていることの確認」へ書き換えた (D-009 / D-011).
 *
 * BL-054 当時の意図 → BL-059 で新クラスへ移譲:
 *   - .day-view__form の visual 4 宣言 = `.task-card` (基底) で網羅される.
 *   - .day-view__form の grid layout (BL-058) = 3 段 flex column 構造 (.task-card__header /
 *     .task-card__title / .task-card__actions) に置換される.
 *   - JSX の <form className="day-view__form"> = <TaskFormCard /> 経由の
 *     <form className="task-card task-card--form"> に置換される.
 *
 * 本ファイルが検証する受け入れ基準:
 *   AC-1 (BL-059 追従): 起票フォームの visual 4 宣言が `.task-card` セレクタに移譲されている.
 *   AC-2 (BL-059 追従): 起票フォームの layout が `.task-card` 系 3 段 flex column 構造に
 *                       置換されている (= .day-view__form の grid layout は撤去).
 *   AC-3 (BL-059 追従): .task-card 系セレクタに hover / transition / animation / box-shadow 無し.
 *   AC-4: day-view.css / task-card.css 全体で box-shadow を追加していない.
 *   AC-5: tokens.css が無改修.
 *   AC-6 (BL-059 追従): today-view / tomorrow-view から day-view__form クラスが撤去されている.
 *   AC-7 (BL-059 追従): 旧 .day-view__form セレクタは day-view.css から撤去されている.
 *   AC-8: focus-view.css が無改修.
 *   AC-9: 既存テストファイルが存在する (回帰検出の前提).
 *   AC-10: a11y E2E ファイルが存在する (回帰検出の前提).
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(__dirname, "../..");
const webSrcRoot = resolve(repoRoot, "web/src");
const dayViewCssPath = resolve(webSrcRoot, "ui/day-view/day-view.css");
// BL-059 で新設された task-card.css.
const taskCardCssPath = resolve(webSrcRoot, "ui/task-card/task-card.css");
const tokensCssPath = resolve(webSrcRoot, "styles/tokens.css");
const todayViewTsxPath = resolve(webSrcRoot, "ui/today-view/today-view.tsx");
const tomorrowViewTsxPath = resolve(webSrcRoot, "ui/tomorrow-view/tomorrow-view.tsx");
const focusViewCssPath = resolve(webSrcRoot, "ui/focus-view/focus-view.css");

/**
 * 指定したセレクタの「ルール本文 (= {} で囲まれた中身)」を抽出する.
 *
 * BL-052 / BL-054 / BL-056 / BL-057 / BL-058 / BL-059 と同形式 (P-005).
 */
function extractRuleBody(css: string, selector: string): string | null {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`, "m");
  const m = css.match(re);
  return m?.[1] ?? null;
}

describe("起票フォームのカード化 (BL-054 / form-card-design, BL-059 で .task-card へ移譲)", () => {
  /**
   * AC-1 (BL-059 追従): BL-054 で確定した visual 4 宣言が `.task-card` セレクタに移譲されている.
   *
   * BL-054 当時: .day-view__form に background / border / border-radius / padding を追加.
   * BL-059 で: 同じ visual 4 宣言は `.task-card` 基底に集約され,
   *            `.day-view__form` セレクタは撤去された.
   */
  describe("AC-1 (BL-059 追従): 起票フォームの visual 4 宣言が .task-card に移譲されている", () => {
    it("task-card.css が存在する", () => {
      expect(existsSync(taskCardCssPath)).toBe(true);
    });

    it(".task-card ルール本文に background: var(--color-bg) を含む", () => {
      const css = readFileSync(taskCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".task-card");
      expect(body, ".task-card ルールが見つからない").not.toBeNull();
      expect(body ?? "").toMatch(/background(?:-color)?\s*:\s*var\(--color-bg\)/);
    });

    it(".task-card ルール本文に border: 1px solid var(--color-border) (または等価分解) を含む", () => {
      const css = readFileSync(taskCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".task-card");
      expect(body, ".task-card ルールが見つからない").not.toBeNull();
      const bodyText = body ?? "";
      const hasShorthand = /border\s*:\s*1px\s+solid\s+var\(--color-border\)/.test(bodyText);
      const hasDecomposed =
        /border-width\s*:\s*1px/.test(bodyText) &&
        /border-style\s*:\s*solid/.test(bodyText) &&
        /border-color\s*:\s*var\(--color-border\)/.test(bodyText);
      expect(
        hasShorthand || hasDecomposed,
        ".task-card に border: 1px solid var(--color-border) 等価宣言が無い",
      ).toBe(true);
    });

    it(".task-card ルール本文に border-radius: var(--radius-lg) を含む (BL-054 の --radius-md は BL-059 で --radius-lg に統一)", () => {
      const css = readFileSync(taskCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".task-card");
      expect(body, ".task-card ルールが見つからない").not.toBeNull();
      expect(body ?? "").toMatch(/border-radius\s*:\s*var\(--radius-lg\)/);
    });

    it(".task-card ルール本文に padding: var(--space-md) を含む", () => {
      const css = readFileSync(taskCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".task-card");
      expect(body, ".task-card ルールが見つからない").not.toBeNull();
      expect(body ?? "").toMatch(/(?:^|;|\n)\s*padding\s*:\s*var\(--space-md\)/);
    });
  });

  /**
   * AC-2 (BL-059 追従): 起票フォームの layout が 3 段 flex column 構造に置換されている.
   *
   * BL-054 当時: .day-view__form は display: flex / flex-direction: column / gap: --space-sm.
   * BL-058 で: display: grid + grid-template-areas (2D 配置) に変更.
   * BL-059 で: 全てを撤去し, .task-card 系の 3 段 flex column 構造に統一.
   */
  describe("AC-2 (BL-059 追従): 起票フォーム layout は .task-card 系 3 段 flex column", () => {
    it(".task-card ルール本文に display: flex / flex-direction: column を含む (= 3 段 flex column)", () => {
      const css = readFileSync(taskCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".task-card");
      expect(body, ".task-card ルールが見つからない").not.toBeNull();
      const bodyText = body ?? "";
      expect(bodyText).toMatch(/display\s*:\s*flex/);
      expect(bodyText).toMatch(/flex-direction\s*:\s*column/);
    });

    it(".task-card--form ルールが task-card.css に定義されている (起票フォーム差分用の空ルール / P-004)", () => {
      const css = readFileSync(taskCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".task-card--form");
      expect(
        body,
        ".task-card--form ルールが見つからない (BL-059 P-004: 起票フォーム差分用の空ルールも定義しておく)",
      ).not.toBeNull();
    });

    it("旧 .day-view__form の grid 系宣言が day-view.css に残存していない (= ルールごと撤去)", () => {
      const css = readFileSync(dayViewCssPath, "utf-8");
      expect(extractRuleBody(css, ".day-view__form")).toBeNull();
    });
  });

  /**
   * AC-3 (BL-059 追従): .task-card 系セレクタに hover / transition / animation / box-shadow 無し.
   */
  describe("AC-3 (BL-059 追従): .task-card 系に hover / transition / animation / box-shadow 無し", () => {
    it("task-card.css の全文に box-shadow キーワードが含まれない", () => {
      const css = readFileSync(taskCardCssPath, "utf-8");
      expect(css).not.toContain("box-shadow");
    });

    it("task-card.css の全文に transition 宣言が含まれない", () => {
      const css = readFileSync(taskCardCssPath, "utf-8");
      expect(css).not.toMatch(/(?:^|;|\n|\{)\s*transition\s*:/);
    });

    it("task-card.css の全文に animation 宣言が含まれない", () => {
      const css = readFileSync(taskCardCssPath, "utf-8");
      expect(css).not.toMatch(/(?:^|;|\n|\{)\s*animation\s*:/);
    });

    it("task-card.css に .task-card:hover / .task-card--form:hover セレクタが存在しない", () => {
      const css = readFileSync(taskCardCssPath, "utf-8");
      expect(css).not.toContain(".task-card:hover");
      expect(css).not.toContain(".task-card--form:hover");
      expect(css).not.toContain(".task-card--form:focus-within");
    });
  });

  /**
   * AC-4: day-view.css 全体で box-shadow を追加していない (NFR-NO-SHADOW).
   */
  describe("AC-4: day-view.css 全体に box-shadow が含まれない", () => {
    it("day-view.css の全文に box-shadow キーワードが含まれない", () => {
      const css = readFileSync(dayViewCssPath, "utf-8");
      expect(css).not.toContain("box-shadow");
    });
  });

  /**
   * AC-5: tokens.css を変更していない (必須トークンが残っている).
   */
  describe("AC-5: tokens.css が変更されていない (必須トークンが残っている)", () => {
    it("tokens.css に本 BL で参照する 4 トークン (--color-bg / --color-border / --radius-lg / --space-md) が定義されている", () => {
      const css = readFileSync(tokensCssPath, "utf-8");
      expect(css).toMatch(/--color-bg\s*:/);
      expect(css).toMatch(/--color-border\s*:/);
      expect(css).toMatch(/--radius-lg\s*:/);
      expect(css).toMatch(/--space-md\s*:/);
    });

    it("tokens.css に --space-sm トークンが定義されている", () => {
      const css = readFileSync(tokensCssPath, "utf-8");
      expect(css).toMatch(/--space-sm\s*:/);
    });

    it("tokens.css に --shadow-* トークンが存在しない (NFR-NO-NEW-TOKENS)", () => {
      const css = readFileSync(tokensCssPath, "utf-8");
      expect(css).not.toMatch(/--shadow-/);
    });
  });

  /**
   * AC-6 (BL-059 追従): today-view / tomorrow-view から day-view__form クラスが撤去されている.
   *
   * BL-054 当時は <form className="day-view__form"> が直書きされていたが,
   * BL-059 で <TaskFormCard /> 経由の <form className="task-card task-card--form"> に置換.
   */
  describe("AC-6 (BL-059 追従): JSX から day-view__form クラスが撤去されている", () => {
    it("today-view.tsx に className='day-view__form' が含まれない (BL-059 で撤去)", () => {
      const tsx = readFileSync(todayViewTsxPath, "utf-8");
      expect(tsx).not.toMatch(/className=["'][^"']*day-view__form[^"']*["']/);
    });

    it("tomorrow-view.tsx に className='day-view__form' が含まれない (BL-059 で撤去)", () => {
      const tsx = readFileSync(tomorrowViewTsxPath, "utf-8");
      expect(tsx).not.toMatch(/className=["'][^"']*day-view__form[^"']*["']/);
    });

    it("today-view.tsx / tomorrow-view.tsx は <TaskFormCard ... /> を利用している (BL-059 REQ-4 / REQ-5)", () => {
      const today = readFileSync(todayViewTsxPath, "utf-8");
      const tomorrow = readFileSync(tomorrowViewTsxPath, "utf-8");
      expect(today).toMatch(/<TaskFormCard\b/);
      expect(tomorrow).toMatch(/<TaskFormCard\b/);
    });
  });

  /**
   * AC-7 (BL-059 追従): 旧 .day-view__form セレクタは day-view.css から撤去されている.
   */
  describe("AC-7 (BL-059 追従): 旧 .day-view__form 系セレクタは day-view.css から撤去", () => {
    const REMOVED_FORM_SELECTORS = [
      ".day-view__form",
      ".day-view__form__project",
      ".day-view__form__priority",
      ".day-view__form__priority-hint",
      ".day-view__form__name",
      ".day-view__form__submit",
    ] as const;

    it.each(REMOVED_FORM_SELECTORS)("%s ルールが day-view.css に定義されていない", (selector) => {
      const css = readFileSync(dayViewCssPath, "utf-8");
      const body = extractRuleBody(css, selector);
      expect(
        body,
        `${selector} ルールが day-view.css に残存している (BL-059 で .task-card 系へ移譲済み)`,
      ).toBeNull();
    });
  });

  /**
   * AC-8: focus-view (/focus) の CSS に day-view__form 系セレクタが混入していない.
   */
  describe("AC-8: focus-view.css に .day-view__form 系セレクタが混入していない", () => {
    it("focus-view.css に .day-view__form セレクタが含まれない", () => {
      const css = readFileSync(focusViewCssPath, "utf-8");
      expect(css).not.toContain(".day-view__form");
    });

    it("focus-view.css に .day-view 系セレクタ全般が含まれない (名前空間の分離)", () => {
      const css = readFileSync(focusViewCssPath, "utf-8");
      expect(css).not.toContain(".day-view__card");
      expect(css).not.toContain(".day-view__list");
      expect(css).not.toContain(".day-view__header");
    });
  });

  /**
   * AC-9: 既存テスト全件 green 維持の前提として, 関連テストファイルが存在する.
   */
  describe("AC-9: 既存テスト回帰検出の前提が存在する", () => {
    it.each([
      "web/__tests__/today-view.test.tsx",
      "web/__tests__/tomorrow-view.test.tsx",
      "web/__tests__/unified-day-view.test.tsx",
      "web/__tests__/task-card-design.test.ts",
      "web/__tests__/design-tokens.test.ts",
    ])("%s が存在する", (relativePath) => {
      expect(existsSync(resolve(repoRoot, relativePath))).toBe(true);
    });
  });

  /**
   * AC-10: a11y E2E スキャンの前提が存在する.
   */
  describe("AC-10: a11y E2E スキャンの前提が存在する", () => {
    it("e2e/a11y.spec.ts が存在する", () => {
      expect(existsSync(resolve(repoRoot, "e2e/a11y.spec.ts"))).toBe(true);
    });
  });
});
