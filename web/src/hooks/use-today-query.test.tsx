/**
 * フェーズ B: useTodayQuery フックの単体テスト
 *
 * 受け入れ基準の出典: docs/developer/features/pwa-offline-queue/spec.md
 * §「フェーズ B: TanStack Query 導入」と対応する。
 *
 * 要件:
 *   TQ-001: TanStack Query を導入し、QueryClientProvider をアプリルートに配置する。
 *   TQ-002: 各 View の useState + 直接 fetch を useQuery / useMutation に置き換える。
 *   TQ-003: 書込 mutation 成功後に関連クエリを invalidate し、再フェッチを起動する。
 *
 * シナリオ（spec.md §フェーズ B）:
 *   「今日ビューのデータ取得（TanStack Query 経由）」
 *     Given ユーザーがオンラインで /today を開く
 *     When  コンポーネントがマウントされる
 *     Then  useQuery が repository.today() を呼び出してタスク一覧が表示される
 *
 *   「ミューテーション後の再フェッチ」
 *     Given 今日ビューでタスクが表示されている
 *     When  タスクを完了する
 *     Then  useMutation の onSuccess で today クエリが invalidate され、一覧が最新の状態に更新される
 *
 * NOTE: `use-today-query.ts` および `@tanstack/react-query` はまだ存在しない。
 *       このテストは意図的に失敗する (red)。
 *       implementer が実装・インストールすることで green 化する。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useTodayQuery } from "./use-today-query.js";
import type { TaskRepository } from "../repositories/task-repository.js";
import type { Task } from "@todica/domain/task";

const NOW = "2026-06-08T09:00:00.000Z";

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    name: "テストタスク",
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

/** テスト用 QueryClient ファクトリ（自動リトライ・stale なし） */
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

/** renderHook 用ラッパー */
function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

/** TaskRepository の最小限モック */
function makeMockRepository(tasks: Task[] = []): TaskRepository {
  const todayMock = vi.fn(async () => ({
    tasks,
    nextTaskId: tasks[0]?.id ?? null,
    currentTaskId: null,
    completionCount: 0,
  }));
  return {
    today: todayMock,
    list: vi.fn(async () => tasks),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    complete: vi.fn(),
    getFocus: vi.fn(async () => ({
      id: "singleton",
      currentTaskId: null,
      version: 1,
      updatedAt: NOW,
    })),
    setFocus: vi.fn(),
    getCounter: vi.fn(async () => ({
      id: "singleton",
      completedCount: 0,
      lastResetExecutedAt: null,
      version: 1,
      updatedAt: NOW,
    })),
  } as unknown as TaskRepository;
}

describe("useTodayQuery (フェーズ B: TanStack Query 導入)", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = createTestQueryClient();
  });

  it("シナリオ: マウント時に repository.today() を呼び出してタスク一覧を取得する (TQ-002)", async () => {
    // Given タスクが 1 件ある repository
    const task = makeTask({ id: "t1", name: "牛乳を買う" });
    const repository = makeMockRepository([task]);
    const wrapper = createWrapper(queryClient);

    // When useTodayQuery フックをレンダリングする
    const { result } = renderHook(() => useTodayQuery(repository), { wrapper });

    // Then repository.today() が呼ばれる
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(repository.today).toHaveBeenCalledTimes(1);

    // Then データが取得されている
    expect(result.current.data?.tasks).toHaveLength(1);
    expect(result.current.data?.tasks[0]?.name).toBe("牛乳を買う");
  });

  it("シナリオ: クエリキーは [\"today\"] であること (plan.md §クエリキー設計)", async () => {
    // Given repository
    const repository = makeMockRepository([]);
    const wrapper = createWrapper(queryClient);

    // When useTodayQuery フックをレンダリングする
    renderHook(() => useTodayQuery(repository), { wrapper });

    // Then queryClient のキャッシュに ['today'] キーが存在する
    await waitFor(() => {
      const data = queryClient.getQueryData(["today"]);
      return data !== undefined;
    });

    const cachedData = queryClient.getQueryData(["today"]);
    expect(cachedData).toBeDefined();
  });

  it("シナリオ: データ取得中は isLoading が true になる (TQ-002)", () => {
    // Given 解決が遅延する repository
    const repository = makeMockRepository([]);
    (repository.today as ReturnType<typeof vi.fn>).mockImplementation(
      () => new Promise(() => {}), // 解決しない Promise
    );
    const wrapper = createWrapper(queryClient);

    // When useTodayQuery をレンダリングする（データ取得中）
    const { result } = renderHook(() => useTodayQuery(repository), { wrapper });

    // Then isLoading が true である
    expect(result.current.isLoading).toBe(true);
  });

  it("シナリオ: ['today'] クエリを invalidate すると repository.today() が再度呼ばれる (TQ-003)", async () => {
    // Given useTodayQuery が初回取得完了している
    const repository = makeMockRepository([makeTask({ id: "t1" })]);
    const wrapper = createWrapper(queryClient);
    const { result } = renderHook(() => useTodayQuery(repository), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(repository.today).toHaveBeenCalledTimes(1);

    // When ['today'] クエリを invalidate する
    await queryClient.invalidateQueries({ queryKey: ["today"] });

    // Then repository.today() が再度呼ばれる（再フェッチが起動する）
    await waitFor(() => {
      const calls = (repository.today as ReturnType<typeof vi.fn>).mock.calls.length;
      return calls >= 2;
    });
    expect(repository.today).toHaveBeenCalledTimes(2);
  });
});
