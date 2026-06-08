/**
 * 単体テスト: ProjectsView (BL-016 / project-crud).
 *
 * 受け入れ基準の出典:
 *   - docs/developer/features/project-crud/spec.md §「Web クライアント - ProjectsView（プロジェクト管理 UI）」
 *
 * 観点:
 *   1. マウント時に repository.list() を呼び出してプロジェクト一覧が表示される。
 *   2. 名称を入力して作成ボタンを押すと repository.create() が呼ばれ一覧が更新される。
 *   3. 名称変更ボタンを押して名前を変更して保存すると repository.update() が呼ばれ一覧が更新される。
 *   4. 削除ボタンを押すと repository.delete() が呼ばれ一覧が更新される。
 *
 * 本ファイルは TDD の "red" を作るためのテスト。
 * projects-view.tsx は未実装のため、全テストはインポートエラー / 実行失敗する想定。
 * implementer が ProjectsView を実装することで green 化する。
 *
 * モック ProjectRepository を props 注入するパターンは trash-view.test.tsx と同形とする。
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ProjectsView } from "./projects-view.js";
import type {
  Project,
  ProjectRepository,
} from "../../repositories/project-repository.js";

// ============================================================
// QueryClientProvider ラッパー
// ============================================================

function renderWithQueryClient(ui: ReactNode): ReturnType<typeof render> {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity, networkMode: "offlineFirst" },
      mutations: { retry: false, networkMode: "offlineFirst" },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

// ============================================================
// テストフィクスチャ
// ============================================================

const NOW = "2026-06-07T09:00:00.000Z";
const PROJECT_ID_1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PROJECT_ID_2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: PROJECT_ID_1,
    name: "仕事",
    version: 1,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

// ============================================================
// モック ProjectRepository ファクトリ
// ============================================================

function makeMockRepository(initial: Project[] = []): ProjectRepository & {
  listMock: ReturnType<typeof vi.fn>;
  createMock: ReturnType<typeof vi.fn>;
  updateMock: ReturnType<typeof vi.fn>;
  deleteMock: ReturnType<typeof vi.fn>;
} {
  let state = [...initial];
  let nextId = 100;

  const listMock = vi.fn(async (): Promise<Project[]> => [...state]);
  const createMock = vi.fn(async (cmd: { id: string; name: string }): Promise<Project> => {
    const project = makeProject({
      id: cmd.id ?? String(nextId++),
      name: cmd.name,
      version: 1,
      createdAt: NOW,
      updatedAt: NOW,
    });
    state.push(project);
    return project;
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
  const deleteMock = vi.fn(async (cmd: { id: string; ifMatch: number }): Promise<void> => {
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

// ============================================================
// ProjectsView テスト
// ============================================================

describe("ProjectsView (BL-016 プロジェクト管理 UI)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ----------------------------------------------------------
  // spec.md §「プロジェクト一覧が表示される」
  // ----------------------------------------------------------

  /**
   * シナリオ: プロジェクト一覧が表示される
   *   Given プロジェクト「仕事」と「個人」が存在する
   *   When  /projects ページを開く（ProjectsView がマウントされる）
   *   Then  「仕事」と「個人」がリスト表示される
   */
  it("シナリオ: マウント時に repository.list() を呼び出してプロジェクト一覧が表示される", async () => {
    const P1 = makeProject({ id: PROJECT_ID_1, name: "仕事" });
    const P2 = makeProject({ id: PROJECT_ID_2, name: "個人" });
    const repo = makeMockRepository([P1, P2]);

    renderWithQueryClient(<ProjectsView repository={repo} />);

    // list() が 1 回呼ばれる
    expect(repo.listMock).toHaveBeenCalledTimes(1);

    // プロジェクト名が表示される
    expect(await screen.findByText("仕事")).toBeInTheDocument();
    expect(await screen.findByText("個人")).toBeInTheDocument();
  });

  /**
   * シナリオ: プロジェクトが 0 件のとき空一覧が表示される（エラーにならない）
   *   Given プロジェクトが 1 件も存在しない
   *   When  ProjectsView がマウントされる
   *   Then  プロジェクト名は表示されず、UI は描画できる
   */
  it("シナリオ: プロジェクトが 0 件のとき空一覧が描画できる", async () => {
    const repo = makeMockRepository([]);

    renderWithQueryClient(<ProjectsView repository={repo} />);

    expect(repo.listMock).toHaveBeenCalledTimes(1);

    // 「プロジェクト」の見出し（h1 または h2）が存在する
    expect(
      await screen.findByRole("heading", { name: /プロジェクト/ }),
    ).toBeInTheDocument();

    // タスク行は無い
    const items = screen.queryAllByRole("listitem");
    expect(items).toHaveLength(0);
  });

  // ----------------------------------------------------------
  // spec.md §「プロジェクトを作成できる」
  // ----------------------------------------------------------

  /**
   * シナリオ: プロジェクトを作成できる
   *   Given /projects ページが表示されている
   *   When  名称「趣味」を入力して作成ボタンを押す
   *   Then  repository.create() が呼ばれる
   *   And   「趣味」がプロジェクト一覧に追加される
   */
  it("シナリオ: 名称を入力して作成ボタンを押すと repository.create() が呼ばれ一覧が更新される", async () => {
    const repo = makeMockRepository([]);
    const user = userEvent.setup();

    renderWithQueryClient(<ProjectsView repository={repo} />);

    // 名称入力欄を探してテキストを入力
    const nameInput = await screen.findByLabelText(/名前|名称|プロジェクト名/);
    await user.type(nameInput, "趣味");

    // 作成ボタンをクリック
    const createButton = screen.getByRole("button", { name: /追加|作成|登録/ });
    await user.click(createButton);

    // create() が呼ばれる
    expect(repo.createMock).toHaveBeenCalledTimes(1);
    const arg = repo.createMock.mock.calls[0]?.[0] as { id: string; name: string };
    expect(arg.name).toBe("趣味");
    expect(typeof arg.id).toBe("string");

    // 一覧が再取得され「趣味」が表示される
    expect(await screen.findByText("趣味")).toBeInTheDocument();
  });

  // ----------------------------------------------------------
  // spec.md §「プロジェクトの名称を変更できる」
  // ----------------------------------------------------------

  /**
   * シナリオ: プロジェクトの名称を変更できる
   *   Given プロジェクト「仕事」が一覧に表示されている
   *   When  「仕事」の名称変更ボタンを押し、「仕事2」と入力して保存する
   *   Then  repository.update() が { id, ifMatch: version, name: "仕事2" } で呼ばれる
   *   And   一覧の表示が「仕事2」に更新される
   */
  it("シナリオ: 名称変更ボタンを押して名前を変更して保存すると repository.update() が呼ばれ一覧が更新される", async () => {
    const P1 = makeProject({ id: PROJECT_ID_1, name: "仕事", version: 1 });
    const repo = makeMockRepository([P1]);
    const user = userEvent.setup();

    renderWithQueryClient(<ProjectsView repository={repo} />);

    // プロジェクト名が表示されるまで待つ
    await screen.findByText("仕事");

    // 名称変更ボタンをクリック
    const editButton = await screen.findByRole("button", { name: /名称変更|編集|変更/ });
    await user.click(editButton);

    // 名称入力欄に新しい名前を入力
    const editInput = await screen.findByDisplayValue("仕事");
    await user.clear(editInput);
    await user.type(editInput, "仕事2");

    // 保存ボタンをクリック
    const saveButton = screen.getByRole("button", { name: /保存|更新/ });
    await user.click(saveButton);

    // update() が正しい引数で呼ばれる
    expect(repo.updateMock).toHaveBeenCalledTimes(1);
    const arg = repo.updateMock.mock.calls[0]?.[0] as { id: string; ifMatch: number; name: string };
    expect(arg.id).toBe(PROJECT_ID_1);
    expect(arg.ifMatch).toBe(1); // P1.version
    expect(arg.name).toBe("仕事2");

    // 一覧が更新されて「仕事2」が表示される
    expect(await screen.findByText("仕事2")).toBeInTheDocument();
  });

  // ----------------------------------------------------------
  // spec.md §「プロジェクトを削除できる」
  // ----------------------------------------------------------

  /**
   * シナリオ: プロジェクトを削除できる
   *   Given プロジェクト「仕事」が一覧に表示されている
   *   When  「仕事」の削除ボタンを押す
   *   Then  repository.delete() が { id, ifMatch: version } で呼ばれる
   *   And   「仕事」がプロジェクト一覧から消える
   */
  it("シナリオ: 削除ボタンを押すと repository.delete() が呼ばれ一覧が更新される", async () => {
    const P1 = makeProject({ id: PROJECT_ID_1, name: "仕事", version: 3 });
    const repo = makeMockRepository([P1]);
    const user = userEvent.setup();

    renderWithQueryClient(<ProjectsView repository={repo} />);

    // プロジェクト名が表示されるまで待つ
    await screen.findByText("仕事");

    // 削除ボタンをクリック
    const deleteButton = await screen.findByRole("button", { name: /削除/ });
    await user.click(deleteButton);

    // delete() が正しい引数で呼ばれる
    expect(repo.deleteMock).toHaveBeenCalledTimes(1);
    const arg = repo.deleteMock.mock.calls[0]?.[0] as { id: string; ifMatch: number };
    expect(arg.id).toBe(PROJECT_ID_1);
    expect(arg.ifMatch).toBe(3); // P1.version

    // 一覧から「仕事」が消える
    expect(screen.queryByText("仕事")).toBeNull();
  });
});
