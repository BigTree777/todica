import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
/**
 * 単体テスト: TrashView の Routine セクション (BL-120 / routine-soft-delete AC-12).
 *
 * 受け入れ基準の出典: docs/developer/features/routine-soft-delete/spec.md AC-12.
 *   Given ゴミ箱に Routine R が 1 件存在する
 *   When  /trash ビューを開く
 *   Then  Routine セクションに R の名前が表示される
 *   And   R の行の復元操作を行うと R がゴミ箱から消え 通常の Routine 一覧に戻る
 *
 * 注意: 本ファイルは TDD の "red" を作るためのテスト.
 *       TrashView は現状 Routine セクションを描画せず, TrashRepository は
 *       listRoutines() / TrashedRoutine 型を持たないため, すべて失敗する想定.
 *       implementer が view / repository を拡張することで green 化する.
 *
 * 復元 mutation は `useTrashMutations` 経由とし view から直接 useMutation しない (FR-7).
 * restore は Task/Project/Routine をサーバ側で判別するため, Routine 復元も同じ
 * RestoreTaskCommand ({ id, ifMatch }) で呼ばれる (D-3).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  RestoreTaskCommand,
  TrashedProject,
  TrashedRoutine,
  TrashedTask,
  TrashRepository,
} from "../../repositories/trash-repository.js";
import { TrashView } from "./trash-view.js";

function renderWithQueryClient(ui: ReactNode): ReturnType<typeof render> {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Number.POSITIVE_INFINITY, networkMode: "offlineFirst" },
      mutations: { retry: false, networkMode: "offlineFirst" },
    },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

const NOW = "2026-06-07T09:00:00.000Z";

function makeTrashedRoutine(overrides: Partial<TrashedRoutine> = {}): TrashedRoutine {
  return {
    id: "r-1",
    name: "削除済みルーティン",
    trashedAt: NOW,
    version: 2,
    ...overrides,
  };
}

/**
 * tasks / projects / routines を返すモック TrashRepository.
 *   - list() は TrashedTask[] (既存の Task セクション用).
 *   - listProjects() は TrashedProject[] (Project セクション用 / BL-119).
 *   - listRoutines() は TrashedRoutine[] (Routine セクション用 / BL-120).
 *   - restore() は Task/Project/Routine 共用 (サーバ判別). 呼ばれた id を state から除く.
 */
function makeMockRepository(
  tasks: TrashedTask[] = [],
  projects: TrashedProject[] = [],
  routines: TrashedRoutine[] = [],
): TrashRepository & {
  listMock: ReturnType<typeof vi.fn>;
  listProjectsMock: ReturnType<typeof vi.fn>;
  listRoutinesMock: ReturnType<typeof vi.fn>;
  restoreMock: ReturnType<typeof vi.fn>;
  emptyMock: ReturnType<typeof vi.fn>;
} {
  let taskState = [...tasks];
  let projectState = [...projects];
  let routineState = [...routines];

  const listMock = vi.fn(async (): Promise<TrashedTask[]> => [...taskState]);
  const listProjectsMock = vi.fn(async (): Promise<TrashedProject[]> => [...projectState]);
  const listRoutinesMock = vi.fn(async (): Promise<TrashedRoutine[]> => [...routineState]);
  const restoreMock = vi.fn(async (cmd: RestoreTaskCommand): Promise<TrashedTask> => {
    const routine = routineState.find((r) => r.id === cmd.id);
    if (routine) {
      routineState = routineState.filter((r) => r.id !== cmd.id);
      // Routine 復元時も TrashedTask 互換のオブジェクトを返す (戻り値の型は共用).
      return { ...routine } as unknown as TrashedTask;
    }
    const project = projectState.find((p) => p.id === cmd.id);
    if (project) {
      projectState = projectState.filter((p) => p.id !== cmd.id);
      return { ...project } as unknown as TrashedTask;
    }
    const task = taskState.find((t) => t.id === cmd.id);
    if (!task) throw new Error("not found");
    taskState = taskState.filter((t) => t.id !== cmd.id);
    return { ...task, version: task.version + 1 };
  });
  const emptyMock = vi.fn(async (): Promise<void> => {
    taskState = [];
    projectState = [];
    routineState = [];
  });

  return {
    list: listMock,
    listProjects: listProjectsMock,
    listRoutines: listRoutinesMock,
    restore: restoreMock,
    empty: emptyMock,
    listMock,
    listProjectsMock,
    listRoutinesMock,
    restoreMock,
    emptyMock,
  } as unknown as TrashRepository & {
    listMock: ReturnType<typeof vi.fn>;
    listProjectsMock: ReturnType<typeof vi.fn>;
    listRoutinesMock: ReturnType<typeof vi.fn>;
    restoreMock: ReturnType<typeof vi.fn>;
    emptyMock: ReturnType<typeof vi.fn>;
  };
}

describe("TrashView: Routine セクション (AC-12)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
  });

  it("シナリオ (AC-12): ゴミ箱の Routine がルーティン一覧に名前付きで表示される", async () => {
    const R = makeTrashedRoutine({ id: "r-1", name: "削除済みルーティン", version: 2 });
    const repo = makeMockRepository([], [], [R]);

    renderWithQueryClient(<TrashView repository={repo} />);

    // listRoutines() が呼ばれる.
    expect(repo.listRoutinesMock).toHaveBeenCalledTimes(1);

    // Routine セクション (aria-label="ゴミ箱のルーティン一覧") に R の名前が表示される.
    const list = await screen.findByRole("list", { name: "ゴミ箱のルーティン一覧" });
    expect(within(list).getByText("削除済みルーティン")).toBeInTheDocument();
  });

  it("シナリオ (AC-12): Routine 行の復元操作で restore({ id, ifMatch: version }) が呼ばれゴミ箱から消える", async () => {
    const R = makeTrashedRoutine({ id: "r-9", name: "復元するルーティン", version: 4 });
    const repo = makeMockRepository([], [], [R]);
    const user = userEvent.setup();

    renderWithQueryClient(<TrashView repository={repo} />);

    const list = await screen.findByRole("list", { name: "ゴミ箱のルーティン一覧" });
    const row = within(list).getByText("復元するルーティン").closest("li");
    expect(row).not.toBeNull();

    // Routine 行の復元ボタンをクリックする.
    const restoreButton = within(row as HTMLElement).getByRole("button", { name: /復元/ });
    await user.click(restoreButton);

    // restore が { id, ifMatch: version } で呼ばれる.
    expect(repo.restoreMock).toHaveBeenCalledTimes(1);
    const arg = repo.restoreMock.mock.calls[0]?.[0] as RestoreTaskCommand;
    expect(arg.id).toBe("r-9");
    expect(arg.ifMatch).toBe(4);

    // 再取得され、ルーティンがゴミ箱一覧から消える.
    expect(repo.listRoutinesMock.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText("復元するルーティン")).not.toBeInTheDocument();
  });

  it("シナリオ (AC-12): ゴミ箱に Routine が無いときルーティン一覧 (list) は描画されない", async () => {
    const repo = makeMockRepository([], [], []);

    renderWithQueryClient(<TrashView repository={repo} />);

    // listRoutines() は呼ばれるが、Routine が 0 件なら一覧 role は出さない.
    expect(repo.listRoutinesMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("list", { name: "ゴミ箱のルーティン一覧" })).not.toBeInTheDocument();
  });
});
