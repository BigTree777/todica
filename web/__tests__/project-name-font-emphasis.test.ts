/**
 * 静的 CSS アサーション + DOM 不変アサーション単体テスト:
 * プロジェクトカード / プロジェクト起票カードのプロジェクト名フォントサイズを
 * h2 サイズ (= `var(--font-size-h2)`) に揃える (BL-110 / project-name-font-emphasis).
 *
 * 仕様参照:
 *   docs/developer/features/project-name-font-emphasis/spec.md
 *     §「受け入れ基準」スタイル (REQ-1 / REQ-2 / REQ-3) /
 *     §「受け入れ基準」マークアップ不変 (REQ-4) /
 *     §「受け入れ基準」系統独立 (NFR-NO-ROUTINE-OR-TASK-CASCADE / NFR-SCOPE-CSS-ONLY)
 *   docs/developer/features/project-name-font-emphasis/plan.md §「CSS の変更」 / §「重要な決定」
 *   docs/developer/features/project-name-font-emphasis/tasks.md §「test-designer 範囲」
 *
 * 本ファイルは TDD の "red" を作るためのテストである.
 *   - 現状の web/src/ui/project-card/project-card.css の `.project-card__input` ルールは
 *       .project-card__input {
 *         flex: 1;
 *       }
 *     の 1 宣言しか持たない. よって `AC-CSS-font-size` は red になる想定.
 *   - implementer が plan.md §「CSS の変更」 のとおり
 *     `.project-card__input` ルール本文に `font-size: var(--font-size-h2)` を 1 行追加することで
 *     `AC-CSS-font-size` が green 化する.
 *   - 既存宣言保存 (AC-CSS-flex 保存 / AC-CSS-placeholder 保存) / DOM 不変 (AC-DOM-*) /
 *     非波及 (AC-非波及-*) は実装前から green が期待値 (= 回帰ガード).
 *
 * 担保する受け入れ基準:
 *   AC-CSS-font-size            : .project-card__input ルール本文に
 *                                 `font-size: var(--font-size-h2)` を含む (REQ-1).
 *   AC-CSS-flex 保存             : 同ルール本文に既存の `flex: 1` (または `flex-grow: 1`) を含む (REQ-3).
 *   AC-CSS-placeholder 保存      : .project-card__input::placeholder ルール本文に
 *                                 `color: var(--color-fg-subtle)` を含む (REQ-3).
 *   AC-CSS-no-font-on-parent    : .project-card 親ルール本文に `font-size` を含まない (D-001 /
 *                                 副作用範囲拡大の回避. 非ゴール「親 .project-card の font-size
 *                                 変更」のガード).
 *   AC-DOM-ProjectCard 不変      : <ProjectCard project={...} ... /> を render したとき
 *                                 `<input id="project-name-{id}" className="project-card__input">`
 *                                 と `<label htmlFor="project-name-{id}" className="visually-hidden">
 *                                 プロジェクト名</label>` が存在し for ↔ id 関連付けが維持される (REQ-4).
 *   AC-DOM-ProjectFormCard 不変  : <ProjectFormCard name="" ... /> を render したとき
 *                                 `<input id="project-name" className="project-card__input"
 *                                 placeholder="プロジェクト名">` が存在し
 *                                 `<label htmlFor="project-name" className="visually-hidden">
 *                                 プロジェクト名</label>` が存在する (REQ-4).
 *   AC-非波及-task                : web/src/ui/task-card/task-card.css に
 *                                 `.project-card__input` 系セレクタが存在しない
 *                                 (= NFR-NO-ROUTINE-OR-TASK-CASCADE / 系統独立の回帰ガード).
 *   AC-非波及-routine             : web/src/ui/routine-card/routine-card.css に
 *                                 `.project-card__input` 系セレクタが存在しない (同上).
 *
 * NOTE:
 *   - jsdom 環境では getComputedStyle が CSS Custom Property の解決まで行わないため,
 *     spec § 「スタイル」 の検証は CSS 文面 (= `.css` ファイル直読み) で行う.
 *     これは completion-counter-emphasis.test.ts / project-chip.test.tsx /
 *     task-card-hotfix.test.tsx 等で既に確立されたパターンに従う.
 *   - 本ファイルは `.test.ts` (= JSX を直接書けない) のため, DOM render は
 *     `React.createElement` を使って書く. vitest.config.ts の project "web" は
 *     web 配下の .test.ts / .test.tsx を jsdom 環境で実行するため testing-library は問題なく動く.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, render } from "@testing-library/react";
import type { ComponentType } from "react";
import React from "react";
import { afterEach, describe, expect, it } from "vitest";

import type { Project } from "../src/repositories/project-repository.js";

// ============================================================
// 共通定数 / パス解決
// ============================================================

const repoRoot = resolve(__dirname, "../..");
const webSrcRoot = resolve(repoRoot, "web/src");

const projectCardCssPath = resolve(webSrcRoot, "ui/project-card/project-card.css");
const taskCardCssPath = resolve(webSrcRoot, "ui/task-card/task-card.css");
const routineCardCssPath = resolve(webSrcRoot, "ui/routine-card/routine-card.css");

const NOW = "2026-06-17T09:00:00.000Z";
const PROJECT_ID = "p1";

// ============================================================
// CSS ルール本文の抽出ヘルパ (completion-counter-emphasis.test.ts /
// project-card-component.test.tsx と同形)
// ============================================================

/**
 * 指定したセレクタの「ルール本文 (= {} で囲まれた中身)」を抽出する.
 *
 * 単純な /selector\s*\{([^}]*)\}/ では `.project-card` が
 * `.project-card--form` / `.project-card__input` 等の prefix にも一致してしまうため,
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

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: PROJECT_ID,
    name: "仕事",
    version: 1,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

// ============================================================
// 動的 import ヘルパ
// (project-card-component.test.tsx と同形. 実装の存在は前提だが,
//  test 自体が implementation との結合を弱めるために動的 import を採用.)
// ============================================================

type ProjectCardModule = { ProjectCard: ComponentType<Record<string, unknown>> };
type ProjectFormCardModule = { ProjectFormCard: ComponentType<Record<string, unknown>> };

async function importProjectCard(): Promise<ProjectCardModule> {
  const path = "../src/ui/project-card/project-card.js";
  return (await import(/* @vite-ignore */ path)) as ProjectCardModule;
}

