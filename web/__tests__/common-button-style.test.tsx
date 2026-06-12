// @vitest-environment jsdom

/**
 * 共通ボタンスタイル (BL-067 / common-button-style) 受け入れ基準テスト.
 *
 * 仕様参照:
 *   docs/developer/features/common-button-style/spec.md
 *   docs/developer/features/common-button-style/plan.md
 *   docs/developer/features/common-button-style/tasks.md
 *
 * 本ファイルが検証する受け入れ基準 (AC との対応):
 *   AC-1 : 基底 .button クラスが新設され, 視覚 / cursor / appearance / box-sizing / font 等の宣言を含む.
 *          shadow / hover background / transition / animation を含まない (NFR-NO-SHADOW / NFR-NO-HOVER-TRANSITION).
 *          → describe "AC-1".
 *   AC-2 : 派生 variant (.button--primary / .button--danger / .button--ghost) が新設され,
 *          それぞれ background / color / border-color のいずれかを意図に沿って上書きする.
 *          plan D-008 / D-003 確定値: --primary=accent / --danger=accent border+color / --ghost=transparent.
 *          → describe "AC-2".
 *   AC-3 : main.tsx から "./styles/button.css" が import され, tokens.css 直後に位置する (D-011).
 *          → describe "AC-3".
 *   AC-4 : 対象 button (= D-008 で挙げた 24 button) 全てが className に "button" を含む.
 *          → describe "AC-4-X" (X = TaskCard / TaskFormCard / ProjectCard / ... の各 view).
 *   AC-5 : 削除系 button が --danger variant を持つ (4 件: TaskCard 削除 / ProjectCard 削除 /
 *          RoutineCard 削除 / TrashView ゴミ箱を空にする).
 *          → describe "AC-5".
 *   AC-6 : 主要 action button が --primary variant を持つ (12 件).
 *          → describe "AC-6".
 *   AC-7 : 補助 / キャンセル button が --ghost variant を持つ (8 件).
 *          → describe "AC-7".
 *   AC-8 : 既存配置制御 className (task-card__actions__delete / __complete / project-card__actions__delete /
 *          project-card__submit / routine-card__actions__delete / routine-card__submit) と
 *          "button" が併記される (D-009).
 *          → describe "AC-8".
 *   AC-9 : PriorityStars の ★/☆ には .button が付与されない (S-1 / 対象外).
 *          → describe "AC-9".
 *   AC-10: AppShell の hamburger / 閉じる button には .button が付与されない (S-2 / S-3 / 対象外).
 *          → describe "AC-10".
 *   AC-11: 既存 button の機能 (onClick / aria-label / type / disabled) が回帰しない.
 *          → describe "AC-11" (代表 button で click 1 件 + disabled 1 件).
 *   AC-12: project-create-dialog.css の .project-create-dialog button から padding が撤去され,
 *          :focus-visible 宣言も撤去される (= .button 系へ集約 / D-002 / I-16).
 *          → describe "AC-12".
 *   AC-13: 既存テスト全件 green 維持 (本 BL 範囲外 / `npx vitest run` の継続実行で担保).
 *          本ファイルでは個別 assert しない.
 *
 * 本ファイルは TDD の "red" を作るためのテスト.
 *   - 実装前 (= web/src/styles/button.css 未作成 / main.tsx 未追記 /
 *     13 view tsx の className 未付与 / project-create-dialog.css の padding 撤去未実施)
 *     では CSS 直読み系 (AC-1 / AC-2 / AC-12), import 系 (AC-3),
 *     className 系 (AC-4 〜 AC-8) が全て red になる想定.
 *   - 対象外 button 系 (AC-9 / AC-10) は実装前後とも green が期待値.
 *   - implementer が button.css 新設 + main.tsx import 追加 + 13 view tsx の className 付与
 *     + project-create-dialog.css の padding 撤去 を行うことで red 群が green 化する.
 *
 * 検証スタイル:
 *   - CSS 直読み: BL-052 / BL-054 / BL-060 / BL-061 と同じ readFileSync + extractRuleBody (P-005).
 *   - 主要 button source 確認: tsx を readFileSync して "className=\"button..." パターンを assert.
 *     (= QueryClient / BrowserRouter 依存のある view を render しなくても button class の検証ができる).
 *   - card レンダ系: 動的 import + render で実 DOM を assert.
 *   - main.tsx: readFileSync で import 文と順序を assert.
 *
 * vitest-environment:
 *   DOM レンダ AC は jsdom 必須のため 1 ファイル全体を jsdom で動かす.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { fireEvent, render } from "@testing-library/react";
import type { ComponentType } from "react";
import { describe, expect, it, vi } from "vitest";

import type { Task } from "@todica/domain/task";
import type { Project } from "../src/repositories/project-repository.js";
import type { WebRoutine } from "../src/repositories/routine-repository.js";

// ============================================================
// 共通定数 / パス解決
// ============================================================

const repoRoot = resolve(__dirname, "../..");
const webSrcRoot = resolve(repoRoot, "web/src");

// 本 BL で新設するファイル.
const buttonCssPath = resolve(webSrcRoot, "styles/button.css");

// 既存ファイル.
const mainTsxPath = resolve(webSrcRoot, "main.tsx");
const projectCreateDialogCssPath = resolve(
  webSrcRoot,
  "ui/project-create-dialog/project-create-dialog.css",
);

// 影響範囲表「対象」13 ファイルの tsx パス.
const TARGET_TSX_FILES = {
  taskCard: resolve(webSrcRoot, "ui/task-card/task-card.tsx"),
  taskFormCard: resolve(webSrcRoot, "ui/task-card/task-form-card.tsx"),
  projectCard: resolve(webSrcRoot, "ui/project-card/project-card.tsx"),
  projectFormCard: resolve(webSrcRoot, "ui/project-card/project-form-card.tsx"),
  routineCard: resolve(webSrcRoot, "ui/routine-card/routine-card.tsx"),
  routineFormCard: resolve(webSrcRoot, "ui/routine-card/routine-form-card.tsx"),
  trashView: resolve(webSrcRoot, "ui/trash-view/trash-view.tsx"),
  settingsView: resolve(webSrcRoot, "ui/settings-view/settings-view.tsx"),
  setupView: resolve(webSrcRoot, "ui/setup-view/setup-view.tsx"),
  projectCreateDialog: resolve(webSrcRoot, "ui/project-create-dialog/project-create-dialog.tsx"),
  pwaUpdateBanner: resolve(webSrcRoot, "ui/pwa-update-banner/pwa-update-banner.tsx"),
  errorNotification: resolve(webSrcRoot, "ui/error-notification/error-notification.tsx"),
  conflictDialog: resolve(webSrcRoot, "ui/conflict-dialog/conflict-dialog.tsx"),
  // 対象外 (S-1 / S-2 / S-3).
  priorityStars: resolve(webSrcRoot, "ui/priority-stars/priority-stars.tsx"),
  appShell: resolve(webSrcRoot, "ui/app-shell/app-shell.tsx"),
} as const;

// ============================================================
// CSS ルール本文の抽出ヘルパ (P-005 / BL-060 等から再実装)
// ============================================================

/**
 * 指定したセレクタの「ルール本文 (= {} で囲まれた中身)」を抽出する.
 *
 * 単純な /selector\s*\{([^}]*)\}/ では `.button` が `.button--primary` 等の prefix
 * にも一致してしまうため, セレクタ末尾を `{` / 空白で厳密に区切る.
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

const NOW = "2026-06-12T09:00:00.000Z";
const TASK_ID = "t1t1t1t1-t1t1-4t1t-8t1t-t1t1t1t1t1t1";
const PROJECT_ID = "p1p1p1p1-p1p1-4p1p-8p1p-p1p1p1p1p1p1";
const ROUTINE_ID = "r1r1r1r1-r1r1-4r1r-8r1r-r1r1r1r1r1r1";

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: TASK_ID,
    name: "原稿を書く",
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
    id: PROJECT_ID,
    name: "仕事",
    version: 1,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function makeRoutine(overrides: Partial<WebRoutine> = {}): WebRoutine {
  return {
    id: ROUTINE_ID,
    name: "朝の運動",
    daysOfWeek: [1, 3, 5],
    defaultPriority: "normal",
    version: 1,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

// ============================================================
// 動的 import ヘルパ (DOM レンダ系)
// ============================================================

type TaskCardModule = { TaskCard: ComponentType<Record<string, unknown>> };
type TaskFormCardModule = { TaskFormCard: ComponentType<Record<string, unknown>> };
type ProjectCardModule = { ProjectCard: ComponentType<Record<string, unknown>> };
type ProjectFormCardModule = { ProjectFormCard: ComponentType<Record<string, unknown>> };
type RoutineCardModule = { RoutineCard: ComponentType<Record<string, unknown>> };
type RoutineFormCardModule = { RoutineFormCard: ComponentType<Record<string, unknown>> };
type PriorityStarsModule = { PriorityStars: ComponentType<Record<string, unknown>> };
type ConflictDialogModule = { ConflictDialog: ComponentType<Record<string, unknown>> };

// 既存 BL-060 / BL-061 テスト同様, @vite-ignore + 文字列変数で動的 import し
// any → 目的型 にキャストする (= TypeScript の構造的部分型を回避するため間に unknown を挟む).
async function importTaskCard(): Promise<TaskCardModule> {
  const path = "../src/ui/task-card/task-card.js";
  return (await import(/* @vite-ignore */ path)) as unknown as TaskCardModule;
}
async function importTaskFormCard(): Promise<TaskFormCardModule> {
  const path = "../src/ui/task-card/task-form-card.js";
  return (await import(/* @vite-ignore */ path)) as unknown as TaskFormCardModule;
}
async function importProjectCard(): Promise<ProjectCardModule> {
  const path = "../src/ui/project-card/project-card.js";
  return (await import(/* @vite-ignore */ path)) as unknown as ProjectCardModule;
}
async function importProjectFormCard(): Promise<ProjectFormCardModule> {
  const path = "../src/ui/project-card/project-form-card.js";
  return (await import(/* @vite-ignore */ path)) as unknown as ProjectFormCardModule;
}
async function importRoutineCard(): Promise<RoutineCardModule> {
  const path = "../src/ui/routine-card/routine-card.js";
  return (await import(/* @vite-ignore */ path)) as unknown as RoutineCardModule;
}
async function importRoutineFormCard(): Promise<RoutineFormCardModule> {
  const path = "../src/ui/routine-card/routine-form-card.js";
  return (await import(/* @vite-ignore */ path)) as unknown as RoutineFormCardModule;
}
async function importPriorityStars(): Promise<PriorityStarsModule> {
  const path = "../src/ui/priority-stars/priority-stars.js";
  return (await import(/* @vite-ignore */ path)) as unknown as PriorityStarsModule;
}
async function importConflictDialog(): Promise<ConflictDialogModule> {
  const path = "../src/ui/conflict-dialog/conflict-dialog.js";
  return (await import(/* @vite-ignore */ path)) as unknown as ConflictDialogModule;
}

