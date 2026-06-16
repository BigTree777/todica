import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
/**
 * 構造アサーション単体テスト: 今日/明日ビューの共通レイアウト化 (BL-051 / unified-day-view).
 *
 * 仕様参照:
 *   docs/developer/features/unified-day-view/spec.md AC-1 〜 AC-10
 *   docs/developer/features/unified-day-view/plan.md §「テスト方針」
 *   docs/developer/features/unified-day-view/tasks.md T-006
 *
 * 本ファイルは TDD の "red" を作るためのテストである.
 *   - 既存 today-view.tsx は `<main>` (className 無) ルート, tomorrow-view.tsx は
 *     `<section className="tomorrow-view">` ルートで, どちらも `day-view__*` クラスを
 *     持たない. よって本ファイルの全テストは red になる.
 *   - implementer が BL-051 の実装 (plan §「day-view.css の最小定義」+ 各 view の
 *     JSX 改修) を行うことで green 化する.
 *
 * 担保する受け入れ基準:
 *   AC-1 : ルートが `<main class="day-view">`, tomorrow-view クラスが DOM に無い.
 *   AC-2 : `<header class="day-view__header">` が 1 段目に存在. today は h1 + completion-count,
 *          tomorrow は h1 のみ.
 *   AC-3 : focusedTask 有りの today で 子要素順序 = [header, section[card+card--focus], form, ul].
 *   AC-4 : focusedTask 無しの today で 「現在のタスク」 region が無く 順序 = [header, form, ul].
 *   AC-5 (BL-059 追従): 各 `<form>` が <TaskFormCard> 経由で task-card / task-card--form を持つ.
 *          旧 day-view__form / tomorrow-view__form クラスは付かない.
 *   AC-6 (BL-059 追従): 各 `<ul>` に day-view__list, 各 `<li>` に task-card. 旧 day-view__card 無.
 *   AC-7 : `web/src/ui/day-view/day-view.css` が存在し `.day-view__list` 等を含む.
 *          各 view の tsx に `import "../day-view/day-view.css";` がある.
 *   AC-9 補強: `<main>` がページ内 1 個のみ.
 *   AC-10: tomorrow-view.css ファイルが削除されている. 描画後の DOM に
 *          `tomorrow-view__` クラス文字列が含まれない.
 *
 * 担保しない受け入れ基準 (別経路):
 *   AC-8 : 機能差分なし → 既存 today-view.test.tsx / tomorrow-view.test.tsx が green を維持.
 *   AC-9 全部 (axe スキャン) → e2e/a11y.spec.ts.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import type { Task } from "@todica/domain/task";
import type { ReactNode } from "react";
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
import { TodayView } from "../src/ui/today-view/today-view.js";
import { TomorrowView } from "../src/ui/tomorrow-view/tomorrow-view.js";

const NOW = "2026-06-11T09:00:00.000Z";

// ============================================================
// TanStack Query test client / render helper.
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

/**
 * BL-104 (floating-create-button) 追従:
 *   day-view のレイアウト (header → form → ul) を検証する都合上,
 *   form が描画されている状態 (= `?create=1` 付き URL) で render する.
 *   path 自体は構造アサーションに影響しないので /today?create=1 で十分.
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
// 共通モックファクトリ (today-view.test.tsx / tomorrow-view.test.tsx と同形).
// 本ファイルは構造アサーションが目的なので mock は最小限.
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

function makeMockProjectRepository(initial: Project[] = []): ProjectRepository {
  const state = [...initial];
  return {
    list: vi.fn(async () => [...state]),
    create: vi.fn(async (cmd: { id: string; name: string }) => {
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
      throw new Error("not used");
    }),
    delete: vi.fn(async () => {
      /* not used */
    }),
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
  const sortByPriority = (tasks: Task[]) =>
    [...tasks].sort((a, b) => {
      const p = (PRIORITY_ORDER[a.priority] ?? 99) - (PRIORITY_ORDER[b.priority] ?? 99);
      if (p !== 0) return p;
      const c = a.createdAt.localeCompare(b.createdAt);
      if (c !== 0) return c;
      return a.id.localeCompare(b.id);
    });
  return {
    list: vi.fn(async (filter?: { dueDate?: "today" | "tomorrow" }) => {
      const filtered = state.filter((t) => {
        if (t.trashedAt !== null) return false;
        if (filter?.dueDate && t.dueDate !== filter.dueDate) return false;
        return true;
      });
      return sortByPriority(filtered);
    }),
    today: vi.fn(async () => {
      const filtered = sortByPriority(
        state.filter((t) => t.dueDate === "today" && t.trashedAt === null),
      );
      return {
        tasks: filtered,
        nextTaskId: filtered[0]?.id ?? null,
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
      const next: Task = {
        ...prev,
        trashedAt: NOW,
        trashedReason: "completed",
        version: (prev.version ?? 0) + 1,
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
// 補助: 「実 child 要素」(コメントやテキストノードを除外した Element 配列) を取得する.
// React の {focusedTask && ...} 等は false 時に nothing をレンダリングするので,
// children を Element だけで観察すれば 順序検証は安定する.
// ============================================================

function listElementChildren(parent: Element): Element[] {
  return Array.from(parent.children) as Element[];
}

// ============================================================
// AC-1 / AC-9 補強: ルート要素は <main class="day-view">.
// ============================================================

describe("BL-051 / unified-day-view: AC-1 (ルート要素の統一)", () => {
  it("/today のルートが <main> 要素で class に day-view を含む", async () => {
    const repo = makeMockTaskRepository([
      makeTask({ id: "t1", name: "牛乳", dueDate: "today", version: 1 }),
    ]);
    const { container } = renderWithQueryClient(
      <TodayView repository={repo} projectRepository={makeMockProjectRepository()} />,
    );

    // 描画完了を待つ.
    await screen.findByDisplayValue("牛乳");

    const mainRoot = container.querySelector("main.day-view");
    expect(mainRoot).not.toBeNull();
  });

  it("/tomorrow のルートが <main> 要素で class に day-view を含む (旧 <section class='tomorrow-view'> から変更)", async () => {
    const repo = makeMockTaskRepository([
      makeTask({ id: "t1", name: "明日タスク", dueDate: "tomorrow", version: 1 }),
    ]);
    const { container } = renderWithQueryClient(
      <TomorrowView repository={repo} projectRepository={makeMockProjectRepository()} />,
    );

    await screen.findByDisplayValue("明日タスク");

    const mainRoot = container.querySelector("main.day-view");
    expect(mainRoot).not.toBeNull();

    // 旧 <section class="tomorrow-view"> は DOM に存在しない (D-001 / D-006).
    expect(container.querySelector("section.tomorrow-view")).toBeNull();
    expect(container.querySelector(".tomorrow-view")).toBeNull();
  });

  it("AC-9 補強: /today で <main> がページ内に 1 個だけ存在する (AppShell の <main> 重複なし)", async () => {
    const repo = makeMockTaskRepository([
      makeTask({ id: "t1", name: "x", dueDate: "today", version: 1 }),
    ]);
    const { container } = renderWithQueryClient(
      <TodayView repository={repo} projectRepository={makeMockProjectRepository()} />,
    );

    await screen.findByDisplayValue("x");
    expect(container.querySelectorAll("main")).toHaveLength(1);
  });

  it("AC-9 補強: /tomorrow で <main> がページ内に 1 個だけ存在する", async () => {
    const repo = makeMockTaskRepository([
      makeTask({ id: "t1", name: "x", dueDate: "tomorrow", version: 1 }),
    ]);
    const { container } = renderWithQueryClient(
      <TomorrowView repository={repo} projectRepository={makeMockProjectRepository()} />,
    );

    await screen.findByDisplayValue("x");
    expect(container.querySelectorAll("main")).toHaveLength(1);
  });
});

// ============================================================
// AC-2: header 構造の統一.
// ============================================================

describe("BL-051 / unified-day-view: AC-2 (1 段目 header の統一)", () => {
  it("/today 1 段目に <header class='day-view__header'> があり, h1 と today-view__completion-count を含む", async () => {
    const repo = makeMockTaskRepository([
      makeTask({ id: "t1", name: "x", dueDate: "today", version: 1 }),
    ]);
    const { container } = renderWithQueryClient(
      <TodayView repository={repo} projectRepository={makeMockProjectRepository()} />,
    );

    await screen.findByDisplayValue("x");

    const mainRoot = container.querySelector("main.day-view");
    expect(mainRoot).not.toBeNull();

    // 1 段目 = mainRoot の最初の Element child が <header class="day-view__header">.
    const first = listElementChildren(mainRoot!)[0];
    expect(first).not.toBeUndefined();
    expect(first!.tagName.toLowerCase()).toBe("header");
    expect(first!.classList.contains("day-view__header")).toBe(true);

    // header 内に h1 (テキスト "今日") + completion-count <span> が含まれる.
    const h1 = first!.querySelector("h1");
    expect(h1).not.toBeNull();
    expect(h1!.textContent ?? "").toContain("今日");
    expect(first!.querySelector(".today-view__completion-count")).not.toBeNull();
  });

  it("/tomorrow 1 段目に <header class='day-view__header'> があり, h1 ' 明日のタスク' のみを含む", async () => {
    const repo = makeMockTaskRepository([
      makeTask({ id: "t1", name: "x", dueDate: "tomorrow", version: 1 }),
    ]);
    const { container } = renderWithQueryClient(
      <TomorrowView repository={repo} projectRepository={makeMockProjectRepository()} />,
    );

    await screen.findByDisplayValue("x");

    const mainRoot = container.querySelector("main.day-view");
    expect(mainRoot).not.toBeNull();

    const first = listElementChildren(mainRoot!)[0];
    expect(first).not.toBeUndefined();
    expect(first!.tagName.toLowerCase()).toBe("header");
    expect(first!.classList.contains("day-view__header")).toBe(true);

    const h1 = first!.querySelector("h1");
    expect(h1).not.toBeNull();
    expect(h1!.textContent ?? "").toContain("明日のタスク");

    // tomorrow には today-view__completion-count 等の補助情報は存在しない.
    expect(first!.querySelector(".today-view__completion-count")).toBeNull();
  });
});

// ============================================================
// AC-3: 「現在のタスク」セクションが起票フォームより前.
// ============================================================

describe("BL-051 / unified-day-view: AC-3 (「現在のタスク」セクションの位置)", () => {
  it("focusedTask 有り の /today で 子要素順序が [header, section(現在のタスク), form, ul] で section に task-card と task-card--focus 両方を含む (BL-059 追従)", async () => {
    // 1 件だけ存在 → 暗黙フォールバックで「現在のタスク」が必ず存在する.
    const repo = makeMockTaskRepository([
      makeTask({ id: "t1", name: "x", dueDate: "today", version: 1 }),
    ]);
    const { container } = renderWithQueryClient(
      <TodayView repository={repo} projectRepository={makeMockProjectRepository()} />,
    );

    await screen.findByDisplayValue("x");

    const mainRoot = container.querySelector("main.day-view");
    expect(mainRoot).not.toBeNull();

    // 子要素を順に並べる. ConflictDialog 等の trailing 要素は許容するため
    // 先頭 4 つの並びだけ検証する (REQ-3 / D-002).
    const children = listElementChildren(mainRoot!);
    expect(children.length).toBeGreaterThanOrEqual(4);

    expect(children[0]!.tagName.toLowerCase()).toBe("header");
    expect(children[0]!.classList.contains("day-view__header")).toBe(true);

    // 2 番目 = section[aria-label="現在のタスク"] かつ class に task-card / --focus.
    // BL-059 で <h2>現在のタスク</h2> は撤去 / クラスも task-card 系に置換.
    const second = children[1]!;
    expect(second.tagName.toLowerCase()).toBe("section");
    expect(second.getAttribute("aria-label")).toBe("現在のタスク");
    expect(second.classList.contains("task-card")).toBe(true);
    expect(second.classList.contains("task-card--focus")).toBe(true);

    // 3 番目 = form (起票フォーム).
    expect(children[2]!.tagName.toLowerCase()).toBe("form");
    expect(children[2]!.getAttribute("aria-label")).toBe("タスク起票フォーム");

    // 4 番目 = ul (一覧). 一覧自体は空 (= 強調セクションへ吸収) でも ul 要素は描画される.
    expect(children[3]!.tagName.toLowerCase()).toBe("ul");
  });
});

// ============================================================
// AC-4: タスク 0 件のとき 「現在のタスク」セクションは無く 順序が [header, form, ul].
// ============================================================

describe("BL-051 / unified-day-view: AC-4 (「現在のタスク」セクションは focusedTask 無のとき非描画)", () => {
  it("今日タスク 0 件の /today で 「現在のタスク」region が存在せず 子要素順序が [header, form, ul]", async () => {
    const repo = makeMockTaskRepository([]);
    const { container } = renderWithQueryClient(
      <TodayView repository={repo} projectRepository={makeMockProjectRepository()} />,
    );

    // 描画完了を待つ (h1 「今日」が出るまで).
    await screen.findByRole("heading", { name: "今日" });

    // 「現在のタスク」 region は存在しない (focusedTask が null のため非描画).
    expect(screen.queryByRole("region", { name: /現在のタスク/ })).toBeNull();

    const mainRoot = container.querySelector("main.day-view");
    expect(mainRoot).not.toBeNull();

    const children = listElementChildren(mainRoot!);
    // 先頭 3 要素 = [header, form, ul]. ConflictDialog 等が末尾に来ても先頭並びは確定.
    expect(children.length).toBeGreaterThanOrEqual(3);
    expect(children[0]!.tagName.toLowerCase()).toBe("header");
    expect(children[1]!.tagName.toLowerCase()).toBe("form");
    expect(children[2]!.tagName.toLowerCase()).toBe("ul");
  });
});

// ============================================================
// AC-5: <form> に day-view__form クラス.
// ============================================================

describe("BL-051 / unified-day-view: AC-5 (BL-059 追従 / 起票フォームに task-card)", () => {
  it("/today の <form aria-label='タスク起票フォーム'> の class に task-card と task-card--form を含み day-view__form / tomorrow-view__form を含まない (BL-059 追従)", async () => {
    const repo = makeMockTaskRepository([
      makeTask({ id: "t1", name: "x", dueDate: "today", version: 1 }),
    ]);
    renderWithQueryClient(
      <TodayView repository={repo} projectRepository={makeMockProjectRepository()} />,
    );

    await screen.findByDisplayValue("x");

    const form = screen.getByRole("form", { name: "タスク起票フォーム" });
    expect(form.classList.contains("task-card")).toBe(true);
    expect(form.classList.contains("task-card--form")).toBe(true);
    expect(form.classList.contains("day-view__form")).toBe(false);
    expect(form.classList.contains("tomorrow-view__form")).toBe(false);
  });

  it("/tomorrow の <form aria-label='明日のタスク起票フォーム'> の class に task-card と task-card--form を含み day-view__form / tomorrow-view__form を含まない (BL-059 追従)", async () => {
    const repo = makeMockTaskRepository([
      makeTask({ id: "t1", name: "x", dueDate: "tomorrow", version: 1 }),
    ]);
    renderWithQueryClient(
      <TomorrowView repository={repo} projectRepository={makeMockProjectRepository()} />,
    );

    await screen.findByDisplayValue("x");

    const form = screen.getByRole("form", { name: "明日のタスク起票フォーム" });
    expect(form.classList.contains("task-card")).toBe(true);
    expect(form.classList.contains("task-card--form")).toBe(true);
    expect(form.classList.contains("day-view__form")).toBe(false);
    expect(form.classList.contains("tomorrow-view__form")).toBe(false);
  });
});

// ============================================================
// AC-6: <ul> day-view__list / <li> day-view__card.
// ============================================================

describe("BL-051 / unified-day-view: AC-6 (BL-059 追従 / タスク一覧 ul / li の共通クラス)", () => {
  it("/today の <ul aria-label='タスク一覧'> に day-view__list, 各 <li> に task-card を含む (BL-059 追従)", async () => {
    // 「現在のタスク」セクションに吸われない通常リスト要素を確保するため,
    // currentTaskId をダミーに固定して全件を listitem に出す.
    const repo = makeMockTaskRepository(
      [
        makeTask({
          id: "task-A",
          name: "AAA",
          priority: "normal",
          dueDate: "today",
          createdAt: "2026-06-11T08:00:00.000Z",
          version: 1,
        }),
        makeTask({
          id: "task-B",
          name: "BBB",
          priority: "later",
          dueDate: "today",
          createdAt: "2026-06-11T08:00:01.000Z",
          version: 1,
        }),
      ],
      {
        initialFocus: {
          id: "singleton",
          // 存在しないタスク id を currentTaskId に置くと, focusedTask は
          // find().find なし → null. fallback は nextTaskId (= task-A) になり,
          // listitem からは task-A が消えてしまう.
          //
          // この AC は「listitem に day-view__card が付いている」を見たいだけなので,
          // currentTaskId を実在しない値 (= focusedId 計算で nextTaskId に fallback) に
          // するのではなく, あえて currentTaskId を fallback で先頭が出ない状態にする.
          // → currentTaskId は実在しない id にしておけば
          //   focusedId = nextTaskId だが focusedTask 計算で find が null になり listitem は全件出る.
          //   ※ today-view.tsx の focusedTask = tasks.find(...) ?? null 経路.
          currentTaskId: "nonexistent-id",
          version: 5,
          updatedAt: NOW,
        },
      },
    );
    renderWithQueryClient(
      <TodayView repository={repo} projectRepository={makeMockProjectRepository()} />,
    );

    await screen.findByDisplayValue("AAA");

    const ul = screen.getByRole("list", { name: "タスク一覧" });
    expect(ul.classList.contains("day-view__list")).toBe(true);

    const items = within(ul).getAllByRole("listitem");
    expect(items.length).toBeGreaterThan(0);
    for (const li of items) {
      expect(li.classList.contains("task-card")).toBe(true);
      // 旧 day-view__card / today 用クラスは付かない.
      expect(li.classList.contains("day-view__card")).toBe(false);
      expect(li.classList.contains("tomorrow-view__item")).toBe(false);
    }
  });

  it("/tomorrow の <ul aria-label='明日のタスク一覧'> に day-view__list, 各 <li> に task-card を含む (BL-059 追従 / 旧 tomorrow-view__list/__item は付かない)", async () => {
    const repo = makeMockTaskRepository([
      makeTask({
        id: "task-1",
        name: "明日タスク",
        dueDate: "tomorrow",
        version: 1,
      }),
    ]);
    renderWithQueryClient(
      <TomorrowView repository={repo} projectRepository={makeMockProjectRepository()} />,
    );

    await screen.findByDisplayValue("明日タスク");

    const ul = screen.getByRole("list", { name: "明日のタスク一覧" });
    expect(ul.classList.contains("day-view__list")).toBe(true);
    expect(ul.classList.contains("tomorrow-view__list")).toBe(false);

    const items = within(ul).getAllByRole("listitem");
    expect(items.length).toBeGreaterThan(0);
    for (const li of items) {
      expect(li.classList.contains("task-card")).toBe(true);
      expect(li.classList.contains("day-view__card")).toBe(false);
      expect(li.classList.contains("tomorrow-view__item")).toBe(false);
    }
  });
});

// ============================================================
// AC-7: day-view.css の存在と最低限の宣言, 各 view からの import.
// ============================================================

describe("BL-051 / unified-day-view: AC-7 (共通 CSS ファイル / 参照)", () => {
  const repoRoot = resolve(__dirname, "../..");
  const dayViewCssPath = resolve(repoRoot, "web/src/ui/day-view/day-view.css");
  const todayViewTsxPath = resolve(repoRoot, "web/src/ui/today-view/today-view.tsx");
  const tomorrowViewTsxPath = resolve(repoRoot, "web/src/ui/tomorrow-view/tomorrow-view.tsx");

  it("web/src/ui/day-view/day-view.css が存在する", () => {
    expect(existsSync(dayViewCssPath)).toBe(true);
  });

  it("day-view.css が REQ-7 の維持セレクタ (.day-view / .day-view__header / .day-view__list / .day-view__empty) を含む (BL-059 追従)", () => {
    // BL-059 で .day-view__form / .day-view__card 系セレクタは撤去され,
    // 責務は web/src/ui/task-card/task-card.css の `.task-card` 系に移譲された.
    // day-view.css に残るのは枠 / ヘッダ / 一覧 / 空状態 / chip の各セレクタのみ.
    expect(existsSync(dayViewCssPath)).toBe(true);
    const content = readFileSync(dayViewCssPath, "utf8");
    expect(content).toMatch(/\.day-view\b/);
    expect(content).toMatch(/\.day-view__header\b/);
    expect(content).toMatch(/\.day-view__list\b/);
    expect(content).toMatch(/\.day-view__empty\b/);
    expect(content).toMatch(/\.project-chip\b/);
  });

  it("today-view.tsx に '../day-view/day-view.css' の import がある", () => {
    const content = readFileSync(todayViewTsxPath, "utf8");
    expect(content).toMatch(/import\s+["']\.\.\/day-view\/day-view\.css["'];?/);
  });

  it("tomorrow-view.tsx に '../day-view/day-view.css' の import がある", () => {
    const content = readFileSync(tomorrowViewTsxPath, "utf8");
    expect(content).toMatch(/import\s+["']\.\.\/day-view\/day-view\.css["'];?/);
  });

  it("tomorrow-view.tsx から './tomorrow-view.css' の import が削除されている", () => {
    const content = readFileSync(tomorrowViewTsxPath, "utf8");
    expect(content).not.toMatch(/import\s+["']\.\/tomorrow-view\.css["'];?/);
  });
});

// ============================================================
// AC-10: tomorrow-view__ プレフィックスが web/src/ 配下から完全に消える / tomorrow-view.css が削除されている.
// ============================================================

describe("BL-051 / unified-day-view: AC-10 (旧 tomorrow-view 専用 CSS / クラスの撤去)", () => {
  const repoRoot = resolve(__dirname, "../..");
  const oldTomorrowCssPath = resolve(repoRoot, "web/src/ui/tomorrow-view/tomorrow-view.css");

  it("web/src/ui/tomorrow-view/tomorrow-view.css ファイルが削除されている", () => {
    expect(existsSync(oldTomorrowCssPath)).toBe(false);
  });

  it("/tomorrow の描画 DOM に tomorrow-view__ プレフィックスのクラスが含まれない", async () => {
    const repo = makeMockTaskRepository([
      makeTask({
        id: "task-1",
        name: "明日タスク",
        dueDate: "tomorrow",
        version: 1,
      }),
    ]);
    const { container } = renderWithQueryClient(
      <TomorrowView repository={repo} projectRepository={makeMockProjectRepository()} />,
    );

    await screen.findByDisplayValue("明日タスク");

    // outerHTML に tomorrow-view__ という文字列が登場しないことを確認.
    // (tomorrow-view__form / __list / __item / __empty / __item-body / __actions / __project / __name).
    expect(container.innerHTML).not.toMatch(/tomorrow-view__/);
  });

  it("/today の描画 DOM に tomorrow-view__ プレフィックスのクラスが含まれない (念のため)", async () => {
    const repo = makeMockTaskRepository([
      makeTask({ id: "t1", name: "x", dueDate: "today", version: 1 }),
    ]);
    const { container } = renderWithQueryClient(
      <TodayView repository={repo} projectRepository={makeMockProjectRepository()} />,
    );
    await screen.findByDisplayValue("x");
    expect(container.innerHTML).not.toMatch(/tomorrow-view__/);
  });
});

// ============================================================
// BL-105: completion-counter-emphasis / tomorrow への副作用ゼロの確認.
//
// 仕様参照:
//   docs/developer/features/completion-counter-emphasis/spec.md
//   §「配置 (REQ-1 / REQ-5 / REQ-6)」シナリオ「tomorrow header には today 専用 modifier
//   が付かない」.
//
// 本 describe は TDD の "red" を作るためのテスト群.
//   - 本 BL では today-view 側に modifier "day-view__header--today" を新規付与する.
//   - tomorrow-view は同じ共通 CSS クラス ".day-view__header" を共有しているため,
//     誤って共通 CSS や tomorrow-view にも modifier が混入していないことを担保する.
//   - 現状 tomorrow-view.tsx は <header className="day-view__header"> のまま
//     modifier を付けていないため, 本テストは現時点では既に green になる
//     (= 副作用ゼロの回帰ガード). 実装後も green を維持すること.
// ============================================================

describe("BL-105 / completion-counter-emphasis: tomorrow への副作用ゼロ", () => {
  it("/tomorrow の <header> は class に 'day-view__header' を含み, 'day-view__header--today' modifier を **含まない**", async () => {
    // spec.md §「配置」:
    //   Given ユーザーが明日のタスクビュー（/tomorrow）を開いた
    //   When  最初の <header> 要素を観察する
    //   Then  class に "day-view__header" を含む
    //   And   class に "day-view__header--today" を **含まない**
    const repo = makeMockTaskRepository([
      makeTask({ id: "t1", name: "明日タスク", dueDate: "tomorrow", version: 1 }),
    ]);
    const { container } = renderWithQueryClient(
      <TomorrowView repository={repo} projectRepository={makeMockProjectRepository()} />,
    );

    await screen.findByDisplayValue("明日タスク");

    const mainRoot = container.querySelector("main.day-view");
    expect(mainRoot).not.toBeNull();

    const first = listElementChildren(mainRoot!)[0];
    expect(first).not.toBeUndefined();
    expect(first!.tagName.toLowerCase()).toBe("header");

    // ベースクラスは共通 (BL-051 / AC-2 互換).
    expect(first!.classList.contains("day-view__header")).toBe(true);
    // today 専用 modifier は tomorrow には付かない (= 共通 CSS への漏れ込みなし).
    expect(first!.classList.contains("day-view__header--today")).toBe(false);
  });

  it("/today の <header> は 'day-view__header--today' modifier を含む (BL-105 本体. red になることで対比ガードが効く)", async () => {
    // 本 it は today-view 側の本テスト (today-view.test.tsx の BL-105 describe) と
    // 重複するが, unified-day-view.test.tsx で today と tomorrow の対比を 1 ファイル内に
    // 並べておくことで「今後 tomorrow にも誤って modifier が付与された場合に, 上の
    // tomorrow テストだけが green を維持しないようにする」という相互チェックが効く.
    const repo = makeMockTaskRepository([
      makeTask({ id: "t1", name: "今日タスク", dueDate: "today", version: 1 }),
    ]);
    const { container } = renderWithQueryClient(
      <TodayView repository={repo} projectRepository={makeMockProjectRepository()} />,
    );

    await screen.findByDisplayValue("今日タスク");

    const mainRoot = container.querySelector("main.day-view");
    expect(mainRoot).not.toBeNull();

    const first = listElementChildren(mainRoot!)[0];
    expect(first).not.toBeUndefined();
    expect(first!.tagName.toLowerCase()).toBe("header");
    expect(first!.classList.contains("day-view__header")).toBe(true);
    expect(first!.classList.contains("day-view__header--today")).toBe(true);
  });
});