async function importProjectFormCard(): Promise<ProjectFormCardModule> {
  const path = "../src/ui/project-card/project-form-card.js";
  return (await import(/* @vite-ignore */ path)) as ProjectFormCardModule;
}

afterEach(() => {
  cleanup();
});

// ============================================================
// CSS 文面検証 (REQ-1 / REQ-3 / D-001)
// ============================================================

describe("BL-110 / project-name-font-emphasis: project-card.css の CSS 文面検証", () => {
  // ----------------------------------------------------------
  // 前提: project-card.css が存在する
  // ----------------------------------------------------------
  it("web/src/ui/project-card/project-card.css が存在する", () => {
    expect(existsSync(projectCardCssPath)).toBe(true);
  });

  // ----------------------------------------------------------
  // AC-CSS-font-size: .project-card__input ルール本文に
  //   font-size: var(--font-size-h2) を含む (REQ-1)
  //
  // spec.md §「受け入れ基準」スタイル:
  //   Given web/src/ui/project-card/project-card.css を開いた
  //   When  .project-card__input セレクタのルール本文を観察する
  //   Then  ルール本文に font-size: var(--font-size-h2) を含む
  //
  // 実装前は red になる想定 (現行ルールは `flex: 1;` の 1 宣言しか持たない).
  // ----------------------------------------------------------
  describe("AC-CSS-font-size: .project-card__input ルール本文に font-size: var(--font-size-h2) を含む (REQ-1)", () => {
    it(".project-card__input ルールが project-card.css に存在する", () => {
      const css = readFileSync(projectCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".project-card__input");
      expect(body, ".project-card__input ルールが見つからない").not.toBeNull();
    });

    it(".project-card__input ルール本文に font-size: var(--font-size-h2) を含む", () => {
      const css = readFileSync(projectCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".project-card__input");
      expect(body, ".project-card__input ルールが見つからない").not.toBeNull();
      expect(body ?? "").toMatch(/font-size\s*:\s*var\(--font-size-h2\)/);
    });
  });

  // ----------------------------------------------------------
  // AC-CSS-flex 保存: .project-card__input ルール本文に既存の
  //   flex: 1 (または flex-grow: 1) が引き続き含まれる (REQ-3 保護).
  //
  // spec.md §「受け入れ基準」スタイル:
  //   Given web/src/ui/project-card/project-card.css を開いた
  //   When  .project-card__input セレクタのルール本文を観察する
  //   Then  ルール本文に flex: 1 (または flex-grow: 1) を含む
  //
  // 実装前は green (= 回帰ガード. implementer が誤って flex 宣言を消さないことを担保).
  // ----------------------------------------------------------
  describe("AC-CSS-flex 保存: .project-card__input ルール本文に flex: 1 (または flex-grow: 1) を含む (REQ-3)", () => {
    it(".project-card__input ルール本文に flex: 1 (または flex-grow: 1) を含む", () => {
      const css = readFileSync(projectCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".project-card__input");
      expect(body, ".project-card__input ルールが見つからない").not.toBeNull();
      const bodyText = body ?? "";
      const hasShorthand = /(?:^|;|\n)\s*flex\s*:\s*1(?:\s|;|$)/.test(bodyText);
      const hasFlexGrow = /flex-grow\s*:\s*1/.test(bodyText);
      expect(
        hasShorthand || hasFlexGrow,
        ".project-card__input に flex: 1 (または flex-grow: 1) が無い",
      ).toBe(true);
    });
  });

  // ----------------------------------------------------------
  // AC-CSS-placeholder 保存: .project-card__input::placeholder ルール本文に
  //   color: var(--color-fg-subtle) が引き続き含まれる (REQ-3 保護).
  //
  // spec.md §「受け入れ基準」スタイル:
  //   Given web/src/ui/project-card/project-card.css を開いた
  //   When  .project-card__input::placeholder セレクタのルール本文を観察する
  //   Then  ルール本文に color: var(--color-fg-subtle) を含む
  //
  // 実装前は green (= 回帰ガード).
  // ----------------------------------------------------------
  describe("AC-CSS-placeholder 保存: .project-card__input::placeholder ルール本文に color: var(--color-fg-subtle) を含む (REQ-3)", () => {
    it(".project-card__input::placeholder ルールが project-card.css に存在する", () => {
      const css = readFileSync(projectCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".project-card__input::placeholder");
      expect(body, ".project-card__input::placeholder ルールが見つからない").not.toBeNull();
    });

    it(".project-card__input::placeholder ルール本文に color: var(--color-fg-subtle) を含む", () => {
      const css = readFileSync(projectCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".project-card__input::placeholder");
      expect(body, ".project-card__input::placeholder ルールが見つからない").not.toBeNull();
      expect(body ?? "").toMatch(/color\s*:\s*var\(--color-fg-subtle\)/);
    });
  });

  // ----------------------------------------------------------
  // AC-CSS-no-font-on-parent: .project-card 親ルール本文に font-size を含まない (D-001).
  //
  // plan.md §「重要な決定」D-001:
  //   親 .project-card に font-size を置くと「削除」 button や .visually-hidden label にも
  //   font-size が継承されて副作用範囲が広がる. 本 BL は input 自身に font-size を当てる
  //   1 段方式を採るため, 親ルール本文には font-size が無いことをガードする.
  //
  // 実装前は green (= 回帰ガード. implementer が誤って親に置かないことを担保).
  // ----------------------------------------------------------
  describe("AC-CSS-no-font-on-parent: .project-card 親ルール本文に font-size を含まない (D-001)", () => {
    it(".project-card 親ルールが project-card.css に存在する", () => {
      const css = readFileSync(projectCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".project-card");
      expect(body, ".project-card ルールが見つからない").not.toBeNull();
    });

    it(".project-card 親ルール本文に font-size 宣言を含まない (= 親には置かず input 側に直接当てる)", () => {
      const css = readFileSync(projectCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".project-card");
      expect(body, ".project-card ルールが見つからない").not.toBeNull();
      // 親に font-size が混入すると「削除」 button / visually-hidden label にも継承される.
      expect(body ?? "").not.toMatch(/(?:^|;|\n)\s*font-size\s*:/);
    });
  });
});

