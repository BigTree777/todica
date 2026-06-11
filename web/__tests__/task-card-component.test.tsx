// @vitest-environment jsdom

/**
 * TaskCard / TaskFormCard コンポーネント新設 + モックアップ通り visual 確定
 * (BL-059 / task-card-component) 受け入れ基準テスト.
 *
 * 仕様参照:
 *   docs/developer/features/task-card-component/spec.md
 *   docs/developer/features/task-card-component/plan.md
 *   docs/developer/features/task-card-component/tasks.md
 *
 * 本ファイルが検証する受け入れ基準:
 *   AC-1 : .task-card 基底に visual 4 宣言 + 3 段 layout 宣言を持つ (CSS 直読み).
 *   AC-2 : .task-card--focus が border-width: 3px / padding-lg 撤去 (CSS 直読み).
 *   AC-3 : .task-card__header に space-between + align-items: center (CSS 直読み).
 *   AC-4 : .task-card__title に justify-content: center + font-size: --font-size-h2 (CSS 直読み).
 *   AC-5 : .task-card__actions から justify-content: center / flex-end が撤去 (CSS 直読み).
 *          BL-059 当初は justify-content: center を期待していたが, BL-063 hotfix で削除/完了の
 *          auto-margin パターンへ置換されたため, 本 AC は「center も flex-end も含まない」へ追従修正済み
 *          (BL-063 D-007 / P-009).
 *   AC-6 : .task-card__title input[type="text"] に font: inherit (CSS 直読み).
 *   AC-7 : <TaskCard> が 3 段ゾーン構造で描画される (DOM レンダ).
 *   AC-8 : <TaskCard as="section" variant="focus" aria-label> が反映される (DOM).
 *   AC-9 : showPriority=false で radiogroup が出ない (DOM).
 *   AC-10: showSetFocus=true で「現在のタスクにする」が出る (DOM).
 *   AC-11: actionSet="minimal" で actions が 2 ボタンのみ (DOM).
 *   AC-12: task.origin="routine" で「明日にする / 今日にする」が出ない (DOM).
 *   AC-13: <TaskFormCard> が 3 段ゾーン構造で起票フォームを描画 (DOM).
 *   AC-14: <TaskFormCard> から「↑タップで選択」と「優先度」label span が撤去 (DOM).
 *   AC-15: today-view.tsx が <TaskCard> / <TaskFormCard> を使う (ソース直読み).
 *   AC-16: tomorrow-view.tsx が <TaskCard> / <TaskFormCard> を使う (ソース直読み).
 *   AC-17: focus-view.tsx が <TaskCard variant="focus" actionSet="minimal"> を使う (ソース直読み).
 *   AC-18: day-view.css から .day-view__card 系 / .day-view__form 系セレクタが撤去 (CSS).
 *   AC-19: day-view.css の維持セレクタが引き続き存在 (CSS).
 *   AC-20: focus-view.css から .focus-view__card 系が撤去 / 枠は維持 (CSS).
 *   AC-21: .project-chip ルール本文が無改修 (CSS).
 *   AC-22: tokens.css 無改修 (CSS).
 *   AC-23: PriorityStars / ProjectToggle prop API 無改修 (ソース直読み).
 *   AC-24: タスク名 label/input 関連付け保持 (DOM).
 *   AC-25: focus-view actions が 2 ボタンのみ (DOM).
 *   AC-26: .task-card 系に box-shadow / transition / animation / :hover 無し (CSS).
 *   AC-27 / AC-28 / AC-29: 単体テスト全件 / E2E / a11y 全件 green は本ファイルでは個別 assert
 *          せず ルート npm test / npx playwright test の継続実行で担保する.
 *
 * 本ファイルは TDD の "red" を作るためのテスト.
 *   - 実装前 (= web/src/ui/task-card/task-card.tsx / task-form-card.tsx / task-card.css が
 *     存在せず, today-view / tomorrow-view / focus-view も旧クラスのまま) では,
 *     CSS 直読み系 (AC-1〜AC-6 / AC-18 / AC-20 / AC-26), DOM レンダ系 (AC-7〜AC-14 / AC-25),
 *     view 適用系 (AC-15〜AC-17), 不変性系 (AC-24) の大半が red になる想定.
 *   - 既存ファイル不変性系 (AC-19 / AC-21 / AC-22 / AC-23) は green が期待値.
 *   - implementer が REQ-1 〜 REQ-13 を実装することで red 群が green 化する.
 *
 * 検証スタイル:
 *   - CSS 直読み: BL-052 / BL-054 / BL-056 / BL-057 / BL-058 と同じ
 *     readFileSync + extractRuleBody (P-005). ヘルパは本ファイル内に再定義する.
 *   - DOM レンダ: BL-057 / BL-058 と同じ QueryClientProvider + render パターン.
 *
 * vitest-environment:
 *   CSS / ソース直読み AC は node でも動くが, DOM レンダ AC は jsdom 必須のため
 *   1 ファイル全体を jsdom で動かす (= jsdom でも readFileSync は問題なく動く).
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import type { Task } from "@todica/domain/task";
import type { ComponentType, ReactNode } from "react";
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

// 新規 (本 BL で新設) ファイル群.
const taskCardCssPath = resolve(webSrcRoot, "ui/task-card/task-card.css");
const taskCardTsxPath = resolve(webSrcRoot, "ui/task-card/task-card.tsx");
const taskFormCardTsxPath = resolve(webSrcRoot, "ui/task-card/task-form-card.tsx");

// 既存ファイル群 (撤去 / 維持 / 無改修 の対象).
const dayViewCssPath = resolve(webSrcRoot, "ui/day-view/day-view.css");
const focusViewCssPath = resolve(webSrcRoot, "ui/focus-view/focus-view.css");
const tokensCssPath = resolve(webSrcRoot, "styles/tokens.css");
const todayViewTsxPath = resolve(webSrcRoot, "ui/today-view/today-view.tsx");
const tomorrowViewTsxPath = resolve(webSrcRoot, "ui/tomorrow-view/tomorrow-view.tsx");
const focusViewTsxPath = resolve(webSrcRoot, "ui/focus-view/focus-view.tsx");
const priorityStarsTsxPath = resolve(webSrcRoot, "ui/priority-stars/priority-stars.tsx");
// BL-065 (project-toggle-removal): projectToggleTsxPath は撤去された. ProjectToggle 本体が
// 無くなったため AC-23 の不変性 assert 4 件もまとめて削除済み.

const NOW = "2026-06-11T09:00:00.000Z";
const PROJECT_ID_P1 = "p1p1p1p1-p1p1-4p1p-8p1p-p1p1p1p1p1p1";
const PROJECT_NAME_P1 = "プロジェクトα";

// ============================================================
// CSS ルール本文の抽出ヘルパ (P-005 / BL-052 / BL-054 / BL-056 / BL-057 / BL-058 から再実装)
// ============================================================

/**
 * 指定したセレクタの「ルール本文 (= {} で囲まれた中身)」を抽出する.
 *
 * 単純な /selector\s*\{([^}]*)\}/ では `.task-card` が `.task-card--focus` /
 * `.task-card__header` 等の prefix にも一致してしまうため,
 * セレクタ末尾を `{` / 空白で厳密に区切る.
 *
 * BL-052 / BL-054 / BL-056 / BL-057 / BL-058 に存在する同等実装を再定義する (P-005).
 */
