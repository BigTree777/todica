// @vitest-environment jsdom

/**
 * 起票カードのプロジェクト `<select>` の box サイズを縮小
 * (BL-066 / task-form-select-compact) 受け入れ基準テスト.
 *
 * 仕様参照:
 *   docs/developer/features/task-form-select-compact/spec.md
 *   docs/developer/features/task-form-select-compact/plan.md
 *   docs/developer/features/task-form-select-compact/tasks.md
 *
 * 本ファイルが検証する受け入れ基準 (spec AC-1 〜 AC-12):
 *   AC-1 : .task-card__header select ルール本文に 7 宣言が含まれる (CSS 直読み).
 *   AC-2 : 同ルール本文に不要宣言が含まれず, hover / focus-within 派生セレクタも無い (CSS).
 *   AC-3 : <TaskFormCard idPrefix="create"> の <select> computed style が想定値 (DOM).
 *   AC-4 : <TaskFormCard idPrefix="tomorrow-create"> も同様 (DOM).
 *   AC-5 : TaskCard 表示側の <span class="project-chip"> は本 BL ルールの影響を受けない (DOM).
 *   AC-6 : BL-063 D-003 の .task-card__header .project-chip ルールが維持される (CSS).
 *   AC-7 : JSX 4 ファイル無改修の不変性 sample (= task-card.tsx に <select 無し,
 *          task-form-card.tsx に <select 有り) (静的解析).
 *   AC-8 : tokens.css に本 BL で参照する 5 トークンが引き続き定義されている (CSS).
 *   AC-9 : 他 CSS (day-view.css / focus-view.css) に
 *          .task-card__header select セレクタが混入していない (CSS).
 *   AC-10: task-card.css 全体に box-shadow / transition / animation / :hover /
 *          :focus-within が含まれない (CSS).
 *
 * AC-11 (既存テスト全件 green 維持) と AC-12 (a11y 違反 0) は本ファイルでは
 * 個別 assert せず, ルート `npm test` および `e2e/a11y.spec.ts` の継続実行で担保する.
 *
 * 本ファイルは TDD の "red" を作るためのテスト.
 *   - 実装前 (= task-card.css に .task-card__header select ルールが未追加) では
 *     CSS 直読み系 (AC-1) と DOM レンダ系 (AC-3 / AC-4) が red になる.
 *   - 既存不変性系 (AC-2 / AC-6 / AC-7 / AC-8 / AC-9 / AC-10) は基本 green が期待値.
 *     - AC-5 も既存 BL-063 D-003 (.task-card__header .project-chip) のため green が期待値.
 *   - implementer が REQ-1 を実装することで red 群が green 化する.
 *
 * 検証スタイル:
 *   - CSS 直読み: BL-052 / BL-054 / BL-056 / BL-063 と同じ
 *     readFileSync + extractRuleBody (P-005 / D-008). ヘルパは本ファイル内に再定義する.
 *   - DOM レンダ: BL-063 と同じ render + getComputedStyle パターン.
 *     vitest.config.ts で css: true が有効 (BL-063 で確定済み) なため,
 *     `<select>` の computed style から min-height (リテラル値) は具体値で観測可能.
 *
 *     注意 (spec D-004 / R-4 の修正): jsdom + vite-css 環境の getComputedStyle は
 *     実機で確認した結果, 以下のような限定的挙動をする:
 *       - リテラル値 `min-height: 24px` → "24px" で観測
 *       - var() を含む宣言 → 文字列のまま返る
 *         (font-size: "var(--font-size-small)", border-radius: "var(--radius-lg)", etc.)
 *       - border: の shorthand → 個別プロパティ (borderTopStyle / borderTopWidth) には
 *         展開されない. style.border の文字列で観測する必要がある.
 *       - padding: の shorthand → 同様, style.padding の文字列で観測.
 *       - appearance: none → style.appearance で "none" で観測可能.
 *       - -webkit-appearance: none → style.webkitAppearance が undefined になり観測不可.
 *         CSS ルール本文 (= readFileSync) 側で担保する.
 *     spec の D-004 / AC-3 / AC-4 の前提は実機より楽観的な記述だったため,
 *     プロジェクト設計者へ「jsdom 制約に合わせて AC-3 / AC-4 の検証手段を border 文字列 +
 *     min-height + appearance に限定する」よう要修正フィードバック.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { render } from "@testing-library/react";
import type { Task } from "@todica/domain/task";
import { describe, expect, it } from "vitest";

import type { Project } from "../src/repositories/project-repository.js";
import { TaskCard } from "../src/ui/task-card/task-card.js";
import { TaskFormCard } from "../src/ui/task-card/task-form-card.js";

// ============================================================
// 共通定数 / パス解決
// ============================================================

const repoRoot = resolve(__dirname, "../..");
const webSrcRoot = resolve(repoRoot, "web/src");

const taskCardCssPath = resolve(webSrcRoot, "ui/task-card/task-card.css");
const taskCardTsxPath = resolve(webSrcRoot, "ui/task-card/task-card.tsx");
const taskFormCardTsxPath = resolve(webSrcRoot, "ui/task-card/task-form-card.tsx");
const tokensCssPath = resolve(webSrcRoot, "styles/tokens.css");
const dayViewCssPath = resolve(webSrcRoot, "ui/day-view/day-view.css");
const focusViewCssPath = resolve(webSrcRoot, "ui/focus-view/focus-view.css");

const NOW = "2026-06-12T09:00:00.000Z";
const PROJECT_ID_P1 = "p1p1p1p1-p1p1-4p1p-8p1p-p1p1p1p1p1p1";
const PROJECT_NAME_P1 = "プロジェクトα";

// ============================================================
// CSS ルール本文の抽出ヘルパ (D-008 / 各 BL と同形を再定義)
// ============================================================

/**
 * 指定したセレクタの「ルール本文 (= {} で囲まれた中身)」を抽出する.
 *
 * セレクタの直後が空白 + `{` であるルールに限定する (= prefix 一致による誤検知を防ぐ).
 * BL-052 / BL-054 / BL-056 / BL-057 / BL-058 / BL-059 / BL-063 のヘルパと同等実装の
 * 再定義 (P-005 / D-008). 共通モジュール化は本 BL のスコープ外.
 */
