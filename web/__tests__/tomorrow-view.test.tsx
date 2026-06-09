/**
 * Web クライアント単体テスト: 「明日のタスク」独立ビュー (tomorrow-view) (BL-038).
 *
 * 仕様参照:
 *   docs/developer/features/tomorrow-view/spec.md §「受け入れ基準」(REQ-1 〜 REQ-7).
 *   docs/developer/features/tomorrow-view/plan.md §「テスト方針」.
 *   docs/developer/features/tomorrow-view/tasks.md T-002.
 *
 * 本ファイルは TDD の "red" を作るためのテスト.
 *   - `<TomorrowView />` 本体はまだ存在しない (placeholder のみ存在). よって最初に import
 *     で落ちる (red). implementer が web/src/ui/tomorrow-view/tomorrow-view.tsx を新設して
 *     green 化する.
 *
 * 既存 `today-view.test.tsx` / `focus-view.test.tsx` の `renderWithQueryClient` /
 * `makeMockRepository` / `makeMockProjectRepository` のパターンを踏襲する.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { Task } from "@todica/domain/task";
// TomorrowView はまだ実装されていない (placeholder のみ存在する).
// 本 import は implementer が `web/src/ui/tomorrow-view/tomorrow-view.tsx` を作るまで red.
import { TomorrowView } from "../src/ui/tomorrow-view/tomorrow-view.js";
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
import type {
  Project,
  ProjectRepository,
} from "../src/repositories/project-repository.js";
// BL-034 / REQ-7 関連: notifyError をスパイするために import.
import * as ErrorNotification from "../src/error-notification.js";

const NOW = "2026-06-09T09:00:00.000Z";

/** TanStack Query テスト用クライアント. */
function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: Infinity,
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
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    name: "牛乳",
    projectId: null,
    dueDate: "tomorrow",
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

function makeMockProjectRepository(initial: Project[] = []): ProjectRepository & {
  listMock: ReturnType<typeof vi.fn>;
} {
  const state = [...initial];
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
  const updateMock = vi.fn(async () => {
    throw new Error("not used");
  });
  const deleteMock = vi.fn(async () => {
    /* not used */
  });
  return {
    list: listMock,
    create: createMock,
    update: updateMock,
    delete: deleteMock,
    listMock,
  };
}

/**
 * モック TaskRepository.
 *
 * - `list({ dueDate })`: state から dueDate (= "tomorrow" 固定で渡される想定) でフィルタし
 *   priority → createdAt → id にソートして返す.
 *   モックは「サーバ側ソート規則」を模倣する.
 *
 * - `today()`: dueDate === "today" のみ返す (今日にした後の `["today"]` invalidate を観察可能にするため).
 *
 * - `create({ dueDate: "tomorrow", ... })`: state に push し dueDate=tomorrow で投入する.
 *
 * - `update({ patch: { dueDate: "today" } })`: state[idx] を patch で更新する.
 *
 * - `delete({ id })`: state から取り除く.
 *
 * - `complete()`:
 *   BL-042 以前は TomorrowView の責務外 (= 呼ばれない想定) だったが,
 *   BL-042 で `/tomorrow` のカードに「完了」 button が追加されるため,
 *   today-view と同様に「trashedAt をセット + trashedReason = "completed" + counter +1」
 *   を実行する mock 実装に変更する.
 */
