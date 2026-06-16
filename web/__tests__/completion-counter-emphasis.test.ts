/**
 * 静的 CSS アサーション単体テスト: 今日の完了タスク数カウンタの中央配置 + アクセント色強調
 * (BL-105 / completion-counter-emphasis).
 *
 * 仕様参照:
 *   docs/developer/features/completion-counter-emphasis/spec.md
 *     §「受け入れ基準」スタイル (REQ-2 / REQ-3 / REQ-4) /
 *     §「共通 .day-view__header ルールは flex-direction を持たないか, row のままである」
 *   docs/developer/features/completion-counter-emphasis/plan.md §「CSS の変更」
 *   docs/developer/features/completion-counter-emphasis/tasks.md §「新規テスト」
 *
 * 本ファイルは TDD の "red" を作るためのテストである.
 *   - 現状の web/src/ui/today-view/today-view.css は次の 1 ルールのみ:
 *       .today-view__completion-count {
 *         font-size: var(--font-size-small);   ← 旧値 (BL-047)
 *         color: var(--color-fg-subtle);       ← 旧値 (BL-047)
 *       }
 *     よって以下のテストは全て red になる.
 *   - implementer が plan.md §「CSS の変更」 のとおりに書き換える/追加することで green 化する.
 *
 * 担保する受け入れ基準:
 *   AC-スタイル 1: .today-view__completion-count に font-size: var(--font-size-h2)
 *   AC-スタイル 2: .today-view__completion-count に color: var(--color-accent)
 *   AC-スタイル 3: .today-view__completion-count に text-align: center
 *   AC-modifier  : .day-view__header--today ルールが today-view.css 内に存在し,
 *                  本体に flex-direction: column を含む
 *   AC-非破壊    : web/src/ui/day-view/day-view.css の .day-view__header 本体に
 *                  flex-direction: column が **含まれない** (= tomorrow 非波及の回帰ガード)
 *   AC-旧値撤去  : .today-view__completion-count に font-size: var(--font-size-small) /
 *                  color: var(--color-fg-subtle) (旧 BL-047 値) が残っていない
 *
 * NOTE:
 *   jsdom 環境では getComputedStyle が CSS Custom Property の解決まで行わないため,
 *   spec § 「スタイル」 の検証は CSS 文面 (= `.css` ファイル直読み) で行う.
 *   これは project-chip.test.tsx / task-card-hotfix.test.tsx 等で既に確立された
 *   パターンに従う.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(__dirname, "../..");
const todayViewCssPath = resolve(repoRoot, "web/src/ui/today-view/today-view.css");
const dayViewCssPath = resolve(repoRoot, "web/src/ui/day-view/day-view.css");

/**
 * 指定したセレクタの「ルール本文 (= {} で囲まれた中身)」を抽出する.
 *
 * 単純な /selector\s*\{([^}]*)\}/ では `.day-view__header` が
 * `.day-view__header--today` の prefix にも一致してしまうため,
 * セレクタ末尾を `{` / 空白で厳密に区切る (project-chip.test.tsx / hamburger-overlap-fix.test.ts
 * と同形のヘルパー).
 */
