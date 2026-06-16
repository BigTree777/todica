// @vitest-environment jsdom

/**
 * タスクカードの 3 段ゾーンレイアウト (BL-057 / task-card-zone-layout) 受け入れ基準テスト.
 *
 * 仕様参照:
 *   docs/developer/features/task-card-zone-layout/spec.md
 *   docs/developer/features/task-card-zone-layout/plan.md
 *   docs/developer/features/task-card-zone-layout/tasks.md
 *
 * 本ファイルは BL-057 の TDD red を作るための原ファイルだが,
 * BL-059 (task-card-component) で 3 段ゾーン構造の責務を `.day-view__card__*` から
 * `.task-card__*` へ全面移譲したため, assertion を全て新クラスへ書き換えた (D-009 / D-011).
 *
 * 旧 → 新セレクタの対応:
 *   .day-view__card           → .task-card
 *   .day-view__card--focus    → .task-card--focus
 *   .day-view__card__header   → .task-card__header
 *   .day-view__card__title    → .task-card__title
 *   .day-view__card__actions  → .task-card__actions
 *
 * BL-057 当時の確定値 → BL-059 で変更された確定値:
 *   .task-card__title  : justify-content: space-between → center (V-4)
 *   .task-card__actions: justify-content: flex-end      → center (V-2)
 *
 * 本ファイルが検証する受け入れ基準:
 *   AC-1 (BL-059 追従): .task-card が 3 段ゾーン構造のレイアウト宣言を持つ (CSS 直読み).
 *   AC-2 (BL-059 追従): .task-card の border-radius が --radius-lg (CSS 直読み).
 *   AC-3 (BL-059 追従): 3 子クラス (.task-card__header / __title / __actions) が定義
 *                       されている (CSS 直読み). title 段は center / actions 段も center.
 *   AC-4 (BL-059 追従): today-view の各タスクカード (<li class="task-card">) に 3 子要素が存在.
 *   AC-5 (BL-059 追従): tomorrow-view の各タスクカードに 3 子要素が存在.
 *   AC-6 (BL-059 追従): .task-card__actions の中に「削除」「明日にする」「完了」が存在.
 *   AC-7 (BL-059 追従): 「現在のタスクにする」 button が .task-card__actions 内に存在 (D-002).
 *   AC-8 (BL-059 追従): <PriorityStars /> (radiogroup) が .task-card__header 内に存在.
 *                       BL-057 では title 段に置いたが BL-059 V-3 で header 段右に移動.
 *   AC-9 (BL-059 追従): .project-chip が .task-card__header 内に配置されている.
 *   AC-10 (BL-059 追従): プロジェクト未設定タスクでも 3 段子要素は存在する.
 *   AC-11: tokens.css が変更されていない (NFR-NO-NEW-TOKENS).
 *   AC-12 (BL-059 追従): focus-view も <TaskCard> に統一済 (= BL-059 で focus-view が
 *                        新規 task-card 名前空間に合流). focus-view.tsx に
 *                        day-view__card__ 系文字列が存在しない / focus-view.css にも無い.
 *   AC-13 (BL-059 追従): day-view.css 対象外セレクタの不変性. 旧 .day-view__card / .day-view__form
 *                        は撤去済みのため, 維持セレクタ (.day-view__list 等) のみ確認.
 *   AC-14: day-view.css 全体で box-shadow を追加していない (NFR-NO-SHADOW).
 *   AC-15 (BL-059 追従): 新規 .task-card__* 子クラスに hover / transition / animation /
 *                        box-shadow が含まれない.
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
// BL-059 で新設された task-card.css.
const taskCardCssPath = resolve(webSrcRoot, "ui/task-card/task-card.css");
const tokensCssPath = resolve(webSrcRoot, "styles/tokens.css");
const focusViewCssPath = resolve(webSrcRoot, "ui/focus-view/focus-view.css");
const focusViewTsxPath = resolve(webSrcRoot, "ui/focus-view/focus-view.tsx");

const NOW = "2026-06-11T09:00:00.000Z";
const PROJECT_ID_P1 = "p1p1p1p1-p1p1-4p1p-8p1p-p1p1p1p1p1p1";
const PROJECT_NAME_P1 = "プロジェクトα";

// ============================================================
// CSS ルール本文の抽出ヘルパ (P-005 / BL-052 / BL-054 / BL-056 / BL-059 と同形式)
// ============================================================

function extractRuleBody(css: string, selector: string): string | null {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`, "m");
  const m = css.match(re);
  return m?.[1] ?? null;
}

// ============================================================
// DOM レンダテスト用ヘルパ
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

describe("タスクカードの 3 段ゾーンレイアウト (BL-057, BL-059 で .task-card 系に移譲)", () => {
  // ----------------------------------------------------------
  // AC-1 (BL-059 追従): .task-card が 3 段ゾーン構造のレイアウト宣言を持つ
  // ----------------------------------------------------------
  describe("AC-1 (BL-059 追従): .task-card が 3 段ゾーン構造のレイアウト宣言を持つ", () => {
    it("task-card.css が存在する", () => {
      expect(existsSync(taskCardCssPath)).toBe(true);
    });

    it(".task-card ルール本文に display: flex を含む", () => {
      const css = readFileSync(taskCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".task-card");
      expect(body, ".task-card ルールが見つからない").not.toBeNull();
      expect(body ?? "").toMatch(/display\s*:\s*flex/);
    });

    it(".task-card ルール本文に flex-direction: column を含む (BL-057 → BL-059 移譲)", () => {
      const css = readFileSync(taskCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".task-card");
      expect(body, ".task-card ルールが見つからない").not.toBeNull();
      expect(body ?? "").toMatch(/flex-direction\s*:\s*column/);
    });

    it(".task-card ルール本文に gap: var(--space-md) を含む", () => {
      const css = readFileSync(taskCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".task-card");
      expect(body, ".task-card ルールが見つからない").not.toBeNull();
      expect(body ?? "").toMatch(/(?:^|;|\n)\s*gap\s*:\s*var\(--space-md\)/);
    });

    it(".task-card ルール本文に background: var(--color-bg) / border / padding を含む (BL-052 → BL-059 移譲)", () => {
      const css = readFileSync(taskCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".task-card");
      expect(body, ".task-card ルールが見つからない").not.toBeNull();
      const bodyText = body ?? "";
      expect(bodyText).toMatch(/background(?:-color)?\s*:\s*var\(--color-bg\)/);
      const hasShorthand = /border\s*:\s*1px\s+solid\s+var\(--color-border\)/.test(bodyText);
      const hasDecomposed =
        /border-width\s*:\s*1px/.test(bodyText) &&
        /border-style\s*:\s*solid/.test(bodyText) &&
        /border-color\s*:\s*var\(--color-border\)/.test(bodyText);
      expect(hasShorthand || hasDecomposed).toBe(true);
      expect(bodyText).toMatch(/(?:^|;|\n)\s*padding\s*:\s*var\(--space-md\)/);
    });
  });

  // ----------------------------------------------------------
  // AC-2 (BL-059 追従): .task-card の border-radius が --radius-lg
  // ----------------------------------------------------------
  describe("AC-2 (BL-059 追従): .task-card の border-radius が --radius-lg", () => {
    it(".task-card ルール本文に border-radius: var(--radius-lg) を含む", () => {
      const css = readFileSync(taskCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".task-card");
      expect(body, ".task-card ルールが見つからない").not.toBeNull();
      expect(body ?? "").toMatch(/border-radius\s*:\s*var\(--radius-lg\)/);
    });
  });

  // ----------------------------------------------------------
  // AC-3 (BL-059 追従): 3 子クラス (.task-card__header / __title / __actions) が定義されている
  // ----------------------------------------------------------
  /**
   * シナリオ AC-3 (BL-059 V-4 + BL-063 hotfix 追従):
   *   - .task-card__title  : justify-content: center (V-4)
   *   - .task-card__actions: justify-content の中央/右寄せは撤去 (BL-063 REQ-2 / D-007)
   *   - .task-card__header : justify-content: space-between (V-3)
   *
   * 注: BL-059 当初は .task-card__actions { justify-content: center } (V-2) を期待していたが,
   *      BL-063 (task-card-hotfix) で「削除 左端 / 完了 右端 / 中間 中央寄り」を子要素の
   *      auto-margin で実現するため V-2 は撤去された (D-007 / P-009 / 追従).
   */
  describe("AC-3 (BL-059 追従): 3 子クラスが定義されている", () => {
    it(".task-card__header ルールが task-card.css に定義されている", () => {
      const css = readFileSync(taskCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".task-card__header");
      expect(body, ".task-card__header ルールが task-card.css に見つからない").not.toBeNull();
      expect(body ?? "").toMatch(/display\s*:\s*flex/);
    });

    it(".task-card__title ルールが task-card.css に定義されている", () => {
      const css = readFileSync(taskCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".task-card__title");
      expect(body, ".task-card__title ルールが task-card.css に見つからない").not.toBeNull();
      expect(body ?? "").toMatch(/display\s*:\s*flex/);
    });

    it(".task-card__actions ルールが task-card.css に定義されている", () => {
      const css = readFileSync(taskCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".task-card__actions");
      expect(body, ".task-card__actions ルールが task-card.css に見つからない").not.toBeNull();
      expect(body ?? "").toMatch(/display\s*:\s*flex/);
    });

    it(".task-card__actions ルール本文に justify-content: center / flex-end を含まない (BL-063 REQ-2 / D-007 で V-2 撤去)", () => {
      const css = readFileSync(taskCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".task-card__actions");
      expect(body, ".task-card__actions ルールが見つからない").not.toBeNull();
      expect(body ?? "").not.toMatch(/justify-content\s*:\s*center/);
      expect(body ?? "").not.toMatch(/justify-content\s*:\s*flex-end/);
    });

    it(".task-card__title ルール本文に justify-content: center を含む (BL-059 V-4 / 旧 space-between → center)", () => {
      const css = readFileSync(taskCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".task-card__title");
      expect(body, ".task-card__title ルールが見つからない").not.toBeNull();
      expect(body ?? "").toMatch(/justify-content\s*:\s*center/);
    });
  });

  // ----------------------------------------------------------
  // AC-4 (BL-059 追従): today-view の各タスクカード <li.task-card> 内に 3 子要素が存在する
  // ----------------------------------------------------------
  describe("AC-4 (BL-059 追従): today-view の <li.task-card> 内に 3 子要素が存在する", () => {
    it("today-view の otherTasks <li> 内に .task-card__header / __title / __actions が存在する", async () => {
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

      // BL-070 追従: <span>{name}</span> は input に置換され, name は value 属性に入る.
      const taskNameNode = await screen.findByDisplayValue("通常タスク");
      const card = taskNameNode.closest("li");
      expect(card, "「通常タスク」を含む <li> が見つからない").not.toBeNull();
      expect(card?.classList.contains("task-card")).toBe(true);

      expect(card?.querySelector(".task-card__header")).not.toBeNull();
      expect(card?.querySelector(".task-card__title")).not.toBeNull();
      expect(card?.querySelector(".task-card__actions")).not.toBeNull();
    });

    it("today-view の focusedTask <section.task-card--focus> 内にも 3 子要素が存在する (G-2)", async () => {
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
      expect(focusSection.classList.contains("task-card")).toBe(true);
      expect(focusSection.classList.contains("task-card--focus")).toBe(true);
      expect(focusSection.querySelector(".task-card__header")).not.toBeNull();
      expect(focusSection.querySelector(".task-card__title")).not.toBeNull();
      expect(focusSection.querySelector(".task-card__actions")).not.toBeNull();
    });
  });

  // ----------------------------------------------------------
  // AC-5 (BL-059 追従): tomorrow-view の各タスクカードに 3 子要素が DOM 上に存在する
  // ----------------------------------------------------------
  describe("AC-5 (BL-059 追従): tomorrow-view の <li.task-card> 内に 3 子要素が存在する", () => {
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

      // BL-070 追従: name は input value に入る.
      const taskNameNode = await screen.findByDisplayValue("明日タスク");
      const card = taskNameNode.closest("li");
      expect(card, "「明日タスク」を含む <li> が見つからない").not.toBeNull();
      expect(card?.classList.contains("task-card")).toBe(true);

      expect(card?.querySelector(".task-card__header")).not.toBeNull();
      expect(card?.querySelector(".task-card__title")).not.toBeNull();
      expect(card?.querySelector(".task-card__actions")).not.toBeNull();
    });
  });

  // ----------------------------------------------------------
  // AC-6 (BL-059 追従): .task-card__actions に「削除」「明日にする」「完了」 button が存在する
  // ----------------------------------------------------------
  describe("AC-6 (BL-059 追従): .task-card__actions に 3 ボタン (削除 / 明日にする / 完了) が存在する", () => {
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

      // BL-070 追従: <span>{name}</span> は input に置換され, name は value 属性に入る.
      const taskNameNode = await screen.findByDisplayValue("通常タスク");
      const card = taskNameNode.closest("li");
      expect(card, "「通常タスク」を含む <li> が見つからない").not.toBeNull();

      const actions = card?.querySelector(".task-card__actions");
      expect(actions, ".task-card__actions が <li> 内に存在しない").not.toBeNull();

      const buttonTexts = Array.from(actions?.querySelectorAll("button") ?? []).map(
        (b) => b.textContent ?? "",
      );

      expect(buttonTexts.some((t) => t.includes("削除"))).toBe(true);
      expect(buttonTexts.some((t) => t.includes("明日にする"))).toBe(true);
      expect(buttonTexts.some((t) => t.includes("完了"))).toBe(true);
    });
  });

  // ----------------------------------------------------------
  // AC-7 (BL-059 追従): 「現在のタスクにする」 button が .task-card__actions 内に存在する (D-002)
  // ----------------------------------------------------------
  describe("AC-7 (BL-059 追従): 「現在のタスクにする」 button が .task-card__actions 内に存在する", () => {
    it("today-view の otherTasks カードの actions 内に「現在のタスクにする」 button が存在し header / title には無い", async () => {
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

      // BL-070 追従: <span>{name}</span> は input に置換され, name は value 属性に入る.
      const taskNameNode = await screen.findByDisplayValue("通常タスク");
      const card = taskNameNode.closest("li");
      expect(card, "「通常タスク」を含む <li> が見つからない").not.toBeNull();

      const actions = card?.querySelector(".task-card__actions");
      expect(actions, ".task-card__actions が <li> 内に存在しない").not.toBeNull();

      const actionButtonTexts = Array.from(actions?.querySelectorAll("button") ?? []).map(
        (b) => b.textContent ?? "",
      );
      expect(actionButtonTexts.some((t) => t.includes("現在のタスクにする"))).toBe(true);

      const header = card?.querySelector(".task-card__header");
      const title = card?.querySelector(".task-card__title");
      const headerHasSetFocus = Array.from(header?.querySelectorAll("button") ?? []).some((b) =>
        (b.textContent ?? "").includes("現在のタスクにする"),
      );
      const titleHasSetFocus = Array.from(title?.querySelectorAll("button") ?? []).some((b) =>
        (b.textContent ?? "").includes("現在のタスクにする"),
      );
      expect(headerHasSetFocus).toBe(false);
      expect(titleHasSetFocus).toBe(false);
    });
  });

  // ----------------------------------------------------------
  // AC-8 (BL-059 追従): <PriorityStars /> (radiogroup) が .task-card__header 内に存在する
  // ----------------------------------------------------------
  /**
   * BL-057 当時は title 段に radiogroup を配置していたが,
   * BL-059 V-3 で header 段の右側 (chip と対角) に移動した (D-002 / D-006).
   */
  describe("AC-8 (BL-059 V-3 追従): <PriorityStars /> (radiogroup) が .task-card__header 内に存在する", () => {
    it("today-view の otherTasks カードの header 内に radiogroup が存在し title / actions には無い", async () => {
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

      // BL-070 追従: <span>{name}</span> は input に置換され, name は value 属性に入る.
      const taskNameNode = await screen.findByDisplayValue("通常タスク");
      const card = taskNameNode.closest("li");
      expect(card, "「通常タスク」を含む <li> が見つからない").not.toBeNull();

      const header = card?.querySelector(".task-card__header");
      expect(header, ".task-card__header が <li> 内に存在しない").not.toBeNull();

      expect(
        header?.querySelector('[role="radiogroup"]'),
        'header 段に role="radiogroup" 要素 (= <PriorityStars />) が存在しない (BL-059 V-3 違反)',
      ).not.toBeNull();

      const title = card?.querySelector(".task-card__title");
      const actions = card?.querySelector(".task-card__actions");
      expect(title?.querySelector('[role="radiogroup"]') ?? null).toBeNull();
      expect(actions?.querySelector('[role="radiogroup"]') ?? null).toBeNull();
    });
  });

  // ----------------------------------------------------------
  // AC-9 (BL-059 追従): .project-chip が .task-card__header 内に配置されている
  // ----------------------------------------------------------
  describe("AC-9 (BL-059 追従): .project-chip が .task-card__header 内に配置されている", () => {
    it("today-view の project 割り当て済みカードの header 内に chip が存在し title / actions には無い", async () => {
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

      // BL-070 追従: name は input value に入る.
      const taskNameNode = await screen.findByDisplayValue("プロジェクト付きタスク");
      const card = taskNameNode.closest("li");
      expect(card, "「プロジェクト付きタスク」を含む <li> が見つからない").not.toBeNull();

      const header = card?.querySelector(".task-card__header");
      const title = card?.querySelector(".task-card__title");
      const actions = card?.querySelector(".task-card__actions");
      expect(header, ".task-card__header が <li> 内に存在しない").not.toBeNull();

      const chipInHeader = header?.querySelector(".project-chip") ?? null;
      expect(chipInHeader, "header 段に .project-chip が存在しない").not.toBeNull();
      expect(chipInHeader?.textContent ?? "").toContain(PROJECT_NAME_P1);

      expect(title?.querySelector(".project-chip") ?? null).toBeNull();
      expect(actions?.querySelector(".project-chip") ?? null).toBeNull();
    });
  });

  // ----------------------------------------------------------
  // AC-10 (BL-059 追従): プロジェクト未設定タスクでも 3 段子要素は DOM 上に存在する
  // ----------------------------------------------------------
  describe("AC-10 (BL-059 追従): プロジェクト未設定タスクでも 3 段子要素が存在する", () => {
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

      // BL-070 追従: name は input value に入る.
      const taskNameNode = await screen.findByDisplayValue("未分類タスク");
      const card = taskNameNode.closest("li");
      expect(card, "「未分類タスク」を含む <li> が見つからない").not.toBeNull();

      const header = card?.querySelector(".task-card__header");
      expect(header).not.toBeNull();
      expect(header?.querySelector(".project-chip") ?? null).toBeNull();

      expect(card?.querySelector(".task-card__title")).not.toBeNull();
      expect(card?.querySelector(".task-card__actions")).not.toBeNull();
    });
  });

  // ----------------------------------------------------------
  // AC-11: tokens.css が変更されていない (NFR-NO-NEW-TOKENS)
  // ----------------------------------------------------------
  describe("AC-11: tokens.css に必須トークンが残っている (NFR-NO-NEW-TOKENS)", () => {
    it("tokens.css に本 BL で参照する 3 トークン (--radius-lg / --space-md / --space-sm) が定義されている", () => {
      const css = readFileSync(tokensCssPath, "utf-8");
      expect(css).toMatch(/--radius-lg\s*:/);
      expect(css).toMatch(/--space-md\s*:/);
      expect(css).toMatch(/--space-sm\s*:/);
    });

    it("tokens.css に本 BL では追加すべきでない --radius-xl が存在しない", () => {
      const css = readFileSync(tokensCssPath, "utf-8");
      expect(css).not.toMatch(/--radius-xl\s*:/);
    });

    it("tokens.css に本 BL では追加すべきでない --shadow-* トークンが存在しない", () => {
      const css = readFileSync(tokensCssPath, "utf-8");
      expect(css).not.toMatch(/--shadow-/);
    });
  });

  // ----------------------------------------------------------
  // AC-12 (BL-059 追従): focus-view も <TaskCard> に統一 / 旧 day-view__card__ 文字列が混入していない
  // ----------------------------------------------------------
  /**
   * BL-057 当時は focus-view を「無改修」にする方針だったが,
   * BL-059 で focus-view も <TaskCard variant="focus" actionSet="minimal"> に合流させた.
   * 結果として focus-view.css / focus-view.tsx に旧 day-view__card 系文字列が
   * 混入していないこと自体は引き続き保証する.
   */
  describe("AC-12 (BL-059 追従): focus-view に day-view__card 系名前空間が混入していない", () => {
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
  // AC-13 (BL-059 追従): 維持セレクタへの不変性 (= 旧 .day-view__card / .day-view__form は撤去済)
  // ----------------------------------------------------------
  describe("AC-13 (BL-059 追従): 維持セレクタへの不変性", () => {
    const STRUCTURE_SELECTORS = [
      ".day-view",
      ".day-view__header",
      ".day-view__list",
      ".day-view__empty",
    ] as const;

    it.each(
      STRUCTURE_SELECTORS,
    )("%s ルール本文に新規 task-card__ 系キーワードが混入していない", (selector) => {
      const css = readFileSync(dayViewCssPath, "utf-8");
      const body = extractRuleBody(css, selector);
      expect(body, `${selector} ルールが見つからない`).not.toBeNull();
      const bodyText = body ?? "";
      expect(bodyText).not.toMatch(/task-card__/);
      // 旧 day-view__card__ も混入しないこと (BL-059 で撤去).
      expect(bodyText).not.toMatch(/day-view__card__/);
    });

    it(".project-chip ルール本文は BL-056 確定値のままで, 本 BL でも書き換えられていない", () => {
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
      expect(bodyText).toMatch(/(?:^|;|\n)\s*color\s*:\s*var\(--color-fg\)/);
      expect(bodyText).not.toMatch(/day-view__card__/);
      expect(bodyText).not.toMatch(/task-card__/);
    });

    it("旧 .day-view__card 系ルールが day-view.css から撤去されている (BL-059 で .task-card に移譲)", () => {
      const css = readFileSync(dayViewCssPath, "utf-8");
      expect(extractRuleBody(css, ".day-view__card")).toBeNull();
      expect(extractRuleBody(css, ".day-view__card--focus")).toBeNull();
    });

    it("旧 .day-view__form 系ルールが day-view.css から撤去されている (BL-059 で .task-card--form に移譲)", () => {
      const css = readFileSync(dayViewCssPath, "utf-8");
      expect(extractRuleBody(css, ".day-view__form")).toBeNull();
    });
  });

  // ----------------------------------------------------------
  // AC-14: day-view.css / task-card.css 全体で box-shadow を追加していない
  // ----------------------------------------------------------
  describe("AC-14: box-shadow が追加されていない (NFR-NO-SHADOW)", () => {
    it("day-view.css の全文に box-shadow キーワードが含まれない", () => {
      const css = readFileSync(dayViewCssPath, "utf-8");
      expect(css).not.toContain("box-shadow");
    });

    it("task-card.css の全文に box-shadow キーワードが含まれない", () => {
      const css = readFileSync(taskCardCssPath, "utf-8");
      expect(css).not.toContain("box-shadow");
    });
  });

  // ----------------------------------------------------------
  // AC-15 (BL-059 追従): 新規 .task-card__* 子クラスに hover / transition / animation /
  //                      box-shadow が含まれない
  // ----------------------------------------------------------
  describe("AC-15 (BL-059 追従): .task-card__* 子クラスに hover / transition / animation / box-shadow 無し", () => {
    const NEW_CHILD_SELECTORS = [
      ".task-card__header",
      ".task-card__title",
      ".task-card__actions",
    ] as const;

    it.each(NEW_CHILD_SELECTORS)("%s ルール本文に box-shadow 宣言が含まれない", (selector) => {
      const css = readFileSync(taskCardCssPath, "utf-8");
      const body = extractRuleBody(css, selector);
      expect(body, `${selector} ルールが見つからない`).not.toBeNull();
      expect(body ?? "").not.toMatch(/(?:^|;|\n)\s*box-shadow\s*:/);
    });

    it.each(NEW_CHILD_SELECTORS)("%s ルール本文に transition 宣言が含まれない", (selector) => {
      const css = readFileSync(taskCardCssPath, "utf-8");
      const body = extractRuleBody(css, selector);
      expect(body, `${selector} ルールが見つからない`).not.toBeNull();
      expect(body ?? "").not.toMatch(/(?:^|;|\n)\s*transition\s*:/);
    });

    it.each(NEW_CHILD_SELECTORS)("%s ルール本文に animation 宣言が含まれない", (selector) => {
      const css = readFileSync(taskCardCssPath, "utf-8");
      const body = extractRuleBody(css, selector);
      expect(body, `${selector} ルールが見つからない`).not.toBeNull();
      expect(body ?? "").not.toMatch(/(?:^|;|\n)\s*animation\s*:/);
    });

    it.each(NEW_CHILD_SELECTORS)("%s:hover 等の派生セレクタが CSS 内に存在しない", (selector) => {
      const css = readFileSync(taskCardCssPath, "utf-8");
      expect(css).not.toContain(`${selector}:hover`);
      expect(css).not.toContain(`${selector}:focus-visible`);
      expect(css).not.toContain(`${selector}:active`);
    });
  });
});
