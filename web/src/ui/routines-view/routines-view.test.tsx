import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
/**
 * 単体テスト: RoutinesView (BL-017 / routine).
 *
 * 受け入れ基準の出典:
 *   - docs/developer/features/routine/spec.md §「Web クライアント - RoutinesView」
 *   - docs/developer/features/routine/plan.md §D-008 Web クライアント
 *
 * 観点:
 *   1. マウント時に repository.list() を呼び出してルーティン一覧が表示される。
 *   2. 名称・生成曜日・既定優先度を入力して作成ボタンを押すと repository.create() が呼ばれ一覧が更新される。
 *   3. 各ルーティンに「編集」ボタンがあり、変更して保存すると repository.update() が呼ばれ一覧が更新される。
 *   4. 各ルーティンに「削除」ボタンがあり、押すと repository.delete() が呼ばれ一覧から消える。
 *
 * 本ファイルは TDD の "red" を作るためのテスト。
 * routines-view.tsx は未実装のため、全テストはインポートエラー / 実行失敗する想定。
 * implementer が RoutinesView を実装することで green 化する。
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WebRoutine, WebRoutineRepository } from "../../repositories/routine-repository.js";
import { RoutinesView } from "./routines-view.js";

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

const NOW = "2026-06-08T09:00:00.000Z";
const ROUTINE_ID_1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ROUTINE_ID_2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function makeRoutine(overrides: Partial<WebRoutine> = {}): WebRoutine {
  return {
    id: ROUTINE_ID_1,
    name: "朝の運動",
    daysOfWeek: [1, 2, 3, 4, 5],
    defaultPriority: "normal",
    version: 1,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

// ============================================================
// モック WebRoutineRepository ファクトリ
// ============================================================

function makeMockRepository(initial: WebRoutine[] = []): WebRoutineRepository & {
  listMock: ReturnType<typeof vi.fn>;
  createMock: ReturnType<typeof vi.fn>;
  updateMock: ReturnType<typeof vi.fn>;
  deleteMock: ReturnType<typeof vi.fn>;
} {
  let state = [...initial];
  let nextId = 100;

  const listMock = vi.fn(async (): Promise<WebRoutine[]> => [...state]);
  const createMock = vi.fn(
    async (cmd: {
      id: string;
      name: string;
      daysOfWeek: number[];
      defaultPriority: string;
    }): Promise<WebRoutine> => {
      const routine = makeRoutine({
        id: cmd.id ?? String(nextId++),
        name: cmd.name,
        daysOfWeek: cmd.daysOfWeek,
        defaultPriority: cmd.defaultPriority as "highest" | "normal" | "later",
        version: 1,
        createdAt: NOW,
        updatedAt: NOW,
      });
      state.push(routine);
      return routine;
    },
  );
  const updateMock = vi.fn(
    async (cmd: {
      id: string;
      ifMatch: number;
      name?: string;
      daysOfWeek?: number[];
      defaultPriority?: string;
    }): Promise<WebRoutine> => {
      const idx = state.findIndex((r) => r.id === cmd.id);
      if (idx < 0) throw new Error("routine not found");
      const updated: WebRoutine = {
        ...state[idx]!,
        ...(cmd.name !== undefined ? { name: cmd.name } : {}),
        ...(cmd.daysOfWeek !== undefined ? { daysOfWeek: cmd.daysOfWeek } : {}),
        ...(cmd.defaultPriority !== undefined
          ? { defaultPriority: cmd.defaultPriority as "highest" | "normal" | "later" }
          : {}),
        version: state[idx]!.version + 1,
        updatedAt: NOW,
      };
      state[idx] = updated;
      return updated;
    },
  );
  const deleteMock = vi.fn(async (cmd: { id: string; ifMatch: number }): Promise<void> => {
    state = state.filter((r) => r.id !== cmd.id);
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

// ============================================================
// RoutinesView テスト
// ============================================================

describe("RoutinesView (BL-017 ルーティン管理 UI)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ----------------------------------------------------------
  // spec.md §「ルーティン一覧が表示される」
  // ----------------------------------------------------------

  /**
   * シナリオ: ルーティン一覧が表示される
   *   Given ルーティン「朝の運動」と「夜の読書」が存在する
   *   When  /routines ページを開く（RoutinesView がマウントされる）
   *   Then  「朝の運動」と「夜の読書」がリスト表示される
   */
  it("シナリオ: マウント時に repository.list() を呼び出してルーティン一覧が表示される", async () => {
    const R1 = makeRoutine({ id: ROUTINE_ID_1, name: "朝の運動" });
    const R2 = makeRoutine({ id: ROUTINE_ID_2, name: "夜の読書", daysOfWeek: [6] });
    const repo = makeMockRepository([R1, R2]);

    renderWithQueryClient(<RoutinesView repository={repo} />);

    // list() が 1 回呼ばれる
    expect(repo.listMock).toHaveBeenCalledTimes(1);

    // ルーティン名が表示される
    expect(await screen.findByText("朝の運動")).toBeInTheDocument();
    expect(await screen.findByText("夜の読書")).toBeInTheDocument();
  });

  /**
   * シナリオ: ルーティンが 0 件のとき空一覧が表示される（エラーにならない）
   *   Given ルーティンが 1 件も存在しない
   *   When  RoutinesView がマウントされる
   *   Then  ルーティン名は表示されず、UI は描画できる
   */
  it("シナリオ: ルーティンが 0 件のとき空一覧が描画できる", async () => {
    const repo = makeMockRepository([]);

    renderWithQueryClient(<RoutinesView repository={repo} />);

    expect(repo.listMock).toHaveBeenCalledTimes(1);

    // 「ルーティン」の見出し（h1 または h2）が存在する
    expect(await screen.findByRole("heading", { name: /ルーティン/ })).toBeInTheDocument();

    // ルーティン行は無い
    const items = screen.queryAllByRole("listitem");
    expect(items).toHaveLength(0);
  });

  // ----------------------------------------------------------
  // spec.md §「ルーティンを作成できる」
  // plan.md §D-008 RoutinesView: 「追加」ボタンで作成フォームを開く
  // ----------------------------------------------------------

  /**
   * シナリオ: ルーティンを作成できる
   *   Given /routines ページが表示されている
   *   When  名称「夕方の散歩」、曜日（月・火・水）、優先度「普通」を入力して作成ボタンを押す
   *   Then  repository.create() が呼ばれる
   *   And   「夕方の散歩」がルーティン一覧に追加される
   */
  it("シナリオ: 名称を入力して作成ボタンを押すと repository.create() が呼ばれ一覧が更新される", async () => {
    const repo = makeMockRepository([]);
    const user = userEvent.setup();

    renderWithQueryClient(<RoutinesView repository={repo} />);

    // 名称入力欄を探してテキストを入力
    const nameInput = await screen.findByLabelText(/名前|名称|ルーティン名/);
    await user.type(nameInput, "夕方の散歩");

    // 作成ボタンをクリック
    const createButton = screen.getByRole("button", { name: /追加|作成|登録/ });
    await user.click(createButton);

    // create() が呼ばれる
    expect(repo.createMock).toHaveBeenCalledTimes(1);
    const arg = repo.createMock.mock.calls[0]?.[0] as {
      id: string;
      name: string;
      daysOfWeek: number[];
      defaultPriority: string;
    };
    expect(arg.name).toBe("夕方の散歩");
    expect(typeof arg.id).toBe("string");
    expect(Array.isArray(arg.daysOfWeek)).toBe(true);
    expect(arg.daysOfWeek.length).toBeGreaterThan(0);

    // 一覧が再取得され「夕方の散歩」が表示される
    expect(await screen.findByText("夕方の散歩")).toBeInTheDocument();
  });

  // ----------------------------------------------------------
  // spec.md §「ルーティンを編集できる」
  // plan.md §D-008 RoutinesView: 各ルーティンに「編集」ボタン
  // ----------------------------------------------------------

  /**
   * シナリオ: ルーティンの名称を変更できる
   *   Given ルーティン「朝の運動」が一覧に表示されている
   *   When  「朝の運動」の編集ボタンを押し、「夜の運動」と入力して保存する
   *   Then  repository.update() が { id, ifMatch: version, name: "夜の運動" } で呼ばれる
   *   And   一覧の表示が「夜の運動」に更新される
   */
  it("シナリオ: 名称変更ボタンを押して名前を変更して保存すると repository.update() が呼ばれ一覧が更新される", async () => {
    const R1 = makeRoutine({ id: ROUTINE_ID_1, name: "朝の運動", version: 1 });
    const repo = makeMockRepository([R1]);
    const user = userEvent.setup();

    renderWithQueryClient(<RoutinesView repository={repo} />);

    // ルーティン名が表示されるまで待つ
    await screen.findByText("朝の運動");

    // 編集ボタンをクリック
    const editButton = await screen.findByRole("button", { name: /名称変更|編集|変更/ });
    await user.click(editButton);

    // 名称入力欄に新しい名前を入力
    const editInput = await screen.findByDisplayValue("朝の運動");
    await user.clear(editInput);
    await user.type(editInput, "夜の運動");

    // 保存ボタンをクリック
    const saveButton = screen.getByRole("button", { name: /保存|更新/ });
    await user.click(saveButton);

    // update() が正しい引数で呼ばれる
    expect(repo.updateMock).toHaveBeenCalledTimes(1);
    const arg = repo.updateMock.mock.calls[0]?.[0] as {
      id: string;
      ifMatch: number;
      name: string;
    };
    expect(arg.id).toBe(ROUTINE_ID_1);
    expect(arg.ifMatch).toBe(1); // R1.version
    expect(arg.name).toBe("夜の運動");

    // 一覧が更新されて「夜の運動」が表示される
    expect(await screen.findByText("夜の運動")).toBeInTheDocument();
  });

  // ----------------------------------------------------------
  // spec.md §「ルーティンを削除できる」
  // plan.md §D-008 RoutinesView: 各ルーティンに「削除」ボタン
  // ----------------------------------------------------------

  /**
   * シナリオ: ルーティンを削除できる
   *   Given ルーティン「朝の運動」が一覧に表示されている
   *   When  「朝の運動」の削除ボタンを押す
   *   Then  repository.delete() が { id, ifMatch: version } で呼ばれる
   *   And   「朝の運動」がルーティン一覧から消える
   */
  it("シナリオ: 削除ボタンを押すと repository.delete() が呼ばれ一覧が更新される", async () => {
    const R1 = makeRoutine({ id: ROUTINE_ID_1, name: "朝の運動", version: 3 });
    const repo = makeMockRepository([R1]);
    const user = userEvent.setup();

    renderWithQueryClient(<RoutinesView repository={repo} />);

    // ルーティン名が表示されるまで待つ
    await screen.findByText("朝の運動");

    // 削除ボタンをクリック
    const deleteButton = await screen.findByRole("button", { name: /削除/ });
    await user.click(deleteButton);

    // delete() が正しい引数で呼ばれる
    expect(repo.deleteMock).toHaveBeenCalledTimes(1);
    const arg = repo.deleteMock.mock.calls[0]?.[0] as { id: string; ifMatch: number };
    expect(arg.id).toBe(ROUTINE_ID_1);
    expect(arg.ifMatch).toBe(3); // R1.version

    // 一覧から「朝の運動」が消える
    expect(screen.queryByText("朝の運動")).toBeNull();
  });
});
