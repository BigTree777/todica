/**
 * 静的 CSS アサーション単体テスト: 各 view の h1 タイトル左右中央揃え統一
 * (BL-111 / view-title-center-align).
 *
 * 仕様参照:
 *   docs/developer/features/view-title-center-align/spec.md
 *     §「受け入れ基準」 AC-h1-center (REQ-1 〜 REQ-7) /
 *     AC-no-regression / AC-no-global-h1 / AC-no-class-shadow /
 *     AC-trash-header-preserved
 *   docs/developer/features/view-title-center-align/plan.md §「CSS の変更」
 *
 * 本ファイルは TDD の "red" を作るためのテストである.
 *   - 現状の各 view CSS では h1 ルール本体に `text-align: center` が宣言されていない
 *     (day-view.css / projects-view.css / routines-view.css / focus-view.css /
 *      settings-view.css / trash-view.css の 6 ファイル).
 *   - よって AC-h1-center 系 6 シナリオは全て red になる.
 *   - implementer が plan.md §「CSS の変更」のとおりに 6 ファイルへ 1 行ずつ
 *     `text-align: center;` を追加することで green 化する.
 *
 * 検証方法:
 *   jsdom は CSS Custom Property の解決まで行わないため, スタイルの検証は
 *   `.css` ファイルを `readFileSync` し, 指定セレクタのルール本文に
 *   特定宣言が含まれることを assert する.
 *   これは BL-105 の `completion-counter-emphasis.test.ts` で確立されたパターンと同形.
 *
 * 検証範囲:
 *   - REQ-2 / AC-h1-center: `.day-view__header h1` の本文に text-align: center
 *     (これにより /today の h1 と /tomorrow の h1 の両方が中央揃えになる. spec REQ-1 も同時にカバー.)
 *   - REQ-3 / AC-h1-center: `.projects-view h1`
 *   - REQ-4 / AC-h1-center: `.routines-view h1`
 *   - REQ-5 / AC-h1-center: `.focus-view h1`
 *   - REQ-6 / AC-h1-center: `.settings-view h1`
 *   - REQ-7 / AC-h1-center: `.trash-view__header h1`
 *   - AC-no-regression: 上記 6 ルール本文に font-size: var(--font-size-h1) が残っている
 *   - AC-no-global-h1: web/src/styles/{tokens,button}.css に h1 セレクタを含む
 *                      CSS ルールが存在しない
 *   - AC-no-class-shadow: 各 view TSX に className="view-title" が現れない
 *   - AC-trash-header-preserved: .trash-view__header に display: flex と
 *                                justify-content: space-between が残っている
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(__dirname, "../..");

// ----------------------------------------------------------
// 対象 CSS / TSX のパス
// ----------------------------------------------------------
const dayViewCssPath = resolve(repoRoot, "web/src/ui/day-view/day-view.css");
const projectsViewCssPath = resolve(repoRoot, "web/src/ui/projects-view/projects-view.css");
const routinesViewCssPath = resolve(repoRoot, "web/src/ui/routines-view/routines-view.css");
const focusViewCssPath = resolve(repoRoot, "web/src/ui/focus-view/focus-view.css");
const settingsViewCssPath = resolve(repoRoot, "web/src/ui/settings-view/settings-view.css");
const trashViewCssPath = resolve(repoRoot, "web/src/ui/trash-view/trash-view.css");

const tokensCssPath = resolve(repoRoot, "web/src/styles/tokens.css");
const buttonCssPath = resolve(repoRoot, "web/src/styles/button.css");

const viewTsxPaths = [
  resolve(repoRoot, "web/src/ui/today-view/today-view.tsx"),
  resolve(repoRoot, "web/src/ui/tomorrow-view/tomorrow-view.tsx"),
  resolve(repoRoot, "web/src/ui/projects-view/projects-view.tsx"),
  resolve(repoRoot, "web/src/ui/routines-view/routines-view.tsx"),
  resolve(repoRoot, "web/src/ui/focus-view/focus-view.tsx"),
  resolve(repoRoot, "web/src/ui/settings-view/settings-view.tsx"),
  resolve(repoRoot, "web/src/ui/trash-view/trash-view.tsx"),
];

/**
 * 指定したセレクタの「ルール本文 (= {} で囲まれた中身)」を抽出する.
 *
 * 単純な /selector\s*\{([^}]*)\}/ では `.day-view__header` が
 * `.day-view__header--today` の prefix にも一致してしまうため,
 * セレクタ末尾を `{` / 空白で厳密に区切る.
 * (completion-counter-emphasis.test.ts / project-chip.test.tsx と同形のヘルパー.)
 */
