import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Task } from "@todica/domain/task";
import type { ReactNode } from "react";
/**
 * Web クライアント単体テスト: 「現在のタスク」独立ビュー (focus-view) (BL-037).
 *
 * 仕様参照:
 *   docs/developer/features/focus-view/spec.md §「受け入れ基準」(REQ-1〜REQ-8).
 *   docs/developer/features/focus-view/plan.md §「テスト方針」.
 *
 * 本ファイルは TDD の "red" を作るためのテスト.
 *   - `<FocusView />` 本体はまだ存在しない (placeholder のみ存在). よって最初に import で
 *     落ちる (red). implementer が web/src/ui/focus-view/focus-view.tsx を新設して green 化する.
 *
 * 既存 `today-view.test.tsx` の `renderWithQueryClient` / `makeMockRepository`
 * / `makeMockProjectRepository` のパターンをほぼそのまま踏襲する.
 */
import { describe, expect, it, vi } from "vitest";
// BL-034 / REQ-8 関連: notifyError をスパイするために import.
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
// FocusView はまだ実装されていない (placeholder のみ存在する).
// 本 import は implementer が `web/src/ui/focus-view/focus-view.tsx` を作るまで red.
import { FocusView } from "../src/ui/focus-view/focus-view.js";

const NOW = "2026-06-09T09:00:00.000Z";

/** TanStack Query テスト用クライアント. */
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
 * - `today()`: dueDate === "today" かつ trashedAt === null を priority → createdAt → id でソートして返す.
 *   nextTaskId は並び先頭の id. focusState / counterState のミラーを同梱.
 * - `getFocus()` / `setFocus()`: focusState を返す / 更新する.
 * - `complete()` / `delete()`: state を書き換えて completionCount を維持. focus 自動解除も模倣する
 *   (= 完了 / 削除対象が currentTaskId と一致したら currentTaskId を null に倒す). サーバ側の
 *   `clearFocusIfMatches` (BL-006 / FR-013) と同じ振る舞い.
 */
