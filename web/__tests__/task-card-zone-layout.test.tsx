// @vitest-environment jsdom

/**
 * タスクカードの 3 段ゾーンレイアウト (BL-057 / task-card-zone-layout) 受け入れ基準テスト.
 *
 * 仕様参照:
 *   docs/developer/features/task-card-zone-layout/spec.md
 *   docs/developer/features/task-card-zone-layout/plan.md
 *   docs/developer/features/task-card-zone-layout/tasks.md
 *
 * 本ファイルが検証する受け入れ基準:
 *   AC-1: .day-view__card が 3 段ゾーン構造のレイアウト宣言を持つ (CSS 直読み).
 *   AC-2: .day-view__card の border-radius が --radius-lg に引き上げられている (CSS 直読み).
 *   AC-3: 3 子クラス (.day-view__card__header / __title / __actions) が定義されている (CSS 直読み).
 *   AC-4: today-view の各タスクカードに 3 子要素が DOM 上に存在する (DOM レンダ).
 *   AC-5: tomorrow-view の各タスクカードに 3 子要素が DOM 上に存在する (DOM レンダ).
 *   AC-6: .day-view__card__actions の中に「削除」「明日にする」「完了」 button が存在する (DOM レンダ).
 *   AC-7: 「現在のタスクにする」 button が .day-view__card__actions 内に存在する (DOM レンダ / D-002).
 *   AC-8: <PriorityStars /> (radiogroup) が .day-view__card__title 内に存在する (DOM レンダ / D-003).
 *   AC-9: .project-chip が .day-view__card__header 内に配置されている (DOM レンダ).
 *   AC-10: プロジェクト未設定タスクでも 3 段子要素は DOM 上に存在する (DOM レンダ).
 *   AC-11: tokens.css が変更されていない (CSS 直読み / NFR-NO-NEW-TOKENS).
 *   AC-13: day-view.css の対象外セレクタに本 BL の追記が無い (CSS 直読み / REQ-13).
 *   AC-14: day-view.css 全体で box-shadow を追加していない (CSS 直読み / NFR-NO-SHADOW).
 *   AC-15: 新規 3 子クラスに hover / transition / animation / box-shadow が含まれない (CSS 直読み).
 *   AC-12 と focus-view 不変は AC-13 のスモークで併せて確認する.
 *
 * AC-16 (既存単体テスト全件 green) / AC-17 (既存 E2E 全件 green) / AC-18 (a11y violations 0)
 * は本ファイルでは個別アサートを置かず, ルート `npm test` / `npx playwright test` の
 * 継続実行で担保する.
 *
 * 本ファイルは TDD の "red" を作るためのテスト.
 *   - 実装前 (= day-view.css に新規 3 子クラスが無く / JSX も 1 行水平のまま) では,
 *     AC-1 / AC-2 / AC-3 / AC-4 / AC-5 / AC-6 / AC-7 / AC-8 / AC-9 / AC-10 が失敗する.
 *   - 既存ファイル不変性系 (AC-11 / AC-13 / AC-14) は既に green.
 *   - AC-15 は新規 3 子クラスが定義されないうちはルール本文が null になるため
 *     「ルールが見つからない」で失敗する (red).
 *   - implementer が REQ-1〜REQ-13 を実装することで green 化する.
 *
 * 検証スタイル:
 *   - CSS 直読み: BL-052 (task-card-design.test.ts) / BL-054 (form-card-design.test.ts) /
 *     BL-056 (project-chip.test.tsx) と同じ `readFileSync` + `extractRuleBody` パターン
 *     (P-005). ヘルパは本ファイル内に再定義する.
 *   - DOM レンダ: BL-056 (project-chip.test.tsx) と同じ `QueryClientProvider` +
 *     `render` + `container.querySelector` パターン (P-008).
 *
 * vitest-environment:
 *   CSS 直読み AC は node でも動くが, DOM レンダ AC は jsdom 必須のため,
 *   1 ファイル全体を jsdom で動かす (= readFileSync は jsdom 環境でも問題なく動く / P-004).
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
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

const NOW = "2026-06-11T09:00:00.000Z";
const PROJECT_ID_P1 = "p1p1p1p1-p1p1-4p1p-8p1p-p1p1p1p1p1p1";
const PROJECT_NAME_P1 = "プロジェクトα";

// ============================================================
// CSS ルール本文の抽出ヘルパ (P-005 / BL-052 / BL-054 / BL-056 から再実装)
// ============================================================

/**
 * 指定したセレクタの「ルール本文 (= {} で囲まれた中身)」を抽出する.
 *
 * 単純な /selector\s*\{([^}]*)\}/ では `.day-view__card` が
 * `.day-view__card--focus` / `.day-view__card__header` 等の prefix にも
 * 一致してしまうため, セレクタ末尾を `{` / 空白で厳密に区切る.
 *
 * BL-052 / BL-054 / BL-056 に存在する同等実装を再定義する (P-005).
 */
