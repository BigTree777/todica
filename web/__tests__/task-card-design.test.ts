// @vitest-environment node

/**
 * タスクカードのデザイン統一 (BL-052 / task-card-design) 受け入れ基準テスト.
 *
 * 仕様参照:
 *   docs/developer/features/task-card-design/spec.md
 *   docs/developer/features/task-card-design/plan.md
 *   docs/developer/features/task-card-design/tasks.md
 *
 * 本ファイルが検証する受け入れ基準:
 *   AC-1: .day-view__card に縁・背景・角丸・余白が定義されている.
 *   AC-2: .day-view__card--focus は border-width / radius / padding が大きい.
 *   AC-3: .day-view__card--focus に border-color / background の単独宣言が無い (継承).
 *   AC-4: 本 BL で box-shadow 宣言を追加していない.
 *   AC-5: tokens.css を変更していない (= 必須トークンが存在し続けている).
 *   AC-6: JSX (today-view.tsx / tomorrow-view.tsx) に day-view__card 系クラスが付与されている.
 *   AC-7: 本 BL の対象セレクタは .day-view__card と .day-view__card--focus に限定されている.
 *   AC-8: focus-view (/focus) の CSS を変更していない (= focus-view 名前空間に限定されている).
 *   AC-9: 既存単体テストファイルが存在する (= 回帰検出の前提が満たされている).
 *   AC-10: 既存 a11y E2E (e2e/a11y.spec.ts) が存在する (= 回帰検出の前提が満たされている).
 *
 * 本ファイルは TDD の "red" を作るためのテスト.
 *   - day-view.css に visual 宣言が無い状態では AC-1 / AC-2 が失敗する.
 *   - implementer が REQ-1 / REQ-2 を実装することで green 化する.
 *
 * 検証スタイル: BL-046 (web/__tests__/design-tokens.test.ts) と同じ
 * 「CSS を readFileSync で読み込んで宣言の存在を expect(content).toMatch / toContain で assert する」方式.
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
 * 単純な /selector\s*\{([^}]*)\}/ では `.day-view__card` が
 * `.day-view__card--focus` の prefix にも一致してしまうため,
 * セレクタ末尾を `{` / 空白で厳密に区切る.
 *
 * 例:
 *   extractRuleBody(css, ".day-view__card") は ".day-view__card { ... }" の中身のみ返し,
 *   ".day-view__card--focus { ... }" の中身は返さない.
 */