// ============================================================
// 系統独立: task-card.css / routine-card.css は無改修
// (NFR-NO-ROUTINE-OR-TASK-CASCADE / 系統独立 (= ペア専用 CSS) の回帰ガード)
//
// spec.md §「受け入れ基準」系統独立:
//   Then web/src/ui/task-card/task-card.css / web/src/ui/routine-card/routine-card.css
//        は無改修である
//
// 「無改修」を完全に検証するのは難しいので, 本 BL の影響対象である
// `.project-card__input` 系セレクタが他系統 CSS に混入していないことで担保する.
// ============================================================

describe("BL-110 / project-name-font-emphasis: 他系統 CSS への非波及", () => {
  it("web/src/ui/task-card/task-card.css が存在する", () => {
    expect(existsSync(taskCardCssPath)).toBe(true);
  });

  it("web/src/ui/routine-card/routine-card.css が存在する", () => {
    expect(existsSync(routineCardCssPath)).toBe(true);
  });

  it("task-card.css に .project-card__input 系セレクタが存在しない (NFR-NO-ROUTINE-OR-TASK-CASCADE)", () => {
    const css = readFileSync(taskCardCssPath, "utf-8");
    expect(
      css,
      "task-card.css に .project-card__input 系セレクタが混入している (系統独立違反)",
    ).not.toMatch(/\.project-card__input/);
  });

  it("routine-card.css に .project-card__input 系セレクタが存在しない (NFR-NO-ROUTINE-OR-TASK-CASCADE)", () => {
    const css = readFileSync(routineCardCssPath, "utf-8");
    expect(
      css,
      "routine-card.css に .project-card__input 系セレクタが混入している (系統独立違反)",
    ).not.toMatch(/\.project-card__input/);
  });

  it("task-card.css に .project-card 系セレクタが存在しない (系統独立)", () => {
    const css = readFileSync(taskCardCssPath, "utf-8");
    expect(css, "task-card.css に .project-card 系セレクタが混入している").not.toMatch(
      /\.project-card(?![\w-])/,
    );
  });

  it("routine-card.css に .project-card 系セレクタが存在しない (系統独立)", () => {
    const css = readFileSync(routineCardCssPath, "utf-8");
    expect(css, "routine-card.css に .project-card 系セレクタが混入している").not.toMatch(
      /\.project-card(?![\w-])/,
    );
  });
});

