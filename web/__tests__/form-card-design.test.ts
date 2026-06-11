// @vitest-environment node

/**
 * 起票フォームのカード化 (BL-054 / form-card-design) 受け入れ基準テスト.
 *
 * 仕様参照:
 *   docs/developer/features/form-card-design/spec.md
 *   docs/developer/features/form-card-design/plan.md
 *   docs/developer/features/form-card-design/tasks.md
 *
 * 本ファイルが検証する受け入れ基準:
 *   AC-1: .day-view__form に縁・背景・角丸・余白が定義されている.
 *   AC-2: 既存の構造系宣言 (display / flex-direction / gap) が維持されている.
 *   AC-3: .day-view__form 周辺に hover / transition / animation / box-shadow が無い.
 *   AC-4: day-view.css 全体で box-shadow が含まれない (NFR-NO-SHADOW).
 *   AC-5: tokens.css が無改修 (本 BL で参照する 4 トークンが残っている).
 *   AC-6: JSX (today-view.tsx / tomorrow-view.tsx) に day-view__form クラスが付与されている.
 *   AC-7: 本 BL の対象セレクタは .day-view__form に限定されている (他セレクタへの visual 追加無し).
 *   AC-8: focus-view (/focus) の CSS が無改修 (= .day-view__form セレクタが混入していない).
 *   AC-9: 既存テストが存在する (回帰検出の前提).
 *   AC-10: a11y E2E が存在する (回帰検出の前提).
 *
 * 本ファイルは TDD の "red" を作るためのテスト.
 *   - day-view.css の .day-view__form に visual 宣言が無い状態では AC-1 が失敗する.
 *   - implementer が REQ-1 を実装することで green 化する.
 *
 * 検証スタイル: BL-052 (web/__tests__/task-card-design.test.ts) と同じ
 * 「CSS を readFileSync で読み込んで宣言の存在を expect(content).toMatch / toContain で assert する」方式.
 * `extractRuleBody` ヘルパは P-005 に従い本ファイル内に再定義する (= test ファイル間で同等の小関数を持つ).
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(__dirname, "../..");
const webSrcRoot = resolve(repoRoot, "web/src");
const dayViewCssPath = resolve(webSrcRoot, "ui/day-view/day-view.css");
const tokensCssPath = resolve(webSrcRoot, "styles/tokens.css");
const todayViewTsxPath = resolve(webSrcRoot, "ui/today-view/today-view.tsx");
const tomorrowViewTsxPath = resolve(webSrcRoot, "ui/tomorrow-view/tomorrow-view.tsx");
const focusViewCssPath = resolve(webSrcRoot, "ui/focus-view/focus-view.css");

/**
 * 指定したセレクタの「ルール本文 (= {} で囲まれた中身)」を抽出する.
 *
 * 単純な /selector\s*\{([^}]*)\}/ では `.day-view__form` が
 * `.day-view__form:hover` などの派生セレクタにも一致してしまう可能性があるため,
 * セレクタ末尾を `{` / 空白で厳密に区切る.
 *
 * BL-052 (task-card-design.test.ts) に存在する同等実装を再定義する (P-005).
 */