function extractRuleBody(css: string, selector: string): string | null {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`, "m");
  const m = css.match(re);
  return m?.[1] ?? null;
}

// ============================================================
// DOM レンダテスト用ヘルパ (TaskCard 表示側用)
// ============================================================

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    name: "牛乳",
    projectId: null,
    dueDate: "today",
    priority: "normal",
    origin: "manual",
    routineId: null,
    createdAt: NOW,
    updatedAt: NOW,
    trashedAt: null,
    trashedReason: null,
    version: 1,
    ...overrides,
  };
}

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: PROJECT_ID_P1,
    name: PROJECT_NAME_P1,
    version: 1,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

// ============================================================
// describe ブロック
// ============================================================

describe("起票カードのプロジェクト <select> の box サイズを縮小 (BL-066 / task-form-select-compact)", () => {
  // ============================================================
  // CSS 直読み系 (AC-1 / AC-2 / AC-6 / AC-8 / AC-9 / AC-10)
  // ============================================================

  // ----------------------------------------------------------
  // AC-1: .task-card__header select ルールが task-card.css に存在する (REQ-1)
  // ----------------------------------------------------------
  /**
   * シナリオ AC-1:
   *   Given web/src/ui/task-card/task-card.css を開いた
   *   When  .task-card__header select セレクタのルール本文を観察する
   *   Then  ルール本文が null ではない
   *    かつ min-height: 24px の宣言を含む
   *    かつ padding: var(--space-xs) var(--space-sm) の宣言を含む
   *    かつ font-size: var(--font-size-small) の宣言を含む
   *    かつ border: 1px solid var(--color-border) の宣言を含む
   *    かつ border-radius: var(--radius-lg) の宣言を含む
   *    かつ appearance: none の宣言を含む
   *    かつ -webkit-appearance: none の宣言を含む
   */
  describe("AC-1: .task-card__header select に 7 宣言が定義されている (REQ-1)", () => {
    it(".task-card__header select ルールが定義されている", () => {
      const css = readFileSync(taskCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".task-card__header select");
      expect(body, ".task-card__header select ルールが見つからない (REQ-1 違反)").not.toBeNull();
    });

    it(".task-card__header select ルール本文に min-height: 24px を含む", () => {
      const css = readFileSync(taskCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".task-card__header select");
      expect(body, ".task-card__header select ルールが見つからない").not.toBeNull();
      expect(body ?? "").toMatch(/(?:^|;|\n)\s*min-height\s*:\s*24px/);
    });

    it(".task-card__header select ルール本文に padding: var(--space-xs) var(--space-sm) を含む", () => {
      const css = readFileSync(taskCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".task-card__header select");
      expect(body, ".task-card__header select ルールが見つからない").not.toBeNull();
      expect(body ?? "").toMatch(
        /(?:^|;|\n)\s*padding\s*:\s*var\(--space-xs\)\s+var\(--space-sm\)/,
      );
    });

    it(".task-card__header select ルール本文に font-size: var(--font-size-small) を含む", () => {
      const css = readFileSync(taskCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".task-card__header select");
      expect(body, ".task-card__header select ルールが見つからない").not.toBeNull();
      expect(body ?? "").toMatch(/font-size\s*:\s*var\(--font-size-small\)/);
    });

    it(".task-card__header select ルール本文に border: 1px solid var(--color-border) を含む", () => {
      const css = readFileSync(taskCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".task-card__header select");
      expect(body, ".task-card__header select ルールが見つからない").not.toBeNull();
      const bodyText = body ?? "";
      const hasShorthand = /border\s*:\s*1px\s+solid\s+var\(--color-border\)/.test(bodyText);
      const hasDecomposed =
        /border-width\s*:\s*1px/.test(bodyText) &&
        /border-style\s*:\s*solid/.test(bodyText) &&
        /border-color\s*:\s*var\(--color-border\)/.test(bodyText);
      expect(
        hasShorthand || hasDecomposed,
        ".task-card__header select に border: 1px solid var(--color-border) 等価宣言が無い",
      ).toBe(true);
    });

    it(".task-card__header select ルール本文に border-radius: var(--radius-lg) を含む", () => {
      const css = readFileSync(taskCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".task-card__header select");
      expect(body, ".task-card__header select ルールが見つからない").not.toBeNull();
      expect(body ?? "").toMatch(/border-radius\s*:\s*var\(--radius-lg\)/);
    });

    it(".task-card__header select ルール本文に appearance: none を含む", () => {
      const css = readFileSync(taskCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".task-card__header select");
      expect(body, ".task-card__header select ルールが見つからない").not.toBeNull();
      // -webkit-appearance: none に誤マッチしないよう, 行頭または `;` / `{` 直後の
      // `appearance:` のみにマッチさせる.
      expect(body ?? "").toMatch(/(?:^|;|\n|\{)\s*appearance\s*:\s*none/);
    });

    it(".task-card__header select ルール本文に -webkit-appearance: none を含む", () => {
      const css = readFileSync(taskCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".task-card__header select");
      expect(body, ".task-card__header select ルールが見つからない").not.toBeNull();
      expect(body ?? "").toMatch(/-webkit-appearance\s*:\s*none/);
    });
  });

  // ----------------------------------------------------------
  // AC-2: .task-card__header select ルールに不要宣言が含まれていない
  // ----------------------------------------------------------
  /**
   * シナリオ AC-2:
   *   Given web/src/ui/task-card/task-card.css を開いた
   *   When  .task-card__header select セレクタのルール本文を観察する
   *   Then  background プロパティの宣言を含まない
   *    かつ color プロパティの宣言を含まない
   *    かつ box-shadow プロパティの宣言を含まない
   *    かつ transition プロパティの宣言を含まない
   *    かつ animation プロパティの宣言を含まない
   *    かつ :hover / :focus-within の派生セレクタを task-card.css 内に持たない
   */
  describe("AC-2: .task-card__header select ルールに不要宣言が含まれていない (NFR-NO-SHADOW / NFR-NO-HOVER-TRANSITION)", () => {
    it(".task-card__header select ルール本文に background 宣言が含まれない", () => {
      const css = readFileSync(taskCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".task-card__header select");
      expect(body, ".task-card__header select ルールが見つからない").not.toBeNull();
      expect(body ?? "").not.toMatch(/(?:^|;|\n)\s*background(?:-color)?\s*:/);
    });

    it(".task-card__header select ルール本文に color 宣言が含まれない (親 .task-card から継承させる / P-006)", () => {
      const css = readFileSync(taskCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".task-card__header select");
      expect(body, ".task-card__header select ルールが見つからない").not.toBeNull();
      // border-color 等の複合宣言にマッチしないよう, `;` / `{` / 行頭直後の
      // `color:` のみにマッチさせる.
      expect(body ?? "").not.toMatch(/(?:^|;|\n|\{)\s*color\s*:/);
    });

    it(".task-card__header select ルール本文に box-shadow 宣言が含まれない", () => {
      const css = readFileSync(taskCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".task-card__header select");
      expect(body, ".task-card__header select ルールが見つからない").not.toBeNull();
      expect(body ?? "").not.toMatch(/(?:^|;|\n)\s*box-shadow\s*:/);
    });

    it(".task-card__header select ルール本文に transition 宣言が含まれない", () => {
      const css = readFileSync(taskCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".task-card__header select");
      expect(body, ".task-card__header select ルールが見つからない").not.toBeNull();
      expect(body ?? "").not.toMatch(/(?:^|;|\n)\s*transition\s*:/);
    });

    it(".task-card__header select ルール本文に animation 宣言が含まれない", () => {
      const css = readFileSync(taskCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".task-card__header select");
      expect(body, ".task-card__header select ルールが見つからない").not.toBeNull();
      expect(body ?? "").not.toMatch(/(?:^|;|\n)\s*animation\s*:/);
    });

    it("task-card.css 全体に .task-card__header select:hover セレクタが存在しない", () => {
      const css = readFileSync(taskCardCssPath, "utf-8");
      expect(css).not.toContain(".task-card__header select:hover");
    });

    it("task-card.css 全体に .task-card__header select:focus-within セレクタが存在しない", () => {
      const css = readFileSync(taskCardCssPath, "utf-8");
      expect(css).not.toContain(".task-card__header select:focus-within");
    });
  });

  // ============================================================
  // jsdom DOM レンダ系 (AC-3 / AC-4 / AC-5)
  // ============================================================

  // ----------------------------------------------------------
  // AC-3: <TaskFormCard idPrefix="create"> の <select> computed style 確認 (today)
  // ----------------------------------------------------------
  /**
   * シナリオ AC-3:
   *   Given TaskFormCard を idPrefix="create" / inputId="task-name" /
   *         projects=[{ id: "p1", name: "プロジェクトα" }] / projectId="" /
   *         priority="normal" で jsdom 上にレンダリングする
   *   When  document.getElementById("create-project") の getComputedStyle を取得する
   *   Then  fontSize が "14px" である (= var(--font-size-small) 解決)
   *    かつ borderTopStyle が "solid" / borderTopWidth が "1px" である
   *    かつ borderRadius が "16px" である (= var(--radius-lg) 解決)
   *    かつ minHeight が "24px" である
   *    かつ appearance または webkitAppearance が "none" である
   */
  describe("AC-3: <TaskFormCard idPrefix='create'> の <select> computed style 確認 (today)", () => {
    it("#create-project の getComputedStyle().fontSize が '14px' に解決される (jsdom が var() を解決すれば '14px', しなければ 'var(--font-size-small)' を許容)", () => {
      render(
        <TaskFormCard
          projects={[makeProject({ id: "p1", name: PROJECT_NAME_P1 })]}
          projectId=""
          onProjectIdChange={() => {}}
          priority="normal"
          onPriorityChange={() => {}}
          name=""
          onNameChange={() => {}}
          onSubmit={(e: React.FormEvent) => {
            e.preventDefault();
          }}
          idPrefix="create"
          inputId="task-name"
          formAriaLabel="タスク起票フォーム"
        />,
      );
      const select = document.getElementById("create-project") as HTMLSelectElement | null;
      expect(select, "#create-project が見つからない").not.toBeNull();
      if (!select) return;
      const style = getComputedStyle(select);
      // jsdom の getComputedStyle は CSS 変数を解決しないケースがあるため (spec D-004 の前提を修正),
      // "14px" (= --font-size-small の解決値) または "var(--font-size-small)" (= 未解決) のいずれかを許容する.
      // 実装側で .task-card__header select に font-size: var(--font-size-small) を書けば
      // いずれの形でも本 assert が通り, 一方ルール未追加の状態では空文字列 "" が返り red になる.
      expect(
        style.fontSize === "14px" || style.fontSize === "var(--font-size-small)",
        `#create-project の font-size が '14px' でも 'var(--font-size-small)' でもない (実際: "${style.fontSize}")`,
      ).toBe(true);
    });

    it("#create-project の border 文字列に '1px solid' と 'var(--color-border)' が含まれる", () => {
      // jsdom + vite-css 環境では border: shorthand が borderTopStyle / borderTopWidth に
      // 展開されない. style.border の文字列で 1px solid + var(--color-border) を観測する.
      render(
        <TaskFormCard
          projects={[makeProject({ id: "p1", name: PROJECT_NAME_P1 })]}
          projectId=""
          onProjectIdChange={() => {}}
          priority="normal"
          onPriorityChange={() => {}}
          name=""
          onNameChange={() => {}}
          onSubmit={(e: React.FormEvent) => {
            e.preventDefault();
          }}
          idPrefix="create"
          inputId="task-name"
          formAriaLabel="タスク起票フォーム"
        />,
      );
      const select = document.getElementById("create-project") as HTMLSelectElement | null;
      expect(select, "#create-project が見つからない").not.toBeNull();
      if (!select) return;
      const style = getComputedStyle(select);
      expect(
        /1px\s+solid/.test(style.border),
        `#create-project の border に '1px solid' が含まれない (実際: "${style.border}")`,
      ).toBe(true);
      expect(
        style.border.includes("var(--color-border)") || style.border.includes("#ccc"),
        `#create-project の border に 'var(--color-border)' (= #ccc) が含まれない (実際: "${style.border}")`,
      ).toBe(true);
    });

    it("#create-project の border-radius が '16px' に解決される (jsdom が var() を解決すれば '16px', しなければ 'var(--radius-lg)' を許容)", () => {
      render(
        <TaskFormCard
          projects={[makeProject({ id: "p1", name: PROJECT_NAME_P1 })]}
          projectId=""
          onProjectIdChange={() => {}}
          priority="normal"
          onPriorityChange={() => {}}
          name=""
          onNameChange={() => {}}
          onSubmit={(e: React.FormEvent) => {
            e.preventDefault();
          }}
          idPrefix="create"
          inputId="task-name"
          formAriaLabel="タスク起票フォーム"
        />,
      );
      const select = document.getElementById("create-project") as HTMLSelectElement | null;
      expect(select, "#create-project が見つからない").not.toBeNull();
      if (!select) return;
      const style = getComputedStyle(select);
      // jsdom は var() を解決しないため (spec D-004 修正), "16px" または "var(--radius-lg)" を許容.
      // ルール未追加時は UA デフォルトの "5px" 等が返り red になる.
      expect(
        style.borderRadius === "16px" || style.borderRadius === "var(--radius-lg)",
        `#create-project の border-radius が '16px' でも 'var(--radius-lg)' でもない (実際: "${style.borderRadius}")`,
      ).toBe(true);
    });

    it("#create-project の min-height が '24px' である", () => {
      render(
        <TaskFormCard
          projects={[makeProject({ id: "p1", name: PROJECT_NAME_P1 })]}
          projectId=""
          onProjectIdChange={() => {}}
          priority="normal"
          onPriorityChange={() => {}}
          name=""
          onNameChange={() => {}}
          onSubmit={(e: React.FormEvent) => {
            e.preventDefault();
          }}
          idPrefix="create"
          inputId="task-name"
          formAriaLabel="タスク起票フォーム"
        />,
      );
      const select = document.getElementById("create-project") as HTMLSelectElement | null;
      expect(select, "#create-project が見つからない").not.toBeNull();
      if (!select) return;
      const style = getComputedStyle(select);
      expect(
        style.minHeight,
        `#create-project の min-height が 24px ではない (実際: "${style.minHeight}")`,
      ).toBe("24px");
    });

    it("#create-project の appearance が 'none' である (R-4 / jsdom + vite-css 環境)", () => {
      // jsdom + vite-css 環境では style.webkitAppearance が undefined になる仕様のため,
      // -webkit-appearance: none の検証は CSS 直読み (AC-1) に委譲し,
      // ここでは appearance: none を style.appearance で観測する.
      render(
        <TaskFormCard
          projects={[makeProject({ id: "p1", name: PROJECT_NAME_P1 })]}
          projectId=""
          onProjectIdChange={() => {}}
          priority="normal"
          onPriorityChange={() => {}}
          name=""
          onNameChange={() => {}}
          onSubmit={(e: React.FormEvent) => {
            e.preventDefault();
          }}
          idPrefix="create"
          inputId="task-name"
          formAriaLabel="タスク起票フォーム"
        />,
      );
      const select = document.getElementById("create-project") as HTMLSelectElement | null;
      expect(select, "#create-project が見つからない").not.toBeNull();
      if (!select) return;
      const style = getComputedStyle(select) as CSSStyleDeclaration & { appearance?: string };
      expect(
        style.appearance,
        `#create-project の appearance が 'none' ではない (実際: "${style.appearance ?? ""}")`,
      ).toBe("none");
    });
  });

  // ----------------------------------------------------------
  // AC-4: <TaskFormCard idPrefix="tomorrow-create"> の <select> computed style 確認 (tomorrow)
  // ----------------------------------------------------------
  /**
   * シナリオ AC-4:
   *   Given TaskFormCard を idPrefix="tomorrow-create" / inputId="tomorrow-task-name" /
   *         projects=[] / projectId="" / priority="normal" で jsdom 上にレンダリングする
   *   When  document.getElementById("tomorrow-create-project") の getComputedStyle を取得する
   *   Then  AC-3 と同じ判定をすべて満たす (idPrefix 違いによる差は無い)
   */
  describe("AC-4: <TaskFormCard idPrefix='tomorrow-create'> の <select> computed style 確認 (tomorrow)", () => {
    it("#tomorrow-create-project の getComputedStyle().fontSize が '14px' に解決される (jsdom が var() を解決すれば '14px', しなければ 'var(--font-size-small)' を許容)", () => {
      render(
        <TaskFormCard
          projects={[]}
          projectId=""
          onProjectIdChange={() => {}}
          priority="normal"
          onPriorityChange={() => {}}
          name=""
          onNameChange={() => {}}
          onSubmit={(e: React.FormEvent) => {
            e.preventDefault();
          }}
          idPrefix="tomorrow-create"
          inputId="tomorrow-task-name"
          formAriaLabel="明日のタスク起票フォーム"
        />,
      );
      const select = document.getElementById("tomorrow-create-project") as HTMLSelectElement | null;
      expect(select, "#tomorrow-create-project が見つからない").not.toBeNull();
      if (!select) return;
      const style = getComputedStyle(select);
      // jsdom は var() を解決しないため (spec D-004 修正), "14px" または "var(--font-size-small)" を許容.
      expect(
        style.fontSize === "14px" || style.fontSize === "var(--font-size-small)",
        `#tomorrow-create-project の font-size が '14px' でも 'var(--font-size-small)' でもない (実際: "${style.fontSize}")`,
      ).toBe(true);
    });

    it("#tomorrow-create-project の border 文字列に '1px solid' と 'var(--color-border)' が含まれる", () => {
      render(
        <TaskFormCard
          projects={[]}
          projectId=""
          onProjectIdChange={() => {}}
          priority="normal"
          onPriorityChange={() => {}}
          name=""
          onNameChange={() => {}}
          onSubmit={(e: React.FormEvent) => {
            e.preventDefault();
          }}
          idPrefix="tomorrow-create"
          inputId="tomorrow-task-name"
          formAriaLabel="明日のタスク起票フォーム"
        />,
      );
      const select = document.getElementById("tomorrow-create-project") as HTMLSelectElement | null;
      expect(select, "#tomorrow-create-project が見つからない").not.toBeNull();
      if (!select) return;
      const style = getComputedStyle(select);
      expect(
        /1px\s+solid/.test(style.border),
        `#tomorrow-create-project の border に '1px solid' が含まれない (実際: "${style.border}")`,
      ).toBe(true);
      expect(
        style.border.includes("var(--color-border)") || style.border.includes("#ccc"),
        `#tomorrow-create-project の border に 'var(--color-border)' (= #ccc) が含まれない (実際: "${style.border}")`,
      ).toBe(true);
    });

    it("#tomorrow-create-project の border-radius が '16px' に解決される (jsdom が var() を解決すれば '16px', しなければ 'var(--radius-lg)' を許容)", () => {
      render(
        <TaskFormCard
          projects={[]}
          projectId=""
          onProjectIdChange={() => {}}
          priority="normal"
          onPriorityChange={() => {}}
          name=""
          onNameChange={() => {}}
          onSubmit={(e: React.FormEvent) => {
            e.preventDefault();
          }}
          idPrefix="tomorrow-create"
          inputId="tomorrow-task-name"
          formAriaLabel="明日のタスク起票フォーム"
        />,
      );
      const select = document.getElementById("tomorrow-create-project") as HTMLSelectElement | null;
      expect(select, "#tomorrow-create-project が見つからない").not.toBeNull();
      if (!select) return;
      const style = getComputedStyle(select);
      expect(
        style.borderRadius === "16px" || style.borderRadius === "var(--radius-lg)",
        `#tomorrow-create-project の border-radius が '16px' でも 'var(--radius-lg)' でもない (実際: "${style.borderRadius}")`,
      ).toBe(true);
    });

    it("#tomorrow-create-project の min-height が '24px' である", () => {
      render(
        <TaskFormCard
          projects={[]}
          projectId=""
          onProjectIdChange={() => {}}
          priority="normal"
          onPriorityChange={() => {}}
          name=""
          onNameChange={() => {}}
          onSubmit={(e: React.FormEvent) => {
            e.preventDefault();
          }}
          idPrefix="tomorrow-create"
          inputId="tomorrow-task-name"
          formAriaLabel="明日のタスク起票フォーム"
        />,
      );
      const select = document.getElementById("tomorrow-create-project") as HTMLSelectElement | null;
      expect(select, "#tomorrow-create-project が見つからない").not.toBeNull();
      if (!select) return;
      const style = getComputedStyle(select);
      expect(
        style.minHeight,
        `#tomorrow-create-project の min-height が 24px ではない (実際: "${style.minHeight}")`,
      ).toBe("24px");
    });

    it("#tomorrow-create-project の appearance が 'none' である (R-4 / jsdom + vite-css 環境)", () => {
      render(
        <TaskFormCard
          projects={[]}
          projectId=""
          onProjectIdChange={() => {}}
          priority="normal"
          onPriorityChange={() => {}}
          name=""
          onNameChange={() => {}}
          onSubmit={(e: React.FormEvent) => {
            e.preventDefault();
          }}
          idPrefix="tomorrow-create"
          inputId="tomorrow-task-name"
          formAriaLabel="明日のタスク起票フォーム"
        />,
      );
      const select = document.getElementById("tomorrow-create-project") as HTMLSelectElement | null;
      expect(select, "#tomorrow-create-project が見つからない").not.toBeNull();
      if (!select) return;
      const style = getComputedStyle(select) as CSSStyleDeclaration & { appearance?: string };
      expect(
        style.appearance,
        `#tomorrow-create-project の appearance が 'none' ではない (実際: "${style.appearance ?? ""}")`,
      ).toBe("none");
    });
  });

  // ----------------------------------------------------------
  // AC-5: TaskCard 表示側の <span class="project-chip"> は本 BL ルールの影響を受けない
  // ----------------------------------------------------------
  /**
   * シナリオ AC-5:
   *   Given TaskCard をプロジェクト有り (projectName="プロジェクトα") で jsdom 上にレンダリングする
   *   When  画面上の <span class="project-chip"> の computed style を取得する
   *   Then  fontSize が "14px" であり, これは BL-056 / BL-063 D-003 由来であって
   *         本 BL の .task-card__header select ルールに由来しない
   *    かつ getElementsByTagName("select") の length が 0 である
   *         (= TaskCard 表示側に <select> は無い)
   */
  describe("AC-5 (BL-108 追従): TaskCard 表示側にも `<select>` が出現し本 BL ルールが適用される", () => {
    /**
     * 元の AC-5 は BL-066 当時の前提 (TaskCard 表示側に `.project-chip` `<span>` が居て
     * `<select>` は 0 個) に基づいていた. BL-108 (task-card-project-change) で TaskCard
     * 表示側 chip span は `<select>` に置換されたため, ここでは新前提を assert する.
     */
    it("TaskCard 表示側 chip span は撤去され `.project-chip` が DOM に居ない", () => {
      const { container } = render(
        <TaskCard
          task={makeTask()}
          project={makeProject({ name: PROJECT_NAME_P1 })}
          projects={[]}
          onChangeProject={() => {}}
          showPriority
          showSetFocus={false}
          actionSet="full"
          dueDateMode="today"
          onSetPriority={() => {}}
          onDelete={() => {}}
          onToggleDueDate={() => {}}
          onComplete={() => {}}
          onNameBlur={() => {}}
        />,
      );
      expect(container.querySelector(".project-chip")).toBeNull();
    });

    it("TaskCard 表示側 DOM に `<select>` が 1 個存在する (BL-108 で chip → select 置換)", () => {
      const { container } = render(
        <TaskCard
          task={makeTask()}
          project={makeProject({ name: PROJECT_NAME_P1 })}
          projects={[]}
          onChangeProject={() => {}}
          showPriority
          showSetFocus={false}
          actionSet="full"
          dueDateMode="today"
          onSetPriority={() => {}}
          onDelete={() => {}}
          onToggleDueDate={() => {}}
          onComplete={() => {}}
          onNameBlur={() => {}}
        />,
      );
      const selects = container.getElementsByTagName("select");
      expect(
        selects.length,
        `TaskCard 表示側に <select> が ${selects.length} 個存在する (BL-108 では 1 個が期待値)`,
      ).toBe(1);
    });
  });

  // ----------------------------------------------------------
  // AC-6: BL-063 D-003 の .task-card__header .project-chip ルールが維持されている
  // ----------------------------------------------------------
  /**
   * シナリオ AC-6:
   *   Given web/src/ui/task-card/task-card.css を開いた
   *   When  .task-card__header .project-chip セレクタのルール本文を観察する
   *   Then  ルール本文が null ではない
   *    かつ font-size: var(--font-size-small) の宣言を含む (BL-063 D-003 の不変性)
   */
  describe("AC-6: BL-063 D-003 ルールが本 BL でも維持されている (G-6 / REQ-3)", () => {
    it(".task-card__header .project-chip ルールが定義されている", () => {
      const css = readFileSync(taskCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".task-card__header .project-chip");
      expect(
        body,
        ".task-card__header .project-chip ルールが見つからない (BL-063 D-003 不変性違反)",
      ).not.toBeNull();
    });

    it(".task-card__header .project-chip ルール本文に font-size: var(--font-size-small) を含む", () => {
      const css = readFileSync(taskCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".task-card__header .project-chip");
      expect(body, ".task-card__header .project-chip ルールが見つからない").not.toBeNull();
      expect(body ?? "").toMatch(/font-size\s*:\s*var\(--font-size-small\)/);
    });
  });

  // ----------------------------------------------------------
  // AC-7: JSX 4 ファイルの構造的不変性 sample (REQ-4 / NFR-NO-DOM-CHANGE)
  // ----------------------------------------------------------
  /**
   * シナリオ AC-7 (簡易版 / 構造的不変性のサンプル):
   *   Given web/src/ui/task-card/task-card.tsx と task-form-card.tsx を読む
   *   When  ファイルテキストを観察する
   *   Then  task-card.tsx に <select 文字列が含まれない (= TaskCard 表示側に select 無し)
   *    かつ task-form-card.tsx に <select 文字列が含まれる (= BL-065 由来の起票側 select 有り)
   *
   * 注意: spec.md AC-7 は git diff による厳密な「4 ファイル diff = 0」を要求するが,
   * 本テストはランタイムでアサート可能な構造的不変性のサンプル (= sentinel) を担保する.
   * 完全な diff 確認は plan.md の「確認手順」で git diff 経由で行う.
   */
  describe("AC-7 (BL-108 追従): JSX の構造的不変性 sample (REQ-4 / G-3)", () => {
    /**
     * BL-108 (task-card-project-change) で TaskCard 表示側にもプロジェクト変更用の
     * `<select>` が導入された. 旧 AC-7 の「TaskCard 表示側に select 無し」前提は
     * 撤回され, 表示 / 起票の両 TaskCard 系コンポーネントに `<select>` が居ることを
     * sentinel として担保する.
     */
    it("task-card.tsx に '<select' 文字列が含まれる (BL-108 で TaskCard 表示側にも select 追加)", () => {
      const tsx = readFileSync(taskCardTsxPath, "utf-8");
      expect(tsx).toContain("<select");
    });

    it("task-form-card.tsx に '<select' 文字列が含まれる (BL-065 由来の起票側 select)", () => {
      const tsx = readFileSync(taskFormCardTsxPath, "utf-8");
      expect(tsx).toContain("<select");
    });
  });

  // ----------------------------------------------------------
  // AC-8: tokens.css に本 BL で参照する 5 トークンが定義されている (REQ-5 / NFR-NO-NEW-TOKENS)
  // ----------------------------------------------------------
  /**
   * シナリオ AC-8:
   *   Given 本 BL の実装がマージされた
   *   When  web/src/styles/tokens.css を開いた
   *   Then  本 BL で参照する 5 トークン
   *         (--font-size-small / --space-xs / --space-sm /
   *          --color-border / --radius-lg) が引き続き定義されている
   *    かつ --shadow-* のような本 BL では追加すべきでない token が存在しない
   */
  describe("AC-8: tokens.css 無改修 (REQ-5 / NFR-NO-NEW-TOKENS)", () => {
    it("tokens.css に本 BL で参照する 5 トークンが定義されている", () => {
      const css = readFileSync(tokensCssPath, "utf-8");
      expect(css).toMatch(/--font-size-small\s*:/);
      expect(css).toMatch(/--space-xs\s*:/);
      expect(css).toMatch(/--space-sm\s*:/);
      expect(css).toMatch(/--color-border\s*:/);
      expect(css).toMatch(/--radius-lg\s*:/);
    });

    it("tokens.css に本 BL では追加すべきでない --shadow-* トークンが存在しない", () => {
      const css = readFileSync(tokensCssPath, "utf-8");
      expect(css).not.toMatch(/--shadow-/);
    });
  });

  // ----------------------------------------------------------
  // AC-9: 他 CSS (day-view.css / focus-view.css) に
  //       .task-card__header select セレクタが混入していない (REQ-6)
  // ----------------------------------------------------------
  /**
   * シナリオ AC-9:
   *   Given 本 BL の実装がマージされた
   *   When  day-view.css / focus-view.css を開いた
   *   Then  両ファイルとも .task-card__header select 文字列を含まない
   */
  describe("AC-9: 他 CSS に .task-card__header select セレクタが混入していない (REQ-6 / G-3)", () => {
    it("day-view.css に '.task-card__header select' 文字列が含まれない", () => {
      const css = readFileSync(dayViewCssPath, "utf-8");
      expect(css).not.toContain(".task-card__header select");
    });

    it("focus-view.css に '.task-card__header select' 文字列が含まれない", () => {
      const css = readFileSync(focusViewCssPath, "utf-8");
      expect(css).not.toContain(".task-card__header select");
    });
  });

  // ----------------------------------------------------------
  // AC-10: task-card.css 全体に box-shadow / hover / transition / animation が無い
  // ----------------------------------------------------------
  /**
   * シナリオ AC-10:
   *   Given web/src/ui/task-card/task-card.css を開いた
   *   When  ファイル全体を観察する
   *   Then  box-shadow キーワードを含む宣言が存在しない
   *    かつ transition キーワードを含む宣言が存在しない
   *    かつ animation キーワードを含む宣言が存在しない
   *    かつ ":hover" を含むセレクタが存在しない
   *    かつ ":focus-within" を含むセレクタが存在しない
   *
   * 注意: BL-063 AC-22 と重複するが, 本 BL の追記後も維持されることを担保するため
   *       再 assert する.
   */
  describe("AC-10: task-card.css 全体に box-shadow / hover / transition / animation 無し (NFR-NO-SHADOW / NFR-NO-HOVER-TRANSITION)", () => {
    it("task-card.css 全体に box-shadow キーワードが含まれない", () => {
      const css = readFileSync(taskCardCssPath, "utf-8");
      expect(css).not.toContain("box-shadow");
    });

    it("task-card.css 全体に transition 宣言が含まれない", () => {
      const css = readFileSync(taskCardCssPath, "utf-8");
      expect(css).not.toMatch(/(?:^|;|\n|\{)\s*transition\s*:/);
    });

    it("task-card.css 全体に animation 宣言が含まれない", () => {
      const css = readFileSync(taskCardCssPath, "utf-8");
      expect(css).not.toMatch(/(?:^|;|\n|\{)\s*animation\s*:/);
    });

    it("task-card.css 全体に ':hover' を含むセレクタが存在しない", () => {
      const css = readFileSync(taskCardCssPath, "utf-8");
      expect(css).not.toContain(":hover");
    });

    it("task-card.css 全体に ':focus-within' を含むセレクタが存在しない", () => {
      const css = readFileSync(taskCardCssPath, "utf-8");
      expect(css).not.toContain(":focus-within");
    });
  });
});