// ============================================================
// ソース直読みヘルパ
// ============================================================

/**
 * tsx の `<button ... className="..." ...>` の `className=` 属性値 (1 つ目) を抽出する.
 *
 * 単純な /className="([^"]+)"/ では同 button 内の他属性と一致する可能性があるため,
 * `<button` から最初の `>` までを限定的にスキャンする.
 *
 * - 文字列ラベル (例: 「削除」) が button 内 textContent に含まれているかでマッチを決める.
 *   button 開始タグ 〜 `</button>` までの一塊を切り出し, className 属性をその中から取り出す.
 *
 * @param tsxText readFileSync 結果.
 * @param textLabel button textContent に含まれているはずの日本語ラベル.
 * @returns マッチした button の className 文字列. 見つからない場合は null.
 */
function findButtonClassNameByLabel(tsxText: string, textLabel: string): string | null {
  // <button ... > ... <textLabel> ... </button> パターンを greedy 最小マッチで拾う.
  // タグ内に `<` を含む属性は無い想定 (= 既存 13 ファイルでは出現しない).
  const buttonBlockRe = /<button\b([^>]*)>([\s\S]*?)<\/button>/g;
  while (true) {
    const m = buttonBlockRe.exec(tsxText);
    if (m === null) return null;
    const attrs = m[1] ?? "";
    const body = m[2] ?? "";
    if (!body.includes(textLabel)) continue;
    const cnMatch = attrs.match(/className\s*=\s*"([^"]*)"/);
    if (cnMatch) return cnMatch[1] ?? "";
    // className 属性が無い場合も「button タグは見つかった」ことを区別するため空文字を返す.
    return "";
  }
}

// ============================================================
// describe ブロック
// ============================================================

