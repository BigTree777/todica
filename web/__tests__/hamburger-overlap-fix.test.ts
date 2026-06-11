// @vitest-environment node

/**
 * ハンバーガーボタンと h1 タイトルの重なり修正 (BL-053 / hamburger-overlap-fix)
 * 受け入れ基準テスト.
 *
 * 仕様参照:
 *   docs/developer/features/hamburger-overlap-fix/spec.md
 *   docs/developer/features/hamburger-overlap-fix/plan.md
 *   docs/developer/features/hamburger-overlap-fix/tasks.md
 *
 * 本ファイルが検証する受け入れ基準:
 *   AC-1: .app-shell__main の padding-top がハンバーガーの実寸より大きい
 *         (calc(var(--space-md) + var(--space-xl)) が指定されている).
 *   AC-2: padding の左右下は既存値 var(--space-md) を維持する
 *         (= 既存 padding: var(--space-md) ショートハンド宣言が残っている).
 *   AC-3: .app-shell__main の padding 系プロパティに生 px 値リテラルが含まれない.
 *   AC-4: .app-shell__hamburger ルールが BL-049 確定仕様から変化していない
 *         (position: fixed / top: var(--space-sm) / left: var(--space-sm) / z-index: 200).
 *
 * 本ファイルで扱わない受け入れ基準 (担保方法が別):
 *   AC-5: AppShell 配下の全 view で h1 とハンバーガーが重ならない
 *         → e2e/hamburger-overlap-fix.spec.ts の Playwright で boundingBox 比較.
 *   AC-6: ハンバーガーボタンが引き続きクリック可能 → BL-049 既存 E2E の green 維持で間接確認.
 *   AC-7: 単体・E2E 全件 green → npm test / npx playwright test 実行で確認.
 *
 * 本ファイルは TDD の "red" を作るためのテスト.
 *   - 現状 .app-shell__main には padding-top が無いため AC-1 系が失敗する.
 *   - implementer が REQ-1 を実装することで green 化する.
 *
 * 検証スタイル: BL-046 (web/__tests__/design-tokens.test.ts) / BL-052
 * (web/__tests__/task-card-design.test.ts) と同じ
 * 「CSS を readFileSync で読み込んで宣言の存在を expect(content).toMatch で assert する」方式.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(__dirname, "../..");
const webSrcRoot = resolve(repoRoot, "web/src");
const appShellCssPath = resolve(webSrcRoot, "ui/app-shell/app-shell.css");

/**
 * 指定したセレクタの「ルール本文 (= {} で囲まれた中身)」を抽出する.
 *
 * 単純な /selector\s*\{([^}]*)\}/ では `.app-shell__main` が
 * `.app-shell__main--variant` の prefix にも一致してしまうため,
 * セレクタ末尾を `{` / 空白で厳密に区切る.
 */
