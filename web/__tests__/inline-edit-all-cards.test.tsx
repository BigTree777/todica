// @vitest-environment jsdom

/**
 * 全カード (Task / Project / Routine) のインライン常時編集化
 * (BL-070 / inline-edit-all-cards) 受け入れ基準テスト.
 *
 * 仕様参照:
 *   docs/developer/features/inline-edit-all-cards/spec.md
 *   docs/developer/features/inline-edit-all-cards/plan.md
 *   docs/developer/features/inline-edit-all-cards/tasks.md
 *
 * 本ファイルが検証する受け入れ基準:
 *   AC-1 : TaskCard 表示で name input が常時表示される (DOM).
 *   AC-2 : TaskCard input の blur で onNameBlur が次の値で呼ばれる (DOM).
 *   AC-3 : ProjectCard で「変更」「保存」「キャンセル」 button が存在しない (DOM).
 *   AC-4 : ProjectCard で name input が常時表示される + visually-hidden label (DOM).
 *   AC-5 : ProjectCard input の blur で onNameBlur が呼ばれる (DOM).
 *   AC-6 : RoutineCard で「変更」「保存」「キャンセル」 button が存在しない (DOM).
 *   AC-7 : RoutineCard で name input + 曜日 checkbox 7 個 + PriorityStars が常時表示 (DOM).
 *   AC-8 : RoutineCard 曜日 click で即時 onDaysOfWeekChange が呼ばれる (DOM).
 *   AC-9 : RoutineCard PriorityStars click で即時 onDefaultPriorityChange が呼ばれる (DOM).
 *   AC-10: RoutineCard input の blur で onNameBlur が呼ばれる (DOM).
 *   AC-11: 起票カード (TaskFormCard / ProjectFormCard / RoutineFormCard) が無改修である
 *          (= 「追加」 button が引き続き存在する) (DOM).
 *   AC-12: projects-view.tsx から isEditing 系 state / handler が撤去 (ソース直読み).
 *   AC-13: routines-view.tsx から isEditing 系 state / handler が撤去 (ソース直読み).
 *   AC-14: today / tomorrow / focus の TaskCard が onNameBlur prop を受け取る (ソース直読み).
 *   AC-15: 空文字 blur で Repository.update が呼ばれない + 入力欄の表示が元値に戻る
 *          (mock / 親 view 経由 / Task・Project・Routine の 3 カード統一方式で検証).
 *   AC-16: 同値 blur で Repository.update が呼ばれない (mock / 親 view 経由).
 *   AC-17: 実値変更 blur で Repository.update が呼ばれる (mock / 親 view 経由).
 *   AC-18: RoutineCard 曜日 click で即時 RoutineRepository.update が呼ばれる (mock).
 *   AC-19: RoutineCard PriorityStars click で即時 RoutineRepository.update が呼ばれる (mock).
 *   AC-20: 412 で ConflictDialog が開く (mock / 親 view 経由).
 *   AC-21: BL-042 spec に「BL-070 で逆転」注釈 1 行が追記されている (テキスト直読み).
 *   AC-22: アクセシビリティ違反 0 件を維持する (E2E 側で担保 / 本ファイルでは個別 assert しない).
 *   AC-23: tokens.css / Repository / Mutation の API が無改修 (ソース直読み).
 *   AC-24: 既存単体テスト全件 green (本ファイルでは個別 assert しない / ルート npm test で担保).
 *   AC-25: 既存 E2E 全件 green (本ファイルでは個別 assert しない / npx playwright test で担保).
 *
 * 本ファイルは TDD の "red" を作るためのテスト.
 *   - 実装前 (= card 3 種が旧 API のまま / view 5 種が旧 state を保持) では,
 *     AC-1 〜 AC-10 (DOM レンダ系) / AC-12 〜 AC-14 (ソース直読み系) /
 *     AC-15 〜 AC-20 (親 view 経由 PATCH 系) が red になる想定.
 *   - AC-11 / AC-23 は green が期待値 (= 起票カード / tokens / Repository は無改修).
 *   - AC-21 は BL-042 spec へ注釈追加されるまで red.
 *   - implementer が REQ-1 〜 REQ-11 を実装することで red 群が green 化する.
 *
 * 検証スタイル:
 *   - DOM レンダ: BL-059 / BL-060 / BL-061 と同形の動的 import + render パターン.
 *   - 親 view 経由 PATCH: mock Repository を props 注入し, mutation 呼び出しを観察.
 *   - ソース直読み: readFileSync で view / spec ファイルを観察.
 *
 * vitest-environment:
 *   DOM レンダ AC は jsdom 必須のため 1 ファイル全体を jsdom で動かす.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Priority, Task } from "@todica/domain/task";
import type { ComponentType, ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Project, ProjectRepository } from "../src/repositories/project-repository.js";
import { ProjectConflictError } from "../src/repositories/project-repository.js";
import type { WebRoutine, WebRoutineRepository } from "../src/repositories/routine-repository.js";
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
import { ProjectsView } from "../src/ui/projects-view/projects-view.js";
import { RoutinesView } from "../src/ui/routines-view/routines-view.js";
import { TodayView } from "../src/ui/today-view/today-view.js";
import { TomorrowView } from "../src/ui/tomorrow-view/tomorrow-view.js";

// ============================================================
// 共通定数 / パス解決
// ============================================================

const repoRoot = resolve(__dirname, "../..");
const webSrcRoot = resolve(repoRoot, "web/src");

const taskCardTsxPath = resolve(webSrcRoot, "ui/task-card/task-card.tsx");
const projectCardTsxPath = resolve(webSrcRoot, "ui/project-card/project-card.tsx");
const routineCardTsxPath = resolve(webSrcRoot, "ui/routine-card/routine-card.tsx");
const taskFormCardTsxPath = resolve(webSrcRoot, "ui/task-card/task-form-card.tsx");
const projectFormCardTsxPath = resolve(webSrcRoot, "ui/project-card/project-form-card.tsx");
const routineFormCardTsxPath = resolve(webSrcRoot, "ui/routine-card/routine-form-card.tsx");
const projectsViewTsxPath = resolve(webSrcRoot, "ui/projects-view/projects-view.tsx");
const routinesViewTsxPath = resolve(webSrcRoot, "ui/routines-view/routines-view.tsx");
const todayViewTsxPath = resolve(webSrcRoot, "ui/today-view/today-view.tsx");
const tomorrowViewTsxPath = resolve(webSrcRoot, "ui/tomorrow-view/tomorrow-view.tsx");
const focusViewTsxPath = resolve(webSrcRoot, "ui/focus-view/focus-view.tsx");
const taskCardActionsSpecPath = resolve(
  repoRoot,
  "docs/developer/features/task-card-actions/spec.md",
);
const tokensCssPath = resolve(webSrcRoot, "styles/tokens.css");
const projectRepositoryTsPath = resolve(webSrcRoot, "repositories/project-repository.ts");
const routineRepositoryTsPath = resolve(webSrcRoot, "repositories/routine-repository.ts");
const taskRepositoryTsPath = resolve(webSrcRoot, "repositories/task-repository.ts");

const NOW = "2026-06-12T09:00:00.000Z";
const PROJECT_ID_P1 = "p1p1p1p1-p1p1-4p1p-8p1p-p1p1p1p1p1p1";
const ROUTINE_ID_R1 = "r1r1r1r1-r1r1-4r1r-8r1r-r1r1r1r1r1r1";

// ============================================================
// 動的 import ヘルパ
// ============================================================

// 型は JSX として使える ComponentType に緩めて受ける (props は任意).
type TaskCardModule = { TaskCard: ComponentType<Record<string, unknown>> };
type ProjectCardModule = { ProjectCard: ComponentType<Record<string, unknown>> };
type RoutineCardModule = { RoutineCard: ComponentType<Record<string, unknown>> };
type TaskFormCardModule = { TaskFormCard: ComponentType<Record<string, unknown>> };
type ProjectFormCardModule = { ProjectFormCard: ComponentType<Record<string, unknown>> };
type RoutineFormCardModule = { RoutineFormCard: ComponentType<Record<string, unknown>> };

async function importTaskCard(): Promise<TaskCardModule> {
  const path = "../src/ui/task-card/task-card.js";
  return (await import(/* @vite-ignore */ path)) as TaskCardModule;
}
async function importProjectCard(): Promise<ProjectCardModule> {
  const path = "../src/ui/project-card/project-card.js";
  return (await import(/* @vite-ignore */ path)) as ProjectCardModule;
}
async function importRoutineCard(): Promise<RoutineCardModule> {
  const path = "../src/ui/routine-card/routine-card.js";
  return (await import(/* @vite-ignore */ path)) as RoutineCardModule;
}
async function importTaskFormCard(): Promise<TaskFormCardModule> {
  const path = "../src/ui/task-card/task-form-card.js";
  return (await import(/* @vite-ignore */ path)) as TaskFormCardModule;
}
async function importProjectFormCard(): Promise<ProjectFormCardModule> {
  const path = "../src/ui/project-card/project-form-card.js";
  return (await import(/* @vite-ignore */ path)) as ProjectFormCardModule;
}
async function importRoutineFormCard(): Promise<RoutineFormCardModule> {
  const path = "../src/ui/routine-card/routine-form-card.js";
  return (await import(/* @vite-ignore */ path)) as RoutineFormCardModule;
}