// ============================================================
// DOM 不変 (REQ-4 / マークアップ不変の回帰ガード)
//
// spec.md §「受け入れ基準」マークアップ不変:
//   <ProjectCard project={{ id: "p1", name: "仕事" }} onNameBlur={...} onDelete={...} />
//   <input id="project-name-p1" className="project-card__input" value="仕事"> が存在し
//   <label htmlFor="project-name-p1" className="visually-hidden">プロジェクト名</label>
//   と for ↔ id で関連付けされている.
//
//   <ProjectFormCard name="" onNameChange={...} onSubmit={...} />
//   <input id="project-name" className="project-card__input" placeholder="プロジェクト名">
//   <label htmlFor="project-name" className="visually-hidden">プロジェクト名</label>
//
// 実装前は green (= 既存 <ProjectCard> / <ProjectFormCard> 実装が既に満たしている / 回帰ガード).
// ============================================================

describe("BL-110 / project-name-font-emphasis: <ProjectCard> DOM 不変 (REQ-4)", () => {
  it("<ProjectCard> の input が id='project-name-p1' / className='project-card__input' を持つ", async () => {
    const { ProjectCard } = await importProjectCard();
    const project = makeProject({ id: PROJECT_ID, name: "仕事" });
    const { container } = render(
      React.createElement(ProjectCard, {
        project,
        onNameBlur: () => {},
        onDelete: () => {},
      }),
    );

    const input = container.querySelector("input.project-card__input") as HTMLInputElement | null;
    expect(
      input,
      "<ProjectCard> 内に <input class='project-card__input'> が見つからない",
    ).not.toBeNull();
    expect(input?.id).toBe(`project-name-${PROJECT_ID}`);
    expect(input?.getAttribute("type")).toBe("text");
    expect(input?.value).toBe("仕事");
  });

  it("<ProjectCard> の label が htmlFor='project-name-p1' / className='visually-hidden' で input と関連付けされる", async () => {
    const { ProjectCard } = await importProjectCard();
    const project = makeProject({ id: PROJECT_ID, name: "仕事" });
    const { container } = render(
      React.createElement(ProjectCard, {
        project,
        onNameBlur: () => {},
        onDelete: () => {},
      }),
    );

    const label = container.querySelector("label.visually-hidden") as HTMLLabelElement | null;
    expect(
      label,
      "<ProjectCard> 内に <label class='visually-hidden'> が見つからない",
    ).not.toBeNull();
    expect(label?.getAttribute("for")).toBe(`project-name-${PROJECT_ID}`);
    expect(label?.textContent).toBe("プロジェクト名");

    const input = container.querySelector("input.project-card__input") as HTMLInputElement | null;
    expect(input).not.toBeNull();
    // label の for と input の id が一致する.
    expect(label?.getAttribute("for")).toBe(input?.id);
  });
});