function makeMockRepository(
  initial: Task[] = [],
  options: {
    initialFocus?: FocusSelection;
    initialCounter?: Counter;
    /** complete を失敗させたい場合に渡す. */
    completeError?: Error;
    /** delete を失敗させたい場合に渡す. */
    deleteError?: Error;
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
  const todayMock = vi.fn(async () => {
    const filtered = state.filter((t) => t.dueDate === "today" && t.trashedAt === null);
    const sorted = [...filtered].sort((a, b) => {
      const p = (PRIORITY_ORDER_LOCAL[a.priority] ?? 99) - (PRIORITY_ORDER_LOCAL[b.priority] ?? 99);
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
  const listMock = vi.fn(async () => [...state]);
  const createMock = vi.fn(async (_cmd: CreateTaskCommand) => {
    throw new Error("FocusView は create を呼ばないはず (REQ-7)");
  });
  const updateMock = vi.fn(async (_cmd: UpdateTaskCommand) => {
    throw new Error("FocusView は update を呼ばないはず (REQ-4 / 編集 UI なし)");
  });
  const deleteMock = vi.fn(async (cmd: DeleteTaskCommand) => {
    if (options.deleteError) throw options.deleteError;
    const idx = state.findIndex((t) => t.id === cmd.id);
    if (idx < 0) throw new Error("not found");
    const prev = state[idx]!;
    state[idx] = {
      ...prev,
      trashedAt: "2026-06-09T09:00:01.000Z",
      trashedReason: "deleted",
      version: (prev.version ?? 0) + 1,
    };
    // 自動解除 (FR-013): currentTaskId と一致するなら null に倒す.
    if (focusState.currentTaskId === cmd.id) {
      focusState = {
        ...focusState,
        currentTaskId: null,
        version: focusState.version + 1,
        updatedAt: NOW,
      };
    }
    // BL-012: counter は加算しない.
  });
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
    // 自動解除 (FR-013): currentTaskId と一致するなら null に倒す.
    if (focusState.currentTaskId === cmd.id) {
      focusState = {
        ...focusState,
        currentTaskId: null,
        version: focusState.version + 1,
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
// REQ-1 / REQ-3: フォーカス対象がある時の表示 (タスク名 + project 副情報)
// ============================================================

describe("FocusView (BL-037 REQ-1 表示: フォーカス対象あり)", () => {
  it("シナリオ: nextTaskId フォールバックでタスク名が見出し級で表示され, project 名が副情報として表示される", async () => {
    // Given: 今日のタスク A (name="牛乳", projectId="p1") が並び先頭, currentTaskId=null
    //        (= 暗黙フォールバック: focusedId = currentTaskId ?? nextTaskId = A.id).
    // And:   projects に "p1" が name="買い物" として登録済み.
    const project: Project = {
      id: "p1",
      name: "買い物",
      version: 1,
      createdAt: NOW,
      updatedAt: NOW,
    };
    const repo = makeMockRepository([
      makeTask({ id: "A", name: "牛乳", projectId: "p1", version: 1 }),
    ]);
    const projectRepo = makeMockProjectRepository([project]);

    renderWithQueryClient(<FocusView repository={repo} projectRepository={projectRepo} />);

    // 見出し「現在のタスク」(<h1>) が描画される.
    expect(
      await screen.findByRole("heading", { name: "現在のタスク", level: 1 }),
    ).toBeInTheDocument();

    // BL-070 追従: タスク名 "牛乳" は input value に表示される.
    expect(await screen.findByDisplayValue("牛乳")).toBeInTheDocument();

    // プロジェクト名 "買い物" が副情報として表示される.
    expect(await screen.findByText("買い物")).toBeInTheDocument();

    // 下部に「削除」「完了」の 2 ボタンが表示される.
    expect(screen.getByRole("button", { name: "削除" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "完了" })).toBeInTheDocument();
  });

  it("シナリオ: currentTaskId が明示設定されている時はその id がフォーカス対象になる", async () => {
    // Given: A, B が並び順 A, B で存在.
    // And:   currentTaskId = B.id (明示設定).
    const repo = makeMockRepository(
      [
        makeTask({
          id: "A",
          name: "AAA",
          priority: "highest",
          createdAt: "2026-06-09T08:00:00.000Z",
          version: 1,
        }),
        makeTask({
          id: "B",
          name: "BBB",
          priority: "normal",
          createdAt: "2026-06-09T08:00:01.000Z",
          version: 1,
        }),
      ],
      {
        initialFocus: {
          id: "singleton",
          currentTaskId: "B",
          version: 3,
          updatedAt: NOW,
        },
      },
    );

    renderWithQueryClient(
      <FocusView repository={repo} projectRepository={makeMockProjectRepository()} />,
    );

    // BL-070 追従: タスク名は input value に入る.
    // currentTaskId = B が優先されるため B (BBB) が表示される.
    expect(await screen.findByDisplayValue("BBB")).toBeInTheDocument();
    // A (AAA) は表示されない (focus-view は単独大表示).
    expect(screen.queryByDisplayValue("AAA")).toBeNull();
  });
});

// ============================================================
// REQ-2: 空状態
// ============================================================

describe("FocusView (BL-037 REQ-2 空状態: フォーカス対象なし)", () => {
  it("シナリオ: 今日のタスクが 0 件で currentTaskId が null の時, 「現在のタスクはありません」が表示される", async () => {
    const repo = makeMockRepository([]);

    renderWithQueryClient(
      <FocusView repository={repo} projectRepository={makeMockProjectRepository()} />,
    );

    // 見出し「現在のタスク」は引き続き表示される.
    expect(
      await screen.findByRole("heading", { name: "現在のタスク", level: 1 }),
    ).toBeInTheDocument();

    // 空状態テキスト.
    expect(await screen.findByText("現在のタスクはありません")).toBeInTheDocument();

    // 「削除」「完了」ボタンは存在しない (D-008 非表示の方針).
    // 「無効化」案でも済むよう, 「disabled でも可」とせずに「null」を期待する.
    expect(screen.queryByRole("button", { name: "削除" })).toBeNull();
    expect(screen.queryByRole("button", { name: "完了" })).toBeNull();
  });
});

// ============================================================
// REQ-4: アクションは「削除」「完了」の 2 ボタンのみ
// ============================================================

describe("FocusView (BL-037 REQ-4 アクション数の規約)", () => {
  it("シナリオ: 画面内のボタンは「削除」「完了」の 2 つだけ. 編集 / 優先度切替 / 明日へ / 現在解除 等は存在しない", async () => {
    const repo = makeMockRepository([makeTask({ id: "A", name: "牛乳", version: 1 })]);

    renderWithQueryClient(
      <FocusView repository={repo} projectRepository={makeMockProjectRepository()} />,
    );

    // タスク名が表示されるまで待つ.
    await screen.findByDisplayValue("牛乳");

    // 「削除」「完了」が存在する.
    expect(screen.getByRole("button", { name: "削除" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "完了" })).toBeInTheDocument();

    // 禁則ボタンが居ない (REQ-4).
    expect(screen.queryByRole("button", { name: /編集/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /優先度/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /明日へ/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /今日へ/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /現在解除/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /現在に設定/ })).toBeNull();

    // ConflictDialog は閉状態 (open=false) なので, ダイアログ内ボタンは描画されない.
    // よって画面内 button の総数は「削除」「完了」の 2 個ちょうど.
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(2);
    // 注: Array.prototype.sort() は UTF-16 code unit 順で比較する.
    // 削 (U+524A) < 完 (U+5B8C) のため sort 結果は ["削除", "完了"] になる.
    const labels = buttons.map((b) => b.getAttribute("aria-label") ?? b.textContent ?? "").sort();
    expect(labels).toEqual(["削除", "完了"]);
  });
});

// ============================================================
// REQ-7: 起票フォームを置かない
// ============================================================

describe("FocusView (BL-037 REQ-7 起票フォーム無し)", () => {
  it("シナリオ: タスク名 / プロジェクト / 期限 / 優先度 の入力要素も「追加」ボタンも存在しない (フォーカス対象あり)", async () => {
    const repo = makeMockRepository([makeTask({ id: "A", name: "牛乳", version: 1 })]);

    renderWithQueryClient(
      <FocusView repository={repo} projectRepository={makeMockProjectRepository()} />,
    );
    await screen.findByDisplayValue("牛乳");

    // 起票関連の入力要素 / ボタンが存在しないこと.
    expect(screen.queryByLabelText(/タスク名/)).toBeNull();
    // BL-108 で TaskCard 表示側にもプロジェクト変更 `<select>` が居るため
    // queryByLabelText(/プロジェクト/) は focusedTask カード内の control を拾う.
    // ここでは「起票フォームの projectId input が無いこと」を id="create-project" で代替確認する.
    expect(document.getElementById("create-project")).toBeNull();
    expect(screen.queryByLabelText(/期限/)).toBeNull();
    expect(screen.queryByLabelText(/優先度/)).toBeNull();
    expect(screen.queryByRole("button", { name: /追加|起票|登録|送信/ })).toBeNull();
    // form ランドマーク (タスク起票フォーム) も無い.
    expect(screen.queryByRole("form", { name: /タスク起票/ })).toBeNull();
  });

  it("シナリオ: 空状態でも起票フォームは出ない", async () => {
    const repo = makeMockRepository([]);

    renderWithQueryClient(
      <FocusView repository={repo} projectRepository={makeMockProjectRepository()} />,
    );
    await screen.findByText("現在のタスクはありません");

    expect(screen.queryByLabelText(/タスク名/)).toBeNull();
    expect(screen.queryByRole("button", { name: /追加|起票|登録|送信/ })).toBeNull();
  });
});

// ============================================================
// REQ-5: 完了操作
// ============================================================

describe("FocusView (BL-037 REQ-5 完了操作)", () => {
  it("シナリオ: 「完了」クリックで repository.complete({ id, ifMatch }) が 1 回呼ばれる", async () => {
    const repo = makeMockRepository([makeTask({ id: "A", name: "牛乳", version: 1 })], {
      initialFocus: {
        id: "singleton",
        currentTaskId: "A",
        version: 1,
        updatedAt: NOW,
      },
    });
    const user = userEvent.setup();

    renderWithQueryClient(
      <FocusView repository={repo} projectRepository={makeMockProjectRepository()} />,
    );
    await screen.findByDisplayValue("牛乳");

    const completeButton = screen.getByRole("button", { name: "完了" });
    await user.click(completeButton);

    expect(repo.completeMock).toHaveBeenCalledTimes(1);
    const arg = repo.completeMock.mock.calls[0]?.[0] as CompleteTaskCommand;
    expect(arg.id).toBe("A");
    expect(arg.ifMatch).toBe(1);
  });

  it("シナリオ: 完了成功後に today / focus が再フェッチされ, 次のタスク (B) が表示される", async () => {
    const repo = makeMockRepository(
      [
        makeTask({
          id: "A",
          name: "AAA",
          priority: "highest",
          createdAt: "2026-06-09T08:00:00.000Z",
          version: 1,
        }),
        makeTask({
          id: "B",
          name: "BBB",
          priority: "normal",
          createdAt: "2026-06-09T08:00:01.000Z",
          version: 1,
        }),
      ],
      {
        initialFocus: {
          id: "singleton",
          currentTaskId: "A",
          version: 1,
          updatedAt: NOW,
        },
      },
    );
    const user = userEvent.setup();

    renderWithQueryClient(
      <FocusView repository={repo} projectRepository={makeMockProjectRepository()} />,
    );
    await screen.findByDisplayValue("AAA");

    const todayCallsBefore = repo.todayMock.mock.calls.length;
    const focusCallsBefore = repo.getFocusMock.mock.calls.length;

    await user.click(screen.getByRole("button", { name: "完了" }));

    // today / focus の再フェッチが走る.
    await waitFor(() => {
      expect(repo.todayMock.mock.calls.length).toBeGreaterThan(todayCallsBefore);
    });
    await waitFor(() => {
      expect(repo.getFocusMock.mock.calls.length).toBeGreaterThan(focusCallsBefore);
    });

    // 次のタスク B (BBB) が表示される (自動解除 + 暗黙フォールバック).
    expect(await screen.findByDisplayValue("BBB")).toBeInTheDocument();
    expect(screen.queryByText("AAA")).toBeNull();
  });
});

// ============================================================
// REQ-6: 削除操作
// ============================================================

describe("FocusView (BL-037 REQ-6 削除操作)", () => {
  it("シナリオ: 「削除」クリックで repository.delete({ id, ifMatch }) が 1 回呼ばれる", async () => {
    const repo = makeMockRepository([makeTask({ id: "A", name: "牛乳", version: 1 })], {
      initialFocus: {
        id: "singleton",
        currentTaskId: "A",
        version: 1,
        updatedAt: NOW,
      },
    });
    const user = userEvent.setup();

    renderWithQueryClient(
      <FocusView repository={repo} projectRepository={makeMockProjectRepository()} />,
    );
    await screen.findByDisplayValue("牛乳");

    await user.click(screen.getByRole("button", { name: "削除" }));

    expect(repo.deleteMock).toHaveBeenCalledTimes(1);
    const arg = repo.deleteMock.mock.calls[0]?.[0] as DeleteTaskCommand;
    expect(arg.id).toBe("A");
    expect(arg.ifMatch).toBe(1);
    // 完了は呼ばれない (REQ-6 / 操作の独立性).
    expect(repo.completeMock).not.toHaveBeenCalled();
  });

  it("シナリオ: 削除成功後に today / focus が再フェッチされ, 次のタスク (B) が表示される", async () => {
    const repo = makeMockRepository(
      [
        makeTask({
          id: "A",
          name: "AAA",
          priority: "highest",
          createdAt: "2026-06-09T08:00:00.000Z",
          version: 1,
        }),
        makeTask({
          id: "B",
          name: "BBB",
          priority: "normal",
          createdAt: "2026-06-09T08:00:01.000Z",
          version: 1,
        }),
      ],
      {
        initialFocus: {
          id: "singleton",
          currentTaskId: "A",
          version: 1,
          updatedAt: NOW,
        },
      },
    );
    const user = userEvent.setup();

    renderWithQueryClient(
      <FocusView repository={repo} projectRepository={makeMockProjectRepository()} />,
    );
    await screen.findByDisplayValue("AAA");

    const todayCallsBefore = repo.todayMock.mock.calls.length;

    await user.click(screen.getByRole("button", { name: "削除" }));

    await waitFor(() => {
      expect(repo.todayMock.mock.calls.length).toBeGreaterThan(todayCallsBefore);
    });

    expect(await screen.findByDisplayValue("BBB")).toBeInTheDocument();
    expect(screen.queryByText("AAA")).toBeNull();
  });
});

// ============================================================
// D-001: setFocus を呼ばない (FR-013 サーバ側自動解除に委ねる)
// ============================================================

describe("FocusView (BL-037 D-001 setFocus を呼ばない)", () => {
  it("シナリオ: 完了 / 削除のいずれの操作でも repository.setFocus は 1 度も呼ばれない", async () => {
    const repo = makeMockRepository(
      [
        makeTask({ id: "A", name: "AAA", version: 1 }),
        makeTask({
          id: "B",
          name: "BBB",
          createdAt: "2026-06-09T08:00:01.000Z",
          version: 1,
        }),
      ],
      {
        initialFocus: {
          id: "singleton",
          currentTaskId: "A",
          version: 1,
          updatedAt: NOW,
        },
      },
    );
    const user = userEvent.setup();

    renderWithQueryClient(
      <FocusView repository={repo} projectRepository={makeMockProjectRepository()} />,
    );
    await screen.findByDisplayValue("AAA");

    // 完了 → setFocus が呼ばれていない.
    await user.click(screen.getByRole("button", { name: "完了" }));
    await waitFor(() => {
      expect(repo.completeMock).toHaveBeenCalled();
    });
    expect(repo.setFocusMock).not.toHaveBeenCalled();

    // 次のタスク (B) に切り替わってから削除 → setFocus は依然 0 回.
    await screen.findByDisplayValue("BBB");
    await user.click(screen.getByRole("button", { name: "削除" }));
    await waitFor(() => {
      expect(repo.deleteMock).toHaveBeenCalled();
    });
    expect(repo.setFocusMock).not.toHaveBeenCalled();
  });
});

// ============================================================
// REQ-8: ConflictDialog (412 → OptimisticLockError → ConflictDialog 表示)
// ============================================================

describe("FocusView (BL-037 REQ-8 ConflictDialog)", () => {
  it("シナリオ: 「完了」操作で online 412 が返ったとき ConflictDialog が開く", async () => {
    const repo = makeMockRepository([makeTask({ id: "A", name: "牛乳", version: 1 })], {
      initialFocus: {
        id: "singleton",
        currentTaskId: "A",
        version: 1,
        updatedAt: NOW,
      },
      completeError: new OptimisticLockError(
        "optimistic lock conflict on complete",
        makeTask({ id: "A", name: "牛乳 (サーバ最新)", version: 5 }),
      ),
    });
    const user = userEvent.setup();

    renderWithQueryClient(
      <FocusView repository={repo} projectRepository={makeMockProjectRepository()} />,
    );
    await screen.findByDisplayValue("牛乳");

    await user.click(screen.getByRole("button", { name: "完了" }));

    // ConflictDialog が表示される.
    const dialog = await screen.findByRole("dialog", {
      name: "変更が衝突しました",
    });
    expect(dialog).toBeInTheDocument();
    // ダイアログ内に 2 択ボタンがある (CR-002).
    expect(within(dialog).getByRole("button", { name: "サーバの値を採用" })).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "クライアントの値で再送" }),
    ).toBeInTheDocument();
  });

  it("シナリオ: 「削除」操作で online 412 が返ったとき ConflictDialog が開く", async () => {
    const repo = makeMockRepository([makeTask({ id: "A", name: "牛乳", version: 1 })], {
      initialFocus: {
        id: "singleton",
        currentTaskId: "A",
        version: 1,
        updatedAt: NOW,
      },
      deleteError: new OptimisticLockError(
        "optimistic lock conflict on delete",
        makeTask({ id: "A", name: "牛乳 (サーバ最新)", version: 5 }),
      ),
    });
    const user = userEvent.setup();

    renderWithQueryClient(
      <FocusView repository={repo} projectRepository={makeMockProjectRepository()} />,
    );
    await screen.findByDisplayValue("牛乳");

    await user.click(screen.getByRole("button", { name: "削除" }));

    expect(await screen.findByRole("dialog", { name: "変更が衝突しました" })).toBeInTheDocument();
  });
});

// ============================================================
// BL-034: 通信エラー時 notifyError が呼ばれる
// ============================================================

describe("FocusView (BL-037 BL-034 通信エラー時の notifyError)", () => {
  it("シナリオ: complete が一般エラー (= ConflictError でない) を throw すると notifyError が呼ばれる", async () => {
    const notifySpy = vi.spyOn(ErrorNotification, "notifyError");

    const repo = makeMockRepository([makeTask({ id: "A", name: "牛乳", version: 1 })], {
      initialFocus: {
        id: "singleton",
        currentTaskId: "A",
        version: 1,
        updatedAt: NOW,
      },
      completeError: new Error("network failure"),
    });
    const user = userEvent.setup();

    renderWithQueryClient(
      <FocusView repository={repo} projectRepository={makeMockProjectRepository()} />,
    );
    await screen.findByDisplayValue("牛乳");

    await user.click(screen.getByRole("button", { name: "完了" }));

    await waitFor(() => {
      expect(notifySpy).toHaveBeenCalledWith("通信に失敗しました");
    });

    notifySpy.mockRestore();
  });
});