function extractRuleBody(css: string, selector: string): string | null {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // セレクタの直後が空白 + `{` であるルールに限定する.
  const re = new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`, "m");
  const m = css.match(re);
  return m?.[1] ?? null;
}

// ============================================================
// DOM レンダテスト用ヘルパ (project-chip.test.tsx から最小コピー)
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
      throw new Error("not used in task-card-zone-layout test");
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

describe("タスクカードの 3 段ゾーンレイアウト (BL-057 / task-card-zone-layout)", () => {
  // ----------------------------------------------------------
  // AC-1: .day-view__card が 3 段ゾーン構造のレイアウト宣言を持つ
  // ----------------------------------------------------------
  /**
   * シナリオ AC-1:
   *   Given web/src/ui/day-view/day-view.css を開いた
   *   When  .day-view__card セレクタのルール本文を観察する
   *   Then  display: flex の宣言を含む
   *    かつ flex-direction: column の宣言を含む
   *    かつ align-items: stretch の宣言を含む (align-items: center は含まない)
   *    かつ gap: var(--space-md) の宣言を含む (回帰防止)
   *    かつ background: var(--color-bg) / border: 1px solid var(--color-border) /
   *         padding: var(--space-md) の宣言を含む (BL-052 維持)
   */
  describe("AC-1: .day-view__card が 3 段ゾーン構造のレイアウト宣言を持つ", () => {
    it("day-view.css が存在する", () => {
      expect(existsSync(dayViewCssPath)).toBe(true);
    });

    it(".day-view__card ルール本文に display: flex を含む (回帰防止)", () => {
      const css = readFileSync(dayViewCssPath, "utf-8");
      const body = extractRuleBody(css, ".day-view__card");
      expect(body, ".day-view__card ルールが見つからない").not.toBeNull();
      expect(body ?? "").toMatch(/display\s*:\s*flex/);
    });

    it(".day-view__card ルール本文に flex-direction: column を含む (本 BL の核 / REQ-1)", () => {
      const css = readFileSync(dayViewCssPath, "utf-8");
      const body = extractRuleBody(css, ".day-view__card");
      expect(body, ".day-view__card ルールが見つからない").not.toBeNull();
      expect(body ?? "").toMatch(/flex-direction\s*:\s*column/);
    });

    it(".day-view__card ルール本文に align-items: stretch を含む (REQ-1 / P-002)", () => {
      const css = readFileSync(dayViewCssPath, "utf-8");
      const body = extractRuleBody(css, ".day-view__card");
      expect(body, ".day-view__card ルールが見つからない").not.toBeNull();
      expect(body ?? "").toMatch(/align-items\s*:\s*stretch/);
    });

    it(".day-view__card ルール本文に align-items: center を含まない (本 BL で center → stretch に置換)", () => {
      const css = readFileSync(dayViewCssPath, "utf-8");
      const body = extractRuleBody(css, ".day-view__card");
      expect(body, ".day-view__card ルールが見つからない").not.toBeNull();
      expect(body ?? "").not.toMatch(/align-items\s*:\s*center/);
    });

    it(".day-view__card ルール本文に gap: var(--space-md) を含む (回帰防止)", () => {
      const css = readFileSync(dayViewCssPath, "utf-8");
      const body = extractRuleBody(css, ".day-view__card");
      expect(body, ".day-view__card ルールが見つからない").not.toBeNull();
      expect(body ?? "").toMatch(/gap\s*:\s*var\(--space-md\)/);
    });

    it(".day-view__card ルール本文に background: var(--color-bg) / border: 1px solid var(--color-border) / padding: var(--space-md) を含む (BL-052 維持)", () => {
      const css = readFileSync(dayViewCssPath, "utf-8");
      const body = extractRuleBody(css, ".day-view__card");
      expect(body, ".day-view__card ルールが見つからない").not.toBeNull();
      const bodyText = body ?? "";
      expect(bodyText).toMatch(/background(?:-color)?\s*:\s*var\(--color-bg\)/);
      const hasShorthand = /border\s*:\s*1px\s+solid\s+var\(--color-border\)/.test(bodyText);
      const hasDecomposed =
        /border-width\s*:\s*1px/.test(bodyText) &&
        /border-style\s*:\s*solid/.test(bodyText) &&
        /border-color\s*:\s*var\(--color-border\)/.test(bodyText);
      expect(
        hasShorthand || hasDecomposed,
        ".day-view__card に border: 1px solid var(--color-border) 等価宣言が無い",
      ).toBe(true);
      // padding: var(--space-md) を `gap: var(--space-md)` と誤検知しないよう先頭限定.
      expect(bodyText).toMatch(/(?:^|;|\n)\s*padding\s*:\s*var\(--space-md\)/);
    });
  });

  // ----------------------------------------------------------
  // AC-2: .day-view__card の border-radius が --radius-lg に引き上げられている
  // ----------------------------------------------------------
  /**
   * シナリオ AC-2:
   *   Given web/src/ui/day-view/day-view.css を開いた
   *   When  .day-view__card セレクタのルール本文を観察する
   *   Then  border-radius プロパティに var(--radius-lg) を参照する宣言を含む
   *    (BL-052 の var(--radius-md) からの引き上げ / D-001)
   */
  describe("AC-2: .day-view__card の border-radius が --radius-lg に引き上げられている (D-001)", () => {
    it(".day-view__card ルール本文に border-radius: var(--radius-lg) を含む", () => {
      const css = readFileSync(dayViewCssPath, "utf-8");
      const body = extractRuleBody(css, ".day-view__card");
      expect(body, ".day-view__card ルールが見つからない").not.toBeNull();
      expect(body ?? "").toMatch(/border-radius\s*:\s*var\(--radius-lg\)/);
    });

    it(".day-view__card ルール本文に border-radius: var(--radius-md) を含まない (本 BL で md → lg に置換)", () => {
      const css = readFileSync(dayViewCssPath, "utf-8");
      const body = extractRuleBody(css, ".day-view__card");
      expect(body, ".day-view__card ルールが見つからない").not.toBeNull();
      expect(body ?? "").not.toMatch(/border-radius\s*:\s*var\(--radius-md\)/);
    });
  });

  // ----------------------------------------------------------
  // AC-3: 3 子クラス (.day-view__card__header / __title / __actions) が定義されている
  // ----------------------------------------------------------
  /**
   * シナリオ AC-3:
   *   Given web/src/ui/day-view/day-view.css を開いた
   *   When  ファイル全体を観察する
   *   Then  .day-view__card__header セレクタのルールが定義されている
   *    かつ .day-view__card__title セレクタのルールが定義されている
   *    かつ .day-view__card__actions セレクタのルールが定義されている
   *    かつ 各ルール本文に display: flex の宣言を含む
   *    かつ .day-view__card__actions ルール本文に justify-content: flex-end の宣言を含む
   */
  describe("AC-3: 3 子クラスが定義されている", () => {
    it(".day-view__card__header ルールが day-view.css に定義されている", () => {
      const css = readFileSync(dayViewCssPath, "utf-8");
      const body = extractRuleBody(css, ".day-view__card__header");
      expect(body, ".day-view__card__header ルールが day-view.css に見つからない").not.toBeNull();
      expect(body ?? "").toMatch(/display\s*:\s*flex/);
    });

    it(".day-view__card__title ルールが day-view.css に定義されている", () => {
      const css = readFileSync(dayViewCssPath, "utf-8");
      const body = extractRuleBody(css, ".day-view__card__title");
      expect(body, ".day-view__card__title ルールが day-view.css に見つからない").not.toBeNull();
      expect(body ?? "").toMatch(/display\s*:\s*flex/);
    });

    it(".day-view__card__actions ルールが day-view.css に定義されている", () => {
      const css = readFileSync(dayViewCssPath, "utf-8");
      const body = extractRuleBody(css, ".day-view__card__actions");
      expect(body, ".day-view__card__actions ルールが day-view.css に見つからない").not.toBeNull();
      expect(body ?? "").toMatch(/display\s*:\s*flex/);
    });

    it(".day-view__card__actions ルール本文に justify-content: flex-end を含む (D-004)", () => {
      const css = readFileSync(dayViewCssPath, "utf-8");
      const body = extractRuleBody(css, ".day-view__card__actions");
      expect(body, ".day-view__card__actions ルールが見つからない").not.toBeNull();
      expect(body ?? "").toMatch(/justify-content\s*:\s*flex-end/);
    });
  });

  // ----------------------------------------------------------
  // AC-4: today-view の各タスクカードに 3 子要素が DOM 上に存在する
  // ----------------------------------------------------------
  /**
   * シナリオ AC-4:
   *   Given /today を jsdom 環境でレンダリングした
   *    かつ tasks に少なくとも 1 件のタスクが存在する
   *   When  document 内の <li class="day-view__card"> 要素を 1 つ取得する
   *   Then  その内部に直下子要素として querySelector(".day-view__card__header") が要素を返す
   *    かつ querySelector(".day-view__card__title") が要素を返す
   *    かつ querySelector(".day-view__card__actions") が要素を返す
   */
  describe("AC-4: today-view の各タスクカードに 3 子要素が DOM 上に存在する", () => {
    it("today-view の otherTasks <li> 内に header / title / actions の 3 子要素が存在する", async () => {
      // tasks 1 件だと focusedTask に取られて <li> が出ないため 2 件投入.
      const focusedTask = makeTask({
        id: "task-focus",
        name: "フォーカスタスク",
        projectId: null,
        dueDate: "today",
        priority: "highest",
        createdAt: "2026-06-11T08:00:00.000Z",
      });
      const otherTask = makeTask({
        id: "task-other",
        name: "通常タスク",
        projectId: null,
        dueDate: "today",
        priority: "normal",
        createdAt: "2026-06-11T08:00:01.000Z",
      });
      const repo = makeMockRepository([focusedTask, otherTask]);
      const projectRepo = makeMockProjectRepository([]);

      renderWithQueryClient(<TodayView repository={repo} projectRepository={projectRepo} />);

      const taskNameNode = await screen.findByText("通常タスク");
      const card = taskNameNode.closest("li");
      expect(card, "「通常タスク」を含む <li> が見つからない").not.toBeNull();
      expect(card?.classList.contains("day-view__card")).toBe(true);

      expect(
        card?.querySelector(".day-view__card__header"),
        ".day-view__card__header が <li> 内に存在しない",
      ).not.toBeNull();
      expect(
        card?.querySelector(".day-view__card__title"),
        ".day-view__card__title が <li> 内に存在しない",
      ).not.toBeNull();
      expect(
        card?.querySelector(".day-view__card__actions"),
        ".day-view__card__actions が <li> 内に存在しない",
      ).not.toBeNull();
    });

    it("today-view の focusedTask <section> 内にも 3 子要素が存在する (G-2)", async () => {
      const focusedTask = makeTask({
        id: "task-focus",
        name: "フォーカスタスク",
        projectId: null,
        dueDate: "today",
        priority: "highest",
      });
      const repo = makeMockRepository([focusedTask]);
      const projectRepo = makeMockProjectRepository([]);

      renderWithQueryClient(<TodayView repository={repo} projectRepository={projectRepo} />);

      const focusSection = await screen.findByRole("region", { name: "現在のタスク" });
      expect(
        focusSection.querySelector(".day-view__card__header"),
        ".day-view__card__header が focused section 内に存在しない",
      ).not.toBeNull();
      expect(
        focusSection.querySelector(".day-view__card__title"),
        ".day-view__card__title が focused section 内に存在しない",
      ).not.toBeNull();
      expect(
        focusSection.querySelector(".day-view__card__actions"),
        ".day-view__card__actions が focused section 内に存在しない",
      ).not.toBeNull();
    });
  });

  // ----------------------------------------------------------
  // AC-5: tomorrow-view の各タスクカードに 3 子要素が DOM 上に存在する
  // ----------------------------------------------------------
  /**
   * シナリオ AC-5:
   *   Given /tomorrow を jsdom 環境でレンダリングした
   *    かつ tasks に少なくとも 1 件のタスクが存在する
   *   When  document 内の <li class="day-view__card"> 要素を 1 つ取得する
   *   Then  その内部に直下子要素として querySelector(".day-view__card__header") が要素を返す
   *    かつ querySelector(".day-view__card__title") が要素を返す
   *    かつ querySelector(".day-view__card__actions") が要素を返す
   */
  describe("AC-5: tomorrow-view の各タスクカードに 3 子要素が DOM 上に存在する", () => {
    it("tomorrow-view の <li> 内に header / title / actions の 3 子要素が存在する", async () => {
      const task = makeTask({
        id: "tomorrow-task",
        name: "明日タスク",
        projectId: null,
        dueDate: "tomorrow",
      });
      const repo = makeMockRepository([task]);
      const projectRepo = makeMockProjectRepository([]);

      renderWithQueryClient(<TomorrowView repository={repo} projectRepository={projectRepo} />);

      const taskNameNode = await screen.findByText("明日タスク");
      const card = taskNameNode.closest("li");
      expect(card, "「明日タスク」を含む <li> が見つからない").not.toBeNull();
      expect(card?.classList.contains("day-view__card")).toBe(true);

      expect(
        card?.querySelector(".day-view__card__header"),
        ".day-view__card__header が <li> 内に存在しない",
      ).not.toBeNull();
      expect(
        card?.querySelector(".day-view__card__title"),
        ".day-view__card__title が <li> 内に存在しない",
      ).not.toBeNull();
      expect(
        card?.querySelector(".day-view__card__actions"),
        ".day-view__card__actions が <li> 内に存在しない",
      ).not.toBeNull();
    });
  });

  // ----------------------------------------------------------
  // AC-6: .day-view__card__actions の中に「削除」「明日にする」「完了」 button が存在する
  // ----------------------------------------------------------
  /**
   * シナリオ AC-6:
   *   Given /today を jsdom 環境でレンダリングした
   *    かつ otherTasks リストに少なくとも 1 件のタスクが存在する
   *   When  そのタスクのカード (= <li>) 内の .day-view__card__actions 要素の子 button を取得する
   *   Then  「削除」 button を含む
   *    かつ task.origin !== "routine" の場合「明日にする」 button を含む
   *    かつ 「完了」 button を含む
   */
  describe("AC-6: .day-view__card__actions に 3 ボタン (削除 / 明日にする / 完了) が存在する", () => {
    it("today-view の otherTasks カードの actions 内に 3 ボタンが存在する", async () => {
      const focusedTask = makeTask({
        id: "task-focus",
        name: "フォーカスタスク",
        projectId: null,
        dueDate: "today",
        priority: "highest",
        createdAt: "2026-06-11T08:00:00.000Z",
      });
      const otherTask = makeTask({
        id: "task-other",
        name: "通常タスク",
        projectId: null,
        dueDate: "today",
        priority: "normal",
        origin: "manual",
        createdAt: "2026-06-11T08:00:01.000Z",
      });
      const repo = makeMockRepository([focusedTask, otherTask]);
      const projectRepo = makeMockProjectRepository([]);

      renderWithQueryClient(<TodayView repository={repo} projectRepository={projectRepo} />);

      const taskNameNode = await screen.findByText("通常タスク");
      const card = taskNameNode.closest("li");
      expect(card, "「通常タスク」を含む <li> が見つからない").not.toBeNull();

      const actions = card?.querySelector(".day-view__card__actions");
      expect(actions, ".day-view__card__actions が <li> 内に存在しない").not.toBeNull();

      const buttonTexts = Array.from(actions?.querySelectorAll("button") ?? []).map(
        (b) => b.textContent ?? "",
      );

      expect(
        buttonTexts.some((t) => t.includes("削除")),
        `actions に「削除」 button が無い (実際: ${JSON.stringify(buttonTexts)})`,
      ).toBe(true);
      expect(
        buttonTexts.some((t) => t.includes("明日にする")),
        `actions に「明日にする」 button が無い (実際: ${JSON.stringify(buttonTexts)})`,
      ).toBe(true);
      expect(
        buttonTexts.some((t) => t.includes("完了")),
        `actions に「完了」 button が無い (実際: ${JSON.stringify(buttonTexts)})`,
      ).toBe(true);
    });
  });

  // ----------------------------------------------------------
  // AC-7: 「現在のタスクにする」 button が .day-view__card__actions 内に存在する (D-002)
  // ----------------------------------------------------------
  /**
   * シナリオ AC-7:
   *   Given /today を jsdom 環境でレンダリングした
   *    かつ otherTasks リストに少なくとも 1 件のタスクが存在する
   *   When  そのタスクのカード (= <li>) 内の .day-view__card__actions 要素の子 button を取得する
   *   Then  「現在のタスクにする」 button を含む
   *    かつ アクション段以外 (header / title) の中には「現在のタスクにする」 button が存在しない
   */
  describe("AC-7: 「現在のタスクにする」 button が .day-view__card__actions 内に存在する (D-002)", () => {
    it("today-view の otherTasks カードの actions 内に「現在のタスクにする」 button が存在し, header / title には無い", async () => {
      const focusedTask = makeTask({
        id: "task-focus",
        name: "フォーカスタスク",
        projectId: null,
        dueDate: "today",
        priority: "highest",
        createdAt: "2026-06-11T08:00:00.000Z",
      });
      const otherTask = makeTask({
        id: "task-other",
        name: "通常タスク",
        projectId: null,
        dueDate: "today",
        priority: "normal",
        createdAt: "2026-06-11T08:00:01.000Z",
      });
      const repo = makeMockRepository([focusedTask, otherTask]);
      const projectRepo = makeMockProjectRepository([]);

      renderWithQueryClient(<TodayView repository={repo} projectRepository={projectRepo} />);

      const taskNameNode = await screen.findByText("通常タスク");
      const card = taskNameNode.closest("li");
      expect(card, "「通常タスク」を含む <li> が見つからない").not.toBeNull();

      const actions = card?.querySelector(".day-view__card__actions");
      expect(actions, ".day-view__card__actions が <li> 内に存在しない").not.toBeNull();

      const actionButtonTexts = Array.from(actions?.querySelectorAll("button") ?? []).map(
        (b) => b.textContent ?? "",
      );
      expect(
        actionButtonTexts.some((t) => t.includes("現在のタスクにする")),
        `actions に「現在のタスクにする」 button が無い (実際: ${JSON.stringify(actionButtonTexts)})`,
      ).toBe(true);

      // header / title に「現在のタスクにする」 button が無いこと.
      const header = card?.querySelector(".day-view__card__header");
      const title = card?.querySelector(".day-view__card__title");
      const headerHasSetFocus = Array.from(header?.querySelectorAll("button") ?? []).some((b) =>
        (b.textContent ?? "").includes("現在のタスクにする"),
      );
      const titleHasSetFocus = Array.from(title?.querySelectorAll("button") ?? []).some((b) =>
        (b.textContent ?? "").includes("現在のタスクにする"),
      );
      expect(
        headerHasSetFocus,
        "header 段に「現在のタスクにする」 button が混入している (D-002 違反)",
      ).toBe(false);
      expect(
        titleHasSetFocus,
        "title 段に「現在のタスクにする」 button が混入している (D-002 違反)",
      ).toBe(false);
    });
  });

  // ----------------------------------------------------------
  // AC-8: <PriorityStars /> (radiogroup) が .day-view__card__title 内に存在する (D-003)
  // ----------------------------------------------------------
  /**
   * シナリオ AC-8:
   *   Given /today を jsdom 環境でレンダリングした
   *    かつ otherTasks リストに少なくとも 1 件のタスクが存在する
   *   When  そのタスクのカード (= <li>) 内の .day-view__card__title 要素の中を観察する
   *   Then  優先度を表す role="radiogroup" 要素が存在する (= <PriorityStars /> が中段にある)
   *    かつ アクション段 (.day-view__card__actions) や header 段 (.day-view__card__header)
   *         の中には radiogroup が存在しない
   */
  describe("AC-8: <PriorityStars /> (radiogroup) が .day-view__card__title 内に存在する (D-003)", () => {
    it("today-view の otherTasks カードの title 内に radiogroup が存在し, header / actions には無い", async () => {
      const focusedTask = makeTask({
        id: "task-focus",
        name: "フォーカスタスク",
        projectId: null,
        dueDate: "today",
        priority: "highest",
        createdAt: "2026-06-11T08:00:00.000Z",
      });
      const otherTask = makeTask({
        id: "task-other",
        name: "通常タスク",
        projectId: null,
        dueDate: "today",
        priority: "normal",
        createdAt: "2026-06-11T08:00:01.000Z",
      });
      const repo = makeMockRepository([focusedTask, otherTask]);
      const projectRepo = makeMockProjectRepository([]);

      renderWithQueryClient(<TodayView repository={repo} projectRepository={projectRepo} />);

      const taskNameNode = await screen.findByText("通常タスク");
      const card = taskNameNode.closest("li");
      expect(card, "「通常タスク」を含む <li> が見つからない").not.toBeNull();

      const title = card?.querySelector(".day-view__card__title");
      expect(title, ".day-view__card__title が <li> 内に存在しない").not.toBeNull();

      expect(
        title?.querySelector('[role="radiogroup"]'),
        'title 段に role="radiogroup" 要素 (= <PriorityStars />) が存在しない',
      ).not.toBeNull();

      // header / actions 段に radiogroup が無いこと.
      const header = card?.querySelector(".day-view__card__header");
      const actions = card?.querySelector(".day-view__card__actions");
      expect(
        header?.querySelector('[role="radiogroup"]') ?? null,
        "header 段に radiogroup が混入している (D-003 違反)",
      ).toBeNull();
      expect(
        actions?.querySelector('[role="radiogroup"]') ?? null,
        "actions 段に radiogroup が混入している (D-003 違反)",
      ).toBeNull();
    });
  });

  // ----------------------------------------------------------
  // AC-9: .project-chip が .day-view__card__header 内に配置されている
  // ----------------------------------------------------------
  /**
   * シナリオ AC-9:
   *   Given /today を jsdom 環境でレンダリングした
   *    かつ projects に少なくとも 1 件のプロジェクトが存在する
   *    かつ tasks に projectId がそのプロジェクトを指すタスクが少なくとも 1 件存在する
   *   When  そのタスクのカード (= <li>) 内の .day-view__card__header 要素の中を観察する
   *   Then  そこに <span class="project-chip"> が存在する (= chip が上段にある)
   *    かつ アクション段 / 中段の中には .project-chip が存在しない
   */
  describe("AC-9: .project-chip が .day-view__card__header 内に配置されている (REQ-7)", () => {
    it("today-view の project 割り当て済みカードの header 内に chip が存在し, title / actions には無い", async () => {
      const project = makeProject({ id: PROJECT_ID_P1, name: PROJECT_NAME_P1 });
      const focusedTask = makeTask({
        id: "task-focus",
        name: "フォーカスタスク",
        projectId: null,
        dueDate: "today",
        priority: "highest",
        createdAt: "2026-06-11T08:00:00.000Z",
      });
      const taskWithProject = makeTask({
        id: "task-with-project",
        name: "プロジェクト付きタスク",
        projectId: PROJECT_ID_P1,
        dueDate: "today",
        priority: "normal",
        createdAt: "2026-06-11T08:00:01.000Z",
      });
      const repo = makeMockRepository([focusedTask, taskWithProject]);
      const projectRepo = makeMockProjectRepository([project]);

      renderWithQueryClient(<TodayView repository={repo} projectRepository={projectRepo} />);

      const taskNameNode = await screen.findByText("プロジェクト付きタスク");
      const card = taskNameNode.closest("li");
      expect(card, "「プロジェクト付きタスク」を含む <li> が見つからない").not.toBeNull();

      const header = card?.querySelector(".day-view__card__header");
      const title = card?.querySelector(".day-view__card__title");
      const actions = card?.querySelector(".day-view__card__actions");
      expect(header, ".day-view__card__header が <li> 内に存在しない").not.toBeNull();

      const chipInHeader = header?.querySelector(".project-chip") ?? null;
      expect(chipInHeader, "header 段に .project-chip が存在しない (REQ-7 違反)").not.toBeNull();
      expect(chipInHeader?.textContent ?? "").toContain(PROJECT_NAME_P1);

      // title / actions 段に chip が無い.
      expect(
        title?.querySelector(".project-chip") ?? null,
        "title 段に .project-chip が混入している (REQ-7 違反)",
      ).toBeNull();
      expect(
        actions?.querySelector(".project-chip") ?? null,
        "actions 段に .project-chip が混入している (REQ-7 違反)",
      ).toBeNull();
    });
  });

  // ----------------------------------------------------------
  // AC-10: プロジェクト未設定タスクでも 3 段子要素は DOM 上に存在する
  // ----------------------------------------------------------
  /**
   * シナリオ AC-10:
   *   Given /today を jsdom 環境でレンダリングした
   *    かつ tasks に projectId === null のタスクが少なくとも 1 件存在する
   *    かつ そのタスクのカード (= <li>) を取得した
   *   When  そのカード内の querySelector(".day-view__card__header") を観察する
   *   Then  要素は存在する (null ではない)
   *    かつ その内部に .project-chip 要素は無い (= header 段は空)
   */
  describe("AC-10: プロジェクト未設定タスクでも 3 段子要素は DOM 上に存在する (REQ-2 / header 空段)", () => {
    it("projectId === null のタスクカードでも header 段は存在し, その中に chip は無い", async () => {
      const focusedTask = makeTask({
        id: "task-focus",
        name: "フォーカスタスク",
        projectId: null,
        dueDate: "today",
        priority: "highest",
        createdAt: "2026-06-11T08:00:00.000Z",
      });
      const otherTaskNoProject = makeTask({
        id: "task-other-no-project",
        name: "未分類タスク",
        projectId: null,
        dueDate: "today",
        priority: "normal",
        createdAt: "2026-06-11T08:00:01.000Z",
      });
      const repo = makeMockRepository([focusedTask, otherTaskNoProject]);
      const projectRepo = makeMockProjectRepository([]);

      renderWithQueryClient(<TodayView repository={repo} projectRepository={projectRepo} />);

      const taskNameNode = await screen.findByText("未分類タスク");
      const card = taskNameNode.closest("li");
      expect(card, "「未分類タスク」を含む <li> が見つからない").not.toBeNull();

      const header = card?.querySelector(".day-view__card__header");
      expect(
        header,
        "projectId === null のタスクでも header 段は DOM 上に存在しなければならない",
      ).not.toBeNull();
      expect(
        header?.querySelector(".project-chip") ?? null,
        "projectId === null のタスクの header 段に .project-chip が描画されている",
      ).toBeNull();

      // title / actions 段も同様に存在する.
      expect(
        card?.querySelector(".day-view__card__title"),
        "title 段が <li> 内に存在しない",
      ).not.toBeNull();
      expect(
        card?.querySelector(".day-view__card__actions"),
        "actions 段が <li> 内に存在しない",
      ).not.toBeNull();
    });
  });

  // ----------------------------------------------------------
  // AC-11: tokens.css が変更されていない (NFR-NO-NEW-TOKENS)
  // ----------------------------------------------------------
  /**
   * シナリオ AC-11:
   *   Given 本 BL の実装がマージされた
   *   When  web/src/styles/tokens.css を BL-056 完了時点の状態と比較する
   *   Then  本 BL で参照する --radius-lg / --space-md / --space-sm が引き続き定義されている
   *    かつ --radius-xl のような本 BL では追加すべきでない token が存在しない
   */
  describe("AC-11: tokens.css に必須トークンが残っている (NFR-NO-NEW-TOKENS / D-001)", () => {
    it("tokens.css に本 BL で参照する 3 トークン (--radius-lg / --space-md / --space-sm) が定義されている", () => {
      const css = readFileSync(tokensCssPath, "utf-8");
      expect(css).toMatch(/--radius-lg\s*:/);
      expect(css).toMatch(/--space-md\s*:/);
      expect(css).toMatch(/--space-sm\s*:/);
    });

    it("tokens.css に本 BL では追加すべきでない --radius-xl が存在しない (D-001)", () => {
      const css = readFileSync(tokensCssPath, "utf-8");
      expect(css).not.toMatch(/--radius-xl\s*:/);
    });

    it("tokens.css に本 BL では追加すべきでない --shadow-* トークンが存在しない (NFR-NO-SHADOW)", () => {
      const css = readFileSync(tokensCssPath, "utf-8");
      expect(css).not.toMatch(/--shadow-/);
    });
  });

  // ----------------------------------------------------------
  // AC-12 (focus-view 不変) を AC-13 のスモークと併せて確認
  // ----------------------------------------------------------
  /**
   * シナリオ AC-12 (focus-view 不変):
   *   Given 本 BL の実装がマージされた
   *   When  web/src/ui/focus-view/focus-view.css と
   *         web/src/ui/focus-view/focus-view.tsx を観察する
   *   Then  本 BL の新規クラス (.day-view__card__header / __title / __actions) が混入していない
   */
  describe("AC-12: focus-view (/focus) の CSS / TSX が無改修 (REQ-11 / D-006)", () => {
    it("focus-view.css に .day-view__card__header / __title / __actions が含まれない", () => {
      const css = readFileSync(focusViewCssPath, "utf-8");
      expect(css).not.toContain(".day-view__card__header");
      expect(css).not.toContain(".day-view__card__title");
      expect(css).not.toContain(".day-view__card__actions");
    });

    it("focus-view.tsx に day-view__card__ 文字列が含まれない", () => {
      const tsx = readFileSync(focusViewTsxPath, "utf-8");
      expect(tsx).not.toContain("day-view__card__");
    });
  });

  // ----------------------------------------------------------
  // AC-13: day-view.css の対象外セレクタに本 BL の追記が無い (REQ-13)
  // ----------------------------------------------------------
  /**
   * シナリオ AC-13:
   *   Given 本 BL の実装がマージされた
   *   When  web/src/ui/day-view/day-view.css の対象外セレクタのルール本文を観察する
   *   Then  BL-056 完了時点と同じ宣言のままで, 本 BL での追記が無い
   *
   * 対象外セレクタ:
   *   .day-view / .day-view__header / .day-view__header h1 / .day-view__form /
   *   .day-view__list / .day-view__empty / .project-chip / .day-view__card--focus
   */
  describe("AC-13: 対象外セレクタへの本 BL 追記が無い (REQ-13)", () => {
    // 本 BL の影響を受けない構造系セレクタ.
    const STRUCTURE_SELECTORS = [
      ".day-view",
      ".day-view__header",
      ".day-view__list",
      ".day-view__empty",
    ] as const;

    it.each(STRUCTURE_SELECTORS)(
      "%s ルール本文に本 BL の day-view__card__ 系キーワードが含まれない",
      (selector) => {
        const css = readFileSync(dayViewCssPath, "utf-8");
        const body = extractRuleBody(css, selector);
        expect(body, `${selector} ルールが見つからない`).not.toBeNull();
        expect(body ?? "").not.toMatch(/day-view__card__/);
      },
    );

    it(".day-view__form ルール本文は BL-054 確定値のままで, 本 BL で書き換えられていない", () => {
      const css = readFileSync(dayViewCssPath, "utf-8");
      const body = extractRuleBody(css, ".day-view__form");
      expect(body, ".day-view__form ルールが見つからない").not.toBeNull();
      const bodyText = body ?? "";
      // BL-054 で確定済みのフォームカード visual が残っている.
      expect(bodyText).toMatch(/background(?:-color)?\s*:\s*var\(--color-bg\)/);
      expect(bodyText).toMatch(/border\s*:\s*1px\s+solid\s+var\(--color-border\)/);
      expect(bodyText).toMatch(/border-radius\s*:\s*var\(--radius-md\)/);
      expect(bodyText).toMatch(/(?:^|;|\n)\s*padding\s*:\s*var\(--space-md\)/);
      // 本 BL の新規クラスキーワードが混入していない.
      expect(bodyText).not.toMatch(/day-view__card__/);
    });

    it(".project-chip ルール本文は BL-056 確定値のままで, 本 BL で書き換えられていない", () => {
      const css = readFileSync(dayViewCssPath, "utf-8");
      const body = extractRuleBody(css, ".project-chip");
      expect(body, ".project-chip ルールが見つからない").not.toBeNull();
      const bodyText = body ?? "";
      // BL-056 で確定済みの chip 宣言が残っている.
      const hasBorderShorthand = /border\s*:\s*1px\s+solid\s+var\(--color-border\)/.test(bodyText);
      const hasBorderDecomposed =
        /border-width\s*:\s*1px/.test(bodyText) &&
        /border-style\s*:\s*solid/.test(bodyText) &&
        /border-color\s*:\s*var\(--color-border\)/.test(bodyText);
      expect(hasBorderShorthand || hasBorderDecomposed).toBe(true);
      expect(bodyText).toMatch(/border-radius\s*:\s*var\(--radius-lg\)/);
      expect(bodyText).toMatch(/font-size\s*:\s*var\(--font-size-small\)/);
      expect(bodyText).toMatch(/(?:^|;|\n)\s*color\s*:\s*var\(--color-fg\)/);
      // 本 BL の新規クラスキーワードが混入していない.
      expect(bodyText).not.toMatch(/day-view__card__/);
    });

    it(".day-view__card--focus ルール本文は BL-052 確定値のままで, 本 BL で書き換えられていない (REQ-10)", () => {
      const css = readFileSync(dayViewCssPath, "utf-8");
      const body = extractRuleBody(css, ".day-view__card--focus");
      expect(body, ".day-view__card--focus ルールが見つからない").not.toBeNull();
      const bodyText = body ?? "";
      expect(bodyText).toMatch(/border-width\s*:\s*2px/);
      expect(bodyText).toMatch(/border-radius\s*:\s*var\(--radius-lg\)/);
      expect(bodyText).toMatch(/(?:^|;|\n)\s*padding\s*:\s*var\(--space-lg\)/);
      expect(bodyText).not.toMatch(/day-view__card__/);
    });

    it(".day-view__header h1 ルール本文に本 BL のキーワードが含まれない", () => {
      const css = readFileSync(dayViewCssPath, "utf-8");
      const body = extractRuleBody(css, ".day-view__header h1");
      expect(body, ".day-view__header h1 ルールが見つからない").not.toBeNull();
      expect(body ?? "").not.toMatch(/day-view__card__/);
    });
  });

  // ----------------------------------------------------------
  // AC-14: day-view.css 全体で box-shadow を追加していない (NFR-NO-SHADOW)
  // ----------------------------------------------------------
  /**
   * シナリオ AC-14:
   *   Given web/src/ui/day-view/day-view.css を開いた
   *   When  ファイル全体を観察する
   *   Then  box-shadow キーワードを含む宣言が存在しない
   */
  describe("AC-14: day-view.css 全体で box-shadow を追加していない (NFR-NO-SHADOW)", () => {
    it("day-view.css の全文に box-shadow キーワードが含まれない", () => {
      const css = readFileSync(dayViewCssPath, "utf-8");
      expect(css).not.toContain("box-shadow");
    });
  });

  // ----------------------------------------------------------
  // AC-15: 新規 3 子クラスに hover / transition / animation / box-shadow が含まれない
  // ----------------------------------------------------------
  /**
   * シナリオ AC-15:
   *   Given web/src/ui/day-view/day-view.css を開いた
   *   When  .day-view__card__header / .day-view__card__title / .day-view__card__actions
   *         の各ルール本文を観察する
   *   Then  box-shadow / transition / animation 宣言を含まない
   *    かつ .day-view__card__header:hover 等の派生セレクタを CSS 内に持たない
   */
  describe("AC-15: 新規 3 子クラスに hover / transition / animation / box-shadow が含まれない", () => {
    const NEW_CHILD_SELECTORS = [
      ".day-view__card__header",
      ".day-view__card__title",
      ".day-view__card__actions",
    ] as const;

    it.each(NEW_CHILD_SELECTORS)(
      "%s ルール本文に box-shadow 宣言が含まれない (NFR-NO-SHADOW)",
      (selector) => {
        const css = readFileSync(dayViewCssPath, "utf-8");
        const body = extractRuleBody(css, selector);
        expect(body, `${selector} ルールが見つからない`).not.toBeNull();
        expect(body ?? "").not.toMatch(/(?:^|;|\n)\s*box-shadow\s*:/);
      },
    );

    it.each(NEW_CHILD_SELECTORS)(
      "%s ルール本文に transition 宣言が含まれない (NFR-NO-HOVER-TRANSITION)",
      (selector) => {
        const css = readFileSync(dayViewCssPath, "utf-8");
        const body = extractRuleBody(css, selector);
        expect(body, `${selector} ルールが見つからない`).not.toBeNull();
        expect(body ?? "").not.toMatch(/(?:^|;|\n)\s*transition\s*:/);
      },
    );

    it.each(NEW_CHILD_SELECTORS)(
      "%s ルール本文に animation 宣言が含まれない (NFR-NO-HOVER-TRANSITION)",
      (selector) => {
        const css = readFileSync(dayViewCssPath, "utf-8");
        const body = extractRuleBody(css, selector);
        expect(body, `${selector} ルールが見つからない`).not.toBeNull();
        expect(body ?? "").not.toMatch(/(?:^|;|\n)\s*animation\s*:/);
      },
    );

    it.each(NEW_CHILD_SELECTORS)("%s:hover 等の派生セレクタが CSS 内に存在しない", (selector) => {
      const css = readFileSync(dayViewCssPath, "utf-8");
      expect(css).not.toContain(`${selector}:hover`);
      expect(css).not.toContain(`${selector}:focus-visible`);
      expect(css).not.toContain(`${selector}:active`);
    });
  });
});