describe("BL-110 / project-name-font-emphasis: <ProjectFormCard> DOM 不変 (REQ-4)", () => {
  it("<ProjectFormCard> の input が id='project-name' / className='project-card__input' / placeholder='プロジェクト名' を持つ", async () => {
    const { ProjectFormCard } = await importProjectFormCard();
    const { container } = render(
      React.createElement(ProjectFormCard, {
        name: "",
        onNameChange: () => {},
        onSubmit: (e: React.FormEvent) => {
          e.preventDefault();
        },
      }),
    );

    const input = container.querySelector("input.project-card__input") as HTMLInputElement | null;
    expect(
      input,
      "<ProjectFormCard> 内に <input class='project-card__input'> が見つからない",
    ).not.toBeNull();
    expect(input?.id).toBe("project-name");
    expect(input?.getAttribute("type")).toBe("text");
    expect(input?.getAttribute("placeholder")).toBe("プロジェクト名");
  });

  it("<ProjectFormCard> の label が htmlFor='project-name' / className='visually-hidden' で input と関連付けされる", async () => {
    const { ProjectFormCard } = await importProjectFormCard();
    const { container } = render(
      React.createElement(ProjectFormCard, {
        name: "",
        onNameChange: () => {},
        onSubmit: (e: React.FormEvent) => {
          e.preventDefault();
        },
      }),
    );

    const label = container.querySelector("label.visually-hidden") as HTMLLabelElement | null;
    expect(
      label,
      "<ProjectFormCard> 内に <label class='visually-hidden'> が見つからない",
    ).not.toBeNull();
    expect(label?.getAttribute("for")).toBe("project-name");
    expect(label?.textContent).toBe("プロジェクト名");

    const input = container.querySelector("input.project-card__input") as HTMLInputElement | null;
    expect(input).not.toBeNull();
    expect(label?.getAttribute("for")).toBe(input?.id);
  });
});
