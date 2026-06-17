// @vitest-environment jsdom

/**
 * タスクカードの「プロジェクト変更」 UI 追加 (BL-108 / task-card-project-change) 受け入れ基準テスト.
 *
 * 仕様参照:
 *   docs/developer/features/task-card-project-change/spec.md
 *   docs/developer/features/task-card-project-change/plan.md
 *
 * 本ファイルが検証する受け入れ基準 (spec の Given/When/Then をそのまま it 名に転写):
 *
 *   UI 表示 (REQ-1 / REQ-2 / REQ-3 / REQ-4)
 *     AC-1 : プロジェクト付きタスクのカードに `<select>` control が描画される.
 *     AC-2 : プロジェクト未割当タスクのカードでも control が描画され「プロジェクトなし」が selected.
 *     AC-3 : タスクカードから旧 `.project-chip` `<span>` が消える.
 *
 *   変更ハンドラ (REQ-5 / REQ-6 / REQ-7)
 *     AC-4 : 項目 → 項目の変更で onChangeProject("p2") + taskRepository.update が呼ばれる.
 *     AC-5 : 「プロジェクトなし」選択で onChangeProject(null) + patch.projectId === null.
 *     AC-6 : 未設定 → 項目で onChangeProject("p1") + patch.projectId === "p1".
 *     AC-7 : 同値選択は taskRepository.update を呼ばない (短絡 / REQ-7).
 *
 *   親 view 適用 (REQ-6)
 *     AC-8 : 明日ビューでも変更可能で ["tomorrow"]/["today"]/["focus"] が invalidate される.
 *     AC-9 : focus ビューでも focusedTask のプロジェクト変更が可能.
 *
 *   競合 / オフライン (NFR-OPTIMISTIC-LOCK / NFR-OFFLINE)
 *     AC-10: 楽観的ロック競合 (412) で ConflictDialog が開く.
 *     AC-11: オフライン時はキュー保存 + 楽観成功 + notifyError 不発.
 *
 *   a11y (REQ-10)
 *     AC-12: control に「プロジェクト」 label が visually-hidden で関連付けされている.
 *     AC-13: control の id は `task-project-${task.id}` で衝突しない.
 *
 *   routine タスクの扱い (REQ-12)
 *     AC-14: routine 由来タスクでも control は描画され disabled でない.
 *
 *   ハンドラ受け取り API (REQ-9)
 *     AC-15: TaskCard が必須 prop `projects` / `onChangeProject` を受け取る (TaskCard 単体 DOM).
 *
 * 本ファイルは TDD の "red" を作るためのテスト.
 *   - 実装前 (= TaskCard 内 chip span が `<select>` に置換されていない, 親 view に
 *     handleChangeProject が無い, projects / onChangeProject prop が無い) では
 *     AC-1 〜 AC-15 のほとんどが red になる想定.
 *   - implementer が REQ-1 〜 REQ-12 を実装することで red 群が green 化する.
 *
 * 検証スタイル:
 *   - TaskCard 直 render: BL-059 / BL-063 / BL-064 と同形の動的 import + DOM レンダ.
 *   - 親 view 経由: BL-070 / BL-065 と同形の QueryClientProvider + MemoryRouter + Mock Repository.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Task } from "@todica/domain/task";
import type { ComponentType, ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import * as ErrorNotification from "../src/error-notification.js";
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
import { OptimisticLockError } from "../src/repositories/task-repository.js";
import { FocusView } from "../src/ui/focus-view/focus-view.js";
import { TodayView } from "../src/ui/today-view/today-view.js";
import { TomorrowView } from "../src/ui/tomorrow-view/tomorrow-view.js";

// ============================================================
// 共通定数
// ============================================================

const NOW = "2026-06-17T09:00:00.000Z";
const PROJECT_ID_P1 = "p1p1p1p1-p1p1-4p1p-8p1p-p1p1p1p1p1p1";
const PROJECT_NAME_P1 = "プロジェクトα";
const PROJECT_ID_P2 = "p2p2p2p2-p2p2-4p2p-8p2p-p2p2p2p2p2p2";
const PROJECT_NAME_P2 = "プロジェクトβ";

// ============================================================
// テストファクトリ
// ============================================================

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-a",
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

// ============================================================
// QueryClient / Router セットアップ
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

function renderWithProviders(
  ui: ReactNode,
  options: { client?: QueryClient; initialEntries?: string[] } = {},
): { queryClient: QueryClient } & ReturnType<typeof render> {
  const queryClient = options.client ?? createTestQueryClient();
  const entries = options.initialEntries ?? ["/today"];
  const result = render(
    <MemoryRouter
      initialEntries={entries}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
    </MemoryRouter>,
  );
  return { queryClient, ...result };
}

// ============================================================
// Mock リポジトリ
//   - projectRepository: BL-108 で重要なのは list() の固定戻り値.
//   - taskRepository: today() / list() / update() / getFocus() を備える.
//   - updateError オプションで update を意図的に失敗させ 412 / ConflictDialog 経路を担保する.
// ============================================================

function makeMockProjectRepository(initial: Project[] = []): ProjectRepository & {
  listMock: ReturnType<typeof vi.fn>;
} {
  const state = [...initial];
  const listMock = vi.fn(async (): Promise<Project[]> => [...state]);
  return {
    list: listMock,
    create: vi.fn(async () => {
      throw new Error("not used in BL-108 test");
    }),
    update: vi.fn(async () => {
      throw new Error("not used in BL-108 test");
    }),
    delete: vi.fn(async () => {
      /* not used */
    }),
    listMock,
  };
}

