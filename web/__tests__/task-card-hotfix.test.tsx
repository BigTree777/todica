// @vitest-environment jsdom

/**
 * TaskCard / TaskFormCard 実機遺漏の一括 hotfix (BL-063 / task-card-hotfix) 受け入れ基準テスト.
 *
 * 仕様参照:
 *   docs/developer/features/task-card-hotfix/spec.md
 *   docs/developer/features/task-card-hotfix/plan.md
 *   docs/developer/features/task-card-hotfix/tasks.md
 *
 * 本ファイルが検証する受け入れ基準 (spec AC-1 〜 AC-25):
 *   AC-1 : .task-card__header__priority に margin-left: auto (CSS 直読み).
 *   AC-2 : <TaskCard project={null}> で .task-card__header__priority が radiogroup を内包 (DOM).
 *   AC-3 : 同条件で .task-card__header__priority の computed style margin-left が "auto" (DOM).
 *   AC-4 : .task-card__actions から justify-content: center / flex-end が撤去 (CSS 直読み).
 *   AC-5 : .task-card__actions__delete に margin-right: auto (CSS 直読み).
 *   AC-6 : .task-card__actions__complete に margin-left: auto (CSS 直読み).
 *   AC-7 : <TaskCard actionSet="full"> の 削除/完了 button に hotfix className (DOM).
 *   AC-8 : <TaskCard actionSet="minimal"> でも 削除/完了 に hotfix className (DOM).
 *   AC-9 : .task-card__header .project-chip に font-size: var(--font-size-small) (CSS).
 *   AC-10: <TaskFormCard> の ProjectToggle button の computed font-size が 14px (DOM).
 *   AC-11: .visually-hidden に position: absolute 等が定義されている (CSS).
 *   AC-12: <TaskFormCard> label に visually-hidden + input に placeholder="タスク名" (DOM).
 *   AC-13: .task-card__title input[type="text"]::placeholder に color: --color-fg-subtle (CSS).
 *   AC-14: .task-card--form .task-card__actions に justify-content: flex-end (CSS).
 *   AC-15: <TaskFormCard> の actions 内 button が「追加」1 個のみ (DOM).
 *   AC-16: TaskCardProps / TaskFormCardProps の export 型に差分が無い (ソース直読み).
 *   AC-17: PriorityStars / ProjectToggle / project-chip 本体が無改修 (ソース直読み).
 *   AC-18: tokens.css 無改修 (CSS).
 *   AC-19: focus-view の actions が 2 ボタン (削除/完了) + 各 hotfix className (DOM).
 *   AC-20: BL-059 V-1 / V-3 / V-4 / V-5 / V-7 / V-6 が維持されている (CSS / ソース).
 *   AC-21: today/tomorrow で getByLabelText("タスク名") が input を返す (DOM).
 *   AC-22: task-card.css に :hover / transition / animation / box-shadow が無い (CSS).
 *   AC-23 / AC-24 / AC-25: 単体テスト / E2E / a11y 全件 green は本ファイルでは個別 assert せず,
 *                          ルート npm test / npx playwright test の継続実行で担保する.
 *
 * 本ファイルは TDD の "red" を作るためのテスト.
 *   - 実装前 (= task-card.css に hotfix 宣言が無い, task-card.tsx に wrap div / hotfix className が無い,
 *     task-form-card.tsx に visually-hidden / placeholder が無い) では CSS 直読み系 (AC-1 / AC-4 〜 6 / 9 /
 *     11 / 13 / 14) と DOM レンダ系 (AC-2 / 3 / 7 / 8 / 10 / 12 / 15 / 19) が red になる想定.
 *   - 既存ファイル不変性系 (AC-16 / 17 / 18 / 20 / 22) は green が期待値.
 *   - AC-21 は BL-059 で既に成立しており green 維持.
 *   - implementer が REQ-1 〜 REQ-5 を実装することで red 群が green 化する.
 *
 * 検証スタイル:
 *   - CSS 直読み: BL-052 / BL-054 / BL-056 / BL-057 / BL-058 / BL-059 と同じ
 *     readFileSync + extractRuleBody (P-005). ヘルパは本ファイル内に再定義する.
 *   - DOM レンダ: BL-057 / BL-058 / BL-059 と同じ QueryClientProvider + render パターン.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { Task } from "@todica/domain/task";
import type { ComponentType, ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
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
import { FocusView } from "../src/ui/focus-view/focus-view.js";
import { TodayView } from "../src/ui/today-view/today-view.js";
import { TomorrowView } from "../src/ui/tomorrow-view/tomorrow-view.js";

// ============================================================
// 共通定数 / パス解決
// ============================================================

const repoRoot = resolve(__dirname, "../..");
const webSrcRoot = resolve(repoRoot, "web/src");

const taskCardCssPath = resolve(webSrcRoot, "ui/task-card/task-card.css");
const taskCardTsxPath = resolve(webSrcRoot, "ui/task-card/task-card.tsx");
const taskFormCardTsxPath = resolve(webSrcRoot, "ui/task-card/task-form-card.tsx");

const dayViewCssPath = resolve(webSrcRoot, "ui/day-view/day-view.css");
// BL-065 (project-toggle-removal): projectToggleCssPath / projectToggleTsxPath は撤去された.
// 旧 AC-10 / AC-17 内の ProjectToggle 不変性 assert もまとめて削除済み.
const tokensCssPath = resolve(webSrcRoot, "styles/tokens.css");
const todayViewTsxPath = resolve(webSrcRoot, "ui/today-view/today-view.tsx");
const _tomorrowViewTsxPath = resolve(webSrcRoot, "ui/tomorrow-view/tomorrow-view.tsx");
const priorityStarsTsxPath = resolve(webSrcRoot, "ui/priority-stars/priority-stars.tsx");

const NOW = "2026-06-11T09:00:00.000Z";
const PROJECT_ID_P1 = "p1p1p1p1-p1p1-4p1p-8p1p-p1p1p1p1p1p1";
const PROJECT_NAME_P1 = "プロジェクトα";

// ============================================================
// CSS ルール本文の抽出ヘルパ (BL-052 / BL-054 / BL-056 / BL-057 / BL-058 / BL-059 と同形)
// ============================================================

/**
 * 指定したセレクタの「ルール本文 (= {} で囲まれた中身)」を抽出する.
 *
 * セレクタの直後が空白 + `{` であるルールに限定する (= prefix 一致による誤検知を防ぐ).
 * BL-059 task-card-component.test.tsx のヘルパと同等実装の再定義 (P-005).
 */
