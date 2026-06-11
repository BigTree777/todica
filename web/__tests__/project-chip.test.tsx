// @vitest-environment jsdom

/**
 * プロジェクト名 chip 共通スタイル + タスクカード表示追加 (BL-056 / project-chip) 受け入れ基準テスト.
 *
 * 仕様参照:
 *   docs/developer/features/project-chip/spec.md
 *   docs/developer/features/project-chip/plan.md
 *   docs/developer/features/project-chip/tasks.md
 *
 * 本ファイルが検証する受け入れ基準:
 *   AC-1: .project-chip 共通スタイルが day-view.css に定義されている (CSS 直読み).
 *   AC-2: today-view にプロジェクト割り当て済みタスクで chip が表示される (DOM レンダ).
 *   AC-3: tomorrow-view にプロジェクト割り当て済みタスクで chip が表示される (DOM レンダ).
 *   AC-4: ProjectToggle の button が .project-chip className を含む (DOM レンダ).
 *   AC-5: プロジェクト未設定タスクでは chip 自体を描画しない (DOM レンダ / D-002).
 *   AC-6: tokens.css を変更していない (= 必須トークンが存在し続けている).
 *   AC-7: day-view.css の他セレクタには本 BL の追記が無い.
 *   AC-8: focus-view.css に .project-chip が混入していない.
 *   AC-9: project-toggle.css に .project-chip セレクタが追加されていない.
 *   AC-10: day-view.css 全体に box-shadow を追加していない.
 *   AC-11: .project-chip ルールに hover / transition / animation / box-shadow / background が無い.
 *
 * AC-12 (既存テスト全件 green 維持) と AC-13 (a11y 違反 0) は本 BL では追加テストを書かず,
 * ルート `npm test` および既存 `e2e/a11y.spec.ts` の継続実行で担保する (spec D-006).
 *
 * 本ファイルは TDD の "red" を作るためのテスト.
 *   - 実装前 (= day-view.css に .project-chip が無く / JSX に chip span が無く /
 *     ProjectToggle button の className に "project-chip" が無い) では,
 *     AC-1 / AC-2 / AC-3 / AC-4 / AC-11 が失敗する.
 *   - implementer が REQ-1〜REQ-4 を実装することで green 化する.
 *
 * 検証スタイル:
 *   - CSS 直読み (AC-1 / AC-6 / AC-7 / AC-8 / AC-9 / AC-10 / AC-11):
 *     BL-052 (task-card-design.test.ts) / BL-054 (form-card-design.test.ts) と同じ
 *     `readFileSync` + `extractRuleBody` パターンを踏襲する (P-003).
 *     `extractRuleBody` ヘルパは本ファイル内に再定義する (= 共通モジュール化しない).
 *   - DOM レンダ (AC-2 / AC-3 / AC-4 / AC-5):
 *     `@testing-library/react` の `render` + `screen` + `querySelector` で確認する.
 *     既存 `today-view.test.tsx` / `tomorrow-view.test.tsx` の Mock Repository / QueryClient
 *     セットアップを最小コピーする (= 同一ファイル内で完結させる / P-004).
 *
 * vitest-environment:
 *   AC-1 / AC-6 〜 AC-11 (CSS 直読み) は node でも動くが,
 *   AC-2 / AC-3 / AC-4 / AC-5 (DOM レンダ) は jsdom 必須のため,
 *   1 ファイル全体を jsdom で動かす (= jsdom 環境でも readFileSync は問題なく動く).
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
import { ProjectToggle } from "../src/ui/project-toggle/project-toggle.js";
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
const projectToggleCssPath = resolve(webSrcRoot, "ui/project-toggle/project-toggle.css");

const NOW = "2026-06-11T09:00:00.000Z";
const PROJECT_ID_P1 = "p1p1p1p1-p1p1-4p1p-8p1p-p1p1p1p1p1p1";
const PROJECT_NAME_P1 = "プロジェクトα";

// ============================================================
// CSS ルール本文の抽出ヘルパ (P-003 / BL-052 / BL-054 から再実装)
// ============================================================

/**
 * 指定したセレクタの「ルール本文 (= {} で囲まれた中身)」を抽出する.
 *
 * 単純な /selector\s*\{([^}]*)\}/ では `.project-chip` が
 * `.project-chip:hover` 等の派生セレクタにも一致してしまうため,
 * セレクタ末尾を `{` / 空白で厳密に区切る.
 *
 * BL-052 (task-card-design.test.ts) / BL-054 (form-card-design.test.ts) に
 * 存在する同等実装を再定義する (P-003).
 */