// ============================================================
// テストフィクスチャ
// ============================================================

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
    name: "仕事",
    version: 1,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function makeRoutine(overrides: Partial<WebRoutine> = {}): WebRoutine {
  return {
    id: ROUTINE_ID_R1,
    name: "朝散歩",
    daysOfWeek: [1, 2, 3],
    defaultPriority: "normal",
    version: 1,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

// ============================================================
// Mock Repository ファクトリ
// ============================================================

function makeMockProjectRepository(initial: Project[] = []): ProjectRepository & {
  listMock: ReturnType<typeof vi.fn>;
  createMock: ReturnType<typeof vi.fn>;
  updateMock: ReturnType<typeof vi.fn>;
  deleteMock: ReturnType<typeof vi.fn>;
} {
  let state = [...initial];
  const listMock = vi.fn(async (): Promise<Project[]> => [...state]);
  const createMock = vi.fn(async (cmd: { id: string; name: string }) => {
    const p: Project = {
      id: cmd.id,
      name: cmd.name,
      version: 1,
      createdAt: NOW,
      updatedAt: NOW,
    };
    state.push(p);
    return p;
  });
  const updateMock = vi.fn(
    async (cmd: { id: string; ifMatch: number; name: string }): Promise<Project> => {
      const idx = state.findIndex((p) => p.id === cmd.id);
      if (idx < 0) throw new Error("project not found");
      const updated: Project = {
        ...state[idx]!,
        name: cmd.name,
        version: state[idx]!.version + 1,
        updatedAt: NOW,
      };
      state[idx] = updated;
      return updated;
    },
  );
  const deleteMock = vi.fn(async (cmd: { id: string; ifMatch: number }) => {
    state = state.filter((p) => p.id !== cmd.id);
  });
  return {
    list: listMock,
    create: createMock,
    update: updateMock,
    delete: deleteMock,
    listMock,
    createMock,
    updateMock,
    deleteMock,
  };
}

function makeMockRoutineRepository(initial: WebRoutine[] = []): WebRoutineRepository & {
  listMock: ReturnType<typeof vi.fn>;
  updateMock: ReturnType<typeof vi.fn>;
  deleteMock: ReturnType<typeof vi.fn>;
} {
  let state = [...initial];
  const listMock = vi.fn(async (): Promise<WebRoutine[]> => [...state]);
  const createMock = vi.fn(
    async (cmd: {
      id: string;
      name: string;
      daysOfWeek: number[];
      defaultPriority: string;
    }): Promise<WebRoutine> => {
      const r: WebRoutine = {
        id: cmd.id,
        name: cmd.name,
        daysOfWeek: cmd.daysOfWeek,
        defaultPriority: cmd.defaultPriority as Priority,
        version: 1,
        createdAt: NOW,
        updatedAt: NOW,
      };
      state.push(r);
      return r;
    },
  );
  const updateMock = vi.fn(
    async (cmd: {
      id: string;
      ifMatch: number;
      name?: string;
      daysOfWeek?: number[];
      defaultPriority?: Priority;
    }): Promise<WebRoutine> => {
      const idx = state.findIndex((r) => r.id === cmd.id);
      if (idx < 0) throw new Error("routine not found");
      const next: WebRoutine = {
        ...state[idx]!,
        ...(cmd.name !== undefined ? { name: cmd.name } : {}),
        ...(cmd.daysOfWeek !== undefined ? { daysOfWeek: cmd.daysOfWeek } : {}),
        ...(cmd.defaultPriority !== undefined ? { defaultPriority: cmd.defaultPriority } : {}),
        version: state[idx]!.version + 1,
        updatedAt: NOW,
      };
      state[idx] = next;
      return next;
    },
  );
  const deleteMock = vi.fn(async (cmd: { id: string; ifMatch: number }) => {
    state = state.filter((r) => r.id !== cmd.id);
  });
  return {
    list: listMock,
    create: createMock,
    update: updateMock,
    delete: deleteMock,
    listMock,
    updateMock,
    deleteMock,
  };
}

function makeMockTaskRepository(
  initial: Task[] = [],
  options: { initialFocus?: FocusSelection; initialCounter?: Counter } = {},
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
  const PRIORITY_ORDER: Record<string, number> = { highest: 0, normal: 1, later: 2 };
  const sortTasks = (tasks: Task[]): Task[] =>
    [...tasks].sort((a, b) => {
      const p = (PRIORITY_ORDER[a.priority] ?? 99) - (PRIORITY_ORDER[b.priority] ?? 99);
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
      const next: Task = {
        ...state[idx]!,
        trashedAt: NOW,
        trashedReason: "completed",
        version: (state[idx]?.version ?? 0) + 1,
      };
      state[idx] = next;
      counterState = {
        ...counterState,
        completedCount: counterState.completedCount + 1,
        version: counterState.version + 1,
        updatedAt: NOW,
      };
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
// QueryClient ラッパ
// ============================================================

function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: Number.POSITIVE_INFINITY,
        retry: false,
        networkMode: "offlineFirst",
      },
      mutations: { retry: false, networkMode: "offlineFirst" },
    },
  });
}

/**
 * BL-104 追従: 起票フォームは `?create=1` 付き URL でのみ描画される.
 *   本ファイルは TodayView / TomorrowView / ProjectsView / RoutinesView を
 *   横断的に検証するため, クエリ部分のみを `?create=1` 固定にして
 *   どのビュー実装も「起票フォームが開いた状態」になる用に MemoryRouter で wrap する.
 *   起票フォームを使わないシナリオ (= 既存カード編集系) は ?create=1 の有無で
 *   挙動が変わらないので影響しない.
 */
