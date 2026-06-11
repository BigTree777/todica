// @vitest-environment jsdom

/**
 * 起票フォームのレイアウト 2D グリッド化 (BL-058 / task-form-grid-layout) 受け入れ基準テスト.
 *
 * 仕様参照:
 *   docs/developer/features/task-form-grid-layout/spec.md
 *   docs/developer/features/task-form-grid-layout/plan.md
 *   docs/developer/features/task-form-grid-layout/tasks.md
 *
 * 本ファイルは BL-058 の TDD red を作る原ファイルだが,
 * BL-059 (task-card-component) で起票カードの責務を `.day-view__form` から
 * `.task-card.task-card--form` (3 段 flex column) へ全面移譲した.
 * BL-058 で導入した 2D grid layout と「↑タップで選択」「優先度」label span は
 * 全て撤去となるため, assertion を反転 / 撤去確認に書き換えた (D-009 / D-011).
 *
 * BL-058 当時の意図 → BL-059 で逆転:
 *   - .day-view__form の grid-template-areas (2D) → 撤去 (3 段 flex column へ移行).
 *   - 「↑タップで選択」 hint span → 撤去 (V-6).
 *   - 「優先度」 label span (#task-priority-label 等) → 撤去 (V-6).
 *   - <PriorityStars /> 配置: 起票カード priority zone (BL-058) → header 段右側 (BL-059 V-3).
 *   - タスク名 label/input 関連付け (= getByLabelText('タスク名')) → 引き続き維持.
 *
 * 本ファイルが検証する受け入れ基準:
 *   AC-1 (BL-059 追従): 旧 .day-view__form の grid layout 宣言は撤去 (= ルール自体撤去).
 *   AC-2 (BL-059 追従): .day-view__form の grid-template-areas は撤去.
 *   AC-3 (BL-059 追従): .day-view__form の grid-template-columns は撤去.
 *   AC-4 (BL-059 追従): .day-view__form の gap 宣言は撤去 (= ルール自体撤去).
 *   AC-5 (BL-059 追従): BL-054 visual 4 宣言は `.task-card` 基底に移譲済み.
 *   AC-6 (BL-059 追従): 旧 .day-view__form__* 子クラスは全て撤去.
 *   AC-7 (BL-059 追従): submit ボタン中央揃え (旧 right end ではない).
 *   AC-8 (BL-059 追従 / 反転): today-view JSX に「↑タップで選択」が存在しない.
 *   AC-9 (BL-059 追従 / 反転): tomorrow-view JSX に「↑タップで選択」が存在しない.
 *   AC-10: タスク名 label/input 関連付けが保持されている (引き続き有効).
 *   AC-11: PriorityStars / ProjectToggle コンポーネント本体無改修 (引き続き有効).
 *   AC-12: tokens.css を変更していない (引き続き有効).
 *   AC-13: focus-view を変更していない (引き続き有効 / 範囲拡大: focus-view.tsx は
 *          BL-059 で <TaskCard> に切替えられたが day-view__form 系の文字列は混入していない).
 *   AC-14 (BL-059 追従): .project-chip ルール本文は無改修 / .day-view__card 系は撤去済み.
 *   AC-18: hover / transition / animation / box-shadow が追加されていない.
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
const taskCardCssPath = resolve(webSrcRoot, "ui/task-card/task-card.css");
const tokensCssPath = resolve(webSrcRoot, "styles/tokens.css");
const focusViewCssPath = resolve(webSrcRoot, "ui/focus-view/focus-view.css");
const focusViewTsxPath = resolve(webSrcRoot, "ui/focus-view/focus-view.tsx");
const priorityStarsTsxPath = resolve(webSrcRoot, "ui/priority-stars/priority-stars.tsx");
const projectToggleTsxPath = resolve(webSrcRoot, "ui/project-toggle/project-toggle.tsx");

const NOW = "2026-06-11T09:00:00.000Z";
const HINT_TEXT = "↑タップで選択";

// ============================================================
// CSS ルール本文の抽出ヘルパ (P-005)
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

describe("起票フォームのレイアウト (BL-058, BL-059 で 3 段 flex column に移行)", () => {
  // ----------------------------------------------------------
  // AC-1 (BL-059 追従): 旧 .day-view__form の grid layout 宣言は撤去 (= ルール自体撤去)
  // ----------------------------------------------------------
  describe("AC-1 (BL-059 追従): 旧 .day-view__form ルールが day-view.css に定義されていない", () => {
    it("day-view.css が存在する", () => {
      expect(existsSync(dayViewCssPath)).toBe(true);
    });

    it(".day-view__form ルールが day-view.css に定義されていない (BL-059 で `.task-card` 系に移譲済み)", () => {
      const css = readFileSync(dayViewCssPath, "utf-8");
      const body = extractRuleBody(css, ".day-view__form");
      expect(
        body,
        ".day-view__form ルールが残存している (BL-059 REQ-7 違反 / `.task-card.task-card--form` に移譲済み)",
      ).toBeNull();
    });

    it("task-card.css に display: flex / flex-direction: column の 3 段 flex column 宣言が存在する", () => {
      const css = readFileSync(taskCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".task-card");
      expect(body, ".task-card ルールが見つからない").not.toBeNull();
      const bodyText = body ?? "";
      expect(bodyText).toMatch(/display\s*:\s*flex/);
      expect(bodyText).toMatch(/flex-direction\s*:\s*column/);
    });
  });

  // ----------------------------------------------------------
  // AC-2 (BL-059 追従): .day-view__form の grid-template-areas は撤去
  // ----------------------------------------------------------
  describe("AC-2 (BL-059 追従): .day-view__form の grid-template-areas は撤去", () => {
    it("day-view.css 全文に grid-template-areas 宣言が含まれない (= 旧 .day-view__form ごと撤去)", () => {
      const css = readFileSync(dayViewCssPath, "utf-8");
      expect(css).not.toMatch(/grid-template-areas\s*:/);
    });
  });

  // ----------------------------------------------------------
  // AC-3 (BL-059 追従): .day-view__form の grid-template-columns は撤去
  // ----------------------------------------------------------
  describe("AC-3 (BL-059 追従): .day-view__form の grid-template-columns は撤去", () => {
    it("day-view.css 全文に grid-template-columns 宣言が含まれない", () => {
      const css = readFileSync(dayViewCssPath, "utf-8");
      expect(css).not.toMatch(/grid-template-columns\s*:/);
    });
  });

  // ----------------------------------------------------------
  // AC-4 (BL-059 追従): .day-view__form の gap 宣言は撤去 (= ルール自体撤去)
  // ----------------------------------------------------------
  describe("AC-4 (BL-059 追従): .day-view__form の gap は撤去 / .task-card の gap で代替", () => {
    it(".day-view__form が存在しないため gap も存在しない (NULL の透過確認)", () => {
      const css = readFileSync(dayViewCssPath, "utf-8");
      expect(extractRuleBody(css, ".day-view__form")).toBeNull();
    });

    it(".task-card ルール本文に gap: var(--space-md) が含まれる (= 3 段 flex column の段間 / BL-059)", () => {
      const css = readFileSync(taskCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".task-card");
      expect(body, ".task-card ルールが見つからない").not.toBeNull();
      expect(body ?? "").toMatch(/(?:^|;|\n)\s*gap\s*:\s*var\(--space-md\)/);
    });
  });

  // ----------------------------------------------------------
  // AC-5 (BL-059 追従): BL-054 visual 4 宣言は `.task-card` 基底に移譲済み
  // ----------------------------------------------------------
  describe("AC-5 (BL-059 追従): visual 4 宣言は `.task-card` 基底に移譲済み", () => {
    it(".task-card ルール本文に background / border / border-radius / padding を含む", () => {
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
      expect(bodyText).toMatch(/border-radius\s*:\s*var\(--radius-lg\)/);
      expect(bodyText).toMatch(/(?:^|;|\n)\s*padding\s*:\s*var\(--space-md\)/);
    });
  });

  // ----------------------------------------------------------
  // AC-6 (BL-059 追従): 旧 .day-view__form__* 子クラスは全て撤去
  // ----------------------------------------------------------
  describe("AC-6 (BL-059 追従): 旧 .day-view__form__* 子クラスは全て撤去", () => {
    const REMOVED_FORM_CHILD_SELECTORS = [
      ".day-view__form__project",
      ".day-view__form__priority",
      ".day-view__form__priority-hint",
      ".day-view__form__name",
      ".day-view__form__submit",
    ] as const;

    it.each(REMOVED_FORM_CHILD_SELECTORS)(
      "%s ルールが day-view.css に定義されていない",
      (selector) => {
        const css = readFileSync(dayViewCssPath, "utf-8");
        const body = extractRuleBody(css, selector);
        expect(body, `${selector} ルールが残存している (BL-059 で撤去)`).toBeNull();
      },
    );
  });

  // ----------------------------------------------------------
  // AC-7 (BL-059 追従): submit ボタンが中央揃え (= .task-card__actions の justify-content: center)
  // ----------------------------------------------------------
  describe("AC-7 (BL-059 追従): submit ボタンが .task-card__actions 内で中央揃え", () => {
    it(".task-card__actions ルール本文に justify-content: center を含む (V-2)", () => {
      const css = readFileSync(taskCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".task-card__actions");
      expect(body, ".task-card__actions ルールが見つからない").not.toBeNull();
      expect(body ?? "").toMatch(/justify-content\s*:\s*center/);
    });
  });

  // ----------------------------------------------------------
  // AC-8 (BL-059 追従 / 反転): today-view JSX に「↑タップで選択」が存在しない (V-6)
  // ----------------------------------------------------------
  describe("AC-8 (BL-059 V-6 反転): today-view の起票フォームに「↑タップで選択」が存在しない", () => {
    it("today-view の起票フォーム内に「↑タップで選択」テキストが存在しない", async () => {
      const repo = makeMockRepository([]);
      const projectRepo = makeMockProjectRepository([]);
      renderWithQueryClient(<TodayView repository={repo} projectRepository={projectRepo} />);

      const form = await screen.findByRole("form", { name: "タスク起票フォーム" });
      const hint = within(form).queryByText(HINT_TEXT);
      expect(
        hint,
        `today-view の起票フォーム内に「${HINT_TEXT}」テキストが残存 (V-6 違反 / BL-059 で撤去)`,
      ).toBeNull();
    });

    it("today-view の起票フォーム内に #task-priority-label が存在しない (V-6)", async () => {
      const repo = makeMockRepository([]);
      const projectRepo = makeMockProjectRepository([]);
      const { container } = renderWithQueryClient(
        <TodayView repository={repo} projectRepository={projectRepo} />,
      );
      await screen.findByRole("form", { name: "タスク起票フォーム" });
      expect(container.querySelector("#task-priority-label")).toBeNull();
    });
  });

  // ----------------------------------------------------------
  // AC-9 (BL-059 追従 / 反転): tomorrow-view JSX に「↑タップで選択」が存在しない (V-6)
  // ----------------------------------------------------------
  describe("AC-9 (BL-059 V-6 反転): tomorrow-view の起票フォームに「↑タップで選択」が存在しない", () => {
    it("tomorrow-view の起票フォーム内に「↑タップで選択」テキストが存在しない", async () => {
      const repo = makeMockRepository([]);
      const projectRepo = makeMockProjectRepository([]);
      renderWithQueryClient(<TomorrowView repository={repo} projectRepository={projectRepo} />);

      const form = await screen.findByRole("form", { name: "明日のタスク起票フォーム" });
      const hint = within(form).queryByText(HINT_TEXT);
      expect(hint).toBeNull();
    });

    it("tomorrow-view の起票フォーム内に #tomorrow-task-priority-label が存在しない (V-6)", async () => {
      const repo = makeMockRepository([]);
      const projectRepo = makeMockProjectRepository([]);
      const { container } = renderWithQueryClient(
        <TomorrowView repository={repo} projectRepository={projectRepo} />,
      );
      await screen.findByRole("form", { name: "明日のタスク起票フォーム" });
      expect(container.querySelector("#tomorrow-task-priority-label")).toBeNull();
    });
  });

  // ----------------------------------------------------------
  // AC-10: タスク名 label/input の関連付けが保持されている (NFR-LABEL-PRESERVE)
  // ----------------------------------------------------------
  describe("AC-10: タスク名 label/input の関連付けが保持されている (NFR-LABEL-PRESERVE)", () => {
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
  // AC-11: PriorityStars / ProjectToggle の prop API が無改修である
  // ----------------------------------------------------------
  describe("AC-11: PriorityStars / ProjectToggle の prop API が無改修", () => {
    it("priority-stars.tsx に `export interface PriorityStarsProps` が含まれる", () => {
      const tsx = readFileSync(priorityStarsTsxPath, "utf-8");
      expect(tsx).toMatch(/export\s+interface\s+PriorityStarsProps\b/);
    });

    it.each(["value", "onChange", "idPrefix", "groupLabel"])(
      "priority-stars.tsx に prop 名 '%s' が含まれる (BL-040 で確定)",
      (propName) => {
        const tsx = readFileSync(priorityStarsTsxPath, "utf-8");
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

    it("priority-stars.tsx に role='radiogroup' が含まれる", () => {
      const tsx = readFileSync(priorityStarsTsxPath, "utf-8");
      expect(tsx).toContain('role="radiogroup"');
    });

    it("project-toggle.tsx に project-toggle__button クラスが含まれる", () => {
      const tsx = readFileSync(projectToggleTsxPath, "utf-8");
      expect(tsx).toContain("project-toggle__button");
    });
  });

  // ----------------------------------------------------------
  // AC-12: tokens.css を変更していない
  // ----------------------------------------------------------
  describe("AC-12: tokens.css が変更されていない (NFR-NO-NEW-TOKENS)", () => {
    it("tokens.css に本 BL で参照する 2 トークン (--space-md / --space-sm) が定義されている", () => {
      const css = readFileSync(tokensCssPath, "utf-8");
      expect(css).toMatch(/--space-md\s*:/);
      expect(css).toMatch(/--space-sm\s*:/);
    });

    it("tokens.css に --shadow-* トークンが存在しない", () => {
      const css = readFileSync(tokensCssPath, "utf-8");
      expect(css).not.toMatch(/--shadow-/);
    });
  });

  // ----------------------------------------------------------
  // AC-13 (BL-059 追従): focus-view に day-view__form 系セレクタが混入していない
  // ----------------------------------------------------------
  describe("AC-13 (BL-059 追従): focus-view に day-view__form 系名前空間が混入していない", () => {
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
    ])("focus-view.css に %s が含まれない", (selector) => {
      const css = readFileSync(focusViewCssPath, "utf-8");
      expect(css).not.toContain(selector);
    });

    it("focus-view.tsx に day-view__form 系クラス文字列が含まれない", () => {
      const tsx = readFileSync(focusViewTsxPath, "utf-8");
      expect(tsx).not.toContain("day-view__form");
    });
  });

  // ----------------------------------------------------------
  // AC-14 (BL-059 追従): .project-chip ルール本文は無改修 / 旧 .day-view__card 系は撤去済み
  // ----------------------------------------------------------
  describe("AC-14 (BL-059 追従): .project-chip 無改修 / 旧 .day-view__card 系は撤去", () => {
    it(".project-chip ルール本文は BL-056 確定値のまま (border / radius-lg / font-size-small / color)", () => {
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

    it("旧 .day-view__card / .day-view__card--focus 系セレクタが day-view.css から撤去されている", () => {
      const css = readFileSync(dayViewCssPath, "utf-8");
      expect(extractRuleBody(css, ".day-view__card")).toBeNull();
      expect(extractRuleBody(css, ".day-view__card--focus")).toBeNull();
      expect(extractRuleBody(css, ".day-view__card__header")).toBeNull();
      expect(extractRuleBody(css, ".day-view__card__title")).toBeNull();
      expect(extractRuleBody(css, ".day-view__card__actions")).toBeNull();
    });
  });

  // ----------------------------------------------------------
  // AC-18: hover / transition / animation / box-shadow が追加されていない
  // ----------------------------------------------------------
  describe("AC-18: .task-card 系 / day-view.css に hover / transition / animation / box-shadow 無し", () => {
    it("day-view.css の全文に box-shadow キーワードが含まれない (NFR-NO-SHADOW)", () => {
      const css = readFileSync(dayViewCssPath, "utf-8");
      expect(css).not.toContain("box-shadow");
    });

    it("task-card.css の全文に box-shadow キーワードが含まれない (NFR-NO-SHADOW)", () => {
      const css = readFileSync(taskCardCssPath, "utf-8");
      expect(css).not.toContain("box-shadow");
    });

    it("task-card.css の全文に transition 宣言が含まれない (NFR-NO-HOVER-TRANSITION)", () => {
      const css = readFileSync(taskCardCssPath, "utf-8");
      expect(css).not.toMatch(/(?:^|;|\n|\{)\s*transition\s*:/);
    });

    it("task-card.css の全文に animation 宣言が含まれない (NFR-NO-HOVER-TRANSITION)", () => {
      const css = readFileSync(taskCardCssPath, "utf-8");
      expect(css).not.toMatch(/(?:^|;|\n|\{)\s*animation\s*:/);
    });

    it("task-card.css に .task-card:hover / .task-card--form:hover セレクタが存在しない", () => {
      const css = readFileSync(taskCardCssPath, "utf-8");
      expect(css).not.toContain(".task-card:hover");
      expect(css).not.toContain(".task-card--form:hover");
      expect(css).not.toContain(".task-card--form:focus-within");
    });
  });
});
