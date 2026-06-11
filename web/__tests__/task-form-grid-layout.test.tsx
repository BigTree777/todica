// @vitest-environment jsdom

/**
 * 起票フォームのレイアウト 2D グリッド化 (BL-058 / task-form-grid-layout) 受け入れ基準テスト.
 *
 * 仕様参照:
 *   docs/developer/features/task-form-grid-layout/spec.md
 *   docs/developer/features/task-form-grid-layout/plan.md
 *   docs/developer/features/task-form-grid-layout/tasks.md
 *
 * 本ファイルが検証する受け入れ基準:
 *   AC-1: .day-view__form が CSS Grid layout に変更されている (display: grid / flex-direction なし).
 *   AC-2: .day-view__form に grid-template-areas が定義されている (3 行).
 *   AC-3: .day-view__form に grid-template-columns: 1fr auto が定義されている.
 *   AC-4: .day-view__form の gap が var(--space-md) に引き上げられている.
 *   AC-5: BL-054 で確定した visual 4 宣言が保持されている.
 *   AC-6: 各子要素に grid-area が割り当てられている (CSS クラス経由).
 *   AC-7: 「追加」ボタンが右寄せ配置されている (justify-self: end).
 *   AC-8: today-view JSX にヘルプラベル「↑タップで選択」が存在する.
 *   AC-9: tomorrow-view JSX にヘルプラベル「↑タップで選択」が存在する.
 *   AC-10: タスク名 label/input の関連付けが保持されている.
 *   AC-11: PriorityStars / ProjectToggle コンポーネントの prop API が無改修である.
 *   AC-12: tokens.css を変更していない (--space-md / --space-sm が定義され続けている).
 *   AC-13: focus-view を変更していない (.day-view__form 系セレクタが混入しない).
 *   AC-14: .day-view__card / .project-chip 系を変更していない (BL-052 / BL-056 / BL-057 保持).
 *   AC-18: hover / transition / animation / box-shadow が追加されていない.
 *
 * AC-15 (既存単体テスト全件 green) / AC-16 (既存 E2E 全件 green) / AC-17 (a11y violations 0)
 * は本ファイルでは個別アサートを置かず, ルート `npm test` / `npx playwright test` の
 * 継続実行で担保する.
 *
 * 本ファイルは TDD の "red" を作るためのテスト.
 *   - 実装前 (= day-view.css が `display: flex` / `flex-direction: column` /
 *     `gap: var(--space-sm)` のままで, 新規 5 子クラスも未定義) では,
 *     AC-1 / AC-2 / AC-3 / AC-4 / AC-6 / AC-7 / AC-8 / AC-9 が失敗する.
 *   - 既存ファイル不変性系 (AC-5 / AC-10 / AC-11 / AC-12 / AC-13 / AC-14 / AC-18) は
 *     原則 green である.
 *   - implementer が REQ-1〜REQ-10 を実装することで red 群が green 化する.
 *
 * 検証スタイル:
 *   - CSS 直読み: BL-052 (task-card-design.test.ts) / BL-054 (form-card-design.test.ts) /
 *     BL-057 (task-card-zone-layout.test.tsx) と同じ `readFileSync` + `extractRuleBody`
 *     パターン (P-005). ヘルパは本ファイル内に再定義する.
 *   - DOM レンダ: BL-057 (task-card-zone-layout.test.tsx) と同じ `QueryClientProvider` +
 *     `render` パターン.
 *
 * vitest-environment:
 *   CSS 直読み AC は node でも動くが, DOM レンダ AC (AC-8 / AC-9 / AC-10) は jsdom 必須.
 *   1 ファイル全体を jsdom で動かす (readFileSync は jsdom 環境でも問題なく動く / P-005).
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import type { Task } from "@todica/domain/task";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import type { Project, ProjectRepository } from "../src/repositories/project-repository.js";
import type {
  CompleteTaskCommand,
  Counter,
  CreateTaskCommand,
  DeleteTaskCommand,
  FocusSelection,
  SetFocusCommand,
  TaskRepository,
  UpdateTaskCommand,
} from "../src/repositories/task-repository.js";
import { TodayView } from "../src/ui/today-view/today-view.js";
import { TomorrowView } from "../src/ui/tomorrow-view/tomorrow-view.js";

// ============================================================
// 共通定数 / パス解決
// ============================================================

const repoRoot = resolve(__dirname, "../..");
const webSrcRoot = resolve(repoRoot, "web/src");
const dayViewCssPath = resolve(webSrcRoot, "ui/day-view/day-view.css");
const tokensCssPath = resolve(webSrcRoot, "styles/tokens.css");
const focusViewCssPath = resolve(webSrcRoot, "ui/focus-view/focus-view.css");
const focusViewTsxPath = resolve(webSrcRoot, "ui/focus-view/focus-view.tsx");
const priorityStarsTsxPath = resolve(webSrcRoot, "ui/priority-stars/priority-stars.tsx");
const projectToggleTsxPath = resolve(webSrcRoot, "ui/project-toggle/project-toggle.tsx");

const NOW = "2026-06-11T09:00:00.000Z";
const HINT_TEXT = "↑タップで選択";

// ============================================================
// CSS ルール本文の抽出ヘルパ (P-005 / BL-052 / BL-054 / BL-056 / BL-057 と同形式)
// ============================================================

/**
 * 指定したセレクタの「ルール本文 (= {} で囲まれた中身)」を抽出する.
 *
 * 単純な /selector\s*\{([^}]*)\}/ では `.day-view__form` が
 * `.day-view__form__project` 等の prefix にも一致してしまうため,
 * セレクタ末尾を `{` / 空白で厳密に区切る.
 *
 * BL-052 / BL-054 / BL-056 / BL-057 に存在する同等実装を再定義する (P-005).
 */