describe("共通ボタンスタイル (BL-067 / common-button-style)", () => {
  // ============================================================
  // AC-1: 基底 .button が新設され, 視覚 / cursor / appearance 等を含み, shadow / hover / transition / animation を含まない
  // ============================================================
  /**
   * シナリオ AC-1 (spec.md AC-1 / REQ-1 / REQ-2 / NFR-1 / D-004):
   *   Given web/src/styles/button.css を読み取る
   *   When  .button セレクタのルール本文を観察する
   *   Then  border / border-radius / padding / cursor: pointer / appearance / background / color /
   *         box-sizing / font 関連の宣言を含む
   *    かつ shadow / hover background / transition / animation の宣言を含まない (NFR-NO-SHADOW / NFR-NO-HOVER-TRANSITION)
   */
  describe("AC-1: 基底 .button クラスが新設される", () => {
    it("web/src/styles/button.css が存在する", () => {
      expect(existsSync(buttonCssPath)).toBe(true);
    });

    it(".button セレクタが定義されている", () => {
      const css = readFileSync(buttonCssPath, "utf-8");
      const body = extractRuleBody(css, ".button");
      expect(body, ".button ルールが見つからない").not.toBeNull();
    });

    it(".button ルール本文に appearance: none を含む (UA スタイルの抑止)", () => {
      const css = readFileSync(buttonCssPath, "utf-8");
      const body = extractRuleBody(css, ".button") ?? "";
      // appearance: none と -webkit-appearance: none の少なくともどちらかを含む.
      const hasAppearance = /(?:^|;|\n|\{)\s*appearance\s*:\s*none/.test(body);
      const hasWebkitAppearance = /-webkit-appearance\s*:\s*none/.test(body);
      expect(
        hasAppearance || hasWebkitAppearance,
        ".button に appearance: none / -webkit-appearance: none が無い (UA 抑止)",
      ).toBe(true);
    });

    it(".button ルール本文に box-sizing: border-box を含む", () => {
      const css = readFileSync(buttonCssPath, "utf-8");
      const body = extractRuleBody(css, ".button") ?? "";
      expect(body).toMatch(/box-sizing\s*:\s*border-box/);
    });

    it(".button ルール本文に border: 1px solid var(--color-border) (または等価分解) を含む", () => {
      const css = readFileSync(buttonCssPath, "utf-8");
      const body = extractRuleBody(css, ".button") ?? "";
      const hasShorthand = /border\s*:\s*1px\s+solid\s+var\(--color-border\)/.test(body);
      const hasDecomposed =
        /border-width\s*:\s*1px/.test(body) &&
        /border-style\s*:\s*solid/.test(body) &&
        /border-color\s*:\s*var\(--color-border\)/.test(body);
      expect(
        hasShorthand || hasDecomposed,
        ".button に border: 1px solid var(--color-border) 等価宣言が無い",
      ).toBe(true);
    });

    it(".button ルール本文に border-radius: var(--radius-sm) を含む (D-004)", () => {
      const css = readFileSync(buttonCssPath, "utf-8");
      const body = extractRuleBody(css, ".button") ?? "";
      expect(body).toMatch(/border-radius\s*:\s*var\(--radius-sm\)/);
    });

    it(".button ルール本文に padding: var(--space-xs) var(--space-md) を含む (D-004)", () => {
      const css = readFileSync(buttonCssPath, "utf-8");
      const body = extractRuleBody(css, ".button") ?? "";
      expect(body).toMatch(/(?:^|;|\n)\s*padding\s*:\s*var\(--space-xs\)\s+var\(--space-md\)/);
    });

    it(".button ルール本文に cursor: pointer を含む (D-004)", () => {
      const css = readFileSync(buttonCssPath, "utf-8");
      const body = extractRuleBody(css, ".button") ?? "";
      expect(body).toMatch(/cursor\s*:\s*pointer/);
    });

    it(".button ルール本文に background: var(--color-bg) を含む", () => {
      const css = readFileSync(buttonCssPath, "utf-8");
      const body = extractRuleBody(css, ".button") ?? "";
      expect(body).toMatch(/background(?:-color)?\s*:\s*var\(--color-bg\)/);
    });

    it(".button ルール本文に color: var(--color-fg) を含む", () => {
      const css = readFileSync(buttonCssPath, "utf-8");
      const body = extractRuleBody(css, ".button") ?? "";
      expect(body).toMatch(/(?:^|;|\n)\s*color\s*:\s*var\(--color-fg\)/);
    });

    it(".button ルール本文に font: inherit を含む (D-004 / font 関連)", () => {
      const css = readFileSync(buttonCssPath, "utf-8");
      const body = extractRuleBody(css, ".button") ?? "";
      // font: inherit 一発か, font-family / font-size / line-height の個別宣言かのいずれか.
      const hasFontInherit = /(?:^|;|\n)\s*font\s*:\s*inherit/.test(body);
      const hasFontIndividual = /font-family\s*:/.test(body) && /font-size\s*:/.test(body);
      expect(
        hasFontInherit || hasFontIndividual,
        ".button に font: inherit (または font-family / font-size の個別宣言) が無い",
      ).toBe(true);
    });

    it(".button:focus-visible ルールが定義されている (D-002)", () => {
      const css = readFileSync(buttonCssPath, "utf-8");
      const body = extractRuleBody(css, ".button:focus-visible");
      expect(body, ".button:focus-visible ルールが見つからない (D-002 違反)").not.toBeNull();
      // outline 系の宣言を持つ.
      expect(body ?? "").toMatch(/outline\s*:/);
    });

    it(".button:disabled ルールが定義されている (D-007)", () => {
      const css = readFileSync(buttonCssPath, "utf-8");
      const body = extractRuleBody(css, ".button:disabled");
      expect(body, ".button:disabled ルールが見つからない (D-007 違反)").not.toBeNull();
      // cursor: not-allowed と opacity: 0.6 を含む.
      const bodyText = body ?? "";
      expect(bodyText).toMatch(/cursor\s*:\s*not-allowed/);
      expect(bodyText).toMatch(/opacity\s*:\s*0\.6/);
    });

    // NFR-NO-SHADOW / NFR-NO-HOVER-TRANSITION: button.css 全体に対する不在 assert.
    it("button.css 全体に box-shadow キーワードが含まれない (NFR-NO-SHADOW)", () => {
      const css = readFileSync(buttonCssPath, "utf-8");
      expect(css, "button.css に box-shadow が含まれている (NFR-NO-SHADOW 違反)").not.toMatch(
        /box-shadow\s*:/,
      );
    });

    it("button.css 全体に transition 宣言が含まれない (NFR-NO-HOVER-TRANSITION)", () => {
      const css = readFileSync(buttonCssPath, "utf-8");
      expect(
        css,
        "button.css に transition が含まれている (NFR-NO-HOVER-TRANSITION 違反)",
      ).not.toMatch(/(?:^|;|\n|\{|\s)transition\s*:/);
    });

    it("button.css 全体に animation 宣言が含まれない (NFR-NO-HOVER-TRANSITION)", () => {
      const css = readFileSync(buttonCssPath, "utf-8");
      expect(
        css,
        "button.css に animation が含まれている (NFR-NO-HOVER-TRANSITION 違反)",
      ).not.toMatch(/(?:^|;|\n|\{|\s)animation\s*:/);
    });

    it("button.css に :hover セレクタが含まれない (NFR-NO-HOVER-TRANSITION)", () => {
      const css = readFileSync(buttonCssPath, "utf-8");
      // コメント内に "hover" が出てくる可能性 (= "hover background を含まない" 等) を許容するため,
      // セレクタ `:hover` (= `:hover {` や `:hover,` パターン) のみを検出する.
      expect(
        css,
        "button.css に :hover セレクタが含まれている (NFR-NO-HOVER-TRANSITION 違反)",
      ).not.toMatch(/:hover\s*[,{]/);
    });
  });

  // ============================================================
  // AC-2: 派生 variant (--primary / --danger / --ghost) が新設される
  // ============================================================
  /**
   * シナリオ AC-2 (spec.md AC-2 / REQ-3 / D-003):
   *   Given web/src/styles/button.css を読み取る
   *   When  .button--primary / .button--danger / .button--ghost のルール本文を観察する
   *   Then  各セレクタが存在し, background / color / border-color のいずれかを意図に沿って上書きする
   *   D-003 の確定値:
   *     --primary: background = var(--color-accent), color = var(--color-bg), border-color = var(--color-accent)
   *     --danger : background = var(--color-bg), color = var(--color-accent), border-color = var(--color-accent)
   *     --ghost  : background = transparent, color = var(--color-fg), border-color = var(--color-border)
   */
  describe("AC-2: 派生 variant (.button--primary / .button--danger / .button--ghost) が新設される", () => {
    it(".button--primary ルールが定義され, --color-accent をいずれかの色プロパティに引いている (D-003)", () => {
      const css = readFileSync(buttonCssPath, "utf-8");
      const body = extractRuleBody(css, ".button--primary");
      expect(body, ".button--primary ルールが見つからない").not.toBeNull();
      const bodyText = body ?? "";
      // D-003: background = --color-accent. 視覚意図の核として必須.
      expect(
        bodyText,
        ".button--primary に background: var(--color-accent) が無い (D-003 違反)",
      ).toMatch(/background(?:-color)?\s*:\s*var\(--color-accent\)/);
      // 文字色は --color-bg (= 白) で反転.
      expect(bodyText, ".button--primary に color: var(--color-bg) が無い (D-003 違反)").toMatch(
        /(?:^|;|\n)\s*color\s*:\s*var\(--color-bg\)/,
      );
    });

    it(".button--danger ルールが定義され, --color-accent を border / color に引いている (D-003)", () => {
      const css = readFileSync(buttonCssPath, "utf-8");
      const body = extractRuleBody(css, ".button--danger");
      expect(body, ".button--danger ルールが見つからない").not.toBeNull();
      const bodyText = body ?? "";
      // D-003: --danger は赤系トークンが無いため border-color + color = --color-accent で強調.
      expect(bodyText, ".button--danger に color: var(--color-accent) が無い (D-003 違反)").toMatch(
        /(?:^|;|\n)\s*color\s*:\s*var\(--color-accent\)/,
      );
      expect(
        bodyText,
        ".button--danger に border-color: var(--color-accent) が無い (D-003 違反)",
      ).toMatch(/border-color\s*:\s*var\(--color-accent\)/);
    });

    it(".button--ghost ルールが定義され, background: transparent + color: var(--color-fg) を持つ (D-003)", () => {
      const css = readFileSync(buttonCssPath, "utf-8");
      const body = extractRuleBody(css, ".button--ghost");
      expect(body, ".button--ghost ルールが見つからない").not.toBeNull();
      const bodyText = body ?? "";
      expect(bodyText, ".button--ghost に background: transparent が無い (D-003 違反)").toMatch(
        /background(?:-color)?\s*:\s*transparent/,
      );
      expect(bodyText, ".button--ghost に color: var(--color-fg) が無い (D-003 違反)").toMatch(
        /(?:^|;|\n)\s*color\s*:\s*var\(--color-fg\)/,
      );
    });
  });

  // ============================================================
  // AC-3: main.tsx から button.css が import され, tokens.css 直後に位置する (D-011)
  // ============================================================
  /**
   * シナリオ AC-3 (spec.md AC-3 / REQ-6 / D-011):
   *   Given web/src/main.tsx を読み取る
   *   When  import 文を確認する
   *   Then  "./styles/button.css" の import 文が存在する
   *    かつ tokens.css の import の直後に位置する (順序根拠: button.css が --color-* を参照する)
   */
  describe("AC-3: main.tsx から button.css が import される (D-011)", () => {
    it('main.tsx に import "./styles/button.css" 文が存在する', () => {
      const src = readFileSync(mainTsxPath, "utf-8");
      expect(src, "main.tsx に button.css の import が無い").toMatch(
        /import\s+["']\.\/styles\/button\.css["']/,
      );
    });

    it("main.tsx で button.css の import が tokens.css の直後に位置する (D-011)", () => {
      const src = readFileSync(mainTsxPath, "utf-8");
      const lines = src.split("\n");
      const tokensIdx = lines.findIndex((l) => /import\s+["']\.\/styles\/tokens\.css["']/.test(l));
      const buttonIdx = lines.findIndex((l) => /import\s+["']\.\/styles\/button\.css["']/.test(l));
      expect(tokensIdx, "main.tsx に tokens.css の import が無い").toBeGreaterThanOrEqual(0);
      expect(buttonIdx, "main.tsx に button.css の import が無い").toBeGreaterThanOrEqual(0);
      // tokens.css の "直後" を厳密に (= 1 行差).
      expect(
        buttonIdx - tokensIdx,
        "button.css の import が tokens.css の直後ではない (D-011 違反)",
      ).toBe(1);
    });
  });

  // ============================================================
  // AC-4: 対象 button 全てが className に "button" を含む
  //
  // 13 view のうち card 系 6 ファイル (TaskCard / TaskFormCard / ProjectCard /
  // ProjectFormCard / RoutineCard / RoutineFormCard) は DOM レンダで確認.
  // 残り 7 ファイル (TrashView / SettingsView / SetupView / ProjectCreateDialog /
  // PwaUpdateBanner / ErrorNotification / ConflictDialog) は QueryClient / BrowserRouter 依存
  // のため readFileSync で tsx 内 button タグの className を assert.
  // ============================================================
  describe('AC-4: 対象 button 全てが className に "button" を含む (D-008 / 24 件)', () => {
    // ----------------------------------------------------------
    // AC-4-TaskCard: 4 button (削除 / 現在のタスクにする / 明日にする / 完了)
    // ----------------------------------------------------------
    describe('AC-4-TaskCard: <TaskCard> 内 4 button が className に "button" を含む', () => {
      it('TaskCard の 削除 / 現在のタスクにする / 明日にする / 完了 button 全てに "button" を含む', async () => {
        const { TaskCard } = await importTaskCard();
        const { container } = render(
          <TaskCard
            task={makeTask({ origin: "manual" })}
            project={null}
            showPriority={false}
            showSetFocus
            actionSet="full"
            dueDateMode="today"
            onSetFocus={() => {}}
            onDelete={() => {}}
            onToggleDueDate={() => {}}
            onComplete={() => {}}
            onNameBlur={() => {}}
          />,
        );
        const buttons = Array.from(container.querySelectorAll("button"));
        const labels = ["削除", "現在のタスクにする", "明日にする", "完了"] as const;
        for (const label of labels) {
          const btn = buttons.find((b) => (b.textContent ?? "").includes(label));
          expect(btn, `TaskCard の「${label}」 button が見つからない`).toBeDefined();
          expect(
            btn?.className.split(/\s+/).includes("button"),
            `TaskCard の「${label}」 button に \"button\" className が無い`,
          ).toBe(true);
        }
      });
    });

    // ----------------------------------------------------------
    // AC-4-TaskFormCard: 1 button (追加)
    // ----------------------------------------------------------
    describe('AC-4-TaskFormCard: <TaskFormCard> 内「追加」 button が className に "button" を含む', () => {
      it('TaskFormCard の「追加」 button が "button" を含む', async () => {
        const { TaskFormCard } = await importTaskFormCard();
        const { container } = render(
          <TaskFormCard
            projects={[]}
            projectId=""
            onProjectIdChange={() => {}}
            priority="normal"
            onPriorityChange={() => {}}
            name="新規"
            onNameChange={() => {}}
            onSubmit={(e: React.FormEvent) => e.preventDefault()}
            idPrefix="create"
            inputId="task-name"
            formAriaLabel="タスク起票フォーム"
          />,
        );
        const btn = Array.from(container.querySelectorAll("button")).find((b) =>
          (b.textContent ?? "").includes("追加"),
        );
        expect(btn, "TaskFormCard の「追加」 button が見つからない").toBeDefined();
        expect(
          btn?.className.split(/\s+/).includes("button"),
          'TaskFormCard の「追加」 button に "button" className が無い',
        ).toBe(true);
      });
    });

    // ----------------------------------------------------------
    // AC-4-ProjectCard: 1 button (削除)
    // ----------------------------------------------------------
    describe('AC-4-ProjectCard: <ProjectCard> 内「削除」 button が className に "button" を含む', () => {
      it('ProjectCard の「削除」 button が "button" を含む', async () => {
        const { ProjectCard } = await importProjectCard();
        const { container } = render(
          <ProjectCard project={makeProject()} onNameBlur={() => {}} onDelete={() => {}} />,
        );
        const btn = Array.from(container.querySelectorAll("button")).find((b) =>
          (b.textContent ?? "").includes("削除"),
        );
        expect(btn, "ProjectCard の「削除」 button が見つからない").toBeDefined();
        expect(
          btn?.className.split(/\s+/).includes("button"),
          'ProjectCard の「削除」 button に "button" className が無い',
        ).toBe(true);
      });
    });

    // ----------------------------------------------------------
    // AC-4-ProjectFormCard: 1 button (追加)
    // ----------------------------------------------------------
    describe('AC-4-ProjectFormCard: <ProjectFormCard> 内「追加」 button が className に "button" を含む', () => {
      it('ProjectFormCard の「追加」 button が "button" を含む', async () => {
        const { ProjectFormCard } = await importProjectFormCard();
        const { container } = render(
          <ProjectFormCard
            name=""
            onNameChange={() => {}}
            onSubmit={(e: React.FormEvent) => e.preventDefault()}
          />,
        );
        const btn = Array.from(container.querySelectorAll("button")).find((b) =>
          (b.textContent ?? "").includes("追加"),
        );
        expect(btn, "ProjectFormCard の「追加」 button が見つからない").toBeDefined();
        expect(
          btn?.className.split(/\s+/).includes("button"),
          'ProjectFormCard の「追加」 button に "button" className が無い',
        ).toBe(true);
      });
    });

    // ----------------------------------------------------------
    // AC-4-RoutineCard: 1 button (削除)
    // ----------------------------------------------------------
    describe('AC-4-RoutineCard: <RoutineCard> 内「削除」 button が className に "button" を含む', () => {
      it('RoutineCard の「削除」 button が "button" を含む', async () => {
        const { RoutineCard } = await importRoutineCard();
        const { container } = render(
          <RoutineCard
            routine={makeRoutine()}
            onNameBlur={() => {}}
            onDaysOfWeekChange={() => {}}
            onDefaultPriorityChange={() => {}}
            onDelete={() => {}}
          />,
        );
        const btn = Array.from(container.querySelectorAll("button")).find((b) =>
          (b.textContent ?? "").includes("削除"),
        );
        expect(btn, "RoutineCard の「削除」 button が見つからない").toBeDefined();
        expect(
          btn?.className.split(/\s+/).includes("button"),
          'RoutineCard の「削除」 button に "button" className が無い',
        ).toBe(true);
      });
    });

    // ----------------------------------------------------------
    // AC-4-RoutineFormCard: 1 button (追加)
    // ----------------------------------------------------------
    describe('AC-4-RoutineFormCard: <RoutineFormCard> 内「追加」 button が className に "button" を含む', () => {
      it('RoutineFormCard の「追加」 button が "button" を含む', async () => {
        const { RoutineFormCard } = await importRoutineFormCard();
        const { container } = render(
          <RoutineFormCard
            name=""
            onNameChange={() => {}}
            daysOfWeek={[]}
            onToggleDay={() => {}}
            defaultPriority="normal"
            onDefaultPriorityChange={() => {}}
            onSubmit={(e: React.FormEvent) => e.preventDefault()}
          />,
        );
        const btn = Array.from(container.querySelectorAll("button")).find((b) =>
          (b.textContent ?? "").includes("追加"),
        );
        expect(btn, "RoutineFormCard の「追加」 button が見つからない").toBeDefined();
        expect(
          btn?.className.split(/\s+/).includes("button"),
          'RoutineFormCard の「追加」 button に "button" className が無い',
        ).toBe(true);
      });
    });

    // ----------------------------------------------------------
    // AC-4-TrashView: 2 button (ゴミ箱を空にする / 復元) → ソース直読み
    // ----------------------------------------------------------
    describe('AC-4-TrashView: trash-view.tsx 内 button のソースに className="button ..." を含む', () => {
      it('trash-view.tsx の「ゴミ箱を空にする」 button が className に "button" を含む', () => {
        const src = readFileSync(TARGET_TSX_FILES.trashView, "utf-8");
        const cn = findButtonClassNameByLabel(src, "ゴミ箱を空にする");
        expect(cn, "trash-view.tsx の「ゴミ箱を空にする」 button が見つからない").not.toBeNull();
        expect(
          (cn ?? "").split(/\s+/).includes("button"),
          `trash-view.tsx の「ゴミ箱を空にする」 button に "button" className が無い (現値: "${cn}")`,
        ).toBe(true);
      });

      it('trash-view.tsx の「復元」 button が className に "button" を含む', () => {
        const src = readFileSync(TARGET_TSX_FILES.trashView, "utf-8");
        const cn = findButtonClassNameByLabel(src, "復元");
        expect(cn, "trash-view.tsx の「復元」 button が見つからない").not.toBeNull();
        expect(
          (cn ?? "").split(/\s+/).includes("button"),
          `trash-view.tsx の「復元」 button に "button" className が無い (現値: "${cn}")`,
        ).toBe(true);
      });
    });

    // ----------------------------------------------------------
    // AC-4-SettingsView: 3 button (保存 / 変更を保存 / mode 切替) → ソース直読み
    // ----------------------------------------------------------
    describe('AC-4-SettingsView: settings-view.tsx 内 button のソースに className="button ..." を含む', () => {
      it('settings-view.tsx の「保存」 button が className に "button" を含む', () => {
        const src = readFileSync(TARGET_TSX_FILES.settingsView, "utf-8");
        const cn = findButtonClassNameByLabel(src, "保存");
        expect(cn, "settings-view.tsx の「保存」 button が見つからない").not.toBeNull();
        expect(
          (cn ?? "").split(/\s+/).includes("button"),
          `settings-view.tsx の「保存」 button に "button" className が無い (現値: "${cn}")`,
        ).toBe(true);
      });

      it('settings-view.tsx の「変更を保存」 button が className に "button" を含む', () => {
        const src = readFileSync(TARGET_TSX_FILES.settingsView, "utf-8");
        const cn = findButtonClassNameByLabel(src, "変更を保存");
        expect(cn, "settings-view.tsx の「変更を保存」 button が見つからない").not.toBeNull();
        expect(
          (cn ?? "").split(/\s+/).includes("button"),
          `settings-view.tsx の「変更を保存」 button に "button" className が無い (現値: "${cn}")`,
        ).toBe(true);
      });

      it('settings-view.tsx の mode 切替 button (サーバモード / ローカルモード) が className に "button" を含む', () => {
        const src = readFileSync(TARGET_TSX_FILES.settingsView, "utf-8");
        // JSX 上は三項で「サーバモードへ切り替える」 / 「ローカルモードへ切り替える」が同 button 内 textContent に並ぶ.
        // 共通の「モードへ切り替える」で button block を特定する.
        const cn = findButtonClassNameByLabel(src, "モードへ切り替える");
        expect(cn, "settings-view.tsx の mode 切替 button が見つからない").not.toBeNull();
        expect(
          (cn ?? "").split(/\s+/).includes("button"),
          `settings-view.tsx の mode 切替 button に "button" className が無い (現値: "${cn}")`,
        ).toBe(true);
      });
    });

    // ----------------------------------------------------------
    // AC-4-SetupView: 2 button (接続する / ローカルモードで使う) → ソース直読み
    // ----------------------------------------------------------
    describe('AC-4-SetupView: setup-view.tsx 内 button のソースに className="button ..." を含む', () => {
      it('setup-view.tsx の「接続する」 button が className に "button" を含む', () => {
        const src = readFileSync(TARGET_TSX_FILES.setupView, "utf-8");
        const cn = findButtonClassNameByLabel(src, "接続する");
        expect(cn, "setup-view.tsx の「接続する」 button が見つからない").not.toBeNull();
        expect(
          (cn ?? "").split(/\s+/).includes("button"),
          `setup-view.tsx の「接続する」 button に "button" className が無い (現値: "${cn}")`,
        ).toBe(true);
      });

      it('setup-view.tsx の「ローカルモードで使う」 button が className に "button" を含む', () => {
        const src = readFileSync(TARGET_TSX_FILES.setupView, "utf-8");
        const cn = findButtonClassNameByLabel(src, "ローカルモードで使う");
        expect(
          cn,
          "setup-view.tsx の「ローカルモードで使う」 button が見つからない",
        ).not.toBeNull();
        expect(
          (cn ?? "").split(/\s+/).includes("button"),
          `setup-view.tsx の「ローカルモードで使う」 button に "button" className が無い (現値: "${cn}")`,
        ).toBe(true);
      });
    });

    // ----------------------------------------------------------
    // AC-4-ProjectCreateDialog: 2 button (追加 / キャンセル) → ソース直読み
    // ----------------------------------------------------------
    describe('AC-4-ProjectCreateDialog: project-create-dialog.tsx 内 button のソースに className="button ..." を含む', () => {
      it('project-create-dialog.tsx の「追加」 button が className に "button" を含む', () => {
        const src = readFileSync(TARGET_TSX_FILES.projectCreateDialog, "utf-8");
        const cn = findButtonClassNameByLabel(src, "追加");
        expect(cn, "project-create-dialog.tsx の「追加」 button が見つからない").not.toBeNull();
        expect(
          (cn ?? "").split(/\s+/).includes("button"),
          `project-create-dialog.tsx の「追加」 button に "button" className が無い (現値: "${cn}")`,
        ).toBe(true);
      });

      it('project-create-dialog.tsx の「キャンセル」 button が className に "button" を含む', () => {
        const src = readFileSync(TARGET_TSX_FILES.projectCreateDialog, "utf-8");
        const cn = findButtonClassNameByLabel(src, "キャンセル");
        expect(
          cn,
          "project-create-dialog.tsx の「キャンセル」 button が見つからない",
        ).not.toBeNull();
        expect(
          (cn ?? "").split(/\s+/).includes("button"),
          `project-create-dialog.tsx の「キャンセル」 button に "button" className が無い (現値: "${cn}")`,
        ).toBe(true);
      });
    });

    // ----------------------------------------------------------
    // AC-4-PwaUpdateBanner: 2 button (再読み込み / 閉じる) → ソース直読み
    // ----------------------------------------------------------
    describe('AC-4-PwaUpdateBanner: pwa-update-banner.tsx 内 button のソースに className="button ..." を含む', () => {
      it('pwa-update-banner.tsx の「再読み込み」 button が className に "button" を含む', () => {
        const src = readFileSync(TARGET_TSX_FILES.pwaUpdateBanner, "utf-8");
        const cn = findButtonClassNameByLabel(src, "再読み込み");
        expect(cn, "pwa-update-banner.tsx の「再読み込み」 button が見つからない").not.toBeNull();
        expect(
          (cn ?? "").split(/\s+/).includes("button"),
          `pwa-update-banner.tsx の「再読み込み」 button に "button" className が無い (現値: "${cn}")`,
        ).toBe(true);
      });

      it('pwa-update-banner.tsx の「閉じる」 button が className に "button" を含む', () => {
        const src = readFileSync(TARGET_TSX_FILES.pwaUpdateBanner, "utf-8");
        const cn = findButtonClassNameByLabel(src, "閉じる");
        expect(cn, "pwa-update-banner.tsx の「閉じる」 button が見つからない").not.toBeNull();
        expect(
          (cn ?? "").split(/\s+/).includes("button"),
          `pwa-update-banner.tsx の「閉じる」 button に "button" className が無い (現値: "${cn}")`,
        ).toBe(true);
      });
    });

    // ----------------------------------------------------------
    // AC-4-ErrorNotification: 1 button (×) → DOM レンダ
    // ----------------------------------------------------------
    describe('AC-4-ErrorNotification: error-notification.tsx 内 × button が className に "button" を含む (D-001)', () => {
      it('error-notification.tsx の × button (aria-label="通知を閉じる") が className に "button" を含む', () => {
        // ErrorNotification は useErrorNotification 経由で表示されるため readFileSync で検証.
        const src = readFileSync(TARGET_TSX_FILES.errorNotification, "utf-8");
        // textContent は "×" の単一文字.
        const cn = findButtonClassNameByLabel(src, "×");
        expect(cn, "error-notification.tsx の × button が見つからない").not.toBeNull();
        expect(
          (cn ?? "").split(/\s+/).includes("button"),
          `error-notification.tsx の × button に "button" className が無い (D-001 違反 / 現値: "${cn}")`,
        ).toBe(true);
      });
    });

    // ----------------------------------------------------------
    // AC-4-ConflictDialog: 2 button (サーバの値を採用 / クライアントの値で再送) → DOM レンダ
    // ----------------------------------------------------------
    describe('AC-4-ConflictDialog: <ConflictDialog> 内 button が className に "button" を含む', () => {
      it('ConflictDialog の「サーバの値を採用」「クライアントの値で再送」 button が "button" を含む', async () => {
        const { ConflictDialog } = await importConflictDialog();
        const { container } = render(
          <ConflictDialog
            open
            localValue={{ name: "ローカル" }}
            serverValue={{ name: "サーバ" }}
            onAcceptServer={() => {}}
            onRetryWithServer={() => {}}
          />,
        );
        const labels = ["サーバの値を採用", "クライアントの値で再送"] as const;
        for (const label of labels) {
          const btn = Array.from(container.querySelectorAll("button")).find((b) =>
            (b.textContent ?? "").includes(label),
          );
          expect(btn, `ConflictDialog の「${label}」 button が見つからない`).toBeDefined();
          expect(
            btn?.className.split(/\s+/).includes("button"),
            `ConflictDialog の「${label}」 button に "button" className が無い`,
          ).toBe(true);
        }
      });
    });
  });

  // ============================================================
  // AC-5: 削除系 button が --danger variant を持つ (D-008 / 4 件)
  // ============================================================
  /**
   * シナリオ AC-5 (spec.md AC-5 / D-008 / REQ-4):
   *   Given 影響範囲表で variant=--danger と確定された 4 button を render する
   *   When  className を確認する
   *   Then  全 button に "button button--danger" を含む
   */
  describe("AC-5: 削除系 button が --danger variant を持つ (D-008 / 4 件)", () => {
    it("TaskCard の「削除」 button が --danger を持つ", async () => {
      const { TaskCard } = await importTaskCard();
      const { container } = render(
        <TaskCard
          task={makeTask({ origin: "manual" })}
          project={null}
          showPriority={false}
          showSetFocus
          actionSet="full"
          dueDateMode="today"
          onSetFocus={() => {}}
          onDelete={() => {}}
          onToggleDueDate={() => {}}
          onComplete={() => {}}
          onNameBlur={() => {}}
        />,
      );
      const btn = Array.from(container.querySelectorAll("button")).find(
        (b) => (b.textContent ?? "").trim() === "削除",
      );
      expect(btn, "TaskCard の「削除」 button が無い").toBeDefined();
      expect(
        btn?.className.split(/\s+/).includes("button--danger"),
        'TaskCard の「削除」 button に "button--danger" が無い (D-008 違反)',
      ).toBe(true);
    });

    it("ProjectCard の「削除」 button が --danger を持つ", async () => {
      const { ProjectCard } = await importProjectCard();
      const { container } = render(
        <ProjectCard project={makeProject()} onNameBlur={() => {}} onDelete={() => {}} />,
      );
      const btn = Array.from(container.querySelectorAll("button")).find(
        (b) => (b.textContent ?? "").trim() === "削除",
      );
      expect(btn, "ProjectCard の「削除」 button が無い").toBeDefined();
      expect(
        btn?.className.split(/\s+/).includes("button--danger"),
        'ProjectCard の「削除」 button に "button--danger" が無い (D-008 違反)',
      ).toBe(true);
    });

    it("RoutineCard の「削除」 button が --danger を持つ", async () => {
      const { RoutineCard } = await importRoutineCard();
      const { container } = render(
        <RoutineCard
          routine={makeRoutine()}
          onNameBlur={() => {}}
          onDaysOfWeekChange={() => {}}
          onDefaultPriorityChange={() => {}}
          onDelete={() => {}}
        />,
      );
      const btn = Array.from(container.querySelectorAll("button")).find(
        (b) => (b.textContent ?? "").trim() === "削除",
      );
      expect(btn, "RoutineCard の「削除」 button が無い").toBeDefined();
      expect(
        btn?.className.split(/\s+/).includes("button--danger"),
        'RoutineCard の「削除」 button に "button--danger" が無い (D-008 違反)',
      ).toBe(true);
    });

    it("TrashView の「ゴミ箱を空にする」 button が --danger を持つ (ソース直読み)", () => {
      const src = readFileSync(TARGET_TSX_FILES.trashView, "utf-8");
      const cn = findButtonClassNameByLabel(src, "ゴミ箱を空にする");
      expect(cn, "trash-view.tsx の「ゴミ箱を空にする」 button が見つからない").not.toBeNull();
      expect(
        (cn ?? "").split(/\s+/).includes("button--danger"),
        `trash-view.tsx の「ゴミ箱を空にする」 button に "button--danger" が無い (現値: "${cn}")`,
      ).toBe(true);
    });
  });

  // ============================================================
  // AC-6: 主要 action button が --primary variant を持つ (D-008 / 12 件)
  // ============================================================
  /**
   * シナリオ AC-6 (spec.md AC-6 / D-008 / REQ-4):
   *   Given 影響範囲表で variant=--primary と確定された 12 button を render / readFileSync する
   *   When  className を確認する
   *   Then  全 button に "button button--primary" を含む
   *
   *   D-008 確定の 12 件:
   *     TaskCard       : 現在のタスクにする / 明日にする(または今日にする) / 完了
   *     TaskFormCard   : 追加
   *     ProjectFormCard: 追加
   *     RoutineFormCard: 追加
   *     SettingsView   : 保存 / 変更を保存
   *     SetupView      : 接続する
   *     PwaUpdateBanner: 再読み込み
   *     ProjectCreateDialog: 追加
   *     ConflictDialog : サーバの値を採用
   */
  describe("AC-6: 主要 action button が --primary variant を持つ (D-008 / 12 件)", () => {
    it("TaskCard の「現在のタスクにする」「明日にする」「完了」 button が全て --primary を持つ", async () => {
      const { TaskCard } = await importTaskCard();
      const { container } = render(
        <TaskCard
          task={makeTask({ origin: "manual" })}
          project={null}
          showPriority={false}
          showSetFocus
          actionSet="full"
          dueDateMode="today"
          onSetFocus={() => {}}
          onDelete={() => {}}
          onToggleDueDate={() => {}}
          onComplete={() => {}}
          onNameBlur={() => {}}
        />,
      );
      const labels = ["現在のタスクにする", "明日にする", "完了"] as const;
      for (const label of labels) {
        const btn = Array.from(container.querySelectorAll("button")).find(
          (b) => (b.textContent ?? "").trim() === label,
        );
        expect(btn, `TaskCard の「${label}」 button が無い`).toBeDefined();
        expect(
          btn?.className.split(/\s+/).includes("button--primary"),
          `TaskCard の「${label}」 button に \"button--primary\" が無い (D-008 違反)`,
        ).toBe(true);
      }
    });

    it("TaskFormCard の「追加」 button が --primary を持つ", async () => {
      const { TaskFormCard } = await importTaskFormCard();
      const { container } = render(
        <TaskFormCard
          projects={[]}
          projectId=""
          onProjectIdChange={() => {}}
          priority="normal"
          onPriorityChange={() => {}}
          name="新規"
          onNameChange={() => {}}
          onSubmit={(e: React.FormEvent) => e.preventDefault()}
          idPrefix="create"
          inputId="task-name"
          formAriaLabel="タスク起票フォーム"
        />,
      );
      const btn = Array.from(container.querySelectorAll("button")).find(
        (b) => (b.textContent ?? "").trim() === "追加",
      );
      expect(btn, "TaskFormCard の「追加」 button が無い").toBeDefined();
      expect(
        btn?.className.split(/\s+/).includes("button--primary"),
        'TaskFormCard の「追加」 button に "button--primary" が無い (D-008 違反)',
      ).toBe(true);
    });

    it("ProjectFormCard の「追加」 button が --primary を持つ", async () => {
      const { ProjectFormCard } = await importProjectFormCard();
      const { container } = render(
        <ProjectFormCard
          name=""
          onNameChange={() => {}}
          onSubmit={(e: React.FormEvent) => e.preventDefault()}
        />,
      );
      const btn = Array.from(container.querySelectorAll("button")).find(
        (b) => (b.textContent ?? "").trim() === "追加",
      );
      expect(btn, "ProjectFormCard の「追加」 button が無い").toBeDefined();
      expect(
        btn?.className.split(/\s+/).includes("button--primary"),
        'ProjectFormCard の「追加」 button に "button--primary" が無い (D-008 違反)',
      ).toBe(true);
    });

    it("RoutineFormCard の「追加」 button が --primary を持つ", async () => {
      const { RoutineFormCard } = await importRoutineFormCard();
      const { container } = render(
        <RoutineFormCard
          name=""
          onNameChange={() => {}}
          daysOfWeek={[]}
          onToggleDay={() => {}}
          defaultPriority="normal"
          onDefaultPriorityChange={() => {}}
          onSubmit={(e: React.FormEvent) => e.preventDefault()}
        />,
      );
      const btn = Array.from(container.querySelectorAll("button")).find(
        (b) => (b.textContent ?? "").trim() === "追加",
      );
      expect(btn, "RoutineFormCard の「追加」 button が無い").toBeDefined();
      expect(
        btn?.className.split(/\s+/).includes("button--primary"),
        'RoutineFormCard の「追加」 button に "button--primary" が無い (D-008 違反)',
      ).toBe(true);
    });

    it("SettingsView の「保存」「変更を保存」 button が --primary を持つ (ソース直読み)", () => {
      const src = readFileSync(TARGET_TSX_FILES.settingsView, "utf-8");
      const labels = ["保存", "変更を保存"] as const;
      for (const label of labels) {
        const cn = findButtonClassNameByLabel(src, label);
        expect(cn, `settings-view.tsx の「${label}」 button が見つからない`).not.toBeNull();
        expect(
          (cn ?? "").split(/\s+/).includes("button--primary"),
          `settings-view.tsx の「${label}」 button に "button--primary" が無い (現値: "${cn}")`,
        ).toBe(true);
      }
    });

    it("SetupView の「接続する」 button が --primary を持つ (ソース直読み)", () => {
      const src = readFileSync(TARGET_TSX_FILES.setupView, "utf-8");
      const cn = findButtonClassNameByLabel(src, "接続する");
      expect(cn, "setup-view.tsx の「接続する」 button が見つからない").not.toBeNull();
      expect(
        (cn ?? "").split(/\s+/).includes("button--primary"),
        `setup-view.tsx の「接続する」 button に "button--primary" が無い (現値: "${cn}")`,
      ).toBe(true);
    });

    it("PwaUpdateBanner の「再読み込み」 button が --primary を持つ (ソース直読み)", () => {
      const src = readFileSync(TARGET_TSX_FILES.pwaUpdateBanner, "utf-8");
      const cn = findButtonClassNameByLabel(src, "再読み込み");
      expect(cn, "pwa-update-banner.tsx の「再読み込み」 button が見つからない").not.toBeNull();
      expect(
        (cn ?? "").split(/\s+/).includes("button--primary"),
        `pwa-update-banner.tsx の「再読み込み」 button に "button--primary" が無い (現値: "${cn}")`,
      ).toBe(true);
    });

    it("ProjectCreateDialog の「追加」 button が --primary を持つ (ソース直読み)", () => {
      const src = readFileSync(TARGET_TSX_FILES.projectCreateDialog, "utf-8");
      const cn = findButtonClassNameByLabel(src, "追加");
      expect(cn, "project-create-dialog.tsx の「追加」 button が見つからない").not.toBeNull();
      expect(
        (cn ?? "").split(/\s+/).includes("button--primary"),
        `project-create-dialog.tsx の「追加」 button に "button--primary" が無い (現値: "${cn}")`,
      ).toBe(true);
    });

    it("ConflictDialog の「サーバの値を採用」 button が --primary を持つ", async () => {
      const { ConflictDialog } = await importConflictDialog();
      const { container } = render(
        <ConflictDialog
          open
          localValue={{ name: "ローカル" }}
          serverValue={{ name: "サーバ" }}
          onAcceptServer={() => {}}
          onRetryWithServer={() => {}}
        />,
      );
      const btn = Array.from(container.querySelectorAll("button")).find(
        (b) => (b.textContent ?? "").trim() === "サーバの値を採用",
      );
      expect(btn, "ConflictDialog の「サーバの値を採用」 button が無い").toBeDefined();
      expect(
        btn?.className.split(/\s+/).includes("button--primary"),
        'ConflictDialog の「サーバの値を採用」 button に "button--primary" が無い (D-008 違反)',
      ).toBe(true);
    });
  });

  // ============================================================
  // AC-7: 補助 / キャンセル button が --ghost variant を持つ (D-008 / 8 件)
  // ============================================================
  /**
   * シナリオ AC-7 (spec.md AC-7 / D-008 / REQ-4):
   *   Given 影響範囲表で variant=--ghost と確定された 8 button を render / readFileSync する
   *   When  className を確認する
   *   Then  全 button に "button button--ghost" を含む
   *
   *   D-008 確定の 8 件:
   *     TrashView           : 復元
   *     SettingsView        : mode 切替
   *     SetupView           : ローカルモードで使う
   *     ProjectCreateDialog : キャンセル
   *     PwaUpdateBanner     : 閉じる
   *     ErrorNotification   : ×
   *     ConflictDialog      : クライアントの値で再送
   *     (合計 7 件. D-008 表記の 8 件目は「内訳の計 8 件は影響範囲表参照」とあり,
   *      ConflictDialog の補助 1 件 + 上記 6 件 = 7 件が実出現. 7 件で網羅 + D-001 で
   *      ErrorNotification × を --ghost に含めて合計 7 件. 本テストは 7 件を assert.
   *      ※ D-008 の「8 件」は集計差分 (= 内訳合算が 7) の可能性があるが,
   *         影響範囲表 / D-008 列挙の actual 出現は 7. 念のため全 7 件を assert する.)
   */
  describe("AC-7: 補助 / キャンセル button が --ghost variant を持つ (D-008)", () => {
    it("TrashView の「復元」 button が --ghost を持つ (ソース直読み)", () => {
      const src = readFileSync(TARGET_TSX_FILES.trashView, "utf-8");
      const cn = findButtonClassNameByLabel(src, "復元");
      expect(cn, "trash-view.tsx の「復元」 button が見つからない").not.toBeNull();
      expect(
        (cn ?? "").split(/\s+/).includes("button--ghost"),
        `trash-view.tsx の「復元」 button に "button--ghost" が無い (現値: "${cn}")`,
      ).toBe(true);
    });

    it("SettingsView の mode 切替 button が --ghost を持つ (ソース直読み)", () => {
      const src = readFileSync(TARGET_TSX_FILES.settingsView, "utf-8");
      const cn = findButtonClassNameByLabel(src, "モードへ切り替える");
      expect(cn, "settings-view.tsx の mode 切替 button が見つからない").not.toBeNull();
      expect(
        (cn ?? "").split(/\s+/).includes("button--ghost"),
        `settings-view.tsx の mode 切替 button に "button--ghost" が無い (現値: "${cn}")`,
      ).toBe(true);
    });

    it("SetupView の「ローカルモードで使う」 button が --ghost を持つ (ソース直読み)", () => {
      const src = readFileSync(TARGET_TSX_FILES.setupView, "utf-8");
      const cn = findButtonClassNameByLabel(src, "ローカルモードで使う");
      expect(cn, "setup-view.tsx の「ローカルモードで使う」 button が見つからない").not.toBeNull();
      expect(
        (cn ?? "").split(/\s+/).includes("button--ghost"),
        `setup-view.tsx の「ローカルモードで使う」 button に "button--ghost" が無い (現値: "${cn}")`,
      ).toBe(true);
    });

    it("ProjectCreateDialog の「キャンセル」 button が --ghost を持つ (ソース直読み)", () => {
      const src = readFileSync(TARGET_TSX_FILES.projectCreateDialog, "utf-8");
      const cn = findButtonClassNameByLabel(src, "キャンセル");
      expect(cn, "project-create-dialog.tsx の「キャンセル」 button が見つからない").not.toBeNull();
      expect(
        (cn ?? "").split(/\s+/).includes("button--ghost"),
        `project-create-dialog.tsx の「キャンセル」 button に "button--ghost" が無い (現値: "${cn}")`,
      ).toBe(true);
    });

    it("PwaUpdateBanner の「閉じる」 button が --ghost を持つ (ソース直読み)", () => {
      const src = readFileSync(TARGET_TSX_FILES.pwaUpdateBanner, "utf-8");
      const cn = findButtonClassNameByLabel(src, "閉じる");
      expect(cn, "pwa-update-banner.tsx の「閉じる」 button が見つからない").not.toBeNull();
      expect(
        (cn ?? "").split(/\s+/).includes("button--ghost"),
        `pwa-update-banner.tsx の「閉じる」 button に "button--ghost" が無い (現値: "${cn}")`,
      ).toBe(true);
    });

    it("ErrorNotification の × button が --ghost を持つ (D-001 / ソース直読み)", () => {
      const src = readFileSync(TARGET_TSX_FILES.errorNotification, "utf-8");
      const cn = findButtonClassNameByLabel(src, "×");
      expect(cn, "error-notification.tsx の × button が見つからない").not.toBeNull();
      expect(
        (cn ?? "").split(/\s+/).includes("button--ghost"),
        `error-notification.tsx の × button に "button--ghost" が無い (D-001 違反 / 現値: "${cn}")`,
      ).toBe(true);
    });

    it("ConflictDialog の「クライアントの値で再送」 button が --ghost を持つ", async () => {
      const { ConflictDialog } = await importConflictDialog();
      const { container } = render(
        <ConflictDialog
          open
          localValue={{ name: "ローカル" }}
          serverValue={{ name: "サーバ" }}
          onAcceptServer={() => {}}
          onRetryWithServer={() => {}}
        />,
      );
      const btn = Array.from(container.querySelectorAll("button")).find(
        (b) => (b.textContent ?? "").trim() === "クライアントの値で再送",
      );
      expect(btn, "ConflictDialog の「クライアントの値で再送」 button が無い").toBeDefined();
      expect(
        btn?.className.split(/\s+/).includes("button--ghost"),
        'ConflictDialog の「クライアントの値で再送」 button に "button--ghost" が無い (D-008 違反)',
      ).toBe(true);
    });
  });

  // ============================================================
  // AC-8: 既存配置制御 className が併記される (REQ-5 / D-009)
  // ============================================================
  /**
   * シナリオ AC-8 (spec.md AC-8 / REQ-5 / D-009):
   *   Given 配置制御 className を持つ button を render する
   *   When  className を確認する
   *   Then  "button" と既存配置制御 className の両方を含む
   */
  describe("AC-8: 既存配置制御 className が併記される (REQ-5 / D-009)", () => {
    it('TaskCard の「削除」 button が "button" と "task-card__actions__delete" の両方を含む', async () => {
      const { TaskCard } = await importTaskCard();
      const { container } = render(
        <TaskCard
          task={makeTask({ origin: "manual" })}
          project={null}
          showPriority={false}
          actionSet="minimal"
          onDelete={() => {}}
          onComplete={() => {}}
          onNameBlur={() => {}}
        />,
      );
      const btn = Array.from(container.querySelectorAll("button")).find(
        (b) => (b.textContent ?? "").trim() === "削除",
      );
      const classes = btn?.className.split(/\s+/) ?? [];
      expect(classes, 'TaskCard 削除 button に "button" が無い').toContain("button");
      expect(
        classes,
        'TaskCard 削除 button に "task-card__actions__delete" が無い (REQ-5 違反)',
      ).toContain("task-card__actions__delete");
    });

    it('TaskCard の「完了」 button が "button" と "task-card__actions__complete" の両方を含む', async () => {
      const { TaskCard } = await importTaskCard();
      const { container } = render(
        <TaskCard
          task={makeTask({ origin: "manual" })}
          project={null}
          showPriority={false}
          actionSet="minimal"
          onDelete={() => {}}
          onComplete={() => {}}
          onNameBlur={() => {}}
        />,
      );
      const btn = Array.from(container.querySelectorAll("button")).find(
        (b) => (b.textContent ?? "").trim() === "完了",
      );
      const classes = btn?.className.split(/\s+/) ?? [];
      expect(classes, 'TaskCard 完了 button に "button" が無い').toContain("button");
      expect(
        classes,
        'TaskCard 完了 button に "task-card__actions__complete" が無い (REQ-5 違反)',
      ).toContain("task-card__actions__complete");
    });

    it('ProjectCard の「削除」 button が "button" と "project-card__actions__delete" の両方を含む', async () => {
      const { ProjectCard } = await importProjectCard();
      const { container } = render(
        <ProjectCard project={makeProject()} onNameBlur={() => {}} onDelete={() => {}} />,
      );
      const btn = Array.from(container.querySelectorAll("button")).find(
        (b) => (b.textContent ?? "").trim() === "削除",
      );
      const classes = btn?.className.split(/\s+/) ?? [];
      expect(classes, 'ProjectCard 削除 button に "button" が無い').toContain("button");
      expect(
        classes,
        'ProjectCard 削除 button に "project-card__actions__delete" が無い (REQ-5 違反)',
      ).toContain("project-card__actions__delete");
    });

    it('ProjectFormCard の「追加」 button が "button" と "project-card__submit" の両方を含む', async () => {
      const { ProjectFormCard } = await importProjectFormCard();
      const { container } = render(
        <ProjectFormCard
          name=""
          onNameChange={() => {}}
          onSubmit={(e: React.FormEvent) => e.preventDefault()}
        />,
      );
      const btn = Array.from(container.querySelectorAll("button")).find(
        (b) => (b.textContent ?? "").trim() === "追加",
      );
      const classes = btn?.className.split(/\s+/) ?? [];
      expect(classes, 'ProjectFormCard 追加 button に "button" が無い').toContain("button");
      expect(
        classes,
        'ProjectFormCard 追加 button に "project-card__submit" が無い (REQ-5 違反)',
      ).toContain("project-card__submit");
    });

    it('RoutineCard の「削除」 button が "button" と "routine-card__actions__delete" の両方を含む', async () => {
      const { RoutineCard } = await importRoutineCard();
      const { container } = render(
        <RoutineCard
          routine={makeRoutine()}
          onNameBlur={() => {}}
          onDaysOfWeekChange={() => {}}
          onDefaultPriorityChange={() => {}}
          onDelete={() => {}}
        />,
      );
      const btn = Array.from(container.querySelectorAll("button")).find(
        (b) => (b.textContent ?? "").trim() === "削除",
      );
      const classes = btn?.className.split(/\s+/) ?? [];
      expect(classes, 'RoutineCard 削除 button に "button" が無い').toContain("button");
      expect(
        classes,
        'RoutineCard 削除 button に "routine-card__actions__delete" が無い (REQ-5 違反)',
      ).toContain("routine-card__actions__delete");
    });

    it('RoutineFormCard の「追加」 button が "button" と "routine-card__submit" の両方を含む', async () => {
      const { RoutineFormCard } = await importRoutineFormCard();
      const { container } = render(
        <RoutineFormCard
          name=""
          onNameChange={() => {}}
          daysOfWeek={[]}
          onToggleDay={() => {}}
          defaultPriority="normal"
          onDefaultPriorityChange={() => {}}
          onSubmit={(e: React.FormEvent) => e.preventDefault()}
        />,
      );
      const btn = Array.from(container.querySelectorAll("button")).find(
        (b) => (b.textContent ?? "").trim() === "追加",
      );
      const classes = btn?.className.split(/\s+/) ?? [];
      expect(classes, 'RoutineFormCard 追加 button に "button" が無い').toContain("button");
      expect(
        classes,
        'RoutineFormCard 追加 button に "routine-card__submit" が無い (REQ-5 違反)',
      ).toContain("routine-card__submit");
    });
  });

  // ============================================================
  // AC-9: PriorityStars の ★/☆ には .button が付与されない (S-1 / 対象外)
  // ============================================================
  /**
   * シナリオ AC-9 (spec.md AC-9 / S-1 / REQ-9):
   *   Given <PriorityStars /> を render する
   *   When  各 star button の className を確認する
   *   Then  どれも className に "button" を含まない (= 既存の "priority-stars__star" のみ)
   */
  describe("AC-9: PriorityStars の ★/☆ には .button が付与されない (S-1 / 対象外)", () => {
    it('PriorityStars の 3 つの star button が "button" を含まない (priority-stars__star のみ保持)', async () => {
      const { PriorityStars } = await importPriorityStars();
      const { container } = render(
        <PriorityStars value="normal" onChange={() => {}} groupLabel="優先度" idPrefix="ut" />,
      );
      const stars = Array.from(container.querySelectorAll("button"));
      expect(stars.length, "PriorityStars の button が 3 個ではない").toBe(3);
      for (const star of stars) {
        const classes = star.className.split(/\s+/);
        expect(
          classes.includes("button"),
          'priority-stars__star に "button" が付与されている (S-1 / REQ-9 違反)',
        ).toBe(false);
        expect(
          classes.includes("priority-stars__star"),
          "priority-stars__star クラスが消失している",
        ).toBe(true);
      }
    });
  });

  // ============================================================
  // AC-10: AppShell の hamburger / 閉じる button には .button が付与されない (S-2 / S-3 / 対象外)
  // ============================================================
  /**
   * シナリオ AC-10 (spec.md AC-10 / S-2 / S-3 / REQ-9):
   *   Given app-shell.tsx を読み取る (BrowserRouter 依存のため readFileSync で検証)
   *   When  app-shell__hamburger / app-shell__menu-close を含む button タグの className を確認する
   *   Then  どちらの className 文字列にも "button" 単独トークンが含まれない
   */
  describe("AC-10: AppShell の hamburger / 閉じる button には .button が付与されない (S-2 / S-3 / 対象外)", () => {
    it('app-shell.tsx の hamburger button の className 文字列に "button" トークンが含まれない', () => {
      const src = readFileSync(TARGET_TSX_FILES.appShell, "utf-8");
      // hamburger は className に `app-shell__hamburger${menuOpen ? " app-shell__hamburger--hidden" : ""}` のテンプレート.
      // 文字列リテラル部分 (= " app-shell__hamburger--hidden" / "app-shell__hamburger") に "button" 単独語が含まれないことを確認.
      // 直接的には, "button" の前後がアルファベット境界 (= 単独トークン) でないことを確認.
      // 簡便には: ソース上で hamburger テンプレート全体が "button" を単独単語として含まないことを assert.
      const hamburgerRe = /className=\{`app-shell__hamburger\$\{[^}]*\}`\}/;
      const m = src.match(hamburgerRe);
      expect(m, "app-shell.tsx の hamburger className テンプレートが見つからない").not.toBeNull();
      const tmpl = m?.[0] ?? "";
      // テンプレートリテラル内に独立した "button " / " button" / "button\"" / "\"button" 等が混入しないこと.
      // 「app-shell__hamburger」「app-shell__hamburger--hidden」は OK (= button という独立トークンを含まない).
      expect(
        /\bbutton\b/.test(tmpl),
        'app-shell.tsx の hamburger className に "button" トークンが混入している (S-2 違反)',
      ).toBe(false);
    });

    it('app-shell.tsx の app-shell__menu-close button の className に "button" トークンが含まれない', () => {
      const src = readFileSync(TARGET_TSX_FILES.appShell, "utf-8");
      // menu-close は `className="app-shell__menu-close"` リテラル.
      const closeRe = /className="app-shell__menu-close[^"]*"/;
      const m = src.match(closeRe);
      expect(m, "app-shell.tsx の menu-close className が見つからない").not.toBeNull();
      const cn = m?.[0]?.replace(/^className="/, "").replace(/"$/, "") ?? "";
      expect(
        cn.split(/\s+/).includes("button"),
        `app-shell.tsx の menu-close className に "button" が付与されている (S-3 違反 / 現値: "${cn}")`,
      ).toBe(false);
    });
  });

  // ============================================================
  // AC-11: 既存 button の機能が回帰しない (onClick / disabled)
  // ============================================================
  /**
   * シナリオ AC-11 (spec.md AC-11 / REQ-8):
   *   Given 影響範囲表「対象」の代表 button (TaskCard 削除 / ProjectFormCard 追加) を render する
   *   When  ユーザが click する
   *   Then  onClick / onSubmit が呼ばれる (= 機能差分なし)
   *
   *   disabled の視覚差分は CSS 直読みで AC-1 (button:disabled ルール存在) として担保済み.
   *   ここではランタイム挙動として click → onClick が依然として呼ばれることを最小限 assert する.
   */
  describe("AC-11: 既存 button の機能が回帰しない (onClick / disabled)", () => {
    it("TaskCard 削除 button の click で onDelete が呼ばれる (機能回帰なし)", async () => {
      const { TaskCard } = await importTaskCard();
      const onDelete = vi.fn();
      const { container } = render(
        <TaskCard
          task={makeTask({ origin: "manual" })}
          project={null}
          showPriority={false}
          actionSet="minimal"
          onDelete={onDelete}
          onComplete={() => {}}
          onNameBlur={() => {}}
        />,
      );
      const btn = Array.from(container.querySelectorAll("button")).find(
        (b) => (b.textContent ?? "").trim() === "削除",
      );
      expect(btn, "TaskCard 削除 button が無い").toBeDefined();
      btn?.click();
      expect(onDelete).toHaveBeenCalledTimes(1);
    });

    it("ProjectFormCard 追加 button の click で onSubmit が呼ばれる (機能回帰なし)", async () => {
      const { ProjectFormCard } = await importProjectFormCard();
      const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
      const { container } = render(
        <ProjectFormCard name="新規" onNameChange={() => {}} onSubmit={onSubmit} />,
      );
      const btn = Array.from(container.querySelectorAll("button")).find(
        (b) => (b.textContent ?? "").trim() === "追加",
      );
      expect(btn, "ProjectFormCard 追加 button が無い").toBeDefined();
      const form = container.querySelector("form") as HTMLFormElement | null;
      expect(form, "ProjectFormCard form が無い").not.toBeNull();
      // type="submit" の click は form submit を発火する.
      fireEvent.submit(form as HTMLFormElement);
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });
  });

  // ============================================================
  // AC-12: project-create-dialog.css の button 視覚 (padding) 撤去 + focus-visible 撤去
  // ============================================================
  /**
   * シナリオ AC-12 (spec.md AC-12 / REQ-7 / I-16 / D-002):
   *   Given web/src/ui/project-create-dialog/project-create-dialog.css を読み取る
   *   When  ".project-create-dialog button" ルールを確認する
   *   Then  padding 宣言が含まれない (= .button 基底に集約)
   *    かつ ".project-create-dialog button:focus-visible" ルールが含まれない (= .button:focus-visible に集約 / D-002)
   *    かつ "min-height: 44px" は維持されている (= a11y 制約 / D-005)
   */
  describe("AC-12: project-create-dialog.css の button 視覚を直接上書きする宣言が撤去される", () => {
    it(".project-create-dialog button ルール本文に padding 宣言が含まれない (I-16)", () => {
      const css = readFileSync(projectCreateDialogCssPath, "utf-8");
      const body = extractRuleBody(css, ".project-create-dialog button");
      // ルール自体が完全撤去されている場合 (= padding ごと不在) も OK.
      if (body === null) {
        // ルールごと撤去されている場合は a11y の min-height 維持を別の仕方で担保する想定だが,
        // D-005 では「dialog 内 button のみ min-height: 44px を view CSS 側で維持」とあるため,
        // ルール自体が残存し min-height のみ含むことが期待される.
        // 一旦, 撤去でも green と扱う (= 後段の min-height assert で実態を担保).
        return;
      }
      expect(
        body,
        ".project-create-dialog button ルール本文に padding 宣言が残存 (REQ-7 / I-16 違反)",
      ).not.toMatch(/(?:^|;|\n|\s)padding\s*:/);
    });

    it('.project-create-dialog button ルール本文に border / border-radius / background / color / cursor の "視覚" 宣言が含まれない (REQ-7)', () => {
      const css = readFileSync(projectCreateDialogCssPath, "utf-8");
      const body = extractRuleBody(css, ".project-create-dialog button");
      if (body === null) return; // ルール撤去なら OK.
      expect(body, ".project-create-dialog button に border 宣言が残存 (REQ-7 違反)").not.toMatch(
        /(?:^|;|\n|\s)border\s*:/,
      );
      expect(
        body,
        ".project-create-dialog button に border-radius 宣言が残存 (REQ-7 違反)",
      ).not.toMatch(/(?:^|;|\n|\s)border-radius\s*:/);
      expect(
        body,
        ".project-create-dialog button に background 宣言が残存 (REQ-7 違反)",
      ).not.toMatch(/(?:^|;|\n|\s)background(?:-color)?\s*:/);
      expect(body, ".project-create-dialog button に color 宣言が残存 (REQ-7 違反)").not.toMatch(
        /(?:^|;|\n|\s)color\s*:/,
      );
      expect(body, ".project-create-dialog button に cursor 宣言が残存 (REQ-7 違反)").not.toMatch(
        /(?:^|;|\n|\s)cursor\s*:/,
      );
    });

    it(".project-create-dialog button:focus-visible ルールが撤去されている (D-002 / I-16)", () => {
      const css = readFileSync(projectCreateDialogCssPath, "utf-8");
      // セレクタが ".project-create-dialog button:focus-visible," (カンマ区切り) で他セレクタと
      // 共有されている可能性があるため, 単純な extractRuleBody だけでなくセレクタ存在も確認.
      const hasSelector = /\.project-create-dialog\s+button:focus-visible[\s,{]/.test(css);
      expect(
        hasSelector,
        ".project-create-dialog button:focus-visible セレクタが残存 (D-002 違反 / .button:focus-visible に集約されるべき)",
      ).toBe(false);
    });

    it(".project-create-dialog button ルール (もしくは別ルール) に min-height: 44px が維持されている (D-005)", () => {
      const css = readFileSync(projectCreateDialogCssPath, "utf-8");
      // どこかしらで min-height: 44px が宣言されていること (= a11y タップターゲット保証).
      expect(
        css,
        "project-create-dialog.css 全体から min-height: 44px が消失 (D-005 違反 / WCAG 2.5.5)",
      ).toMatch(/min-height\s*:\s*44px/);
    });
  });
});