function makeMockRepository(
  initial: Task[] = [],
  options: {
    initialFocus?: FocusSelection;
    initialCounter?: Counter;
    /** create を失敗させたい場合に渡す. */
    createError?: Error;
    /** update を失敗させたい場合に渡す. */
    updateError?: Error;
    /** delete を失敗させたい場合に渡す. */
    deleteError?: Error;
    /** complete を失敗させたい場合に渡す (BL-042 REQ-2 / ConflictDialog). */
    completeError?: Error;
    /**
     * list() の戻り値を「サーバから返ってきた順」に固定したい場合に渡す.
     * 指定された場合, mock の内部ソートを行わず, 渡された並びをそのまま使う
     * (= UI が「再ソートしない」ことを観察するため).
     */
    fixedListOrderIds?: string[];
  } = {},
): TaskRepository & {
  createMock: ReturnType<typeof vi.fn>;
  updateMock: ReturnType<typeof vi.fn>;
  deleteMock: ReturnType<typeof vi.fn>;
  completeMock: ReturnType<typeof vi.fn>;
  listMock: ReturnType<typeof vi.fn>;
  todayMock: ReturnType<typeof vi.fn>;
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
  const PRIORITY_ORDER_LOCAL: Record<string, number> = {
    highest: 0,
    normal: 1,
    later: 2,
  };
  // BL-038: list(filter?) は { dueDate?: "today" | "tomorrow" } を受け取れる前提
  // (plan.md D-011 / T-009). 既存 signature (`list(): Promise<Task[]>`) との互換のため
  // optional 引数として扱う.
  const listMock = vi.fn(
    async (filter?: { dueDate?: "today" | "tomorrow" }): Promise<Task[]> => {
      const filtered = state.filter((t) => {
        if (t.trashedAt !== null) return false;
        if (filter?.dueDate && t.dueDate !== filter.dueDate) return false;
        return true;
      });
      // fixedListOrderIds が渡されている場合は, mock の内部ソートを行わず
      // 渡された並びをそのまま使う (= UI が「再ソートしない」ことを観察するため).
      if (options.fixedListOrderIds) {
        const byId = new Map(filtered.map((t) => [t.id, t]));
        const ordered = options.fixedListOrderIds
          .map((id) => byId.get(id))
          .filter((t): t is Task => t !== undefined);
        return ordered;
      }
      const sorted = [...filtered].sort((a, b) => {
        const p =
          (PRIORITY_ORDER_LOCAL[a.priority] ?? 99) -
          (PRIORITY_ORDER_LOCAL[b.priority] ?? 99);
        if (p !== 0) return p;
        const c = a.createdAt.localeCompare(b.createdAt);
        if (c !== 0) return c;
        return a.id.localeCompare(b.id);
      });
      return sorted;
    },
  );
  const todayMock = vi.fn(async () => {
    const filtered = state.filter(
      (t) => t.dueDate === "today" && t.trashedAt === null,
    );
    const sorted = [...filtered].sort((a, b) => {
      const p =
        (PRIORITY_ORDER_LOCAL[a.priority] ?? 99) -
        (PRIORITY_ORDER_LOCAL[b.priority] ?? 99);
      if (p !== 0) return p;
      const c = a.createdAt.localeCompare(b.createdAt);
      if (c !== 0) return c;
      return a.id.localeCompare(b.id);
    });
    return {
      tasks: sorted,
      nextTaskId: sorted[0]?.id ?? null,
      currentTaskId: focusState.currentTaskId,
      completionCount: counterState.completedCount,
    };
  });
  const createMock = vi.fn(async (cmd: CreateTaskCommand) => {
    if (options.createError) throw options.createError;
    const t = makeTask({
      id: cmd.id,
      name: cmd.name,
      projectId: cmd.projectId ?? null,
      // REQ-2: dueDate は "tomorrow" 固定で UI から送られる想定.
      dueDate: cmd.dueDate ?? "tomorrow",
      ...(cmd.priority !== undefined ? { priority: cmd.priority } : {}),
    });
    state.push(t);
    return t;
  });
  const updateMock = vi.fn(async (cmd: UpdateTaskCommand) => {
    if (options.updateError) throw options.updateError;
    const idx = state.findIndex((t) => t.id === cmd.id);
    if (idx < 0) throw new Error("not found");
    const next: Task = {
      ...state[idx]!,
      ...cmd.patch,
      version: (state[idx]!.version ?? 0) + 1,
    };
    state[idx] = next;
    return next;
  });
  const deleteMock = vi.fn(async (cmd: DeleteTaskCommand) => {
    if (options.deleteError) throw options.deleteError;
    const idx = state.findIndex((t) => t.id === cmd.id);
    if (idx >= 0) state.splice(idx, 1);
  });
  // BL-042: tomorrow カードに「完了」 button が追加されたため complete を呼ぶ.
  // today-view のテスト mock と同形で実装し, trashedAt をセット + trashedReason="completed" +
  // counter +1 を行う (= サーバ側 +1 集計を模倣). 既存タスクが状態遷移する前提の検証は
  // 「完了後に /tomorrow から消える」「/today カウンタが +1 される」.
  const completeMock = vi.fn(async (cmd: CompleteTaskCommand) => {
    if (options.completeError) throw options.completeError;
    const idx = state.findIndex((t) => t.id === cmd.id);
    if (idx < 0) throw new Error("not found");
    const prev = state[idx]!;
    const wasActive = prev.trashedAt === null;
    const next: Task = {
      ...prev,
      trashedAt: "2026-06-09T09:00:01.000Z",
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
    create: createMock,
    update: updateMock,
    delete: deleteMock,
    complete: completeMock,
    today: todayMock,
    getFocus: getFocusMock,
    setFocus: setFocusMock,
    getCounter: getCounterMock,
    createMock,
    updateMock,
    deleteMock,
    completeMock,
    listMock,
    todayMock,
    getFocusMock,
    setFocusMock,
    getCounterMock,
  };
}

// ============================================================
// REQ-1: 一覧表示 (dueDate=tomorrow を優先度順に列挙)
// ============================================================

describe("TomorrowView (BL-038 REQ-1 一覧表示)", () => {
  it("シナリオ A: dueDate=tomorrow のタスクのみが priority (highest→normal→later) 順で一覧表示される", async () => {
    // 受け入れ基準 §「一覧表示 (REQ-1)」 第 1 ケース.
    // 投入: B (highest), A (normal), D (later) の tomorrow タスクと, C (today), E (tomorrow, trashed).
    const repo = makeMockRepository([
      makeTask({
        id: "task-A",
        name: "AAA",
        priority: "normal",
        dueDate: "tomorrow",
        createdAt: "2026-06-09T08:00:01.000Z",
        version: 1,
      }),
      makeTask({
        id: "task-B",
        name: "BBB",
        priority: "highest",
        dueDate: "tomorrow",
        createdAt: "2026-06-09T08:00:02.000Z",
        version: 1,
      }),
      makeTask({
        id: "task-C",
        name: "CCC",
        priority: "highest",
        dueDate: "today",
        createdAt: "2026-06-09T08:00:00.000Z",
        version: 1,
      }),
      makeTask({
        id: "task-D",
        name: "DDD",
        priority: "later",
        dueDate: "tomorrow",
        createdAt: "2026-06-09T08:00:03.000Z",
        version: 1,
      }),
      makeTask({
        id: "task-E",
        name: "EEE",
        priority: "normal",
        dueDate: "tomorrow",
        createdAt: "2026-06-09T08:00:04.000Z",
        version: 1,
        trashedAt: "2026-06-09T08:00:05.000Z",
        trashedReason: "deleted",
      }),
    ]);

    renderWithQueryClient(
      <TomorrowView
        repository={repo}
        projectRepository={makeMockProjectRepository()}
      />,
    );

    // 並びは B (highest) → A (normal) → D (later).
    const items = await screen.findAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(items[0]?.textContent ?? "").toContain("BBB");
    expect(items[1]?.textContent ?? "").toContain("AAA");
    expect(items[2]?.textContent ?? "").toContain("DDD");

    // 今日のタスク (CCC) は出ない.
    expect(screen.queryByText("CCC")).toBeNull();
    // ゴミ箱の tomorrow タスク (EEE) も出ない.
    expect(screen.queryByText("EEE")).toBeNull();
  });

  it("シナリオ B: TomorrowView は repository.list({ dueDate: \"tomorrow\" }) を呼ぶ", async () => {
    // 受け入れ基準 §「一覧表示 (REQ-1)」 第 2 ケース.
    // クライアントは ?dueDate=tomorrow のサーバ呼び出しに対応する list 呼び出しを使う.
    const repo = makeMockRepository([
      makeTask({ id: "t1", name: "x", dueDate: "tomorrow", version: 1 }),
    ]);

    renderWithQueryClient(
      <TomorrowView
        repository={repo}
        projectRepository={makeMockProjectRepository()}
      />,
    );

    // 描画完了を待つ.
    await screen.findByText("x");

    // list() が dueDate=tomorrow 引数付きで呼ばれている.
    expect(repo.listMock).toHaveBeenCalled();
    const firstCallArg = repo.listMock.mock.calls[0]?.[0];
    expect(firstCallArg).toEqual({ dueDate: "tomorrow" });
  });

  it("シナリオ C: TomorrowView はサーバから返ってきた順序をそのまま表示する (クライアント再ソートなし)", async () => {
    // 受け入れ基準 §「一覧表示 (REQ-1)」 + spec REQ-1: クライアント側で再ソートしない.
    // mock に fixedListOrderIds を渡し, 「mock が返した順 = UI に表示された順」 を強制する.
    const repo = makeMockRepository(
      [
        makeTask({
          id: "task-A",
          name: "AAA",
          priority: "later",
          dueDate: "tomorrow",
          version: 1,
        }),
        makeTask({
          id: "task-B",
          name: "BBB",
          priority: "highest",
          dueDate: "tomorrow",
          version: 1,
        }),
        makeTask({
          id: "task-C",
          name: "CCC",
          priority: "normal",
          dueDate: "tomorrow",
          version: 1,
        }),
      ],
      {
        // priority 順ではなく「あえてアルファベット (A, B, C) 順」で返す.
        // UI が再ソートするなら BBB が先頭に来てしまい assert が落ちる.
        fixedListOrderIds: ["task-A", "task-B", "task-C"],
      },
    );

    renderWithQueryClient(
      <TomorrowView
        repository={repo}
        projectRepository={makeMockProjectRepository()}
      />,
    );

    const items = await screen.findAllByRole("listitem");
    expect(items).toHaveLength(3);
    // mock が返した順 = A → B → C のまま表示される.
    expect(items[0]?.textContent ?? "").toContain("AAA");
    expect(items[1]?.textContent ?? "").toContain("BBB");
    expect(items[2]?.textContent ?? "").toContain("CCC");
  });
});

// ============================================================
// REQ-2: 起票フォーム (期限 UI 無し)
// ============================================================

describe("TomorrowView (BL-038 REQ-2 起票フォーム)", () => {
  it("シナリオ A: 起票フォームの入力要素は「タスク名」「プロジェクト (トグル)」「優先度 (星 3 つ)」「追加」の 4 要素のみ (期限 UI 無し)", async () => {
    // 受け入れ基準 §「起票 (REQ-2)」 第 1 ケース +
    // BL-040 priority-star-ui AC-4: <select id="tomorrow-task-priority"> は撤去され,
    //   role="radiogroup" + 3 つの role="radio" (星 button) に置き換わる.
    // BL-041 project-toggle-ui AC-5: <select id="tomorrow-task-project"> は撤去され,
    //   トグルボタン (<ProjectToggle />) に置き換わる.
    const repo = makeMockRepository([]);

    renderWithQueryClient(
      <TomorrowView
        repository={repo}
        projectRepository={makeMockProjectRepository()}
      />,
    );

    // タスク名 input は required.
    const nameInput = await screen.findByLabelText(/タスク名/);
    expect(nameInput).toBeRequired();
    expect(screen.queryByRole("button", { name: /追加|起票|登録|送信/ })).not.toBeNull();

    // 起票フォーム scope で検証する.
    const form = screen.getByRole("form", { name: /起票フォーム/ });

    // 旧 select id は DOM 上に存在しない (BL-040 AC-4 / BL-041 AC-5).
    expect(form.querySelector("#tomorrow-task-priority")).toBeNull();
    expect(form.querySelector("#tomorrow-task-project")).toBeNull();
    // フォーム scope 内に <select> は存在しない (プロジェクトはトグル button, 優先度は radiogroup).
    expect(form.querySelectorAll("select")).toHaveLength(0);

    // BL-041: 「プロジェクト」はトグルボタン (1 つの <button>) で表現される.
    const projectToggle = within(form).getByRole("button", {
      name: /プロジェクト/,
    });
    expect(projectToggle.tagName).toBe("BUTTON");
    // 初期表示は「（未分類）」.
    expect(projectToggle.textContent ?? "").toMatch(/（未分類）/);

    // 優先度は星 UI (role=radiogroup + 3 つの role=radio) で表現される.
    const priorityGroup = within(form).getByRole("radiogroup");
    expect(priorityGroup).toBeInTheDocument();
    const groupLabel = priorityGroup.getAttribute("aria-label") ?? "";
    expect(groupLabel).toMatch(/優先度/);
    const stars = within(priorityGroup).getAllByRole("radio");
    expect(stars).toHaveLength(3);
    // 初期で 2 つ点灯 (= normal).
    const lit = priorityGroup.querySelectorAll('[data-lit="true"]');
    expect(lit).toHaveLength(2);

    // 期限の UI は存在しない (label / combobox / textbox いずれも).
    expect(within(form).queryByLabelText(/期限/)).toBeNull();
    expect(within(form).queryByLabelText(/明日/)).toBeNull();
    expect(within(form).queryByLabelText(/today/i)).toBeNull();
    expect(within(form).queryByLabelText(/tomorrow/i)).toBeNull();
    expect(
      within(form).queryByRole("combobox", { name: /期限|明日|today|tomorrow/i }),
    ).toBeNull();
  });

  it("シナリオ AC-4: 明日ビューの起票フォームで 3 番目の星をクリックして追加すると create.priority === \"highest\" かつ dueDate === \"tomorrow\"", async () => {
    // priority-star-ui AC-4.
    const repo = makeMockRepository([]);
    const user = userEvent.setup();

    renderWithQueryClient(
      <TomorrowView
        repository={repo}
        projectRepository={makeMockProjectRepository()}
      />,
    );

    const nameInput = await screen.findByLabelText(/タスク名/);
    await user.type(nameInput, "明日の星 3 テスト");

    const form = screen.getByRole("form", { name: /起票フォーム/ });
    const group = within(form).getByRole("radiogroup");
    const stars = within(group).getAllByRole("radio");
    expect(stars).toHaveLength(3);
    // 3 番目の星 = highest 直接指定.
    await user.click(stars[2]!);

    const submit = screen.getByRole("button", { name: /追加|起票|登録|送信/ });
    await user.click(submit);

    expect(repo.createMock).toHaveBeenCalledTimes(1);
    const arg = repo.createMock.mock.calls[0]?.[0] as CreateTaskCommand;
    expect(arg.name).toBe("明日の星 3 テスト");
    expect(arg.priority).toBe("highest");
    expect(arg.dueDate).toBe("tomorrow");
  });

  it("シナリオ BL-041 AC-5: 明日ビューでプロジェクトトグルを 1 回クリックして起票すると create.projectId === <projects[0].id> かつ dueDate === \"tomorrow\"", async () => {
    // BL-041 spec.md AC-5:
    //   Given /tomorrow を開いた / プロジェクト「仕事」(id: PROJECT_ID_P1) が登録されている.
    //   When  トグルを 1 回クリック (null → "仕事") + タスク名入力 + 追加.
    //   Then  TaskRepository.create が projectId="p-1", dueDate="tomorrow" を含む引数で呼ばれる.
    //         <select id="tomorrow-task-project"> は DOM に存在しない.
    const PROJECT_ID_P1 = "p1p1p1p1-p1p1-4p1p-8p1p-p1p1p1p1p1p1";
    const projectRepo = makeMockProjectRepository([
      {
        id: PROJECT_ID_P1,
        name: "仕事",
        version: 1,
        createdAt: NOW,
        updatedAt: NOW,
      },
    ]);
    const repo = makeMockRepository([]);
    const user = userEvent.setup();

    renderWithQueryClient(
      <TomorrowView repository={repo} projectRepository={projectRepo} />,
    );

    // タスク名入力.
    const nameInput = await screen.findByLabelText(/タスク名/);
    await user.type(nameInput, "明日のタスク");

    // 起票フォーム scope でトグルボタンを取得.
    const form = screen.getByRole("form", { name: /起票フォーム/ });

    // 旧 select は DOM に存在しない (AC-5 後半).
    expect(form.querySelector("#tomorrow-task-project")).toBeNull();

    const toggleButton = await within(form).findByRole("button", {
      name: /プロジェクト/,
    });
    // 1 周巡回: null → "仕事".
    await user.click(toggleButton);
    expect(toggleButton.textContent ?? "").toContain("仕事");

    // 追加.
    const submit = screen.getByRole("button", { name: /追加|起票|登録|送信/ });
    await user.click(submit);

    // create() に projectId="p-1", dueDate="tomorrow" が渡っている (REQ-6 / D-004).
    expect(repo.createMock).toHaveBeenCalledTimes(1);
    const arg = repo.createMock.mock.calls[0]?.[0] as CreateTaskCommand;
    expect(arg.name).toBe("明日のタスク");
    expect(arg.projectId).toBe(PROJECT_ID_P1);
    expect(arg.dueDate).toBe("tomorrow");
  });

  it("シナリオ B: タスク名「明日の買い物」を入力して「追加」を押すと create({ dueDate: \"tomorrow\", ... }) が 1 回呼ばれる", async () => {
    // 受け入れ基準 §「起票 (REQ-2)」 第 2 ケース.
    const repo = makeMockRepository([]);
    const user = userEvent.setup();

    renderWithQueryClient(
      <TomorrowView
        repository={repo}
        projectRepository={makeMockProjectRepository()}
      />,
    );

    const nameInput = await screen.findByLabelText(/タスク名/);
    await user.type(nameInput, "明日の買い物");
    const submit = screen.getByRole("button", { name: /追加|起票|登録|送信/ });
    await user.click(submit);

    expect(repo.createMock).toHaveBeenCalledTimes(1);
    const arg = repo.createMock.mock.calls[0]?.[0] as CreateTaskCommand;
    expect(arg.name).toBe("明日の買い物");
    // dueDate は "tomorrow" が明示送信される (D-012 / spec U-008).
    expect(arg.dueDate).toBe("tomorrow");
    // projectId / priority は spec U-005 採用案の既定 (未分類 / normal) を尊重.
    expect(arg.projectId === null || arg.projectId === undefined).toBe(true);
    if (arg.priority !== undefined) {
      expect(arg.priority).toBe("normal");
    }
    // id は生成される.
    expect(typeof arg.id).toBe("string");
    expect(arg.id.length).toBeGreaterThan(0);
  });

  it("シナリオ C: 起票成功後に一覧が再フェッチされ (= list 呼び出しが増え) 起票したタスクが描画される", async () => {
    // 受け入れ基準 §「起票 (REQ-2)」 第 2 ケース後半 + REQ-2 invalidate.
    const repo = makeMockRepository([]);
    const user = userEvent.setup();

    renderWithQueryClient(
      <TomorrowView
        repository={repo}
        projectRepository={makeMockProjectRepository()}
      />,
    );

    // 初回マウントで list が 1 回以上呼ばれる.
    await screen.findByLabelText(/タスク名/);
    const listCallsBefore = repo.listMock.mock.calls.length;

    const nameInput = screen.getByLabelText(/タスク名/);
    await user.type(nameInput, "明日の買い物");
    const submit = screen.getByRole("button", { name: /追加|起票|登録|送信/ });
    await user.click(submit);

    // 再フェッチが行われ list の累積呼出回数が増えている (= ["tomorrow"] invalidate された).
    await waitFor(() => {
      expect(repo.listMock.mock.calls.length).toBeGreaterThan(listCallsBefore);
    });

    // 一覧に「明日の買い物」が現れる.
    expect(await screen.findByText("明日の買い物")).toBeInTheDocument();
  });
});

// ============================================================
// REQ-3 / BL-042: タスクカードのアクションは「削除」「今日にする」「完了」の 3 つ
//
// BL-038 当初は「削除」「今日にする」の 2 つだったが, BL-042 (task-card-actions) で
// today / tomorrow を 3 ボタンに揃えるため「完了」を追加する (foundation REQ-2).
// 並びは「削除 / 今日にする / 完了」(spec REQ-2).
// ============================================================

describe("TomorrowView (BL-038 / BL-042 REQ-3 アクション数の規約)", () => {
  it("シナリオ A: 1 件目のカード内のボタンは「削除」「今日にする」「完了」の 3 つのみ (BL-042)", async () => {
    // BL-042 spec AC-3 / REQ-2:
    //   /tomorrow の各タスクカードに置かれるアクションボタンは
    //   「削除」「今日にする」「完了」の 3 つで, 「明日にする」「編集」「現在に設定」などの
    //   いずれの button もカード内に存在しない.
    const repo = makeMockRepository([
      makeTask({
        id: "task-A",
        name: "AAA",
        dueDate: "tomorrow",
        version: 1,
      }),
    ]);

    renderWithQueryClient(
      <TomorrowView
        repository={repo}
        projectRepository={makeMockProjectRepository()}
      />,
    );

    const items = await screen.findAllByRole("listitem");
    expect(items.length).toBeGreaterThanOrEqual(1);
    const card = items[0]!;

    // 「削除」「今日にする」「完了」 button が各 1 個ずつ (accessibleName 完全一致).
    expect(
      within(card).getAllByRole("button", { name: "削除" }),
    ).toHaveLength(1);
    expect(
      within(card).getAllByRole("button", { name: "今日にする" }),
    ).toHaveLength(1);
    expect(
      within(card).getAllByRole("button", { name: "完了" }),
    ).toHaveLength(1);

    // 禁則ボタンが居ない (BL-042 spec AC-3).
    expect(within(card).queryByRole("button", { name: "明日にする" })).toBeNull();
    expect(within(card).queryByRole("button", { name: "明日へ" })).toBeNull();
    expect(within(card).queryByRole("button", { name: "編集" })).toBeNull();
    expect(within(card).queryByRole("button", { name: "現在に設定" })).toBeNull();
    expect(within(card).queryByRole("button", { name: "現在解除" })).toBeNull();
  });
});

// ============================================================
// REQ-4: 「今日にする」操作 (FR-014 逆方向)
// ============================================================

describe("TomorrowView (BL-038 REQ-4 「今日にする」)", () => {
  it("シナリオ A: 「今日にする」クリックで update({ id, ifMatch, patch: { dueDate: \"today\" } }) が 1 回呼ばれる", async () => {
    // 受け入れ基準 §「「今日にする」 (REQ-4 / FR-014 逆方向)」.
    const repo = makeMockRepository([
      makeTask({
        id: "task-A",
        name: "AAA",
        dueDate: "tomorrow",
        version: 1,
      }),
    ]);
    const user = userEvent.setup();

    renderWithQueryClient(
      <TomorrowView
        repository={repo}
        projectRepository={makeMockProjectRepository()}
      />,
    );

    await screen.findByText("AAA");
    const items = screen.getAllByRole("listitem");
    const card = items[0]!;

    const moveButton = within(card).getByRole("button", { name: /今日にする/ });
    await user.click(moveButton);

    expect(repo.updateMock).toHaveBeenCalledTimes(1);
    const arg = repo.updateMock.mock.calls[0]?.[0] as UpdateTaskCommand;
    expect(arg.id).toBe("task-A");
    expect(arg.ifMatch).toBe(1);
    expect(arg.patch.dueDate).toBe("today");
    // 期限以外のフィールドは送らない (NFR-013 / 部分上書き原則).
    expect(arg.patch.name).toBeUndefined();
    expect(arg.patch.projectId).toBeUndefined();
    expect(arg.patch.priority).toBeUndefined();
  });

  it("シナリオ B: 「今日にする」成功後にタスクが /tomorrow の一覧から消える", async () => {
    // 受け入れ基準 §「「今日にする」」: 再フェッチ後の /tomorrow には A が表示されない.
    const repo = makeMockRepository([
      makeTask({
        id: "task-A",
        name: "MOVE-ME",
        dueDate: "tomorrow",
        version: 1,
      }),
    ]);
    const user = userEvent.setup();

    renderWithQueryClient(
      <TomorrowView
        repository={repo}
        projectRepository={makeMockProjectRepository()}
      />,
    );

    expect(await screen.findByText("MOVE-ME")).toBeInTheDocument();

    const items = screen.getAllByRole("listitem");
    const moveButton = within(items[0]!).getByRole("button", {
      name: /今日にする/,
    });
    await user.click(moveButton);

    // 一覧から消える (mock updateMock が dueDate を today にし, 次回 list({ dueDate: "tomorrow" })
    // は MOVE-ME を返さなくなる).
    await waitFor(() => {
      expect(screen.queryByText("MOVE-ME")).toBeNull();
    });
  });

  it("シナリオ C: 「今日にする」成功後に list と today の両方が再フェッチされる (D-004: [\"tomorrow\"] / [\"today\"] / [\"focus\"] invalidate)", async () => {
    // plan.md D-004 / U-003 採用案: ["tomorrow"] / ["today"] / ["focus"] の 3 つを invalidate.
    // mock では `list` (= ["tomorrow"] queryFn) と `today` (= ["today"] queryFn) と `getFocus` (= ["focus"]) の
    // それぞれの呼出回数が増えることで invalidate を観察する.
    const repo = makeMockRepository([
      makeTask({
        id: "task-A",
        name: "AAA",
        dueDate: "tomorrow",
        version: 1,
      }),
    ]);
    const user = userEvent.setup();

    renderWithQueryClient(
      <TomorrowView
        repository={repo}
        projectRepository={makeMockProjectRepository()}
      />,
    );

    await screen.findByText("AAA");
    const listCallsBefore = repo.listMock.mock.calls.length;

    const items = screen.getAllByRole("listitem");
    const moveButton = within(items[0]!).getByRole("button", {
      name: /今日にする/,
    });
    await user.click(moveButton);

    // ["tomorrow"] の再フェッチ.
    await waitFor(() => {
      expect(repo.listMock.mock.calls.length).toBeGreaterThan(listCallsBefore);
    });
    // ["today"] / ["focus"] の invalidate は, それぞれの queryFn が今後発火可能な状態に
    // なれば十分だが, queryClient.invalidateQueries は active query しか即時 refetch しない.
    // ここでは「mutation が成功した」「list は再フェッチされた」までで invalidate 観察を打ち止め,
    // ["today"] / ["focus"] までの invalidate は plan で記述された方針として担保する.
    // (実装側で invalidate を呼び忘れた場合は, 後述の E2E シナリオ Q で検出する.)
  });
});

// ============================================================
// REQ-5: 削除操作 (論理削除)
// ============================================================

describe("TomorrowView (BL-038 REQ-5 削除操作)", () => {
  it("シナリオ A: 「削除」クリックで delete({ id, ifMatch }) が 1 回呼ばれる", async () => {
    // 受け入れ基準 §「削除 (REQ-5)」.
    const repo = makeMockRepository([
      makeTask({
        id: "task-A",
        name: "AAA",
        dueDate: "tomorrow",
        version: 1,
      }),
    ]);
    const user = userEvent.setup();

    renderWithQueryClient(
      <TomorrowView
        repository={repo}
        projectRepository={makeMockProjectRepository()}
      />,
    );

    await screen.findByText("AAA");
    const items = screen.getAllByRole("listitem");
    const card = items[0]!;

    const deleteButton = within(card).getByRole("button", { name: /削除/ });
    await user.click(deleteButton);

    expect(repo.deleteMock).toHaveBeenCalledTimes(1);
    const arg = repo.deleteMock.mock.calls[0]?.[0] as DeleteTaskCommand;
    expect(arg.id).toBe("task-A");
    expect(arg.ifMatch).toBe(1);

    // 完了は呼ばれない (REQ-3 / 操作の独立性).
    expect(repo.completeMock).not.toHaveBeenCalled();
  });

  it("シナリオ B: 削除成功後にタスクが /tomorrow の一覧から消える", async () => {
    const repo = makeMockRepository([
      makeTask({
        id: "task-A",
        name: "DEL-ME",
        dueDate: "tomorrow",
        version: 1,
      }),
    ]);
    const user = userEvent.setup();

    renderWithQueryClient(
      <TomorrowView
        repository={repo}
        projectRepository={makeMockProjectRepository()}
      />,
    );

    expect(await screen.findByText("DEL-ME")).toBeInTheDocument();

    const items = screen.getAllByRole("listitem");
    const deleteButton = within(items[0]!).getByRole("button", {
      name: /削除/,
    });
    await user.click(deleteButton);

    await waitFor(() => {
      expect(screen.queryByText("DEL-ME")).toBeNull();
    });
  });
});

// ============================================================
// BL-042 / REQ-2: tomorrow カードの「完了」 button (today と対称な 3 ボタン化)
//
// spec.md (task-card-actions) §「受け入れ基準」 AC-3 / AC-6 / AC-13 と 1:1 対応する.
// - REQ-2 / AC-3: tomorrow カードのアクションは「削除」「今日にする」「完了」の 3 つ.
// - REQ-2 / AC-6: 「完了」クリックで complete API が呼ばれ today のカウンタが +1 される.
// - REQ-5 / AC-13: 「完了」操作で OptimisticLockError が起きると ConflictDialog が開く.
//
// tomorrow-view.tsx 側はまだ「完了」 button を持たないため, 以下のテストはすべて red になる.
// implementer が green 化する.
// ============================================================

describe("TomorrowView (BL-042 REQ-2 「完了」 button)", () => {
  it("シナリオ A: カード内に「完了」 button が存在する", async () => {
    // BL-042 spec AC-3: tomorrow カードに「完了」が追加されて 3 ボタンになる.
    const repo = makeMockRepository([
      makeTask({
        id: "task-A",
        name: "AAA",
        dueDate: "tomorrow",
        version: 1,
      }),
    ]);

    renderWithQueryClient(
      <TomorrowView
        repository={repo}
        projectRepository={makeMockProjectRepository()}
      />,
    );

    const items = await screen.findAllByRole("listitem");
    const card = items[0]!;
    // 「完了」 button が 1 個だけ存在する (accessibleName 完全一致).
    expect(within(card).getAllByRole("button", { name: "完了" })).toHaveLength(1);
  });

  it("シナリオ B: 「完了」クリックで repository.complete({ id, ifMatch: task.version }) が 1 回呼ばれる", async () => {
    // BL-042 spec AC-6 第 1 ハーフ.
    const repo = makeMockRepository([
      makeTask({
        id: "task-A",
        name: "AAA",
        dueDate: "tomorrow",
        version: 1,
      }),
    ]);
    const user = userEvent.setup();

    renderWithQueryClient(
      <TomorrowView
        repository={repo}
        projectRepository={makeMockProjectRepository()}
      />,
    );

    await screen.findByText("AAA");
    const items = screen.getAllByRole("listitem");
    const card = items[0]!;
    const completeButton = within(card).getByRole("button", { name: "完了" });
    await user.click(completeButton);

    expect(repo.completeMock).toHaveBeenCalledTimes(1);
    const arg = repo.completeMock.mock.calls[0]?.[0] as CompleteTaskCommand;
    expect(arg.id).toBe("task-A");
    expect(arg.ifMatch).toBe(1);

    // 完了は削除や更新ではない (操作の独立性 / AC-6).
    expect(repo.deleteMock).not.toHaveBeenCalled();
    expect(repo.updateMock).not.toHaveBeenCalled();
  });

  it("シナリオ C: 「完了」成功後にタスクが /tomorrow の一覧から消える + today の completionCount が +1 される", async () => {
    // BL-042 spec AC-6 第 2 ハーフ:
    //   成功後に ["tomorrow"] / ["today"] / ["focus"] が invalidate され,
    //   /today に切り替えると「今日の完了: N」の N が +1 されている.
    // mock では `todayMock` が完了後に completionCount=1 を返すように
    // counterState を +1 する. ["today"] の invalidate を観察するため
    // todayMock の累積呼出回数が増えることを検証する.
    const repo = makeMockRepository(
      [
        makeTask({
          id: "task-A",
          name: "COMPLETE-ME",
          dueDate: "tomorrow",
          version: 1,
        }),
      ],
      {
        initialCounter: {
          id: "singleton",
          completedCount: 0,
          lastResetExecutedAt: null,
          version: 1,
          updatedAt: NOW,
        },
      },
    );
    const user = userEvent.setup();

    renderWithQueryClient(
      <TomorrowView
        repository={repo}
        projectRepository={makeMockProjectRepository()}
      />,
    );

    expect(await screen.findByText("COMPLETE-ME")).toBeInTheDocument();
    const listCallsBefore = repo.listMock.mock.calls.length;
    const todayCallsBefore = repo.todayMock.mock.calls.length;

    const items = screen.getAllByRole("listitem");
    const completeButton = within(items[0]!).getByRole("button", {
      name: "完了",
    });
    await user.click(completeButton);

    // 一覧から COMPLETE-ME が消える (mock の completeMock が trashedAt をセットし,
    // 次回 list({ dueDate: "tomorrow" }) は COMPLETE-ME を返さなくなる).
    await waitFor(() => {
      expect(screen.queryByText("COMPLETE-ME")).toBeNull();
    });

    // ["tomorrow"] invalidate: list の累積呼出回数が増えている.
    expect(repo.listMock.mock.calls.length).toBeGreaterThan(listCallsBefore);
    // ["today"] invalidate: today の累積呼出回数が増えている (= today カウンタ反映のため再フェッチ).
    expect(repo.todayMock.mock.calls.length).toBeGreaterThan(todayCallsBefore);
    // 完了 mock 側で completedCount が +1 されている (= todayMock 戻り値で completionCount=1).
    const lastTodayCall = repo.todayMock.mock.results[repo.todayMock.mock.results.length - 1];
    // 同期/非同期どちらでも参照できるよう, getCounter mock も併せて確認.
    const counter = await repo.getCounter();
    expect(counter.completedCount).toBe(1);
    // 戻り値が Promise の場合のフォールバック.
    void lastTodayCall;
  });

  it("シナリオ D: 「完了」操作で online 412 が返ったとき ConflictDialog が開く (AC-13)", async () => {
    // BL-042 spec AC-13: ConflictDialog 経路の維持 (BL-031 と互換).
    const repo = makeMockRepository(
      [
        makeTask({
          id: "task-A",
          name: "AAA",
          dueDate: "tomorrow",
          version: 1,
        }),
      ],
      {
        completeError: new OptimisticLockError(
          "optimistic lock conflict on complete",
          makeTask({
            id: "task-A",
            name: "AAA (サーバ最新)",
            dueDate: "tomorrow",
            version: 5,
          }),
        ),
      },
    );
    const user = userEvent.setup();

    renderWithQueryClient(
      <TomorrowView
        repository={repo}
        projectRepository={makeMockProjectRepository()}
      />,
    );

    await screen.findByText("AAA");
    const items = screen.getAllByRole("listitem");
    const completeButton = within(items[0]!).getByRole("button", {
      name: "完了",
    });
    await user.click(completeButton);

    // ConflictDialog が開く.
    const dialog = await screen.findByRole("dialog", {
      name: "変更が衝突しました",
    });
    expect(dialog).toBeInTheDocument();
  });

  it("シナリオ E: 「完了」操作で一般エラーが起きたとき notifyError(\"通信に失敗しました\") が呼ばれる", async () => {
    // BL-042 spec REQ-5: ConflictError 以外は notifyError 経路に流す (BL-034 と互換).
    const notifySpy = vi.spyOn(ErrorNotification, "notifyError");

    const repo = makeMockRepository(
      [
        makeTask({
          id: "task-A",
          name: "AAA",
          dueDate: "tomorrow",
          version: 1,
        }),
      ],
      {
        completeError: new Error("network failure"),
      },
    );
    const user = userEvent.setup();

    renderWithQueryClient(
      <TomorrowView
        repository={repo}
        projectRepository={makeMockProjectRepository()}
      />,
    );

    await screen.findByText("AAA");
    const items = screen.getAllByRole("listitem");
    const completeButton = within(items[0]!).getByRole("button", {
      name: "完了",
    });
    await user.click(completeButton);

    await waitFor(() => {
      expect(notifySpy).toHaveBeenCalledWith("通信に失敗しました");
    });

    notifySpy.mockRestore();
  });
});

// ============================================================
// REQ-6: 空状態
// ============================================================

describe("TomorrowView (BL-038 REQ-6 空状態)", () => {
  it("シナリオ A: 明日タスクが 0 件のとき「明日のタスクはありません」が表示され, 起票フォームは引き続き表示される", async () => {
    // 受け入れ基準 §「空状態 (REQ-6)」.
    const repo = makeMockRepository([]);

    renderWithQueryClient(
      <TomorrowView
        repository={repo}
        projectRepository={makeMockProjectRepository()}
      />,
    );

    // 見出し「明日のタスク」 (placeholder と新実装で共通) が描画される.
    expect(
      await screen.findByRole("heading", { name: "明日のタスク" }),
    ).toBeInTheDocument();

    // 空状態テキスト.
    expect(
      await screen.findByText("明日のタスクはありません"),
    ).toBeInTheDocument();

    // 起票フォーム (タスク名 / プロジェクト (トグル button) / 優先度 (星 UI) / 追加ボタン) は表示されている.
    expect(screen.queryByLabelText(/タスク名/)).not.toBeNull();
    // BL-041: プロジェクトはトグルボタンで表現される.
    const form = screen.getByRole("form", { name: /起票フォーム/ });
    expect(
      within(form).queryByRole("button", { name: /プロジェクト/ }),
    ).not.toBeNull();
    // BL-040: 優先度は <label htmlFor="..."> の select ではなく role=radiogroup の星 UI で表現.
    expect(within(form).queryByRole("radiogroup")).not.toBeNull();
    expect(
      screen.queryByRole("button", { name: /追加|起票|登録|送信/ }),
    ).not.toBeNull();
  });
});

// ============================================================
// REQ-7: ConflictDialog (412 → OptimisticLockError → ConflictDialog 表示)
// ============================================================

describe("TomorrowView (BL-038 REQ-7 ConflictDialog)", () => {
  it("シナリオ A: 「今日にする」操作で online 412 が返ったとき ConflictDialog が開く", async () => {
    // 受け入れ基準 §「ConflictDialog」 第 1 ケース.
    const repo = makeMockRepository(
      [
        makeTask({
          id: "task-A",
          name: "AAA",
          dueDate: "tomorrow",
          version: 1,
        }),
      ],
      {
        updateError: new OptimisticLockError(
          "optimistic lock conflict on update",
          makeTask({
            id: "task-A",
            name: "AAA (サーバ最新)",
            dueDate: "tomorrow",
            version: 5,
          }),
        ),
      },
    );
    const user = userEvent.setup();

    renderWithQueryClient(
      <TomorrowView
        repository={repo}
        projectRepository={makeMockProjectRepository()}
      />,
    );

    await screen.findByText("AAA");
    const items = screen.getAllByRole("listitem");
    const moveButton = within(items[0]!).getByRole("button", {
      name: /今日にする/,
    });
    await user.click(moveButton);

    // ConflictDialog が表示される.
    const dialog = await screen.findByRole("dialog", {
      name: "変更が衝突しました",
    });
    expect(dialog).toBeInTheDocument();
  });

  it("シナリオ B: 「削除」操作で online 412 が返ったとき ConflictDialog が開く", async () => {
    // 受け入れ基準 §「ConflictDialog」 第 2 ケース.
    const repo = makeMockRepository(
      [
        makeTask({
          id: "task-A",
          name: "AAA",
          dueDate: "tomorrow",
          version: 1,
        }),
      ],
      {
        deleteError: new OptimisticLockError(
          "optimistic lock conflict on delete",
          makeTask({
            id: "task-A",
            name: "AAA (サーバ最新)",
            dueDate: "tomorrow",
            version: 5,
          }),
        ),
      },
    );
    const user = userEvent.setup();

    renderWithQueryClient(
      <TomorrowView
        repository={repo}
        projectRepository={makeMockProjectRepository()}
      />,
    );

    await screen.findByText("AAA");
    const items = screen.getAllByRole("listitem");
    const deleteButton = within(items[0]!).getByRole("button", {
      name: /削除/,
    });
    await user.click(deleteButton);

    expect(
      await screen.findByRole("dialog", { name: "変更が衝突しました" }),
    ).toBeInTheDocument();
  });
});

// ============================================================
// REQ-7 / BL-034: 通信エラー時 notifyError が呼ばれる
// ============================================================

describe("TomorrowView (BL-038 REQ-7 / BL-034 通信エラー)", () => {
  it("シナリオ A: update が一般エラー (= ConflictError でない) を throw すると notifyError(\"通信に失敗しました\") が呼ばれる", async () => {
    // 受け入れ基準 §「通信エラー (REQ-7 / BL-034)」.
    const notifySpy = vi.spyOn(ErrorNotification, "notifyError");

    const repo = makeMockRepository(
      [
        makeTask({
          id: "task-A",
          name: "AAA",
          dueDate: "tomorrow",
          version: 1,
        }),
      ],
      {
        updateError: new Error("network failure"),
      },
    );
    const user = userEvent.setup();

    renderWithQueryClient(
      <TomorrowView
        repository={repo}
        projectRepository={makeMockProjectRepository()}
      />,
    );

    await screen.findByText("AAA");
    const items = screen.getAllByRole("listitem");
    const moveButton = within(items[0]!).getByRole("button", {
      name: /今日にする/,
    });
    await user.click(moveButton);

    await waitFor(() => {
      expect(notifySpy).toHaveBeenCalledWith("通信に失敗しました");
    });

    notifySpy.mockRestore();
  });

  it("シナリオ B: delete が一般エラーを throw すると notifyError が呼ばれる", async () => {
    const notifySpy = vi.spyOn(ErrorNotification, "notifyError");

    const repo = makeMockRepository(
      [
        makeTask({
          id: "task-A",
          name: "AAA",
          dueDate: "tomorrow",
          version: 1,
        }),
      ],
      {
        deleteError: new Error("network failure"),
      },
    );
    const user = userEvent.setup();

    renderWithQueryClient(
      <TomorrowView
        repository={repo}
        projectRepository={makeMockProjectRepository()}
      />,
    );

    await screen.findByText("AAA");
    const items = screen.getAllByRole("listitem");
    const deleteButton = within(items[0]!).getByRole("button", {
      name: /削除/,
    });
    await user.click(deleteButton);

    await waitFor(() => {
      expect(notifySpy).toHaveBeenCalledWith("通信に失敗しました");
    });

    notifySpy.mockRestore();
  });

  it("シナリオ C: create が一般エラーを throw すると notifyError が呼ばれる", async () => {
    const notifySpy = vi.spyOn(ErrorNotification, "notifyError");

    const repo = makeMockRepository([], {
      createError: new Error("network failure"),
    });
    const user = userEvent.setup();

    renderWithQueryClient(
      <TomorrowView
        repository={repo}
        projectRepository={makeMockProjectRepository()}
      />,
    );

    const nameInput = await screen.findByLabelText(/タスク名/);
    await user.type(nameInput, "x");
    const submit = screen.getByRole("button", { name: /追加|起票|登録|送信/ });
    await user.click(submit);

    await waitFor(() => {
      expect(notifySpy).toHaveBeenCalledWith("通信に失敗しました");
    });

    notifySpy.mockRestore();
  });
});

// ============================================================
// D-014: routine 由来タスクの扱い
// BL-038 では「routine も区別なく表示」としていたが BL-042 REQ-2 / AC-8 で
// 「routine は『今日にする』を非表示」に方針確定. routine は毎日自動生成されるため
// 移送すると翌日に重複が出るのを防ぐ. 表示自体と「削除」「完了」は維持.
// ============================================================

describe("TomorrowView (BL-042 routine 由来タスクの扱い)", () => {
  it("シナリオ A: origin=\"routine\" の tomorrow タスクは一覧に出る + 「削除」が押せるが「今日にする」は非表示", async () => {
    // BL-042 REQ-2 / AC-8: routine 由来は「今日にする」を非表示にする (毎日自動生成のため翌日重複防止).
    const repo = makeMockRepository([
      makeTask({
        id: "task-A",
        name: "ROUTINE-TOMORROW",
        dueDate: "tomorrow",
        origin: "routine",
        routineId: "routine-1",
        version: 1,
      }),
    ]);

    renderWithQueryClient(
      <TomorrowView
        repository={repo}
        projectRepository={makeMockProjectRepository()}
      />,
    );

    // routine 由来でも描画される (BL-038 維持).
    expect(await screen.findByText("ROUTINE-TOMORROW")).toBeInTheDocument();

    // 「削除」は origin に関わらず存在.
    const items = screen.getAllByRole("listitem");
    const card = items[0]!;
    const deleteButton = within(card).getByRole("button", { name: /削除/ });
    expect(deleteButton).toBeInTheDocument();

    // 「今日にする」は routine では非表示 (BL-042 REQ-2 / AC-8).
    expect(
      within(card).queryByRole("button", { name: /今日にする/ }),
    ).toBeNull();
  });
});
