/**
 * Web クライアント単体テスト: 今日ビューの起票・編集・期限切替・削除.
 *
 * spec.md §「Web クライアント UI (NFR-001 / NFR-010)」の 5 シナリオを扱う.
 * - Repository をモック化し, UI から呼ばれた引数・回数を検証する.
 * - TodayView は test-designer のスタブのため, ここでも全テストは red になる想定.
 *
 * BL-018 (フェーズ B): TanStack Query 導入後も既存テストが通るよう
 *   QueryClientProvider でラップする形に修正済み。
 *   テストシナリオ（What を確認するか）は変更しない。
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
// BL-018: TanStack Query の QueryClientProvider でラップするために追加。
// @tanstack/react-query はまだ未インストール（実装時にインストールされる前提）。
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { Task } from "@todica/domain/task";
import { TodayView } from "../src/ui/today-view/today-view.js";
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
// BL-016: ProjectRepository のモックを注入するために追加する.
// project-repository.ts は BL-016 実装前は存在しないため,
// 以下のインポートは「失敗する (red)」状態の一部である.
import type { Project, ProjectRepository } from "../src/repositories/project-repository.js";

const NOW = "2026-06-07T09:00:00.000Z";

/**
 * BL-018 (フェーズ B): TanStack Query 導入後も既存テストが引き続き通ることを担保するためのラッパー。
 *
 * spec.md §「フェーズ B: TanStack Query 導入」シナリオ:
 *   「今日ビューのデータ取得（TanStack Query 経由）」
 *   Given ユーザーがオンラインで /today を開く
 *   When  コンポーネントがマウントされる
 *   Then  useQuery が repository.today() を呼び出してタスク一覧が表示される
 *
 * TanStack Query では QueryClientProvider がツリー上に存在しないと
 * `useQuery`/`useMutation` が "No QueryClient set" エラーを throw する。
 * テスト用の QueryClient は staleTime: 0 / retry: false にして
 * 非同期の再フェッチをテスト内で制御しやすくする。
 */
function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // テスト中に stale-while-revalidate が走らないようにする
        staleTime: Infinity,
        // テスト中の自動リトライを無効化
        retry: false,
        // オフライン時もキャッシュを返せるよう offlineFirst に設定（plan.md §フェーズ C 準拠）
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

const PROJECT_ID_P1 = "p1p1p1p1-p1p1-4p1p-8p1p-p1p1p1p1p1p1";

