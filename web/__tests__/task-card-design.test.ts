// @vitest-environment node

/**
 * タスクカードのデザイン統一 (BL-052 / task-card-design) 受け入れ基準テスト.
 *
 * 仕様参照:
 *   docs/developer/features/task-card-design/spec.md
 *   docs/developer/features/task-card-design/plan.md
 *   docs/developer/features/task-card-design/tasks.md
 *
 * 本ファイルが検証する受け入れ基準 (BL-052 当時の意図 → BL-059 で新クラスへ移譲):
 *   AC-1 (BL-059 追従): 旧 .day-view__card の visual 宣言が
 *                       新しい .task-card セレクタへ移譲されている (= visual 4 宣言の継承).
 *   AC-2 (BL-059 追従): 旧 .day-view__card--focus の強調 variant が
 *                       新しい .task-card--focus へ移譲されている (border-width は 3px / V-1).
 *   AC-3 (BL-059 追従): .task-card--focus は border-color / background を単独宣言しない (継承).
 *   AC-4: day-view.css 全体で box-shadow を追加していない (NFR-NO-SHADOW).
 *   AC-5: tokens.css が無改修 (必須トークンが残っている).
 *   AC-6 (BL-059 追従): today-view / tomorrow-view の JSX から旧 day-view__card クラスが
 *                       **撤去** され, <TaskCard> 経由に置換されている.
 *   AC-7 (BL-059 追従): 旧 .day-view__card / .day-view__card--focus セレクタは
 *                       day-view.css から **撤去** されている (= 責務移譲済み).
 *   AC-8: focus-view.css に day-view 名前空間のセレクタが混入していない (名前空間の分離).
 *   AC-9: 関連テストファイルが存在する (回帰検出の前提).
 *   AC-10: a11y E2E ファイルが存在する (回帰検出の前提).
 *
 * 本ファイルは BL-052 の TDD red を出すための原ファイルだが,
 * BL-059 (task-card-component) で旧 .day-view__card 系セレクタを `.task-card` に
 * 全面移譲したため, AC-1 / AC-2 / AC-3 / AC-6 / AC-7 のアサーションを「新クラスでの確認」
 * + 「旧クラスが撤去されていることの確認」へ書き換えてある.
 *
 *   - BL-052 完了時点: .day-view__card に visual 4 宣言 → green
 *   - BL-057 完了時点: .day-view__card に 3 段 layout 追加 → green
 *   - BL-059 完了時点: .task-card に visual + 3 段 layout が移譲 / .day-view__card は撤去
 *     → 本ファイルは「新クラス側に visual が存在する」「旧クラスが撤去されている」を assert.
 *
 * 検証スタイル: BL-046 と同じ readFileSync + extractRuleBody パターン.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(__dirname, "../..");
const webSrcRoot = resolve(repoRoot, "web/src");
const dayViewCssPath = resolve(webSrcRoot, "ui/day-view/day-view.css");
// BL-059 で task-card.css が新設されるためのパス.
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

describe("タスクカードのデザイン統一 (BL-052 / task-card-design, BL-059 で .task-card へ移譲)", () => {
  /**
   * AC-1 (BL-059 追従): BL-052 で確定した visual 4 宣言が `.task-card` セレクタに移譲されている.
   *
   * シナリオ AC-1:
   *   Given web/src/ui/task-card/task-card.css を開いた
   *   When  .task-card セレクタのルール本文を観察する
   *   Then  background: var(--color-bg) を含む
   *    かつ border: 1px solid var(--color-border) (または等価分解) を含む
   *    かつ border-radius: var(--radius-lg) を含む
   *    かつ padding: var(--space-md) を含む
   *
   * BL-059 で `.day-view__card` の visual 4 宣言は `.task-card` に責務移譲された.
   * 旧 `.day-view__card` セレクタは撤去された (= AC-7 で確認).
   */
  describe("AC-1: .task-card に visual 4 宣言が移譲されている (BL-052 → BL-059)", () => {
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

    it(".task-card ルール本文に border-radius: var(--radius-lg) を含む", () => {
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
   * AC-2 (BL-059 追従): 強調 variant `.task-card--focus` が `border-width: 3px` を持ち,
   *                     padding 上書きが無い (V-1).
   *
   * BL-052 当時の確定値:
   *   - border-width: 2px / padding: var(--space-lg)
   * BL-059 で変更された確定値:
   *   - border-width: 3px / padding 上書きなし (= `.task-card` の var(--space-md) を継承)
   */
  describe("AC-2 (BL-059 V-1 追従): .task-card--focus は 3px 太枠 + 通常 padding", () => {
    it(".task-card--focus ルール本文に border-width: 3px を含む (BL-059 V-1 で 2px → 3px)", () => {
      const css = readFileSync(taskCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".task-card--focus");
      expect(body, ".task-card--focus ルールが見つからない").not.toBeNull();
      expect(body ?? "").toMatch(/border-width\s*:\s*3px/);
    });

    it(".task-card--focus ルール本文に padding: var(--space-lg) を含まない (BL-059 V-1 で撤去)", () => {
      const css = readFileSync(taskCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".task-card--focus");
      expect(body, ".task-card--focus ルールが見つからない").not.toBeNull();
      expect(body ?? "").not.toMatch(/(?:^|;|\n)\s*padding\s*:\s*var\(--space-lg\)/);
    });
  });

  /**
   * AC-3 (BL-059 追従): 強調カードは border-color / background を別途宣言しない.
   *   (= 通常カードの宣言をそのまま継承する.)
   *
   * シナリオ AC-3:
   *   Given web/src/ui/task-card/task-card.css を開いた
   *   When  .task-card--focus セレクタのルール本文を観察する
   *   Then  border-color プロパティを単独で宣言していない
   *    かつ background プロパティを単独で宣言していない
   *    かつ border shorthand 宣言が存在しない (= border-width のみ上書き)
   */
  describe("AC-3: .task-card--focus は border-color / background / border shorthand を単独宣言しない", () => {
    it(".task-card--focus ルール本文に border-color: 単独宣言が存在しない", () => {
      const css = readFileSync(taskCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".task-card--focus");
      expect(body, ".task-card--focus ルールが見つからない").not.toBeNull();
      expect(body ?? "").not.toMatch(/(?:^|;|\n)\s*border-color\s*:/);
    });

    it(".task-card--focus ルール本文に background / background-color 単独宣言が存在しない", () => {
      const css = readFileSync(taskCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".task-card--focus");
      expect(body, ".task-card--focus ルールが見つからない").not.toBeNull();
      expect(body ?? "").not.toMatch(/(?:^|;|\n)\s*background(?:-color)?\s*:/);
    });

    it(".task-card--focus ルール本文に border shorthand 宣言が存在しない (border-width のみ上書き)", () => {
      const css = readFileSync(taskCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".task-card--focus");
      expect(body, ".task-card--focus ルールが見つからない").not.toBeNull();
      expect(body ?? "").not.toMatch(/(?:^|;|\n)\s*border\s*:\s*[^;]/);
    });
  });

  /**
   * AC-4: day-view.css / task-card.css 全体で box-shadow を追加していない.
   */
  describe("AC-4: box-shadow が追加されていない (NFR-NO-SHADOW)", () => {
    it("day-view.css の全文に box-shadow キーワードが含まれない", () => {
      const css = readFileSync(dayViewCssPath, "utf-8");
      expect(css).not.toContain("box-shadow");
    });

    it("task-card.css の全文に box-shadow キーワードが含まれない (BL-059 で新設された CSS でも継承)", () => {
      const css = readFileSync(taskCardCssPath, "utf-8");
      expect(css).not.toContain("box-shadow");
    });
  });

  /**
   * AC-5: tokens.css を変更していない.
   */
  describe("AC-5: tokens.css が変更されていない (必須トークンが残っている)", () => {
    it("tokens.css に本 BL で参照する 6 トークン (--color-bg / --color-border / --radius-md / --radius-lg / --space-md / --space-lg) が定義されている", () => {
      const css = readFileSync(tokensCssPath, "utf-8");
      expect(css).toMatch(/--color-bg\s*:/);
      expect(css).toMatch(/--color-border\s*:/);
      expect(css).toMatch(/--radius-md\s*:/);
      expect(css).toMatch(/--radius-lg\s*:/);
      expect(css).toMatch(/--space-md\s*:/);
      expect(css).toMatch(/--space-lg\s*:/);
    });

    it("tokens.css に本 BL では追加すべきでない --shadow-* トークンが存在しない (NFR-NO-NEW-TOKENS / D-004)", () => {
      const css = readFileSync(tokensCssPath, "utf-8");
      expect(css).not.toMatch(/--shadow-/);
    });
  });

  /**
   * AC-6 (BL-059 追従): today-view / tomorrow-view から day-view__card 系クラスが撤去されている.
   *
   * BL-052 当時は「BL-051 で付与済みの day-view__card クラスが残っていること」を assert していた.
   * BL-059 で <TaskCard> 経由の描画に切り替えたため, **JSX から day-view__card 系の className
   * 文字列リテラルが消えている** ことを assert する形に逆転させた.
   */
  describe("AC-6 (BL-059 追従): JSX から day-view__card 系クラスが撤去されている", () => {
    it("today-view.tsx に className='day-view__card' / 'day-view__card--focus' が含まれない (BL-059 で撤去)", () => {
      const tsx = readFileSync(todayViewTsxPath, "utf-8");
      expect(tsx).not.toMatch(/className=["'][^"']*day-view__card[^"']*["']/);
    });

    it("tomorrow-view.tsx に className='day-view__card' が含まれない (BL-059 で撤去)", () => {
      const tsx = readFileSync(tomorrowViewTsxPath, "utf-8");
      expect(tsx).not.toMatch(/className=["'][^"']*day-view__card[^"']*["']/);
    });
  });

  /**
   * AC-7 (BL-059 追従): 旧 .day-view__card / .day-view__card--focus セレクタは
   *                     day-view.css から撤去されている (= 責務を `.task-card` 系に移譲).
   */
  describe("AC-7 (BL-059 追従): 旧 .day-view__card 系セレクタは day-view.css から撤去", () => {
    it(".day-view__card ルールが day-view.css に定義されていない (BL-059 / REQ-7)", () => {
      const css = readFileSync(dayViewCssPath, "utf-8");
      const body = extractRuleBody(css, ".day-view__card");
      expect(
        body,
        ".day-view__card ルールが day-view.css に残存している (BL-059 で `.task-card` へ移譲済み)",
      ).toBeNull();
    });

    it(".day-view__card--focus ルールが day-view.css に定義されていない (BL-059 / REQ-7)", () => {
      const css = readFileSync(dayViewCssPath, "utf-8");
      const body = extractRuleBody(css, ".day-view__card--focus");
      expect(
        body,
        ".day-view__card--focus ルールが day-view.css に残存している (BL-059 で `.task-card--focus` へ移譲済み)",
      ).toBeNull();
    });
  });

  /**
   * AC-8: focus-view (/focus) の CSS に day-view 名前空間が混入していない.
   */
  describe("AC-8: focus-view.css に day-view 系クラスが混入していない (名前空間分離)", () => {
    it("focus-view.css に .day-view__card セレクタが含まれない", () => {
      const css = readFileSync(focusViewCssPath, "utf-8");
      expect(css).not.toContain(".day-view__card");
    });

    it("focus-view.css に .day-view__card--focus セレクタが含まれない", () => {
      const css = readFileSync(focusViewCssPath, "utf-8");
      expect(css).not.toContain(".day-view__card--focus");
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