function extractRuleBody(css: string, selector: string): string | null {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // セレクタの直後が空白 + `{` であるルールに限定する.
  const re = new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`, "m");
  const m = css.match(re);
  return m?.[1] ?? null;
}

// ============================================================
// DOM レンダテスト用ヘルパ (today-view.test.tsx / tomorrow-view.test.tsx から最小コピー)
// ============================================================

/** TanStack Query テスト用クライアント (今回は非同期再フェッチを抑止). */
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
      throw new Error("not used in project-chip test");
    }),
    delete: vi.fn(async () => {
      /* not used */
    }),
  };
}

/**
 * 共有 TaskRepository モック.
 *
 * today-view / tomorrow-view 両用. dueDate でフィルタし priority 順でソートする.
 * project-chip では create / update / delete / complete の挙動を観察しないため,
 * 最小実装 (state push / patch / splice / trashedAt セット) のみとする.
 */
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

describe("プロジェクト名 chip 共通スタイル + タスクカード表示追加 (BL-056 / project-chip)", () => {
  // ----------------------------------------------------------
  // AC-1: .project-chip 共通スタイルが定義されている
  // ----------------------------------------------------------
  /**
   * シナリオ AC-1:
   *   Given web/src/ui/day-view/day-view.css を開いた
   *   When  .project-chip セレクタのルール本文を観察する
   *   Then  border プロパティに 1px solid var(--color-border) を参照する宣言を含む
   *    かつ border-radius プロパティに var(--radius-lg) を参照する宣言を含む
   *    かつ padding プロパティに var(--space-xs) と var(--space-sm) を参照する宣言を含む
   *    かつ font-size プロパティに var(--font-size-small) を参照する宣言を含む
   *    かつ color プロパティに var(--color-fg) を参照する宣言を含む
   */
  describe("AC-1: .project-chip 共通スタイルが定義されている (CSS 直読み)", () => {
    it("day-view.css が存在する", () => {
      expect(existsSync(dayViewCssPath)).toBe(true);
    });

    it(".project-chip ルールが day-view.css に存在する", () => {
      const css = readFileSync(dayViewCssPath, "utf-8");
      const body = extractRuleBody(css, ".project-chip");
      expect(body, ".project-chip ルールが day-view.css に見つからない").not.toBeNull();
    });

    it(".project-chip ルール本文に border: 1px solid var(--color-border) (または等価分解) を含む", () => {
      const css = readFileSync(dayViewCssPath, "utf-8");
      const body = extractRuleBody(css, ".project-chip");
      expect(body, ".project-chip ルールが見つからない").not.toBeNull();
      const bodyText = body ?? "";
      const hasShorthand = /border\s*:\s*1px\s+solid\s+var\(--color-border\)/.test(bodyText);
      const hasDecomposed =
        /border-width\s*:\s*1px/.test(bodyText) &&
        /border-style\s*:\s*solid/.test(bodyText) &&
        /border-color\s*:\s*var\(--color-border\)/.test(bodyText);
      expect(
        hasShorthand || hasDecomposed,
        ".project-chip に border: 1px solid var(--color-border) 等価宣言が無い",
      ).toBe(true);
    });

    it(".project-chip ルール本文に border-radius: var(--radius-lg) を含む (D-003: 流用)", () => {
      const css = readFileSync(dayViewCssPath, "utf-8");
      const body = extractRuleBody(css, ".project-chip");
      expect(body, ".project-chip ルールが見つからない").not.toBeNull();
      expect(body ?? "").toMatch(/border-radius\s*:\s*var\(--radius-lg\)/);
    });

    it(".project-chip ルール本文に padding 宣言として var(--space-xs) と var(--space-sm) を参照する", () => {
      const css = readFileSync(dayViewCssPath, "utf-8");
      const body = extractRuleBody(css, ".project-chip");
      expect(body, ".project-chip ルールが見つからない").not.toBeNull();
      // padding: var(--space-xs) var(--space-sm) を 1 宣言で表現する形を期待する.
      // (BL のスコープ外: padding-top/right/... の分解は採用しない / spec REQ-1).
      expect(body ?? "").toMatch(
        /(?:^|;|\n)\s*padding\s*:\s*var\(--space-xs\)\s+var\(--space-sm\)/,
      );
    });

    it(".project-chip ルール本文に font-size: var(--font-size-small) を含む", () => {
      const css = readFileSync(dayViewCssPath, "utf-8");
      const body = extractRuleBody(css, ".project-chip");
      expect(body, ".project-chip ルールが見つからない").not.toBeNull();
      expect(body ?? "").toMatch(/font-size\s*:\s*var\(--font-size-small\)/);
    });

    it(".project-chip ルール本文に color: var(--color-fg) を含む", () => {
      const css = readFileSync(dayViewCssPath, "utf-8");
      const body = extractRuleBody(css, ".project-chip");
      expect(body, ".project-chip ルールが見つからない").not.toBeNull();
      // gap: var(--space-md) などと衝突しないよう color: で始まる宣言に限定する.
      expect(body ?? "").toMatch(/(?:^|;|\n)\s*color\s*:\s*var\(--color-fg\)/);
    });
  });

  // ----------------------------------------------------------
  // AC-2: today-view にプロジェクト割り当て済みタスクで chip が表示される
  // ----------------------------------------------------------
  /**
   * シナリオ AC-2:
   *   Given /today を jsdom 環境でレンダリングした
   *    かつ projects に少なくとも 1 件のプロジェクトが存在する
   *    かつ tasks に projectId がそのプロジェクトを指すタスクが少なくとも 1 件存在する
   *   When  document 内の `.project-chip` クラス要素を querySelectorAll で列挙する
   *   Then  少なくとも 1 つ取得できる
   *    かつ そのうち少なくとも 1 つのテキストが該当プロジェクトの name と一致する
   */
  describe("AC-2: today-view にプロジェクト割り当て済みタスクで chip が表示される (DOM)", () => {
    it("タスク一覧内に .project-chip 要素が描画され, textContent にプロジェクト名を含む", async () => {
      // tasks が 1 件のみだとそのタスクが focusedTask (=<section aria-label="現在のタスク">) に
      // 移動してしまい, otherTasks (=<ul aria-label="タスク一覧">) には現れない
      // (today-view 仕様 BL-006 / D-008). 本 AC-2 は「タスク一覧スコープ内」を
      // assert するため, AC-5 と同じパターンで 2 件投入し,
      //   - 1 件目 (highest / 早い createdAt) を focusedTask 側に固定
      //   - 2 件目 (normal / 遅い createdAt) が otherTasks の <li> に落ちる
      // ことを sort 順で保証する.
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
        name: "タスクA",
        projectId: PROJECT_ID_P1,
        dueDate: "today",
        priority: "normal",
        createdAt: "2026-06-11T08:00:01.000Z",
      });
      const repo = makeMockRepository([focusedTask, taskWithProject]);
      const projectRepo = makeMockProjectRepository([project]);

      renderWithQueryClient(<TodayView repository={repo} projectRepository={projectRepo} />);

      // タスクが描画されるまで待つ.
      await screen.findByText("タスクA");

      // タスク一覧 (<ul aria-label="タスク一覧">) スコープ内の .project-chip を探す.
      const list = screen.getByRole("list", { name: "タスク一覧" });
      const chips = list.querySelectorAll(".project-chip");
      expect(
        chips.length,
        "タスク一覧スコープ内に .project-chip が描画されていない",
      ).toBeGreaterThanOrEqual(1);

      // 少なくとも 1 つの chip のテキストがプロジェクト名と一致する.
      const chipTexts = Array.from(chips).map((c) => c.textContent ?? "");
      expect(
        chipTexts.some((t) => t.includes(PROJECT_NAME_P1)),
        `chip テキストにプロジェクト名 "${PROJECT_NAME_P1}" を含む要素が無い (実際: ${JSON.stringify(chipTexts)})`,
      ).toBe(true);
    });
  });

  // ----------------------------------------------------------
  // AC-3: tomorrow-view にプロジェクト割り当て済みタスクで chip が表示される
  // ----------------------------------------------------------
  /**
   * シナリオ AC-3:
   *   Given /tomorrow を jsdom 環境でレンダリングした
   *    かつ projects に少なくとも 1 件のプロジェクトが存在する
   *    かつ tasks に projectId がそのプロジェクトを指すタスクが少なくとも 1 件存在する
   *   When  document 内の `.project-chip` クラス要素を querySelectorAll で列挙する
   *   Then  少なくとも 1 つ取得できる
   *    かつ そのうち少なくとも 1 つのテキストが該当プロジェクトの name と一致する
   */
  describe("AC-3: tomorrow-view にプロジェクト割り当て済みタスクで chip が表示される (DOM)", () => {
    it("明日のタスク一覧内に .project-chip 要素が描画され, textContent にプロジェクト名を含む", async () => {
      const project = makeProject({ id: PROJECT_ID_P1, name: PROJECT_NAME_P1 });
      const taskWithProject = makeTask({
        id: "tomorrow-task-with-project",
        name: "明日タスクA",
        projectId: PROJECT_ID_P1,
        dueDate: "tomorrow",
      });
      const repo = makeMockRepository([taskWithProject]);
      const projectRepo = makeMockProjectRepository([project]);

      renderWithQueryClient(<TomorrowView repository={repo} projectRepository={projectRepo} />);

      // タスクが描画されるまで待つ.
      await screen.findByText("明日タスクA");

      // 明日のタスク一覧スコープ内の .project-chip を探す.
      const list = screen.getByRole("list", { name: "明日のタスク一覧" });
      const chips = list.querySelectorAll(".project-chip");
      expect(
        chips.length,
        "明日のタスク一覧スコープ内に .project-chip が描画されていない",
      ).toBeGreaterThanOrEqual(1);

      const chipTexts = Array.from(chips).map((c) => c.textContent ?? "");
      expect(
        chipTexts.some((t) => t.includes(PROJECT_NAME_P1)),
        `chip テキストにプロジェクト名 "${PROJECT_NAME_P1}" を含む要素が無い (実際: ${JSON.stringify(chipTexts)})`,
      ).toBe(true);
    });
  });

  // ----------------------------------------------------------
  // AC-4: ProjectToggle の button が .project-chip className を含む
  // ----------------------------------------------------------
  /**
   * シナリオ AC-4:
   *   Given web/src/ui/project-toggle/project-toggle.tsx を開いた
   *   When  ProjectToggle component が描画する <button> 要素の className を観察する
   *   Then  className に "project-chip" を含む
   *    かつ 既存の "project-toggle__button" も含む (= 追加であって置換ではない / D-004)
   */
  describe("AC-4: ProjectToggle の button が .project-chip className を含む (DOM / D-004)", () => {
    it("button.className に project-chip と project-toggle__button の両方が含まれる", () => {
      render(<ProjectToggle value={null} onChange={() => {}} projects={[]} idPrefix="ac4" />);

      const button = screen.getByRole("button", { name: /プロジェクト/ });
      const classList = button.className.split(/\s+/).filter(Boolean);

      expect(
        classList,
        `button.className に "project-chip" が含まれていない (実際: ${button.className})`,
      ).toContain("project-chip");
      expect(
        classList,
        `button.className に "project-toggle__button" が含まれていない (= 置換になっている. D-004 違反 / 実際: ${button.className})`,
      ).toContain("project-toggle__button");
    });
  });

  // ----------------------------------------------------------
  // AC-5: プロジェクト未設定タスクでは chip 自体を描画しない (D-002)
  // ----------------------------------------------------------
  /**
   * シナリオ AC-5:
   *   Given /today (または /tomorrow) を jsdom 環境でレンダリングした
   *    かつ tasks に projectId === null のタスクが少なくとも 1 件存在する
   *    かつ そのタスクのカード (= 当該 <li className="day-view__card">) を取得した
   *   When  そのカードの内部から querySelector(".project-chip") を呼ぶ
   *   Then  null を返す (= chip span が DOM に存在しない)
   */
  describe("AC-5: プロジェクト未設定タスクでは chip 自体を描画しない (D-002)", () => {
    it("today-view: projectId === null のタスクカードに .project-chip 要素が存在しない", async () => {
      // tasks が 1 件のみだとそのタスクが focusedTask 扱いになり <section> 表示になるため,
      // 通常リスト側でも検証できるよう projectId=null タスクを 2 件投入し,
      // 2 件目 (otherTasks 側の <li>) で AC-5 を成立させる.
      const focusedNoProject = makeTask({
        id: "task-no-project-focused",
        name: "未分類フォーカス",
        projectId: null,
        dueDate: "today",
        priority: "highest",
        createdAt: "2026-06-11T08:00:00.000Z",
      });
      const otherNoProject = makeTask({
        id: "task-no-project-other",
        name: "未分類タスク",
        projectId: null,
        dueDate: "today",
        priority: "normal",
        createdAt: "2026-06-11T08:00:01.000Z",
      });
      const repo = makeMockRepository([focusedNoProject, otherNoProject]);
      // projects は空 (= プロジェクト解決経路を完全に断つ).
      const projectRepo = makeMockProjectRepository([]);

      renderWithQueryClient(<TodayView repository={repo} projectRepository={projectRepo} />);

      // 該当タスクの <li> (= タスクカード) を取得する. otherTasks 側のはず.
      const taskNameNode = await screen.findByText("未分類タスク");
      const card = taskNameNode.closest("li");
      expect(card, "「未分類タスク」を含む <li> が見つからない").not.toBeNull();

      // そのカード内に .project-chip が存在しない.
      const chipInCard = card?.querySelector(".project-chip") ?? null;
      expect(
        chipInCard,
        "projectId === null のタスクカードに .project-chip が描画されている (D-002 違反)",
      ).toBeNull();

      // focusedTask 側 (= <section aria-label="現在のタスク">) でも projectId=null のため
      // chip が出ないことを担保する.
      const focusSection = screen.getByRole("region", { name: "現在のタスク" });
      expect(
        focusSection.querySelector(".project-chip"),
        "projectId === null の focusedTask セクションに .project-chip が描画されている (D-002 違反)",
      ).toBeNull();
    });

    it("tomorrow-view: projectId === null のタスクカードに .project-chip 要素が存在しない", async () => {
      const taskWithoutProject = makeTask({
        id: "tomorrow-task-no-project",
        name: "明日の未分類タスク",
        projectId: null,
        dueDate: "tomorrow",
      });
      const repo = makeMockRepository([taskWithoutProject]);
      const projectRepo = makeMockProjectRepository([]);

      renderWithQueryClient(<TomorrowView repository={repo} projectRepository={projectRepo} />);

      const taskNameNode = await screen.findByText("明日の未分類タスク");
      const card = taskNameNode.closest("li");
      expect(card, "「明日の未分類タスク」を含む <li> が見つからない").not.toBeNull();

      const chipInCard = card?.querySelector(".project-chip") ?? null;
      expect(
        chipInCard,
        "projectId === null のタスクカードに .project-chip が描画されている (D-002 違反)",
      ).toBeNull();
    });
  });

  // ----------------------------------------------------------
  // AC-6: tokens.css を変更していない (必須トークンが残っている)
  // ----------------------------------------------------------
  /**
   * シナリオ AC-6:
   *   Given 本 BL の実装がマージされた
   *   When  web/src/styles/tokens.css を BL-054 完了時点の状態と比較する
   *   Then  差分が無い (新規トークンの追加・既存トークンの変更が無い)
   *    かつ 本 BL で参照する 6 トークン
   *         (--color-border / --radius-lg / --space-xs / --space-sm /
   *          --font-size-small / --color-fg) が引き続き定義されている
   *    かつ --radius-pill / --shadow-* のような本 BL では追加すべきでない token が存在しない
   */
  describe("AC-6: tokens.css に必須トークンが残っている (NFR-NO-NEW-TOKENS)", () => {
    it("tokens.css に本 BL で参照する 6 トークンが定義されている", () => {
      const css = readFileSync(tokensCssPath, "utf-8");
      expect(css).toMatch(/--color-border\s*:/);
      expect(css).toMatch(/--radius-lg\s*:/);
      expect(css).toMatch(/--space-xs\s*:/);
      expect(css).toMatch(/--space-sm\s*:/);
      expect(css).toMatch(/--font-size-small\s*:/);
      expect(css).toMatch(/--color-fg\s*:/);
    });

    it("tokens.css に本 BL では追加すべきでない --radius-pill が存在しない (D-003)", () => {
      const css = readFileSync(tokensCssPath, "utf-8");
      expect(css).not.toMatch(/--radius-pill\s*:/);
    });

    it("tokens.css に本 BL では追加すべきでない --shadow-* トークンが存在しない (NFR-NO-SHADOW)", () => {
      const css = readFileSync(tokensCssPath, "utf-8");
      expect(css).not.toMatch(/--shadow-/);
    });
  });

  // ----------------------------------------------------------
  // AC-7: day-view.css の他セレクタには本 BL の追記が無い (REQ-6)
  // ----------------------------------------------------------
  /**
   * シナリオ AC-7:
   *   Given 本 BL の実装がマージされた
   *   When  web/src/ui/day-view/day-view.css の既存セレクタ
   *         (.day-view / .day-view__header / .day-view__header h1 / .day-view__form /
   *          .day-view__list / .day-view__card / .day-view__card--focus / .day-view__empty)
   *         のルール本文を観察する
   *   Then  BL-054 完了時点と同じ宣言のままで, 本 BL での追記が無い
   *
   * 注意: .day-view__form は BL-054 で `padding: var(--space-md)` 等の visual が追加済み
   * なため, 本 AC-7 では「本 BL で書き換えていない」ことを確認する形で BL-054 確定値を assert する.
   */
  describe("AC-7: 他セレクタへの本 BL 追記が無い (REQ-6)", () => {
    // BL-052 / BL-054 で正当に visual を持つセレクタは下記 spot-check に分離する.
    // 残りの構造系セレクタは本 BL で `project-chip` キーワードが混入していないことのみ assert.
    const STRUCTURE_ONLY_SELECTORS = [
      ".day-view",
      ".day-view__header",
      ".day-view__list",
      ".day-view__empty",
    ] as const;

    it.each(STRUCTURE_ONLY_SELECTORS)(
      "%s ルール本文に本 BL の project-chip 関連キーワードが含まれない",
      (selector) => {
        const css = readFileSync(dayViewCssPath, "utf-8");
        const body = extractRuleBody(css, selector);
        expect(body, `${selector} ルールが見つからない`).not.toBeNull();
        const bodyText = body ?? "";
        // project-chip クラス参照が混入していないこと.
        expect(bodyText).not.toMatch(/project-chip/);
      },
    );

    it(".day-view__header h1 ルール本文に project-chip 関連キーワードが含まれない", () => {
      const css = readFileSync(dayViewCssPath, "utf-8");
      const body = extractRuleBody(css, ".day-view__header h1");
      expect(body, ".day-view__header h1 ルールが見つからない").not.toBeNull();
      expect(body ?? "").not.toMatch(/project-chip/);
    });

    it("旧 .day-view__card / .day-view__card--focus / .day-view__form ルールは day-view.css から撤去されている (BL-059 で .task-card 系へ移譲)", () => {
      // BL-052 / BL-054 / BL-057 で確定した .day-view__card 系 / .day-view__form 系の宣言は
      // BL-059 (task-card-component) で `.task-card` / `.task-card--focus` / `.task-card--form`
      // に責務移譲され, 旧セレクタは day-view.css から撤去された (REQ-7 / AC-18).
      // 本 BL (BL-056 / project-chip) の関心は「day-view.css 内で .project-chip が無改修」
      // という不変性であり, 旧 card / form セレクタの撤去は妨げにならない.
      const css = readFileSync(dayViewCssPath, "utf-8");
      expect(extractRuleBody(css, ".day-view__card")).toBeNull();
      expect(extractRuleBody(css, ".day-view__card--focus")).toBeNull();
      expect(extractRuleBody(css, ".day-view__form")).toBeNull();
    });
  });

  // ----------------------------------------------------------
  // AC-8: focus-view (/focus) の CSS を変更していない (REQ-8)
  // ----------------------------------------------------------
  /**
   * シナリオ AC-8:
   *   Given 本 BL の実装がマージされた
   *   When  web/src/ui/focus-view/focus-view.css を BL-054 完了時点の状態と比較する
   *   Then  差分が無い
   *    かつ focus-view.css に .project-chip / .day-view__card セレクタが混入していない
   */
  describe("AC-8: focus-view.css に .project-chip が混入していない (REQ-8 / リスク R-4 緩和)", () => {
    it("focus-view.css に .project-chip キーワードが含まれない", () => {
      const css = readFileSync(focusViewCssPath, "utf-8");
      expect(css).not.toContain(".project-chip");
      expect(css).not.toContain("project-chip");
    });

    it("focus-view.css に .day-view__card セレクタが含まれない (名前空間分離)", () => {
      const css = readFileSync(focusViewCssPath, "utf-8");
      expect(css).not.toContain(".day-view__card");
    });
  });

  // ----------------------------------------------------------
  // AC-9: ProjectToggle 専用 CSS (project-toggle.css) を変更していない (REQ-9)
  // ----------------------------------------------------------
  /**
   * シナリオ AC-9:
   *   Given 本 BL の実装がマージされた
   *   When  web/src/ui/project-toggle/project-toggle.css を BL-054 完了時点の状態と比較する
   *   Then  差分が無い (.project-toggle__button の宣言は維持される)
   *    かつ .project-chip セレクタが追加されていない
   */
  describe("AC-9: project-toggle.css に .project-chip が追加されていない (REQ-9 / D-004)", () => {
    it("project-toggle.css が存在する", () => {
      expect(existsSync(projectToggleCssPath)).toBe(true);
    });

    it("project-toggle.css に .project-chip セレクタが含まれない", () => {
      const css = readFileSync(projectToggleCssPath, "utf-8");
      // 「.project-chip」(セレクタ) または「project-chip」(キーワード) が混入していない.
      expect(css).not.toContain(".project-chip");
      expect(css).not.toContain("project-chip");
    });

    it("project-toggle.css に既存 .project-toggle__button の宣言が残っている (回帰防止)", () => {
      const css = readFileSync(projectToggleCssPath, "utf-8");
      const body = extractRuleBody(css, ".project-toggle__button");
      expect(body, ".project-toggle__button ルールが見つからない").not.toBeNull();
      const bodyText = body ?? "";
      // BL-046 で確定済みの border 宣言 (本 BL では撤去しない).
      expect(bodyText).toMatch(/border\s*:\s*1px\s+solid\s+var\(--color-fg-subtle\)/);
      // 視覚以外の振る舞い (cursor / min-height) も残っている.
      expect(bodyText).toMatch(/cursor\s*:\s*pointer/);
      expect(bodyText).toMatch(/min-height\s*:\s*44px/);
    });
  });

  // ----------------------------------------------------------
  // AC-10: day-view.css 全体に box-shadow を追加していない (NFR-NO-SHADOW)
  // ----------------------------------------------------------
  /**
   * シナリオ AC-10:
   *   Given web/src/ui/day-view/day-view.css を開いた
   *   When  ファイル全体を観察する
   *   Then  box-shadow キーワードを含む宣言が存在しない
   */
  describe("AC-10: day-view.css 全体で box-shadow を追加していない (NFR-NO-SHADOW)", () => {
    it("day-view.css の全文に box-shadow キーワードが含まれない", () => {
      const css = readFileSync(dayViewCssPath, "utf-8");
      expect(css).not.toContain("box-shadow");
    });
  });

  // ----------------------------------------------------------
  // AC-11: .project-chip ルールに hover / transition / animation / box-shadow / background が含まれない
  // ----------------------------------------------------------
  /**
   * シナリオ AC-11:
   *   Given web/src/ui/day-view/day-view.css を開いた
   *   When  .project-chip セレクタのルール本文を観察する
   *   Then  background / background-color の宣言を含まない
   *    かつ box-shadow の宣言を含まない
   *    かつ transition の宣言を含まない
   *    かつ animation の宣言を含まない
   *    かつ .project-chip:hover / .project-chip:focus-visible 等の派生セレクタを CSS 内に持たない
   */
  describe("AC-11: .project-chip ルールに hover / transition / animation / box-shadow / background が無い", () => {
    it(".project-chip ルール本文に background / background-color 宣言が含まれない (D-007)", () => {
      const css = readFileSync(dayViewCssPath, "utf-8");
      const body = extractRuleBody(css, ".project-chip");
      // 実装前は body=null になる. その場合は AC-1 側で red になるため
      // 本テストは「ルールが存在し, かつ禁止宣言が無い」を assert する.
      expect(body, ".project-chip ルールが見つからない").not.toBeNull();
      expect(body ?? "").not.toMatch(/(?:^|;|\n)\s*background(?:-color)?\s*:/);
    });

    it(".project-chip ルール本文に box-shadow 宣言が含まれない (NFR-NO-SHADOW)", () => {
      const css = readFileSync(dayViewCssPath, "utf-8");
      const body = extractRuleBody(css, ".project-chip");
      expect(body, ".project-chip ルールが見つからない").not.toBeNull();
      expect(body ?? "").not.toMatch(/(?:^|;|\n)\s*box-shadow\s*:/);
    });

    it(".project-chip ルール本文に transition 宣言が含まれない (NFR-NO-HOVER-TRANSITION)", () => {
      const css = readFileSync(dayViewCssPath, "utf-8");
      const body = extractRuleBody(css, ".project-chip");
      expect(body, ".project-chip ルールが見つからない").not.toBeNull();
      expect(body ?? "").not.toMatch(/(?:^|;|\n)\s*transition\s*:/);
    });

    it(".project-chip ルール本文に animation 宣言が含まれない (NFR-NO-HOVER-TRANSITION)", () => {
      const css = readFileSync(dayViewCssPath, "utf-8");
      const body = extractRuleBody(css, ".project-chip");
      expect(body, ".project-chip ルールが見つからない").not.toBeNull();
      expect(body ?? "").not.toMatch(/(?:^|;|\n)\s*animation\s*:/);
    });

    it("day-view.css 全体に .project-chip:hover セレクタが存在しない", () => {
      const css = readFileSync(dayViewCssPath, "utf-8");
      expect(css).not.toContain(".project-chip:hover");
    });

    it("day-view.css 全体に .project-chip:focus-visible セレクタが存在しない", () => {
      const css = readFileSync(dayViewCssPath, "utf-8");
      expect(css).not.toContain(".project-chip:focus-visible");
    });

    it("day-view.css 全体に .project-chip:active セレクタが存在しない", () => {
      const css = readFileSync(dayViewCssPath, "utf-8");
      expect(css).not.toContain(".project-chip:active");
    });
  });
});
