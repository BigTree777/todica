import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
/**
 * 単体テスト: TrashView の Project セクション (BL-119 / project-soft-delete AC-11).
 *
 * 受け入れ基準の出典: docs/developer/features/project-soft-delete/spec.md AC-11.
 *   Given ゴミ箱に Project P が 1 件存在する
 *   When  /trash ビューを開く
 *   Then  Project セクションに P の名前が表示される
 *   And   P の行の復元操作を行うと P がゴミ箱から消え 通常の Project 一覧に戻る
 *
 * 注意: 本ファイルは TDD の "red" を作るためのテスト.
 *       TrashView は現状 Project セクションを描画せず, TrashRepository は
 *       listProjects() / TrashedProject 型を持たないため, すべて失敗する想定.
 *       implementer が view / repository を拡張することで green 化する.
 *
 * 復元 mutation は `useTrashMutations` 経由とし view から直接 useMutation しない (FR-7).
 * restore は Task/Project をサーバ側で判別するため, Project 復元も同じ
 * RestoreTaskCommand ({ id, ifMatch }) で呼ばれる (D-3).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  RestoreTaskCommand,
  TrashedProject,
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

function makeTrashedProject(overrides: Partial<TrashedProject> = {}): TrashedProject {
  return {
    id: "p-1",
    name: "削除済みプロジェクト",
    trashedAt: NOW,
    version: 2,
    ...overrides,
  };
}

/**
 * tasks / projects の双方を返すモック TrashRepository.
 *   - list() は TrashedTask[] (既存の Task セクション用).
 *   - listProjects() は TrashedProject[] (Project セクション用 / BL-119).
 *   - restore() は Task/Project 共用 (サーバ判別). 呼ばれた id を state から除く.
 */
function makeMockRepository(
  tasks: TrashedTask[] = [],
  projects: TrashedProject[] = [],
): TrashRepository & {
  listMock: ReturnType<typeof vi.fn>;
  listProjectsMock: ReturnType<typeof vi.fn>;
  restoreMock: ReturnType<typeof vi.fn>;
  emptyMock: ReturnType<typeof vi.fn>;
} {
  let taskState = [...tasks];
  let projectState = [...projects];

  const listMock = vi.fn(async (): Promise<TrashedTask[]> => [...taskState]);
  const listProjectsMock = vi.fn(async (): Promise<TrashedProject[]> => [...projectState]);
  const restoreMock = vi.fn(async (cmd: RestoreTaskCommand): Promise<TrashedTask> => {
    const project = projectState.find((p) => p.id === cmd.id);
    if (project) {
      projectState = projectState.filter((p) => p.id !== cmd.id);
      // Project 復元時も TrashedTask 互換のオブジェクトを返す (戻り値の型は共用).
      return { ...project, trashedReason: "deleted" } as unknown as TrashedTask;
    }
    const task = taskState.find((t) => t.id === cmd.id);
    if (!task) throw new Error("not found");
    taskState = taskState.filter((t) => t.id !== cmd.id);
    return { ...task, version: task.version + 1 };
  });
  const emptyMock = vi.fn(async (): Promise<void> => {
    taskState = [];
    projectState = [];
  });

  return {
    list: listMock,
    listProjects: listProjectsMock,
    restore: restoreMock,
    empty: emptyMock,
    listMock,
    listProjectsMock,
    restoreMock,
    emptyMock,
  } as unknown as TrashRepository & {
    listMock: ReturnType<typeof vi.fn>;
    listProjectsMock: ReturnType<typeof vi.fn>;
    restoreMock: ReturnType<typeof vi.fn>;
    emptyMock: ReturnType<typeof vi.fn>;
  };
}

describe("TrashView: Project セクション (AC-11)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
  });

  it("シナリオ (AC-11): ゴミ箱の Project がプロジェクト一覧に名前付きで表示される", async () => {
    const P = makeTrashedProject({ id: "p-1", name: "削除済みプロジェクト", version: 2 });
    const repo = makeMockRepository([], [P]);

    renderWithQueryClient(<TrashView repository={repo} />);

    // listProjects() が呼ばれる.
    expect(repo.listProjectsMock).toHaveBeenCalledTimes(1);

    // Project セクション (aria-label="ゴミ箱のプロジェクト一覧") に P の名前が表示される.
    const list = await screen.findByRole("list", { name: "ゴミ箱のプロジェクト一覧" });
    expect(within(list).getByText("削除済みプロジェクト")).toBeInTheDocument();
  });

  it("シナリオ (AC-11): Project 行の復元操作で restore({ id, ifMatch: version }) が呼ばれゴミ箱から消える", async () => {
    const P = makeTrashedProject({ id: "p-9", name: "復元するプロジェクト", version: 4 });
    const repo = makeMockRepository([], [P]);
    const user = userEvent.setup();

    renderWithQueryClient(<TrashView repository={repo} />);

    const list = await screen.findByRole("list", { name: "ゴミ箱のプロジェクト一覧" });
    const row = within(list).getByText("復元するプロジェクト").closest("li");
    expect(row).not.toBeNull();

    // Project 行の復元ボタンをクリックする.
    const restoreButton = within(row as HTMLElement).getByRole("button", { name: /復元/ });
    await user.click(restoreButton);

    // restore が { id, ifMatch: version } で呼ばれる.
    expect(repo.restoreMock).toHaveBeenCalledTimes(1);
    const arg = repo.restoreMock.mock.calls[0]?.[0] as RestoreTaskCommand;
    expect(arg.id).toBe("p-9");
    expect(arg.ifMatch).toBe(4);

    // 再取得され、プロジェクトがゴミ箱一覧から消える.
    expect(repo.listProjectsMock.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText("復元するプロジェクト")).not.toBeInTheDocument();
  });

  it("シナリオ (AC-11): ゴミ箱に Project が無いときプロジェクト一覧 (list) は描画されない", async () => {
    const repo = makeMockRepository([], []);

    renderWithQueryClient(<TrashView repository={repo} />);

    // listProjects() は呼ばれるが、Project が 0 件なら一覧 role は出さない.
    expect(repo.listProjectsMock).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByRole("list", { name: "ゴミ箱のプロジェクト一覧" }),
    ).not.toBeInTheDocument();
  });
});