function extractRuleBody(css: string, selector: string): string | null {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`, "m");
  const m = css.match(re);
  return m?.[1] ?? null;
}

describe("BL-105 / completion-counter-emphasis: today-view.css の CSS 文面検証", () => {
  // ----------------------------------------------------------
  // 前提: today-view.css が存在する
  // ----------------------------------------------------------
  it("web/src/ui/today-view/today-view.css が存在する", () => {
    expect(existsSync(todayViewCssPath)).toBe(true);
  });

  // ----------------------------------------------------------
  // AC-スタイル: .today-view__completion-count ルール本文の検証
  //
  // spec.md §「スタイル (REQ-2 / REQ-3 / REQ-4)」:
  //   Given web/src/ui/today-view/today-view.css の .today-view__completion-count
  //         ルールを開く
  //   When  ルール本体を読む
  //   Then  font-size の値が var(--font-size-h2) である
  //   And   color の値が var(--color-accent) である
  //   And   text-align の値が center である
  // ----------------------------------------------------------
  describe("AC-スタイル: .today-view__completion-count ルール本文 (REQ-2 / REQ-3 / REQ-4)", () => {
    it(".today-view__completion-count ルールが today-view.css に存在する", () => {
      const css = readFileSync(todayViewCssPath, "utf-8");
      const body = extractRuleBody(css, ".today-view__completion-count");
      expect(body, ".today-view__completion-count ルールが見つからない").not.toBeNull();
    });

    it(".today-view__completion-count ルール本文に font-size: var(--font-size-h2) を含む (REQ-3)", () => {
      const css = readFileSync(todayViewCssPath, "utf-8");
      const body = extractRuleBody(css, ".today-view__completion-count");
      expect(body, ".today-view__completion-count ルールが見つからない").not.toBeNull();
      expect(body ?? "").toMatch(/font-size\s*:\s*var\(--font-size-h2\)/);
    });

    it(".today-view__completion-count ルール本文に color: var(--color-accent) を含む (REQ-4)", () => {
      const css = readFileSync(todayViewCssPath, "utf-8");
      const body = extractRuleBody(css, ".today-view__completion-count");
      expect(body, ".today-view__completion-count ルールが見つからない").not.toBeNull();
      expect(body ?? "").toMatch(/(?:^|;|\n)\s*color\s*:\s*var\(--color-accent\)/);
    });

    it(".today-view__completion-count ルール本文に text-align: center を含む (REQ-2)", () => {
      const css = readFileSync(todayViewCssPath, "utf-8");
      const body = extractRuleBody(css, ".today-view__completion-count");
      expect(body, ".today-view__completion-count ルールが見つからない").not.toBeNull();
      expect(body ?? "").toMatch(/text-align\s*:\s*center/);
    });
  });

  // ----------------------------------------------------------
  // AC-旧値撤去: BL-047 の旧 small / subtle 値が残っていない
  //
  // spec.md §「要件」REQ-3 / REQ-4:
  //   本 BL の前: var(--font-size-small) / var(--color-fg-subtle).
  //   本 BL で : var(--font-size-h2) / var(--color-accent) に置換する.
  // ----------------------------------------------------------
  describe("AC-旧値撤去: BL-047 の旧 small / subtle 値が残っていない", () => {
    it(".today-view__completion-count ルール本文に font-size: var(--font-size-small) が残っていない", () => {
      const css = readFileSync(todayViewCssPath, "utf-8");
      const body = extractRuleBody(css, ".today-view__completion-count");
      expect(body, ".today-view__completion-count ルールが見つからない").not.toBeNull();
      expect(body ?? "").not.toMatch(/font-size\s*:\s*var\(--font-size-small\)/);
    });

    it(".today-view__completion-count ルール本文に color: var(--color-fg-subtle) が残っていない", () => {
      const css = readFileSync(todayViewCssPath, "utf-8");
      const body = extractRuleBody(css, ".today-view__completion-count");
      expect(body, ".today-view__completion-count ルールが見つからない").not.toBeNull();
      expect(body ?? "").not.toMatch(/color\s*:\s*var\(--color-fg-subtle\)/);
    });
  });

  // ----------------------------------------------------------
  // AC-modifier: today 専用 header modifier ルールが today-view.css に存在する
  //
  // spec.md §「スタイル」シナリオ:
  //   Given web/src/ui/today-view/today-view.css の .day-view__header--today ルールを開く
  //   When  ルール本体を読む
  //   Then  flex-direction の値が column である
  //
  // plan.md §「CSS の変更」:
  //   .day-view__header--today { flex-direction: column; align-items: stretch; }
  // ----------------------------------------------------------
  describe("AC-modifier: .day-view__header--today ルール (REQ-5)", () => {
    it(".day-view__header--today ルールが today-view.css に存在する", () => {
      const css = readFileSync(todayViewCssPath, "utf-8");
      const body = extractRuleBody(css, ".day-view__header--today");
      expect(
        body,
        ".day-view__header--today ルールが today-view.css に見つからない",
      ).not.toBeNull();
    });

    it(".day-view__header--today ルール本文に flex-direction: column を含む", () => {
      const css = readFileSync(todayViewCssPath, "utf-8");
      const body = extractRuleBody(css, ".day-view__header--today");
      expect(body, ".day-view__header--today ルールが見つからない").not.toBeNull();
      expect(body ?? "").toMatch(/flex-direction\s*:\s*column/);
    });
  });
});

// ============================================================
// AC-非破壊: 共通 day-view.css の .day-view__header は無改修
//
// spec.md §「スタイル」シナリオ:
//   Given web/src/ui/day-view/day-view.css の .day-view__header ルールを開く
//   When  ルール本体を読む
//   Then  ルール本体に flex-direction: column が **含まれない**
//        (= tomorrow ビューの 1 段 layout を破壊しない)
//
// 現状の day-view.css の .day-view__header は flex-direction を指定していない
// (display: flex のみで row が既定) ため, この AC は本 BL 着手前から自然 green である.
// 実装時に「うっかり共通 CSS を変えてしまう」回帰を検知するためのガード.
// ============================================================

describe("BL-105 / completion-counter-emphasis: 共通 day-view.css の非破壊", () => {
  it("web/src/ui/day-view/day-view.css が存在する", () => {
    expect(existsSync(dayViewCssPath)).toBe(true);
  });

  it(".day-view__header ルールが day-view.css に存在する (BL-051 / AC-2 互換)", () => {
    const css = readFileSync(dayViewCssPath, "utf-8");
    const body = extractRuleBody(css, ".day-view__header");
    expect(body, ".day-view__header ルールが day-view.css に見つからない").not.toBeNull();
  });

  it(".day-view__header ルール本文に flex-direction: column が **含まれない** (tomorrow 非波及の回帰ガード)", () => {
    const css = readFileSync(dayViewCssPath, "utf-8");
    const body = extractRuleBody(css, ".day-view__header");
    expect(body, ".day-view__header ルールが見つからない").not.toBeNull();
    // 共通 .day-view__header は flex-direction を持たない (= row が既定).
    // もし column が混入すると tomorrow header (modifier 非付与) も縦並びになり,
    // 1 段 layout 規約 (= h1 のみの行) を破壊する.
    expect(body ?? "").not.toMatch(/flex-direction\s*:\s*column/);
  });
});
