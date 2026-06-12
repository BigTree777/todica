// @vitest-environment jsdom

/**
 * ProjectCard / ProjectFormCard コンポーネント新設 + projects-view 適用
 * (BL-060 / project-card-component) 受け入れ基準テスト.
 *
 * 仕様参照:
 *   docs/developer/features/project-card-component/spec.md
 *   docs/developer/features/project-card-component/plan.md
 *   docs/developer/features/project-card-component/tasks.md
 *
 * 本ファイルが検証する受け入れ基準:
 *   AC-1 : .project-card 基底クラスが visual 4 宣言 + 1 段 flex 横並び layout を持つ (CSS 直読み).
 *   AC-2 : .project-card__name が flex: 1 で残り幅を占有する (CSS 直読み).
 *   AC-3 : .project-card__actions がボタン横並びを持つ (CSS 直読み).
 *   AC-4 : .project-card__input が flex: 1 + placeholder 薄色を持つ (CSS 直読み).
 *   AC-5 : .visually-hidden ユーティリティが project-card.css に定義されている (CSS 直読み).
 *   AC-6 : <ProjectCard isEditing=false> が表示モードの DOM を出す (DOM レンダ).
 *   AC-7 : <ProjectCard isEditing=true> が編集モードの DOM を出す (DOM レンダ).
 *   AC-8 : <ProjectFormCard> が 1 段 flex 横並びの作成フォームを描画する (DOM レンダ).
 *   AC-9 : <ProjectFormCard> の input に placeholder「プロジェクト名」が表示される (DOM レンダ).
 *   AC-10: 「変更」 button が「変更」ラベルで表示され「名称変更」 button が存在しない (DOM レンダ).
 *   AC-11: projects-view.tsx が <ProjectCard> / <ProjectFormCard> を使う (ソース直読み).
 *   AC-12: 旧 .projects-view__form / __item / __actions が projects-view.css から撤去 (CSS 直読み).
 *   AC-13: projects-view.css に維持セレクタ (.projects-view / h1 / __list / __empty) が引き続き存在 (CSS 直読み).
 *   AC-14: tokens.css に本 BL で参照するトークンが引き続き定義されている (CSS 直読み).
 *   AC-15: ProjectRepository / mutation 経路が無改修である (ソース直読み).
 *   AC-16: label/input 関連付け (visually-hidden + htmlFor + id) が保持されている (DOM レンダ).
 *   AC-17: 作成 form / 編集 form の aria-label が保持されている (DOM レンダ).
 *   AC-18: .project-card 系セレクタに box-shadow / transition / animation / :hover が無い (CSS 直読み).
 *   AC-19 / AC-20 / AC-21: 単体テスト全件 / E2E / a11y は本ファイルでは個別 assert せず,
 *          ルート npm test / npx playwright test の継続実行で担保する.
 *
 * 本ファイルは TDD の "red" を作るためのテスト.
 *   - 実装前 (= web/src/ui/project-card/project-card.tsx / project-form-card.tsx /
 *     project-card.css が存在せず, projects-view.tsx も旧クラスのまま) では,
 *     CSS 直読み系 (AC-1〜AC-5 / AC-12 / AC-18), DOM レンダ系 (AC-6〜AC-10 / AC-16 / AC-17),
 *     view 適用系 (AC-11) の大半が red になる想定.
 *   - 既存ファイル不変性系 (AC-13 / AC-14 / AC-15) は green が期待値.
 *   - implementer が REQ-1 〜 REQ-9 を実装することで red 群が green 化する.
 *
 * 検証スタイル:
 *   - CSS 直読み: BL-052 / BL-054 / BL-057 / BL-058 / BL-059 と同じ
 *     readFileSync + extractRuleBody (P-005). ヘルパは本ファイル内に再定義する.
 *   - DOM レンダ: BL-059 と同形の動的 import + render パターン.
 *
 * vitest-environment:
 *   DOM レンダ AC は jsdom 必須のため 1 ファイル全体を jsdom で動かす
 *   (= jsdom でも readFileSync は問題なく動く).
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { render, screen, within } from "@testing-library/react";
import type { ComponentType } from "react";
import { describe, expect, it, vi } from "vitest";

import type { Project } from "../src/repositories/project-repository.js";

// ============================================================
// 共通定数 / パス解決
// ============================================================

const repoRoot = resolve(__dirname, "../..");
const webSrcRoot = resolve(repoRoot, "web/src");

// 新規 (本 BL で新設) ファイル群.
const projectCardCssPath = resolve(webSrcRoot, "ui/project-card/project-card.css");
const projectCardTsxPath = resolve(webSrcRoot, "ui/project-card/project-card.tsx");
const projectFormCardTsxPath = resolve(webSrcRoot, "ui/project-card/project-form-card.tsx");

// 既存ファイル群 (撤去 / 維持 / 無改修 の対象).
const projectsViewCssPath = resolve(webSrcRoot, "ui/projects-view/projects-view.css");
const projectsViewTsxPath = resolve(webSrcRoot, "ui/projects-view/projects-view.tsx");
const tokensCssPath = resolve(webSrcRoot, "styles/tokens.css");
const projectRepositoryTsPath = resolve(webSrcRoot, "repositories/project-repository.ts");

const NOW = "2026-06-11T09:00:00.000Z";
const PROJECT_ID_1 = "p1p1p1p1-p1p1-4p1p-8p1p-p1p1p1p1p1p1";

// ============================================================
// CSS ルール本文の抽出ヘルパ (P-005 / BL-059 等から再実装)
// ============================================================

/**
 * 指定したセレクタの「ルール本文 (= {} で囲まれた中身)」を抽出する.
 *
 * 単純な /selector\s*\{([^}]*)\}/ では `.project-card` が `.project-card--form` /
 * `.project-card__name` 等の prefix にも一致してしまうため,
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
    id: PROJECT_ID_1,
    name: "仕事",
    version: 1,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

// ============================================================
// 動的 import ヘルパ (実装前は project-card.tsx が存在しないため async import)
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

// ============================================================
// describe ブロック
// ============================================================

describe("ProjectCard / ProjectFormCard コンポーネント新設 (BL-060 / project-card-component)", () => {
  // ============================================================
  // CSS 直読み系 (AC-1 〜 AC-5 / AC-18)
  // ============================================================

  // ----------------------------------------------------------
  // AC-1: .project-card 基底クラスが visual 4 宣言 + 1 段 flex 横並び layout を持つ
  // ----------------------------------------------------------
  /**
   * シナリオ AC-1:
   *   Given web/src/ui/project-card/project-card.css を開いた
   *   When  .project-card セレクタのルール本文を観察する
   *   Then  background: var(--color-bg) を含む
   *    かつ border: 1px solid var(--color-border) (または等価分解) を含む
   *    かつ border-radius: var(--radius-lg) を含む
   *    かつ padding: var(--space-md) を含む
   *    かつ display: flex を含む
   *    かつ flex-direction: row を含む (または flex-direction を持たず既定の row)
   *    かつ align-items: center を含む
   *    かつ gap: var(--space-sm) を含む
   */
  describe("AC-1: .project-card 基底クラスが visual 4 宣言 + 1 段 flex 横並び layout を持つ", () => {
    it("project-card.css が存在する", () => {
      expect(existsSync(projectCardCssPath)).toBe(true);
    });

    it(".project-card ルール本文に background: var(--color-bg) を含む", () => {
      const css = readFileSync(projectCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".project-card");
      expect(body, ".project-card ルールが見つからない").not.toBeNull();
      expect(body ?? "").toMatch(/background(?:-color)?\s*:\s*var\(--color-bg\)/);
    });

    it(".project-card ルール本文に border: 1px solid var(--color-border) (または等価分解) を含む", () => {
      const css = readFileSync(projectCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".project-card");
      expect(body, ".project-card ルールが見つからない").not.toBeNull();
      const bodyText = body ?? "";
      const hasShorthand = /border\s*:\s*1px\s+solid\s+var\(--color-border\)/.test(bodyText);
      const hasDecomposed =
        /border-width\s*:\s*1px/.test(bodyText) &&
        /border-style\s*:\s*solid/.test(bodyText) &&
        /border-color\s*:\s*var\(--color-border\)/.test(bodyText);
      expect(
        hasShorthand || hasDecomposed,
        ".project-card に border: 1px solid var(--color-border) 等価宣言が無い",
      ).toBe(true);
    });

    it(".project-card ルール本文に border-radius: var(--radius-lg) を含む", () => {
      const css = readFileSync(projectCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".project-card");
      expect(body, ".project-card ルールが見つからない").not.toBeNull();
      expect(body ?? "").toMatch(/border-radius\s*:\s*var\(--radius-lg\)/);
    });

    it(".project-card ルール本文に padding: var(--space-md) を含む", () => {
      const css = readFileSync(projectCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".project-card");
      expect(body, ".project-card ルールが見つからない").not.toBeNull();
      // gap: var(--space-sm) と padding: var(--space-md) は別宣言.
      expect(body ?? "").toMatch(/(?:^|;|\n)\s*padding\s*:\s*var\(--space-md\)/);
    });

    it(".project-card ルール本文に display: flex を含む", () => {
      const css = readFileSync(projectCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".project-card");
      expect(body, ".project-card ルールが見つからない").not.toBeNull();
      expect(body ?? "").toMatch(/display\s*:\s*flex/);
    });

    it(".project-card ルール本文に flex-direction: row を含む (または flex-direction を持たない既定値)", () => {
      const css = readFileSync(projectCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".project-card");
      expect(body, ".project-card ルールが見つからない").not.toBeNull();
      const bodyText = body ?? "";
      // 明示的に column が指定されていないこと.
      expect(
        bodyText,
        ".project-card は 1 段横並びのため flex-direction: column であってはならない",
      ).not.toMatch(/flex-direction\s*:\s*column/);
      // flex-direction: row が書かれているか, または書かれていない (既定値 row).
      const hasExplicitRow = /flex-direction\s*:\s*row/.test(bodyText);
      const hasNoFlexDirection = !/flex-direction\s*:/.test(bodyText);
      expect(
        hasExplicitRow || hasNoFlexDirection,
        ".project-card に flex-direction: row が明示されているか, 宣言なし (既定値 row) であること",
      ).toBe(true);
    });

    it(".project-card ルール本文に align-items: center を含む", () => {
      const css = readFileSync(projectCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".project-card");
      expect(body, ".project-card ルールが見つからない").not.toBeNull();
      expect(body ?? "").toMatch(/align-items\s*:\s*center/);
    });

    it(".project-card ルール本文に gap: var(--space-sm) を含む", () => {
      const css = readFileSync(projectCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".project-card");
      expect(body, ".project-card ルールが見つからない").not.toBeNull();
      expect(body ?? "").toMatch(/gap\s*:\s*var\(--space-sm\)/);
    });
  });

  // ----------------------------------------------------------
  // AC-2: .project-card__name が flex: 1 で残り幅を占有する (V-4)
  // ----------------------------------------------------------
  /**
   * シナリオ AC-2:
   *   Given project-card.css を開いた
   *   When  .project-card__name セレクタのルール本文を観察する
   *   Then  flex: 1 (または flex-grow: 1) の宣言を含む
   */
  describe("AC-2: .project-card__name が flex: 1 で残り幅を占有する (V-4)", () => {
    it(".project-card__name ルール本文に flex: 1 (または flex-grow: 1) を含む", () => {
      const css = readFileSync(projectCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".project-card__name");
      expect(body, ".project-card__name ルールが見つからない").not.toBeNull();
      const bodyText = body ?? "";
      const hasShorthand = /(?:^|;|\n)\s*flex\s*:\s*1(?:\s|;|$)/.test(bodyText);
      const hasFlexGrow = /flex-grow\s*:\s*1/.test(bodyText);
      expect(
        hasShorthand || hasFlexGrow,
        ".project-card__name に flex: 1 (または flex-grow: 1) が無い",
      ).toBe(true);
    });
  });

  // ----------------------------------------------------------
  // AC-3: .project-card__actions がボタン横並びを持つ (V-5)
  // ----------------------------------------------------------
  /**
   * シナリオ AC-3:
   *   Given project-card.css を開いた
   *   When  .project-card__actions セレクタのルール本文を観察する
   *   Then  display: flex / align-items: center / gap: var(--space-sm) を含む
   */
  describe("AC-3: .project-card__actions がボタン横並びを持つ (V-5)", () => {
    it(".project-card__actions ルール本文に display: flex を含む", () => {
      const css = readFileSync(projectCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".project-card__actions");
      expect(body, ".project-card__actions ルールが見つからない").not.toBeNull();
      expect(body ?? "").toMatch(/display\s*:\s*flex/);
    });

    it(".project-card__actions ルール本文に align-items: center を含む", () => {
      const css = readFileSync(projectCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".project-card__actions");
      expect(body, ".project-card__actions ルールが見つからない").not.toBeNull();
      expect(body ?? "").toMatch(/align-items\s*:\s*center/);
    });

    it(".project-card__actions ルール本文に gap: var(--space-sm) を含む", () => {
      const css = readFileSync(projectCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".project-card__actions");
      expect(body, ".project-card__actions ルールが見つからない").not.toBeNull();
      expect(body ?? "").toMatch(/gap\s*:\s*var\(--space-sm\)/);
    });
  });

  // ----------------------------------------------------------
  // AC-4: .project-card__input が flex: 1 + placeholder の薄色を持つ (V-2)
  // ----------------------------------------------------------
  /**
   * シナリオ AC-4:
   *   Given project-card.css を開いた
   *   When  .project-card__input / .project-card__input::placeholder セレクタを観察する
   *   Then  .project-card__input に flex: 1 (または flex-grow: 1) を含む
   *    かつ .project-card__input::placeholder に color: var(--color-fg-subtle) を含む
   */
  describe("AC-4: .project-card__input が flex: 1 + placeholder 薄色を持つ (V-2)", () => {
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

    it(".project-card__input::placeholder ルール本文に color: var(--color-fg-subtle) を含む", () => {
      const css = readFileSync(projectCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".project-card__input::placeholder");
      expect(body, ".project-card__input::placeholder ルールが見つからない").not.toBeNull();
      expect(body ?? "").toMatch(/color\s*:\s*var\(--color-fg-subtle\)/);
    });
  });

  // ----------------------------------------------------------
  // AC-5: .visually-hidden ユーティリティが project-card.css に定義されている (D-008)
  // ----------------------------------------------------------
  /**
   * シナリオ AC-5:
   *   Given project-card.css を開いた
   *   When  .visually-hidden セレクタのルール本文を観察する
   *   Then  position: absolute / width: 1px / height: 1px / overflow: hidden /
   *         clip: rect(0, 0, 0, 0) の宣言を含む
   */
  describe("AC-5: .visually-hidden ユーティリティが project-card.css に定義されている (D-008)", () => {
    it(".visually-hidden ルール本文に position: absolute を含む", () => {
      const css = readFileSync(projectCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".visually-hidden");
      expect(body, ".visually-hidden ルールが見つからない").not.toBeNull();
      expect(body ?? "").toMatch(/position\s*:\s*absolute/);
    });

    it(".visually-hidden ルール本文に width: 1px / height: 1px を含む", () => {
      const css = readFileSync(projectCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".visually-hidden");
      expect(body, ".visually-hidden ルールが見つからない").not.toBeNull();
      const bodyText = body ?? "";
      expect(bodyText).toMatch(/width\s*:\s*1px/);
      expect(bodyText).toMatch(/height\s*:\s*1px/);
    });

    it(".visually-hidden ルール本文に overflow: hidden を含む", () => {
      const css = readFileSync(projectCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".visually-hidden");
      expect(body, ".visually-hidden ルールが見つからない").not.toBeNull();
      expect(body ?? "").toMatch(/overflow\s*:\s*hidden/);
    });

    it(".visually-hidden ルール本文に clip: rect(0, 0, 0, 0) を含む", () => {
      const css = readFileSync(projectCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".visually-hidden");
      expect(body, ".visually-hidden ルールが見つからない").not.toBeNull();
      // clip: rect(0, 0, 0, 0) は空白 / カンマの有無で若干変動するためゆるい正規表現で.
      expect(body ?? "").toMatch(/clip\s*:\s*rect\(\s*0[\s,]+0[\s,]+0[\s,]+0\s*\)/);
    });
  });

  // ============================================================
  // jsdom DOM レンダ系 (AC-6 〜 AC-10 / AC-16 / AC-17)
  // ============================================================

  // ----------------------------------------------------------
  // AC-6: <ProjectCard isEditing=false> が表示モードの DOM を出す
  // ----------------------------------------------------------
  /**
   * シナリオ AC-6:
   *   Given <ProjectCard project={...} isEditing={false} ... /> を render する
   *   When  出力 DOM を観察する
   *   Then  ルート要素は <li class="project-card"> である
   *    かつ .project-card 内に <span class="project-card__name">{project.name}</span> が存在する
   *    かつ .project-card 内に <div class="project-card__actions"> が存在する
   *    かつ .project-card__actions 内に「変更」「削除」 button が存在する
   *    かつ DOM 順は「変更」が「削除」より先
   */
  describe("AC-6: <ProjectCard isEditing=false> が表示モードの DOM を出す", () => {
    it("ルート要素は <li class='project-card'> である", async () => {
      const { ProjectCard } = await importProjectCard();
      const project = makeProject({ name: "仕事" });
      const { container } = render(
        <ProjectCard
          project={project}
          isEditing={false}
          editingName=""
          onEditingNameChange={() => {}}
          onStartEdit={() => {}}
          onCancelEdit={() => {}}
          onSaveEdit={(e: React.FormEvent) => {
            e.preventDefault();
          }}
          onDelete={() => {}}
        />,
      );
      const root = container.firstElementChild as HTMLElement | null;
      expect(root, "ProjectCard の root 要素が見つからない").not.toBeNull();
      expect(root?.tagName.toLowerCase()).toBe("li");
      expect(root?.classList.contains("project-card")).toBe(true);
      // 表示モードでは編集中 modifier は付かない.
      expect(root?.classList.contains("project-card--editing")).toBe(false);
    });

    it(".project-card__name span にプロジェクト名が描画される", async () => {
      const { ProjectCard } = await importProjectCard();
      const project = makeProject({ name: "仕事" });
      const { container } = render(
        <ProjectCard
          project={project}
          isEditing={false}
          editingName=""
          onEditingNameChange={() => {}}
          onStartEdit={() => {}}
          onCancelEdit={() => {}}
          onSaveEdit={(e: React.FormEvent) => {
            e.preventDefault();
          }}
          onDelete={() => {}}
        />,
      );
      const name = container.querySelector(".project-card__name");
      expect(name, ".project-card__name が見つからない").not.toBeNull();
      expect(name?.tagName.toLowerCase()).toBe("span");
      expect(name?.textContent ?? "").toContain("仕事");
    });

    it(".project-card__actions div 内に「変更」「削除」 button が DOM 順「変更 → 削除」で存在する", async () => {
      const { ProjectCard } = await importProjectCard();
      const project = makeProject();
      const { container } = render(
        <ProjectCard
          project={project}
          isEditing={false}
          editingName=""
          onEditingNameChange={() => {}}
          onStartEdit={() => {}}
          onCancelEdit={() => {}}
          onSaveEdit={(e: React.FormEvent) => {
            e.preventDefault();
          }}
          onDelete={() => {}}
        />,
      );
      const actions = container.querySelector(".project-card__actions");
      expect(actions, ".project-card__actions が見つからない").not.toBeNull();
      expect(actions?.tagName.toLowerCase()).toBe("div");
      const buttons = Array.from(actions?.querySelectorAll("button") ?? []);
      const labels = buttons.map((b) => b.textContent?.trim() ?? "");
      expect(labels).toContain("変更");
      expect(labels).toContain("削除");
      // DOM 順「変更 → 削除」.
      const editIdx = labels.findIndex((t) => t === "変更");
      const deleteIdx = labels.findIndex((t) => t === "削除");
      expect(editIdx, "「変更」が actions 内に無い").toBeGreaterThanOrEqual(0);
      expect(deleteIdx, "「削除」が actions 内に無い").toBeGreaterThanOrEqual(0);
      expect(editIdx, "「変更」が「削除」より先に並ぶ").toBeLessThan(deleteIdx);
    });

    it('as="div" を渡すとルートが <div> になる (D-002)', async () => {
      const { ProjectCard } = await importProjectCard();
      const project = makeProject();
      const { container } = render(
        <ProjectCard
          as="div"
          project={project}
          isEditing={false}
          editingName=""
          onEditingNameChange={() => {}}
          onStartEdit={() => {}}
          onCancelEdit={() => {}}
          onSaveEdit={(e: React.FormEvent) => {
            e.preventDefault();
          }}
          onDelete={() => {}}
        />,
      );
      const root = container.firstElementChild as HTMLElement | null;
      expect(root?.tagName.toLowerCase()).toBe("div");
      expect(root?.classList.contains("project-card")).toBe(true);
    });
  });

  // ----------------------------------------------------------
  // AC-7: <ProjectCard isEditing=true> が編集モードの DOM を出す
  // ----------------------------------------------------------
  /**
   * シナリオ AC-7:
   *   Given <ProjectCard project={...} isEditing={true} editingName="..." ... /> を render する
   *   When  出力 DOM を観察する
   *   Then  ルート要素は <li class="project-card project-card--editing"> である
   *    かつ ルート内に <form aria-label="プロジェクト名称変更フォーム"> が存在する
   *    かつ form 内に visually-hidden な <label class="visually-hidden"> + <input> が存在する
   *    かつ input の id と label の htmlFor が一致する
   *    かつ form 内に <button type="submit">保存</button> が存在する
   *    かつ form 内に <button type="button">キャンセル</button> が存在する
   */
  describe("AC-7: <ProjectCard isEditing=true> が編集モードの DOM を出す", () => {
    it("ルート要素は <li class='project-card project-card--editing'> である", async () => {
      const { ProjectCard } = await importProjectCard();
      const project = makeProject();
      const { container } = render(
        <ProjectCard
          project={project}
          isEditing={true}
          editingName="仕事"
          onEditingNameChange={() => {}}
          onStartEdit={() => {}}
          onCancelEdit={() => {}}
          onSaveEdit={(e: React.FormEvent) => {
            e.preventDefault();
          }}
          onDelete={() => {}}
        />,
      );
      const root = container.firstElementChild as HTMLElement | null;
      expect(root, "ProjectCard の root 要素が見つからない").not.toBeNull();
      expect(root?.tagName.toLowerCase()).toBe("li");
      expect(root?.classList.contains("project-card")).toBe(true);
      expect(root?.classList.contains("project-card--editing")).toBe(true);
    });

    it("編集モードでは <form aria-label='プロジェクト名称変更フォーム'> が root 内に存在する", async () => {
      const { ProjectCard } = await importProjectCard();
      const project = makeProject();
      const { container } = render(
        <ProjectCard
          project={project}
          isEditing={true}
          editingName="仕事"
          onEditingNameChange={() => {}}
          onStartEdit={() => {}}
          onCancelEdit={() => {}}
          onSaveEdit={(e: React.FormEvent) => {
            e.preventDefault();
          }}
          onDelete={() => {}}
        />,
      );
      const form = container.querySelector("form");
      expect(form, "編集モードで <form> が見つからない").not.toBeNull();
      expect(form?.getAttribute("aria-label")).toBe("プロジェクト名称変更フォーム");
    });

    it("form 内に visually-hidden な <label> + <input> が存在し htmlFor と id が一致する", async () => {
      const { ProjectCard } = await importProjectCard();
      const project = makeProject();
      const { container } = render(
        <ProjectCard
          project={project}
          isEditing={true}
          editingName="仕事"
          onEditingNameChange={() => {}}
          onStartEdit={() => {}}
          onCancelEdit={() => {}}
          onSaveEdit={(e: React.FormEvent) => {
            e.preventDefault();
          }}
          onDelete={() => {}}
        />,
      );
      const form = container.querySelector("form");
      expect(form, "form が見つからない").not.toBeNull();
      const label = form?.querySelector("label");
      const input = form?.querySelector("input");
      expect(label, "編集モードの form に <label> が無い").not.toBeNull();
      expect(input, "編集モードの form に <input> が無い").not.toBeNull();
      expect(label?.classList.contains("visually-hidden")).toBe(true);
      const labelFor = label?.getAttribute("for");
      const inputId = input?.getAttribute("id");
      expect(labelFor, "label の htmlFor (for) が空").toBeTruthy();
      expect(inputId, "input の id が空").toBeTruthy();
      expect(labelFor).toBe(inputId);
    });

    it("form 内に <button type='submit'>保存</button> と <button type='button'>キャンセル</button> が存在する", async () => {
      const { ProjectCard } = await importProjectCard();
      const project = makeProject();
      const { container } = render(
        <ProjectCard
          project={project}
          isEditing={true}
          editingName="仕事"
          onEditingNameChange={() => {}}
          onStartEdit={() => {}}
          onCancelEdit={() => {}}
          onSaveEdit={(e: React.FormEvent) => {
            e.preventDefault();
          }}
          onDelete={() => {}}
        />,
      );
      const form = container.querySelector("form");
      expect(form, "form が見つからない").not.toBeNull();
      const buttons = Array.from(form?.querySelectorAll("button") ?? []);
      const submit = buttons.find((b) => (b.textContent ?? "").trim() === "保存");
      const cancel = buttons.find((b) => (b.textContent ?? "").trim() === "キャンセル");
      expect(submit, "「保存」 button が編集 form に無い").toBeDefined();
      expect(cancel, "「キャンセル」 button が編集 form に無い").toBeDefined();
      expect(submit?.getAttribute("type")).toBe("submit");
      expect(cancel?.getAttribute("type")).toBe("button");
    });

    it("編集モードでは「変更」「削除」 button が出ない (表示モードと排他)", async () => {
      const { ProjectCard } = await importProjectCard();
      const project = makeProject();
      const { container } = render(
        <ProjectCard
          project={project}
          isEditing={true}
          editingName="仕事"
          onEditingNameChange={() => {}}
          onStartEdit={() => {}}
          onCancelEdit={() => {}}
          onSaveEdit={(e: React.FormEvent) => {
            e.preventDefault();
          }}
          onDelete={() => {}}
        />,
      );
      const labels = Array.from(container.querySelectorAll("button")).map(
        (b) => b.textContent?.trim() ?? "",
      );
      expect(labels).not.toContain("変更");
      expect(labels).not.toContain("削除");
    });

    it("onSaveEdit prop が <form onSubmit> として渡される", async () => {
      const { ProjectCard } = await importProjectCard();
      const project = makeProject();
      const onSaveEdit = vi.fn((e: { preventDefault: () => void }) => {
        e.preventDefault();
      });
      const { container } = render(
        <ProjectCard
          project={project}
          isEditing={true}
          editingName="仕事"
          onEditingNameChange={() => {}}
          onStartEdit={() => {}}
          onCancelEdit={() => {}}
          onSaveEdit={onSaveEdit}
          onDelete={() => {}}
        />,
      );
      const form = container.querySelector("form") as HTMLFormElement | null;
      expect(form).not.toBeNull();
      form?.requestSubmit();
      expect(onSaveEdit).toHaveBeenCalledTimes(1);
    });
  });

  // ----------------------------------------------------------
  // AC-8: <ProjectFormCard> が 1 段 flex 横並びの作成フォームを描画する
  // ----------------------------------------------------------
  /**
   * シナリオ AC-8:
   *   Given <ProjectFormCard name="" onNameChange={...} onSubmit={...} /> を render する
   *   When  出力 DOM を観察する
   *   Then  ルートは <form aria-label="プロジェクト作成フォーム" class="project-card project-card--form">
   *    かつ form 直下に <label class="visually-hidden" htmlFor="project-name">プロジェクト名</label>
   *    かつ form 直下に <input id="project-name" type="text" placeholder="プロジェクト名">
   *    かつ form 直下に <button type="submit">追加</button>
   *    かつ getByLabelText("プロジェクト名") で input が取得可能
   */
  describe("AC-8: <ProjectFormCard> が 1 段 flex 横並びの作成フォームを描画する", () => {
    it("ルートは <form class='project-card project-card--form' aria-label='プロジェクト作成フォーム'>", async () => {
      const { ProjectFormCard } = await importProjectFormCard();
      const { container } = render(
        <ProjectFormCard
          name=""
          onNameChange={() => {}}
          onSubmit={(e: React.FormEvent) => {
            e.preventDefault();
          }}
        />,
      );
      const root = container.firstElementChild as HTMLElement | null;
      expect(root, "ProjectFormCard の root 要素が見つからない").not.toBeNull();
      expect(root?.tagName.toLowerCase()).toBe("form");
      expect(root?.classList.contains("project-card")).toBe(true);
      expect(root?.classList.contains("project-card--form")).toBe(true);
      expect(root?.getAttribute("aria-label")).toBe("プロジェクト作成フォーム");
    });

    it("form 直下に visually-hidden な <label htmlFor='project-name'>プロジェクト名</label>", async () => {
      const { ProjectFormCard } = await importProjectFormCard();
      const { container } = render(
        <ProjectFormCard
          name=""
          onNameChange={() => {}}
          onSubmit={(e: React.FormEvent) => {
            e.preventDefault();
          }}
        />,
      );
      const label = container.querySelector("label");
      expect(label, "label が見つからない").not.toBeNull();
      expect(label?.getAttribute("for")).toBe("project-name");
      expect(label?.classList.contains("visually-hidden")).toBe(true);
      expect(label?.textContent ?? "").toContain("プロジェクト名");
    });

    it("form 直下に <input id='project-name' type='text'> が存在する", async () => {
      const { ProjectFormCard } = await importProjectFormCard();
      const { container } = render(
        <ProjectFormCard
          name=""
          onNameChange={() => {}}
          onSubmit={(e: React.FormEvent) => {
            e.preventDefault();
          }}
        />,
      );
      const input = container.querySelector("input");
      expect(input, "input が見つからない").not.toBeNull();
      expect(input?.getAttribute("id")).toBe("project-name");
      expect(input?.getAttribute("type")).toBe("text");
    });

    it("form 直下に <button type='submit'>追加</button> が存在する", async () => {
      const { ProjectFormCard } = await importProjectFormCard();
      const { container } = render(
        <ProjectFormCard
          name=""
          onNameChange={() => {}}
          onSubmit={(e: React.FormEvent) => {
            e.preventDefault();
          }}
        />,
      );
      const buttons = Array.from(container.querySelectorAll("button"));
      const submit = buttons.find((b) => (b.textContent ?? "").trim() === "追加");
      expect(submit, "「追加」 submit button が見つからない").toBeDefined();
      expect(submit?.getAttribute("type")).toBe("submit");
    });

    it('getByLabelText("プロジェクト名") で input が取得可能 (NFR-LABEL-PRESERVE)', async () => {
      const { ProjectFormCard } = await importProjectFormCard();
      render(
        <ProjectFormCard
          name=""
          onNameChange={() => {}}
          onSubmit={(e: React.FormEvent) => {
            e.preventDefault();
          }}
        />,
      );
      const input = screen.getByLabelText("プロジェクト名");
      expect(input, "getByLabelText('プロジェクト名') で input が取れない").toBeTruthy();
      expect(input.tagName.toLowerCase()).toBe("input");
    });

    it("onSubmit prop が <form onSubmit> として渡される", async () => {
      const { ProjectFormCard } = await importProjectFormCard();
      const onSubmit = vi.fn((e: { preventDefault: () => void }) => {
        e.preventDefault();
      });
      render(<ProjectFormCard name="新規" onNameChange={() => {}} onSubmit={onSubmit} />);
      const form = screen.getByRole("form", { name: "プロジェクト作成フォーム" });
      (form as HTMLFormElement).requestSubmit();
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });
  });

  // ----------------------------------------------------------
  // AC-9: <ProjectFormCard> の input に placeholder「プロジェクト名」が表示される (V-2)
  // ----------------------------------------------------------
  /**
   * シナリオ AC-9:
   *   Given <ProjectFormCard name="" ... /> を render する
   *   When  出力 DOM の <input> を観察する
   *   Then  input の placeholder 属性は「プロジェクト名」である
   */
  describe("AC-9: <ProjectFormCard> の input に placeholder「プロジェクト名」が表示される (V-2)", () => {
    it("input の placeholder 属性は「プロジェクト名」である", async () => {
      const { ProjectFormCard } = await importProjectFormCard();
      const { container } = render(
        <ProjectFormCard
          name=""
          onNameChange={() => {}}
          onSubmit={(e: React.FormEvent) => {
            e.preventDefault();
          }}
        />,
      );
      const input = container.querySelector("input");
      expect(input?.getAttribute("placeholder")).toBe("プロジェクト名");
    });
  });

  // ----------------------------------------------------------
  // AC-10: 「変更」 button が「変更」ラベルで表示される (G-8 / REQ-6)
  // ----------------------------------------------------------
  /**
   * シナリオ AC-10:
   *   Given <ProjectCard project={...} isEditing={false} ... /> を render する
   *   When  ボタンを観察する
   *   Then  「変更」 button が存在する
   *    かつ 「名称変更」 button は存在しない
   */
  describe("AC-10: 「変更」 button が「変更」ラベルで表示される (G-8 / REQ-6)", () => {
    it("「変更」 button が存在し「名称変更」 button が存在しない", async () => {
      const { ProjectCard } = await importProjectCard();
      const project = makeProject();
      const { container } = render(
        <ProjectCard
          project={project}
          isEditing={false}
          editingName=""
          onEditingNameChange={() => {}}
          onStartEdit={() => {}}
          onCancelEdit={() => {}}
          onSaveEdit={(e: React.FormEvent) => {
            e.preventDefault();
          }}
          onDelete={() => {}}
        />,
      );
      const labels = Array.from(container.querySelectorAll("button")).map(
        (b) => b.textContent?.trim() ?? "",
      );
      expect(labels, "「変更」 button が無い").toContain("変更");
      expect(
        labels,
        "「名称変更」 button が残っている (REQ-6 違反 / 「変更」へ短縮されていない)",
      ).not.toContain("名称変更");
    });

    it("「変更」 button をクリックすると onStartEdit が呼ばれる", async () => {
      const { ProjectCard } = await importProjectCard();
      const project = makeProject();
      const onStartEdit = vi.fn();
      const { container } = render(
        <ProjectCard
          project={project}
          isEditing={false}
          editingName=""
          onEditingNameChange={() => {}}
          onStartEdit={onStartEdit}
          onCancelEdit={() => {}}
          onSaveEdit={(e: React.FormEvent) => {
            e.preventDefault();
          }}
          onDelete={() => {}}
        />,
      );
      const editButton = Array.from(container.querySelectorAll("button")).find(
        (b) => (b.textContent ?? "").trim() === "変更",
      );
      expect(editButton, "「変更」 button が無い").toBeDefined();
      editButton?.click();
      expect(onStartEdit).toHaveBeenCalledTimes(1);
    });

    it("「削除」 button をクリックすると onDelete が呼ばれる", async () => {
      const { ProjectCard } = await importProjectCard();
      const project = makeProject();
      const onDelete = vi.fn();
      const { container } = render(
        <ProjectCard
          project={project}
          isEditing={false}
          editingName=""
          onEditingNameChange={() => {}}
          onStartEdit={() => {}}
          onCancelEdit={() => {}}
          onSaveEdit={(e: React.FormEvent) => {
            e.preventDefault();
          }}
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

  // ============================================================
  // view 適用 (readFileSync 系) (AC-11)
  // ============================================================

  // ----------------------------------------------------------
  // AC-11: projects-view.tsx が <ProjectCard> / <ProjectFormCard> を使う (REQ-4)
  // ----------------------------------------------------------
  /**
   * シナリオ AC-11:
   *   Given web/src/ui/projects-view/projects-view.tsx を開いた
   *   When  ファイル本文を観察する
   *   Then  import { ProjectCard } from "../project-card/project-card.js" 文を含む
   *    かつ import { ProjectFormCard } from "../project-card/project-form-card.js" 文を含む
   *    かつ <ProjectCard ... /> の使用が少なくとも 1 か所存在する
   *    かつ <ProjectFormCard ... /> の使用が少なくとも 1 か所存在する
   *    かつ className="projects-view__form" の使用が存在しない
   *    かつ className="projects-view__item" の使用が存在しない
   *    かつ className="projects-view__actions" の使用が存在しない
   */
  describe("AC-11: projects-view.tsx が <ProjectCard> / <ProjectFormCard> を使う (REQ-4)", () => {
    it("projects-view.tsx が ProjectCard を import している", () => {
      const src = readFileSync(projectsViewTsxPath, "utf-8");
      expect(src, "projects-view.tsx に ProjectCard の import が無い").toMatch(
        /import\s*\{\s*ProjectCard\s*\}\s*from\s*["']\.\.\/project-card\/project-card\.js["']/,
      );
    });

    it("projects-view.tsx が ProjectFormCard を import している", () => {
      const src = readFileSync(projectsViewTsxPath, "utf-8");
      expect(src, "projects-view.tsx に ProjectFormCard の import が無い").toMatch(
        /import\s*\{\s*ProjectFormCard\s*\}\s*from\s*["']\.\.\/project-card\/project-form-card\.js["']/,
      );
    });

    it("projects-view.tsx で <ProjectCard ... /> が少なくとも 1 か所使用されている", () => {
      const src = readFileSync(projectsViewTsxPath, "utf-8");
      expect(src, "<ProjectCard が JSX 上に無い").toMatch(/<ProjectCard[\s/>]/);
    });

    it("projects-view.tsx で <ProjectFormCard ... /> が少なくとも 1 か所使用されている", () => {
      const src = readFileSync(projectsViewTsxPath, "utf-8");
      expect(src, "<ProjectFormCard が JSX 上に無い").toMatch(/<ProjectFormCard[\s/>]/);
    });

    it('projects-view.tsx に className="projects-view__form" の使用が残っていない', () => {
      const src = readFileSync(projectsViewTsxPath, "utf-8");
      expect(
        src,
        'projects-view.tsx に className="projects-view__form" が残っている (REQ-4 / AC-11 違反)',
      ).not.toMatch(/className\s*=\s*["'][^"']*projects-view__form[^"']*["']/);
    });

    it('projects-view.tsx に className="projects-view__item" の使用が残っていない', () => {
      const src = readFileSync(projectsViewTsxPath, "utf-8");
      expect(
        src,
        'projects-view.tsx に className="projects-view__item" が残っている (REQ-4 / AC-11 違反)',
      ).not.toMatch(/className\s*=\s*["'][^"']*projects-view__item[^"']*["']/);
    });

    it('projects-view.tsx に className="projects-view__actions" の使用が残っていない', () => {
      const src = readFileSync(projectsViewTsxPath, "utf-8");
      expect(
        src,
        'projects-view.tsx に className="projects-view__actions" が残っている (REQ-4 / AC-11 違反)',
      ).not.toMatch(/className\s*=\s*["'][^"']*projects-view__actions[^"']*["']/);
    });
  });

  // ============================================================
  // 旧セレクタ撤去 / 維持セレクタ系 (AC-12 / AC-13)
  // ============================================================

  // ----------------------------------------------------------
  // AC-12: 旧 .projects-view__form / __item / __actions が projects-view.css から撤去
  // ----------------------------------------------------------
  /**
   * シナリオ AC-12:
   *   Given web/src/ui/projects-view/projects-view.css を開いた
   *   When  ファイル本文を観察する
   *   Then  .projects-view__form セレクタが定義されていない
   *    かつ .projects-view__item セレクタが定義されていない
   *    かつ .projects-view__actions セレクタが定義されていない
   */
  describe("AC-12: 旧 .projects-view__form / __item / __actions が projects-view.css から撤去 (REQ-5)", () => {
    it(".projects-view__form セレクタが projects-view.css に存在しない", () => {
      const css = readFileSync(projectsViewCssPath, "utf-8");
      const body = extractRuleBody(css, ".projects-view__form");
      expect(body, ".projects-view__form ルールが残存 (REQ-5 / D-009 違反)").toBeNull();
    });

    it(".projects-view__item セレクタが projects-view.css に存在しない", () => {
      const css = readFileSync(projectsViewCssPath, "utf-8");
      const body = extractRuleBody(css, ".projects-view__item");
      expect(body, ".projects-view__item ルールが残存 (REQ-5 / D-009 違反)").toBeNull();
    });

    it(".projects-view__actions セレクタが projects-view.css に存在しない", () => {
      const css = readFileSync(projectsViewCssPath, "utf-8");
      const body = extractRuleBody(css, ".projects-view__actions");
      expect(body, ".projects-view__actions ルールが残存 (REQ-5 / D-009 違反)").toBeNull();
    });
  });

  // ----------------------------------------------------------
  // AC-13: projects-view.css の維持セレクタが引き続き存在 (NFR-PRESERVE-SHELL)
  // ----------------------------------------------------------
  /**
   * シナリオ AC-13:
   *   Given projects-view.css を開いた
   *   When  ファイル本文を観察する
   *   Then  .projects-view セレクタが定義されている
   *    かつ .projects-view h1 セレクタが定義されている
   *    かつ .projects-view__list セレクタが定義されている
   *    かつ .projects-view__empty セレクタが定義されている
   */
  describe("AC-13: projects-view.css の維持セレクタが引き続き存在 (NFR-PRESERVE-SHELL)", () => {
    it(".projects-view セレクタが定義されている", () => {
      const css = readFileSync(projectsViewCssPath, "utf-8");
      const body = extractRuleBody(css, ".projects-view");
      expect(body, ".projects-view ルールが見つからない (NFR-PRESERVE-SHELL 違反)").not.toBeNull();
    });

    it(".projects-view h1 セレクタが定義されている", () => {
      const css = readFileSync(projectsViewCssPath, "utf-8");
      const body = extractRuleBody(css, ".projects-view h1");
      expect(
        body,
        ".projects-view h1 ルールが見つからない (NFR-PRESERVE-SHELL 違反)",
      ).not.toBeNull();
    });

    it(".projects-view__list セレクタが定義されている", () => {
      const css = readFileSync(projectsViewCssPath, "utf-8");
      const body = extractRuleBody(css, ".projects-view__list");
      expect(
        body,
        ".projects-view__list ルールが見つからない (NFR-PRESERVE-SHELL 違反)",
      ).not.toBeNull();
    });

    it(".projects-view__empty セレクタが定義されている", () => {
      const css = readFileSync(projectsViewCssPath, "utf-8");
      const body = extractRuleBody(css, ".projects-view__empty");
      expect(
        body,
        ".projects-view__empty ルールが見つからない (NFR-PRESERVE-SHELL 違反)",
      ).not.toBeNull();
    });
  });

  // ============================================================
  // 不変性系 (AC-14 / AC-15)
  // ============================================================

  // ----------------------------------------------------------
  // AC-14: tokens.css に本 BL で参照するトークンが引き続き定義されている (NFR-NO-NEW-TOKENS)
  // ----------------------------------------------------------
  /**
   * シナリオ AC-14:
   *   Given 本 BL の実装がマージされた
   *   When  tokens.css を観察する
   *   Then  本 BL で参照する --color-bg / --color-border / --radius-lg / --space-md /
   *         --space-sm / --color-fg-subtle が引き続き定義されている
   */
  describe("AC-14: tokens.css に本 BL で参照するトークンが引き続き定義されている (NFR-NO-NEW-TOKENS)", () => {
    const requiredTokens = [
      "--color-bg",
      "--color-border",
      "--radius-lg",
      "--space-md",
      "--space-sm",
      "--color-fg-subtle",
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
  // AC-15: ProjectRepository / mutation 経路が無改修である (NFR-COMPAT)
  // ----------------------------------------------------------
  /**
   * シナリオ AC-15:
   *   Given web/src/repositories/project-repository.ts を開いた
   *    かつ projects-view.tsx 内の createMutation / updateMutation / deleteMutation を観察する
   *   When  本 BL の前後で diff を取る
   *   Then  ProjectRepository の API / Mutation 構成に差分が無い
   *    かつ ConflictDialog / useConflictDialog の呼び出しに差分が無い
   */
  describe("AC-15: ProjectRepository / mutation 経路が無改修である (NFR-COMPAT)", () => {
    it("project-repository.ts に主要シンボル (ProjectRepository / Project / ProjectConflictError) が残っている", () => {
      const src = readFileSync(projectRepositoryTsPath, "utf-8");
      expect(src).toMatch(/export\s+interface\s+ProjectRepository/);
      expect(src).toMatch(/export\s+interface\s+Project\b/);
      expect(src).toMatch(/export\s+class\s+ProjectConflictError/);
      expect(src).toMatch(/export\s+interface\s+CreateProjectCommand/);
      expect(src).toMatch(/export\s+interface\s+UpdateProjectCommand/);
      expect(src).toMatch(/export\s+interface\s+DeleteProjectCommand/);
    });

    it("projects-view.tsx に createMutation / updateMutation / deleteMutation が残っている", () => {
      const src = readFileSync(projectsViewTsxPath, "utf-8");
      expect(src, "createMutation が無い").toMatch(/createMutation\s*=/);
      expect(src, "updateMutation が無い").toMatch(/updateMutation\s*=/);
      expect(src, "deleteMutation が無い").toMatch(/deleteMutation\s*=/);
    });

    it("projects-view.tsx に ConflictDialog / useConflictDialog の呼び出しが残っている", () => {
      const src = readFileSync(projectsViewTsxPath, "utf-8");
      expect(src, "useConflictDialog が無い").toMatch(/useConflictDialog/);
      expect(src, "<ConflictDialog が無い").toMatch(/<ConflictDialog\b/);
    });
  });

  // ============================================================
  // ラベル / aria 保持系 (AC-16 / AC-17)
  // ============================================================

  // ----------------------------------------------------------
  // AC-16: label/input 関連付けが保持されている (NFR-LABEL-PRESERVE)
  // ----------------------------------------------------------
  /**
   * シナリオ AC-16:
   *   Given /projects を render する
   *   When  作成フォームの label と input を観察する
   *   Then  <label htmlFor="project-name">プロジェクト名</label> と <input id="project-name"> が共存する
   *    かつ label の class に "visually-hidden" を含む
   *    かつ getByLabelText("プロジェクト名") で input が取得可能
   */
  describe("AC-16: label/input 関連付けが保持されている (NFR-LABEL-PRESERVE)", () => {
    it("<ProjectFormCard> の label class に visually-hidden を含み, htmlFor='project-name' / input id='project-name' で関連付けされている", async () => {
      const { ProjectFormCard } = await importProjectFormCard();
      const { container } = render(
        <ProjectFormCard
          name=""
          onNameChange={() => {}}
          onSubmit={(e: React.FormEvent) => {
            e.preventDefault();
          }}
        />,
      );
      const label = container.querySelector("label");
      const input = container.querySelector("input");
      expect(label, "label が無い").not.toBeNull();
      expect(input, "input が無い").not.toBeNull();
      expect(label?.classList.contains("visually-hidden")).toBe(true);
      expect(label?.getAttribute("for")).toBe("project-name");
      expect(input?.getAttribute("id")).toBe("project-name");
      expect(label?.textContent ?? "").toContain("プロジェクト名");
    });
  });

  // ----------------------------------------------------------
  // AC-17: form の aria-label が保持されている (NFR-FORM-ARIA-LABEL-PRESERVE)
  // ----------------------------------------------------------
  /**
   * シナリオ AC-17:
   *   Given /projects を render する
   *   When  form を観察する
   *   Then  作成 form の aria-label は「プロジェクト作成フォーム」である
   *    かつ 編集モード form の aria-label は「プロジェクト名称変更フォーム」である
   */
  describe("AC-17: form の aria-label が保持されている (NFR-FORM-ARIA-LABEL-PRESERVE)", () => {
    it("<ProjectFormCard> の aria-label は「プロジェクト作成フォーム」である", async () => {
      const { ProjectFormCard } = await importProjectFormCard();
      render(
        <ProjectFormCard
          name=""
          onNameChange={() => {}}
          onSubmit={(e: React.FormEvent) => {
            e.preventDefault();
          }}
        />,
      );
      const form = screen.getByRole("form", { name: "プロジェクト作成フォーム" });
      expect(form).toBeTruthy();
    });

    it("<ProjectCard isEditing={true}> の form aria-label は「プロジェクト名称変更フォーム」である", async () => {
      const { ProjectCard } = await importProjectCard();
      const project = makeProject();
      render(
        <ProjectCard
          project={project}
          isEditing={true}
          editingName="仕事"
          onEditingNameChange={() => {}}
          onStartEdit={() => {}}
          onCancelEdit={() => {}}
          onSaveEdit={(e: React.FormEvent) => {
            e.preventDefault();
          }}
          onDelete={() => {}}
        />,
      );
      const form = screen.getByRole("form", { name: "プロジェクト名称変更フォーム" });
      expect(form).toBeTruthy();
    });
  });

  // ============================================================
  // 機能制約 (AC-18)
  // ============================================================

  // ----------------------------------------------------------
  // AC-18: .project-card 系セレクタに box-shadow / transition / animation / :hover が無い
  // ----------------------------------------------------------
  /**
   * シナリオ AC-18:
   *   Given project-card.css を開いた
   *   When  ファイル全体を観察する
   *   Then  box-shadow キーワードを含む宣言が存在しない
   *    かつ transition 宣言が存在しない
   *    かつ animation 宣言が存在しない
   *    かつ .project-card:hover / .project-card--form:hover 等の :hover セレクタが存在しない
   */
  describe("AC-18: .project-card 系セレクタに box-shadow / transition / animation / :hover が無い (NFR-NO-SHADOW / NFR-NO-HOVER-TRANSITION)", () => {
    it("project-card.css 全体に box-shadow 宣言が存在しない", () => {
      const css = readFileSync(projectCardCssPath, "utf-8");
      expect(css, "project-card.css に box-shadow が含まれている (NFR-NO-SHADOW 違反)").not.toMatch(
        /box-shadow\s*:/,
      );
    });

    it("project-card.css 全体に transition 宣言が存在しない", () => {
      const css = readFileSync(projectCardCssPath, "utf-8");
      expect(
        css,
        "project-card.css に transition が含まれている (NFR-NO-HOVER-TRANSITION 違反)",
      ).not.toMatch(/(?:^|;|\n|\s)transition\s*:/);
    });

    it("project-card.css 全体に animation 宣言が存在しない", () => {
      const css = readFileSync(projectCardCssPath, "utf-8");
      expect(
        css,
        "project-card.css に animation が含まれている (NFR-NO-HOVER-TRANSITION 違反)",
      ).not.toMatch(/(?:^|;|\n|\s)animation\s*:/);
    });

    it("project-card.css 全体に :hover セレクタが存在しない", () => {
      const css = readFileSync(projectCardCssPath, "utf-8");
      expect(
        css,
        "project-card.css に :hover セレクタが含まれている (NFR-NO-HOVER-TRANSITION 違反)",
      ).not.toMatch(/:hover\b/);
    });
  });
});