function extractRuleBody(css: string, selector: string): string | null {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // セレクタの直後が空白 + `{` であるルールに限定する.
  const re = new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`, "m");
  const m = css.match(re);
  return m?.[1] ?? null;
}

describe("起票フォームのカード化 (BL-054 / form-card-design)", () => {
  /**
   * AC-1: 起票フォーム (.day-view__form) に縁・背景・角丸・余白が定義されている.
   *
   * シナリオ AC-1:
   *   Given web/src/ui/day-view/day-view.css を開いた
   *   When  .day-view__form セレクタのルール本文を観察する
   *   Then  background プロパティに var(--color-bg) を参照する宣言を含む
   *    かつ border プロパティに 1px solid var(--color-border) を参照する宣言を含む
   *    かつ border-radius プロパティに var(--radius-md) を参照する宣言を含む
   *    かつ padding プロパティに var(--space-md) を参照する宣言を含む
   */
  describe("AC-1: .day-view__form に visual 宣言が追加されている", () => {
    it("day-view.css が存在する", () => {
      expect(existsSync(dayViewCssPath)).toBe(true);
    });

    it(".day-view__form ルール本文に background: var(--color-bg) を含む", () => {
      const css = readFileSync(dayViewCssPath, "utf-8");
      const body = extractRuleBody(css, ".day-view__form");
      expect(body, ".day-view__form ルールが見つからない").not.toBeNull();
      // background または background-color shorthand のいずれかで OK とする.
      expect(body ?? "").toMatch(/background(?:-color)?\s*:\s*var\(--color-bg\)/);
    });

    it(".day-view__form ルール本文に border: 1px solid var(--color-border) (または等価分解) を含む", () => {
      const css = readFileSync(dayViewCssPath, "utf-8");
      const body = extractRuleBody(css, ".day-view__form");
      expect(body, ".day-view__form ルールが見つからない").not.toBeNull();
      const bodyText = body ?? "";
      // shorthand `border: 1px solid var(--color-border)` または
      // border-width / border-style / border-color の分解いずれかで OK.
      const hasShorthand = /border\s*:\s*1px\s+solid\s+var\(--color-border\)/.test(bodyText);
      const hasDecomposed =
        /border-width\s*:\s*1px/.test(bodyText) &&
        /border-style\s*:\s*solid/.test(bodyText) &&
        /border-color\s*:\s*var\(--color-border\)/.test(bodyText);
      expect(
        hasShorthand || hasDecomposed,
        ".day-view__form に border: 1px solid var(--color-border) 等価宣言が無い",
      ).toBe(true);
    });

    it(".day-view__form ルール本文に border-radius: var(--radius-md) を含む", () => {
      const css = readFileSync(dayViewCssPath, "utf-8");
      const body = extractRuleBody(css, ".day-view__form");
      expect(body, ".day-view__form ルールが見つからない").not.toBeNull();
      expect(body ?? "").toMatch(/border-radius\s*:\s*var\(--radius-md\)/);
    });

    it(".day-view__form ルール本文に padding: var(--space-md) を含む", () => {
      const css = readFileSync(dayViewCssPath, "utf-8");
      const body = extractRuleBody(css, ".day-view__form");
      expect(body, ".day-view__form ルールが見つからない").not.toBeNull();
      // gap: var(--space-sm) と誤検知しないよう padding: で始まる宣言に限定する.
      expect(body ?? "").toMatch(/(?:^|;|\n)\s*padding\s*:\s*var\(--space-md\)/);
    });
  });

  /**
   * AC-2: 既存の構造系宣言 (display / flex-direction / gap) が維持されている.
   *
   * シナリオ AC-2:
   *   Given web/src/ui/day-view/day-view.css を開いた
   *   When  .day-view__form セレクタのルール本文を観察する
   *   Then  display: flex の宣言を含む
   *    かつ flex-direction: column の宣言を含む
   *    かつ gap: var(--space-sm) の宣言を含む
   */
  describe("AC-2: .day-view__form の既存構造系宣言が維持されている (回帰防止)", () => {
    it(".day-view__form ルール本文に display: flex を含む", () => {
      const css = readFileSync(dayViewCssPath, "utf-8");
      const body = extractRuleBody(css, ".day-view__form");
      expect(body, ".day-view__form ルールが見つからない").not.toBeNull();
      expect(body ?? "").toMatch(/display\s*:\s*flex/);
    });

    it(".day-view__form ルール本文に flex-direction: column を含む", () => {
      const css = readFileSync(dayViewCssPath, "utf-8");
      const body = extractRuleBody(css, ".day-view__form");
      expect(body, ".day-view__form ルールが見つからない").not.toBeNull();
      expect(body ?? "").toMatch(/flex-direction\s*:\s*column/);
    });

    it(".day-view__form ルール本文に gap: var(--space-sm) を含む", () => {
      const css = readFileSync(dayViewCssPath, "utf-8");
      const body = extractRuleBody(css, ".day-view__form");
      expect(body, ".day-view__form ルールが見つからない").not.toBeNull();
      expect(body ?? "").toMatch(/gap\s*:\s*var\(--space-sm\)/);
    });
  });

  /**
   * AC-3: 起票フォームに hover / transition / animation / box-shadow が追加されていない.
   *
   * シナリオ AC-3:
   *   Given web/src/ui/day-view/day-view.css を開いた
   *   When  .day-view__form セレクタおよびその :hover / :focus-within 派生セレクタを観察する
   *   Then  box-shadow プロパティを宣言していない
   *    かつ transition プロパティを宣言していない
   *    かつ animation プロパティを宣言していない
   *    かつ .day-view__form:hover / .day-view__form:focus-within のセレクタを CSS 内に持たない
   */
  describe("AC-3: .day-view__form 周辺に hover / transition / animation / box-shadow が無い", () => {
    it(".day-view__form ルール本文に box-shadow: 宣言が含まれない (D-001 / NFR-NO-SHADOW)", () => {
      const css = readFileSync(dayViewCssPath, "utf-8");
      const body = extractRuleBody(css, ".day-view__form");
      expect(body, ".day-view__form ルールが見つからない").not.toBeNull();
      expect(body ?? "").not.toMatch(/(?:^|;|\n)\s*box-shadow\s*:/);
    });

    it(".day-view__form ルール本文に transition: 宣言が含まれない (D-006 / NFR-NO-HOVER-TRANSITION)", () => {
      const css = readFileSync(dayViewCssPath, "utf-8");
      const body = extractRuleBody(css, ".day-view__form");
      expect(body, ".day-view__form ルールが見つからない").not.toBeNull();
      expect(body ?? "").not.toMatch(/(?:^|;|\n)\s*transition\s*:/);
    });

    it(".day-view__form ルール本文に animation: 宣言が含まれない (D-006 / NFR-NO-HOVER-TRANSITION)", () => {
      const css = readFileSync(dayViewCssPath, "utf-8");
      const body = extractRuleBody(css, ".day-view__form");
      expect(body, ".day-view__form ルールが見つからない").not.toBeNull();
      expect(body ?? "").not.toMatch(/(?:^|;|\n)\s*animation\s*:/);
    });

    it("CSS ファイル全体に .day-view__form:hover セレクタが存在しない (D-006 / リスク R-1 緩和)", () => {
      const css = readFileSync(dayViewCssPath, "utf-8");
      expect(css).not.toContain(".day-view__form:hover");
    });

    it("CSS ファイル全体に .day-view__form:focus-within セレクタが存在しない (D-006 / リスク R-1 緩和)", () => {
      const css = readFileSync(dayViewCssPath, "utf-8");
      expect(css).not.toContain(".day-view__form:focus-within");
    });

    it("CSS ファイル全体に .day-view__form:active セレクタが存在しない (D-006 / リスク R-1 緩和)", () => {
      const css = readFileSync(dayViewCssPath, "utf-8");
      expect(css).not.toContain(".day-view__form:active");
    });
  });

  /**
   * AC-4: day-view.css 全体で box-shadow を追加していない (NFR-NO-SHADOW).
   *
   * シナリオ AC-4:
   *   Given web/src/ui/day-view/day-view.css を開いた
   *   When  ファイル全体を観察する
   *   Then  box-shadow キーワードを含む宣言が存在しない
   */
  describe("AC-4: day-view.css 全体に box-shadow が含まれない", () => {
    it("day-view.css の全文に box-shadow キーワードが含まれない (D-001 / NFR-NO-SHADOW)", () => {
      const css = readFileSync(dayViewCssPath, "utf-8");
      expect(css).not.toContain("box-shadow");
    });
  });

  /**
   * AC-5: tokens.css を変更していない (必須トークンが残っている).
   *
   * シナリオ AC-5:
   *   Given 本 BL の実装がマージされた
   *   When  web/src/styles/tokens.css を BL-052 完了時点の状態と比較する
   *   Then  差分が無い (新規トークンの追加・既存トークンの変更が無い)
   *    かつ 本 BL で参照する 4 トークン (--color-bg / --color-border / --radius-md / --space-md) が引き続き定義されている
   */
  describe("AC-5: tokens.css が変更されていない (必須トークンが残っている)", () => {
    it("tokens.css に本 BL で参照する 4 トークン (--color-bg / --color-border / --radius-md / --space-md) が定義されている", () => {
      const css = readFileSync(tokensCssPath, "utf-8");
      expect(css).toMatch(/--color-bg\s*:/);
      expect(css).toMatch(/--color-border\s*:/);
      expect(css).toMatch(/--radius-md\s*:/);
      expect(css).toMatch(/--space-md\s*:/);
    });

    it("tokens.css に AC-2 で参照する --space-sm トークンが定義されている (構造系宣言の維持に必要)", () => {
      const css = readFileSync(tokensCssPath, "utf-8");
      expect(css).toMatch(/--space-sm\s*:/);
    });

    it("tokens.css に本 BL では追加すべきでない --shadow-* トークンが存在しない (NFR-NO-NEW-TOKENS / D-007)", () => {
      const css = readFileSync(tokensCssPath, "utf-8");
      expect(css).not.toMatch(/--shadow-/);
    });
  });

  /**
   * AC-6: JSX (today-view.tsx / tomorrow-view.tsx) を変更していない.
   *
   * シナリオ AC-6:
   *   Given 本 BL の実装がマージされた
   *   When  web/src/ui/today-view/today-view.tsx と
   *         web/src/ui/tomorrow-view/tomorrow-view.tsx を BL-052 完了時点の状態と比較する
   *   Then  差分が無い
   *    かつ 両ファイルで .day-view__form クラスが引き続き付与されている (BL-051 由来)
   */
  describe("AC-6: JSX に day-view__form クラスが残っている (BL-051 由来 / 本 BL で外れていない)", () => {
    it("today-view.tsx に day-view__form クラスが含まれる", () => {
      const tsx = readFileSync(todayViewTsxPath, "utf-8");
      expect(tsx).toContain("day-view__form");
    });

    it("tomorrow-view.tsx に day-view__form クラスが含まれる", () => {
      const tsx = readFileSync(tomorrowViewTsxPath, "utf-8");
      expect(tsx).toContain("day-view__form");
    });

    it("today-view.tsx で .day-view__form が <form> 要素に付与されている (構造の保持)", () => {
      const tsx = readFileSync(todayViewTsxPath, "utf-8");
      // <form ... className="day-view__form" ... > 形を確認する.
      // 属性順は問わないが, form タグと day-view__form が同一 JSX 要素にある状態を要求する.
      expect(tsx).toMatch(/<form[^>]*className=["'][^"']*day-view__form[^"']*["'][^>]*>/);
    });

    it("tomorrow-view.tsx で .day-view__form が <form> 要素に付与されている (構造の保持)", () => {
      const tsx = readFileSync(tomorrowViewTsxPath, "utf-8");
      expect(tsx).toMatch(/<form[^>]*className=["'][^"']*day-view__form[^"']*["'][^>]*>/);
    });
  });

  /**
   * AC-7: 本 BL の対象セレクタは .day-view__form に限定されている.
   *
   * シナリオ AC-7:
   *   Given 本 BL の実装がマージされた
   *   When  web/src/ui/day-view/day-view.css の他セレクタ (.day-view /
   *         .day-view__header / .day-view__header h1 / .day-view__list /
   *         .day-view__card / .day-view__card--focus / .day-view__empty)
   *         のルール本文を観察する
   *   Then  BL-052 完了時点と同じ宣言のままで, 本 BL での追記が無い
   *
   * NOTE: .day-view__card / .day-view__card--focus は BL-052 で正当に visual 宣言を持つ.
   *       本 AC-7 では「本 BL での追記が無い」ことを担保するため, これらの宣言が BL-052 で
   *       確定した値であることを確認する (= 本 BL で誤って書き換えていないことの検証).
   */
  describe("AC-7: 他セレクタへの visual 追記が無い (本 BL のスコープは .day-view__form のみ)", () => {
    const NON_VISUAL_SELECTORS = [
      ".day-view",
      ".day-view__header",
      ".day-view__list",
      ".day-view__empty",
    ] as const;

    it.each(NON_VISUAL_SELECTORS)(
      "%s ルール本文に本 BL の visual 宣言 (background / border / border-radius) が含まれない",
      (selector) => {
        const css = readFileSync(dayViewCssPath, "utf-8");
        const body = extractRuleBody(css, selector);
        expect(body, `${selector} ルールが見つからない`).not.toBeNull();
        const bodyText = body ?? "";
        // 行頭 / セミコロン直後の宣言として登場しないことを確認.
        expect(bodyText, `${selector} に background 宣言が追加されている`).not.toMatch(
          /(?:^|;|\n)\s*background(?:-color)?\s*:/,
        );
        expect(bodyText, `${selector} に border 宣言が追加されている`).not.toMatch(
          /(?:^|;|\n)\s*border(?:-color|-style|-width)?\s*:/,
        );
        expect(bodyText, `${selector} に border-radius 宣言が追加されている`).not.toMatch(
          /(?:^|;|\n)\s*border-radius\s*:/,
        );
      },
    );

    it(".day-view__header h1 ルール本文に本 BL の visual 宣言が含まれない", () => {
      const css = readFileSync(dayViewCssPath, "utf-8");
      const body = extractRuleBody(css, ".day-view__header h1");
      expect(body, ".day-view__header h1 ルールが見つからない").not.toBeNull();
      const bodyText = body ?? "";
      expect(bodyText).not.toMatch(/(?:^|;|\n)\s*background(?:-color)?\s*:/);
      expect(bodyText).not.toMatch(/(?:^|;|\n)\s*border(?:-color|-style|-width)?\s*:/);
      expect(bodyText).not.toMatch(/(?:^|;|\n)\s*border-radius\s*:/);
    });

    it(".day-view__card ルール本文は BL-052 で確定した宣言のままで, 本 BL で書き換えられていない", () => {
      const css = readFileSync(dayViewCssPath, "utf-8");
      const body = extractRuleBody(css, ".day-view__card");
      expect(body, ".day-view__card ルールが見つからない").not.toBeNull();
      const bodyText = body ?? "";
      // BL-052 で確定済みの宣言が残っていること (= 本 BL で削除/改変していない).
      expect(bodyText).toMatch(/background(?:-color)?\s*:\s*var\(--color-bg\)/);
      expect(bodyText).toMatch(/border\s*:\s*1px\s+solid\s+var\(--color-border\)/);
      // BL-057 (task-card-zone-layout / D-001): border-radius は --radius-md → --radius-lg に
      // 引き上げられた (chip の角丸と同調). 本 BL (BL-054) の関心ではないが追従する.
      expect(bodyText).toMatch(/border-radius\s*:\s*var\(--radius-lg\)/);
      expect(bodyText).toMatch(/(?:^|;|\n)\s*padding\s*:\s*var\(--space-md\)/);
    });

    it(".day-view__card--focus ルール本文は BL-052 で確定した宣言のままで, 本 BL で書き換えられていない", () => {
      const css = readFileSync(dayViewCssPath, "utf-8");
      const body = extractRuleBody(css, ".day-view__card--focus");
      expect(body, ".day-view__card--focus ルールが見つからない").not.toBeNull();
      const bodyText = body ?? "";
      // BL-052 で確定済みの強調 variant 宣言が残っていること.
      expect(bodyText).toMatch(/border-width\s*:\s*2px/);
      expect(bodyText).toMatch(/border-radius\s*:\s*var\(--radius-lg\)/);
      expect(bodyText).toMatch(/(?:^|;|\n)\s*padding\s*:\s*var\(--space-lg\)/);
    });
  });

  /**
   * AC-8: focus-view (/focus) の CSS を変更していない.
   *
   * シナリオ AC-8:
   *   Given 本 BL の実装がマージされた
   *   When  web/src/ui/focus-view/focus-view.css を BL-052 完了時点の状態と比較する
   *   Then  差分が無い (focus-view は本 BL の対象外)
   *    かつ focus-view.css に .day-view__form セレクタが混入していない
   */
  describe("AC-8: focus-view.css が無改修である (リスク R-4 緩和)", () => {
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
   *
   * 厳密な green 確認は npm test / vitest 実行で行うが,
   * 本ファイル単体では「回帰検出の前提 = 関連テストファイルが消えていないこと」を assert する.
   *
   * シナリオ AC-9:
   *   Given /today と /tomorrow が引き続きレンダリング可能
   *   When  既存単体テスト (today-view.test.tsx, tomorrow-view.test.tsx,
   *         unified-day-view.test.tsx, task-card-design.test.ts, design-tokens.test.ts 等)
   *         と既存 E2E を実行する
   *   Then  すべて green である (本 BL の差分は CSS のみで DOM / aria / role を変えていない)
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
   * AC-10: アクセシビリティ違反 0 件を維持する.
   *
   * 実際の axe スキャンは e2e/a11y.spec.ts で行うため,
   * 本ファイルでは「a11y E2E ファイルが存在する」ことのみ assert する.
   *
   * シナリオ AC-10:
   *   Given /today /tomorrow をはじめとする全 view がレンダリング可能
   *   When  @axe-core/playwright で WCAG 2.1 AA をスキャンする (e2e/a11y.spec.ts の既存スキャン)
   *   Then  すべてのスキャンで violations.length === 0
   */
  describe("AC-10: a11y E2E スキャンの前提が存在する", () => {
    it("e2e/a11y.spec.ts が存在する", () => {
      expect(existsSync(resolve(repoRoot, "e2e/a11y.spec.ts"))).toBe(true);
    });
  });
});