function renderWithQueryClient(ui: ReactNode): ReturnType<typeof render> {
  const queryClient = createTestQueryClient();
  return render(
    <MemoryRouter
      initialEntries={["/today?create=1"]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
    </MemoryRouter>,
  );
}

// ============================================================
// describe ブロック
// ============================================================

describe("BL-070 inline-edit-all-cards / 全カードのインライン常時編集化", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ============================================================
  // AC-1: TaskCard 表示で name input が常時表示される
  // ============================================================
  /**
   * シナリオ AC-1:
   *   Given <TaskCard task={...} onNameBlur={...} ... /> を render する
   *   When  出力 DOM を観察する
   *   Then  task-card__title 内に <input type="text"> が 1 個存在する
   *    かつ input の value 属性が task.name と一致する
   *    かつ <span>{task.name}</span> 要素は存在しない (= input が span を置換)
   */
  describe("AC-1: TaskCard 表示で name input が常時表示される", () => {
    it("task-card__title 内に <input type='text'> が 1 個存在し value が task.name と一致する", async () => {
      const { TaskCard } = await importTaskCard();
      const task = makeTask({ name: "牛乳" });
      const { container } = render(
        <TaskCard
          task={task}
          project={null}
          projects={[]}
          onChangeProject={() => {}}
          showPriority={false}
          actionSet="full"
          dueDateMode="today"
          onNameBlur={() => {}}
          onDelete={() => {}}
          onToggleDueDate={() => {}}
          onComplete={() => {}}
        />,
      );
      const title = container.querySelector(".task-card__title");
      expect(title, ".task-card__title が見つからない").not.toBeNull();
      const inputs = Array.from(title?.querySelectorAll('input[type="text"]') ?? []);
      expect(
        inputs.length,
        ".task-card__title 内に <input type='text'> が 1 個ではない (AC-1 違反)",
      ).toBe(1);
      const input = inputs[0] as HTMLInputElement;
      expect(input.value).toBe("牛乳");
    });

    it("task-card__title 直下に <span>{task.name}</span> 要素が存在しない (= input が span を置換)", async () => {
      const { TaskCard } = await importTaskCard();
      const task = makeTask({ name: "牛乳" });
      const { container } = render(
        <TaskCard
          task={task}
          project={null}
          projects={[]}
          onChangeProject={() => {}}
          showPriority={false}
          actionSet="full"
          dueDateMode="today"
          onNameBlur={() => {}}
          onDelete={() => {}}
          onToggleDueDate={() => {}}
          onComplete={() => {}}
        />,
      );
      const title = container.querySelector(".task-card__title");
      expect(title, ".task-card__title が見つからない").not.toBeNull();
      // input の親が title なら直下 span は不要.
      const directSpan = Array.from(title?.children ?? []).find(
        (el) => el.tagName.toLowerCase() === "span",
      );
      expect(
        directSpan,
        ".task-card__title 直下に <span> が残っている (BL-070 REQ-1 違反)",
      ).toBeUndefined();
    });
  });

  // ============================================================
  // AC-2: TaskCard input の blur で onNameBlur が次の値で呼ばれる
  // ============================================================
  /**
   * シナリオ AC-2:
   *   Given <TaskCard task={{...name: "古い"}} onNameBlur={spy} ... /> を render する
   *   When  input に "新しい" を入力し blur する
   *   Then  spy が 1 回 "新しい" を引数に呼ばれる
   */
  describe("AC-2: TaskCard input の blur で onNameBlur が次の値で呼ばれる", () => {
    it("input に '新しい' を入力し blur すると onNameBlur('新しい') が呼ばれる", async () => {
      const { TaskCard } = await importTaskCard();
      const task = makeTask({ name: "古い" });
      const spy = vi.fn();
      const { container } = render(
        <TaskCard
          task={task}
          project={null}
          projects={[]}
          onChangeProject={() => {}}
          showPriority={false}
          actionSet="full"
          dueDateMode="today"
          onNameBlur={spy}
          onDelete={() => {}}
          onToggleDueDate={() => {}}
          onComplete={() => {}}
        />,
      );
      const title = container.querySelector(".task-card__title");
      const input = title?.querySelector('input[type="text"]') as HTMLInputElement | null;
      expect(input, "task-card__title 内に input が無い").not.toBeNull();
      if (!input) return;
      // 値を変えて blur する. fireEvent.change → blur パターン (controlled / uncontrolled いずれにも対応).
      fireEvent.change(input, { target: { value: "新しい" } });
      fireEvent.blur(input);
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith("新しい");
    });
  });

  // ============================================================
  // AC-3: ProjectCard で「変更」「保存」「キャンセル」 button が存在しない
  // ============================================================
  /**
   * シナリオ AC-3:
   *   Given <ProjectCard project={...} onNameBlur={...} onDelete={...} /> を render する
   *   When  ボタンを観察する
   *   Then  accessibleName が「変更」の button が存在しない
   *    かつ accessibleName が「保存」の button が存在しない
   *    かつ accessibleName が「キャンセル」の button が存在しない
   *    かつ accessibleName が「削除」の button が 1 個存在する
   */
  describe("AC-3: ProjectCard で「変更」「保存」「キャンセル」 button が存在しない", () => {
    it("「変更」 button が存在しない (= 編集モード概念撤去)", async () => {
      const { ProjectCard } = await importProjectCard();
      const project = makeProject();
      const { container } = render(
        <ProjectCard project={project} onNameBlur={() => {}} onDelete={() => {}} />,
      );
      const labels = Array.from(container.querySelectorAll("button")).map(
        (b) => b.textContent?.trim() ?? "",
      );
      expect(labels, "「変更」 button が残存 (BL-070 REQ-2 違反)").not.toContain("変更");
    });

    it("「保存」「キャンセル」 button が存在しない", async () => {
      const { ProjectCard } = await importProjectCard();
      const project = makeProject();
      const { container } = render(
        <ProjectCard project={project} onNameBlur={() => {}} onDelete={() => {}} />,
      );
      const labels = Array.from(container.querySelectorAll("button")).map(
        (b) => b.textContent?.trim() ?? "",
      );
      expect(labels, "「保存」 button が残存 (BL-070 REQ-2 違反)").not.toContain("保存");
      expect(labels, "「キャンセル」 button が残存 (BL-070 REQ-2 違反)").not.toContain(
        "キャンセル",
      );
    });

    it("「削除」 button が 1 個存在する", async () => {
      const { ProjectCard } = await importProjectCard();
      const project = makeProject();
      const { container } = render(
        <ProjectCard project={project} onNameBlur={() => {}} onDelete={() => {}} />,
      );
      const labels = Array.from(container.querySelectorAll("button")).map(
        (b) => b.textContent?.trim() ?? "",
      );
      expect(labels.filter((t) => t === "削除").length, "「削除」 button が 1 個ではない").toBe(1);
    });
  });

  // ============================================================
  // AC-4: ProjectCard で name input が常時表示される
  // ============================================================
  /**
   * シナリオ AC-4:
   *   Given <ProjectCard project={{id: "p1", name: "仕事"}} ... /> を render する
   *   When  出力 DOM を観察する
   *   Then  <input id="project-name-p1" type="text" value="仕事"> が存在する
   *    かつ <label class="visually-hidden" htmlFor="project-name-p1">プロジェクト名</label> が存在する
   *    かつ <form aria-label="プロジェクト名称変更フォーム"> は存在しない
   */
  describe("AC-4: ProjectCard で name input が常時表示される + visually-hidden label", () => {
    it("<input id='project-name-{project.id}' type='text' value={project.name}> が存在する", async () => {
      const { ProjectCard } = await importProjectCard();
      const project = makeProject({ id: "p1", name: "仕事" });
      const { container } = render(
        <ProjectCard project={project} onNameBlur={() => {}} onDelete={() => {}} />,
      );
      const input = container.querySelector(
        "input#project-name-p1[type='text']",
      ) as HTMLInputElement | null;
      expect(input, "input#project-name-p1 が見つからない (BL-070 REQ-2 違反)").not.toBeNull();
      expect(input?.value).toBe("仕事");
    });

    it("<label class='visually-hidden' htmlFor='project-name-{project.id}'>プロジェクト名</label> が存在する", async () => {
      const { ProjectCard } = await importProjectCard();
      const project = makeProject({ id: "p1", name: "仕事" });
      const { container } = render(
        <ProjectCard project={project} onNameBlur={() => {}} onDelete={() => {}} />,
      );
      const label = container.querySelector(
        "label[for='project-name-p1']",
      ) as HTMLLabelElement | null;
      expect(label, "label[for='project-name-p1'] が見つからない").not.toBeNull();
      expect(label?.classList.contains("visually-hidden")).toBe(true);
      expect(label?.textContent ?? "").toContain("プロジェクト名");
    });

    it("<form aria-label='プロジェクト名称変更フォーム'> が存在しない", async () => {
      const { ProjectCard } = await importProjectCard();
      const project = makeProject();
      const { container } = render(
        <ProjectCard project={project} onNameBlur={() => {}} onDelete={() => {}} />,
      );
      const form = container.querySelector("form[aria-label='プロジェクト名称変更フォーム']");
      expect(form, "編集モード form が残存 (BL-070 REQ-2 違反)").toBeNull();
    });
  });

  // ============================================================
  // AC-5: ProjectCard input の blur で onNameBlur が呼ばれる
  // ============================================================
  /**
   * シナリオ AC-5:
   *   Given <ProjectCard project={{name: "古い"}} onNameBlur={spy} ... /> を render する
   *   When  input に "新しい" を入力し blur する
   *   Then  spy が 1 回 "新しい" を引数に呼ばれる
   */
  describe("AC-5: ProjectCard input の blur で onNameBlur が呼ばれる", () => {
    it("input の値を変更し blur すると onNameBlur が次の値で呼ばれる", async () => {
      const { ProjectCard } = await importProjectCard();
      const project = makeProject({ id: "p1", name: "古い" });
      const spy = vi.fn();
      const { container } = render(
        <ProjectCard project={project} onNameBlur={spy} onDelete={() => {}} />,
      );
      const input = container.querySelector("input#project-name-p1") as HTMLInputElement | null;
      expect(input, "input が見つからない").not.toBeNull();
      if (!input) return;
      fireEvent.change(input, { target: { value: "新しい" } });
      fireEvent.blur(input);
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith("新しい");
    });
  });

  // ============================================================
  // AC-6: RoutineCard で「変更」「保存」「キャンセル」 button が存在しない
  // ============================================================
  /**
   * シナリオ AC-6:
   *   Given <RoutineCard routine={...} onNameBlur={...} onDaysOfWeekChange={...}
   *                      onDefaultPriorityChange={...} onDelete={...} /> を render する
   *   When  ボタンを観察する
   *   Then  accessibleName が「変更」「保存」「キャンセル」の button が存在しない
   *    かつ accessibleName が「削除」の button が 1 個存在する
   */
  describe("AC-6: RoutineCard で「変更」「保存」「キャンセル」 button が存在しない", () => {
    it("「変更」「保存」「キャンセル」 button が存在しない / 「削除」 button が 1 個存在する", async () => {
      const { RoutineCard } = await importRoutineCard();
      const routine = makeRoutine();
      const { container } = render(
        <RoutineCard
          routine={routine}
          onNameBlur={() => {}}
          onDaysOfWeekChange={() => {}}
          onDefaultPriorityChange={() => {}}
          onDelete={() => {}}
        />,
      );
      const labels = Array.from(container.querySelectorAll("button")).map(
        (b) => b.textContent?.trim() ?? "",
      );
      expect(labels, "「変更」 button が残存").not.toContain("変更");
      expect(labels, "「保存」 button が残存").not.toContain("保存");
      expect(labels, "「キャンセル」 button が残存").not.toContain("キャンセル");
      expect(labels.filter((t) => t === "削除").length, "「削除」 button が 1 個ではない").toBe(1);
    });
  });

  // ============================================================
  // AC-7: RoutineCard で name input + 曜日 7 checkbox + PriorityStars が常時表示
  // ============================================================
  /**
   * シナリオ AC-7:
   *   Given <RoutineCard routine={{id: "r1", name: "朝散歩", daysOfWeek: [1,2,3],
   *                               defaultPriority: "normal"}} ... /> を render する
   *   When  出力 DOM を観察する
   *   Then  <input id="routine-name-r1" type="text" value="朝散歩"> が存在する
   *    かつ <div role="group" aria-label="曜日"> 内に <input type="checkbox"> が 7 個存在する
   *    かつ 曜日 1 / 2 / 3 の checkbox が checked / 0 / 4 / 5 / 6 が unchecked
   *    かつ PriorityStars (role=radiogroup aria-label を含む "優先度") が存在する
   *    かつ <form aria-label="ルーティン名称変更フォーム"> は存在しない
   */
  describe("AC-7: RoutineCard で name input + 曜日 7 checkbox + PriorityStars が常時表示", () => {
    it("<input id='routine-name-{id}' type='text' value={routine.name}> が存在する", async () => {
      const { RoutineCard } = await importRoutineCard();
      const routine = makeRoutine({ id: "r1", name: "朝散歩" });
      const { container } = render(
        <RoutineCard
          routine={routine}
          onNameBlur={() => {}}
          onDaysOfWeekChange={() => {}}
          onDefaultPriorityChange={() => {}}
          onDelete={() => {}}
        />,
      );
      const input = container.querySelector(
        "input#routine-name-r1[type='text']",
      ) as HTMLInputElement | null;
      expect(input, "input#routine-name-r1 が見つからない (BL-070 REQ-3 違反)").not.toBeNull();
      expect(input?.value).toBe("朝散歩");
    });

    it("<div role='group' aria-label='曜日'> 内に checkbox が 7 個存在し routine.daysOfWeek に対応して checked 状態を持つ", async () => {
      const { RoutineCard } = await importRoutineCard();
      const routine = makeRoutine({ daysOfWeek: [1, 2, 3] });
      const { container } = render(
        <RoutineCard
          routine={routine}
          onNameBlur={() => {}}
          onDaysOfWeekChange={() => {}}
          onDefaultPriorityChange={() => {}}
          onDelete={() => {}}
        />,
      );
      const group = container.querySelector("div[role='group'][aria-label='曜日']");
      expect(group, "div[role='group'][aria-label='曜日'] が見つからない").not.toBeNull();
      const checkboxes = Array.from(
        group?.querySelectorAll("input[type='checkbox']") ?? [],
      ) as HTMLInputElement[];
      expect(checkboxes.length, "曜日 checkbox が 7 個ではない").toBe(7);
      // 曜日 1 / 2 / 3 が checked.
      expect(checkboxes[1]?.checked, "曜日 1 (月) が checked ではない").toBe(true);
      expect(checkboxes[2]?.checked, "曜日 2 (火) が checked ではない").toBe(true);
      expect(checkboxes[3]?.checked, "曜日 3 (水) が checked ではない").toBe(true);
      // 0 / 4 / 5 / 6 は unchecked.
      expect(checkboxes[0]?.checked, "曜日 0 (日) が checked").toBe(false);
      expect(checkboxes[4]?.checked, "曜日 4 (木) が checked").toBe(false);
      expect(checkboxes[5]?.checked, "曜日 5 (金) が checked").toBe(false);
      expect(checkboxes[6]?.checked, "曜日 6 (土) が checked").toBe(false);
    });

    it("PriorityStars (role=radiogroup / aria-label に '優先度' を含む) が存在し 3 個の星 button を持つ", async () => {
      const { RoutineCard } = await importRoutineCard();
      const routine = makeRoutine();
      const { container } = render(
        <RoutineCard
          routine={routine}
          onNameBlur={() => {}}
          onDaysOfWeekChange={() => {}}
          onDefaultPriorityChange={() => {}}
          onDelete={() => {}}
        />,
      );
      const radiogroups = Array.from(container.querySelectorAll("div[role='radiogroup']"));
      const priorityGroup = radiogroups.find((g) =>
        (g.getAttribute("aria-label") ?? "").includes("優先度"),
      );
      expect(
        priorityGroup,
        "PriorityStars (radiogroup with 優先度) が見つからない",
      ).not.toBeUndefined();
      const stars = Array.from(priorityGroup?.querySelectorAll("button[role='radio']") ?? []);
      expect(stars.length, "PriorityStars の星 button が 3 個ではない").toBe(3);
    });

    it("<form aria-label='ルーティン名称変更フォーム'> が存在しない", async () => {
      const { RoutineCard } = await importRoutineCard();
      const routine = makeRoutine();
      const { container } = render(
        <RoutineCard
          routine={routine}
          onNameBlur={() => {}}
          onDaysOfWeekChange={() => {}}
          onDefaultPriorityChange={() => {}}
          onDelete={() => {}}
        />,
      );
      const form = container.querySelector("form[aria-label='ルーティン名称変更フォーム']");
      expect(form, "編集モード form が残存 (BL-070 REQ-3 違反)").toBeNull();
    });
  });

  // ============================================================
  // AC-8: RoutineCard 曜日 click で即時 onDaysOfWeekChange が呼ばれる
  // ============================================================
  /**
   * シナリオ AC-8:
   *   Given <RoutineCard routine={{daysOfWeek: [1,2]}} onDaysOfWeekChange={spy} ... /> を render する
   *   When  曜日 "水" (= day 3) の checkbox を click する
   *   Then  spy が 1 回 [1, 2, 3] を引数に呼ばれる
   *    かつ 「保存」 button 押下を経由しない (= 即時)
   */
  describe("AC-8: RoutineCard 曜日 click で即時 onDaysOfWeekChange が呼ばれる", () => {
    it("水 (day 3) の checkbox を click すると onDaysOfWeekChange([1,2,3]) が呼ばれる", async () => {
      const { RoutineCard } = await importRoutineCard();
      const routine = makeRoutine({ daysOfWeek: [1, 2] });
      const spy = vi.fn();
      const { container } = render(
        <RoutineCard
          routine={routine}
          onNameBlur={() => {}}
          onDaysOfWeekChange={spy}
          onDefaultPriorityChange={() => {}}
          onDelete={() => {}}
        />,
      );
      const group = container.querySelector("div[role='group'][aria-label='曜日']");
      const checkboxes = Array.from(
        group?.querySelectorAll("input[type='checkbox']") ?? [],
      ) as HTMLInputElement[];
      // 水 = day 3 (= index 3).
      const wed = checkboxes[3];
      expect(wed, "曜日 3 (水) の checkbox が見つからない").not.toBeUndefined();
      wed?.click();
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith([1, 2, 3]);
    });
  });

  // ============================================================
  // AC-9: RoutineCard PriorityStars click で即時 onDefaultPriorityChange が呼ばれる
  // ============================================================
  /**
   * シナリオ AC-9:
   *   Given <RoutineCard routine={{defaultPriority: "normal"}} onDefaultPriorityChange={spy} ... /> を render する
   *   When  PriorityStars の "highest" 相当の radio (3 つ目の星) を click する
   *   Then  spy が 1 回 "highest" を引数に呼ばれる
   */
  describe("AC-9: RoutineCard PriorityStars click で即時 onDefaultPriorityChange が呼ばれる", () => {
    it("3 つ目の星 (highest) を click すると onDefaultPriorityChange('highest') が呼ばれる", async () => {
      const { RoutineCard } = await importRoutineCard();
      const routine = makeRoutine({ defaultPriority: "normal" });
      const spy = vi.fn();
      const { container } = render(
        <RoutineCard
          routine={routine}
          onNameBlur={() => {}}
          onDaysOfWeekChange={() => {}}
          onDefaultPriorityChange={spy}
          onDelete={() => {}}
        />,
      );
      const radiogroups = Array.from(container.querySelectorAll("div[role='radiogroup']"));
      const priorityGroup = radiogroups.find((g) =>
        (g.getAttribute("aria-label") ?? "").includes("優先度"),
      );
      const stars = Array.from(
        priorityGroup?.querySelectorAll("button[role='radio']") ?? [],
      ) as HTMLButtonElement[];
      // 星 3 つ目 = highest.
      stars[2]?.click();
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith("highest");
    });
  });

  // ============================================================
  // AC-10: RoutineCard input の blur で onNameBlur が呼ばれる
  // ============================================================
  /**
   * シナリオ AC-10:
   *   Given <RoutineCard routine={{name: "古い"}} onNameBlur={spy} ... /> を render する
   *   When  input に "新しい" を入力し blur する
   *   Then  spy が 1 回 "新しい" を引数に呼ばれる
   */
  describe("AC-10: RoutineCard input の blur で onNameBlur が呼ばれる", () => {
    it("input の値を変更し blur すると onNameBlur が次の値で呼ばれる", async () => {
      const { RoutineCard } = await importRoutineCard();
      const routine = makeRoutine({ id: "r1", name: "古い" });
      const spy = vi.fn();
      const { container } = render(
        <RoutineCard
          routine={routine}
          onNameBlur={spy}
          onDaysOfWeekChange={() => {}}
          onDefaultPriorityChange={() => {}}
          onDelete={() => {}}
        />,
      );
      const input = container.querySelector("input#routine-name-r1") as HTMLInputElement | null;
      expect(input, "input#routine-name-r1 が見つからない").not.toBeNull();
      if (!input) return;
      fireEvent.change(input, { target: { value: "新しい" } });
      fireEvent.blur(input);
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith("新しい");
    });
  });

  // ============================================================
  // AC-11: 起票カードは無改修 (= 「追加」 button が引き続き存在)
  // ============================================================
  /**
   * シナリオ AC-11:
   *   Given 本 BL の実装がマージされた
   *   When  task-form-card.tsx / project-form-card.tsx / routine-form-card.tsx を観察する
   *   Then  各ファイルに 「追加」 button が引き続き存在する
   */
  describe("AC-11: 起票カード TaskFormCard / ProjectFormCard / RoutineFormCard が無改修 (「追加」 button 存在)", () => {
    it("TaskFormCard に「追加」 submit button が存在する", async () => {
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
      const submit = Array.from(container.querySelectorAll('button[type="submit"]')).find(
        (b) => (b.textContent ?? "").trim() === "追加",
      );
      expect(submit, "TaskFormCard に「追加」 submit button が無い (AC-11 違反)").toBeDefined();
    });

    it("ProjectFormCard に「追加」 submit button が存在する", async () => {
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
      const submit = Array.from(container.querySelectorAll('button[type="submit"]')).find(
        (b) => (b.textContent ?? "").trim() === "追加",
      );
      expect(submit, "ProjectFormCard に「追加」 submit button が無い (AC-11 違反)").toBeDefined();
    });

    it("RoutineFormCard に「追加」 submit button が存在する", async () => {
      const { RoutineFormCard } = await importRoutineFormCard();
      const { container } = render(
        <RoutineFormCard
          name=""
          onNameChange={() => {}}
          daysOfWeek={[1]}
          onToggleDay={() => {}}
          defaultPriority="normal"
          onDefaultPriorityChange={() => {}}
          onSubmit={(e: React.FormEvent) => {
            e.preventDefault();
          }}
        />,
      );
      const submit = Array.from(container.querySelectorAll('button[type="submit"]')).find(
        (b) => (b.textContent ?? "").trim() === "追加",
      );
      expect(submit, "RoutineFormCard に「追加」 submit button が無い (AC-11 違反)").toBeDefined();
    });
  });

  // ============================================================
  // AC-12: projects-view.tsx から isEditing 系 state / handler が撤去 (ソース直読み)
  // ============================================================
  /**
   * シナリオ AC-12:
   *   Given web/src/ui/projects-view/projects-view.tsx を開いた
   *   When  ファイル本文を観察する
   *   Then  state `editingId` の useState 宣言が存在しない
   *    かつ state `editingName` の useState 宣言が存在しない
   *    かつ handler `openEdit` / `cancelEdit` / `handleSaveEdit` の宣言が存在しない
   *    かつ <ProjectCard ... isEditing={...} /> 形式の使用が存在しない
   *    かつ <ProjectCard ... onNameBlur={...} /> 形式の使用が存在する
   */
  describe("AC-12: projects-view.tsx から isEditing 系 state / handler が撤去", () => {
    it("state useState 宣言 editingId / editingName が存在しない", () => {
      const src = readFileSync(projectsViewTsxPath, "utf-8");
      expect(src, "editingId の useState 宣言が残存 (AC-12 違反)").not.toMatch(
        /useState[^;]*editingId/,
      );
      expect(src, "setEditingId の利用が残存 (AC-12 違反)").not.toMatch(/setEditingId\b/);
      expect(src, "editingName の useState 宣言が残存 (AC-12 違反)").not.toMatch(
        /useState[^;]*editingName/,
      );
      expect(src, "setEditingName の利用が残存 (AC-12 違反)").not.toMatch(/setEditingName\b/);
    });

    it("handler openEdit / cancelEdit / handleSaveEdit の宣言が存在しない", () => {
      const src = readFileSync(projectsViewTsxPath, "utf-8");
      expect(src, "openEdit が残存 (AC-12 違反)").not.toMatch(/\bopenEdit\b/);
      expect(src, "cancelEdit が残存 (AC-12 違反)").not.toMatch(/\bcancelEdit\b/);
      expect(src, "handleSaveEdit が残存 (AC-12 違反)").not.toMatch(/\bhandleSaveEdit\b/);
    });

    it("<ProjectCard ... isEditing= /> の使用が存在しない", () => {
      const src = readFileSync(projectsViewTsxPath, "utf-8");
      expect(src, "<ProjectCard isEditing= が残存 (AC-12 違反)").not.toMatch(/isEditing\s*=/);
    });

    it("<ProjectCard ... onNameBlur= /> の使用が存在する", () => {
      const src = readFileSync(projectsViewTsxPath, "utf-8");
      expect(src, "<ProjectCard onNameBlur= が無い (AC-12 違反)").toMatch(/onNameBlur\s*=/);
    });
  });

  // ============================================================
  // AC-13: routines-view.tsx から isEditing 系 state / handler が撤去 (ソース直読み)
  // ============================================================
  /**
   * シナリオ AC-13:
   *   Given web/src/ui/routines-view/routines-view.tsx を開いた
   *   When  ファイル本文を観察する
   *   Then  state `editingId` / `editingName` / `editingDaysOfWeek` / `editingDefaultPriority` の
   *         useState 宣言が存在しない
   *    かつ handler `openEdit` / `cancelEdit` / `handleSaveEdit` の宣言が存在しない
   *    かつ <RoutineCard ... isEditing={...} /> 形式の使用が存在しない
   *    かつ <RoutineCard ... onNameBlur / onDaysOfWeekChange / onDefaultPriorityChange /> 形式の使用が存在する
   */
  describe("AC-13: routines-view.tsx から isEditing 系 state / handler が撤去", () => {
    it("editingId / editingName / editingDaysOfWeek / editingDefaultPriority の useState 宣言が存在しない", () => {
      const src = readFileSync(routinesViewTsxPath, "utf-8");
      expect(src, "editingId の useState 宣言が残存").not.toMatch(/useState[^;]*editingId/);
      expect(src, "setEditingId の利用が残存").not.toMatch(/setEditingId\b/);
      expect(src, "editingName の useState 宣言が残存").not.toMatch(/useState[^;]*editingName/);
      expect(src, "setEditingName の利用が残存").not.toMatch(/setEditingName\b/);
      expect(src, "editingDaysOfWeek の useState 宣言が残存").not.toMatch(
        /useState[^;]*editingDaysOfWeek/,
      );
      expect(src, "setEditingDaysOfWeek の利用が残存").not.toMatch(/setEditingDaysOfWeek\b/);
      expect(src, "editingDefaultPriority の useState 宣言が残存").not.toMatch(
        /useState[^;]*editingDefaultPriority/,
      );
      expect(src, "setEditingDefaultPriority の利用が残存").not.toMatch(
        /setEditingDefaultPriority\b/,
      );
    });

    it("handler openEdit / cancelEdit / handleSaveEdit の宣言が存在しない", () => {
      const src = readFileSync(routinesViewTsxPath, "utf-8");
      expect(src, "openEdit が残存").not.toMatch(/\bopenEdit\b/);
      expect(src, "cancelEdit が残存").not.toMatch(/\bcancelEdit\b/);
      expect(src, "handleSaveEdit が残存").not.toMatch(/\bhandleSaveEdit\b/);
    });

    it("<RoutineCard ... isEditing= /> の使用が存在しない", () => {
      const src = readFileSync(routinesViewTsxPath, "utf-8");
      expect(src, "<RoutineCard isEditing= が残存").not.toMatch(/isEditing\s*=/);
    });

    it("<RoutineCard ... onNameBlur / onDaysOfWeekChange / onDefaultPriorityChange /> が存在する", () => {
      const src = readFileSync(routinesViewTsxPath, "utf-8");
      expect(src, "onNameBlur が無い").toMatch(/onNameBlur\s*=/);
      expect(src, "onDaysOfWeekChange が無い").toMatch(/onDaysOfWeekChange\s*=/);
      expect(src, "onDefaultPriorityChange が無い").toMatch(/onDefaultPriorityChange\s*=/);
    });
  });

  // ============================================================
  // AC-14: today / tomorrow / focus の TaskCard が onNameBlur prop を受ける
  // ============================================================
  /**
   * シナリオ AC-14:
   *   Given web/src/ui/today-view/today-view.tsx を開いた
   *    かつ web/src/ui/tomorrow-view/tomorrow-view.tsx を開いた
   *    かつ web/src/ui/focus-view/focus-view.tsx を開いた
   *   When  <TaskCard ... /> の利用箇所を観察する
   *   Then  すべての利用箇所で onNameBlur={...} が渡されている
   *    かつ today-view の handler に handleNameBlur 相当の宣言がある
   *    かつ tomorrow-view の handler に同等の宣言がある
   *    かつ focus-view の handler に同等の宣言がある
   */
  describe("AC-14: today / tomorrow / focus の TaskCard が onNameBlur prop を受ける", () => {
    it("today-view.tsx の TaskCard に onNameBlur={ ... } が渡されている", () => {
      const src = readFileSync(todayViewTsxPath, "utf-8");
      expect(src, "today-view.tsx に onNameBlur が無い").toMatch(/onNameBlur\s*=/);
      // handler 宣言.
      expect(src, "today-view.tsx に handleNameBlur 相当の宣言が無い").toMatch(/handleNameBlur/);
    });

    it("tomorrow-view.tsx の TaskCard に onNameBlur={ ... } が渡されている", () => {
      const src = readFileSync(tomorrowViewTsxPath, "utf-8");
      expect(src, "tomorrow-view.tsx に onNameBlur が無い").toMatch(/onNameBlur\s*=/);
      expect(src, "tomorrow-view.tsx に handleNameBlur 相当の宣言が無い").toMatch(/handleNameBlur/);
    });

    it("focus-view.tsx の TaskCard に onNameBlur={ ... } が渡されている", () => {
      const src = readFileSync(focusViewTsxPath, "utf-8");
      expect(src, "focus-view.tsx に onNameBlur が無い").toMatch(/onNameBlur\s*=/);
      expect(src, "focus-view.tsx に handleNameBlur 相当の宣言が無い").toMatch(/handleNameBlur/);
    });
  });

  // ============================================================
  // AC-15: 空文字 blur で Repository.update が呼ばれない + 元値復元 (D-002)
  // ============================================================
  /**
   * シナリオ AC-15:
   *   Given /projects を render する
   *    かつ プロジェクト P (name="仕事", version=1) が表示されている
   *   When  input の value を "" にして blur する
   *   Then  ProjectRepository.update が呼ばれない (= PATCH は送らない)
   *    かつ 入力欄の表示は再描画で "仕事" に戻る (元値復元)
   *
   * 3 カード統一方式 (TaskCard / ProjectCard / RoutineCard) のため,
   * TodayView (TaskCard) / RoutinesView (RoutineCard) でも同じ「update 不発 + 元値復元」を検証する.
   * 元値復元の実装方式 (plan.md P-001 再設計):
   *   カードの blur ハンドラが空文字時に event.currentTarget.value = entity.name を同期書き戻し
   *   した上で onNameBlur("") を呼ぶ. 親 view handler は空文字を短絡して PATCH を送らない.
   */
  describe("AC-15: 空文字 blur で Repository.update が呼ばれず表示は元値に戻る (D-002)", () => {
    it("ProjectsView で input を空文字にして blur すると updateMock が呼ばれず表示が '仕事' に戻る", async () => {
      const P1 = makeProject({ id: "p1", name: "仕事", version: 1 });
      const repo = makeMockProjectRepository([P1]);
      renderWithQueryClient(<ProjectsView repository={repo} />);

      // 入力欄が描画されるまで待つ.
      const input = (await screen.findByDisplayValue("仕事")) as HTMLInputElement;
      fireEvent.change(input, { target: { value: "" } });
      fireEvent.blur(input);
      // updateMutation の mutationFn は非同期だが, 空文字短絡で update() に到達しない.
      // 念のため microtask flush.
      await new Promise((r) => setTimeout(r, 10));
      expect(
        repo.updateMock,
        "空文字 blur で update が呼ばれた (AC-15 / D-002 違反)",
      ).not.toHaveBeenCalled();
      // 元値復元: PATCH を送らない + 親 state 不変 → 入力欄の表示は "仕事" に戻る.
      expect(
        input.value,
        "空文字 blur 後に入力欄が元値 '仕事' に戻らない (AC-15 / D-002 違反)",
      ).toBe("仕事");
    });

    it("TodayView (TaskCard) で input を空文字にして blur すると update が呼ばれず表示が '牛乳' に戻る", async () => {
      const T1 = makeTask({ id: "t-1", name: "牛乳", dueDate: "today", version: 1 });
      const repo = makeMockTaskRepository([T1]);
      renderWithQueryClient(
        <TodayView repository={repo} projectRepository={makeMockProjectRepository([])} />,
      );

      const input = (await screen.findByDisplayValue("牛乳")) as HTMLInputElement;
      fireEvent.change(input, { target: { value: "" } });
      fireEvent.blur(input);
      await new Promise((r) => setTimeout(r, 10));
      expect(
        repo.update,
        "空文字 blur で TaskRepository.update が呼ばれた (AC-15 / D-002 違反)",
      ).not.toHaveBeenCalled();
      expect(
        input.value,
        "空文字 blur 後に入力欄が元値 '牛乳' に戻らない (AC-15 / D-002 違反)",
      ).toBe("牛乳");
    });

    it("RoutinesView (RoutineCard) で input を空文字にして blur すると updateMock が呼ばれず表示が '朝散歩' に戻る", async () => {
      const R1 = makeRoutine({ id: "r1", name: "朝散歩", version: 1 });
      const repo = makeMockRoutineRepository([R1]);
      renderWithQueryClient(<RoutinesView repository={repo} />);

      const input = (await screen.findByDisplayValue("朝散歩")) as HTMLInputElement;
      fireEvent.change(input, { target: { value: "" } });
      fireEvent.blur(input);
      await new Promise((r) => setTimeout(r, 10));
      expect(
        repo.updateMock,
        "空文字 blur で RoutineRepository.update が呼ばれた (AC-15 / D-002 違反)",
      ).not.toHaveBeenCalled();
      expect(
        input.value,
        "空文字 blur 後に入力欄が元値 '朝散歩' に戻らない (AC-15 / D-002 違反)",
      ).toBe("朝散歩");
    });
  });

  // ============================================================
  // AC-16: 同値 blur で Repository.update が呼ばれない (D-001)
  // ============================================================
  /**
   * シナリオ AC-16:
   *   Given /projects を render する
   *    かつ プロジェクト P (name="仕事", version=1) が表示されている
   *   When  input の value を変えずに blur する (= 同値)
   *   Then  ProjectRepository.update が呼ばれない
   */
  describe("AC-16: 同値 blur で Repository.update が呼ばれない (D-001)", () => {
    it("ProjectsView で input の値を変えずに blur すると updateMock が呼ばれない", async () => {
      const P1 = makeProject({ id: "p1", name: "仕事", version: 1 });
      const repo = makeMockProjectRepository([P1]);
      renderWithQueryClient(<ProjectsView repository={repo} />);

      const input = (await screen.findByDisplayValue("仕事")) as HTMLInputElement;
      // 値を変えずに blur.
      fireEvent.blur(input);
      await new Promise((r) => setTimeout(r, 10));
      expect(
        repo.updateMock,
        "同値 blur で update が呼ばれた (AC-16 / D-001 違反)",
      ).not.toHaveBeenCalled();
    });
  });

  // ============================================================
  // AC-17: 実値変更 blur で Repository.update が呼ばれる
  // ============================================================
  /**
   * シナリオ AC-17:
   *   Given /projects を render する
   *    かつ プロジェクト P (name="仕事", version=1) が表示されている
   *   When  input の value を "学習" に変更し blur する
   *   Then  ProjectRepository.update が { id: P.id, ifMatch: 1, name: "学習" } で 1 回呼ばれる
   */
  describe("AC-17: 実値変更 blur で Repository.update が呼ばれる", () => {
    it("ProjectsView で input を '学習' に変更し blur すると updateMock が呼ばれる", async () => {
      const P1 = makeProject({ id: "p1", name: "仕事", version: 1 });
      const repo = makeMockProjectRepository([P1]);
      renderWithQueryClient(<ProjectsView repository={repo} />);

      const input = (await screen.findByDisplayValue("仕事")) as HTMLInputElement;
      fireEvent.change(input, { target: { value: "学習" } });
      fireEvent.blur(input);
      // mutationFn の非同期処理を待つ.
      await new Promise((r) => setTimeout(r, 20));
      expect(
        repo.updateMock,
        "実値変更 blur で update が呼ばれない (AC-17 違反)",
      ).toHaveBeenCalled();
      const arg = repo.updateMock.mock.calls[0]?.[0] as {
        id: string;
        ifMatch: number;
        name: string;
      };
      expect(arg.id).toBe("p1");
      expect(arg.ifMatch).toBe(1);
      expect(arg.name).toBe("学習");
    });
  });

  // ============================================================
  // AC-18: RoutineCard 曜日 click で即時 RoutineRepository.update が呼ばれる
  // ============================================================
  /**
   * シナリオ AC-18:
   *   Given /routines を render する
   *    かつ ルーティン R (name="朝散歩", daysOfWeek=[1,2], defaultPriority="normal", version=1) が表示されている
   *   When  曜日 "水" (day=3) の checkbox を click する
   *   Then  RoutineRepository.update が { id: R.id, ifMatch: 1,
   *                                      daysOfWeek: [1,2,3], ... } で 1 回呼ばれる
   */
  describe("AC-18: RoutineCard 曜日 click で即時 RoutineRepository.update が呼ばれる", () => {
    it("RoutinesView で曜日 'water' (day=3) の checkbox を click すると updateMock が呼ばれる", async () => {
      const R1 = makeRoutine({
        id: "r1",
        name: "朝散歩",
        daysOfWeek: [1, 2],
        defaultPriority: "normal",
        version: 1,
      });
      const repo = makeMockRoutineRepository([R1]);
      renderWithQueryClient(<RoutinesView repository={repo} />);

      await screen.findByDisplayValue("朝散歩");

      // 表示カード (起票カードでない方) の曜日 checkbox group を取得する.
      // 起票カードと並ぶため group は 2 個になる. 後の方が表示カード.
      const groups = Array.from(document.querySelectorAll("div[role='group'][aria-label='曜日']"));
      expect(groups.length, "曜日 group が見つからない").toBeGreaterThanOrEqual(1);
      const cardGroup = groups[groups.length - 1];
      const checkboxes = Array.from(
        cardGroup?.querySelectorAll("input[type='checkbox']") ?? [],
      ) as HTMLInputElement[];
      // index 3 = 水.
      checkboxes[3]?.click();
      await new Promise((r) => setTimeout(r, 20));
      expect(repo.updateMock, "曜日 click で update が呼ばれない (AC-18 違反)").toHaveBeenCalled();
      const arg = repo.updateMock.mock.calls[0]?.[0] as {
        id: string;
        ifMatch: number;
        daysOfWeek?: number[];
      };
      expect(arg.id).toBe("r1");
      expect(arg.ifMatch).toBe(1);
      expect(arg.daysOfWeek).toEqual([1, 2, 3]);
    });
  });

  // ============================================================
  // AC-19: RoutineCard PriorityStars click で即時 RoutineRepository.update
  // ============================================================
  /**
   * シナリオ AC-19:
   *   Given /routines を render する
   *    かつ ルーティン R (defaultPriority="normal", version=1) が表示されている
   *   When  PriorityStars の "highest" radio (3 つ目の星) を click する
   *   Then  RoutineRepository.update が { id: R.id, ifMatch: 1,
   *                                      defaultPriority: "highest", ... } で 1 回呼ばれる
   */
  describe("AC-19: RoutineCard PriorityStars click で即時 RoutineRepository.update が呼ばれる", () => {
    it("RoutinesView で 3 つ目の星を click すると updateMock が呼ばれる", async () => {
      const R1 = makeRoutine({
        id: "r1",
        name: "朝散歩",
        daysOfWeek: [1, 2],
        defaultPriority: "normal",
        version: 1,
      });
      const repo = makeMockRoutineRepository([R1]);
      renderWithQueryClient(<RoutinesView repository={repo} />);

      await screen.findByDisplayValue("朝散歩");

      // 表示カードの PriorityStars (radiogroup) を取得.
      // 起票カードにも radiogroup があるため, idPrefix で区別する.
      const radiogroups = Array.from(document.querySelectorAll("div[role='radiogroup']"));
      // 起票側の radiogroup は星の id が `routine-create-star-X`.
      // 表示カード側は `routine-r1-star-X` (= routine-{id}).
      const cardGroup = radiogroups.find((g) => {
        const firstStar = g.querySelector("button[role='radio']");
        const id = firstStar?.getAttribute("id") ?? "";
        return id.startsWith("routine-r1-");
      });
      expect(
        cardGroup,
        "表示カードの PriorityStars (idPrefix=routine-r1) が見つからない",
      ).not.toBeUndefined();
      const stars = Array.from(
        cardGroup?.querySelectorAll("button[role='radio']") ?? [],
      ) as HTMLButtonElement[];
      // 星 3 つ目 = highest.
      stars[2]?.click();
      await new Promise((r) => setTimeout(r, 20));
      expect(
        repo.updateMock,
        "PriorityStars click で update が呼ばれない (AC-19 違反)",
      ).toHaveBeenCalled();
      const arg = repo.updateMock.mock.calls[0]?.[0] as {
        id: string;
        ifMatch: number;
        defaultPriority?: Priority;
      };
      expect(arg.id).toBe("r1");
      expect(arg.ifMatch).toBe(1);
      expect(arg.defaultPriority).toBe("highest");
    });
  });

  // ============================================================
  // AC-20: 412 conflict 時に ConflictDialog が開く (blur 経由)
  // ============================================================
  /**
   * シナリオ AC-20:
   *   Given /projects を render する
   *    かつ サーバ側で別タブが P の version を 2 に進めた
   *    かつ ローカル側はまだ P.version=1 と認識している
   *   When  input の value を "学習" に変更し blur する (= updateMutation 412 → ProjectConflictError)
   *   Then  ConflictDialog が開く (既存 BL-031 / BL-033 経路)
   */
  describe("AC-20: 412 conflict 時に ConflictDialog が開く (blur 経由)", () => {
    it("ProjectsView で update が ProjectConflictError を throw すると ConflictDialog が開く", async () => {
      const P1 = makeProject({ id: "p1", name: "仕事", version: 1 });
      const repo = makeMockProjectRepository([P1]);
      // update を ProjectConflictError で reject.
      const serverProject: Project = {
        id: "p1",
        name: "仕事 (サーバで変更済)",
        version: 2,
        createdAt: NOW,
        updatedAt: NOW,
      };
      repo.update = vi.fn(async () => {
        throw new ProjectConflictError(serverProject);
      });
      renderWithQueryClient(<ProjectsView repository={repo} />);

      const input = (await screen.findByDisplayValue("仕事")) as HTMLInputElement;
      fireEvent.change(input, { target: { value: "学習" } });
      fireEvent.blur(input);

      // ConflictDialog が開く. dialog role は ConflictDialog の実装に依存するが,
      // 既存実装では「サーバ側の値で上書き」または同等テキストを表示する想定.
      // ここではダイアログが何らかの形で出現することを assert する.
      // 既存 web/src/ui/conflict-dialog/conflict-dialog.tsx の role / aria-label を確認.
      const dialog = await screen.findByRole(
        "dialog",
        { name: /競合|conflict|変更が衝突|サーバ/ },
        { timeout: 2000 },
      );
      expect(dialog, "ConflictDialog が開いていない (AC-20 違反)").toBeDefined();
    });
  });

  // ============================================================
  // AC-21: BL-042 spec に「BL-070 で逆転」注釈 1 行が追記
  // ============================================================
  /**
   * シナリオ AC-21:
   *   Given docs/developer/features/task-card-actions/spec.md を開いた
   *   When  ファイル本文を観察する
   *   Then  「BL-070 (inline-edit-all-cards) で逆転」または等価表現を含む行が少なくとも 1 行存在する
   */
  describe("AC-21: BL-042 spec に「BL-070 で逆転」注釈 1 行が追記されている", () => {
    it("task-card-actions/spec.md に BL-070 への参照が 1 か所以上存在する", () => {
      const src = readFileSync(taskCardActionsSpecPath, "utf-8");
      // 「BL-070」「inline-edit-all-cards」「で逆転」のいずれかを含む行を期待する.
      const hasReverseNote =
        /BL-070/.test(src) || /inline-edit-all-cards/.test(src) || /で逆転/.test(src);
      expect(
        hasReverseNote,
        "task-card-actions/spec.md に BL-070 への注釈が無い (AC-21 / R-001 違反)",
      ).toBe(true);
    });
  });

  // ============================================================
  // AC-23: tokens.css / Repository / Mutation の API が無改修
  // ============================================================
  /**
   * シナリオ AC-23:
   *   Given 本 BL の実装がマージされた
   *   When  tokens.css / project-repository.ts / routine-repository.ts / task-repository.ts を観察する
   *   Then  主要シンボル (interface / class) に差分が無い
   */
  describe("AC-23: tokens.css / Repository / Mutation の API が無改修", () => {
    it("tokens.css が存在する", () => {
      const css = readFileSync(tokensCssPath, "utf-8");
      expect(css.length, "tokens.css が空").toBeGreaterThan(0);
    });

    it("project-repository.ts に主要シンボル (ProjectRepository / Project / ProjectConflictError) が残っている", () => {
      const src = readFileSync(projectRepositoryTsPath, "utf-8");
      expect(src).toMatch(/export\s+interface\s+ProjectRepository/);
      expect(src).toMatch(/export\s+interface\s+Project\b/);
      expect(src).toMatch(/export\s+class\s+ProjectConflictError/);
    });

    it("routine-repository.ts に主要シンボル (WebRoutineRepository / WebRoutine / RoutineConflictError) が残っている", () => {
      const src = readFileSync(routineRepositoryTsPath, "utf-8");
      expect(src).toMatch(/export\s+interface\s+WebRoutineRepository/);
      expect(src).toMatch(/export\s+interface\s+WebRoutine\b/);
      expect(src).toMatch(/export\s+class\s+RoutineConflictError/);
    });

    it("task-repository.ts に主要シンボル (TaskRepository / OptimisticLockError) が残っている", () => {
      const src = readFileSync(taskRepositoryTsPath, "utf-8");
      expect(src).toMatch(/export\s+interface\s+TaskRepository/);
      expect(src).toMatch(/export\s+class\s+OptimisticLockError/);
    });
  });

  // ============================================================
  // 補強: 各 card 系コンポーネントの新 API 適用確認 (= 旧 prop 撤去 / 新 prop 追加 / ソース直読み)
  // ============================================================

  /**
   * 補強: 旧 prop / 新 prop の存在確認.
   * AC-12 / AC-13 と同じ流儀で card 本体側の API 変更を直接 assert する.
   */
  describe("補強: TaskCard / ProjectCard / RoutineCard の API 変更がソース上に反映されている", () => {
    it("project-card.tsx から isEditing / editingName / onSaveEdit が撤去されている", () => {
      const src = readFileSync(projectCardTsxPath, "utf-8");
      expect(src, "isEditing が残存").not.toMatch(/\bisEditing\b/);
      expect(src, "editingName が残存").not.toMatch(/\beditingName\b/);
      expect(src, "onSaveEdit が残存").not.toMatch(/\bonSaveEdit\b/);
      expect(src, "onStartEdit が残存").not.toMatch(/\bonStartEdit\b/);
      expect(src, "onCancelEdit が残存").not.toMatch(/\bonCancelEdit\b/);
    });

    it("project-card.tsx に onNameBlur が追加されている", () => {
      const src = readFileSync(projectCardTsxPath, "utf-8");
      expect(src, "onNameBlur が無い").toMatch(/\bonNameBlur\b/);
    });

    it("routine-card.tsx から isEditing / editingName / editingDaysOfWeek / editingDefaultPriority / onSaveEdit が撤去されている", () => {
      const src = readFileSync(routineCardTsxPath, "utf-8");
      expect(src, "isEditing が残存").not.toMatch(/\bisEditing\b/);
      expect(src, "editingName が残存").not.toMatch(/\beditingName\b/);
      expect(src, "editingDaysOfWeek が残存").not.toMatch(/\beditingDaysOfWeek\b/);
      expect(src, "editingDefaultPriority が残存").not.toMatch(/\beditingDefaultPriority\b/);
      expect(src, "onSaveEdit が残存").not.toMatch(/\bonSaveEdit\b/);
      expect(src, "onStartEdit が残存").not.toMatch(/\bonStartEdit\b/);
      expect(src, "onCancelEdit が残存").not.toMatch(/\bonCancelEdit\b/);
    });

    it("routine-card.tsx に onNameBlur / onDaysOfWeekChange / onDefaultPriorityChange が追加されている", () => {
      const src = readFileSync(routineCardTsxPath, "utf-8");
      expect(src, "onNameBlur が無い").toMatch(/\bonNameBlur\b/);
      expect(src, "onDaysOfWeekChange が無い").toMatch(/\bonDaysOfWeekChange\b/);
      expect(src, "onDefaultPriorityChange が無い").toMatch(/\bonDefaultPriorityChange\b/);
    });

    it("task-card.tsx に onNameBlur が追加されている", () => {
      const src = readFileSync(taskCardTsxPath, "utf-8");
      expect(src, "task-card.tsx に onNameBlur が無い").toMatch(/\bonNameBlur\b/);
    });
  });

  // ============================================================
  // 補強: 起票カードに blur 系 prop が混入していない (= 無改修確認)
  // ============================================================

  describe("補強: 起票カード TaskFormCard / ProjectFormCard / RoutineFormCard に onNameBlur 系が混入していない (= 無改修)", () => {
    it("task-form-card.tsx に onNameBlur が無い", () => {
      const src = readFileSync(taskFormCardTsxPath, "utf-8");
      expect(src, "task-form-card.tsx に onNameBlur が混入 (D-006 違反)").not.toMatch(
        /\bonNameBlur\b/,
      );
    });

    it("project-form-card.tsx に onNameBlur が無い", () => {
      const src = readFileSync(projectFormCardTsxPath, "utf-8");
      expect(src, "project-form-card.tsx に onNameBlur が混入 (D-006 違反)").not.toMatch(
        /\bonNameBlur\b/,
      );
    });

    it("routine-form-card.tsx に onNameBlur が無い", () => {
      const src = readFileSync(routineFormCardTsxPath, "utf-8");
      expect(src, "routine-form-card.tsx に onNameBlur が混入 (D-006 違反)").not.toMatch(
        /\bonNameBlur\b/,
      );
    });
  });

  // ============================================================
  // 補強: today-view / tomorrow-view / focus-view で TaskCard の name input が DOM 上に存在する
  // ============================================================

  describe("補強: 統合スモーク (today / tomorrow / focus で TaskCard が name input を含む)", () => {
    it("today-view で TaskCard の name input が DOM 上に存在する", async () => {
      const T1 = makeTask({ id: "t-1", name: "牛乳", dueDate: "today" });
      const repo = makeMockTaskRepository([T1]);
      const projectRepo = makeMockProjectRepository([]);
      renderWithQueryClient(<TodayView repository={repo} projectRepository={projectRepo} />);
      const input = (await screen.findByDisplayValue("牛乳")) as HTMLInputElement;
      expect(input.tagName.toLowerCase()).toBe("input");
    });

    it("tomorrow-view で TaskCard の name input が DOM 上に存在する", async () => {
      const T1 = makeTask({ id: "t-1", name: "明日タスク", dueDate: "tomorrow" });
      const repo = makeMockTaskRepository([T1]);
      const projectRepo = makeMockProjectRepository([]);
      renderWithQueryClient(<TomorrowView repository={repo} projectRepository={projectRepo} />);
      const input = (await screen.findByDisplayValue("明日タスク")) as HTMLInputElement;
      expect(input.tagName.toLowerCase()).toBe("input");
    });

    it("focus-view で TaskCard の name input が DOM 上に存在する (actionSet=minimal でも)", async () => {
      const T1 = makeTask({ id: "t-1", name: "フォーカスタスク", dueDate: "today" });
      const repo = makeMockTaskRepository([T1], {
        initialFocus: {
          id: "singleton",
          currentTaskId: "t-1",
          version: 1,
          updatedAt: NOW,
        },
      });
      const projectRepo = makeMockProjectRepository([]);
      renderWithQueryClient(<FocusView repository={repo} projectRepository={projectRepo} />);
      const input = (await screen.findByDisplayValue("フォーカスタスク")) as HTMLInputElement;
      expect(input.tagName.toLowerCase()).toBe("input");
    });
  });
});

// 未使用 import のサプレス (vitest が静的解析時に未使用扱いしないよう参照を残す).
void userEvent;
void within;
