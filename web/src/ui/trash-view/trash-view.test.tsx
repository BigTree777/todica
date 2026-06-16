import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
/**
 * 単体テスト: TrashView .
 *
 * 受け入れ基準の出典:
 *   - docs/developer/features/web-client-foundation/spec.md §「TrashView: 一覧表示」
 *   - docs/developer/features/web-client-foundation/spec.md §「TrashView: タスク復元」
 *   - docs/developer/features/web-client-foundation/spec.md §「TrashView: ゴミ箱を空にする」
 *   - docs/developer/features/web-client-foundation/plan.md §D-004 §D-005
 *
 * 本ファイルは TDD の "red" を作るためのテスト。
 * trash-view.tsx・trash-repository.ts は未実装のため、全テストはインポートエラー / 実行失敗する想定。
 * implementer が TrashView を実装することで green 化する。
 *
 * モック TrashRepository を props 注入するパターンは today-view.test.tsx と同形とする (plan.md D-005)。
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  RestoreTaskCommand,
  TrashedTask,
  TrashRepository,
} from "../../repositories/trash-repository.js";
import { TrashView } from "./trash-view.js";

// ============================================================
// QueryClientProvider ラッパー
// ============================================================

function renderWithQueryClient(ui: ReactNode): ReturnType<typeof render> {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Number.POSITIVE_INFINITY, networkMode: "offlineFirst" },
      mutations: { retry: false, networkMode: "offlineFirst" },
    },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

// ============================================================
// テストフィクスチャ
// ============================================================

const NOW = "2026-06-07T09:00:00.000Z";

function makeTrashedTask(overrides: Partial<TrashedTask> = {}): TrashedTask {
  return {
    id: "task-1",
    name: "削除済みタスク",
    trashedAt: NOW,
    trashedReason: "deleted",
    version: 2,
    ...overrides,
  };
}

// ============================================================
// モック TrashRepository ファクトリ
// ============================================================

function makeMockRepository(initial: TrashedTask[] = []): TrashRepository & {
  listMock: ReturnType<typeof vi.fn>;
  restoreMock: ReturnType<typeof vi.fn>;
  emptyMock: ReturnType<typeof vi.fn>;
} {
  let state = [...initial];

  const listMock = vi.fn(async (): Promise<TrashedTask[]> => [...state]);
  const restoreMock = vi.fn(async (cmd: RestoreTaskCommand): Promise<TrashedTask> => {
    const task = state.find((t) => t.id === cmd.id);
    if (!task) throw new Error("task not found");
    state = state.filter((t) => t.id !== cmd.id);
    return { ...task, version: task.version + 1 };
  });
  const emptyMock = vi.fn(async (): Promise<void> => {
    state = [];
  });

  return {
    list: listMock,
    restore: restoreMock,
    empty: emptyMock,
    listMock,
    restoreMock,
    emptyMock,
  };
}

// ============================================================
// TrashView テスト
// ============================================================

describe("TrashView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ----------------------------------------------------------
  // spec.md §「TrashView: 一覧表示」
  // ----------------------------------------------------------

  /**
   * シナリオ: マウント時にゴミ箱のタスク一覧が表示される
   *   Given TrashRepository.list() がタスク [T1, T2] を返すモックが注入されている
   *   When  TrashView がマウントされる
   *   Then  タスク T1 と T2 の名前がリスト（aria-label="ゴミ箱のタスク一覧"）に表示される
   */
  it("シナリオ: マウント時に repository.list() を呼び出してタスク一覧が表示される", async () => {
    const T1 = makeTrashedTask({
      id: "t1",
      name: "削除タスクA",
      trashedReason: "deleted",
      version: 1,
    });
    const T2 = makeTrashedTask({
      id: "t2",
      name: "完了タスクB",
      trashedReason: "completed",
      version: 2,
    });
    const repo = makeMockRepository([T1, T2]);

    renderWithQueryClient(<TrashView repository={repo} />);

    // list() が 1 回呼ばれる
    expect(repo.listMock).toHaveBeenCalledTimes(1);

    // タスク一覧 (aria-label="ゴミ箱のタスク一覧") に T1 と T2 の名前が表示される
    const list = await screen.findByRole("list", { name: "ゴミ箱のタスク一覧" });
    expect(list).toBeInTheDocument();
    expect(await screen.findByText("削除タスクA")).toBeInTheDocument();
    expect(await screen.findByText("完了タスクB")).toBeInTheDocument();
  });

  /**
   * シナリオ: ゴミ箱が空のとき「ゴミ箱は空です」と表示される
   *   Given TrashRepository.list() が空配列を返すモックが注入されている
   *   When  TrashView がマウントされる
   *   Then  「ゴミ箱は空です」というテキストが表示される
   */
  it("シナリオ: ゴミ箱が空のとき「ゴミ箱は空です」と表示される", async () => {
    const repo = makeMockRepository([]);

    renderWithQueryClient(<TrashView repository={repo} />);

    // list() が呼ばれる
    expect(repo.listMock).toHaveBeenCalledTimes(1);

    // 「ゴミ箱は空です」が表示される
    expect(await screen.findByText("ゴミ箱は空です")).toBeInTheDocument();
  });

  // ----------------------------------------------------------
  // spec.md §「TrashView: タスク復元」
  // ----------------------------------------------------------

  /**
   * シナリオ: 復元ボタンをクリックすると restore が呼ばれ一覧が更新される
   *   Given TrashRepository.list() がタスク [T1] を返すモックが注入されている
   *   And   TrashRepository.restore() が成功するモックが注入されている
   *   And   restore 呼び出し後の list() は空配列を返す
   *   When  T1 の「復元」ボタンをクリックする
   *   Then  TrashRepository.restore({ id: T1.id, ifMatch: T1.version }) が呼ばれる
   *   And   タスク一覧が再取得され「ゴミ箱は空です」と表示される
   */
  it("シナリオ: 復元ボタンをクリックすると restore({ id, ifMatch: version }) が呼ばれ一覧が更新される", async () => {
    const T1 = makeTrashedTask({ id: "t1", name: "復元するタスク", version: 3 });
    const repo = makeMockRepository([T1]);
    const user = userEvent.setup();

    renderWithQueryClient(<TrashView repository={repo} />);

    // タスク名が表示されるまで待つ
    await screen.findByText("復元するタスク");

    // T1 の「復元」ボタンをクリックする
    const restoreButton = await screen.findByRole("button", { name: /復元/ });
    await user.click(restoreButton);

    // restore が正しい引数で呼ばれる
    expect(repo.restoreMock).toHaveBeenCalledTimes(1);
    const arg = repo.restoreMock.mock.calls[0]?.[0] as RestoreTaskCommand;
    expect(arg.id).toBe("t1");
    expect(arg.ifMatch).toBe(3); // T1.version

    // 一覧が再取得される (list() の呼び出し回数が増える: 初回 + 再取得 = 2 回)
    expect(repo.listMock.mock.calls.length).toBeGreaterThanOrEqual(2);

    // 「ゴミ箱は空です」と表示される (restore 後に state が空になるため)
    expect(await screen.findByText("ゴミ箱は空です")).toBeInTheDocument();
  });

  // ----------------------------------------------------------
  // spec.md §「TrashView: ゴミ箱を空にする」
  // ----------------------------------------------------------

  /**
   * シナリオ: 「ゴミ箱を空にする」ボタンをクリックすると empty が呼ばれ一覧が更新される
   *   Given TrashRepository.list() がタスク [T1, T2] を返すモックが注入されている
   *   And   TrashRepository.empty() が成功するモックが注入されている
   *   And   empty 呼び出し後の list() は空配列を返す
   *   When  「ゴミ箱を空にする」ボタンをクリックする
   *   Then  TrashRepository.empty() が呼ばれる
   *   And   タスク一覧が再取得され「ゴミ箱は空です」と表示される
   */
  it("シナリオ: 「ゴミ箱を空にする」ボタンをクリックすると empty() が呼ばれ一覧が更新される", async () => {
    const T1 = makeTrashedTask({ id: "t1", name: "タスクA", version: 1 });
    const T2 = makeTrashedTask({ id: "t2", name: "タスクB", version: 2 });
    const repo = makeMockRepository([T1, T2]);
    const user = userEvent.setup();

    renderWithQueryClient(<TrashView repository={repo} />);

    // タスクが表示されるまで待つ
    await screen.findByText("タスクA");
    await screen.findByText("タスクB");

    // 「ゴミ箱を空にする」ボタンをクリックする
    const emptyButton = await screen.findByRole("button", { name: /ゴミ箱を空にする/ });
    await user.click(emptyButton);

    // empty() が 1 回呼ばれる
    expect(repo.emptyMock).toHaveBeenCalledTimes(1);

    // 一覧が再取得される (list() の呼び出し回数が増える: 初回 + 再取得 = 2 回)
    expect(repo.listMock.mock.calls.length).toBeGreaterThanOrEqual(2);

    // 「ゴミ箱は空です」と表示される (empty 後に state が空になるため)
    expect(await screen.findByText("ゴミ箱は空です")).toBeInTheDocument();
  });

  // ----------------------------------------------------------
  // 追加: h1 の存在確認（ルーティングテストとの整合）
  // ----------------------------------------------------------

  /**
   * TrashView は <h1>ゴミ箱</h1> を持つ。
   * これはルーティングテストで "/trash" パスの解決確認に使用する。
   * plan.md §D-004 レンダリング要件: "<h1>ゴミ箱</h1> を持つ <main> を返す"
   */
  it("TrashView は見出し「ゴミ箱」を持つ", async () => {
    const repo = makeMockRepository([]);

    renderWithQueryClient(<TrashView repository={repo} />);

    expect(await screen.findByRole("heading", { name: "ゴミ箱" })).toBeInTheDocument();
  });
});