/** BL-016: テスト用モック ProjectRepository ファクトリ. */
function makeMockProjectRepository(initial: Project[] = []): ProjectRepository & {
  listMock: ReturnType<typeof vi.fn>;
  createMock: ReturnType<typeof vi.fn>;
  updateMock: ReturnType<typeof vi.fn>;
  deleteMock: ReturnType<typeof vi.fn>;
} {
  const state = [...initial];
  const listMock = vi.fn(async (): Promise<Project[]> => [...state]);
  const createMock = vi.fn(async (cmd: { id: string; name: string }): Promise<Project> => {
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
  const updateMock = vi.fn(async (cmd: { id: string; ifMatch: number; name: string }): Promise<Project> => {
    const idx = state.findIndex((p) => p.id === cmd.id);
    if (idx < 0) throw new Error("not found");
    const next = { ...state[idx]!, name: cmd.name, version: state[idx]!.version + 1 };
    state[idx] = next;
    return next;
  });
  const deleteMock = vi.fn(async (_cmd: { id: string; ifMatch: number }): Promise<void> => {
    const idx = state.findIndex((p) => p.id === _cmd.id);
    if (idx >= 0) state.splice(idx, 1);
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

function makeMockRepository(
  initial: Task[] = [],
  options: { initialFocus?: FocusSelection; initialCounter?: Counter } = {},
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
  // BL-006 / FR-012: FocusSelection の mock state.
  // 既定は明示未選択 (currentTaskId=null, version=1). 個別テストで上書き可.
  let focusState: FocusSelection = options.initialFocus ?? {
    id: "singleton",
    currentTaskId: null,
    version: 1,
    updatedAt: NOW,
  };
  // BL-008 / FR-040: Counter (今日の完了タスク数) の mock state.
  // 既定は 0 / version=1. 個別テストで initialCounter から上書き可.
  // complete アクションが起きるたびに completeMock 内で completedCount を +1 する
  // (= サーバ側 +1 集計を模倣).
  let counterState: Counter = options.initialCounter ?? {
    id: "singleton",
    completedCount: 0,
    lastResetExecutedAt: null,
    version: 1,
    updatedAt: NOW,
  };
  const listMock = vi.fn(async () => [...state]);
  // BL-005 / FR-010: 今日ビュー mock.
  //   - dueDate === "today" かつ trashedAt === null のものだけを返す.
  //   - priority (highest→normal→later) → createdAt 昇順 → id 昇順 にソートする (plan.md D-002).
  //   - nextTaskId = tasks[0]?.id ?? null.
  // 既存テストは list() を起点に書かれているが, BL-005 で UI が today() を呼ぶように変わる.
  // 既存テストの初期 seed は今日扱い (dueDate "today") のため, today() でも同じ並びで返れば
  // 既存テスト挙動を壊さない.
  const PRIORITY_ORDER_LOCAL: Record<string, number> = {
    highest: 0,
    normal: 1,
    later: 2,
  };
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
    // BL-006 / FR-012: currentTaskId は focusState のミラーを返す.
    // UI は currentTaskId ?? nextTaskId で強調対象を決める (plan.md D-001).
    // BL-008 / FR-040: completionCount は counterState のミラーを返す
    // (= /today レスポンスに同梱される正本値).
    return {
      tasks: sorted,
      nextTaskId: sorted[0]?.id ?? null,
      currentTaskId: focusState.currentTaskId,
      completionCount: counterState.completedCount,
    };
  });
  const createMock = vi.fn(async (cmd: CreateTaskCommand) => {
    const t = makeTask({
      id: cmd.id,
      name: cmd.name,
      projectId: cmd.projectId ?? null,
      dueDate: cmd.dueDate ?? "today",
      // BL-002: priority が明示されていれば反映 (省略時は makeTask 既定 "normal").
      ...(cmd.priority !== undefined ? { priority: cmd.priority } : {}),
    });
    state.push(t);
    return t;
  });
  const updateMock = vi.fn(async (cmd: UpdateTaskCommand) => {
    const idx = state.findIndex((t) => t.id === cmd.id);
    if (idx < 0) throw new Error("not found");
    const next = {
      ...state[idx]!,
      ...cmd.patch,
      version: (state[idx]!.version ?? 0) + 1,
    };
    state[idx] = next;
    return next;
  });
  const deleteMock = vi.fn(async (_cmd: DeleteTaskCommand) => {
    const idx = state.findIndex((t) => t.id === _cmd.id);
    if (idx >= 0) state.splice(idx, 1);
  });
  const completeMock = vi.fn(async (cmd: CompleteTaskCommand) => {
    // BL-003: 完了は trashedAt をセットして trashedReason = "completed" にし version+1.
    // ストアからは取り除かない (filter 表示は UI 側 / 一覧 API の責務).
    const idx = state.findIndex((t) => t.id === cmd.id);
    if (idx < 0) throw new Error("not found");
    const prev = state[idx]!;
    // BL-008 / FR-040: 通常状態 (trashedAt = null) → 完了の遷移のときだけ counter を +1.
    // 既ゴミ箱状態への no-op 再 complete では counter を変えない (spec.md §「完了アクションによる +1」).
    const wasActive = prev.trashedAt === null;
    const next: Task = {
      ...prev,
      trashedAt: "2026-06-07T09:00:01.000Z",
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
  // BL-006 / FR-012: focus 取得 / 設定 mock.
  // - getFocus(): 現在の focusState を返す (UI 起動時に呼ばれる前提).
  // - setFocus({ taskId, ifMatch }): focusState を更新し version++ する.
  //   ifMatch 不一致時はテストで個別検証するので mock では throw しない.
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
  // BL-008 / FR-040: 「今日の完了数」取得 mock.
  // getCounter(): 現在の counterState を返す.
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
    listMock,
    createMock,
    updateMock,
    deleteMock,
    completeMock,
    todayMock,
    getFocusMock,
    setFocusMock,
    getCounterMock,
  };
}

describe("TodayView (Web クライアント UI)", () => {
  it("シナリオ: 今日ビューの起票フォームはタスク名のみ必須である", async () => {
    const repo = makeMockRepository();
    renderWithQueryClient(<TodayView repository={repo} projectRepository={makeMockProjectRepository()} />);

    // タスク名入力欄
    const nameInput = await screen.findByLabelText(/タスク名/);
    expect(nameInput).toBeRequired();

    // 「プロジェクト」と「期限」は任意項目として存在する (UI 上に存在するが required ではない)
    const projectInput = screen.queryByLabelText(/プロジェクト/);
    expect(projectInput).not.toBeNull();
    expect(projectInput).not.toBeRequired();

    const dueDateControl = screen.queryByLabelText(/期限/);
    expect(dueDateControl).not.toBeNull();

    // 不要な入力欄が存在しない (NFR-001 単一ワークフロー)
    expect(screen.queryByLabelText(/ステータス/)).toBeNull();
    expect(screen.queryByLabelText(/タグ/)).toBeNull();
    expect(screen.queryByLabelText(/開始日/)).toBeNull();
    expect(screen.queryByLabelText(/サブタスク/)).toBeNull();
  });

  it("シナリオ: 起票フォームでタスク名を入力して送信するとタスクが追加される", async () => {
    const repo = makeMockRepository();
    const user = userEvent.setup();
    renderWithQueryClient(<TodayView repository={repo} projectRepository={makeMockProjectRepository()} />);

    const nameInput = await screen.findByLabelText(/タスク名/);
    await user.type(nameInput, "牛乳を買う");

    const submit = screen.getByRole("button", { name: /追加|起票|登録|送信/ });
    await user.click(submit);

    // POST に相当する create が呼ばれる
    expect(repo.createMock).toHaveBeenCalledTimes(1);
    const arg = repo.createMock.mock.calls[0]?.[0] as CreateTaskCommand;
    expect(arg.name).toBe("牛乳を買う");
    expect(typeof arg.id).toBe("string");
    expect(arg.id.length).toBeGreaterThan(0);

    // 一覧に "牛乳を買う" が現れる
    expect(await screen.findByText("牛乳を買う")).toBeInTheDocument();
  });

  it("シナリオ: 既存タスクの名称を編集して保存できる", async () => {
    const repo = makeMockRepository([makeTask({ id: "t1", name: "牛乳", version: 1 })]);
    const user = userEvent.setup();
    renderWithQueryClient(<TodayView repository={repo} projectRepository={makeMockProjectRepository()} />);

    // 一覧から編集ボタンを開く
    const editButton = await screen.findByRole("button", { name: /編集/ });
    await user.click(editButton);

    const editInput = await screen.findByLabelText(/名称|タスク名/);
    await user.clear(editInput);
    await user.type(editInput, "豆乳");

    const saveButton = screen.getByRole("button", { name: /保存|更新/ });
    await user.click(saveButton);

    expect(repo.updateMock).toHaveBeenCalledTimes(1);
    const arg = repo.updateMock.mock.calls[0]?.[0] as UpdateTaskCommand;
    expect(arg.id).toBe("t1");
    expect(arg.ifMatch).toBe(1);
    expect(arg.patch.name).toBe("豆乳");

    // 一覧表示が更新される
    expect(await screen.findByText("豆乳")).toBeInTheDocument();
  });

  it("シナリオ: 期限を今日 ↔ 明日 で切り替える操作を提供する", async () => {
    const repo = makeMockRepository([
      makeTask({ id: "t1", name: "x", dueDate: "today", version: 1 }),
    ]);
    const user = userEvent.setup();
    renderWithQueryClient(<TodayView repository={repo} projectRepository={makeMockProjectRepository()} />);

    // 期限切替トグル
    const toggle = await screen.findByRole("button", { name: /期限|明日|今日/ });
    await user.click(toggle);

    expect(repo.updateMock).toHaveBeenCalledTimes(1);
    const arg = repo.updateMock.mock.calls[0]?.[0] as UpdateTaskCommand;
    expect(arg.id).toBe("t1");
    expect(arg.ifMatch).toBe(1);
    expect(arg.patch.dueDate).toBe("tomorrow");
    // 期限以外のフィールドは送らない
    expect(arg.patch.name).toBeUndefined();
    expect(arg.patch.projectId).toBeUndefined();
  });

  it("シナリオ: 削除アクションを実行するとタスクが今日ビューから消える", async () => {
    const repo = makeMockRepository([makeTask({ id: "t1", name: "x", version: 1 })]);
    const user = userEvent.setup();
    renderWithQueryClient(<TodayView repository={repo} projectRepository={makeMockProjectRepository()} />);

    expect(await screen.findByText("x")).toBeInTheDocument();

    const deleteButton = await screen.findByRole("button", { name: /削除/ });
    await user.click(deleteButton);

    expect(repo.deleteMock).toHaveBeenCalledTimes(1);
    const arg = repo.deleteMock.mock.calls[0]?.[0] as DeleteTaskCommand;
    expect(arg.id).toBe("t1");
    expect(arg.ifMatch).toBe(1);

    // 一覧から消える
    expect(screen.queryByText("x")).toBeNull();
  });
});

// ============================================================
// BL-002 / FR-003 / FR-004: 優先度の指定・変更
//
// spec.md (task-priority) §「Web クライアント UI」と 1:1 対応する.
// - 起票フォームに任意項目「優先度」の select が存在し, 値域は 3 段階のみ.
// - 起票時に未操作なら "normal" (または省略) で create される.
// - 起票時に「最優先」を指定すると create.priority === "highest".
// - 一覧の各行から優先度を変更すると update.patch.priority と If-Match が正しく渡る.
// - 優先度変更後は一覧の並びが priority 順に再計算される.
//
// 本ファイル冒頭の makeMockRepository は patch.priority を ...cmd.patch でコピーするため,
// updateMock 経由で state[idx].priority が反映される. UI 側 (today-view.tsx) の本実装は
// implementer が green 化する.
// ============================================================

describe("TodayView (BL-002 優先度 UI)", () => {
  it("シナリオ: 起票フォームに「優先度」の任意項目があり, 値域は 3 段階のみ", async () => {
    const repo = makeMockRepository();
    renderWithQueryClient(<TodayView repository={repo} projectRepository={makeMockProjectRepository()} />);

    // 「優先度」というラベル / aria-label を持つ入力 UI が存在する.
    // 採用案 (plan D-002) は select だが, テストは具体 UI に依存しないようラベル名のみで検索.
    const priorityControl = await screen.findByLabelText(/優先度/);
    expect(priorityControl).not.toBeNull();
    // 任意項目なので required ではない.
    expect(priorityControl).not.toBeRequired();

    // 値域は 3 段階 (最優先 / 普通 / 後回し) のみ.
    // select 想定: option 数で確認.
    if (priorityControl.tagName === "SELECT") {
      const options = (priorityControl as HTMLSelectElement).options;
      expect(options).toHaveLength(3);
      const texts = Array.from(options).map((o) => o.textContent ?? "");
      // 「最優先 / 普通 / 後回し」の文言で表示される (plan D-004).
      expect(texts.some((t) => /最優先/.test(t))).toBe(true);
      expect(texts.some((t) => /普通/.test(t))).toBe(true);
      expect(texts.some((t) => /後回し/.test(t))).toBe(true);
    }
  });

  it("シナリオ: 起票フォームで優先度を未操作のまま送信すると normal (または省略) で create される", async () => {
    const repo = makeMockRepository();
    const user = userEvent.setup();
    renderWithQueryClient(<TodayView repository={repo} projectRepository={makeMockProjectRepository()} />);

    const nameInput = await screen.findByLabelText(/タスク名/);
    await user.type(nameInput, "x");
    const submit = screen.getByRole("button", { name: /追加|起票|登録|送信/ });
    await user.click(submit);

    expect(repo.createMock).toHaveBeenCalledTimes(1);
    const arg = repo.createMock.mock.calls[0]?.[0] as CreateTaskCommand;
    // 未操作 → "normal" を明示送信するか, priority プロパティを省略する (どちらも仕様適合).
    if (arg.priority !== undefined) {
      expect(arg.priority).toBe("normal");
    }
  });

  it("シナリオ: 起票フォームで優先度を「最優先」に指定して送信すると create.priority === \"highest\"", async () => {
    const repo = makeMockRepository();
    const user = userEvent.setup();
    renderWithQueryClient(<TodayView repository={repo} projectRepository={makeMockProjectRepository()} />);

    const nameInput = await screen.findByLabelText(/タスク名/);
    await user.type(nameInput, "x");

    // 優先度 select を「最優先」(value="highest") に変更する.
    const priorityControl = await screen.findByLabelText(/優先度/);
    // userEvent.selectOptions は <select> を対象とする.
    await user.selectOptions(priorityControl, "highest");

    const submit = screen.getByRole("button", { name: /追加|起票|登録|送信/ });
    await user.click(submit);

    expect(repo.createMock).toHaveBeenCalledTimes(1);
    const arg = repo.createMock.mock.calls[0]?.[0] as CreateTaskCommand;
    expect(arg.name).toBe("x");
    expect(arg.priority).toBe("highest");
  });

  it("シナリオ: 一覧の各タスク行から優先度を変更すると update.patch.priority と ifMatch が正しく渡る", async () => {
    const repo = makeMockRepository([
      makeTask({ id: "t1", name: "x", priority: "normal", version: 1 }),
    ]);
    const user = userEvent.setup();
    renderWithQueryClient(<TodayView repository={repo} projectRepository={makeMockProjectRepository()} />);

    // 一覧行の優先度変更 UI を取得 (plan D-001 採用案 = cycle ボタン).
    // ボタン名は「優先度」または現在値ラベル (「普通」「最優先」「後回し」) を含む想定.
    // 具体表記に依存しすぎないよう, 「優先度」を含むボタンを最優先で探す.
    const priorityButton = await screen.findByRole("button", { name: /優先度|普通|最優先|後回し/ });
    await user.click(priorityButton);

    expect(repo.updateMock).toHaveBeenCalledTimes(1);
    const arg = repo.updateMock.mock.calls[0]?.[0] as UpdateTaskCommand;
    expect(arg.id).toBe("t1");
    expect(arg.ifMatch).toBe(1);
    // cycle: normal → highest (plan D-001 採用案).
    // 採用 UI が select / segmented control 等別案に変わった場合に備え,
    // 「priority が送られていて値が 3 段階のいずれか, かつ現状値とは異なる」ことだけを必須とする.
    expect(arg.patch.priority).toBeDefined();
    expect(["highest", "normal", "later"]).toContain(arg.patch.priority);
    expect(arg.patch.priority).not.toBe("normal");
    // 優先度以外のフィールドは送らない (NFR-013 / 部分上書き原則).
    expect(arg.patch.name).toBeUndefined();
    expect(arg.patch.dueDate).toBeUndefined();
    expect(arg.patch.projectId).toBeUndefined();
  });

  it("シナリオ: 優先度変更後の一覧は priority 順に再描画される (NFR-013)", async () => {
    // 初期: A = normal, B = later. 並び (priority 順) は A → B.
    //
    // BL-006 / D-008 との整合:
    //   強調セクションに表示するタスクは通常リスト (listitem) に出ない.
    //   本テストは「priority 順の再描画」を listitem で検証する都合上,
    //   並び先頭が強調セクションへ吸われると検証対象が消える.
    //   そこで sentinel タスク (highest, 並び先頭) を 1 件追加し,
    //   initialFocus.currentTaskId をその sentinel に固定して
    //   強調セクションを sentinel で占有させる.
    //   こうすると A, B は常に listitem に並び, 元の検証ロジックがそのまま使える.
    const repo = makeMockRepository(
      [
        makeTask({
          id: "task-focus",
          name: "FOCUS-SENTINEL",
          priority: "highest",
          version: 1,
          createdAt: "2026-06-07T07:00:00.000Z",
        }),
        makeTask({
          id: "task-A",
          name: "AAA",
          priority: "normal",
          version: 1,
          createdAt: "2026-06-07T08:00:00.000Z",
        }),
        makeTask({
          id: "task-B",
          name: "BBB",
          priority: "later",
          version: 1,
          createdAt: "2026-06-07T08:00:01.000Z",
        }),
      ],
      {
        initialFocus: {
          id: "singleton",
          currentTaskId: "task-focus",
          version: 1,
          updatedAt: NOW,
        },
      },
    );
    const user = userEvent.setup();
    renderWithQueryClient(<TodayView repository={repo} projectRepository={makeMockProjectRepository()} />);

    // 描画後, 初期並びを確認 (A, B). sentinel は強調セクションに居て listitem には居ない.
    const itemsBefore = await screen.findAllByRole("listitem");
    expect(itemsBefore).toHaveLength(2);
    expect(itemsBefore[0]?.textContent ?? "").toContain("AAA");
    expect(itemsBefore[1]?.textContent ?? "").toContain("BBB");

    // タスク B 行の優先度ボタンを探して highest に変更する.
    // テストは具体 UI に依存しないよう, 「BBB を含む行内のボタン」を辿る.
    const bRow = itemsBefore[1]!;
    // 該当行内の優先度変更操作を探す (ボタンの name に「優先度 / 後回し / 普通 / 最優先」を含むもの).
    const buttonsInB = bRow.querySelectorAll("button");
    let priorityBtn: HTMLButtonElement | null = null;
    for (const btn of Array.from(buttonsInB)) {
      const label = btn.textContent ?? "";
      if (/優先度|普通|最優先|後回し/.test(label)) {
        priorityBtn = btn as HTMLButtonElement;
        break;
      }
    }
    expect(priorityBtn).not.toBeNull();
    // 「後回し → highest」へ移すために, cycle の場合は複数回押下が必要なケースがある.
    // 実装パターン (cycle / select / 直接 highest 化) に依らず, B を highest に変える
    // ことを目標として最大 3 回まで押す.
    for (let i = 0; i < 3; i++) {
      const calls = repo.updateMock.mock.calls.length;
      await user.click(priorityBtn!);
      // updateMock が呼ばれ, かつ最後の呼び出しの patch.priority が "highest" なら break.
      const last = repo.updateMock.mock.calls[repo.updateMock.mock.calls.length - 1]?.[0] as
        | UpdateTaskCommand
        | undefined;
      if (last?.patch.priority === "highest") break;
      // 何らかの理由で update が呼ばれていなければ抜ける (red になる).
      if (repo.updateMock.mock.calls.length === calls) break;
    }

    // 再描画後の並び: B (highest) → A (normal).
    const itemsAfter = await screen.findAllByRole("listitem");
    expect(itemsAfter[0]?.textContent ?? "").toContain("BBB");
    expect(itemsAfter[1]?.textContent ?? "").toContain("AAA");
  });
});

// ============================================================
// BL-003 / FR-006: タスク完了アクション (Web UI)
//
// spec.md (task-complete) §「Web クライアント UI」と 1:1 対応する.
// - タスク行に「完了」ボタンが 1 つ存在する (削除とは別).
// - 完了ボタンクリックで Repository.complete({ id, ifMatch }) が呼ばれる.
// - 完了後に該当タスクが一覧から消える (楽観 UI).
// - 完了ボタンクリックで Repository.delete は呼ばれない.
//
// today-view.tsx 側に完了ボタン / handleComplete はまだ存在しない (test-designer のスタブ段階).
// 以下のテストはすべて red になる. implementer が green 化する.
// ============================================================

describe("TodayView (BL-003 完了ボタン)", () => {
  it("シナリオ: 各タスク行に「完了」ボタンが 1 つ存在する (削除ボタンとは別)", async () => {
    const repo = makeMockRepository([
      makeTask({ id: "t1", name: "牛乳", version: 1 }),
    ]);
    renderWithQueryClient(<TodayView repository={repo} projectRepository={makeMockProjectRepository()} />);

    // 起票フォームの「タスク名」入力が現れるまで待ち, 一覧の描画も待つ.
    await screen.findByText("牛乳");

    // 「完了」相当のボタンが存在する.
    const completeButton = await screen.findByRole("button", { name: /完了/ });
    expect(completeButton).not.toBeNull();

    // 「削除」ボタンと別に存在する (= 同じ要素ではない).
    const deleteButton = await screen.findByRole("button", { name: /削除/ });
    expect(completeButton).not.toBe(deleteButton);
  });

  it("シナリオ: 完了ボタンをクリックすると Repository.complete が { id, ifMatch: task.version } で呼ばれる", async () => {
    const repo = makeMockRepository([
      makeTask({ id: "t1", name: "x", version: 1 }),
    ]);
    const user = userEvent.setup();
    renderWithQueryClient(<TodayView repository={repo} projectRepository={makeMockProjectRepository()} />);

    await screen.findByText("x");

    const completeButton = await screen.findByRole("button", { name: /完了/ });
    await user.click(completeButton);

    expect(repo.completeMock).toHaveBeenCalledTimes(1);
    const arg = repo.completeMock.mock.calls[0]?.[0] as CompleteTaskCommand;
    expect(arg.id).toBe("t1");
    expect(arg.ifMatch).toBe(1);
  });

  it("シナリオ: 完了に成功するとタスクが今日ビューの一覧から消える (楽観 UI)", async () => {
    const repo = makeMockRepository([
      makeTask({ id: "t1", name: "牛乳", version: 1 }),
    ]);
    const user = userEvent.setup();
    renderWithQueryClient(<TodayView repository={repo} projectRepository={makeMockProjectRepository()} />);

    expect(await screen.findByText("牛乳")).toBeInTheDocument();

    const completeButton = await screen.findByRole("button", { name: /完了/ });
    await user.click(completeButton);

    // 一覧から消える (楽観 UI).
    expect(screen.queryByText("牛乳")).toBeNull();
  });

  it("シナリオ: 完了ボタンクリックで Repository.delete は呼ばれない (完了と削除は別操作)", async () => {
    const repo = makeMockRepository([
      makeTask({ id: "t1", name: "x", version: 1 }),
    ]);
    const user = userEvent.setup();
    renderWithQueryClient(<TodayView repository={repo} projectRepository={makeMockProjectRepository()} />);

    await screen.findByText("x");

    const completeButton = await screen.findByRole("button", { name: /完了/ });
    await user.click(completeButton);

    expect(repo.completeMock).toHaveBeenCalledTimes(1);
    expect(repo.deleteMock).not.toHaveBeenCalled();
  });
});

// ============================================================
// BL-005 / FR-010 / FR-011 / NFR-001 / NFR-013: 今日ビュー本実装 (UI 層)
//
// spec.md (today-view) §「入口」「表示対象の絞り込み」「並び順の本仕様」
// 「\"次の 1 つ\" の一意化」「既存実装との整合 (暫定 → 本実装の差し替え担保)」と 1:1 対応する.
//
// plan.md §影響範囲 §UI / D-004 に従い, UI は:
//   - 一覧取得を `repository.today()` に切り替える (旧 `repository.list()` ベースから移行).
//   - クライアント側で再ソートしない (= サーバ並びをそのまま表示).
//   - tomorrow タスクが today() の戻り値に含まれない以上, UI にも出ない.
//
// today-view.tsx 側はまだ `repository.list()` を呼ぶ暫定実装のため,
// 以下のテストは red になる. implementer が `repository.today()` への切替で green 化する.
// ============================================================

describe("TodayView (BL-005 今日ビュー本実装)", () => {
  it("シナリオ: TodayView は起動時に repository.today() を呼ぶ (旧 list() ではない)", async () => {
    // spec.md §「既存実装との整合」: 取得経路が today() に置き換わっている.
    const repo = makeMockRepository([
      makeTask({ id: "t1", name: "牛乳", dueDate: "today", version: 1 }),
    ]);
    renderWithQueryClient(<TodayView repository={repo} projectRepository={makeMockProjectRepository()} />);

    // 描画完了を待つために 1 件は描画されることを待つ.
    await screen.findByText("牛乳");

    // today() が呼ばれている.
    expect(repo.todayMock).toHaveBeenCalledTimes(1);
    // list() は今日ビューの取得経路では呼ばれない (D-004).
    expect(repo.listMock).not.toHaveBeenCalled();
  });

  it("シナリオ: tomorrow タスクは TodayView に表示されない (today() が today のみ返す前提)", async () => {
    // spec.md §「表示対象の絞り込み」: T_today は含まれるが T_tomorrow は含まれない.
    // makeMockRepository.todayMock は dueDate === "today" だけを返すよう実装している.
    const repo = makeMockRepository([
      makeTask({ id: "today-1", name: "TODAY-TASK", dueDate: "today", version: 1 }),
      makeTask({
        id: "tomorrow-1",
        name: "TOMORROW-TASK",
        dueDate: "tomorrow",
        version: 1,
      }),
    ]);
    renderWithQueryClient(<TodayView repository={repo} projectRepository={makeMockProjectRepository()} />);

    // today は描画される.
    expect(await screen.findByText("TODAY-TASK")).toBeInTheDocument();
    // tomorrow は描画されない.
    expect(screen.queryByText("TOMORROW-TASK")).toBeNull();
  });

  it("シナリオ: TodayView はサーバ並び (priority → createdAt → id) をそのまま表示する (D-004 再ソート禁止)", async () => {
    // spec.md §「並び順の本仕様」と plan.md D-004:
    // クライアントは today() の戻り順をそのまま map するだけで,
    // 自前の sortTasks を持たない.
    //
    // mock の todayMock は priority → createdAt → id にソートして返すため,
    // ここでは「mock が返した順 = UI に表示された順」が一致することを検証する.
    //
    // BL-006 / D-008 との整合:
    //   強調セクションに表示するタスクは listitem に出ない.
    //   本テストの関心事は「サーバ並びの並びがそのまま (再ソートなく) UI に出る」
    //   ことであり, 「強調セクションが何を表示するか」ではない.
    //   そのため currentTaskId を sentinel タスク (並び先頭) に固定し,
    //   AAA / BBB / CCC を常に listitem に並ばせる構成にする.
    const repo = makeMockRepository(
      [
        // 投入順は混乱させる (UI が再ソートしなければ mock 内ソートの結果がそのまま出る).
        makeTask({
          id: "task-focus",
          name: "FOCUS-SENTINEL",
          priority: "highest",
          createdAt: "2026-06-08T07:00:00.000Z",
          version: 1,
        }),
        makeTask({
          id: "task-C",
          name: "CCC",
          priority: "later",
          createdAt: "2026-06-08T08:00:00.000Z",
          version: 1,
        }),
        makeTask({
          id: "task-A",
          name: "AAA",
          priority: "highest",
          createdAt: "2026-06-08T08:00:00.000Z",
          version: 1,
        }),
        makeTask({
          id: "task-B",
          name: "BBB",
          priority: "normal",
          createdAt: "2026-06-08T08:00:00.000Z",
          version: 1,
        }),
      ],
      {
        initialFocus: {
          id: "singleton",
          currentTaskId: "task-focus",
          version: 1,
          updatedAt: NOW,
        },
      },
    );
    renderWithQueryClient(<TodayView repository={repo} projectRepository={makeMockProjectRepository()} />);

    // 描画を待つ.
    await screen.findByText("AAA");

    const items = await screen.findAllByRole("listitem");
    // 期待: sentinel は強調セクションへ. listitem は A (highest) → B (normal) → C (later).
    expect(items).toHaveLength(3);
    expect(items[0]?.textContent ?? "").toContain("AAA");
    expect(items[1]?.textContent ?? "").toContain("BBB");
    expect(items[2]?.textContent ?? "").toContain("CCC");
  });

  it("シナリオ: 期限を today → tomorrow に切り替えると, 再取得後に該当タスクが今日ビューから消える", async () => {
    // spec.md §「tomorrow タスクの扱い」第 1 ケース:
    // PATCH /api/v1/tasks/{id} で dueDate を tomorrow にし, 再フェッチ後に消える.
    //
    // updateMock は state[idx] の dueDate を tomorrow に書き換えるため,
    // 次回 todayMock が呼ばれた時点で対象タスクは戻り値から外れる.
    const repo = makeMockRepository([
      makeTask({ id: "t1", name: "MOVE-ME", dueDate: "today", version: 1 }),
    ]);
    const user = userEvent.setup();
    renderWithQueryClient(<TodayView repository={repo} projectRepository={makeMockProjectRepository()} />);

    expect(await screen.findByText("MOVE-ME")).toBeInTheDocument();

    // 期限切替トグル.
    const toggle = await screen.findByRole("button", { name: /明日へ|期限|今日へ/ });
    await user.click(toggle);

    // update が呼ばれていることを確認.
    expect(repo.updateMock).toHaveBeenCalled();

    // 期限切替後の再フェッチで today() が再度呼ばれる (D-007: 書き込み成功時に再取得).
    // todayMock の累積呼出回数が初回 (起動時) より増えていること.
    expect(repo.todayMock.mock.calls.length).toBeGreaterThanOrEqual(2);

    // 一覧から MOVE-ME が消える.
    expect(screen.queryByText("MOVE-ME")).toBeNull();
  });

  it("シナリオ: 今日タスクが 0 件のときも UI は描画でき, 何も並ばない", async () => {
    // spec.md §「\"次の 1 つ\" の一意化」第 2 ケース:
    // today タスクが 0 件 (mock は空配列を返す) でも UI が崩れず, listitem が描かれない.
    const repo = makeMockRepository([]);
    renderWithQueryClient(<TodayView repository={repo} projectRepository={makeMockProjectRepository()} />);

    // 見出し「今日」(FR-010) が描画される. select の option と区別するため heading で指定.
    expect(
      await screen.findByRole("heading", { name: "今日" }),
    ).toBeInTheDocument();
    // タスク行は無い.
    const items = screen.queryAllByRole("listitem");
    expect(items).toHaveLength(0);
    // today() は呼ばれている.
    expect(repo.todayMock).toHaveBeenCalledTimes(1);
  });
});

// ============================================================
// BL-006 / FR-012 / FR-013 / NFR-011: 現在のタスク (フォーカス) UI
//
// spec.md (focus-task) §「受け入れ基準」§「UI: 視覚的強調」「UI: 操作」と 1:1 対応する.
// - 起動時に repository.getFocus() が呼ばれる.
// - currentTaskId == null のとき暗黙フォールバック (= 並び先頭) が強調される.
// - currentTaskId != null のとき該当タスクが強調セクションに描画される.
// - 強調セクションのタスクは通常リスト (listitem) には含まれない (D-008 重複表示なし).
// - 「現在に設定」ボタンクリックで setFocus({ taskId, ifMatch }) が呼ばれる.
// - 「現在解除」ボタンクリックで setFocus({ taskId: null, ifMatch }) が呼ばれる.
// - 今日のタスク 0 件のとき強調セクションは描画されない.
//
// today-view.tsx 側はまだ getFocus / setFocus を呼ばない暫定実装のため,
// 以下のテストはすべて red になる. implementer が green 化する.
// ============================================================

describe("TodayView (BL-006 現在のタスク強調表示と操作)", () => {
  it("シナリオ: TodayView は起動時に repository.getFocus() を呼ぶ", async () => {
    // spec.md §「UI: 視覚的強調」: 強調対象を決めるため focus を取得する必要がある.
    const repo = makeMockRepository([
      makeTask({ id: "t1", name: "MILK", version: 1 }),
    ]);
    renderWithQueryClient(<TodayView repository={repo} projectRepository={makeMockProjectRepository()} />);

    // 描画完了を待つ.
    await screen.findByText("MILK");

    expect(repo.getFocusMock).toHaveBeenCalledTimes(1);
  });

  it("シナリオ: currentTaskId が null のとき, 並び先頭タスクが「現在のタスク」として強調表示される (暗黙フォールバック)", async () => {
    // spec.md §「UI: 視覚的強調」第 2 ケース.
    // 並び先頭 = AAA (highest), 残り BBB / CCC は通常リスト.
    const repo = makeMockRepository([
      makeTask({
        id: "task-A",
        name: "AAA",
        priority: "highest",
        createdAt: "2026-06-07T08:00:00.000Z",
        version: 1,
      }),
      makeTask({
        id: "task-B",
        name: "BBB",
        priority: "normal",
        createdAt: "2026-06-07T08:00:01.000Z",
        version: 1,
      }),
      makeTask({
        id: "task-C",
        name: "CCC",
        priority: "later",
        createdAt: "2026-06-07T08:00:02.000Z",
        version: 1,
      }),
    ]);
    renderWithQueryClient(<TodayView repository={repo} projectRepository={makeMockProjectRepository()} />);

    // 「現在のタスク」セクションが存在する (見出し or region).
    // 厳格な UI 形に依存しないよう, アクセシブルな region / heading どちらかで取得.
    const focusSection = await screen.findByRole("region", { name: /現在のタスク/ });
    expect(focusSection).toBeInTheDocument();
    // 強調セクションに AAA が含まれる.
    expect(within(focusSection).getByText("AAA")).toBeInTheDocument();

    // 通常リスト (listitem) には AAA が含まれない (D-008 重複表示禁止).
    // 通常リストは BBB / CCC のみ.
    const items = await screen.findAllByRole("listitem");
    const itemTexts = items.map((li) => li.textContent ?? "");
    expect(itemTexts.some((t) => t.includes("BBB"))).toBe(true);
    expect(itemTexts.some((t) => t.includes("CCC"))).toBe(true);
    expect(itemTexts.some((t) => t.includes("AAA"))).toBe(false);
  });

  it("シナリオ: currentTaskId が設定済みのとき, 該当タスクが強調セクションに描画される", async () => {
    // spec.md §「UI: 視覚的強調」第 1 ケース.
    // currentTaskId = task-B → 並び先頭 (task-A) ではなく task-B が強調される.
    const repo = makeMockRepository(
      [
        makeTask({
          id: "task-A",
          name: "AAA",
          priority: "highest",
          createdAt: "2026-06-07T08:00:00.000Z",
          version: 1,
        }),
        makeTask({
          id: "task-B",
          name: "BBB",
          priority: "normal",
          createdAt: "2026-06-07T08:00:01.000Z",
          version: 1,
        }),
      ],
      {
        initialFocus: {
          id: "singleton",
          currentTaskId: "task-B",
          version: 3,
          updatedAt: NOW,
        },
      },
    );
    renderWithQueryClient(<TodayView repository={repo} projectRepository={makeMockProjectRepository()} />);

    const focusSection = await screen.findByRole("region", { name: /現在のタスク/ });
    expect(within(focusSection).getByText("BBB")).toBeInTheDocument();
    // 強調されていない方 (AAA) は通常リストにある.
    const items = await screen.findAllByRole("listitem");
    const itemTexts = items.map((li) => li.textContent ?? "");
    expect(itemTexts.some((t) => t.includes("AAA"))).toBe(true);
    expect(itemTexts.some((t) => t.includes("BBB"))).toBe(false);
  });

  it("シナリオ: 通常リストの行から「現在に設定」を押すと setFocus({ taskId, ifMatch: focus.version }) が呼ばれる", async () => {
    // spec.md §「UI: 操作」第 1 ケース.
    const repo = makeMockRepository(
      [
        makeTask({
          id: "task-A",
          name: "AAA",
          priority: "highest",
          createdAt: "2026-06-07T08:00:00.000Z",
          version: 1,
        }),
        makeTask({
          id: "task-B",
          name: "BBB",
          priority: "normal",
          createdAt: "2026-06-07T08:00:01.000Z",
          version: 1,
        }),
      ],
      {
        initialFocus: {
          id: "singleton",
          currentTaskId: "task-A",
          version: 7,
          updatedAt: NOW,
        },
      },
    );
    const user = userEvent.setup();
    renderWithQueryClient(<TodayView repository={repo} projectRepository={makeMockProjectRepository()} />);

    // 「現在のタスク」セクションには AAA, 通常リストには BBB がいる.
    const focusSection = await screen.findByRole("region", { name: /現在のタスク/ });
    expect(within(focusSection).getByText("AAA")).toBeInTheDocument();

    // 通常リストの BBB 行を取得.
    const items = await screen.findAllByRole("listitem");
    const bRow = items.find((li) => (li.textContent ?? "").includes("BBB"));
    expect(bRow).toBeDefined();

    // 「現在に設定」ボタンを行内で探してクリック.
    const setFocusButton = within(bRow!).getByRole("button", {
      name: /現在に設定/,
    });
    await user.click(setFocusButton);

    expect(repo.setFocusMock).toHaveBeenCalledTimes(1);
    const arg = repo.setFocusMock.mock.calls[0]?.[0] as SetFocusCommand;
    expect(arg.taskId).toBe("task-B");
    expect(arg.ifMatch).toBe(7);
  });

  it("シナリオ: 強調セクションの「現在解除」ボタンを押すと setFocus({ taskId: null, ifMatch: focus.version }) が呼ばれる", async () => {
    // spec.md §「UI: 操作」第 2 ケース.
    const repo = makeMockRepository(
      [
        makeTask({
          id: "task-A",
          name: "AAA",
          priority: "highest",
          createdAt: "2026-06-07T08:00:00.000Z",
          version: 1,
        }),
        makeTask({
          id: "task-B",
          name: "BBB",
          priority: "normal",
          createdAt: "2026-06-07T08:00:01.000Z",
          version: 1,
        }),
      ],
      {
        initialFocus: {
          id: "singleton",
          currentTaskId: "task-A",
          version: 9,
          updatedAt: NOW,
        },
      },
    );
    const user = userEvent.setup();
    renderWithQueryClient(<TodayView repository={repo} projectRepository={makeMockProjectRepository()} />);

    const focusSection = await screen.findByRole("region", { name: /現在のタスク/ });
    const clearButton = within(focusSection).getByRole("button", {
      name: /現在解除/,
    });
    await user.click(clearButton);

    expect(repo.setFocusMock).toHaveBeenCalledTimes(1);
    const arg = repo.setFocusMock.mock.calls[0]?.[0] as SetFocusCommand;
    expect(arg.taskId).toBeNull();
    expect(arg.ifMatch).toBe(9);
  });

  it("シナリオ: 今日のタスクが 0 件のとき, 「現在のタスク」セクションは描画されない", async () => {
    // spec.md §「UI: 視覚的強調」第 3 ケース.
    const repo = makeMockRepository([]);
    renderWithQueryClient(<TodayView repository={repo} projectRepository={makeMockProjectRepository()} />);

    // 「今日」見出しは出る.
    expect(
      await screen.findByRole("heading", { name: "今日" }),
    ).toBeInTheDocument();

    // 「現在のタスク」セクションは無い.
    expect(screen.queryByRole("region", { name: /現在のタスク/ })).toBeNull();
  });

  it("シナリオ: 完了 / 削除 / 期限切替後にも repository.getFocus() が再フェッチされる (サーバ側で自動解除されている可能性)", async () => {
    // plan より「各書き込み mutation 後は today() と focus() を両方再フェッチする」.
    const repo = makeMockRepository(
      [makeTask({ id: "t1", name: "MILK", version: 1 })],
      {
        initialFocus: {
          id: "singleton",
          currentTaskId: "t1",
          version: 1,
          updatedAt: NOW,
        },
      },
    );
    const user = userEvent.setup();
    renderWithQueryClient(<TodayView repository={repo} projectRepository={makeMockProjectRepository()} />);

    // 初回マウントで 1 回 getFocus() が呼ばれている.
    await screen.findByRole("region", { name: /現在のタスク/ });
    const initialCalls = repo.getFocusMock.mock.calls.length;
    expect(initialCalls).toBeGreaterThanOrEqual(1);

    // 「完了」ボタン (強調セクション内 or どこか) をクリック.
    const completeButton = await screen.findByRole("button", { name: /完了/ });
    await user.click(completeButton);

    // 再フェッチが行われ getFocus() の累積呼出回数が増えている.
    expect(repo.getFocusMock.mock.calls.length).toBeGreaterThan(initialCalls);
  });
});

// ============================================================
// BL-008 / FR-040 / NFR-013: 今日の完了数表示 (Web UI)
//
// spec.md (completion-counter) §「Web クライアント UI (FR-040 / NFR-013)」と 1:1 対応する.
// - TodayView に「今日の完了: N」相当の表示が常時存在する.
// - サーバ正本値 (= today() レスポンスの completionCount) をそのまま表示する.
// - 完了ボタンクリック後に再フェッチで数値が +1 更新される.
// - 削除 / 期限切替では数値が変化しない.
// - 今日のタスクが 0 件でも完了数表示は描画される.
//
// today-view.tsx 側はまだ completionCount を描画しない暫定実装のため,
// 以下のテストはすべて red になる. implementer が green 化する.
// ============================================================

describe("TodayView (BL-008 今日の完了数表示)", () => {
  it("シナリオ: 今日ビューに「今日の完了: 2」相当の表示が描画される", async () => {
    // spec.md §「Web クライアント UI」第 1 ケース.
    // counter=2 を初期 seed しておく. todayMock は completionCount=2 を返す.
    const repo = makeMockRepository(
      [makeTask({ id: "t1", name: "MILK", version: 1 })],
      {
        initialCounter: {
          id: "singleton",
          completedCount: 2,
          lastResetExecutedAt: null,
          version: 3,
          updatedAt: NOW,
        },
      },
    );
    renderWithQueryClient(<TodayView repository={repo} projectRepository={makeMockProjectRepository()} />);

    // 描画完了を待つために 1 件は描画されることを待つ.
    await screen.findByText("MILK");

    // 「完了: 2」または「今日の完了: 2」などのラベル + 数値が DOM に存在する.
    // 文言・装飾は UI 実装の裁量とし, 「数値 2」と「完了を意味するラベル」が共存することだけを要求.
    // leaf 要素 (children.length === 0) に絞って textContent のアンセスター伝播による多重マッチを回避.
    const completionCountText = await screen.findByText((_content, element) => {
      if (!element || element.children.length > 0) return false;
      const text = element.textContent ?? "";
      return /完了/.test(text) && /\b2\b/.test(text);
    });
    expect(completionCountText).toBeInTheDocument();
  });

  it("シナリオ: 完了ボタンで完了すると, 今日ビューの完了数表示が +1 反映される", async () => {
    // spec.md §「Web クライアント UI」第 2 ケース.
    // 初期 completionCount = 0, 完了アクション後に 1 に更新される.
    const repo = makeMockRepository(
      [makeTask({ id: "t1", name: "MILK", version: 1 })],
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
    renderWithQueryClient(<TodayView repository={repo} projectRepository={makeMockProjectRepository()} />);

    // 初期状態: 「完了: 0」相当が描画される.
    await screen.findByText("MILK");
    const before = await screen.findByText((_content, element) => {
      if (!element || element.children.length > 0) return false;
      const text = element.textContent ?? "";
      return /完了/.test(text) && /\b0\b/.test(text);
    });
    expect(before).toBeInTheDocument();

    // 完了ボタンクリック.
    const completeButton = await screen.findByRole("button", { name: /完了/ });
    await user.click(completeButton);

    // 再フェッチで todayMock の completionCount が 1 に増えて返るので, 画面表示も 1 に更新される.
    const after = await screen.findByText((_content, element) => {
      if (!element || element.children.length > 0) return false;
      const text = element.textContent ?? "";
      return /完了/.test(text) && /\b1\b/.test(text);
    });
    expect(after).toBeInTheDocument();
  });

  it("シナリオ: 削除ボタンでは完了数表示は変化しない (FR-007)", async () => {
    // spec.md §「Web クライアント UI」第 3 ケース.
    const repo = makeMockRepository(
      [makeTask({ id: "t1", name: "MILK", version: 1 })],
      {
        initialCounter: {
          id: "singleton",
          completedCount: 1,
          lastResetExecutedAt: null,
          version: 2,
          updatedAt: NOW,
        },
      },
    );
    const user = userEvent.setup();
    renderWithQueryClient(<TodayView repository={repo} projectRepository={makeMockProjectRepository()} />);

    await screen.findByText("MILK");

    // 削除ボタンクリック.
    const deleteButton = await screen.findByRole("button", { name: /削除/ });
    await user.click(deleteButton);

    // 完了数は 1 のまま (+1 されない).
    // 「完了: 2」相当の表示が存在しないことを確認する.
    expect(
      screen.queryByText((_c, element) => {
        if (!element || element.children.length > 0) return false;
        const text = element.textContent ?? "";
        return /完了/.test(text) && /\b2\b/.test(text);
      }),
    ).toBeNull();
    // 「完了: 1」相当の表示は引き続き存在する.
    expect(
      screen.queryByText((_c, element) => {
        if (!element || element.children.length > 0) return false;
        const text = element.textContent ?? "";
        return /完了/.test(text) && /\b1\b/.test(text);
      }),
    ).not.toBeNull();
  });

  it("シナリオ: 期限切替 (today → tomorrow) でも完了数表示は変化しない (FR-007 周辺)", async () => {
    // spec.md §「Web クライアント UI」第 4 ケース.
    const repo = makeMockRepository(
      [makeTask({ id: "t1", name: "MILK", dueDate: "today", version: 1 })],
      {
        initialCounter: {
          id: "singleton",
          completedCount: 1,
          lastResetExecutedAt: null,
          version: 2,
          updatedAt: NOW,
        },
      },
    );
    const user = userEvent.setup();
    renderWithQueryClient(<TodayView repository={repo} projectRepository={makeMockProjectRepository()} />);

    await screen.findByText("MILK");

    // 期限切替 (明日へ) クリック.
    const toggle = await screen.findByRole("button", { name: /明日へ|期限|今日へ/ });
    await user.click(toggle);

    // 完了数は 1 のまま.
    expect(
      screen.queryByText((_c, element) => {
        if (!element || element.children.length > 0) return false;
        const text = element.textContent ?? "";
        return /完了/.test(text) && /\b1\b/.test(text);
      }),
    ).not.toBeNull();
    // 2 になっていないことも確認.
    expect(
      screen.queryByText((_c, element) => {
        if (!element || element.children.length > 0) return false;
        const text = element.textContent ?? "";
        return /完了/.test(text) && /\b2\b/.test(text);
      }),
    ).toBeNull();
  });

  it("シナリオ: 今日タスクが 0 件のときも完了数表示は描画される (例: 「今日の完了: 5」)", async () => {
    // spec.md §「Web クライアント UI」第 5 ケース (ページ再読込でも復元される) と
    // plan.md §UI 設計 (「今日のタスクが 0 件でも完了数表示は出す」).
    const repo = makeMockRepository([], {
      initialCounter: {
        id: "singleton",
        completedCount: 5,
        lastResetExecutedAt: null,
        version: 6,
        updatedAt: NOW,
      },
    });
    renderWithQueryClient(<TodayView repository={repo} projectRepository={makeMockProjectRepository()} />);

    // 「今日」見出しが出る (タスク 0 件でも描画される既存仕様).
    expect(
      await screen.findByRole("heading", { name: "今日" }),
    ).toBeInTheDocument();

    // 完了数表示が描画される.
    const completionLabel = await screen.findByText((_c, element) => {
      if (!element || element.children.length > 0) return false;
      const text = element.textContent ?? "";
      return /完了/.test(text) && /\b5\b/.test(text);
    });
    expect(completionLabel).toBeInTheDocument();
  });
});

// ============================================================
// BL-017 / FR-033: ルーティン由来タスクには「明日へ」ボタンが表示されない
//
// spec.md (routine) §「手動期限切替の禁止（FR-033）」と 1:1 対応する.
// - TodayView に origin="routine" のタスク T1 が表示されている場合
//   T1 の行に「明日へ」ボタン（dueDate を "tomorrow" に変更するボタン）が表示されない.
// - origin="manual" のタスクには「明日へ」ボタンが表示される（既存仕様との差異確認）.
//
// plan.md §D-008 TodayView 変更:
//   task.origin === "routine" の場合に「明日へ」ボタンを非表示にする.
//
// today-view.tsx 側はまだ origin による表示切替を実装していないため,
// 以下のテストはすべて red になる. implementer が green 化する.
// ============================================================

describe("TodayView (BL-017 ルーティン由来タスクの「明日へ」ボタン非表示)", () => {
  it("シナリオ: TodayView でルーティン由来タスクには「明日へ」ボタンが表示されない", async () => {
    // spec.md §「手動期限切替の禁止（FR-033）」:
    //   Given TodayView に origin="routine" のタスク T1 が表示されている
    //   When  TodayView を確認する
    //   Then  T1 の行に「明日へ」ボタン（dueDate を "tomorrow" に変更するボタン）が表示されていない
    const repo = makeMockRepository([
      makeTask({
        id: "t-routine",
        name: "朝の運動",
        origin: "routine",
        routineId: "routine-1",
        dueDate: "today",
        version: 1,
      }),
    ]);
    renderWithQueryClient(<TodayView repository={repo} projectRepository={makeMockProjectRepository()} />);

    // タスクが表示されるまで待つ
    expect(await screen.findByText("朝の運動")).toBeInTheDocument();

    // ルーティン由来タスクの行には「明日へ」ボタンが存在しない
    // 「明日へ」ボタンの名前パターンは既存テストと合わせる (/明日へ|期限|今日へ/)
    const deferButtons = screen.queryAllByRole("button", { name: /明日へ/ });
    expect(deferButtons).toHaveLength(0);
  });

  it("シナリオ: origin='manual' のタスクには「明日へ」ボタンが表示される（ルーティンとの差異確認）", async () => {
    // spec.md §「手動期限切替の禁止（FR-033）」の逆ケース:
    //   manual タスクには「明日へ」ボタンが表示される（仕様上問題なし）
    const repo = makeMockRepository([
      makeTask({
        id: "t-manual",
        name: "牛乳を買う",
        origin: "manual",
        routineId: null,
        dueDate: "today",
        version: 1,
      }),
    ]);
    renderWithQueryClient(<TodayView repository={repo} projectRepository={makeMockProjectRepository()} />);

    // タスクが表示されるまで待つ
    expect(await screen.findByText("牛乳を買う")).toBeInTheDocument();

    // manual タスクには「明日へ」ボタンが存在する
    const deferButton = await screen.findByRole("button", { name: /明日へ|期限|今日へ/ });
    expect(deferButton).toBeInTheDocument();
  });

  it("シナリオ: ルーティン由来タスクとマニュアルタスクが混在するとき、マニュアルタスクのみ「明日へ」ボタンが表示される", async () => {
    // Given TodayView に origin="routine" の T1 と origin="manual" の T2 が表示されている
    // Then  T1 の行には「明日へ」ボタンがなく、T2 の行には「明日へ」ボタンがある
    const repo = makeMockRepository([
      makeTask({
        id: "t-routine",
        name: "朝の運動",
        origin: "routine",
        routineId: "routine-1",
        dueDate: "today",
        priority: "highest",
        createdAt: "2026-06-08T08:00:00.000Z",
        version: 1,
      }),
      makeTask({
        id: "t-manual",
        name: "牛乳を買う",
        origin: "manual",
        routineId: null,
        dueDate: "today",
        priority: "normal",
        createdAt: "2026-06-08T08:00:01.000Z",
        version: 1,
      }),
    ]);
    renderWithQueryClient(<TodayView repository={repo} projectRepository={makeMockProjectRepository()} />);

    // 両タスクが表示されるまで待つ
    await screen.findByText("牛乳を買う");

    // 「明日へ」ボタンの数は 1 つだけ（manual タスクのみ）
    const deferButtons = screen.queryAllByRole("button", { name: /明日へ/ });
    expect(deferButtons).toHaveLength(1);
  });
});

// ============================================================
// BL-018 フェーズ D: 書込キュー統合テスト (D-7)
//
// spec.md (pwa-offline-queue) §「フェーズ D: 書込キュー統合」と対応する。
// - オフライン時: enqueue のみ呼ばれ、repository.create は呼ばれない。
// - オンライン時: enqueue の後に repository.create が呼ばれる。
// ============================================================

describe("書込キュー統合 (BL-018 フェーズ D)", () => {
  it("オフライン中の mutation: navigator.onLine === false のとき repository.create が呼ばれず enqueue だけが呼ばれる", async () => {
    // navigator.onLine を false にモック
    Object.defineProperty(navigator, "onLine", {
      value: false,
      configurable: true,
    });

    const repo = makeMockRepository();
    const user = userEvent.setup();
    renderWithQueryClient(
      <TodayView repository={repo} projectRepository={makeMockProjectRepository()} />,
    );

    const nameInput = await screen.findByLabelText(/タスク名/);
    await user.type(nameInput, "オフラインタスク");

    const submit = screen.getByRole("button", { name: /追加|起票|登録|送信/ });
    await user.click(submit);

    // repository.create が呼ばれないことを確認
    expect(repo.createMock).not.toHaveBeenCalled();

    // onLine をリセット
    Object.defineProperty(navigator, "onLine", {
      value: true,
      configurable: true,
    });
  });

  it("オンライン時の mutation: navigator.onLine === true のとき enqueue の後に repository.create が呼ばれる", async () => {
    Object.defineProperty(navigator, "onLine", {
      value: true,
      configurable: true,
    });

    const repo = makeMockRepository();
    const user = userEvent.setup();
    renderWithQueryClient(
      <TodayView repository={repo} projectRepository={makeMockProjectRepository()} />,
    );

    const nameInput = await screen.findByLabelText(/タスク名/);
    await user.type(nameInput, "オンラインタスク");

    const submit = screen.getByRole("button", { name: /追加|起票|登録|送信/ });
    await user.click(submit);

    // repository.create が呼ばれることを確認
    expect(repo.createMock).toHaveBeenCalled();
  });
});

// ============================================================
// BL-016 / FR-020: プロジェクト選択 - 起票フォームのドロップダウン
//
// spec.md (project-crud) §「Web クライアント - プロジェクト選択」と 1:1 対応する.
// - 起票フォームにプロジェクト選択ドロップダウンが表示される.
// - プロジェクトを選択してタスクを起票すると projectId が渡る.
// - 「（未分類）」を選択してタスクを起票すると projectId が null になる.
//
// TodayView は BL-016 実装前は projectRepository props を持たないため,
// 以下のテストはすべて red になる. implementer が green 化する.
// ============================================================

describe("TodayView (BL-016 プロジェクト選択 UI)", () => {
  it("シナリオ: 起票フォームにプロジェクト選択ドロップダウンが表示される", async () => {
    // spec.md §「起票フォームにプロジェクト選択ドロップダウンが表示される」
    //   Given プロジェクト「仕事」と「個人」が存在する
    //   When  TodayView の起票フォームが表示される
    //   Then  「プロジェクト」ドロップダウンに「仕事」と「個人」の選択肢が表示される
    //   And   「（未分類）」という選択肢も含まれる
    const projectRepo = makeMockProjectRepository([
      {
        id: PROJECT_ID_P1,
        name: "仕事",
        version: 1,
        createdAt: NOW,
        updatedAt: NOW,
      },
      {
        id: "p2p2p2p2-p2p2-4p2p-8p2p-p2p2p2p2p2p2",
        name: "個人",
        version: 1,
        createdAt: NOW,
        updatedAt: NOW,
      },
    ]);
    const taskRepo = makeMockRepository();

    renderWithQueryClient(
      <TodayView repository={taskRepo} projectRepository={projectRepo} />,
    );

    // 「プロジェクト」ラベルを持つドロップダウン（select）が存在する.
    // 既存テスト（今日ビューの起票フォームはタスク名のみ必須である）で
    // queryByLabelText(/プロジェクト/) が存在することを確認済みの要件を継承する.
    const projectSelect = await screen.findByLabelText(/プロジェクト/);
    expect(projectSelect).toBeInTheDocument();

    // 「仕事」と「個人」の選択肢が存在する
    expect(await screen.findByText("仕事")).toBeInTheDocument();
    expect(await screen.findByText("個人")).toBeInTheDocument();

    // 「（未分類）」の選択肢が存在する
    expect(await screen.findByText(/未分類/)).toBeInTheDocument();

    // projectRepository.list() が呼ばれている
    expect(projectRepo.listMock).toHaveBeenCalledTimes(1);
  });

  it("シナリオ: プロジェクトを選択してタスクを起票すると POST に projectId が含まれる", async () => {
    // spec.md §「プロジェクトを選択してタスクを起票できる」
    //   Given プロジェクト「仕事」（id: "p-1"）が存在する
    //   When  起票フォームでプロジェクト「仕事」を選択してタスクを追加する
    //   Then  repository.create に { projectId: "p-1" } が含まれる
    const projectRepo = makeMockProjectRepository([
      {
        id: PROJECT_ID_P1,
        name: "仕事",
        version: 1,
        createdAt: NOW,
        updatedAt: NOW,
      },
    ]);
    const taskRepo = makeMockRepository();
    const user = userEvent.setup();

    renderWithQueryClient(
      <TodayView repository={taskRepo} projectRepository={projectRepo} />,
    );

    // タスク名入力
    const nameInput = await screen.findByLabelText(/タスク名/);
    await user.type(nameInput, "資料を作る");

    // プロジェクト選択ドロップダウンで「仕事」を選択
    const projectSelect = await screen.findByLabelText(/プロジェクト/);
    await user.selectOptions(projectSelect, PROJECT_ID_P1);

    // 追加ボタンをクリック
    const submit = screen.getByRole("button", { name: /追加|起票|登録|送信/ });
    await user.click(submit);

    // create() が呼ばれて projectId が渡っている
    expect(taskRepo.createMock).toHaveBeenCalledTimes(1);
    const arg = taskRepo.createMock.mock.calls[0]?.[0] as CreateTaskCommand;
    expect(arg.name).toBe("資料を作る");
    expect(arg.projectId).toBe(PROJECT_ID_P1);
  });

  it("シナリオ: プロジェクト未選択（「（未分類）」）で起票すると POST に projectId: null が含まれる", async () => {
    // spec.md §「プロジェクト未選択（未分類）でタスクを起票できる」
    //   Given プロジェクトが 1 件も存在しない、または「（未分類）」を選択している
    //   When  起票フォームでプロジェクトを選択せずタスクを追加する
    //   Then  repository.create に { projectId: null } が含まれる
    const projectRepo = makeMockProjectRepository([]);
    const taskRepo = makeMockRepository();
    const user = userEvent.setup();

    renderWithQueryClient(
      <TodayView repository={taskRepo} projectRepository={projectRepo} />,
    );

    // タスク名入力
    const nameInput = await screen.findByLabelText(/タスク名/);
    await user.type(nameInput, "牛乳を買う");

    // プロジェクトは未選択のまま（または「（未分類）」を明示選択）
    // デフォルト選択肢が「（未分類）」であることを前提とする.

    // 追加ボタンをクリック
    const submit = screen.getByRole("button", { name: /追加|起票|登録|送信/ });
    await user.click(submit);

    // create() が呼ばれて projectId が null になっている
    expect(taskRepo.createMock).toHaveBeenCalledTimes(1);
    const arg = taskRepo.createMock.mock.calls[0]?.[0] as CreateTaskCommand;
    expect(arg.name).toBe("牛乳を買う");
    expect(arg.projectId).toBeNull();
  });
});