function extractRuleBody(css: string, selector: string): string | null {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`, "m");
  const m = css.match(re);
  return m?.[1] ?? null;
}

// ============================================================
// AC-h1-center: 各 view CSS の h1 ルール本文に text-align: center
// ============================================================

describe("BL-111 / view-title-center-align: AC-h1-center (CSS 文面に text-align: center)", () => {
  // ----------------------------------------------------------
  // REQ-1 / REQ-2: day-view.css の .day-view__header h1
  //
  // spec.md AC-h1-center シナリオ:
  //   Given web/src/ui/day-view/day-view.css の .day-view__header h1 ルールを開く
  //   When  ルール本体を読む
  //   Then  ルール本文に text-align: center が含まれる
  //
  // この 1 ルールが /today (.day-view__header--today の子) と /tomorrow
  // (.day-view__header の子) の両方の h1 中央揃えに寄与する (= REQ-1 と REQ-2 を同時カバー).
  // ----------------------------------------------------------
  describe("REQ-1 / REQ-2: .day-view__header h1 (today / tomorrow 共通)", () => {
    it("web/src/ui/day-view/day-view.css が存在する", () => {
      expect(existsSync(dayViewCssPath)).toBe(true);
    });

    it(".day-view__header h1 ルールが day-view.css に存在する", () => {
      const css = readFileSync(dayViewCssPath, "utf-8");
      const body = extractRuleBody(css, ".day-view__header h1");
      expect(body, ".day-view__header h1 ルールが見つからない").not.toBeNull();
    });

    it(".day-view__header h1 ルール本文に text-align: center を含む (REQ-2)", () => {
      const css = readFileSync(dayViewCssPath, "utf-8");
      const body = extractRuleBody(css, ".day-view__header h1");
      expect(body, ".day-view__header h1 ルールが見つからない").not.toBeNull();
      expect(body ?? "").toMatch(/text-align\s*:\s*center/);
    });
  });

  // ----------------------------------------------------------
  // REQ-3: projects-view.css の .projects-view h1
  // ----------------------------------------------------------
  describe("REQ-3: .projects-view h1", () => {
    it("web/src/ui/projects-view/projects-view.css が存在する", () => {
      expect(existsSync(projectsViewCssPath)).toBe(true);
    });

    it(".projects-view h1 ルール本文に text-align: center を含む (REQ-3)", () => {
      const css = readFileSync(projectsViewCssPath, "utf-8");
      const body = extractRuleBody(css, ".projects-view h1");
      expect(body, ".projects-view h1 ルールが見つからない").not.toBeNull();
      expect(body ?? "").toMatch(/text-align\s*:\s*center/);
    });
  });

  // ----------------------------------------------------------
  // REQ-4: routines-view.css の .routines-view h1
  // ----------------------------------------------------------
  describe("REQ-4: .routines-view h1", () => {
    it("web/src/ui/routines-view/routines-view.css が存在する", () => {
      expect(existsSync(routinesViewCssPath)).toBe(true);
    });

    it(".routines-view h1 ルール本文に text-align: center を含む (REQ-4)", () => {
      const css = readFileSync(routinesViewCssPath, "utf-8");
      const body = extractRuleBody(css, ".routines-view h1");
      expect(body, ".routines-view h1 ルールが見つからない").not.toBeNull();
      expect(body ?? "").toMatch(/text-align\s*:\s*center/);
    });
  });

  // ----------------------------------------------------------
  // REQ-5: focus-view.css の .focus-view h1
  // ----------------------------------------------------------
  describe("REQ-5: .focus-view h1", () => {
    it("web/src/ui/focus-view/focus-view.css が存在する", () => {
      expect(existsSync(focusViewCssPath)).toBe(true);
    });

    it(".focus-view h1 ルール本文に text-align: center を含む (REQ-5)", () => {
      const css = readFileSync(focusViewCssPath, "utf-8");
      const body = extractRuleBody(css, ".focus-view h1");
      expect(body, ".focus-view h1 ルールが見つからない").not.toBeNull();
      expect(body ?? "").toMatch(/text-align\s*:\s*center/);
    });
  });

  // ----------------------------------------------------------
  // REQ-6: settings-view.css の .settings-view h1
  // ----------------------------------------------------------
  describe("REQ-6: .settings-view h1", () => {
    it("web/src/ui/settings-view/settings-view.css が存在する", () => {
      expect(existsSync(settingsViewCssPath)).toBe(true);
    });

    it(".settings-view h1 ルール本文に text-align: center を含む (REQ-6)", () => {
      const css = readFileSync(settingsViewCssPath, "utf-8");
      const body = extractRuleBody(css, ".settings-view h1");
      expect(body, ".settings-view h1 ルールが見つからない").not.toBeNull();
      expect(body ?? "").toMatch(/text-align\s*:\s*center/);
    });
  });

  // ----------------------------------------------------------
  // REQ-7: trash-view.css の .trash-view__header h1
  // ----------------------------------------------------------
  describe("REQ-7: .trash-view__header h1", () => {
    it("web/src/ui/trash-view/trash-view.css が存在する", () => {
      expect(existsSync(trashViewCssPath)).toBe(true);
    });

    it(".trash-view__header h1 ルール本文に text-align: center を含む (REQ-7)", () => {
      const css = readFileSync(trashViewCssPath, "utf-8");
      const body = extractRuleBody(css, ".trash-view__header h1");
      expect(body, ".trash-view__header h1 ルールが見つからない").not.toBeNull();
      expect(body ?? "").toMatch(/text-align\s*:\s*center/);
    });
  });
});

// ============================================================
// AC-no-regression: 既存の font-size: var(--font-size-h1) が残っている
//
// 非ゴール: h1 のフォントサイズ / 色 / margin を変更しない.
// 各 view CSS の対象 h1 ルール本体に既存の font-size 宣言が残ることをガードする.
// ============================================================

describe("BL-111 / view-title-center-align: AC-no-regression (font-size 据え置き)", () => {
  const cases: Array<{ name: string; cssPath: string; selector: string }> = [
    { name: ".day-view__header h1", cssPath: dayViewCssPath, selector: ".day-view__header h1" },
    { name: ".projects-view h1", cssPath: projectsViewCssPath, selector: ".projects-view h1" },
    { name: ".routines-view h1", cssPath: routinesViewCssPath, selector: ".routines-view h1" },
    { name: ".focus-view h1", cssPath: focusViewCssPath, selector: ".focus-view h1" },
    { name: ".settings-view h1", cssPath: settingsViewCssPath, selector: ".settings-view h1" },
    {
      name: ".trash-view__header h1",
      cssPath: trashViewCssPath,
      selector: ".trash-view__header h1",
    },
  ];

  for (const { name, cssPath, selector } of cases) {
    it(`${name} ルール本文に font-size: var(--font-size-h1) が残っている`, () => {
      const css = readFileSync(cssPath, "utf-8");
      const body = extractRuleBody(css, selector);
      expect(body, `${selector} ルールが見つからない`).not.toBeNull();
      expect(body ?? "").toMatch(/font-size\s*:\s*var\(--font-size-h1\)/);
    });
  }
});

// ============================================================
// AC-no-global-h1: web/src/styles/ 配下に global な h1 ルールが無い
//
// NFR-NO-GLOBAL-H1: tokens.css / button.css に h1 セレクタを含む
// CSS ルールが存在しない (新規 global h1 ルールの追加を禁止する).
//
// NOTE: tokens.css は `--font-size-h1` トークン定義を含むため,
// 単純な /h1/ では誤検知する. ルール開始の `h1 {` (前後に , や }, 行頭) を
// 正規表現で限定して検知する.
// ============================================================

describe("BL-111 / view-title-center-align: AC-no-global-h1", () => {
  /**
   * `h1` セレクタを含む CSS ルール開始を検知する.
   * - tokens.css の `--font-size-h1` (CSS custom property name) は除外.
   * - `.foo h1 {` のような子孫セレクタの h1 もここでは「global h1 ではない」ため除外.
   *   ここで検知したいのは「セレクタリストの先頭 / カンマ直後 / `}` 直後」に
   *   裸の `h1` が現れて `{` が続くパターン (= タイプセレクタ単独).
   */
  function hasGlobalH1Rule(css: string): boolean {
    // セレクタリスト構成要素として `h1` 単独 (前は行頭 / `}` / `,`) → `{` 直前まで空白か他のセレクタ無し.
    // 例:
    //   h1 { ... }                  ← マッチ
    //   h1, h2 { ... }              ← マッチ (h1 が単独で現れる)
    //   .foo h1 { ... }             ← マッチさせない (子孫セレクタの一部)
    //   --font-size-h1: 24px;       ← マッチさせない (custom property name)
    const re = /(?:^|[}\n,])\s*h1(?:\s*,\s*[^{]*)?\s*\{/m;
    return re.test(css);
  }

  it("web/src/styles/tokens.css が存在する", () => {
    expect(existsSync(tokensCssPath)).toBe(true);
  });

  it("web/src/styles/button.css が存在する", () => {
    expect(existsSync(buttonCssPath)).toBe(true);
  });

  it("tokens.css に global h1 ルール (例: `h1 {`) が存在しない", () => {
    const css = readFileSync(tokensCssPath, "utf-8");
    expect(hasGlobalH1Rule(css)).toBe(false);
  });

  it("button.css に global h1 ルール (例: `h1 {`) が存在しない", () => {
    const css = readFileSync(buttonCssPath, "utf-8");
    expect(hasGlobalH1Rule(css)).toBe(false);
  });
});

// ============================================================
// AC-no-class-shadow: 各 view TSX に className="view-title" が無い
//
// NFR-NO-COMMON-CLASS: `.view-title` のような共通クラスを各 view の h1 に
// 付与しない (= 候補 (c) を採用しない). DOM 改修禁止と整合.
// ============================================================

describe("BL-111 / view-title-center-align: AC-no-class-shadow", () => {
  for (const tsxPath of viewTsxPaths) {
    it(`${tsxPath.replace(`${repoRoot}/`, "")} に view-title 文字列がヒットしない`, () => {
      expect(existsSync(tsxPath)).toBe(true);
      const src = readFileSync(tsxPath, "utf-8");
      expect(src.includes("view-title")).toBe(false);
    });
  }
});

// ============================================================
// AC-trash-header-preserved: .trash-view__header のレイアウトは無改修
//
// NFR-PRESERVE-LAYOUT: .trash-view__header 自身は display: flex /
// justify-content: space-between のまま. h1 と「全削除」 button の
// 左右両端配置レイアウトは不変.
// ============================================================

describe("BL-111 / view-title-center-align: AC-trash-header-preserved", () => {
  it(".trash-view__header ルールが trash-view.css に存在する", () => {
    const css = readFileSync(trashViewCssPath, "utf-8");
    const body = extractRuleBody(css, ".trash-view__header");
    expect(body, ".trash-view__header ルールが見つからない").not.toBeNull();
  });

  it(".trash-view__header ルール本文に display: flex が残っている", () => {
    const css = readFileSync(trashViewCssPath, "utf-8");
    const body = extractRuleBody(css, ".trash-view__header");
    expect(body, ".trash-view__header ルールが見つからない").not.toBeNull();
    expect(body ?? "").toMatch(/display\s*:\s*flex/);
  });

  it(".trash-view__header ルール本文に justify-content: space-between が残っている", () => {
    const css = readFileSync(trashViewCssPath, "utf-8");
    const body = extractRuleBody(css, ".trash-view__header");
    expect(body, ".trash-view__header ルールが見つからない").not.toBeNull();
    expect(body ?? "").toMatch(/justify-content\s*:\s*space-between/);
  });
});
