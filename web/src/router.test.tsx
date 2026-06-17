import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Navigate, Route, Routes } from "react-router-dom";
/**
 * 単体テスト: ルーティング (BL-014 / web-client-foundation).
 *
 * 受け入れ基準の出典:
 *   - docs/developer/features/web-client-foundation/spec.md §「ルーティング」
 *   - docs/developer/features/web-client-foundation/plan.md §D-001
 *
 * 観点:
 *   1. "/" へのアクセスは "/today" にリダイレクトされ TodayView が表示される（<h1>今日</h1>）。
 *   2. "/today" にアクセスすると TodayView がレンダリングされる（<h1>今日</h1>）。
 *   3. "/settings" にアクセスすると SettingsView がレンダリングされる（<h1>設定</h1>）。
 *   4. "/trash" にアクセスすると TrashView がレンダリングされる（<h1>ゴミ箱</h1>）。
 *
 * テスト方針 (plan.md §D-005):
 *   MemoryRouter + Routes を使って各パスをテストする。
 *   TodayView・SettingsView は実際のコンポーネントをモック Repository 付きで使用する。
 *   TrashView も同様にモック TrashRepository を注入する。
 *   react-router-dom は実装フェーズでインストールされるため、
 *   現時点ではインポートエラーが発生し全テストが失敗する（red）。
 *
 * 本ファイルは TDD の "red" を作るためのテスト。
 * implementer が react-router-dom を導入し main.tsx を書き換えることで green 化する。
 * ただし、本テストは main.tsx を直接テストするのではなく、
 * MemoryRouter でルーティング構成を再現して各コンポーネントの表示を検証する。
 */
import { describe, expect, it, vi } from "vitest";
import type { ProjectRepository } from "./repositories/project-repository.js";
import type { WebRoutineRepository } from "./repositories/routine-repository.js";
import type { SettingsRepository } from "./repositories/settings-repository.js";
import type { TaskRepository } from "./repositories/task-repository.js";
import type { TrashRepository } from "./repositories/trash-repository.js";
import { RoutinesView } from "./ui/routines-view/routines-view.js";
import { SettingsView } from "./ui/settings-view/settings-view.js";
import { TodayView } from "./ui/today-view/today-view.js";
import { TrashView } from "./ui/trash-view/trash-view.js";

// ============================================================
// モック Repository ファクトリ
// ============================================================

/** TodayView 用の最小限モック TaskRepository */
function makeMockTaskRepository(): TaskRepository {
  return {
    list: vi.fn(async () => []),
    create: vi.fn(async () => {
      throw new Error("not implemented");
    }),
    update: vi.fn(async () => {
      throw new Error("not implemented");
    }),
    delete: vi.fn(async () => undefined),
    complete: vi.fn(async () => {
      throw new Error("not implemented");
    }),
    today: vi.fn(async () => ({
      tasks: [],
      nextTaskId: null,
      currentTaskId: null,
      completionCount: 0,
    })),
    getFocus: vi.fn(async () => ({
      id: "singleton",
      currentTaskId: null,
      version: 1,
      updatedAt: "2026-06-07T09:00:00.000Z",
    })),
    setFocus: vi.fn(async () => {
      throw new Error("not implemented");
    }),
    getCounter: vi.fn(async () => ({
      id: "singleton",
      completedCount: 0,
      lastResetExecutedAt: null,
      version: 1,
      updatedAt: "2026-06-07T09:00:00.000Z",
    })),
  };
}

/** SettingsView 用の最小限モック SettingsRepository */
function makeMockSettingsRepository(): SettingsRepository {
  return {
    getSettings: vi.fn(async () => ({
      id: "singleton",
      dayBoundaryTime: "04:00",
      version: 1,
      updatedAt: "2026-06-07T09:00:00.000Z",
    })),
    patchSettings: vi.fn(async () => {
      throw new Error("not implemented");
    }),
  };
}

/** TrashView 用の最小限モック TrashRepository */
function makeMockTrashRepository(): TrashRepository {
  return {
    list: vi.fn(async () => []),
    listProjects: vi.fn(async () => []),
    restore: vi.fn(async () => {
      throw new Error("not implemented");
    }),
    empty: vi.fn(async () => undefined),
  };
}

/** TodayView 用の最小限モック ProjectRepository (BL-016). */
function makeMockProjectRepository(): ProjectRepository {
  return {
    list: vi.fn(async () => []),
    create: vi.fn(async () => {
      throw new Error("not implemented");
    }),
    update: vi.fn(async () => {
      throw new Error("not implemented");
    }),
    delete: vi.fn(async () => undefined),
  };
}

/** RoutinesView 用の最小限モック WebRoutineRepository (BL-017). */
function makeMockRoutineRepository(): WebRoutineRepository {
  return {
    list: vi.fn(async () => []),
    create: vi.fn(async () => {
      throw new Error("not implemented");
    }),
    update: vi.fn(async () => {
      throw new Error("not implemented");
    }),
    delete: vi.fn(async () => undefined),
  };
}