function extractRuleBody(css: string, selector: string): string | null {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // セレクタの直後が空白 + `{` であるルールに限定する.
  const re = new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`, "m");
  const m = css.match(re);
  return m?.[1] ?? null;
}

// ============================================================
// DOM レンダテスト用ヘルパ (task-card-zone-layout.test.tsx から最小コピー)
// ============================================================

function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: Number.POSITIVE_INFINITY,
        retry: false,
        networkMode: "offlineFirst",
      },
      mutations: {
        retry: false,
        networkMode: "offlineFirst",
      },
    },
  });
}

function renderWithQueryClient(ui: ReactNode): ReturnType<typeof render> {
  const queryClient = createTestQueryClient();
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

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

function makeMockProjectRepository(initial: Project[] = []): ProjectRepository {
  const state = [...initial];
  return {
    list: vi.fn(async (): Promise<Project[]> => [...state]),
    create: vi.fn(async (cmd: { id: string; name: string }): Promise<Project> => {
      const p: Project = {
        id: cmd.id,
        name: cmd.name,
        version: 1,
        createdAt: NOW,
        updatedAt: NOW,
      };
      state.push(p);
      return p;
    }),
    update: vi.fn(async () => {
      throw new Error("not used in task-form-grid-layout test");
    }),
    delete: vi.fn(async () => {
      /* not used */
    }),
  };
}

function makeMockRepository(
  initial: Task[] = [],
  options: {
    initialFocus?: FocusSelection;
    initialCounter?: Counter;
  } = {},
): TaskRepository {
  const state = [...initial];
  let focusState: FocusSelection = options.initialFocus ?? {
    id: "singleton",
    currentTaskId: null,
    version: 1,
    updatedAt: NOW,
  };
  let counterState: Counter = options.initialCounter ?? {
    id: "singleton",
    completedCount: 0,
    lastResetExecutedAt: null,
    version: 1,
    updatedAt: NOW,
  };
  const PRIORITY_ORDER_LOCAL: Record<string, number> = {
    highest: 0,
    normal: 1,
    later: 2,
  };
  const sortTasks = (tasks: Task[]): Task[] =>
    [...tasks].sort((a, b) => {
      const p = (PRIORITY_ORDER_LOCAL[a.priority] ?? 99) - (PRIORITY_ORDER_LOCAL[b.priority] ?? 99);
      if (p !== 0) return p;
      const c = a.createdAt.localeCompare(b.createdAt);
      if (c !== 0) return c;
      return a.id.localeCompare(b.id);
    });

  return {
    list: vi.fn(async (filter?: { dueDate?: "today" | "tomorrow" }): Promise<Task[]> => {
      const filtered = state.filter((t) => {
        if (t.trashedAt !== null) return false;
        if (filter?.dueDate && t.dueDate !== filter.dueDate) return false;
        return true;
      });
      return sortTasks(filtered);
    }),
    today: vi.fn(async () => {
      const filtered = state.filter((t) => t.dueDate === "today" && t.trashedAt === null);
      const sorted = sortTasks(filtered);
      return {
        tasks: sorted,
        nextTaskId: sorted[0]?.id ?? null,
        currentTaskId: focusState.currentTaskId,
        completionCount: counterState.completedCount,
      };
    }),
    create: vi.fn(async (cmd: CreateTaskCommand) => {
      const t = makeTask({
        id: cmd.id,
        name: cmd.name,
        projectId: cmd.projectId ?? null,
        dueDate: cmd.dueDate ?? "today",
        ...(cmd.priority !== undefined ? { priority: cmd.priority } : {}),
      });
      state.push(t);
      return t;
    }),
    update: vi.fn(async (cmd: UpdateTaskCommand) => {
      const idx = state.findIndex((t) => t.id === cmd.id);
      if (idx < 0) throw new Error("not found");
      const next: Task = {
        ...state[idx]!,
        ...cmd.patch,
        version: (state[idx]?.version ?? 0) + 1,
      };
      state[idx] = next;
      return next;
    }),
    delete: vi.fn(async (cmd: DeleteTaskCommand) => {
      const idx = state.findIndex((t) => t.id === cmd.id);
      if (idx >= 0) state.splice(idx, 1);
    }),
    complete: vi.fn(async (cmd: CompleteTaskCommand) => {
      const idx = state.findIndex((t) => t.id === cmd.id);
      if (idx < 0) throw new Error("not found");
      const prev = state[idx]!;
      const wasActive = prev.trashedAt === null;
      const next: Task = {
        ...prev,
        trashedAt: "2026-06-11T09:00:01.000Z",
        trashedReason: "completed",
        version: (prev.version ?? 0) + 1,
      };
      state[idx] = next;
      if (wasActive) {
        counterState = {
          ...counterState,
          completedCount: counterState.completedCount + 1,
          version: counterState.version + 1,
          updatedAt: NOW,
        };
      }
      return next;
    }),
    getFocus: vi.fn(async () => ({ ...focusState })),
    setFocus: vi.fn(async (cmd: SetFocusCommand) => {
      focusState = {
        ...focusState,
        currentTaskId: cmd.taskId,
        version: focusState.version + 1,
        updatedAt: NOW,
      };
      return { ...focusState };
    }),
    getCounter: vi.fn(async () => ({ ...counterState })),
  };
}

// ============================================================
// describe ブロック
// ============================================================

describe("起票フォームのレイアウト 2D グリッド化 (BL-058 / task-form-grid-layout)", () => {
  // ----------------------------------------------------------
  // AC-1: .day-view__form が CSS Grid layout に変更されている
  // ----------------------------------------------------------
  /**
   * シナリオ AC-1:
   *   Given web/src/ui/day-view/day-view.css を開いた
   *   When  .day-view__form セレクタのルール本文を観察する
   *   Then  display: grid の宣言を含む
   *    かつ flex-direction の宣言を含まない
   */
  describe("AC-1: .day-view__form が CSS Grid layout に変更されている", () => {
    it("day-view.css が存在する", () => {
      expect(existsSync(dayViewCssPath)).toBe(true);
    });

    it(".day-view__form ルール本文に display: grid を含む (本 BL の核 / REQ-1)", () => {
      const css = readFileSync(dayViewCssPath, "utf-8");
      const body = extractRuleBody(css, ".day-view__form");
      expect(body, ".day-view__form ルールが見つからない").not.toBeNull();
      expect(body ?? "").toMatch(/display\s*:\s*grid/);
    });

    it(".day-view__form ルール本文に display: flex を含まない (本 BL で flex → grid に置換)", () => {
      const css = readFileSync(dayViewCssPath, "utf-8");
      const body = extractRuleBody(css, ".day-view__form");
      expect(body, ".day-view__form ルールが見つからない").not.toBeNull();
      expect(body ?? "").not.toMatch(/display\s*:\s*flex/);
    });

    it(".day-view__form ルール本文に flex-direction 宣言を含まない (grid layout には不要 / REQ-1)", () => {
      const css = readFileSync(dayViewCssPath, "utf-8");
      const body = extractRuleBody(css, ".day-view__form");
      expect(body, ".day-view__form ルールが見つからない").not.toBeNull();
      expect(body ?? "").not.toMatch(/(?:^|;|\n)\s*flex-direction\s*:/);
    });
  });

  // ----------------------------------------------------------
  // AC-2: .day-view__form に grid-template-areas が定義されている
  // ----------------------------------------------------------
  /**
   * シナリオ AC-2:
   *   Given web/src/ui/day-view/day-view.css を開いた
   *   When  .day-view__form セレクタのルール本文を観察する
   *   Then  grid-template-areas プロパティを宣言している
   *    かつ その値に "project priority" / "name name" / ". submit" の 3 行を含む
   */
  describe("AC-2: .day-view__form に grid-template-areas が定義されている (3 行 / D-001)", () => {
    it(".day-view__form ルール本文に grid-template-areas 宣言が存在する", () => {
      const css = readFileSync(dayViewCssPath, "utf-8");
      const body = extractRuleBody(css, ".day-view__form");
      expect(body, ".day-view__form ルールが見つからない").not.toBeNull();
      expect(body ?? "").toMatch(/(?:^|;|\n)\s*grid-template-areas\s*:/);
    });

    it('.day-view__form の grid-template-areas に "project priority" 行が含まれる', () => {
      const css = readFileSync(dayViewCssPath, "utf-8");
      const body = extractRuleBody(css, ".day-view__form");
      expect(body, ".day-view__form ルールが見つからない").not.toBeNull();
      // ダブルクオート / シングルクオート両対応, 内部の空白量にもある程度寛容.
      expect(body ?? "").toMatch(/["']\s*project\s+priority\s*["']/);
    });

    it('.day-view__form の grid-template-areas に "name name" 行が含まれる', () => {
      const css = readFileSync(dayViewCssPath, "utf-8");
      const body = extractRuleBody(css, ".day-view__form");
      expect(body, ".day-view__form ルールが見つからない").not.toBeNull();
      expect(body ?? "").toMatch(/["']\s*name\s+name\s*["']/);
    });

    it('.day-view__form の grid-template-areas に ". submit" 行が含まれる', () => {
      const css = readFileSync(dayViewCssPath, "utf-8");
      const body = extractRuleBody(css, ".day-view__form");
      expect(body, ".day-view__form ルールが見つからない").not.toBeNull();
      expect(body ?? "").toMatch(/["']\s*\.\s+submit\s*["']/);
    });
  });

  // ----------------------------------------------------------
  // AC-3: .day-view__form に grid-template-columns: 1fr auto が定義されている
  // ----------------------------------------------------------
  /**
   * シナリオ AC-3:
   *   Given web/src/ui/day-view/day-view.css を開いた
   *   When  .day-view__form セレクタのルール本文を観察する
   *   Then  grid-template-columns プロパティに 1fr auto を含む宣言を持つ
   */
  describe("AC-3: .day-view__form に grid-template-columns: 1fr auto が定義されている (D-001)", () => {
    it(".day-view__form ルール本文に grid-template-columns: 1fr auto を含む", () => {
      const css = readFileSync(dayViewCssPath, "utf-8");
      const body = extractRuleBody(css, ".day-view__form");
      expect(body, ".day-view__form ルールが見つからない").not.toBeNull();
      expect(body ?? "").toMatch(/grid-template-columns\s*:\s*1fr\s+auto/);
    });
  });

  // ----------------------------------------------------------
  // AC-4: .day-view__form の gap が var(--space-md) に引き上げられている
  // ----------------------------------------------------------
  /**
   * シナリオ AC-4:
   *   Given web/src/ui/day-view/day-view.css を開いた
   *   When  .day-view__form セレクタのルール本文を観察する
   *   Then  gap: var(--space-md) の宣言を含む
   *    かつ gap: var(--space-sm) の宣言を含まない
   */
  describe("AC-4: .day-view__form の gap が var(--space-md) に引き上げられている (D-006)", () => {
    it(".day-view__form ルール本文に gap: var(--space-md) を含む", () => {
      const css = readFileSync(dayViewCssPath, "utf-8");
      const body = extractRuleBody(css, ".day-view__form");
      expect(body, ".day-view__form ルールが見つからない").not.toBeNull();
      expect(body ?? "").toMatch(/(?:^|;|\n)\s*gap\s*:\s*var\(--space-md\)/);
    });

    it(".day-view__form ルール本文に gap: var(--space-sm) を含まない (本 BL で sm → md に置換)", () => {
      const css = readFileSync(dayViewCssPath, "utf-8");
      const body = extractRuleBody(css, ".day-view__form");
      expect(body, ".day-view__form ルールが見つからない").not.toBeNull();
      expect(body ?? "").not.toMatch(/(?:^|;|\n)\s*gap\s*:\s*var\(--space-sm\)/);
    });
  });

  // ----------------------------------------------------------
  // AC-5: BL-054 で確定した visual 4 宣言が保持されている
  // ----------------------------------------------------------
  /**
   * シナリオ AC-5:
   *   Given web/src/ui/day-view/day-view.css を開いた
   *   When  .day-view__form セレクタのルール本文を観察する
   *   Then  background: var(--color-bg) を含む
   *    かつ border: 1px solid var(--color-border) (または等価分解) を含む
   *    かつ border-radius: var(--radius-md) を含む
   *    かつ padding: var(--space-md) を含む
   */
  describe("AC-5: BL-054 で確定した visual 4 宣言が保持されている (NFR-BL054-PRESERVE / D-009)", () => {
    it(".day-view__form ルール本文に background: var(--color-bg) を含む", () => {
      const css = readFileSync(dayViewCssPath, "utf-8");
      const body = extractRuleBody(css, ".day-view__form");
      expect(body, ".day-view__form ルールが見つからない").not.toBeNull();
      expect(body ?? "").toMatch(/background(?:-color)?\s*:\s*var\(--color-bg\)/);
    });

    it(".day-view__form ルール本文に border: 1px solid var(--color-border) (または等価分解) を含む", () => {
      const css = readFileSync(dayViewCssPath, "utf-8");
      const body = extractRuleBody(css, ".day-view__form");
      expect(body, ".day-view__form ルールが見つからない").not.toBeNull();
      const bodyText = body ?? "";
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
      // gap: var(--space-md) と誤検知しないよう padding: で始まる宣言に限定する.
      expect(body ?? "").toMatch(/(?:^|;|\n)\s*padding\s*:\s*var\(--space-md\)/);
    });
  });

  // ----------------------------------------------------------
  // AC-6: 各子要素に grid-area が割り当てられている (CSS クラス経由)
  // ----------------------------------------------------------
  /**
   * シナリオ AC-6:
   *   Given web/src/ui/day-view/day-view.css を開いた
   *   When  .day-view__form__project / .day-view__form__priority / .day-view__form__name /
   *         .day-view__form__submit の各セレクタのルール本文を観察する
   *   Then  それぞれ grid-area: project / priority / name / submit の宣言を含む
   *
   * 加えて, plan P-002 / spec REQ-4 に従いヘルプラベル用クラス
   *   .day-view__form__priority-hint が day-view.css に定義されている.
   */
  describe("AC-6: 新規 5 子クラスに grid-area が割り当てられている (REQ-3)", () => {
    const CHILD_GRID_AREA_MAP = [
      [".day-view__form__project", "project"],
      [".day-view__form__priority", "priority"],
      [".day-view__form__name", "name"],
      [".day-view__form__submit", "submit"],
    ] as const;

    it.each(CHILD_GRID_AREA_MAP)("%s ルールに grid-area: %s 宣言が存在する", (selector, area) => {
      const css = readFileSync(dayViewCssPath, "utf-8");
      const body = extractRuleBody(css, selector);
      expect(body, `${selector} ルールが day-view.css に見つからない`).not.toBeNull();
      const re = new RegExp(`grid-area\\s*:\\s*${area}\\b`);
      expect(body ?? "", `${selector} に grid-area: ${area} が無い`).toMatch(re);
    });

    it(".day-view__form__priority-hint ルールが day-view.css に定義されている (REQ-4 / D-002)", () => {
      const css = readFileSync(dayViewCssPath, "utf-8");
      const body = extractRuleBody(css, ".day-view__form__priority-hint");
      expect(
        body,
        ".day-view__form__priority-hint ルールが day-view.css に見つからない",
      ).not.toBeNull();
    });
  });

  // ----------------------------------------------------------
  // AC-7: 「追加」ボタンが右寄せ配置されている (justify-self: end)
  // ----------------------------------------------------------
  /**
   * シナリオ AC-7:
   *   Given web/src/ui/day-view/day-view.css を開いた
   *   When  .day-view__form__submit セレクタのルール本文を観察する
   *   Then  justify-self: end の宣言を含む
   */
  describe("AC-7: 「追加」ボタンが右寄せ配置されている (D-005)", () => {
    it(".day-view__form__submit ルール本文に justify-self: end を含む", () => {
      const css = readFileSync(dayViewCssPath, "utf-8");
      const body = extractRuleBody(css, ".day-view__form__submit");
      expect(body, ".day-view__form__submit ルールが見つからない").not.toBeNull();
      expect(body ?? "").toMatch(/justify-self\s*:\s*end/);
    });
  });

  // ----------------------------------------------------------
  // AC-8: today-view JSX にヘルプラベル「↑タップで選択」が存在する
  // ----------------------------------------------------------
  /**
   * シナリオ AC-8:
   *   Given /today を render する
   *   When  起票フォーム内を観察する
   *   Then  テキスト「↑タップで選択」を含む要素が存在する
   *    かつ 該当要素は <PriorityStars /> と同じ grid-area: priority の
   *         親領域 (.day-view__form__priority) 内に配置されている
   */
  describe("AC-8: today-view の起票フォームにヘルプラベル「↑タップで選択」が存在する (REQ-4 / REQ-5)", () => {
    it("today-view の起票フォーム内に「↑タップで選択」テキストが存在する", async () => {
      const repo = makeMockRepository([]);
      const projectRepo = makeMockProjectRepository([]);
      renderWithQueryClient(<TodayView repository={repo} projectRepository={projectRepo} />);

      const form = await screen.findByRole("form", { name: "タスク起票フォーム" });
      const hint = within(form).queryByText(HINT_TEXT);
      expect(
        hint,
        `today-view の起票フォーム内に「${HINT_TEXT}」テキストが見つからない`,
      ).not.toBeNull();
    });

    it("today-view の「↑タップで選択」は .day-view__form__priority 内に配置されている (D-002 / P-003)", async () => {
      const repo = makeMockRepository([]);
      const projectRepo = makeMockProjectRepository([]);
      renderWithQueryClient(<TodayView repository={repo} projectRepository={projectRepo} />);

      const form = await screen.findByRole("form", { name: "タスク起票フォーム" });
      const hint = within(form).queryByText(HINT_TEXT);
      expect(hint, `today-view の起票フォーム内に「${HINT_TEXT}」が見つからない`).not.toBeNull();
      const priorityZone = hint?.closest(".day-view__form__priority");
      expect(
        priorityZone,
        "ヘルプラベルが .day-view__form__priority 内に配置されていない (D-002 違反)",
      ).not.toBeNull();
    });

    it("today-view の .day-view__form__priority 内に <PriorityStars /> (radiogroup) が同居している (D-002)", async () => {
      const repo = makeMockRepository([]);
      const projectRepo = makeMockProjectRepository([]);
      const { container } = renderWithQueryClient(
        <TodayView repository={repo} projectRepository={projectRepo} />,
      );

      const form = await screen.findByRole("form", { name: "タスク起票フォーム" });
      const priorityZone = form.querySelector(".day-view__form__priority");
      expect(priorityZone, ".day-view__form__priority が起票フォーム内に存在しない").not.toBeNull();
      // 起票フォームの <PriorityStars /> の radiogroup は accessibleName "優先度: 普通".
      const radiogroup = priorityZone?.querySelector('[role="radiogroup"]');
      expect(
        radiogroup,
        ".day-view__form__priority 内に <PriorityStars /> (radiogroup) が存在しない (D-002 違反)",
      ).not.toBeNull();
      // 念のため container 経由でも同じ起票フォームの priority zone が見えていることを確認.
      expect(container.querySelector(".day-view__form__priority")).not.toBeNull();
    });
  });

  // ----------------------------------------------------------
  // AC-9: tomorrow-view JSX にヘルプラベル「↑タップで選択」が存在する
  // ----------------------------------------------------------
  /**
   * シナリオ AC-9:
   *   Given /tomorrow を render する
   *   When  起票フォーム内を観察する
   *   Then  テキスト「↑タップで選択」を含む要素が存在する
   *    かつ 該当要素は <PriorityStars /> と同じ grid-area: priority の
   *         親領域 (.day-view__form__priority) 内に配置されている
   */
  describe("AC-9: tomorrow-view の起票フォームにヘルプラベル「↑タップで選択」が存在する (REQ-4 / REQ-6)", () => {
    it("tomorrow-view の起票フォーム内に「↑タップで選択」テキストが存在する", async () => {
      const repo = makeMockRepository([]);
      const projectRepo = makeMockProjectRepository([]);
      renderWithQueryClient(<TomorrowView repository={repo} projectRepository={projectRepo} />);

      const form = await screen.findByRole("form", { name: "明日のタスク起票フォーム" });
      const hint = within(form).queryByText(HINT_TEXT);
      expect(
        hint,
        `tomorrow-view の起票フォーム内に「${HINT_TEXT}」テキストが見つからない`,
      ).not.toBeNull();
    });

    it("tomorrow-view の「↑タップで選択」は .day-view__form__priority 内に配置されている (D-002 / P-003)", async () => {
      const repo = makeMockRepository([]);
      const projectRepo = makeMockProjectRepository([]);
      renderWithQueryClient(<TomorrowView repository={repo} projectRepository={projectRepo} />);

      const form = await screen.findByRole("form", { name: "明日のタスク起票フォーム" });
      const hint = within(form).queryByText(HINT_TEXT);
      expect(hint, `tomorrow-view の起票フォーム内に「${HINT_TEXT}」が見つからない`).not.toBeNull();
      const priorityZone = hint?.closest(".day-view__form__priority");
      expect(
        priorityZone,
        "ヘルプラベルが .day-view__form__priority 内に配置されていない (D-002 違反)",
      ).not.toBeNull();
    });

    it("tomorrow-view の .day-view__form__priority 内に <PriorityStars /> (radiogroup) が同居している (D-002)", async () => {
      const repo = makeMockRepository([]);
      const projectRepo = makeMockProjectRepository([]);
      renderWithQueryClient(<TomorrowView repository={repo} projectRepository={projectRepo} />);

      const form = await screen.findByRole("form", { name: "明日のタスク起票フォーム" });
      const priorityZone = form.querySelector(".day-view__form__priority");
      expect(priorityZone, ".day-view__form__priority が起票フォーム内に存在しない").not.toBeNull();
      const radiogroup = priorityZone?.querySelector('[role="radiogroup"]');
      expect(
        radiogroup,
        ".day-view__form__priority 内に <PriorityStars /> (radiogroup) が存在しない (D-002 違反)",
      ).not.toBeNull();
    });
  });

  // ----------------------------------------------------------
  // AC-10: タスク名 label/input の関連付けが保持されている
  // ----------------------------------------------------------
  /**
   * シナリオ AC-10:
   *   Given /today と /tomorrow を render する
   *   When  起票フォームを観察する
   *   Then  /today に <label htmlFor="task-name">タスク名</label> と <input id="task-name"> が共存
   *    かつ /tomorrow に <label htmlFor="tomorrow-task-name"> と <input id="tomorrow-task-name"> が共存
   *    かつ getByLabelText("タスク名") で input が取得可能 (テスト互換性)
   */
  describe("AC-10: タスク名 label/input の関連付けが保持されている (NFR-LABEL-PRESERVE / D-004)", () => {
    it("today-view で getByLabelText('タスク名') が <input id='task-name'> を返す", async () => {
      const repo = makeMockRepository([]);
      const projectRepo = makeMockProjectRepository([]);
      renderWithQueryClient(<TodayView repository={repo} projectRepository={projectRepo} />);

      const input = await screen.findByLabelText("タスク名");
      expect(input).toBeDefined();
      expect((input as HTMLElement).tagName.toLowerCase()).toBe("input");
      expect((input as HTMLInputElement).id).toBe("task-name");
    });

    it("tomorrow-view で getByLabelText('タスク名') が <input id='tomorrow-task-name'> を返す", async () => {
      const repo = makeMockRepository([]);
      const projectRepo = makeMockProjectRepository([]);
      renderWithQueryClient(<TomorrowView repository={repo} projectRepository={projectRepo} />);

      const input = await screen.findByLabelText("タスク名");
      expect(input).toBeDefined();
      expect((input as HTMLElement).tagName.toLowerCase()).toBe("input");
      expect((input as HTMLInputElement).id).toBe("tomorrow-task-name");
    });
  });

  // ----------------------------------------------------------
  // AC-11: PriorityStars / ProjectToggle コンポーネントの prop API が無改修である
  // ----------------------------------------------------------
  /**
   * シナリオ AC-11:
   *   Given priority-stars.tsx と project-toggle.tsx を開いた
   *   When  PriorityStarsProps と ProjectToggleProps の型定義を観察する
   *   Then  本 BL の前後で prop 名・型・必須性に差分が無い
   *
   * 検証粒度: CSS 直読みと同じ readFileSync + 文字列スポット (D-010).
   *   - `export interface PriorityStarsProps` の存在.
   *   - 4 prop 名 (value / onChange / idPrefix / groupLabel) の出現.
   *   - `export interface ProjectToggleProps` の存在.
   *   - 5 prop 名 (value / onChange / projects / idPrefix / groupLabel) の出現.
   */
  describe("AC-11: PriorityStars / ProjectToggle の prop API が無改修である (REQ-10 / D-010)", () => {
    it("priority-stars.tsx に `export interface PriorityStarsProps` が含まれる", () => {
      const tsx = readFileSync(priorityStarsTsxPath, "utf-8");
      expect(tsx).toMatch(/export\s+interface\s+PriorityStarsProps\b/);
    });

    it.each(["value", "onChange", "idPrefix", "groupLabel"])(
      "priority-stars.tsx に prop 名 '%s' が含まれる (BL-040 で確定)",
      (propName) => {
        const tsx = readFileSync(priorityStarsTsxPath, "utf-8");
        // PriorityStarsProps の interface 本文中に prop 名が出現することを確認.
        // 厳密な型 assert は型レベルで担保し, 本テストでは文字列スポットで十分.
        expect(tsx).toContain(propName);
      },
    );

    it("project-toggle.tsx に `export interface ProjectToggleProps` が含まれる", () => {
      const tsx = readFileSync(projectToggleTsxPath, "utf-8");
      expect(tsx).toMatch(/export\s+interface\s+ProjectToggleProps\b/);
    });

    it.each(["value", "onChange", "projects", "idPrefix", "groupLabel"])(
      "project-toggle.tsx に prop 名 '%s' が含まれる (BL-041 で確定)",
      (propName) => {
        const tsx = readFileSync(projectToggleTsxPath, "utf-8");
        expect(tsx).toContain(propName);
      },
    );

    it("priority-stars.tsx に role='radiogroup' が含まれる (内部 logic 無改修の軽量スポット)", () => {
      const tsx = readFileSync(priorityStarsTsxPath, "utf-8");
      // BL-040 plan D-002: radiogroup + 単一 aria-checked による a11y 設計を維持.
      expect(tsx).toContain('role="radiogroup"');
    });

    it("project-toggle.tsx に project-toggle__button クラスが含まれる (内部 class 名無改修)", () => {
      const tsx = readFileSync(projectToggleTsxPath, "utf-8");
      expect(tsx).toContain("project-toggle__button");
    });
  });

  // ----------------------------------------------------------
  // AC-12: tokens.css を変更していない
  // ----------------------------------------------------------
  /**
   * シナリオ AC-12:
   *   Given 本 BL の実装がマージされた
   *   When  web/src/styles/tokens.css を BL-057 完了時点の状態と比較する
   *   Then  差分が無い
   *    かつ 本 BL で参照する 2 トークン (--space-md / --space-sm) が引き続き定義されている
   */
  describe("AC-12: tokens.css が変更されていない (NFR-NO-NEW-TOKENS / G-5)", () => {
    it("tokens.css に本 BL で参照する 2 トークン (--space-md / --space-sm) が定義されている", () => {
      const css = readFileSync(tokensCssPath, "utf-8");
      expect(css).toMatch(/--space-md\s*:/);
      expect(css).toMatch(/--space-sm\s*:/);
    });

    it("tokens.css に本 BL では追加すべきでない --shadow-* トークンが存在しない (NFR-NO-SHADOW)", () => {
      const css = readFileSync(tokensCssPath, "utf-8");
      expect(css).not.toMatch(/--shadow-/);
    });
  });

  // ----------------------------------------------------------
  // AC-13: focus-view を変更していない
  // ----------------------------------------------------------
  /**
   * シナリオ AC-13:
   *   Given 本 BL の実装がマージされた
   *   When  web/src/ui/focus-view/focus-view.css と focus-view.tsx を観察する
   *   Then  .day-view__form 系セレクタが混入していない
   */
  describe("AC-13: focus-view が無改修である (REQ-9 / G-6 / R-004)", () => {
    it("focus-view.css に .day-view__form セレクタが含まれない", () => {
      const css = readFileSync(focusViewCssPath, "utf-8");
      expect(css).not.toContain(".day-view__form");
    });

    it.each([
      ".day-view__form__project",
      ".day-view__form__priority",
      ".day-view__form__priority-hint",
      ".day-view__form__name",
      ".day-view__form__submit",
    ])("focus-view.css に %s が含まれない (本 BL の新規クラスが漏洩していない)", (selector) => {
      const css = readFileSync(focusViewCssPath, "utf-8");
      expect(css).not.toContain(selector);
    });

    it("focus-view.tsx に day-view__form 系クラス文字列が含まれない", () => {
      const tsx = readFileSync(focusViewTsxPath, "utf-8");
      expect(tsx).not.toContain("day-view__form");
    });
  });

  // ----------------------------------------------------------
  // AC-14: .day-view__card / .project-chip 系を変更していない
  // ----------------------------------------------------------
  /**
   * シナリオ AC-14:
   *   Given web/src/ui/day-view/day-view.css を開いた
   *   When  .day-view__card / .day-view__card__header / .day-view__card__title /
   *         .day-view__card__actions / .day-view__card--focus / .project-chip
   *         の各セレクタのルール本文を観察する
   *   Then  BL-057 完了時点と同じ宣言のままで, 本 BL での追記・改変が無い
   */
  describe("AC-14: .day-view__card / .project-chip 系が無改修である (G-7 / BL-052 / BL-056 / BL-057 保持)", () => {
    it(".day-view__card ルール本文は BL-057 確定値のまま (flex column / radius-lg)", () => {
      const css = readFileSync(dayViewCssPath, "utf-8");
      const body = extractRuleBody(css, ".day-view__card");
      expect(body, ".day-view__card ルールが見つからない").not.toBeNull();
      const bodyText = body ?? "";
      expect(bodyText).toMatch(/display\s*:\s*flex/);
      expect(bodyText).toMatch(/flex-direction\s*:\s*column/);
      expect(bodyText).toMatch(/align-items\s*:\s*stretch/);
      expect(bodyText).toMatch(/gap\s*:\s*var\(--space-md\)/);
      expect(bodyText).toMatch(/background(?:-color)?\s*:\s*var\(--color-bg\)/);
      expect(bodyText).toMatch(/border\s*:\s*1px\s+solid\s+var\(--color-border\)/);
      expect(bodyText).toMatch(/border-radius\s*:\s*var\(--radius-lg\)/);
      expect(bodyText).toMatch(/(?:^|;|\n)\s*padding\s*:\s*var\(--space-md\)/);
    });

    it(".day-view__card__header ルール本文は BL-057 確定値のまま (display: flex / align-items / gap)", () => {
      const css = readFileSync(dayViewCssPath, "utf-8");
      const body = extractRuleBody(css, ".day-view__card__header");
      expect(body, ".day-view__card__header ルールが見つからない").not.toBeNull();
      const bodyText = body ?? "";
      expect(bodyText).toMatch(/display\s*:\s*flex/);
      expect(bodyText).toMatch(/align-items\s*:\s*center/);
      expect(bodyText).toMatch(/gap\s*:\s*var\(--space-sm\)/);
    });

    it(".day-view__card__title ルール本文は BL-057 確定値のまま (display: flex / justify-content: space-between)", () => {
      const css = readFileSync(dayViewCssPath, "utf-8");
      const body = extractRuleBody(css, ".day-view__card__title");
      expect(body, ".day-view__card__title ルールが見つからない").not.toBeNull();
      const bodyText = body ?? "";
      expect(bodyText).toMatch(/display\s*:\s*flex/);
      expect(bodyText).toMatch(/justify-content\s*:\s*space-between/);
    });

    it(".day-view__card__actions ルール本文は BL-057 確定値のまま (justify-content: flex-end / flex-wrap: wrap)", () => {
      const css = readFileSync(dayViewCssPath, "utf-8");
      const body = extractRuleBody(css, ".day-view__card__actions");
      expect(body, ".day-view__card__actions ルールが見つからない").not.toBeNull();
      const bodyText = body ?? "";
      expect(bodyText).toMatch(/display\s*:\s*flex/);
      expect(bodyText).toMatch(/justify-content\s*:\s*flex-end/);
      expect(bodyText).toMatch(/flex-wrap\s*:\s*wrap/);
    });

    it(".day-view__card--focus ルール本文は BL-052 確定値のまま (border-width: 2px / radius-lg / padding-lg)", () => {
      const css = readFileSync(dayViewCssPath, "utf-8");
      const body = extractRuleBody(css, ".day-view__card--focus");
      expect(body, ".day-view__card--focus ルールが見つからない").not.toBeNull();
      const bodyText = body ?? "";
      expect(bodyText).toMatch(/border-width\s*:\s*2px/);
      expect(bodyText).toMatch(/border-radius\s*:\s*var\(--radius-lg\)/);
      expect(bodyText).toMatch(/(?:^|;|\n)\s*padding\s*:\s*var\(--space-lg\)/);
    });

    it(".project-chip ルール本文は BL-056 確定値のまま (border / radius-lg / font-size-small)", () => {
      const css = readFileSync(dayViewCssPath, "utf-8");
      const body = extractRuleBody(css, ".project-chip");
      expect(body, ".project-chip ルールが見つからない").not.toBeNull();
      const bodyText = body ?? "";
      const hasBorderShorthand = /border\s*:\s*1px\s+solid\s+var\(--color-border\)/.test(bodyText);
      const hasBorderDecomposed =
        /border-width\s*:\s*1px/.test(bodyText) &&
        /border-style\s*:\s*solid/.test(bodyText) &&
        /border-color\s*:\s*var\(--color-border\)/.test(bodyText);
      expect(hasBorderShorthand || hasBorderDecomposed).toBe(true);
      expect(bodyText).toMatch(/border-radius\s*:\s*var\(--radius-lg\)/);
      expect(bodyText).toMatch(/font-size\s*:\s*var\(--font-size-small\)/);
    });
  });

  // ----------------------------------------------------------
  // AC-18: hover / transition / animation / box-shadow が追加されていない
  // ----------------------------------------------------------
  /**
   * シナリオ AC-18:
   *   Given web/src/ui/day-view/day-view.css を開いた
   *   When  .day-view__form 系セレクタ全般を観察する
   *   Then  box-shadow / transition / animation 宣言を含まない
   *    かつ .day-view__form:hover / .day-view__form:focus-within セレクタを定義していない
   */
  describe("AC-18: .day-view__form 系に hover / transition / animation / box-shadow が無い (NFR-NO-SHADOW / NFR-NO-HOVER-TRANSITION)", () => {
    const FORM_SELECTORS = [
      ".day-view__form",
      ".day-view__form__project",
      ".day-view__form__priority",
      ".day-view__form__priority-hint",
      ".day-view__form__name",
      ".day-view__form__submit",
    ] as const;

    it.each(FORM_SELECTORS)("%s ルール本文に box-shadow 宣言が含まれない", (selector) => {
      const css = readFileSync(dayViewCssPath, "utf-8");
      const body = extractRuleBody(css, selector);
      // 新規 5 子クラスは実装前は未定義 (null). null の場合は宣言があり得ないので skip.
      if (body === null) return;
      expect(body).not.toMatch(/(?:^|;|\n)\s*box-shadow\s*:/);
    });

    it.each(FORM_SELECTORS)("%s ルール本文に transition 宣言が含まれない", (selector) => {
      const css = readFileSync(dayViewCssPath, "utf-8");
      const body = extractRuleBody(css, selector);
      if (body === null) return;
      expect(body).not.toMatch(/(?:^|;|\n)\s*transition\s*:/);
    });

    it.each(FORM_SELECTORS)("%s ルール本文に animation 宣言が含まれない", (selector) => {
      const css = readFileSync(dayViewCssPath, "utf-8");
      const body = extractRuleBody(css, selector);
      if (body === null) return;
      expect(body).not.toMatch(/(?:^|;|\n)\s*animation\s*:/);
    });

    it("CSS ファイル全体に .day-view__form:hover セレクタが存在しない", () => {
      const css = readFileSync(dayViewCssPath, "utf-8");
      expect(css).not.toContain(".day-view__form:hover");
    });

    it("CSS ファイル全体に .day-view__form:focus-within セレクタが存在しない", () => {
      const css = readFileSync(dayViewCssPath, "utf-8");
      expect(css).not.toContain(".day-view__form:focus-within");
    });

    it("day-view.css の全文に box-shadow キーワードが含まれない (NFR-NO-SHADOW)", () => {
      const css = readFileSync(dayViewCssPath, "utf-8");
      expect(css).not.toContain("box-shadow");
    });
  });
});