function extractRuleBody(css: string, selector: string): string | null {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`, "m");
  const m = css.match(re);
  return m?.[1] ?? null;
}

// ============================================================
// DOM レンダテスト用ヘルパ (BL-059 と同形)
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
  // BL-104 追従: TodayView / TomorrowView が `useSearchParams` を使うため Router context が必要.
  // 起票フォーム関連 AC (AC-21 等) も同 renderer から読むので `?create=1` を付けてフォームを開いておく.
  return render(
    <MemoryRouter
      initialEntries={["/today?create=1"]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
    </MemoryRouter>,
  );
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

function _makeProject(overrides: Partial<Project> = {}): Project {
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
      throw new Error("not used in task-card-hotfix test");
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
// 動的 import (実装後は静的 import 相当の解決. 任意 props で受ける)
// ============================================================

type TaskCardModule = { TaskCard: ComponentType<Record<string, unknown>> };
type TaskFormCardModule = { TaskFormCard: ComponentType<Record<string, unknown>> };

async function importTaskCard(): Promise<TaskCardModule> {
  const path = "../src/ui/task-card/task-card.js";
  return (await import(/* @vite-ignore */ path)) as TaskCardModule;
}

async function importTaskFormCard(): Promise<TaskFormCardModule> {
  const path = "../src/ui/task-card/task-form-card.js";
  return (await import(/* @vite-ignore */ path)) as TaskFormCardModule;
}

// ============================================================
// describe ブロック
// ============================================================

describe("TaskCard / TaskFormCard 実機遺漏の一括 hotfix (BL-063 / task-card-hotfix)", () => {
  // ============================================================
  // CSS 直読み系 (AC-1 / AC-4 / AC-5 / AC-6 / AC-9 / AC-11 / AC-13 / AC-14)
  // ============================================================

  // ----------------------------------------------------------
  // AC-1: .task-card__header__priority に margin-left: auto (REQ-1 / D-001)
  // ----------------------------------------------------------
  /**
   * シナリオ AC-1:
   *   Given web/src/ui/task-card/task-card.css を開いた
   *   When  .task-card__header__priority セレクタのルール本文を観察する
   *   Then  margin-left: auto の宣言を含む
   */
  describe("AC-1: .task-card__header__priority に margin-left: auto (REQ-1 / D-001)", () => {
    it(".task-card__header__priority ルールが定義されている", () => {
      const css = readFileSync(taskCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".task-card__header__priority");
      expect(body, ".task-card__header__priority ルールが見つからない (REQ-1 違反)").not.toBeNull();
    });

    it(".task-card__header__priority ルール本文に margin-left: auto を含む", () => {
      const css = readFileSync(taskCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".task-card__header__priority");
      expect(body, ".task-card__header__priority ルールが見つからない").not.toBeNull();
      expect(body ?? "").toMatch(/(?:^|;|\n)\s*margin-left\s*:\s*auto/);
    });
  });

  // ----------------------------------------------------------
  // AC-4: .task-card__actions から justify-content: center / flex-end が撤去 (REQ-2 / V-2 置換 / 回帰防止)
  // ----------------------------------------------------------
  /**
   * シナリオ AC-4:
   *   Given web/src/ui/task-card/task-card.css を開いた
   *   When  .task-card__actions セレクタのルール本文を観察する
   *   Then  justify-content: center の宣言を含まない (= BL-059 V-2 置換)
   *    かつ justify-content: flex-end の宣言を含まない (= 旧 BL-057 値の回帰防止維持)
   */
  describe("AC-4: .task-card__actions から justify-content: center / flex-end 撤去 (REQ-2 / V-2 置換)", () => {
    it(".task-card__actions ルール本文に justify-content: center を含まない", () => {
      const css = readFileSync(taskCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".task-card__actions");
      expect(body, ".task-card__actions ルールが見つからない").not.toBeNull();
      expect(
        body ?? "",
        ".task-card__actions に justify-content: center が残存 (BL-059 V-2 から本 BL で撤去すべき)",
      ).not.toMatch(/justify-content\s*:\s*center/);
    });

    it(".task-card__actions ルール本文に justify-content: flex-end を含まない (旧 BL-057 値の回帰防止維持)", () => {
      const css = readFileSync(taskCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".task-card__actions");
      expect(body, ".task-card__actions ルールが見つからない").not.toBeNull();
      expect(body ?? "").not.toMatch(/justify-content\s*:\s*flex-end/);
    });
  });

  // ----------------------------------------------------------
  // AC-5: .task-card__actions__delete に margin-right: auto (REQ-2 / D-002)
  // ----------------------------------------------------------
  /**
   * シナリオ AC-5:
   *   Given web/src/ui/task-card/task-card.css を開いた
   *   When  .task-card__actions__delete セレクタのルール本文を観察する
   *   Then  margin-right: auto の宣言を含む
   */
  describe("AC-5: .task-card__actions__delete に margin-right: auto (REQ-2 / D-002)", () => {
    it(".task-card__actions__delete ルールが定義されている", () => {
      const css = readFileSync(taskCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".task-card__actions__delete");
      expect(body, ".task-card__actions__delete ルールが見つからない (REQ-2 違反)").not.toBeNull();
    });

    it(".task-card__actions__delete ルール本文に margin-right: auto を含む", () => {
      const css = readFileSync(taskCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".task-card__actions__delete");
      expect(body, ".task-card__actions__delete ルールが見つからない").not.toBeNull();
      expect(body ?? "").toMatch(/(?:^|;|\n)\s*margin-right\s*:\s*auto/);
    });
  });

  // ----------------------------------------------------------
  // AC-6: .task-card__actions__complete に margin-left: auto (REQ-2 / D-002)
  // ----------------------------------------------------------
  /**
   * シナリオ AC-6:
   *   Given web/src/ui/task-card/task-card.css を開いた
   *   When  .task-card__actions__complete セレクタのルール本文を観察する
   *   Then  margin-left: auto の宣言を含む
   */
  describe("AC-6: .task-card__actions__complete に margin-left: auto (REQ-2 / D-002)", () => {
    it(".task-card__actions__complete ルールが定義されている", () => {
      const css = readFileSync(taskCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".task-card__actions__complete");
      expect(
        body,
        ".task-card__actions__complete ルールが見つからない (REQ-2 違反)",
      ).not.toBeNull();
    });

    it(".task-card__actions__complete ルール本文に margin-left: auto を含む", () => {
      const css = readFileSync(taskCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".task-card__actions__complete");
      expect(body, ".task-card__actions__complete ルールが見つからない").not.toBeNull();
      expect(body ?? "").toMatch(/(?:^|;|\n)\s*margin-left\s*:\s*auto/);
    });
  });

  // ----------------------------------------------------------
  // AC-9: .task-card__header .project-chip に font-size: var(--font-size-small) (REQ-3 / D-003)
  // ----------------------------------------------------------
  /**
   * シナリオ AC-9:
   *   Given web/src/ui/task-card/task-card.css を開いた
   *   When  .task-card__header .project-chip セレクタのルール本文を観察する
   *   Then  font-size: var(--font-size-small) の宣言を含む
   */
  describe("AC-9: .task-card__header .project-chip に font-size: var(--font-size-small) (REQ-3 / D-003)", () => {
    it(".task-card__header .project-chip ルールが定義されている", () => {
      const css = readFileSync(taskCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".task-card__header .project-chip");
      expect(
        body,
        ".task-card__header .project-chip ルールが見つからない (specificity 強化が未実装)",
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
  // AC-11: .visually-hidden が task-card.css に定義されている (REQ-4 / D-004)
  // ----------------------------------------------------------
  /**
   * シナリオ AC-11:
   *   Given web/src/ui/task-card/task-card.css を開いた
   *   When  .visually-hidden セレクタのルール本文を観察する
   *   Then  position: absolute / width: 1px / height: 1px / clip: rect(0, 0, 0, 0) /
   *         overflow: hidden の宣言を含む
   */
  describe("AC-11: .visually-hidden が task-card.css に定義されている (REQ-4 / D-004)", () => {
    it(".visually-hidden ルールが定義されている", () => {
      const css = readFileSync(taskCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".visually-hidden");
      expect(body, ".visually-hidden ルールが見つからない (REQ-4 / D-004 違反)").not.toBeNull();
    });

    it(".visually-hidden ルール本文に position: absolute を含む", () => {
      const css = readFileSync(taskCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".visually-hidden");
      expect(body, ".visually-hidden ルールが見つからない").not.toBeNull();
      expect(body ?? "").toMatch(/position\s*:\s*absolute/);
    });

    it(".visually-hidden ルール本文に width: 1px を含む", () => {
      const css = readFileSync(taskCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".visually-hidden");
      expect(body, ".visually-hidden ルールが見つからない").not.toBeNull();
      expect(body ?? "").toMatch(/(?:^|;|\n)\s*width\s*:\s*1px/);
    });

    it(".visually-hidden ルール本文に height: 1px を含む", () => {
      const css = readFileSync(taskCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".visually-hidden");
      expect(body, ".visually-hidden ルールが見つからない").not.toBeNull();
      expect(body ?? "").toMatch(/(?:^|;|\n)\s*height\s*:\s*1px/);
    });

    it(".visually-hidden ルール本文に clip: rect(0, 0, 0, 0) (または等価) を含む", () => {
      const css = readFileSync(taskCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".visually-hidden");
      expect(body, ".visually-hidden ルールが見つからない").not.toBeNull();
      // clip: rect(0, 0, 0, 0) もしくは clip: rect(0 0 0 0) (区切りが空白) を許容.
      expect(body ?? "").toMatch(
        /clip\s*:\s*rect\(\s*0(?:px)?[\s,]+0(?:px)?[\s,]+0(?:px)?[\s,]+0(?:px)?\s*\)/,
      );
    });

    it(".visually-hidden ルール本文に overflow: hidden を含む", () => {
      const css = readFileSync(taskCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".visually-hidden");
      expect(body, ".visually-hidden ルールが見つからない").not.toBeNull();
      expect(body ?? "").toMatch(/overflow\s*:\s*hidden/);
    });
  });

  // ----------------------------------------------------------
  // AC-13: .task-card__title input[type="text"]::placeholder に color: --color-fg-subtle (REQ-4 / 4-5)
  // ----------------------------------------------------------
  /**
   * シナリオ AC-13:
   *   Given web/src/ui/task-card/task-card.css を開いた
   *   When  .task-card__title input[type="text"]::placeholder セレクタのルール本文を観察する
   *   Then  color: var(--color-fg-subtle) の宣言を含む
   */
  describe("AC-13: placeholder に color: var(--color-fg-subtle) (REQ-4 / 4-5)", () => {
    it('.task-card__title input[type="text"]::placeholder ルールが定義されている', () => {
      const css = readFileSync(taskCardCssPath, "utf-8");
      const body = extractRuleBody(css, '.task-card__title input[type="text"]::placeholder');
      expect(
        body,
        '.task-card__title input[type="text"]::placeholder ルールが見つからない (REQ-4 違反)',
      ).not.toBeNull();
    });

    it('.task-card__title input[type="text"]::placeholder ルール本文に color: var(--color-fg-subtle) を含む', () => {
      const css = readFileSync(taskCardCssPath, "utf-8");
      const body = extractRuleBody(css, '.task-card__title input[type="text"]::placeholder');
      expect(
        body,
        '.task-card__title input[type="text"]::placeholder ルールが見つからない',
      ).not.toBeNull();
      expect(body ?? "").toMatch(/color\s*:\s*var\(--color-fg-subtle\)/);
    });
  });

  // ----------------------------------------------------------
  // AC-14: .task-card--form .task-card__actions に justify-content: flex-end (REQ-5 / D-005)
  // ----------------------------------------------------------
  /**
   * シナリオ AC-14:
   *   Given web/src/ui/task-card/task-card.css を開いた
   *   When  .task-card--form .task-card__actions セレクタのルール本文を観察する
   *   Then  justify-content: flex-end の宣言を含む
   */
  describe("AC-14: .task-card--form .task-card__actions に justify-content: flex-end (REQ-5 / D-005)", () => {
    it(".task-card--form .task-card__actions ルールが定義されている", () => {
      const css = readFileSync(taskCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".task-card--form .task-card__actions");
      expect(
        body,
        ".task-card--form .task-card__actions ルールが見つからない (REQ-5 違反)",
      ).not.toBeNull();
    });

    it(".task-card--form .task-card__actions ルール本文に justify-content: flex-end を含む", () => {
      const css = readFileSync(taskCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".task-card--form .task-card__actions");
      expect(body, ".task-card--form .task-card__actions ルールが見つからない").not.toBeNull();
      expect(body ?? "").toMatch(/justify-content\s*:\s*flex-end/);
    });
  });

  // ============================================================
  // jsdom DOM レンダ系 (AC-2 / AC-3 / AC-7 / AC-8 / AC-10 / AC-12 / AC-15 / AC-19 / AC-21)
  // ============================================================

  // ----------------------------------------------------------
  // AC-2: <TaskCard project={null}> で .task-card__header__priority が radiogroup を内包 (REQ-1)
  // ----------------------------------------------------------
  /**
   * シナリオ AC-2:
   *   Given <TaskCard showPriority={true} project={null} ... /> を render する (= chip 無し)
   *   When  出力 DOM を観察する
   *   Then  .task-card__header 内に .task-card__header__priority 要素が存在する
   *    かつ .task-card__header__priority 内に role="radiogroup" (= PriorityStars) が存在する
   *    かつ chip 要素 (.project-chip) は存在しない
   */
  describe("AC-2: <TaskCard project={null}> で .task-card__header__priority が radiogroup を内包 (REQ-1)", () => {
    it("chip 無しの TaskCard で header 段に .task-card__header__priority が存在する", async () => {
      const { TaskCard } = await importTaskCard();
      const { container } = render(
        <TaskCard
          task={makeTask()}
          project={null}
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
        />,
      );
      const header = container.querySelector(".task-card__header");
      expect(header, ".task-card__header が見つからない").not.toBeNull();
      const wrap = header?.querySelector(".task-card__header__priority");
      expect(
        wrap,
        ".task-card__header__priority wrap div が見つからない (REQ-1 / 1-1 違反)",
      ).not.toBeNull();
    });

    it(".task-card__header__priority の中に role=radiogroup (PriorityStars) が存在する", async () => {
      const { TaskCard } = await importTaskCard();
      const { container } = render(
        <TaskCard
          task={makeTask()}
          project={null}
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
        />,
      );
      const wrap = container.querySelector(".task-card__header__priority");
      expect(wrap, ".task-card__header__priority wrap div が見つからない").not.toBeNull();
      const radiogroup = wrap?.querySelector('[role="radiogroup"]');
      expect(
        radiogroup,
        ".task-card__header__priority 内に role=radiogroup が居ない (REQ-1 / 1-1 違反)",
      ).not.toBeNull();
    });

    it("project={null} のとき .project-chip が DOM 上に存在しない", async () => {
      const { TaskCard } = await importTaskCard();
      const { container } = render(
        <TaskCard
          task={makeTask()}
          project={null}
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
        />,
      );
      expect(container.querySelector(".project-chip")).toBeNull();
    });
  });

  // ----------------------------------------------------------
  // AC-3: .task-card__header__priority の computed style margin-left が "auto" (REQ-1 / G-1)
  // ----------------------------------------------------------
  /**
   * シナリオ AC-3:
   *   Given <TaskCard showPriority={true} project={null} ... /> を render し DOM を観察する
   *   When  .task-card__header__priority の computed style (jsdom) を確認する
   *   Then  margin-left が "auto" に解決される
   *   (補足: jsdom の getComputedStyle は CSS 変数解決が限定的だが, "auto" は文字列で観測可能)
   */
  describe("AC-3: .task-card__header__priority の computed margin-left が auto (REQ-1 / G-1)", () => {
    it("chip 無しの TaskCard で .task-card__header__priority の computed margin-left が 'auto'", async () => {
      const { TaskCard } = await importTaskCard();
      const { container } = render(
        <TaskCard
          task={makeTask()}
          project={null}
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
        />,
      );
      const wrap = container.querySelector(".task-card__header__priority") as HTMLElement | null;
      expect(wrap, ".task-card__header__priority wrap div が見つからない").not.toBeNull();
      if (!wrap) return;
      const style = getComputedStyle(wrap);
      expect(
        style.marginLeft,
        `.task-card__header__priority の margin-left が auto でない (実際: "${style.marginLeft}")`,
      ).toBe("auto");
    });
  });

  // ----------------------------------------------------------
  // AC-7: <TaskCard actionSet="full"> の 削除/完了 button に hotfix className (REQ-2)
  // ----------------------------------------------------------
  /**
   * シナリオ AC-7:
   *   Given <TaskCard actionSet="full" showSetFocus={true} ... /> を render する
   *   When  出力 DOM を観察する
   *   Then  「削除」 button に className "task-card__actions__delete" が含まれる
   *    かつ 「完了」 button に className "task-card__actions__complete" が含まれる
   *    かつ 「現在のタスクにする」「明日にする」 button にはこれらの className が含まれない
   */
  describe("AC-7: <TaskCard actionSet='full'> の 削除/完了 に hotfix className (REQ-2 / 2-1)", () => {
    it('actionSet="full" + showSetFocus で「削除」 button に task-card__actions__delete が付く', async () => {
      const { TaskCard } = await importTaskCard();
      const { container } = render(
        <TaskCard
          task={makeTask()}
          project={null}
          projects={[]}
          onChangeProject={() => {}}
          showPriority={false}
          showSetFocus
          actionSet="full"
          dueDateMode="today"
          onSetFocus={() => {}}
          onDelete={() => {}}
          onToggleDueDate={() => {}}
          onComplete={() => {}}
        />,
      );
      const buttons = Array.from(container.querySelectorAll(".task-card__actions button"));
      const deleteBtn = buttons.find((b) =>
        (b.getAttribute("aria-label") ?? b.textContent ?? "").includes("削除"),
      );
      expect(deleteBtn, "「削除」 button が見つからない").toBeDefined();
      expect(
        deleteBtn?.classList.contains("task-card__actions__delete"),
        "「削除」 button に task-card__actions__delete className が付与されていない (REQ-2 違反)",
      ).toBe(true);
    });

    it('actionSet="full" + showSetFocus で「完了」 button に task-card__actions__complete が付く', async () => {
      const { TaskCard } = await importTaskCard();
      const { container } = render(
        <TaskCard
          task={makeTask()}
          project={null}
          projects={[]}
          onChangeProject={() => {}}
          showPriority={false}
          showSetFocus
          actionSet="full"
          dueDateMode="today"
          onSetFocus={() => {}}
          onDelete={() => {}}
          onToggleDueDate={() => {}}
          onComplete={() => {}}
        />,
      );
      const buttons = Array.from(container.querySelectorAll(".task-card__actions button"));
      const completeBtn = buttons.find((b) =>
        (b.getAttribute("aria-label") ?? b.textContent ?? "").includes("完了"),
      );
      expect(completeBtn, "「完了」 button が見つからない").toBeDefined();
      expect(
        completeBtn?.classList.contains("task-card__actions__complete"),
        "「完了」 button に task-card__actions__complete className が付与されていない (REQ-2 違反)",
      ).toBe(true);
    });

    it("「現在のタスクにする」「明日にする」 button には hotfix className が付かない", async () => {
      const { TaskCard } = await importTaskCard();
      const { container } = render(
        <TaskCard
          task={makeTask()}
          project={null}
          projects={[]}
          onChangeProject={() => {}}
          showPriority={false}
          showSetFocus
          actionSet="full"
          dueDateMode="today"
          onSetFocus={() => {}}
          onDelete={() => {}}
          onToggleDueDate={() => {}}
          onComplete={() => {}}
        />,
      );
      const buttons = Array.from(container.querySelectorAll(".task-card__actions button"));
      const setFocusBtn = buttons.find((b) =>
        (b.getAttribute("aria-label") ?? b.textContent ?? "").includes("現在のタスクにする"),
      );
      const toggleBtn = buttons.find((b) =>
        (b.getAttribute("aria-label") ?? b.textContent ?? "").includes("明日にする"),
      );
      expect(setFocusBtn, "「現在のタスクにする」 button が見つからない").toBeDefined();
      expect(toggleBtn, "「明日にする」 button が見つからない").toBeDefined();
      expect(
        setFocusBtn?.classList.contains("task-card__actions__delete"),
        "「現在のタスクにする」 button に task-card__actions__delete が誤付与",
      ).toBe(false);
      expect(
        setFocusBtn?.classList.contains("task-card__actions__complete"),
        "「現在のタスクにする」 button に task-card__actions__complete が誤付与",
      ).toBe(false);
      expect(
        toggleBtn?.classList.contains("task-card__actions__delete"),
        "「明日にする」 button に task-card__actions__delete が誤付与",
      ).toBe(false);
      expect(
        toggleBtn?.classList.contains("task-card__actions__complete"),
        "「明日にする」 button に task-card__actions__complete が誤付与",
      ).toBe(false);
    });
  });

  // ----------------------------------------------------------
  // AC-8: <TaskCard actionSet="minimal"> でも 削除/完了 に hotfix className (REQ-2 / focus-view 経路)
  // ----------------------------------------------------------
  /**
   * シナリオ AC-8:
   *   Given <TaskCard actionSet="minimal" showSetFocus={false} ... /> を render する
   *   When  出力 DOM を観察する
   *   Then  「削除」 button に className "task-card__actions__delete" が含まれる
   *    かつ 「完了」 button に className "task-card__actions__complete" が含まれる
   *    かつ 「明日にする」「今日にする」「現在のタスクにする」 button が存在しない
   */
  describe("AC-8: actionSet='minimal' でも 削除/完了 に hotfix className (REQ-2 / focus-view 経路)", () => {
    it("削除/完了 button に hotfix className が付き他 button は出ない", async () => {
      const { TaskCard } = await importTaskCard();
      const { container } = render(
        <TaskCard
          task={makeTask()}
          project={null}
          projects={[]}
          onChangeProject={() => {}}
          showPriority={false}
          showSetFocus={false}
          actionSet="minimal"
          onDelete={() => {}}
          onComplete={() => {}}
        />,
      );
      const buttons = Array.from(container.querySelectorAll(".task-card__actions button"));
      const labels = buttons.map((b) => b.getAttribute("aria-label") ?? b.textContent ?? "");

      const deleteBtn = buttons.find((b) =>
        (b.getAttribute("aria-label") ?? b.textContent ?? "").includes("削除"),
      );
      const completeBtn = buttons.find((b) =>
        (b.getAttribute("aria-label") ?? b.textContent ?? "").includes("完了"),
      );
      expect(deleteBtn, "「削除」 button が見つからない").toBeDefined();
      expect(completeBtn, "「完了」 button が見つからない").toBeDefined();
      expect(deleteBtn?.classList.contains("task-card__actions__delete")).toBe(true);
      expect(completeBtn?.classList.contains("task-card__actions__complete")).toBe(true);

      // minimal では他 button は出ない (BL-059 AC-11 と整合).
      expect(labels.some((t) => t.includes("明日にする"))).toBe(false);
      expect(labels.some((t) => t.includes("今日にする"))).toBe(false);
      expect(labels.some((t) => t.includes("現在のタスクにする"))).toBe(false);
    });
  });

  // ----------------------------------------------------------
  // AC-10 (BL-065 で撤去): 旧 AC-10 「ProjectToggle button の computed font-size が 14px」は
  //   ProjectToggle 撤去 (BL-065 / project-toggle-removal) により describe ごと削除された.
  //   ・ProjectToggle 自体が存在しないため computed font-size の対象が消失.
  //   ・.task-card__header .project-chip { font-size: var(--font-size-small) } は
  //     TaskCard 表示側 chip のため引き続き必要 (AC-9 CSS 直読みで担保).
  // ----------------------------------------------------------

  // ----------------------------------------------------------
  // AC-12: <TaskFormCard> label に visually-hidden + input に placeholder="タスク名" (REQ-4)
  // ----------------------------------------------------------
  /**
   * シナリオ AC-12:
   *   Given <TaskFormCard inputId="task-name" ... /> を render する
   *   When  出力 DOM を観察する
   *   Then  <label for="task-name"> に className "visually-hidden" が含まれる
   *    かつ <label> のテキストは「タスク名」である (= a11y accessibleName 維持)
   *    かつ <input id="task-name"> に placeholder="タスク名" が含まれる
   *    かつ getByLabelText("タスク名") で input が取得可能 (NFR-LABEL-PRESERVE)
   */
  describe("AC-12: <TaskFormCard> label に visually-hidden + input に placeholder (REQ-4)", () => {
    it("<label for='task-name'> に className 'visually-hidden' が含まれる", async () => {
      const { TaskFormCard } = await importTaskFormCard();
      const { container } = render(
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
          idPrefix="create"
          inputId="task-name"
          formAriaLabel="タスク起票フォーム"
        />,
      );
      const label = container.querySelector('label[for="task-name"]');
      expect(label, "<label for='task-name'> が見つからない").not.toBeNull();
      expect(
        label?.classList.contains("visually-hidden"),
        "<label> に visually-hidden className が付与されていない (REQ-4 / 4-1 違反)",
      ).toBe(true);
    });

    it("<label> のテキストが「タスク名」であり accessibleName が維持される", async () => {
      const { TaskFormCard } = await importTaskFormCard();
      const { container } = render(
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
          idPrefix="create"
          inputId="task-name"
          formAriaLabel="タスク起票フォーム"
        />,
      );
      const label = container.querySelector('label[for="task-name"]');
      expect(label?.textContent ?? "").toContain("タスク名");
    });

    it("<input id='task-name'> に placeholder='タスク名' が付与されている", async () => {
      const { TaskFormCard } = await importTaskFormCard();
      const { container } = render(
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
          idPrefix="create"
          inputId="task-name"
          formAriaLabel="タスク起票フォーム"
        />,
      );
      const input = container.querySelector('input[id="task-name"]') as HTMLInputElement | null;
      expect(input, "<input id='task-name'> が見つからない").not.toBeNull();
      expect(
        input?.getAttribute("placeholder"),
        "<input> に placeholder='タスク名' が付与されていない (REQ-4 / 4-2 違反)",
      ).toBe("タスク名");
    });

    it("getByLabelText('タスク名') で input が取得可能 (NFR-LABEL-PRESERVE)", async () => {
      const { TaskFormCard } = await importTaskFormCard();
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
          idPrefix="create"
          inputId="task-name"
          formAriaLabel="タスク起票フォーム"
        />,
      );
      const input = screen.getByLabelText("タスク名") as HTMLInputElement;
      expect(input.tagName.toLowerCase()).toBe("input");
      expect(input.id).toBe("task-name");
    });
  });

  // ----------------------------------------------------------
  // AC-15: <TaskFormCard> の actions 内 button が「追加」1 個のみ (REQ-5)
  // ----------------------------------------------------------
  /**
   * シナリオ AC-15:
   *   Given <TaskFormCard ... /> を render する
   *   When  ルート <form> の .task-card__actions 内の button を観察する
   *   Then  type="submit" かつテキスト「追加」の button が 1 つ存在する
   *    かつ それ以外の button は .task-card__actions 内に存在しない
   */
  describe("AC-15: <TaskFormCard> の actions 内 button が「追加」1 個のみ (REQ-5)", () => {
    it(".task-card__actions に submit button「追加」が 1 個だけ存在する", async () => {
      const { TaskFormCard } = await importTaskFormCard();
      const { container } = render(
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
          idPrefix="create"
          inputId="task-name"
          formAriaLabel="タスク起票フォーム"
        />,
      );
      const actions = container.querySelector(".task-card__actions");
      expect(actions, ".task-card__actions が見つからない").not.toBeNull();
      const buttons = Array.from(actions?.querySelectorAll("button") ?? []);
      // BL-114 追従: .task-card__actions には「追加」 (type="submit") の 1 ボタンのみ.
      // 「キャンセル」は右上 ✕ button (.task-card__close) に移設され .task-card__actions 外にある.
      expect(buttons.length, `actions 内の button 数が 1 ではない (実際: ${buttons.length})`).toBe(
        1,
      );
      const submitButton = buttons.find((b) => b.getAttribute("type") === "submit");
      expect(submitButton).not.toBeUndefined();
      expect(submitButton?.getAttribute("aria-label") ?? "").toContain("追加");
    });
  });

  // ----------------------------------------------------------
  // AC-19: focus-view の actions が 2 ボタン + 各 hotfix className (REQ-2 / G-2 / NFR-FOCUS-VIEW-ACTIONS-2BTN)
  // ----------------------------------------------------------
  /**
   * シナリオ AC-19:
   *   Given /focus を render する (focusedTask あり)
   *   When  .task-card__actions 内の button を観察する
   *   Then  「削除」 button が存在し className "task-card__actions__delete" を持つ
   *    かつ 「完了」 button が存在し className "task-card__actions__complete" を持つ
   *    かつ 「明日にする」 / 「今日にする」 / 「現在のタスクにする」 button が存在しない
   */
  describe("AC-19: focus-view の actions が 2 ボタン + 各 hotfix className (REQ-2 / G-2)", () => {
    it("focus-view を render すると 削除/完了 に hotfix className が付き他 button が出ない", async () => {
      const repo = makeMockRepository([makeTask({ id: "A", name: "牛乳", version: 1 })], {
        initialFocus: {
          id: "singleton",
          currentTaskId: "A",
          version: 1,
          updatedAt: NOW,
        },
      });
      const projectRepo = makeMockProjectRepository([]);
      const { container } = renderWithQueryClient(
        <FocusView repository={repo} projectRepository={projectRepo} />,
      );

      // BL-070 追従: <span>{name}</span> は input value に置換されたため
      // findByText ではなく findByDisplayValue で待つ.
      await screen.findByDisplayValue("牛乳");

      const actions = container.querySelector(".task-card__actions");
      expect(actions, "focus-view の .task-card__actions が見つからない").not.toBeNull();
      const buttons = Array.from(actions?.querySelectorAll("button") ?? []);
      const labels = buttons.map((b) => b.getAttribute("aria-label") ?? b.textContent ?? "");

      const deleteBtn = buttons.find((b) =>
        (b.getAttribute("aria-label") ?? b.textContent ?? "").includes("削除"),
      );
      const completeBtn = buttons.find((b) =>
        (b.getAttribute("aria-label") ?? b.textContent ?? "").includes("完了"),
      );
      expect(deleteBtn, "focus-view に「削除」 button が無い").toBeDefined();
      expect(completeBtn, "focus-view に「完了」 button が無い").toBeDefined();
      expect(
        deleteBtn?.classList.contains("task-card__actions__delete"),
        "focus-view の「削除」 button に task-card__actions__delete が付与されていない",
      ).toBe(true);
      expect(
        completeBtn?.classList.contains("task-card__actions__complete"),
        "focus-view の「完了」 button に task-card__actions__complete が付与されていない",
      ).toBe(true);

      expect(labels.some((t) => t.includes("明日にする"))).toBe(false);
      expect(labels.some((t) => t.includes("今日にする"))).toBe(false);
      expect(labels.some((t) => t.includes("現在のタスクにする"))).toBe(false);
    });
  });

  // ----------------------------------------------------------
  // AC-21: today / tomorrow で getByLabelText("タスク名") が input を返す (NFR-LABEL-PRESERVE)
  // ----------------------------------------------------------
  /**
   * シナリオ AC-21:
   *   Given /today と /tomorrow を render する
   *   When  起票フォームを観察する
   *   Then  /today に <label htmlFor="task-name"> と <input id="task-name"> が共存する
   *    かつ /tomorrow に <label htmlFor="tomorrow-task-name"> と <input id="tomorrow-task-name"> が共存する
   *    かつ getByLabelText("タスク名") で input が取得可能
   */
  describe("AC-21: today / tomorrow で getByLabelText('タスク名') が input を返す (NFR-LABEL-PRESERVE)", () => {
    it("today-view で getByLabelText('タスク名') が <input id='task-name'> を返す", async () => {
      const repo = makeMockRepository([]);
      const projectRepo = makeMockProjectRepository([]);
      renderWithQueryClient(<TodayView repository={repo} projectRepository={projectRepo} />);

      const input = (await screen.findByLabelText("タスク名")) as HTMLInputElement;
      expect(input.tagName.toLowerCase()).toBe("input");
      expect(input.id).toBe("task-name");
    });

    it("tomorrow-view で getByLabelText('タスク名') が <input id='tomorrow-task-name'> を返す", async () => {
      const repo = makeMockRepository([]);
      const projectRepo = makeMockProjectRepository([]);
      renderWithQueryClient(<TomorrowView repository={repo} projectRepository={projectRepo} />);

      const input = (await screen.findByLabelText("タスク名")) as HTMLInputElement;
      expect(input.tagName.toLowerCase()).toBe("input");
      expect(input.id).toBe("tomorrow-task-name");
    });
  });

  // ============================================================
  // 不変性 / API 維持 (AC-16 / AC-17 / AC-18 / AC-20 / AC-22)
  // ============================================================

  // ----------------------------------------------------------
  // AC-16: TaskCardProps / TaskFormCardProps の export 型に差分が無い (NFR-API-FROZEN / G-7)
  // ----------------------------------------------------------
  describe("AC-16: TaskCardProps / TaskFormCardProps の export 型に差分が無い (NFR-API-FROZEN / G-7)", () => {
    it("task-card.tsx に `export interface TaskCardProps` が含まれる", () => {
      const tsx = readFileSync(taskCardTsxPath, "utf-8");
      expect(tsx).toMatch(/export\s+interface\s+TaskCardProps\b/);
    });

    it.each([
      "task",
      "project",
      "variant",
      "showPriority",
      "showSetFocus",
      "actionSet",
      "dueDateMode",
      "onSetPriority",
      "onSetFocus",
      "onDelete",
      "onToggleDueDate",
      "onComplete",
      "as",
      "aria-label",
    ])("task-card.tsx に TaskCardProps の prop 名 '%s' が含まれる (BL-059 で確定)", (propName) => {
      const tsx = readFileSync(taskCardTsxPath, "utf-8");
      expect(tsx).toContain(propName);
    });

    it("task-form-card.tsx に `export interface TaskFormCardProps` が含まれる", () => {
      const tsx = readFileSync(taskFormCardTsxPath, "utf-8");
      expect(tsx).toMatch(/export\s+interface\s+TaskFormCardProps\b/);
    });

    it.each([
      "projects",
      "projectId",
      "onProjectIdChange",
      "priority",
      "onPriorityChange",
      "name",
      "onNameChange",
      "onSubmit",
      "idPrefix",
      "inputId",
      "formAriaLabel",
    ])("task-form-card.tsx に TaskFormCardProps の prop 名 '%s' が含まれる (BL-059 で確定)", (propName) => {
      const tsx = readFileSync(taskFormCardTsxPath, "utf-8");
      expect(tsx).toContain(propName);
    });
  });

  // ----------------------------------------------------------
  // AC-17: PriorityStars / project-chip 本体が無改修 (NFR-COMPONENT-API-FROZEN / G-8)
  //   BL-065 (project-toggle-removal) で ProjectToggle 本体および project-toggle.css は
  //   撤去されたため, 対応 assert (旧 4 件) を削除した. PriorityStars / project-chip 側は維持.
  // ----------------------------------------------------------
  describe("AC-17: PriorityStars / project-chip 本体が無改修 (G-8)", () => {
    it("priority-stars.tsx に `export interface PriorityStarsProps` が含まれる", () => {
      const tsx = readFileSync(priorityStarsTsxPath, "utf-8");
      expect(tsx).toMatch(/export\s+interface\s+PriorityStarsProps\b/);
    });

    it.each([
      "value",
      "onChange",
      "idPrefix",
      "groupLabel",
    ])("priority-stars.tsx に prop 名 '%s' が含まれる (BL-040 で確定)", (propName) => {
      const tsx = readFileSync(priorityStarsTsxPath, "utf-8");
      expect(tsx).toContain(propName);
    });

    it(".project-chip ルール本文の BL-056 確定 5 宣言がすべて残っている (NFR-CHIP-PRESERVE)", () => {
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
      expect(bodyText).toMatch(/(?:^|;|\n)\s*padding\s*:\s*var\(--space-xs\)\s+var\(--space-sm\)/);
      expect(bodyText).toMatch(/font-size\s*:\s*var\(--font-size-small\)/);
      expect(bodyText).toMatch(/(?:^|;|\n)\s*color\s*:\s*var\(--color-fg\)/);
    });
  });

  // ----------------------------------------------------------
  // AC-18: tokens.css 無改修 (NFR-NO-NEW-TOKENS / G-9)
  // ----------------------------------------------------------
  describe("AC-18: tokens.css 無改修 (NFR-NO-NEW-TOKENS / G-9)", () => {
    it("本 BL で参照する主要トークンが tokens.css に引き続き定義されている", () => {
      const css = readFileSync(tokensCssPath, "utf-8");
      expect(css).toMatch(/--font-size-small\s*:/);
      expect(css).toMatch(/--font-size-h2\s*:/);
      expect(css).toMatch(/--space-sm\s*:/);
      expect(css).toMatch(/--space-md\s*:/);
      expect(css).toMatch(/--color-fg-subtle\s*:/);
      expect(css).toMatch(/--color-border\s*:/);
      expect(css).toMatch(/--color-bg\s*:/);
      expect(css).toMatch(/--radius-lg\s*:/);
    });

    it("tokens.css に本 BL では追加すべきでない --shadow-* トークンが存在しない", () => {
      const css = readFileSync(tokensCssPath, "utf-8");
      expect(css).not.toMatch(/--shadow-/);
    });
  });

  // ----------------------------------------------------------
  // AC-20: BL-059 V-1 / V-3 / V-4 / V-5 / V-7 / V-6 不変項の維持 (G-6 / REQ-9)
  // ----------------------------------------------------------
  describe("AC-20: BL-059 V-1 / V-3 / V-4 / V-5 / V-7 / V-6 が維持される (G-6 / REQ-9)", () => {
    it("V-1: .task-card--focus に border-width: 3px が引き続き存在する", () => {
      const css = readFileSync(taskCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".task-card--focus");
      expect(body, ".task-card--focus ルールが見つからない").not.toBeNull();
      expect(body ?? "").toMatch(/border-width\s*:\s*3px/);
    });

    it("V-3: .task-card__header に justify-content: space-between が引き続き存在する (REQ-1 と併用)", () => {
      const css = readFileSync(taskCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".task-card__header");
      expect(body, ".task-card__header ルールが見つからない").not.toBeNull();
      expect(body ?? "").toMatch(/justify-content\s*:\s*space-between/);
    });

    it("V-4: .task-card__title に justify-content: center + font-size: var(--font-size-h2) が引き続き存在する", () => {
      const css = readFileSync(taskCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".task-card__title");
      expect(body, ".task-card__title ルールが見つからない").not.toBeNull();
      expect(body ?? "").toMatch(/justify-content\s*:\s*center/);
      expect(body ?? "").toMatch(/font-size\s*:\s*var\(--font-size-h2\)/);
    });

    it("V-5: today-view.tsx に <h2>現在のタスク</h2> が引き続き存在しない", () => {
      const tsx = readFileSync(todayViewTsxPath, "utf-8");
      expect(tsx).not.toMatch(/<h2>\s*現在のタスク\s*<\/h2>/);
    });

    it('V-7: .task-card__title input[type="text"] に font: inherit が引き続き存在する', () => {
      const css = readFileSync(taskCardCssPath, "utf-8");
      const body = extractRuleBody(css, '.task-card__title input[type="text"]');
      expect(body, '.task-card__title input[type="text"] ルールが見つからない').not.toBeNull();
      const bodyText = body ?? "";
      const hasFontShorthand = /(?:^|;|\n)\s*font\s*:\s*inherit/.test(bodyText);
      const hasFontSizeInherit = /(?:^|;|\n)\s*font-size\s*:\s*inherit/.test(bodyText);
      expect(hasFontShorthand || hasFontSizeInherit).toBe(true);
    });

    it("V-6: <TaskFormCard> を render しても「↑タップで選択」テキストが DOM 上に存在しない", async () => {
      const { TaskFormCard } = await importTaskFormCard();
      const { container } = render(
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
          idPrefix="create"
          inputId="task-name"
          formAriaLabel="タスク起票フォーム"
        />,
      );
      const all = Array.from(container.querySelectorAll("*")).map((el) => el.textContent ?? "");
      expect(
        all.some((t) => t.includes("↑タップで選択")),
        "<TaskFormCard> 内に「↑タップで選択」テキストが残存 (V-6 違反)",
      ).toBe(false);
    });

    it("V-6: <TaskFormCard> を render しても id='task-priority-label' / 'tomorrow-task-priority-label' 要素が存在しない", async () => {
      const { TaskFormCard } = await importTaskFormCard();
      const { container: c1 } = render(
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
          idPrefix="create"
          inputId="task-name"
          formAriaLabel="タスク起票フォーム"
        />,
      );
      expect(c1.querySelector("#task-priority-label")).toBeNull();
      const { container: c2 } = render(
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
      expect(c2.querySelector("#tomorrow-task-priority-label")).toBeNull();
    });
  });

  // ----------------------------------------------------------
  // AC-22: task-card.css に :hover / transition / animation / box-shadow が無い (NFR-NO-HOVER-TRANSITION / NFR-NO-SHADOW)
  // ----------------------------------------------------------
  describe("AC-22: .task-card 系に :hover / transition / animation / box-shadow が無い", () => {
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

    it.each([
      ".task-card:hover",
      ".task-card--focus:hover",
      ".task-card__header:hover",
      ".task-card__title:hover",
      ".task-card__actions:hover",
      ".task-card__header__priority:hover",
      ".task-card__actions__delete:hover",
      ".task-card__actions__complete:hover",
    ])("%s セレクタが task-card.css 内に存在しない", (selector) => {
      const css = readFileSync(taskCardCssPath, "utf-8");
      expect(css).not.toContain(selector);
    });
  });
});