// ============================================================
// ルーティング構成の再現
//
// main.tsx の書き換え後（plan.md §D-001）を MemoryRouter で再現する:
//   Route path="/"       → <Navigate to="/today" replace />
//   Route path="/today"  → <TodayView repository={taskRepository} />
//   Route path="/settings" → <SettingsView repository={settingsRepository} />
//   Route path="/trash"  → <TrashView repository={trashRepository} />
// ============================================================

interface TestRouterProps {
  initialPath: string;
}

function TestRouter({ initialPath }: TestRouterProps) {
  const taskRepository = makeMockTaskRepository();
  const settingsRepository = makeMockSettingsRepository();
  const trashRepository = makeMockTrashRepository();
  const projectRepository = makeMockProjectRepository();
  const routineRepository = makeMockRoutineRepository();

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, networkMode: "offlineFirst" },
      mutations: { retry: false, networkMode: "offlineFirst" },
    },
  });

  return (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter
        initialEntries={[initialPath]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Routes>
          <Route path="/" element={<Navigate to="/today" replace />} />
          <Route
            path="/today"
            element={
              <TodayView repository={taskRepository} projectRepository={projectRepository} />
            }
          />
          <Route path="/settings" element={<SettingsView repository={settingsRepository} />} />
          <Route path="/trash" element={<TrashView repository={trashRepository} />} />
          <Route path="/routines" element={<RoutinesView repository={routineRepository} />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

// ============================================================
// spec.md §「ルーティング」
// ============================================================

describe("ルーティング (BL-014 Web クライアント基盤)", () => {
  /**
   * シナリオ: "/" へのアクセスは "/today" にリダイレクトされ TodayView が表示される
   *   Given ブラウザが "/" を開く
   *   When  ルーティングが解決される
   *   Then  URL が "/today" になり TodayView がレンダリングされる
   */
  it('シナリオ: "/" へのアクセスは "/today" にリダイレクトされ TodayView が表示される', async () => {
    // spec.md §「ルーティング」第 1 ケース:
    // "/"  → Navigate to="/today" replace → TodayView
    // 確認: <h1>今日</h1> が存在する
    render(<TestRouter initialPath="/" />);

    expect(await screen.findByRole("heading", { name: "今日" })).toBeInTheDocument();
  });

  /**
   * シナリオ: "/today" にアクセスすると TodayView が表示される
   *   Given ブラウザが "/today" を開く
   *   When  ルーティングが解決される
   *   Then  TodayView がレンダリングされる（<h1>今日</h1> が存在する）
   */
  it('シナリオ: "/today" にアクセスすると TodayView がレンダリングされる（<h1>今日</h1>）', async () => {
    // spec.md §「ルーティング」第 2 ケース
    render(<TestRouter initialPath="/today" />);

    expect(await screen.findByRole("heading", { name: "今日" })).toBeInTheDocument();
  });

  /**
   * シナリオ: "/settings" にアクセスすると SettingsView が表示される
   *   Given ブラウザが "/settings" を開く
   *   When  ルーティングが解決される
   *   Then  SettingsView がレンダリングされる（<h1>設定</h1> が存在する）
   */
  it('シナリオ: "/settings" にアクセスすると SettingsView がレンダリングされる（<h1>設定</h1>）', async () => {
    // spec.md §「ルーティング」第 3 ケース
    render(<TestRouter initialPath="/settings" />);

    expect(await screen.findByRole("heading", { name: "設定" })).toBeInTheDocument();
  });

  /**
   * シナリオ: "/trash" にアクセスすると TrashView が表示される
   *   Given ブラウザが "/trash" を開く
   *   When  ルーティングが解決される
   *   Then  TrashView がレンダリングされる（<h1>ゴミ箱</h1> が存在する）
   */
  it('シナリオ: "/trash" にアクセスすると TrashView がレンダリングされる（<h1>ゴミ箱</h1>）', async () => {
    // spec.md §「ルーティング」第 4 ケース
    render(<TestRouter initialPath="/trash" />);

    expect(await screen.findByRole("heading", { name: "ゴミ箱" })).toBeInTheDocument();
  });

  /**
   * シナリオ: "/routines" にアクセスすると RoutinesView が表示される
   *   Given ブラウザが "/routines" を開く
   *   When  ルーティングが解決される
   *   Then  RoutinesView がレンダリングされる（<h1>ルーティン</h1> が存在する）
   */
  it('シナリオ: "/routines" にアクセスすると RoutinesView がレンダリングされる', async () => {
    render(<TestRouter initialPath="/routines" />);

    expect(await screen.findByRole("heading", { name: "ルーティン" })).toBeInTheDocument();
  });
});