function extractRuleBody(css: string, selector: string): string | null {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // セレクタの直後が空白 + `{` であるルールに限定する.
  const re = new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`, "m");
  const m = css.match(re);
  return m?.[1] ?? null;
}

describe("タスクカードのデザイン統一 (BL-052 / task-card-design)", () => {
  /**
   * AC-1: 通常カード (.day-view__card) に縁・背景・角丸・余白が定義されている.
   *
   * シナリオ AC-1:
   *   Given web/src/ui/day-view/day-view.css を開いた
   *   When  .day-view__card セレクタのルール本文を観察する
   *   Then  background プロパティに var(--color-bg) を参照する宣言を含む
   *    かつ border プロパティに 1px solid var(--color-border) を参照する宣言を含む
   *    かつ border-radius プロパティに var(--radius-md) を参照する宣言を含む
   *    かつ padding プロパティに var(--space-md) を参照する宣言を含む
   *    かつ 既存の display: flex / align-items: center / gap: var(--space-md) の宣言が残っている
   */
  describe("AC-1: .day-view__card に visual 宣言が追加されている", () => {
    it("day-view.css が存在する", () => {
      expect(existsSync(dayViewCssPath)).toBe(true);
    });

    it(".day-view__card ルール本文に background: var(--color-bg) を含む", () => {
      const css = readFileSync(dayViewCssPath, "utf-8");
      const body = extractRuleBody(css, ".day-view__card");
      expect(body, ".day-view__card ルールが見つからない").not.toBeNull();
      // background または background-color shorthand のいずれかで OK とする.
      expect(body ?? "").toMatch(/background(?:-color)?\s*:\s*var\(--color-bg\)/);
    });

    it(".day-view__card ルール本文に border: 1px solid var(--color-border) (または等価分解) を含む", () => {
      const css = readFileSync(dayViewCssPath, "utf-8");
      const body = extractRuleBody(css, ".day-view__card");
      expect(body, ".day-view__card ルールが見つからない").not.toBeNull();
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
        ".day-view__card に border: 1px solid var(--color-border) 等価宣言が無い",
      ).toBe(true);
    });

    it(".day-view__card ルール本文に border-radius: var(--radius-md) を含む", () => {
      const css = readFileSync(dayViewCssPath, "utf-8");
      const body = extractRuleBody(css, ".day-view__card");
      expect(body, ".day-view__card ルールが見つからない").not.toBeNull();
      expect(body ?? "").toMatch(/border-radius\s*:\s*var\(--radius-md\)/);
    });

    it(".day-view__card ルール本文に padding: var(--space-md) を含む", () => {
      const css = readFileSync(dayViewCssPath, "utf-8");
      const body = extractRuleBody(css, ".day-view__card");
      expect(body, ".day-view__card ルールが見つからない").not.toBeNull();
      // gap: var(--space-md) と誤検知しないよう padding: で始まる宣言に限定する.
      expect(body ?? "").toMatch(/(?:^|;|\n)\s*padding\s*:\s*var\(--space-md\)/);
    });

    it(".day-view__card ルール本文に既存の display: flex / align-items: center / gap: var(--space-md) が残っている (回帰防止)", () => {
      const css = readFileSync(dayViewCssPath, "utf-8");
      const body = extractRuleBody(css, ".day-view__card");
      expect(body, ".day-view__card ルールが見つからない").not.toBeNull();
      const bodyText = body ?? "";
      expect(bodyText).toMatch(/display\s*:\s*flex/);
      expect(bodyText).toMatch(/align-items\s*:\s*center/);
      expect(bodyText).toMatch(/gap\s*:\s*var\(--space-md\)/);
    });
  });

  /**
   * AC-2: 強調カード (.day-view__card--focus) は縁が太く radius と padding が大きい.
   *
   * シナリオ AC-2:
   *   Given web/src/ui/day-view/day-view.css を開いた
   *   When  .day-view__card--focus セレクタのルール本文を観察する
   *   Then  border-width プロパティに 2px を参照する宣言を含む
   *    かつ border-radius プロパティに var(--radius-lg) を参照する宣言を含む
   *    かつ padding プロパティに var(--space-lg) を参照する宣言を含む
   */
  describe("AC-2: .day-view__card--focus に強調 variant の宣言が追加されている", () => {
    it(".day-view__card--focus ルール本文に border-width: 2px を含む", () => {
      const css = readFileSync(dayViewCssPath, "utf-8");
      const body = extractRuleBody(css, ".day-view__card--focus");
      expect(body, ".day-view__card--focus ルールが見つからない").not.toBeNull();
      expect(body ?? "").toMatch(/border-width\s*:\s*2px/);
    });

    it(".day-view__card--focus ルール本文に border-radius: var(--radius-lg) を含む", () => {
      const css = readFileSync(dayViewCssPath, "utf-8");
      const body = extractRuleBody(css, ".day-view__card--focus");
      expect(body, ".day-view__card--focus ルールが見つからない").not.toBeNull();
      expect(body ?? "").toMatch(/border-radius\s*:\s*var\(--radius-lg\)/);
    });

    it(".day-view__card--focus ルール本文に padding: var(--space-lg) を含む", () => {
      const css = readFileSync(dayViewCssPath, "utf-8");
      const body = extractRuleBody(css, ".day-view__card--focus");
      expect(body, ".day-view__card--focus ルールが見つからない").not.toBeNull();
      expect(body ?? "").toMatch(/padding\s*:\s*var\(--space-lg\)/);
    });
  });

  /**
   * AC-3: 強調カードは border-color と background を別途宣言しない (通常カードを継承する).
   *
   * シナリオ AC-3:
   *   Given web/src/ui/day-view/day-view.css を開いた
   *   When  .day-view__card--focus セレクタのルール本文を観察する
   *   Then  border-color プロパティを単独で宣言していない
   *    かつ background プロパティを単独で宣言していない
   *    (= .day-view__card の border-color / background の宣言をそのまま継承して使う)
   */
  describe("AC-3: .day-view__card--focus は border-color / background を単独宣言しない", () => {
    it(".day-view__card--focus ルール本文に border-color: 単独宣言が存在しない", () => {
      const css = readFileSync(dayViewCssPath, "utf-8");
      const body = extractRuleBody(css, ".day-view__card--focus");
      expect(body, ".day-view__card--focus ルールが見つからない").not.toBeNull();
      // 行頭 / セミコロン直後の border-color: を検出する.
      expect(body ?? "").not.toMatch(/(?:^|;|\n)\s*border-color\s*:/);
    });

    it(".day-view__card--focus ルール本文に background / background-color 単独宣言が存在しない", () => {
      const css = readFileSync(dayViewCssPath, "utf-8");
      const body = extractRuleBody(css, ".day-view__card--focus");
      expect(body, ".day-view__card--focus ルールが見つからない").not.toBeNull();
      expect(body ?? "").not.toMatch(/(?:^|;|\n)\s*background(?:-color)?\s*:/);
    });

    it(".day-view__card--focus ルール本文に border shorthand 宣言が存在しない (border-width のみ上書き / P-001 / リスク R-1)", () => {
      const css = readFileSync(dayViewCssPath, "utf-8");
      const body = extractRuleBody(css, ".day-view__card--focus");
      expect(body, ".day-view__card--focus ルールが見つからない").not.toBeNull();
      // border: ... shorthand は border-color も上書きしてしまうため不可.
      expect(body ?? "").not.toMatch(/(?:^|;|\n)\s*border\s*:\s*[^;]/);
    });
  });

  /**
   * AC-4: 本 BL で box-shadow 宣言を追加していない.
   *
   * シナリオ AC-4:
   *   Given web/src/ui/day-view/day-view.css を開いた
   *   When  ファイル全体を観察する
   *   Then  box-shadow キーワードを含む宣言が存在しない
   */
  describe("AC-4: day-view.css に box-shadow が含まれない", () => {
    it("day-view.css の全文に box-shadow キーワードが含まれない (D-001 / NFR-NO-SHADOW)", () => {
      const css = readFileSync(dayViewCssPath, "utf-8");
      expect(css).not.toContain("box-shadow");
    });
  });

  /**
   * AC-5: tokens.css を変更していない (必須トークンが残っている).
   *
   * 本テストでは BL-052 の境界線として「使用するトークンが tokens.css に残っていること」
   * を assert する. これにより誤って tokens.css を消したり改名したりした場合に red になる.
   *
   * シナリオ AC-5:
   *   Given 本 BL の実装がマージされた
   *   When  web/src/styles/tokens.css を BL-051 完了時点の状態と比較する
   *   Then  差分が無い (新規トークンの追加・既存トークンの変更が無い)
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
   * AC-6: JSX (today-view.tsx / tomorrow-view.tsx) を変更していない.
   *
   * 本テストでは「BL-051 で付与済みの day-view__card / day-view__card--focus クラスが
   * 引き続き JSX に存在すること」を assert する. これにより誤ってクラスを外したり
   * 改名したりした場合に red になる.
   *
   * シナリオ AC-6:
   *   Given 本 BL の実装がマージされた
   *   When  web/src/ui/today-view/today-view.tsx と
   *         web/src/ui/tomorrow-view/tomorrow-view.tsx を BL-051 完了時点の状態と比較する
   *   Then  差分が無い (BL-052 では JSX を変更しない)
   */
  describe("AC-6: JSX に day-view__card 系クラスが残っている", () => {
    it("today-view.tsx に day-view__card クラスが含まれる (BL-051 で確定)", () => {
      const tsx = readFileSync(todayViewTsxPath, "utf-8");
      expect(tsx).toContain("day-view__card");
    });

    it("today-view.tsx に day-view__card--focus クラスが含まれる (BL-051 で確定 / 強調 variant)", () => {
      const tsx = readFileSync(todayViewTsxPath, "utf-8");
      expect(tsx).toContain("day-view__card--focus");
    });

    it("tomorrow-view.tsx に day-view__card クラスが含まれる (BL-051 で確定)", () => {
      const tsx = readFileSync(tomorrowViewTsxPath, "utf-8");
      expect(tsx).toContain("day-view__card");
    });
  });

  /**
   * AC-7: 本 BL の対象セレクタは .day-view__card と .day-view__card--focus に限定されている.
   *
   * シナリオ AC-7:
   *   Given 本 BL の実装がマージされた
   *   When  web/src/ui/day-view/day-view.css の他セレクタ (.day-view / .day-view__header /
   *         .day-view__header h1 / .day-view__form / .day-view__list / .day-view__empty)
   *         のルール本文を観察する
   *   Then  BL-051 完了時点と同じ宣言のままで, 本 BL での追記が無い
   */
  describe("AC-7: 他セレクタには visual 宣言が追加されていない", () => {
    const OTHER_SELECTORS = [
      ".day-view",
      ".day-view__header",
      ".day-view__form",
      ".day-view__list",
      ".day-view__empty",
    ] as const;

    it.each(OTHER_SELECTORS)(
      "%s ルール本文に background / border / border-radius の visual 宣言が含まれない",
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

    it(".day-view__header h1 ルール本文に visual 宣言が追加されていない", () => {
      const css = readFileSync(dayViewCssPath, "utf-8");
      const body = extractRuleBody(css, ".day-view__header h1");
      expect(body, ".day-view__header h1 ルールが見つからない").not.toBeNull();
      const bodyText = body ?? "";
      expect(bodyText).not.toMatch(/(?:^|;|\n)\s*background(?:-color)?\s*:/);
      expect(bodyText).not.toMatch(/(?:^|;|\n)\s*border(?:-color|-style|-width)?\s*:/);
      expect(bodyText).not.toMatch(/(?:^|;|\n)\s*border-radius\s*:/);
    });
  });

  /**
   * AC-8: focus-view (/focus) の CSS を変更していない.
   *
   * 本テストでは focus-view.css に day-view 名前空間のセレクタが混入していないこと,
   * および focus-view.css 側に本 BL の差分が出ていないことを軽くスモークする.
   *
   * シナリオ AC-8:
   *   Given 本 BL の実装がマージされた
   *   When  web/src/ui/focus-view/focus-view.css を BL-051 完了時点の状態と比較する
   *   Then  差分が無い (focus-view は本 BL の対象外)
   */
  describe("AC-8: focus-view.css に day-view 系クラスが混入していない (D-006)", () => {
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
   *
   * 厳密な green 確認は npm test / vitest 実行で行うが,
   * 本ファイル単体では「回帰検出の前提 = 関連テストファイルが消えていないこと」を assert する.
   *
   * シナリオ AC-9:
   *   Given /today と /tomorrow が引き続きレンダリング可能
   *   When  既存単体テスト (web/__tests__/today-view.test.tsx, tomorrow-view.test.tsx,
   *         unified-day-view.test.tsx 等) と既存 E2E を実行する
   *   Then  すべて green である
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