function makeMockTaskRepository(
  initial: Task[] = [],
  options: {
    initialFocus?: FocusSelection;
    initialCounter?: Counter;
    updateError?: Error;
  } = {},
): TaskRepository & {
  updateMock: ReturnType<typeof vi.fn>;
  todayMock: ReturnType<typeof vi.fn>;
  listMock: ReturnType<typeof vi.fn>;
  createMock: ReturnType<typeof vi.fn>;
  deleteMock: ReturnType<typeof vi.fn>;
  completeMock: ReturnType<typeof vi.fn>;
  getFocusMock: ReturnType<typeof vi.fn>;
  setFocusMock: ReturnType<typeof vi.fn>;
  getCounterMock: ReturnType<typeof vi.fn>;
} {
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
  const PRIORITY_ORDER: Record<string, number> = { highest: 0, normal: 1, later: 2 };
  const sortTasks = (tasks: Task[]): Task[] =>
    [...tasks].sort((a, b) => {
      const p = (PRIORITY_ORDER[a.priority] ?? 99) - (PRIORITY_ORDER[b.priority] ?? 99);
      if (p !== 0) return p;
      const c = a.createdAt.localeCompare(b.createdAt);
      if (c !== 0) return c;
      return a.id.localeCompare(b.id);
    });

  const listMock = vi.fn(async (filter?: { dueDate?: "today" | "tomorrow" }) => {
    const filtered = state.filter((t) => {
      if (t.trashedAt !== null) return false;
      if (filter?.dueDate && t.dueDate !== filter.dueDate) return false;
      return true;
    });
    return sortTasks(filtered);
  });
  const todayMock = vi.fn(async () => {
    const filtered = state.filter((t) => t.dueDate === "today" && t.trashedAt === null);
    const sorted = sortTasks(filtered);
    return {
      tasks: sorted,
      nextTaskId: sorted[0]?.id ?? null,
      currentTaskId: focusState.currentTaskId,
      completionCount: counterState.completedCount,
    };
  });
  const createMock = vi.fn(async (_cmd: CreateTaskCommand) => {
    throw new Error("not used in BL-108 test");
  });
  const updateMock = vi.fn(async (cmd: UpdateTaskCommand) => {
    if (options.updateError) throw options.updateError;
    const idx = state.findIndex((t) => t.id === cmd.id);
    if (idx < 0) throw new Error("not found");
    const next: Task = {
      ...state[idx]!,
      ...cmd.patch,
      version: (state[idx]?.version ?? 0) + 1,
    };
    state[idx] = next;
    return next;
  });
  const deleteMock = vi.fn(async (cmd: DeleteTaskCommand) => {
    const idx = state.findIndex((t) => t.id === cmd.id);
    if (idx >= 0) state.splice(idx, 1);
  });
  const completeMock = vi.fn(async (cmd: CompleteTaskCommand) => {
    const idx = state.findIndex((t) => t.id === cmd.id);
    if (idx < 0) throw new Error("not found");
    const prev = state[idx]!;
    const wasActive = prev.trashedAt === null;
    const next: Task = {
      ...prev,
      trashedAt: NOW,
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
  });
  const getFocusMock = vi.fn(async () => ({ ...focusState }));
  const setFocusMock = vi.fn(async (cmd: SetFocusCommand) => {
    focusState = {
      ...focusState,
      currentTaskId: cmd.taskId,
      version: focusState.version + 1,
      updatedAt: NOW,
    };
    return { ...focusState };
  });
  const getCounterMock = vi.fn(async () => ({ ...counterState }));

  return {
    list: listMock,
    today: todayMock,
    create: createMock,
    update: updateMock,
    delete: deleteMock,
    complete: completeMock,
    getFocus: getFocusMock,
    setFocus: setFocusMock,
    getCounter: getCounterMock,
    listMock,
    todayMock,
    createMock,
    updateMock,
    deleteMock,
    completeMock,
    getFocusMock,
    setFocusMock,
    getCounterMock,
  };
}

// ============================================================
// 動的 import ヘルパ (TaskCard / props 型は緩めて受ける)
// ============================================================

type TaskCardModule = { TaskCard: ComponentType<Record<string, unknown>> };

async function importTaskCard(): Promise<TaskCardModule> {
  const path = "../src/ui/task-card/task-card.js";
  return (await import(/* @vite-ignore */ path)) as TaskCardModule;
}

// ============================================================
// 共通: タスク A のカード <li> を取得するヘルパ
// ============================================================

async function findCardByName(name: string): Promise<HTMLElement> {
  const input = (await screen.findByDisplayValue(name)) as HTMLInputElement;
  const li = input.closest("li") ?? input.closest("section") ?? input.closest("div.task-card");
  if (!li) throw new Error(`「${name}」のタスクカードが見つからない`);
  return li as HTMLElement;
}

// ============================================================
// describe: BL-108 / task-card-project-change
// ============================================================

describe("タスクカードの「プロジェクト変更」 UI (BL-108 / task-card-project-change)", () => {
  // ============================================================
  // AC-1 / AC-2 / AC-3 — UI 表示 (REQ-1 / REQ-2 / REQ-3 / REQ-4)
  // ============================================================

  describe("AC-1: プロジェクト付きタスクのカードに <select> control が描画される (REQ-1 / REQ-2 / REQ-3 / REQ-4)", () => {
    /**
     * シナリオ AC-1:
     *   Given 今日ビュー (/today) を開いた
     *   And   タスク A (projectId = "p1", projects = [α, β]) が表示されている
     *   When  タスク A のカードを観察する
     *   Then  カード内に `<select>` 要素がちょうど 1 個存在し,
     *         value="p1", option 3 個 (先頭「プロジェクトなし」/α/β) である.
     */
    it("タスク A (projectId=p1) のカード内に <select> が 1 個 / value='p1' / option 3 個 (なし/α/β) で描画される", async () => {
      const projectAlpha = makeProject({ id: PROJECT_ID_P1, name: PROJECT_NAME_P1 });
      const projectBeta = makeProject({ id: PROJECT_ID_P2, name: PROJECT_NAME_P2 });
      const focusedTask = makeTask({
        id: "task-focus",
        name: "フォーカスタスク",
        projectId: null,
        dueDate: "today",
        priority: "highest",
        createdAt: "2026-06-17T08:00:00.000Z",
      });
      const taskA = makeTask({
        id: "task-a",
        name: "タスクA",
        projectId: PROJECT_ID_P1,
        dueDate: "today",
        priority: "normal",
        createdAt: "2026-06-17T08:00:01.000Z",
      });
      const repo = makeMockTaskRepository([focusedTask, taskA]);
      const projectRepo = makeMockProjectRepository([projectAlpha, projectBeta]);

      renderWithProviders(<TodayView repository={repo} projectRepository={projectRepo} />, {
        initialEntries: ["/today"],
      });

      const card = await findCardByName("タスクA");

      // card 内の <select> がちょうど 1 個.
      const selects = card.querySelectorAll("select");
      expect(
        selects.length,
        `タスク A のカード内に <select> が 1 個でない (実際: ${selects.length})`,
      ).toBe(1);
      const sel = selects[0] as HTMLSelectElement;
      expect(sel.value, "<select>.value が 'p1' でない").toBe(PROJECT_ID_P1);

      // option 列挙. projects fetch の解決を待つ.
      await waitFor(() => {
        expect(sel.querySelectorAll("option")).toHaveLength(3);
      });
      const options = Array.from(sel.querySelectorAll("option"));
      expect(options[0]?.value, "先頭 option の value が '' でない").toBe("");
      expect(
        options[0]?.textContent ?? "",
        "先頭 option textContent が「プロジェクトなし」でない",
      ).toContain("プロジェクトなし");
      expect(options[1]?.value).toBe(PROJECT_ID_P1);
      expect(options[1]?.textContent ?? "").toContain(PROJECT_NAME_P1);
      expect(options[2]?.value).toBe(PROJECT_ID_P2);
      expect(options[2]?.textContent ?? "").toContain(PROJECT_NAME_P2);
    });
  });

  describe("AC-2: プロジェクト未割当タスクのカードでも control が描画され「プロジェクトなし」が selected (REQ-1 / REQ-4)", () => {
    /**
     * シナリオ AC-2:
     *   Given 今日ビュー (/today) を開いた
     *   And   タスク B (projectId = null) が表示されている
     *   When  タスク B のカードを観察する
     *   Then  カード内に `<select>` がちょうど 1 個存在し, value="" / 先頭 option selected.
     */
    it("タスク B (projectId=null) のカード内にも <select> が 1 個 / value='' / 先頭 option selected", async () => {
      const projectAlpha = makeProject({ id: PROJECT_ID_P1, name: PROJECT_NAME_P1 });
      const focusedTask = makeTask({
        id: "task-focus",
        name: "フォーカスタスク",
        projectId: null,
        dueDate: "today",
        priority: "highest",
        createdAt: "2026-06-17T08:00:00.000Z",
      });
      const taskB = makeTask({
        id: "task-b",
        name: "タスクB",
        projectId: null,
        dueDate: "today",
        priority: "normal",
        createdAt: "2026-06-17T08:00:01.000Z",
      });
      const repo = makeMockTaskRepository([focusedTask, taskB]);
      const projectRepo = makeMockProjectRepository([projectAlpha]);

      renderWithProviders(<TodayView repository={repo} projectRepository={projectRepo} />, {
        initialEntries: ["/today"],
      });

      const card = await findCardByName("タスクB");

      const selects = card.querySelectorAll("select");
      expect(selects.length, "タスク B のカード内に <select> が 1 個でない").toBe(1);
      const sel = selects[0] as HTMLSelectElement;
      expect(sel.value, "未割当タスクの <select>.value が '' でない").toBe("");

      // 先頭 option (= 「プロジェクトなし」) が selected.
      await waitFor(() => {
        expect(sel.querySelectorAll("option").length).toBeGreaterThanOrEqual(1);
      });
      const options = Array.from(sel.querySelectorAll("option")) as HTMLOptionElement[];
      expect(options[0]?.selected, "未割当タスクで先頭 option が selected でない").toBe(true);
    });
  });

  describe("AC-3: タスクカードから旧 .project-chip <span> が消える (REQ-1)", () => {
    /**
     * シナリオ AC-3:
     *   Given 今日ビュー (/today) を開いた
     *   And   タスク A (projectId = "p1") が表示されている
     *   When  タスク A のカード内を観察する
     *   Then  `.project-chip` className を持つ `<span>` 要素は存在しない.
     */
    it("プロジェクト付きタスク A のカード内に .project-chip span が存在しない", async () => {
      const projectAlpha = makeProject({ id: PROJECT_ID_P1, name: PROJECT_NAME_P1 });
      const focusedTask = makeTask({
        id: "task-focus",
        name: "フォーカスタスク",
        projectId: null,
        dueDate: "today",
        priority: "highest",
        createdAt: "2026-06-17T08:00:00.000Z",
      });
      const taskA = makeTask({
        id: "task-a",
        name: "タスクA",
        projectId: PROJECT_ID_P1,
        dueDate: "today",
        priority: "normal",
        createdAt: "2026-06-17T08:00:01.000Z",
      });
      const repo = makeMockTaskRepository([focusedTask, taskA]);
      const projectRepo = makeMockProjectRepository([projectAlpha]);

      renderWithProviders(<TodayView repository={repo} projectRepository={projectRepo} />, {
        initialEntries: ["/today"],
      });

      const card = await findCardByName("タスクA");

      // .project-chip span は存在しない (BL-108 で <select> に置換).
      expect(
        card.querySelector("span.project-chip"),
        "BL-108 後はタスクカードから .project-chip span が消えるはず",
      ).toBeNull();
      expect(card.querySelector(".project-chip")).toBeNull();
    });
  });

  // ============================================================
  // AC-4 / AC-5 / AC-6 / AC-7 — 変更ハンドラ (REQ-5 / REQ-6 / REQ-7)
  // ============================================================

  describe("AC-4: 項目 → 項目で taskRepository.update が { patch: { projectId: 'p2' } } で呼ばれる (REQ-5 / REQ-6)", () => {
    /**
     * シナリオ AC-4:
     *   Given タスク A (projectId="p1", version=1) が今日ビューに表示されている
     *   When  ユーザーがカード内 `<select>` で「プロジェクトβ」 (value="p2") を選択する
     *   Then  taskRepository.update が呼ばれ, 引数は
     *         { id: "task-a", ifMatch: 1, patch: { projectId: "p2" } } と等価.
     */
    it("`<select>` で β (p2) を選ぶと taskRepository.update が { id, ifMatch:1, patch:{ projectId:'p2' } } で呼ばれる", async () => {
      const projectAlpha = makeProject({ id: PROJECT_ID_P1, name: PROJECT_NAME_P1 });
      const projectBeta = makeProject({ id: PROJECT_ID_P2, name: PROJECT_NAME_P2 });
      const focusedTask = makeTask({
        id: "task-focus",
        name: "フォーカスタスク",
        projectId: null,
        dueDate: "today",
        priority: "highest",
        createdAt: "2026-06-17T08:00:00.000Z",
      });
      const taskA = makeTask({
        id: "task-a",
        name: "タスクA",
        projectId: PROJECT_ID_P1,
        dueDate: "today",
        priority: "normal",
        version: 1,
        createdAt: "2026-06-17T08:00:01.000Z",
      });
      const repo = makeMockTaskRepository([focusedTask, taskA]);
      const projectRepo = makeMockProjectRepository([projectAlpha, projectBeta]);

      const user = userEvent.setup();
      renderWithProviders(<TodayView repository={repo} projectRepository={projectRepo} />, {
        initialEntries: ["/today"],
      });

      const card = await findCardByName("タスクA");
      const sel = card.querySelector("select") as HTMLSelectElement;
      expect(sel, "タスク A のカード内 <select> が見つからない").not.toBeNull();
      await waitFor(() => {
        expect(sel.querySelectorAll("option")).toHaveLength(3);
      });

      await user.selectOptions(sel, PROJECT_ID_P2);

      await waitFor(() => {
        expect(repo.updateMock).toHaveBeenCalledTimes(1);
      });
      const arg = repo.updateMock.mock.calls[0]?.[0] as UpdateTaskCommand;
      expect(arg.id).toBe("task-a");
      expect(arg.ifMatch).toBe(1);
      expect(arg.patch.projectId).toBe(PROJECT_ID_P2);
    });
  });

  describe("AC-5: 「プロジェクトなし」選択で patch.projectId === null が PATCH 送出される (REQ-5)", () => {
    /**
     * シナリオ AC-5:
     *   Given タスク A (projectId="p1", version=1) が今日ビューに表示されている
     *   When  ユーザーがカード内 `<select>` で「プロジェクトなし」 (value="") を選択する
     *   Then  taskRepository.update が呼ばれ, 引数は
     *         { id: "task-a", ifMatch: 1, patch: { projectId: null } } と等価 (= 空文字ではなく明示 null).
     */
    it('`<select>` で「プロジェクトなし」 (value="") を選ぶと patch.projectId が null (空文字でない)', async () => {
      const projectAlpha = makeProject({ id: PROJECT_ID_P1, name: PROJECT_NAME_P1 });
      const projectBeta = makeProject({ id: PROJECT_ID_P2, name: PROJECT_NAME_P2 });
      const focusedTask = makeTask({
        id: "task-focus",
        name: "フォーカスタスク",
        projectId: null,
        dueDate: "today",
        priority: "highest",
        createdAt: "2026-06-17T08:00:00.000Z",
      });
      const taskA = makeTask({
        id: "task-a",
        name: "タスクA",
        projectId: PROJECT_ID_P1,
        dueDate: "today",
        priority: "normal",
        version: 1,
        createdAt: "2026-06-17T08:00:01.000Z",
      });
      const repo = makeMockTaskRepository([focusedTask, taskA]);
      const projectRepo = makeMockProjectRepository([projectAlpha, projectBeta]);

      const user = userEvent.setup();
      renderWithProviders(<TodayView repository={repo} projectRepository={projectRepo} />, {
        initialEntries: ["/today"],
      });

      const card = await findCardByName("タスクA");
      const sel = card.querySelector("select") as HTMLSelectElement;
      await waitFor(() => {
        expect(sel.querySelectorAll("option")).toHaveLength(3);
      });

      // value="" の option を選ぶ.
      await user.selectOptions(sel, "");

      await waitFor(() => {
        expect(repo.updateMock).toHaveBeenCalledTimes(1);
      });
      const arg = repo.updateMock.mock.calls[0]?.[0] as UpdateTaskCommand;
      expect(arg.id).toBe("task-a");
      expect(arg.ifMatch).toBe(1);
      // 空文字ではなく明示的に null (REQ-5 / D-003).
      expect(
        arg.patch.projectId,
        `patch.projectId が null でない (実際: ${JSON.stringify(arg.patch.projectId)})`,
      ).toBeNull();
    });
  });

  describe("AC-6: 未設定タスクへのプロジェクト割当で patch.projectId が文字列で送出される (REQ-5)", () => {
    /**
     * シナリオ AC-6:
     *   Given タスク B (projectId=null, version=1) が今日ビューに表示されている
     *   When  ユーザーがカード内 `<select>` で「プロジェクトα」 (value="p1") を選択する
     *   Then  taskRepository.update が呼ばれ, 引数は
     *         { id: "task-b", ifMatch: 1, patch: { projectId: "p1" } } と等価.
     */
    it("未設定タスクで α (p1) を選ぶと patch.projectId='p1' が送出される", async () => {
      const projectAlpha = makeProject({ id: PROJECT_ID_P1, name: PROJECT_NAME_P1 });
      const focusedTask = makeTask({
        id: "task-focus",
        name: "フォーカスタスク",
        projectId: null,
        dueDate: "today",
        priority: "highest",
        createdAt: "2026-06-17T08:00:00.000Z",
      });
      const taskB = makeTask({
        id: "task-b",
        name: "タスクB",
        projectId: null,
        dueDate: "today",
        priority: "normal",
        version: 1,
        createdAt: "2026-06-17T08:00:01.000Z",
      });
      const repo = makeMockTaskRepository([focusedTask, taskB]);
      const projectRepo = makeMockProjectRepository([projectAlpha]);

      const user = userEvent.setup();
      renderWithProviders(<TodayView repository={repo} projectRepository={projectRepo} />, {
        initialEntries: ["/today"],
      });

      const card = await findCardByName("タスクB");
      const sel = card.querySelector("select") as HTMLSelectElement;
      await waitFor(() => {
        // 先頭「プロジェクトなし」 + α = 2 件.
        expect(sel.querySelectorAll("option")).toHaveLength(2);
      });

      await user.selectOptions(sel, PROJECT_ID_P1);

      await waitFor(() => {
        expect(repo.updateMock).toHaveBeenCalledTimes(1);
      });
      const arg = repo.updateMock.mock.calls[0]?.[0] as UpdateTaskCommand;
      expect(arg.id).toBe("task-b");
      expect(arg.ifMatch).toBe(1);
      expect(arg.patch.projectId).toBe(PROJECT_ID_P1);
    });
  });

  describe("AC-7: 同値選択は taskRepository.update を呼ばない (短絡 / REQ-7)", () => {
    /**
     * シナリオ AC-7:
     *   Given タスク A (projectId="p1", version=1) が今日ビューに表示されている
     *   When  ユーザーがカード内 `<select>` で同じ「プロジェクトα」 (value="p1") を選択する
     *         (= onChange が現状値で発火する経路)
     *   Then  taskRepository.update は呼ばれない.
     */
    it("同値の <select> 選択では taskRepository.update が呼ばれない", async () => {
      const projectAlpha = makeProject({ id: PROJECT_ID_P1, name: PROJECT_NAME_P1 });
      const projectBeta = makeProject({ id: PROJECT_ID_P2, name: PROJECT_NAME_P2 });
      const focusedTask = makeTask({
        id: "task-focus",
        name: "フォーカスタスク",
        projectId: null,
        dueDate: "today",
        priority: "highest",
        createdAt: "2026-06-17T08:00:00.000Z",
      });
      const taskA = makeTask({
        id: "task-a",
        name: "タスクA",
        projectId: PROJECT_ID_P1,
        dueDate: "today",
        priority: "normal",
        version: 1,
        createdAt: "2026-06-17T08:00:01.000Z",
      });
      const repo = makeMockTaskRepository([focusedTask, taskA]);
      const projectRepo = makeMockProjectRepository([projectAlpha, projectBeta]);

      const user = userEvent.setup();
      renderWithProviders(<TodayView repository={repo} projectRepository={projectRepo} />, {
        initialEntries: ["/today"],
      });

      const card = await findCardByName("タスクA");
      const sel = card.querySelector("select") as HTMLSelectElement;
      await waitFor(() => {
        expect(sel.querySelectorAll("option")).toHaveLength(3);
      });

      // 同値 (現在 selected = p1) を再選択.
      // userEvent.selectOptions は同値でも change event を発火させる (= 親側で短絡判定が必要).
      await user.selectOptions(sel, PROJECT_ID_P1);

      // 短絡判定が効いていれば update は呼ばれない.
      // 念のためマイクロタスクを進めてから assert.
      await Promise.resolve();
      expect(
        repo.updateMock,
        "同値選択でも taskRepository.update が呼ばれている (親側短絡 D-005 違反)",
      ).not.toHaveBeenCalled();
    });
  });

  // ============================================================
  // AC-8 / AC-9 — 親 view 適用 (REQ-6)
  // ============================================================

  describe("AC-8: 明日ビューでもプロジェクト変更が可能で関連 query が invalidate される (REQ-6)", () => {
    /**
     * シナリオ AC-8:
     *   Given 明日ビュー (/tomorrow) を開いた
     *   And   タスク C (projectId="p1", dueDate="tomorrow", version=1) が表示されている
     *   When  ユーザーがカード内 `<select>` で β (value="p2") を選択する
     *   Then  taskRepository.update が { id:"task-c", ifMatch:1, patch:{ projectId:"p2" } } で呼ばれ
     *    かつ 成功後 ["tomorrow"]/["today"]/["focus"] が invalidate される.
     */
    it("/tomorrow のタスク C で β を選ぶと PATCH 発行 + ['tomorrow']/['today']/['focus'] が invalidate される", async () => {
      const projectAlpha = makeProject({ id: PROJECT_ID_P1, name: PROJECT_NAME_P1 });
      const projectBeta = makeProject({ id: PROJECT_ID_P2, name: PROJECT_NAME_P2 });
      const taskC = makeTask({
        id: "task-c",
        name: "明日タスクC",
        projectId: PROJECT_ID_P1,
        dueDate: "tomorrow",
        priority: "normal",
        version: 1,
      });
      const repo = makeMockTaskRepository([taskC]);
      const projectRepo = makeMockProjectRepository([projectAlpha, projectBeta]);

      const queryClient = createTestQueryClient();
      const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

      const user = userEvent.setup();
      renderWithProviders(<TomorrowView repository={repo} projectRepository={projectRepo} />, {
        client: queryClient,
        initialEntries: ["/tomorrow"],
      });

      const card = await findCardByName("明日タスクC");
      const sel = card.querySelector("select") as HTMLSelectElement;
      expect(sel, "明日タスク C のカード内 <select> が見つからない").not.toBeNull();
      await waitFor(() => {
        expect(sel.querySelectorAll("option")).toHaveLength(3);
      });

      await user.selectOptions(sel, PROJECT_ID_P2);

      await waitFor(() => {
        expect(repo.updateMock).toHaveBeenCalledTimes(1);
      });
      const arg = repo.updateMock.mock.calls[0]?.[0] as UpdateTaskCommand;
      expect(arg.id).toBe("task-c");
      expect(arg.ifMatch).toBe(1);
      expect(arg.patch.projectId).toBe(PROJECT_ID_P2);

      // invalidate 先: tomorrow / today / focus.
      const invalidatedKeys = invalidateSpy.mock.calls.map(
        (c) => (c[0] as { queryKey?: unknown[] } | undefined)?.queryKey,
      );
      const flatKeys = invalidatedKeys.flat().filter((k): k is string => typeof k === "string");
      expect(flatKeys, "['tomorrow'] が invalidate されていない").toContain("tomorrow");
      expect(flatKeys, "['today'] が invalidate されていない").toContain("today");
      expect(flatKeys, "['focus'] が invalidate されていない").toContain("focus");
    });
  });

  describe("AC-9: focus ビューでも focusedTask のプロジェクト変更が可能 (REQ-6)", () => {
    /**
     * シナリオ AC-9:
     *   Given /focus を開き, focusedTask = タスク A (projectId="p1", version=1) が表示されている
     *   When  ユーザーがカード内 `<select>` で β (value="p2") を選択する
     *   Then  taskRepository.update が { id:"task-a", ifMatch:1, patch:{ projectId:"p2" } } で呼ばれる
     *    かつ 成功後 ["today"]/["focus"] が invalidate される.
     */
    it("/focus の focusedTask で β を選ぶと PATCH 発行 + ['today']/['focus'] が invalidate される", async () => {
      const projectAlpha = makeProject({ id: PROJECT_ID_P1, name: PROJECT_NAME_P1 });
      const projectBeta = makeProject({ id: PROJECT_ID_P2, name: PROJECT_NAME_P2 });
      const taskA = makeTask({
        id: "task-a",
        name: "フォーカスタスクA",
        projectId: PROJECT_ID_P1,
        dueDate: "today",
        priority: "normal",
        version: 1,
      });
      const repo = makeMockTaskRepository([taskA], {
        initialFocus: {
          id: "singleton",
          currentTaskId: "task-a",
          version: 1,
          updatedAt: NOW,
        },
      });
      const projectRepo = makeMockProjectRepository([projectAlpha, projectBeta]);

      const queryClient = createTestQueryClient();
      const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

      const user = userEvent.setup();
      renderWithProviders(<FocusView repository={repo} projectRepository={projectRepo} />, {
        client: queryClient,
        initialEntries: ["/focus"],
      });

      const card = await findCardByName("フォーカスタスクA");
      const sel = card.querySelector("select") as HTMLSelectElement;
      expect(sel, "focus-view の focusedTask カード内 <select> が見つからない").not.toBeNull();
      await waitFor(() => {
        expect(sel.querySelectorAll("option")).toHaveLength(3);
      });

      await user.selectOptions(sel, PROJECT_ID_P2);

      await waitFor(() => {
        expect(repo.updateMock).toHaveBeenCalledTimes(1);
      });
      const arg = repo.updateMock.mock.calls[0]?.[0] as UpdateTaskCommand;
      expect(arg.id).toBe("task-a");
      expect(arg.ifMatch).toBe(1);
      expect(arg.patch.projectId).toBe(PROJECT_ID_P2);

      // invalidate 先: today / focus.
      const invalidatedKeys = invalidateSpy.mock.calls.map(
        (c) => (c[0] as { queryKey?: unknown[] } | undefined)?.queryKey,
      );
      const flatKeys = invalidatedKeys.flat().filter((k): k is string => typeof k === "string");
      expect(flatKeys, "['today'] が invalidate されていない").toContain("today");
      expect(flatKeys, "['focus'] が invalidate されていない").toContain("focus");
    });
  });

  // ============================================================
  // AC-10 / AC-11 — 競合 / オフライン (NFR-OPTIMISTIC-LOCK / NFR-OFFLINE)
  // ============================================================

  describe("AC-10: 楽観的ロック競合 (412) で ConflictDialog が開く (NFR-OPTIMISTIC-LOCK)", () => {
    /**
     * シナリオ AC-10:
     *   Given タスク A (projectId="p1", version=1) が今日ビューに表示されている
     *   And   サーバ側 version は既に 2 に進んでいる (他クライアントで更新済み)
     *   When  ユーザーがカード内 `<select>` で β を選択する
     *   Then  PATCH が 412 → OptimisticLockError → ConflictError 変換 → ConflictDialog open.
     */
    it("update が OptimisticLockError を throw すると ConflictDialog が開く", async () => {
      const projectAlpha = makeProject({ id: PROJECT_ID_P1, name: PROJECT_NAME_P1 });
      const projectBeta = makeProject({ id: PROJECT_ID_P2, name: PROJECT_NAME_P2 });
      const focusedTask = makeTask({
        id: "task-focus",
        name: "フォーカスタスク",
        projectId: null,
        dueDate: "today",
        priority: "highest",
        createdAt: "2026-06-17T08:00:00.000Z",
      });
      const taskA = makeTask({
        id: "task-a",
        name: "タスクA",
        projectId: PROJECT_ID_P1,
        dueDate: "today",
        priority: "normal",
        version: 1,
        createdAt: "2026-06-17T08:00:01.000Z",
      });
      const conflictTask: Task = { ...taskA, projectId: PROJECT_ID_P2, version: 2 };
      const repo = makeMockTaskRepository([focusedTask, taskA], {
        updateError: new OptimisticLockError("412 conflict", conflictTask),
      });
      const projectRepo = makeMockProjectRepository([projectAlpha, projectBeta]);

      const user = userEvent.setup();
      renderWithProviders(<TodayView repository={repo} projectRepository={projectRepo} />, {
        initialEntries: ["/today"],
      });

      const card = await findCardByName("タスクA");
      const sel = card.querySelector("select") as HTMLSelectElement;
      await waitFor(() => {
        expect(sel.querySelectorAll("option")).toHaveLength(3);
      });

      await user.selectOptions(sel, PROJECT_ID_P2);

      // ConflictDialog (role="dialog" / 「サーバの値を採用」「クライアントの値で再送」 button を含む) が開く.
      const dialog = await screen.findByRole("dialog");
      expect(
        within(dialog).getByRole("button", { name: /サーバの値を採用/ }),
        "ConflictDialog 内に「サーバの値を採用」 button が無い",
      ).toBeInTheDocument();
      expect(
        within(dialog).getByRole("button", { name: /クライアントの値で再送/ }),
        "ConflictDialog 内に「クライアントの値で再送」 button が無い",
      ).toBeInTheDocument();
    });
  });

  describe("AC-11: オフライン時はキュー保存 + 楽観成功 + notifyError 不発 (NFR-OFFLINE)", () => {
    /**
     * シナリオ AC-11:
     *   Given navigator.onLine = false である
     *   And   タスク A (projectId="p1", version=1) が今日ビューに表示されている
     *   When  ユーザーがカード内 `<select>` で β を選択する
     *   Then  taskRepository.update は呼ばれない (= online 経路に行かない)
     *    かつ notifyError は呼ばれない.
     *   補足: offline-queue への enqueue は IDB が無いテスト環境では失敗するため,
     *         本シナリオでは「online API が呼ばれず, ユーザに失敗通知が出ない」ことを
     *         主たる observable として検証する.
     */
    it("navigator.onLine=false のとき update が呼ばれず notifyError も呼ばれない", async () => {
      const projectAlpha = makeProject({ id: PROJECT_ID_P1, name: PROJECT_NAME_P1 });
      const projectBeta = makeProject({ id: PROJECT_ID_P2, name: PROJECT_NAME_P2 });
      const focusedTask = makeTask({
        id: "task-focus",
        name: "フォーカスタスク",
        projectId: null,
        dueDate: "today",
        priority: "highest",
        createdAt: "2026-06-17T08:00:00.000Z",
      });
      const taskA = makeTask({
        id: "task-a",
        name: "タスクA",
        projectId: PROJECT_ID_P1,
        dueDate: "today",
        priority: "normal",
        version: 1,
        createdAt: "2026-06-17T08:00:01.000Z",
      });
      const repo = makeMockTaskRepository([focusedTask, taskA]);
      const projectRepo = makeMockProjectRepository([projectAlpha, projectBeta]);

      const notifyErrorSpy = vi.spyOn(ErrorNotification, "notifyError");
      const onLineSpy = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);

      try {
        const user = userEvent.setup();
        renderWithProviders(<TodayView repository={repo} projectRepository={projectRepo} />, {
          initialEntries: ["/today"],
        });

        const card = await findCardByName("タスクA");
        const sel = card.querySelector("select") as HTMLSelectElement;
        await waitFor(() => {
          expect(sel.querySelectorAll("option")).toHaveLength(3);
        });

        await user.selectOptions(sel, PROJECT_ID_P2);

        // online 経路 (= repository.update) には到達しない.
        // mutate の中で navigator.onLine === false 分岐に入って return undefined.
        await new Promise((r) => setTimeout(r, 0));
        expect(
          repo.updateMock,
          "オフライン時にも repository.update が呼ばれている (online 経路 / NFR-OFFLINE 違反)",
        ).not.toHaveBeenCalled();

        // notifyError は呼ばれない (= ユーザに「通信失敗」通知が出ない).
        expect(
          notifyErrorSpy,
          "オフライン時に notifyError が呼ばれている (NFR-OFFLINE 違反)",
        ).not.toHaveBeenCalled();
      } finally {
        onLineSpy.mockRestore();
        notifyErrorSpy.mockRestore();
      }
    });
  });

  // ============================================================
  // AC-12 / AC-13 — a11y (REQ-10)
  // ============================================================

  describe("AC-12: control に「プロジェクト」 label が visually-hidden で関連付けされている (REQ-10)", () => {
    /**
     * シナリオ AC-12:
     *   Given 今日ビューにタスク A のカードが表示されている
     *   When  カード内 `<select>` を観察する
     *   Then  対応する `<label>` 要素が存在し, htmlFor が `<select>` の id と一致する
     *    かつ `<label>` の textContent は「プロジェクト」を含む
     *    かつ `<label>` は `.visually-hidden` class で視覚的に隠されている.
     */
    it("`<select>` の id と一致する htmlFor を持つ <label class='visually-hidden'>プロジェクト</label> が同一カード内に存在する", async () => {
      const projectAlpha = makeProject({ id: PROJECT_ID_P1, name: PROJECT_NAME_P1 });
      const focusedTask = makeTask({
        id: "task-focus",
        name: "フォーカスタスク",
        projectId: null,
        dueDate: "today",
        priority: "highest",
        createdAt: "2026-06-17T08:00:00.000Z",
      });
      const taskA = makeTask({
        id: "task-a",
        name: "タスクA",
        projectId: PROJECT_ID_P1,
        dueDate: "today",
        priority: "normal",
        createdAt: "2026-06-17T08:00:01.000Z",
      });
      const repo = makeMockTaskRepository([focusedTask, taskA]);
      const projectRepo = makeMockProjectRepository([projectAlpha]);

      renderWithProviders(<TodayView repository={repo} projectRepository={projectRepo} />, {
        initialEntries: ["/today"],
      });

      const card = await findCardByName("タスクA");
      const sel = card.querySelector("select") as HTMLSelectElement;
      expect(sel, "<select> が見つからない").not.toBeNull();
      expect(sel.id, "<select> に id が無い").toBeTruthy();

      const label = card.querySelector(`label[for="${sel.id}"]`) as HTMLLabelElement | null;
      expect(
        label,
        `<label for='${sel.id}'> がカード内に見つからない (REQ-10 違反)`,
      ).not.toBeNull();
      expect(
        label?.textContent ?? "",
        "<label> textContent に「プロジェクト」が含まれない",
      ).toContain("プロジェクト");
      expect(
        label?.classList.contains("visually-hidden"),
        "<label> に .visually-hidden class が付与されていない (REQ-10 / D-008 違反)",
      ).toBe(true);
    });
  });

  describe("AC-13: control の id は task id を含み他タスクと衝突しない (REQ-10 / D-009)", () => {
    /**
     * シナリオ AC-13:
     *   Given 今日ビューにタスク A (id="task-a") とタスク B (id="task-b") が表示されている
     *   When  両カードの `<select>` の id を観察する
     *   Then  それぞれ "task-project-task-a" / "task-project-task-b" のように task id を含み, 互いに異なる.
     */
    it("2 タスクの <select> id がそれぞれ task-project-<task.id> で衝突しない", async () => {
      const projectAlpha = makeProject({ id: PROJECT_ID_P1, name: PROJECT_NAME_P1 });
      const focusedTask = makeTask({
        id: "task-focus",
        name: "フォーカスタスク",
        projectId: null,
        dueDate: "today",
        priority: "highest",
        createdAt: "2026-06-17T08:00:00.000Z",
      });
      const taskA = makeTask({
        id: "task-a",
        name: "タスクA",
        projectId: PROJECT_ID_P1,
        dueDate: "today",
        priority: "normal",
        createdAt: "2026-06-17T08:00:01.000Z",
      });
      const taskB = makeTask({
        id: "task-b",
        name: "タスクB",
        projectId: null,
        dueDate: "today",
        priority: "normal",
        createdAt: "2026-06-17T08:00:02.000Z",
      });
      const repo = makeMockTaskRepository([focusedTask, taskA, taskB]);
      const projectRepo = makeMockProjectRepository([projectAlpha]);

      renderWithProviders(<TodayView repository={repo} projectRepository={projectRepo} />, {
        initialEntries: ["/today"],
      });

      const cardA = await findCardByName("タスクA");
      const cardB = await findCardByName("タスクB");
      const selA = cardA.querySelector("select") as HTMLSelectElement;
      const selB = cardB.querySelector("select") as HTMLSelectElement;
      expect(selA, "タスク A の <select> が見つからない").not.toBeNull();
      expect(selB, "タスク B の <select> が見つからない").not.toBeNull();

      expect(selA.id, `タスク A の <select> id は "task-project-task-a" であるべき`).toBe(
        "task-project-task-a",
      );
      expect(selB.id, `タスク B の <select> id は "task-project-task-b" であるべき`).toBe(
        "task-project-task-b",
      );
      expect(selA.id).not.toBe(selB.id);
    });
  });

  // ============================================================
  // AC-14 — routine 由来タスクの扱い (REQ-12)
  // ============================================================

  describe("AC-14: routine 由来タスクでもプロジェクト変更 control は表示され disabled でない (REQ-12 / D-010)", () => {
    /**
     * シナリオ AC-14:
     *   Given タスク D (origin="routine", projectId="p1") が今日ビューに表示されている
     *   When  タスク D のカード内を観察する
     *   Then  `<select>` 要素が存在し, value="p1" が selected
     *    かつ `<select>` は disabled ではない.
     */
    it("origin=routine のタスク D のカードに <select> が存在し disabled でない", async () => {
      const projectAlpha = makeProject({ id: PROJECT_ID_P1, name: PROJECT_NAME_P1 });
      const focusedTask = makeTask({
        id: "task-focus",
        name: "フォーカスタスク",
        projectId: null,
        dueDate: "today",
        priority: "highest",
        createdAt: "2026-06-17T08:00:00.000Z",
      });
      const taskD = makeTask({
        id: "task-d",
        name: "ルーティンタスクD",
        projectId: PROJECT_ID_P1,
        dueDate: "today",
        priority: "normal",
        origin: "routine",
        routineId: "routine-1",
        createdAt: "2026-06-17T08:00:01.000Z",
      });
      const repo = makeMockTaskRepository([focusedTask, taskD]);
      const projectRepo = makeMockProjectRepository([projectAlpha]);

      renderWithProviders(<TodayView repository={repo} projectRepository={projectRepo} />, {
        initialEntries: ["/today"],
      });

      const card = await findCardByName("ルーティンタスクD");
      const sel = card.querySelector("select") as HTMLSelectElement;
      expect(sel, "ルーティンタスク D のカード内 <select> が見つからない").not.toBeNull();
      expect(
        sel.disabled,
        "ルーティンタスクの <select> が disabled になっている (D-010 違反)",
      ).toBe(false);
      expect(sel.value, "ルーティンタスク D の <select>.value が 'p1' でない").toBe(PROJECT_ID_P1);
    });
  });

  // ============================================================
  // AC-15 — TaskCard 単体 / props API 拡張 (REQ-9)
  // ============================================================

  describe("AC-15: TaskCard が必須 prop `projects` / `onChangeProject` を受け取り <select> を描画する (REQ-9)", () => {
    /**
     * シナリオ AC-15 (TaskCard 直 render):
     *   Given <TaskCard projects=[α, β] onChangeProject=spy task={projectId:"p1"} ... /> を render
     *   When  カード内 `<select>` で β を選択する
     *   Then  onChangeProject が "p2" (= string) で呼ばれる
     *    かつ <select> で「プロジェクトなし」 (value="") を選ぶと onChangeProject が null で呼ばれる (= ""→null 変換).
     */
    it("TaskCard を直 render し <select> で β を選ぶと onChangeProject('p2') が呼ばれる", async () => {
      const { TaskCard } = await importTaskCard();
      const projectAlpha = makeProject({ id: PROJECT_ID_P1, name: PROJECT_NAME_P1 });
      const projectBeta = makeProject({ id: PROJECT_ID_P2, name: PROJECT_NAME_P2 });
      const onChangeProject = vi.fn();
      const { container } = render(
        <TaskCard
          task={makeTask({ id: "task-a", projectId: PROJECT_ID_P1 })}
          project={projectAlpha}
          projects={[projectAlpha, projectBeta]}
          onChangeProject={onChangeProject}
          showPriority={false}
          showSetFocus={false}
          actionSet="full"
          dueDateMode="today"
          onNameBlur={() => {}}
          onDelete={() => {}}
          onToggleDueDate={() => {}}
          onComplete={() => {}}
        />,
      );

      const sel = container.querySelector("select") as HTMLSelectElement;
      expect(sel, "TaskCard 内に <select> が見つからない").not.toBeNull();
      expect(sel.value, "<select>.value が 'p1' でない").toBe(PROJECT_ID_P1);
      expect(sel.querySelectorAll("option")).toHaveLength(3);

      const user = userEvent.setup();
      await user.selectOptions(sel, PROJECT_ID_P2);

      expect(onChangeProject).toHaveBeenCalledTimes(1);
      expect(onChangeProject).toHaveBeenCalledWith(PROJECT_ID_P2);
    });

    it("TaskCard を直 render し <select> で「プロジェクトなし」を選ぶと onChangeProject(null) が呼ばれる (= '' → null 変換)", async () => {
      const { TaskCard } = await importTaskCard();
      const projectAlpha = makeProject({ id: PROJECT_ID_P1, name: PROJECT_NAME_P1 });
      const projectBeta = makeProject({ id: PROJECT_ID_P2, name: PROJECT_NAME_P2 });
      const onChangeProject = vi.fn();
      const { container } = render(
        <TaskCard
          task={makeTask({ id: "task-a", projectId: PROJECT_ID_P1 })}
          project={projectAlpha}
          projects={[projectAlpha, projectBeta]}
          onChangeProject={onChangeProject}
          showPriority={false}
          showSetFocus={false}
          actionSet="full"
          dueDateMode="today"
          onNameBlur={() => {}}
          onDelete={() => {}}
          onToggleDueDate={() => {}}
          onComplete={() => {}}
        />,
      );

      const sel = container.querySelector("select") as HTMLSelectElement;
      expect(sel, "TaskCard 内に <select> が見つからない").not.toBeNull();

      const user = userEvent.setup();
      await user.selectOptions(sel, "");

      expect(onChangeProject).toHaveBeenCalledTimes(1);
      // D-003: <select> の "" は null に変換して親に渡す.
      expect(onChangeProject).toHaveBeenCalledWith(null);
    });
  });
});