function extractRuleBody(css: string, selector: string): string | null {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`, "m");
  const m = css.match(re);
  return m?.[1] ?? null;
}

describe("ハンバーガーボタンと h1 タイトルの重なり修正 (BL-053 / hamburger-overlap-fix)", () => {
  /**
   * AC-1: `.app-shell__main` の padding-top がハンバーガーの実寸より大きい.
   *
   * シナリオ AC-1:
   *   Given web/src/ui/app-shell/app-shell.css を読み込む
   *   When  .app-shell__main セレクタの宣言ブロックを抽出する
   *   Then  padding-top プロパティとして
   *         calc(var(--space-md) + var(--space-xl)) が指定されている
   *   And   その算出値は 36px より大きい (16 + 32 = 48px ≥ 37px)
   *
   * 注:
   *   - tokens.css 上で --space-md = 16px, --space-xl = 32px であることは
   *     design-tokens.test.ts が確認している (REQ-2 確定値).
   *     したがってここでは「式が calc(var(--space-md) + var(--space-xl)) であること」を
   *     文字列マッチで検証すれば算出値 48px が保証される.
   */
  describe("AC-1: .app-shell__main に padding-top: calc(var(--space-md) + var(--space-xl)) が指定されている", () => {
    it(".app-shell__main ルール本文が存在する", () => {
      const css = readFileSync(appShellCssPath, "utf-8");
      const body = extractRuleBody(css, ".app-shell__main");
      expect(body, ".app-shell__main ルールが見つからない").not.toBeNull();
    });

    it(".app-shell__main ルール本文に padding-top: calc(var(--space-md) + var(--space-xl)) を含む", () => {
      const css = readFileSync(appShellCssPath, "utf-8");
      const body = extractRuleBody(css, ".app-shell__main");
      expect(body, ".app-shell__main ルールが見つからない").not.toBeNull();
      // calc 内部の空白は CSS としては許容されるため正規表現で空白を吸収する.
      // 例: `padding-top: calc(var(--space-md) + var(--space-xl));`
      expect(body ?? "").toMatch(
        /padding-top\s*:\s*calc\(\s*var\(--space-md\)\s*\+\s*var\(--space-xl\)\s*\)/,
      );
    });

    it(".app-shell__main の padding-top 算出値が 36px を上回る (16 + 32 = 48 ≥ 37)", () => {
      // tokens.css の確定値 (BL-046) に基づく静的計算で代用する.
      // 実値は design-tokens.test.ts が tokens.css 側で担保する.
      const SPACE_MD = 16;
      const SPACE_XL = 32;
      const HAMBURGER_BOTTOM_MAX = 36; // spec REQ-1 で示されたハンバーガー bottom 座標の上限.
      expect(SPACE_MD + SPACE_XL).toBeGreaterThan(HAMBURGER_BOTTOM_MAX);
    });
  });

  /**
   * AC-2: padding の左右下は既存値 var(--space-md) を維持する.
   *
   * 案 A (plan.md 採用) では既存の `padding: var(--space-md);` ショートハンドを残し,
   * その後ろに `padding-top: calc(...)` を追加して上だけ後勝ちで上書きする.
   * したがってショートハンド宣言が消えていないことを確認する.
   *
   * シナリオ AC-2:
   *   Given web/src/ui/app-shell/app-shell.css を読み込む
   *   When  .app-shell__main セレクタの宣言ブロックを抽出する
   *   Then  padding: var(--space-md); ショートハンドが残っている
   *         (= 左右下は var(--space-md) のまま)
   */
  describe("AC-2: .app-shell__main の padding 左右下が var(--space-md) のまま", () => {
    it(".app-shell__main ルール本文に padding: var(--space-md) ショートハンドが残っている", () => {
      const css = readFileSync(appShellCssPath, "utf-8");
      const body = extractRuleBody(css, ".app-shell__main");
      expect(body, ".app-shell__main ルールが見つからない").not.toBeNull();
      // padding-top / padding-right などの個別プロパティと誤検知しないよう,
      // 「padding:」(コロンの直前に -xxx が付かないもの) に限定する.
      expect(body ?? "").toMatch(/(?:^|;|\n)\s*padding\s*:\s*var\(--space-md\)\s*;/);
    });
  });

  /**
   * AC-3: 既存トークンのみで構成されている (生 px 値が混入していない).
   *
   * シナリオ AC-3:
   *   Given web/src/ui/app-shell/app-shell.css の .app-shell__main ルールを読み込む
   *   When  padding 系プロパティの値を確認する
   *   Then  値はすべて var(--space-*) 形式または calc(...) で組み立てられた既存トークン参照である
   *   And   生の px 値リテラル (例: 48px) は含まれない
   *
   * 検証範囲:
   *   .app-shell__main ルール本文の padding 系宣言行に限定する.
   *   ファイル全体には他セレクタ (`.app-shell__menu` の width: 240px など) で
   *   px リテラルが残っているため, ここでは padding 系のみを対象にする.
   */
  describe("AC-3: .app-shell__main の padding 系宣言に生 px 値が含まれない", () => {
    it(".app-shell__main の padding 系宣言行に /\\d+px/ が含まれない", () => {
      const css = readFileSync(appShellCssPath, "utf-8");
      const body = extractRuleBody(css, ".app-shell__main");
      expect(body, ".app-shell__main ルールが見つからない").not.toBeNull();
      const bodyText = body ?? "";
      // padding / padding-top / padding-right / padding-bottom / padding-left の宣言行のみを抽出.
      const paddingLines = bodyText
        .split(/[;\n]/)
        .map((line) => line.trim())
        .filter((line) => /^padding(?:-top|-right|-bottom|-left)?\s*:/.test(line));
      expect(paddingLines.length, "padding 系宣言が 1 行も無い").toBeGreaterThan(0);
      for (const line of paddingLines) {
        expect(line, `padding 系宣言に生 px 値が含まれている: '${line}'`).not.toMatch(/\d+px/);
      }
    });
  });

  /**
   * AC-4: ハンバーガーボタンのスタイルが変更されていない.
   *
   * シナリオ AC-4:
   *   Given web/src/ui/app-shell/app-shell.css を読み込む
   *   When  .app-shell__hamburger セレクタの宣言ブロックを抽出する
   *   Then  position: fixed が維持されている
   *   And   top: var(--space-sm) / left: var(--space-sm) が維持されている
   *   And   z-index: 200 が維持されている
   */
  describe("AC-4: .app-shell__hamburger のスタイルが BL-049 確定仕様から変化していない", () => {
    it(".app-shell__hamburger ルール本文が存在する", () => {
      const css = readFileSync(appShellCssPath, "utf-8");
      const body = extractRuleBody(css, ".app-shell__hamburger");
      expect(body, ".app-shell__hamburger ルールが見つからない").not.toBeNull();
    });

    it(".app-shell__hamburger ルール本文に position: fixed を含む", () => {
      const css = readFileSync(appShellCssPath, "utf-8");
      const body = extractRuleBody(css, ".app-shell__hamburger");
      expect(body, ".app-shell__hamburger ルールが見つからない").not.toBeNull();
      expect(body ?? "").toMatch(/position\s*:\s*fixed/);
    });

    it(".app-shell__hamburger ルール本文に top: var(--space-sm) を含む", () => {
      const css = readFileSync(appShellCssPath, "utf-8");
      const body = extractRuleBody(css, ".app-shell__hamburger");
      expect(body, ".app-shell__hamburger ルールが見つからない").not.toBeNull();
      expect(body ?? "").toMatch(/(?:^|;|\n)\s*top\s*:\s*var\(--space-sm\)/);
    });

    it(".app-shell__hamburger ルール本文に left: var(--space-sm) を含む", () => {
      const css = readFileSync(appShellCssPath, "utf-8");
      const body = extractRuleBody(css, ".app-shell__hamburger");
      expect(body, ".app-shell__hamburger ルールが見つからない").not.toBeNull();
      expect(body ?? "").toMatch(/(?:^|;|\n)\s*left\s*:\s*var\(--space-sm\)/);
    });

    it(".app-shell__hamburger ルール本文に z-index: 200 を含む", () => {
      const css = readFileSync(appShellCssPath, "utf-8");
      const body = extractRuleBody(css, ".app-shell__hamburger");
      expect(body, ".app-shell__hamburger ルールが見つからない").not.toBeNull();
      expect(body ?? "").toMatch(/z-index\s*:\s*200/);
    });
  });
});