function extractRuleBody(css: string, selector: string): string | null {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // セレクタの直後が空白 + `{` であるルールに限定する.
  const re = new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`, "m");
  const m = css.match(re);
  return m?.[1] ?? null;
}

// ============================================================
// DOM レンダテスト用ヘルパ (task-card-zone-layout.test.tsx と同形)
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
      throw new Error("not used in task-card-component test");
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
// 動的 import ヘルパ (実装前は task-card.tsx が存在しないため async import)
// ============================================================

/**
 * <TaskCard> / <TaskFormCard> を動的 import で読み込む.
 *
 * 実装前は web/src/ui/task-card/ 配下のファイルが存在しないため,
 * 静的 import すると本ファイル全体がロード失敗する.
 * 動的 import で「test 単位の failure」に限定する (= red の粒度を保つ).
 *
 * Vite の静的解析は文字列リテラルの import を pre-resolve するため,
 * 変数経由で path を渡して解析を回避する (= 実装後は通常 import される).
 */
// 型は JSX として使える ComponentType に緩めて受ける (props は任意).
// 実装後は静的 import 相当の型解決が走るが, ここでは「dynamic import + 任意 props」
// で受けるため ComponentType<Record<string, unknown>> に cast している.
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

describe("TaskCard / TaskFormCard コンポーネント新設 (BL-059 / task-card-component)", () => {
  // ============================================================
  // CSS 直読み系 (AC-1 〜 AC-6 / AC-26)
  // ============================================================

  // ----------------------------------------------------------
  // AC-1: .task-card 基底に visual 4 宣言 + 3 段 layout 宣言を持つ
  // ----------------------------------------------------------
  /**
   * シナリオ AC-1:
   *   Given web/src/ui/task-card/task-card.css を開いた
   *   When  .task-card セレクタのルール本文を観察する
   *   Then  display: flex / flex-direction: column / gap: var(--space-md) を含む
   *    かつ background: var(--color-bg) / border: 1px solid var(--color-border) /
   *         border-radius: var(--radius-lg) / padding: var(--space-md) を含む
   */
  describe("AC-1: .task-card 基底クラスが visual 4 宣言 + 3 段 layout を持つ", () => {
    it("task-card.css が存在する", () => {
      expect(existsSync(taskCardCssPath)).toBe(true);
    });

    it(".task-card ルール本文に display: flex を含む", () => {
      const css = readFileSync(taskCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".task-card");
      expect(body, ".task-card ルールが見つからない").not.toBeNull();
      expect(body ?? "").toMatch(/display\s*:\s*flex/);
    });

    it(".task-card ルール本文に flex-direction: column を含む", () => {
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

    it(".task-card ルール本文に background: var(--color-bg) を含む", () => {
      const css = readFileSync(taskCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".task-card");
      expect(body, ".task-card ルールが見つからない").not.toBeNull();
      expect(body ?? "").toMatch(/background(?:-color)?\s*:\s*var\(--color-bg\)/);
    });

    it(".task-card ルール本文に border: 1px solid var(--color-border) (または等価分解) を含む", () => {
      const css = readFileSync(taskCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".task-card");
      expect(body, ".task-card ルールが見つからない").not.toBeNull();
      const bodyText = body ?? "";
      const hasShorthand = /border\s*:\s*1px\s+solid\s+var\(--color-border\)/.test(bodyText);
      const hasDecomposed =
        /border-width\s*:\s*1px/.test(bodyText) &&
        /border-style\s*:\s*solid/.test(bodyText) &&
        /border-color\s*:\s*var\(--color-border\)/.test(bodyText);
      expect(
        hasShorthand || hasDecomposed,
        ".task-card に border: 1px solid var(--color-border) 等価宣言が無い",
      ).toBe(true);
    });

    it(".task-card ルール本文に border-radius: var(--radius-lg) を含む", () => {
      const css = readFileSync(taskCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".task-card");
      expect(body, ".task-card ルールが見つからない").not.toBeNull();
      expect(body ?? "").toMatch(/border-radius\s*:\s*var\(--radius-lg\)/);
    });

    it(".task-card ルール本文に padding: var(--space-md) を含む", () => {
      const css = readFileSync(taskCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".task-card");
      expect(body, ".task-card ルールが見つからない").not.toBeNull();
      // gap: var(--space-md) と誤検知しないよう padding: で始まる宣言に限定する.
      expect(body ?? "").toMatch(/(?:^|;|\n)\s*padding\s*:\s*var\(--space-md\)/);
    });
  });

  // ----------------------------------------------------------
  // AC-2: .task-card--focus が 3px 太枠 + 通常 padding を持つ (V-1)
  // ----------------------------------------------------------
  /**
   * シナリオ AC-2:
   *   Given web/src/ui/task-card/task-card.css を開いた
   *   When  .task-card--focus セレクタのルール本文を観察する
   *   Then  border-width: 3px を含む
   *    かつ padding: var(--space-lg) を含まない (= 通常カードと padding を揃える)
   */
  describe("AC-2: .task-card--focus が 3px 太枠 + 通常 padding を持つ (V-1)", () => {
    it(".task-card--focus ルール本文に border-width: 3px を含む", () => {
      const css = readFileSync(taskCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".task-card--focus");
      expect(body, ".task-card--focus ルールが見つからない").not.toBeNull();
      expect(body ?? "").toMatch(/border-width\s*:\s*3px/);
    });

    it(".task-card--focus ルール本文に padding: var(--space-lg) を含まない (V-1)", () => {
      const css = readFileSync(taskCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".task-card--focus");
      expect(body, ".task-card--focus ルールが見つからない").not.toBeNull();
      expect(body ?? "").not.toMatch(/(?:^|;|\n)\s*padding\s*:\s*var\(--space-lg\)/);
    });
  });

  // ----------------------------------------------------------
  // AC-3: .task-card__header が PriorityStars を右配置するための space-between を持つ
  // ----------------------------------------------------------
  /**
   * シナリオ AC-3:
   *   Given web/src/ui/task-card/task-card.css を開いた
   *   When  .task-card__header セレクタのルール本文を観察する
   *   Then  display: flex / justify-content: space-between / align-items: center を含む
   */
  describe("AC-3: .task-card__header に space-between + align-items: center を持つ (V-3)", () => {
    it(".task-card__header ルール本文に display: flex を含む", () => {
      const css = readFileSync(taskCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".task-card__header");
      expect(body, ".task-card__header ルールが見つからない").not.toBeNull();
      expect(body ?? "").toMatch(/display\s*:\s*flex/);
    });

    it(".task-card__header ルール本文に justify-content: space-between を含む", () => {
      const css = readFileSync(taskCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".task-card__header");
      expect(body, ".task-card__header ルールが見つからない").not.toBeNull();
      expect(body ?? "").toMatch(/justify-content\s*:\s*space-between/);
    });

    it(".task-card__header ルール本文に align-items: center を含む", () => {
      const css = readFileSync(taskCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".task-card__header");
      expect(body, ".task-card__header ルールが見つからない").not.toBeNull();
      expect(body ?? "").toMatch(/align-items\s*:\s*center/);
    });
  });

  // ----------------------------------------------------------
  // AC-4: .task-card__title がタスク名中央寄せ + フォント拡大を持つ (V-4 / V-7)
  // ----------------------------------------------------------
  /**
   * シナリオ AC-4:
   *   Given web/src/ui/task-card/task-card.css を開いた
   *   When  .task-card__title セレクタのルール本文を観察する
   *   Then  display: flex / justify-content: center / font-size: var(--font-size-h2) を含む
   */
  describe("AC-4: .task-card__title が中央寄せ + フォント拡大を持つ (V-4 / V-7)", () => {
    it(".task-card__title ルール本文に display: flex を含む", () => {
      const css = readFileSync(taskCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".task-card__title");
      expect(body, ".task-card__title ルールが見つからない").not.toBeNull();
      expect(body ?? "").toMatch(/display\s*:\s*flex/);
    });

    it(".task-card__title ルール本文に justify-content: center を含む", () => {
      const css = readFileSync(taskCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".task-card__title");
      expect(body, ".task-card__title ルールが見つからない").not.toBeNull();
      expect(body ?? "").toMatch(/justify-content\s*:\s*center/);
    });

    it(".task-card__title ルール本文に font-size: var(--font-size-h2) を含む", () => {
      const css = readFileSync(taskCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".task-card__title");
      expect(body, ".task-card__title ルールが見つからない").not.toBeNull();
      expect(body ?? "").toMatch(/font-size\s*:\s*var\(--font-size-h2\)/);
    });
  });

  // ----------------------------------------------------------
  // AC-5: .task-card__actions の justify-content が撤去されている
  //       (旧 BL-059 V-2 = center を BL-063 hotfix REQ-2 で撤去 / D-007 / P-009)
  // ----------------------------------------------------------
  /**
   * 当初仕様 (BL-059 V-2):
   *   .task-card__actions { justify-content: center } を期待していた.
   *
   * BL-063 (task-card-hotfix) で置換:
   *   user 要求は「削除: 左端 / 完了: 右端 / 中間: 中央寄り」.
   *   親 .task-card__actions の justify-content は不問とし, 子に auto-margin
   *   (.task-card__actions__delete { margin-right: auto } /
   *    .task-card__actions__complete { margin-left: auto }) を当てて両端配置を実現する.
   *   したがって BL-063 以降 .task-card__actions ルール本文には:
   *     - justify-content: center を **含まない** (旧 V-2 撤去 / 本 BL で逆転)
   *     - justify-content: flex-end を **含まない** (旧 BL-057 値の回帰防止維持)
   *   子要素側の hotfix className / auto-margin 期待は
   *   web/__tests__/task-card-hotfix.test.tsx (BL-063 / AC-5 / AC-6 / AC-7) で網羅する.
   *
   * シナリオ AC-5 (BL-063 追従後):
   *   Given web/src/ui/task-card/task-card.css を開いた
   *   When  .task-card__actions セレクタのルール本文を観察する
   *   Then  display: flex を含む (3 段 layout は維持)
   *    かつ justify-content: center を含まない (= V-2 撤去 / BL-063 REQ-2)
   *    かつ justify-content: flex-end を含まない (= 旧 BL-057 値の回帰防止維持)
   */
  describe("AC-5: .task-card__actions から justify-content: center 撤去 (BL-063 hotfix REQ-2 / D-007)", () => {
    it(".task-card__actions ルール本文に display: flex を含む (3 段 layout 維持)", () => {
      const css = readFileSync(taskCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".task-card__actions");
      expect(body, ".task-card__actions ルールが見つからない").not.toBeNull();
      expect(body ?? "").toMatch(/display\s*:\s*flex/);
    });

    it(".task-card__actions ルール本文に justify-content: center を含まない (BL-063 で V-2 を撤去)", () => {
      const css = readFileSync(taskCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".task-card__actions");
      expect(body, ".task-card__actions ルールが見つからない").not.toBeNull();
      expect(
        body ?? "",
        ".task-card__actions に justify-content: center が残存 (BL-063 REQ-2 で撤去すべき)",
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
  // AC-6: タスク名 input がカードの font を継承する (V-7)
  // ----------------------------------------------------------
  /**
   * シナリオ AC-6:
   *   Given web/src/ui/task-card/task-card.css を開いた
   *   When  .task-card__title input[type="text"] セレクタのルール本文を観察する
   *   Then  font: inherit (または font-size: inherit) を含む
   */
  describe("AC-6: .task-card__title input[type=text] が font 継承 (V-7)", () => {
    it('.task-card__title input[type="text"] ルール本文に font: inherit / font-size: inherit のいずれかを含む', () => {
      const css = readFileSync(taskCardCssPath, "utf-8");
      const body = extractRuleBody(css, '.task-card__title input[type="text"]');
      expect(body, '.task-card__title input[type="text"] ルールが見つからない').not.toBeNull();
      const bodyText = body ?? "";
      const hasFontShorthand = /(?:^|;|\n)\s*font\s*:\s*inherit/.test(bodyText);
      const hasFontSizeInherit = /(?:^|;|\n)\s*font-size\s*:\s*inherit/.test(bodyText);
      expect(
        hasFontShorthand || hasFontSizeInherit,
        '.task-card__title input[type="text"] に font: inherit / font-size: inherit 等価宣言が無い',
      ).toBe(true);
    });
  });

  // ============================================================
  // jsdom DOM レンダ系 (AC-7 〜 AC-14)
  // ============================================================

  // ----------------------------------------------------------
  // AC-7: <TaskCard> がタスクを 3 段ゾーン構造で描画する
  // ----------------------------------------------------------
  /**
   * シナリオ AC-7:
   *   Given <TaskCard> コンポーネントが存在する
   *    かつ project あり / showPriority=true / showSetFocus=false /
   *         actionSet="full" / dueDateMode="today" で render する
   *   When  出力 DOM を観察する
   *   Then  ルート要素は <li class="task-card"> である
   *    かつ .task-card__header 内に <span class="project-chip"> と role=radiogroup が存在する
   *    かつ .task-card__title 内にタスク名テキストが存在する
   *    かつ .task-card__actions 内に「削除」「明日にする」「完了」 button が存在する
   */
  describe("AC-7: <TaskCard> がタスクを 3 段ゾーン構造で描画する", () => {
    it("project あり / showPriority=true / showSetFocus=false / actionSet=full / dueDateMode=today で render する", async () => {
      const { TaskCard } = await importTaskCard();
      const task = makeTask({ id: "t-1", name: "牛乳", projectId: PROJECT_ID_P1 });
      const project = makeProject();
      const { container } = render(
        <TaskCard
          task={task}
          project={project}
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

      const root = container.firstElementChild as HTMLElement | null;
      expect(root, "TaskCard の root 要素が見つからない").not.toBeNull();
      expect(root?.tagName.toLowerCase()).toBe("li");
      expect(root?.classList.contains("task-card")).toBe(true);

      const header = root?.querySelector(".task-card__header");
      const title = root?.querySelector(".task-card__title");
      const actions = root?.querySelector(".task-card__actions");
      expect(header, ".task-card__header が root 内に存在しない").not.toBeNull();
      expect(title, ".task-card__title が root 内に存在しない").not.toBeNull();
      expect(actions, ".task-card__actions が root 内に存在しない").not.toBeNull();

      // header に chip + radiogroup.
      const chip = header?.querySelector(".project-chip");
      expect(chip, "header 段に .project-chip が無い").not.toBeNull();
      expect(chip?.textContent ?? "").toContain(PROJECT_NAME_P1);
      const radiogroup = header?.querySelector('[role="radiogroup"]');
      expect(
        radiogroup,
        "header 段に role=radiogroup (= PriorityStars) が無い (V-3 違反)",
      ).not.toBeNull();

      // title にタスク名.
      expect(title?.textContent ?? "").toContain("牛乳");

      // actions に 3 ボタン (manual origin / dueDateMode=today なので「明日にする」).
      const actionBtns = Array.from(actions?.querySelectorAll("button") ?? []).map(
        (b) => b.textContent ?? "",
      );
      expect(actionBtns.some((t) => t.includes("削除"))).toBe(true);
      expect(actionBtns.some((t) => t.includes("明日にする"))).toBe(true);
      expect(actionBtns.some((t) => t.includes("完了"))).toBe(true);
    });

    it('dueDateMode="tomorrow" のとき「今日にする」 button が出る (D-003)', async () => {
      const { TaskCard } = await importTaskCard();
      const task = makeTask({ dueDate: "tomorrow" });
      const { container } = render(
        <TaskCard
          task={task}
          project={null}
          showPriority={false}
          actionSet="full"
          dueDateMode="tomorrow"
          onDelete={() => {}}
          onToggleDueDate={() => {}}
          onComplete={() => {}}
        />,
      );
      const actions = container.querySelector(".task-card__actions");
      const actionBtns = Array.from(actions?.querySelectorAll("button") ?? []).map(
        (b) => b.textContent ?? "",
      );
      expect(actionBtns.some((t) => t.includes("今日にする"))).toBe(true);
      expect(actionBtns.some((t) => t.includes("明日にする"))).toBe(false);
    });
  });

  // ----------------------------------------------------------
  // AC-8: variant="focus" + as="section" + aria-label が反映される (D-002 / D-004)
  // ----------------------------------------------------------
  /**
   * シナリオ AC-8:
   *   Given <TaskCard as="section" variant="focus" aria-label="現在のタスク" /> を render する
   *   When  出力 DOM を観察する
   *   Then  ルート要素は <section>
   *    かつ ルート要素の className に "task-card" と "task-card--focus" の両方を含む
   *    かつ ルート要素は aria-label="現在のタスク" を持つ
   */
  describe("AC-8: variant=focus + as=section + aria-label が反映される (D-002 / D-004)", () => {
    it("<TaskCard as='section' variant='focus' aria-label='現在のタスク'> が反映される", async () => {
      const { TaskCard } = await importTaskCard();
      const task = makeTask();
      const { container } = render(
        <TaskCard
          as="section"
          variant="focus"
          aria-label="現在のタスク"
          task={task}
          project={null}
          showPriority={false}
          actionSet="full"
          dueDateMode="today"
          onDelete={() => {}}
          onToggleDueDate={() => {}}
          onComplete={() => {}}
        />,
      );
      const root = container.firstElementChild as HTMLElement | null;
      expect(root, "TaskCard の root 要素が見つからない").not.toBeNull();
      expect(root?.tagName.toLowerCase()).toBe("section");
      expect(root?.classList.contains("task-card")).toBe(true);
      expect(root?.classList.contains("task-card--focus")).toBe(true);
      expect(root?.getAttribute("aria-label")).toBe("現在のタスク");
    });

    it('as="div" を渡すとルートが <div> になる (D-004 / focus-view 用)', async () => {
      const { TaskCard } = await importTaskCard();
      const { container } = render(
        <TaskCard
          as="div"
          variant="focus"
          task={makeTask()}
          project={null}
          showPriority={false}
          actionSet="minimal"
          onDelete={() => {}}
          onComplete={() => {}}
        />,
      );
      const root = container.firstElementChild as HTMLElement | null;
      expect(root?.tagName.toLowerCase()).toBe("div");
    });
  });

  // ----------------------------------------------------------
  // AC-9: showPriority=false (tomorrow-view) では PriorityStars が出ない (D-003)
  // ----------------------------------------------------------
  /**
   * シナリオ AC-9:
   *   Given <TaskCard showPriority={false} ... /> を render する
   *   When  出力 DOM を観察する
   *   Then  role="radiogroup" 要素が存在しない
   */
  describe("AC-9: showPriority=false で PriorityStars が出ない (D-003)", () => {
    it("showPriority=false で render したとき radiogroup が DOM 上に存在しない", async () => {
      const { TaskCard } = await importTaskCard();
      const { container } = render(
        <TaskCard
          task={makeTask()}
          project={null}
          showPriority={false}
          actionSet="full"
          dueDateMode="today"
          onDelete={() => {}}
          onToggleDueDate={() => {}}
          onComplete={() => {}}
        />,
      );
      expect(container.querySelector('[role="radiogroup"]')).toBeNull();
    });
  });

  // ----------------------------------------------------------
  // AC-10: showSetFocus=true (today otherTasks) では「現在のタスクにする」が出る (D-003)
  // ----------------------------------------------------------
  /**
   * シナリオ AC-10:
   *   Given <TaskCard showSetFocus={true} ... /> を render する
   *   When  出力 DOM を観察する
   *   Then  .task-card__actions 内に「現在のタスクにする」 button が存在する
   */
  describe("AC-10: showSetFocus=true で「現在のタスクにする」 button が出る (D-003)", () => {
    it("showSetFocus=true で render したとき actions 内に「現在のタスクにする」 button が存在する", async () => {
      const { TaskCard } = await importTaskCard();
      const { container } = render(
        <TaskCard
          task={makeTask()}
          project={null}
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
      const actions = container.querySelector(".task-card__actions");
      expect(actions, ".task-card__actions が見つからない").not.toBeNull();
      const labels = Array.from(actions?.querySelectorAll("button") ?? []).map(
        (b) => b.textContent ?? "",
      );
      expect(
        labels.some((t) => t.includes("現在のタスクにする")),
        `actions に「現在のタスクにする」が無い (実際: ${JSON.stringify(labels)})`,
      ).toBe(true);
    });

    it("showSetFocus=false (default) では「現在のタスクにする」 button が出ない", async () => {
      const { TaskCard } = await importTaskCard();
      const { container } = render(
        <TaskCard
          task={makeTask()}
          project={null}
          showPriority={false}
          actionSet="full"
          dueDateMode="today"
          onDelete={() => {}}
          onToggleDueDate={() => {}}
          onComplete={() => {}}
        />,
      );
      const actions = container.querySelector(".task-card__actions");
      const labels = Array.from(actions?.querySelectorAll("button") ?? []).map(
        (b) => b.textContent ?? "",
      );
      expect(labels.some((t) => t.includes("現在のタスクにする"))).toBe(false);
    });
  });

  // ----------------------------------------------------------
  // AC-11: actionSet="minimal" (focus-view) では actions が 2 ボタンのみ (D-003)
  // ----------------------------------------------------------
  /**
   * シナリオ AC-11:
   *   Given <TaskCard actionSet="minimal" showSetFocus={false} ... /> を render する
   *   When  .task-card__actions 内の button を観察する
   *   Then  「削除」「完了」 button が存在し
   *    かつ 「明日にする」/「今日にする」/「現在のタスクにする」 button は存在しない
   */
  describe("AC-11: actionSet=minimal で actions が 2 ボタンのみ (D-003)", () => {
    it('actionSet="minimal" で render すると 2 ボタン (削除 / 完了) のみ表示される', async () => {
      const { TaskCard } = await importTaskCard();
      const { container } = render(
        <TaskCard
          task={makeTask()}
          project={null}
          showPriority={false}
          showSetFocus={false}
          actionSet="minimal"
          onDelete={() => {}}
          onComplete={() => {}}
        />,
      );
      const actions = container.querySelector(".task-card__actions");
      expect(actions, ".task-card__actions が見つからない").not.toBeNull();
      const labels = Array.from(actions?.querySelectorAll("button") ?? []).map(
        (b) => b.textContent ?? "",
      );
      expect(labels.some((t) => t.includes("削除"))).toBe(true);
      expect(labels.some((t) => t.includes("完了"))).toBe(true);
      expect(labels.some((t) => t.includes("明日にする"))).toBe(false);
      expect(labels.some((t) => t.includes("今日にする"))).toBe(false);
      expect(labels.some((t) => t.includes("現在のタスクにする"))).toBe(false);
    });
  });

  // ----------------------------------------------------------
  // AC-12: origin="routine" では「明日にする」「今日にする」が出ない (BL-017 / BL-042 維持)
  // ----------------------------------------------------------
  /**
   * シナリオ AC-12:
   *   Given task.origin === "routine" の task を渡して <TaskCard actionSet="full" /> を render する
   *   When  .task-card__actions 内の button を観察する
   *   Then  「明日にする」「今日にする」が存在しない
   *    かつ 「削除」「完了」は存在する
   */
  describe("AC-12: origin=routine では「明日にする」「今日にする」が出ない (BL-017 / BL-042 維持)", () => {
    it('task.origin === "routine" で render しても期限切替 button は出ない', async () => {
      const { TaskCard } = await importTaskCard();
      const task = makeTask({ origin: "routine", routineId: "routine-1" });
      const { container } = render(
        <TaskCard
          task={task}
          project={null}
          showPriority={false}
          actionSet="full"
          dueDateMode="today"
          onDelete={() => {}}
          onToggleDueDate={() => {}}
          onComplete={() => {}}
        />,
      );
      const actions = container.querySelector(".task-card__actions");
      const labels = Array.from(actions?.querySelectorAll("button") ?? []).map(
        (b) => b.textContent ?? "",
      );
      expect(labels.some((t) => t.includes("明日にする"))).toBe(false);
      expect(labels.some((t) => t.includes("今日にする"))).toBe(false);
      expect(labels.some((t) => t.includes("削除"))).toBe(true);
      expect(labels.some((t) => t.includes("完了"))).toBe(true);
    });
  });

  // ----------------------------------------------------------
  // AC-13: <TaskFormCard> が 3 段ゾーン構造で起票フォームを描画する
  // ----------------------------------------------------------
  /**
   * シナリオ AC-13:
   *   Given <TaskFormCard projects=[...] idPrefix="create" inputId="task-name"
   *         formAriaLabel="タスク起票フォーム" ... /> を render する
   *   When  出力 DOM を観察する
   *   Then  ルートは <form aria-label="タスク起票フォーム" class="task-card task-card--form">
   *    かつ .task-card__header に ProjectToggle (button[name~="プロジェクト"]) + role=radiogroup
   *    かつ .task-card__title に <label for="task-name"> + <input id="task-name">
   *    かつ .task-card__actions に <button type="submit">追加</button>
   */
  describe("AC-13: <TaskFormCard> が 3 段ゾーン構造で起票フォームを描画する", () => {
    it("ルートが <form class='task-card task-card--form' aria-label='タスク起票フォーム'> である", async () => {
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
      const root = container.firstElementChild as HTMLElement | null;
      expect(root, "TaskFormCard の root 要素が見つからない").not.toBeNull();
      expect(root?.tagName.toLowerCase()).toBe("form");
      expect(root?.classList.contains("task-card")).toBe(true);
      expect(root?.classList.contains("task-card--form")).toBe(true);
      expect(root?.getAttribute("aria-label")).toBe("タスク起票フォーム");
    });

    it("3 段ゾーン (header / title / actions) が root 直下子要素として存在する", async () => {
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
      const root = container.firstElementChild as HTMLElement | null;
      expect(root?.querySelector(".task-card__header")).not.toBeNull();
      expect(root?.querySelector(".task-card__title")).not.toBeNull();
      expect(root?.querySelector(".task-card__actions")).not.toBeNull();
    });

    it("header 段に <select id='create-project'> + role=radiogroup (PriorityStars) が存在する", async () => {
      // BL-065 (project-toggle-removal): ProjectToggle (button[name~='プロジェクト']) を
      // <select id="create-project"> + <label htmlFor="create-project"> に置換した.
      // AC-1 〜 AC-4 (BL-065) の詳細検証は task-form-card-select.test.tsx に集約.
      // 本 it は「header 段にプロジェクト用 <select> と PriorityStars が同居する」軽量スポット.
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
      const header = container.querySelector(".task-card__header");
      expect(header, ".task-card__header が見つからない").not.toBeNull();
      // BL-065: プロジェクト入力は <select id="create-project">.
      const projectSelect = header?.querySelector("select#create-project");
      expect(
        projectSelect,
        "header に <select id='create-project'> が無い (BL-065 REQ-1 違反)",
      ).not.toBeNull();
      // PriorityStars は role=radiogroup.
      expect(
        header?.querySelector('[role="radiogroup"]'),
        "header に PriorityStars (radiogroup) が無い (D-006 違反)",
      ).not.toBeNull();
    });

    it("title 段に <label for='task-name'>タスク名</label> + <input id='task-name'> が存在する", async () => {
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
      const title = container.querySelector(".task-card__title");
      expect(title, ".task-card__title が見つからない").not.toBeNull();
      const label = title?.querySelector("label");
      const input = title?.querySelector("input");
      expect(label, "title 段に <label> が無い").not.toBeNull();
      expect(input, "title 段に <input> が無い").not.toBeNull();
      expect(label?.getAttribute("for")).toBe("task-name");
      expect(label?.textContent ?? "").toContain("タスク名");
      expect(input?.getAttribute("id")).toBe("task-name");
    });

    it("actions 段に <button type='submit'>追加</button> が存在する", async () => {
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
      const submit = actions?.querySelector('button[type="submit"]');
      expect(submit, "actions 段に submit button が無い").not.toBeNull();
      expect(submit?.textContent ?? "").toContain("追加");
    });

    it("onSubmit prop が <form onSubmit> として渡される", async () => {
      const { TaskFormCard } = await importTaskFormCard();
      const onSubmit = vi.fn((e: { preventDefault: () => void }) => {
        e.preventDefault();
      });
      render(
        <TaskFormCard
          projects={[]}
          projectId=""
          onProjectIdChange={() => {}}
          priority="normal"
          onPriorityChange={() => {}}
          name="買い物"
          onNameChange={() => {}}
          onSubmit={onSubmit}
          idPrefix="create"
          inputId="task-name"
          formAriaLabel="タスク起票フォーム"
        />,
      );
      const form = screen.getByRole("form", { name: "タスク起票フォーム" });
      (form as HTMLFormElement).requestSubmit();
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });
  });

  // ----------------------------------------------------------
  // AC-14: <TaskFormCard> から「↑タップで選択」と「優先度」label span が撤去されている (V-6)
  // ----------------------------------------------------------
  /**
   * シナリオ AC-14:
   *   Given <TaskFormCard ... /> を render する
   *   When  出力 DOM を観察する
   *   Then  テキスト「↑タップで選択」を含む要素が存在しない
   *    かつ id="task-priority-label" / id="tomorrow-task-priority-label" の要素が存在しない
   *    かつ class="day-view__form__priority-hint" の要素が存在しない
   */
  describe("AC-14: <TaskFormCard> から「↑タップで選択」と「優先度」label span が撤去されている (V-6)", () => {
    it("テキスト「↑タップで選択」を含む要素が存在しない", async () => {
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
        "「↑タップで選択」テキストが TaskFormCard 内に残存 (V-6 違反)",
      ).toBe(false);
    });

    it('id="task-priority-label" / id="tomorrow-task-priority-label" の要素が存在しない', async () => {
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
          idPrefix="tomorrow-create"
          inputId="tomorrow-task-name"
          formAriaLabel="明日のタスク起票フォーム"
        />,
      );
      expect(container.querySelector("#task-priority-label")).toBeNull();
      expect(container.querySelector("#tomorrow-task-priority-label")).toBeNull();
    });

    it('class="day-view__form__priority-hint" の要素が存在しない', async () => {
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
      expect(container.querySelector(".day-view__form__priority-hint")).toBeNull();
    });
  });

  // ============================================================
  // view 適用 (readFileSync 系 / AC-15 〜 AC-17)
  // ============================================================

  // ----------------------------------------------------------
  // AC-15: today-view が <TaskCard> / <TaskFormCard> を使う (REQ-4)
  // ----------------------------------------------------------
  /**
   * シナリオ AC-15:
   *   Given web/src/ui/today-view/today-view.tsx を開いた
   *   When  ファイル本文を観察する
   *   Then  import { TaskCard } / import { TaskFormCard } 文を含む
   *    かつ <TaskCard ... /> の使用が 2 か所以上 / <TaskFormCard ... /> が 1 か所以上
   *    かつ <h2>現在のタスク</h2> 文字列が存在しない (V-5)
   *    かつ className="day-view__card" / className="day-view__form" が存在しない
   */
  describe("AC-15: today-view が <TaskCard> / <TaskFormCard> を使う (REQ-4)", () => {
    it("today-view.tsx に TaskCard / TaskFormCard import 文を含む", () => {
      const tsx = readFileSync(todayViewTsxPath, "utf-8");
      expect(tsx).toMatch(
        /import\s+\{\s*TaskCard\s*\}\s+from\s+["']\.\.\/task-card\/task-card\.js["']/,
      );
      expect(tsx).toMatch(
        /import\s+\{\s*TaskFormCard\s*\}\s+from\s+["']\.\.\/task-card\/task-form-card\.js["']/,
      );
    });

    it("today-view.tsx に <TaskCard ... /> の使用が 2 か所以上ある (focusedTask + otherTasks)", () => {
      const tsx = readFileSync(todayViewTsxPath, "utf-8");
      const matches = tsx.match(/<TaskCard\b/g) ?? [];
      expect(matches.length, "today-view.tsx 内に <TaskCard が 2 か所未満").toBeGreaterThanOrEqual(
        2,
      );
    });

    it("today-view.tsx に <TaskFormCard ... /> の使用が 1 か所以上ある", () => {
      const tsx = readFileSync(todayViewTsxPath, "utf-8");
      expect(tsx).toMatch(/<TaskFormCard\b/);
    });

    it("today-view.tsx に <h2>現在のタスク</h2> の文字列が存在しない (V-5)", () => {
      const tsx = readFileSync(todayViewTsxPath, "utf-8");
      expect(tsx).not.toMatch(/<h2>\s*現在のタスク\s*<\/h2>/);
    });

    it('today-view.tsx に className="day-view__card" / className="day-view__form" の使用が存在しない (REQ-7)', () => {
      const tsx = readFileSync(todayViewTsxPath, "utf-8");
      expect(tsx).not.toMatch(/className=["'][^"']*day-view__card[^"']*["']/);
      expect(tsx).not.toMatch(/className=["'][^"']*day-view__form[^"']*["']/);
    });
  });

  // ----------------------------------------------------------
  // AC-16: tomorrow-view が <TaskCard> / <TaskFormCard> を使う (REQ-5)
  // ----------------------------------------------------------
  describe("AC-16: tomorrow-view が <TaskCard> / <TaskFormCard> を使う (REQ-5)", () => {
    it("tomorrow-view.tsx に TaskCard / TaskFormCard import 文を含む", () => {
      const tsx = readFileSync(tomorrowViewTsxPath, "utf-8");
      expect(tsx).toMatch(
        /import\s+\{\s*TaskCard\s*\}\s+from\s+["']\.\.\/task-card\/task-card\.js["']/,
      );
      expect(tsx).toMatch(
        /import\s+\{\s*TaskFormCard\s*\}\s+from\s+["']\.\.\/task-card\/task-form-card\.js["']/,
      );
    });

    it("tomorrow-view.tsx に <TaskCard ... /> の使用が 1 か所以上ある", () => {
      const tsx = readFileSync(tomorrowViewTsxPath, "utf-8");
      expect(tsx).toMatch(/<TaskCard\b/);
    });

    it("tomorrow-view.tsx に <TaskFormCard ... /> の使用が 1 か所以上ある", () => {
      const tsx = readFileSync(tomorrowViewTsxPath, "utf-8");
      expect(tsx).toMatch(/<TaskFormCard\b/);
    });

    it('tomorrow-view.tsx に className="day-view__card" / className="day-view__form" の使用が存在しない (REQ-7)', () => {
      const tsx = readFileSync(tomorrowViewTsxPath, "utf-8");
      expect(tsx).not.toMatch(/className=["'][^"']*day-view__card[^"']*["']/);
      expect(tsx).not.toMatch(/className=["'][^"']*day-view__form[^"']*["']/);
    });
  });

  // ----------------------------------------------------------
  // AC-17: focus-view が <TaskCard variant="focus" actionSet="minimal"> を使う (REQ-6 / D-007)
  // ----------------------------------------------------------
  describe("AC-17: focus-view が <TaskCard variant=focus actionSet=minimal> を使う (REQ-6 / D-007)", () => {
    it("focus-view.tsx に TaskCard import 文を含む", () => {
      const tsx = readFileSync(focusViewTsxPath, "utf-8");
      expect(tsx).toMatch(
        /import\s+\{\s*TaskCard\s*\}\s+from\s+["']\.\.\/task-card\/task-card\.js["']/,
      );
    });

    it('focus-view.tsx で variant="focus" + actionSet="minimal" が組み合わせて使われている', () => {
      const tsx = readFileSync(focusViewTsxPath, "utf-8");
      // TaskCard 利用箇所のいずれかの開始タグ 〜 終了 ">" の間に
      // variant="focus" と actionSet="minimal" の両方の文字列が含まれることを確認.
      // 単純化のためファイル全体に両キーワードが含まれていることのみ assert する.
      expect(tsx).toMatch(/<TaskCard\b/);
      expect(tsx).toMatch(/variant=["']focus["']/);
      expect(tsx).toMatch(/actionSet=["']minimal["']/);
    });

    it('focus-view.tsx に className="focus-view__card" の使用が存在しない (REQ-7)', () => {
      const tsx = readFileSync(focusViewTsxPath, "utf-8");
      expect(tsx).not.toMatch(/className=["'][^"']*focus-view__card[^"']*["']/);
    });

    it("focus-view.tsx に <h1>現在のタスク</h1> が引き続き含まれる (REQ-6 / 6-4)", () => {
      const tsx = readFileSync(focusViewTsxPath, "utf-8");
      expect(tsx).toMatch(/<h1>\s*現在のタスク\s*<\/h1>/);
    });
  });

  // ============================================================
  // 旧セレクタ撤去 / 維持 (CSS 直読み / AC-18 〜 AC-20)
  // ============================================================

  // ----------------------------------------------------------
  // AC-18: day-view.css から旧 .day-view__card 系 / .day-view__form 系セレクタが撤去 (REQ-7)
  // ----------------------------------------------------------
  describe("AC-18: 旧 .day-view__card / .day-view__form 系セレクタが day-view.css から撤去 (REQ-7)", () => {
    const REMOVED_SELECTORS = [
      ".day-view__card",
      ".day-view__card--focus",
      ".day-view__card__header",
      ".day-view__card__title",
      ".day-view__card__actions",
      ".day-view__form",
      ".day-view__form__project",
      ".day-view__form__priority",
      ".day-view__form__priority-hint",
      ".day-view__form__name",
      ".day-view__form__submit",
    ] as const;

    it.each(REMOVED_SELECTORS)("%s セレクタが day-view.css に定義されていない", (selector) => {
      const css = readFileSync(dayViewCssPath, "utf-8");
      const body = extractRuleBody(css, selector);
      expect(
        body,
        `${selector} ルールが day-view.css に残存している (REQ-7 違反 / BL-059 で撤去対象)`,
      ).toBeNull();
    });
  });

  // ----------------------------------------------------------
  // AC-19: day-view.css の維持セレクタが引き続き存在 (REQ-13)
  // ----------------------------------------------------------
  describe("AC-19: day-view.css の維持セレクタが引き続き存在 (REQ-13)", () => {
    const KEPT_SELECTORS = [
      ".day-view",
      ".day-view__header",
      ".day-view__list",
      ".day-view__empty",
      ".project-chip",
    ] as const;

    it.each(KEPT_SELECTORS)("%s ルールが引き続き day-view.css に定義されている", (selector) => {
      const css = readFileSync(dayViewCssPath, "utf-8");
      const body = extractRuleBody(css, selector);
      expect(body, `${selector} ルールが day-view.css から消えている (REQ-13 違反)`).not.toBeNull();
    });
  });

  // ----------------------------------------------------------
  // AC-20: focus-view.css から .focus-view__card 系が撤去 / 枠は維持 (REQ-7 / D-007)
  // ----------------------------------------------------------
  describe("AC-20: focus-view.css から .focus-view__card 系が撤去 / 枠は維持 (REQ-7 / D-007)", () => {
    const REMOVED = [
      ".focus-view__card",
      ".focus-view__project",
      ".focus-view__name",
      ".focus-view__actions",
    ] as const;
    const KEPT = [".focus-view", ".focus-view__empty"] as const;

    it.each(REMOVED)("%s セレクタが focus-view.css に定義されていない", (selector) => {
      const css = readFileSync(focusViewCssPath, "utf-8");
      const body = extractRuleBody(css, selector);
      expect(body, `${selector} ルールが focus-view.css に残存している`).toBeNull();
    });

    it.each(KEPT)(
      "%s ルールが引き続き focus-view.css に定義されている (枠 / 空状態維持)",
      (selector) => {
        const css = readFileSync(focusViewCssPath, "utf-8");
        const body = extractRuleBody(css, selector);
        expect(
          body,
          `${selector} ルールが focus-view.css から消えている (D-007 違反)`,
        ).not.toBeNull();
      },
    );
  });

  // ============================================================
  // 不変性 (AC-21 〜 AC-24)
  // ============================================================

  // ----------------------------------------------------------
  // AC-21: .project-chip ルール本文が無改修 (NFR-CHIP-PRESERVE)
  // ----------------------------------------------------------
  describe("AC-21: .project-chip ルール本文が無改修 (NFR-CHIP-PRESERVE)", () => {
    it(".project-chip ルール本文に BL-056 確定の 5 宣言がすべて残っている", () => {
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
  // AC-22: tokens.css 無改修 (NFR-NO-NEW-TOKENS)
  // ----------------------------------------------------------
  describe("AC-22: tokens.css 無改修 (NFR-NO-NEW-TOKENS)", () => {
    it("tokens.css に本 BL で参照する主要トークン (--font-size-h2 / --space-md / --space-sm / --space-lg / --radius-lg / --color-bg / --color-border) が定義されている", () => {
      const css = readFileSync(tokensCssPath, "utf-8");
      expect(css).toMatch(/--font-size-h2\s*:/);
      expect(css).toMatch(/--space-md\s*:/);
      expect(css).toMatch(/--space-sm\s*:/);
      expect(css).toMatch(/--space-lg\s*:/);
      expect(css).toMatch(/--radius-lg\s*:/);
      expect(css).toMatch(/--color-bg\s*:/);
      expect(css).toMatch(/--color-border\s*:/);
    });

    it("tokens.css に本 BL では追加すべきでない --shadow-* / --font-size-lg トークンが存在しない (D-005)", () => {
      const css = readFileSync(tokensCssPath, "utf-8");
      expect(css).not.toMatch(/--shadow-/);
      expect(css).not.toMatch(/--font-size-lg\s*:/);
    });
  });

  // ----------------------------------------------------------
  // AC-23: PriorityStars prop API 無改修 (NFR-COMPONENT-API-FROZEN)
  //   BL-065 (project-toggle-removal) で ProjectToggle 本体が撤去されたため,
  //   ProjectToggle prop API 不変性 assert (旧 4 件) を撤去した. PriorityStars 側のみ維持する.
  // ----------------------------------------------------------
  describe("AC-23: PriorityStars prop API 無改修 (NFR-COMPONENT-API-FROZEN)", () => {
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

    it("priority-stars.tsx に role='radiogroup' が含まれる (内部 logic 無改修の軽量スポット)", () => {
      const tsx = readFileSync(priorityStarsTsxPath, "utf-8");
      expect(tsx).toContain('role="radiogroup"');
    });
  });

  // ----------------------------------------------------------
  // AC-24: タスク名 label/input の関連付けが保たれている (NFR-LABEL-PRESERVE)
  // ----------------------------------------------------------
  describe("AC-24: タスク名 label/input の関連付けが保たれている (NFR-LABEL-PRESERVE)", () => {
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

  // ============================================================
  // 機能制約 / NFR (AC-25 / AC-26)
  // ============================================================

  // ----------------------------------------------------------
  // AC-25: focus-view actions が 2 ボタンのみ (NFR-FOCUS-VIEW-ACTIONS-2BTN)
  // ----------------------------------------------------------
  describe("AC-25: focus-view actions が 2 ボタン (削除 / 完了) のみ (NFR-FOCUS-VIEW-ACTIONS-2BTN)", () => {
    it("focus-view を render すると task-card__actions に 削除 / 完了 のみが存在する", async () => {
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

      await screen.findByText("牛乳");

      const actions = container.querySelector(".task-card__actions");
      expect(
        actions,
        "focus-view の .task-card__actions が見つからない (REQ-6 違反)",
      ).not.toBeNull();
      const labels = Array.from(actions?.querySelectorAll("button") ?? []).map(
        (b) => b.textContent ?? "",
      );
      expect(labels.some((t) => t.includes("削除"))).toBe(true);
      expect(labels.some((t) => t.includes("完了"))).toBe(true);
      expect(labels.some((t) => t.includes("明日にする"))).toBe(false);
      expect(labels.some((t) => t.includes("今日にする"))).toBe(false);
      expect(labels.some((t) => t.includes("現在のタスクにする"))).toBe(false);
    });
  });

  // ----------------------------------------------------------
  // AC-26: .task-card 系セレクタに box-shadow / transition / animation / :hover が無い
  // ----------------------------------------------------------
  describe("AC-26: .task-card 系セレクタに box-shadow / transition / animation / :hover が無い", () => {
    it("task-card.css 全体に box-shadow キーワードが含まれない (NFR-NO-SHADOW)", () => {
      const css = readFileSync(taskCardCssPath, "utf-8");
      expect(css).not.toContain("box-shadow");
    });

    it("task-card.css 全体に transition 宣言が含まれない (NFR-NO-HOVER-TRANSITION)", () => {
      const css = readFileSync(taskCardCssPath, "utf-8");
      expect(css).not.toMatch(/(?:^|;|\n|\{)\s*transition\s*:/);
    });

    it("task-card.css 全体に animation 宣言が含まれない (NFR-NO-HOVER-TRANSITION)", () => {
      const css = readFileSync(taskCardCssPath, "utf-8");
      expect(css).not.toMatch(/(?:^|;|\n|\{)\s*animation\s*:/);
    });

    it.each([
      ".task-card:hover",
      ".task-card--focus:hover",
      ".task-card__header:hover",
      ".task-card__title:hover",
      ".task-card__actions:hover",
    ])("%s セレクタが task-card.css 内に存在しない", (selector) => {
      const css = readFileSync(taskCardCssPath, "utf-8");
      expect(css).not.toContain(selector);
    });
  });

  // ============================================================
  // 追加: 統合系 (today / tomorrow の <li class="task-card"> 描画スモーク)
  // ============================================================

  /**
   * 統合スモーク:
   *   today-view / tomorrow-view を render したとき, タスク行が <li class="task-card">
   *   を持ち, 3 段子要素 (.task-card__header / __title / __actions) を持つことを確認する.
   *   AC-15 / AC-16 のソース読みだけでは「<TaskCard> 経由で .task-card クラスが描画される」
   *   ことを保証できないため, DOM 上でも担保する.
   */
  describe("統合スモーク: today-view / tomorrow-view が <li class='task-card'> を描画する", () => {
    it("today-view の otherTasks <li> が .task-card クラスを持ち 3 段子要素を含む", async () => {
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

      const node = await screen.findByText("通常タスク");
      const card = node.closest("li");
      expect(card, "「通常タスク」を含む <li> が見つからない").not.toBeNull();
      expect(card?.classList.contains("task-card")).toBe(true);
      expect(card?.querySelector(".task-card__header")).not.toBeNull();
      expect(card?.querySelector(".task-card__title")).not.toBeNull();
      expect(card?.querySelector(".task-card__actions")).not.toBeNull();
    });

    it("tomorrow-view の <li> が .task-card クラスを持ち 3 段子要素を含む", async () => {
      const task = makeTask({ id: "tt-1", name: "明日タスク", dueDate: "tomorrow" });
      const repo = makeMockRepository([task]);
      const projectRepo = makeMockProjectRepository([]);
      renderWithQueryClient(<TomorrowView repository={repo} projectRepository={projectRepo} />);

      const node = await screen.findByText("明日タスク");
      const card = node.closest("li");
      expect(card, "「明日タスク」を含む <li> が見つからない").not.toBeNull();
      expect(card?.classList.contains("task-card")).toBe(true);
      expect(card?.querySelector(".task-card__header")).not.toBeNull();
      expect(card?.querySelector(".task-card__title")).not.toBeNull();
      expect(card?.querySelector(".task-card__actions")).not.toBeNull();
    });

    it("today-view の focusedTask <section> も .task-card / .task-card--focus を持つ (REQ-4 / D-002)", async () => {
      const focusedTask = makeTask({
        id: "task-focus",
        name: "フォーカスタスク",
        projectId: null,
        dueDate: "today",
        priority: "highest",
      });
      const repo = makeMockRepository([focusedTask], {
        initialFocus: {
          id: "singleton",
          currentTaskId: "task-focus",
          version: 1,
          updatedAt: NOW,
        },
      });
      const projectRepo = makeMockProjectRepository([]);
      renderWithQueryClient(<TodayView repository={repo} projectRepository={projectRepo} />);

      const focusSection = await screen.findByRole("region", { name: "現在のタスク" });
      expect(focusSection.tagName.toLowerCase()).toBe("section");
      expect(focusSection.classList.contains("task-card")).toBe(true);
      expect(focusSection.classList.contains("task-card--focus")).toBe(true);
      // タスク名 + 3 段ゾーンを含む.
      expect(within(focusSection).getByText("フォーカスタスク")).toBeDefined();
      expect(focusSection.querySelector(".task-card__header")).not.toBeNull();
      expect(focusSection.querySelector(".task-card__title")).not.toBeNull();
      expect(focusSection.querySelector(".task-card__actions")).not.toBeNull();
    });
  });

  // ============================================================
  // 補強: 新規ファイル存在 (P-001 / D-013)
  // ============================================================

  describe("補強: 新規ファイル群が web/src/ui/task-card/ 配下に存在する (P-001 / D-013)", () => {
    it("web/src/ui/task-card/task-card.tsx が存在する", () => {
      expect(existsSync(taskCardTsxPath)).toBe(true);
    });

    it("web/src/ui/task-card/task-form-card.tsx が存在する", () => {
      expect(existsSync(taskFormCardTsxPath)).toBe(true);
    });

    it("web/src/ui/task-card/task-card.css が存在する", () => {
      expect(existsSync(taskCardCssPath)).toBe(true);
    });

    it('task-card.tsx の先頭付近に `import "./task-card.css"` が含まれる (D-013)', () => {
      const tsx = existsSync(taskCardTsxPath) ? readFileSync(taskCardTsxPath, "utf-8") : "";
      expect(tsx).toMatch(/import\s+["']\.\/task-card\.css["']/);
    });

    it('task-form-card.tsx の先頭付近に `import "./task-card.css"` が含まれる (D-013)', () => {
      const tsx = existsSync(taskFormCardTsxPath) ? readFileSync(taskFormCardTsxPath, "utf-8") : "";
      expect(tsx).toMatch(/import\s+["']\.\/task-card\.css["']/);
    });
  });
});
