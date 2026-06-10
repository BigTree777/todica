// BL-018: TanStack Query の QueryClientProvider でラップするために追加。
// @tanstack/react-query はまだ未インストール（実装時にインストールされる前提）。
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Task } from "@todica/domain/task";
import type { ReactNode } from "react";
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
// BL-016: ProjectRepository のモックを注入するために追加する.
// project-repository.ts は BL-016 実装前は存在しないため,
// 以下のインポートは「失敗する (red)」状態の一部である.
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
import { TodayView } from "../src/ui/today-view/today-view.js";

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
        staleTime: Number.POSITIVE_INFINITY,
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
  const updateMock = vi.fn(
    async (cmd: { id: string; ifMatch: number; name: string }): Promise<Project> => {
      const idx = state.findIndex((p) => p.id === cmd.id);
      if (idx < 0) throw new Error("not found");
      const next = { ...state[idx]!, name: cmd.name, version: state[idx]!.version + 1 };
      state[idx] = next;
      return next;
    },
  );
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
    const filtered = state.filter((t) => t.dueDate === "today" && t.trashedAt === null);
    const sorted = [...filtered].sort((a, b) => {
      const p = (PRIORITY_ORDER_LOCAL[a.priority] ?? 99) - (PRIORITY_ORDER_LOCAL[b.priority] ?? 99);
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
    renderWithQueryClient(
      <TodayView repository={repo} projectRepository={makeMockProjectRepository()} />,
    );

    // タスク名入力欄
    const nameInput = await screen.findByLabelText(/タスク名/);
    expect(nameInput).toBeRequired();

    // BL-041: 「プロジェクト」は <select> ではなくトグルボタン (<ProjectToggle />) で表現される.
    // 起票フォーム scope 内に「プロジェクト」を name に持つ button が 1 つ存在する.
    const form = screen.getByRole("form", { name: "タスク起票フォーム" });
    const projectToggle = within(form).getByRole("button", { name: /プロジェクト/ });
    expect(projectToggle).not.toBeNull();
    expect(projectToggle.tagName).toBe("BUTTON");
    // required 概念はトグル button には適用されない (任意項目). 旧 select 互換の意図のみ残す.
    expect(projectToggle).not.toBeRequired();

    // BL-039: 期限 UI は起票フォームから削除済み (foundation REQ-4 / inline-create-form REQ-1).
    // ビュー文脈で dueDate が決まるため起票時に期限を選ばせない.
    const dueDateControl = screen.queryByLabelText(/期限/);
    expect(dueDateControl).toBeNull();

    // 不要な入力欄が存在しない (NFR-001 単一ワークフロー)
    expect(screen.queryByLabelText(/ステータス/)).toBeNull();
    expect(screen.queryByLabelText(/タグ/)).toBeNull();
    expect(screen.queryByLabelText(/開始日/)).toBeNull();
    expect(screen.queryByLabelText(/サブタスク/)).toBeNull();
  });

  it("シナリオ: BL-039 起票フォームに「期限」select が存在しない", async () => {
    // inline-create-form spec.md REQ-1:
    //   aria-label="タスク起票フォーム" の form 内に「期限」label / select は存在してはならない.
    //   id="task-due-date" の要素も DOM 上に存在してはならない.
    const repo = makeMockRepository();
    renderWithQueryClient(
      <TodayView repository={repo} projectRepository={makeMockProjectRepository()} />,
    );

    // フォーム自体は表示される (タスク名 input が存在することで担保).
    await screen.findByLabelText(/タスク名/);

    // 起票フォーム scope 内で「期限」label が取得できないことを確認する.
    const form = screen.getByRole("form", { name: "タスク起票フォーム" });
    expect(within(form).queryByLabelText(/期限/)).toBeNull();

    // id="task-due-date" の DOM 要素も存在しない.
    expect(form.querySelector("#task-due-date")).toBeNull();

    // 起票フォーム内の input / select は 1 つのみ:
    //   タスク名 (input). 「優先度」は星 UI (button 3 つ) で input/select には含まれない.
    //   BL-041: 「プロジェクト」も <select> ではなくトグルボタンに置き換わる
    //   (= input/select 集計には含まれない). 「追加」ボタンは別.
    // BL-040 priority-star-ui REQ-1: <select id="task-priority"> は撤去され,
    //   role="radiogroup" + 3 つの role="radio" (button 実装) に置き換わる.
    const formInputs = form.querySelectorAll("input, select");
    expect(formInputs).toHaveLength(1);

    // 旧 select id は DOM 上に存在しない (BL-040 / spec AC-1).
    expect(form.querySelector("#task-priority")).toBeNull();
    // BL-041 spec AC-1: 旧プロジェクト select も DOM 上に存在しない.
    expect(form.querySelector("#task-project")).toBeNull();
  });

  it('シナリオ: BL-039 起票時に dueDate="today" で create が呼ばれる', async () => {
    // inline-create-form spec.md REQ-2:
    //   handleCreate 内で repository.create に渡す CreateTaskCommand の dueDate
    //   は常に "today" 固定. ユーザー操作で dueDate を変える経路は起票時点には存在しない.
    const repo = makeMockRepository();
    const user = userEvent.setup();
    renderWithQueryClient(
      <TodayView repository={repo} projectRepository={makeMockProjectRepository()} />,
    );

    const nameInput = await screen.findByLabelText(/タスク名/);
    await user.type(nameInput, "BL-039 起票テスト");

    // BL-044: ヘッダ領域に「＋プロジェクトの追加」button が増えたため,
    // 起票フォーム scope 内で submit button を特定する (検証内容は不変).
    const submit = within(screen.getByRole("form", { name: "タスク起票フォーム" })).getByRole(
      "button",
      { name: /追加|起票|登録|送信/ },
    );
    await user.click(submit);

    expect(repo.createMock).toHaveBeenCalledTimes(1);
    const arg = repo.createMock.mock.calls[0]?.[0] as CreateTaskCommand;
    expect(arg.name).toBe("BL-039 起票テスト");
    // dueDate は明示送信 (D-002 互換) かつ常に "today" 固定であること.
    expect(arg.dueDate).toBe("today");
  });

  it("シナリオ: 起票フォームでタスク名を入力して送信するとタスクが追加される", async () => {
    const repo = makeMockRepository();
    const user = userEvent.setup();
    renderWithQueryClient(
      <TodayView repository={repo} projectRepository={makeMockProjectRepository()} />,
    );

    const nameInput = await screen.findByLabelText(/タスク名/);
    await user.type(nameInput, "牛乳を買う");

    // BL-044: ヘッダ領域に「＋プロジェクトの追加」button が増えたため,
    // 起票フォーム scope 内で submit button を特定する (検証内容は不変).
    const submit = within(screen.getByRole("form", { name: "タスク起票フォーム" })).getByRole(
      "button",
      { name: /追加|起票|登録|送信/ },
    );
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

  // BL-042: カード上の編集 button を撤去. 名称編集の代替 UI は本 BL の範囲外で,
  // 後続 BL (タスク編集ダイアログの再導入) で復活予定. それまでスキップして仕様の
  // 退行を防ぐ.
  it.skip("シナリオ: 既存タスクの名称を編集して保存できる (BL-042 で UI 撤去 / 後続 BL で復活予定)", async () => {
    const repo = makeMockRepository([makeTask({ id: "t1", name: "牛乳", version: 1 })]);
    const user = userEvent.setup();
    renderWithQueryClient(
      <TodayView repository={repo} projectRepository={makeMockProjectRepository()} />,
    );

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
    renderWithQueryClient(
      <TodayView repository={repo} projectRepository={makeMockProjectRepository()} />,
    );

    // 期限切替トグル. BL-042: ラベルは「明日にする」/「今日にする」に統一.
    const toggle = await screen.findByRole("button", { name: /明日にする|今日にする/ });
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
    renderWithQueryClient(
      <TodayView repository={repo} projectRepository={makeMockProjectRepository()} />,
    );

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
// BL-002 / FR-003 / FR-004 + BL-040 (priority-star-ui): 優先度の指定・変更
//
// spec.md (task-priority) §「Web クライアント UI」+
// spec.md (priority-star-ui) AC-1 / AC-2 / AC-3 / AC-5 / AC-6 / AC-7 / AC-10 と
// 1:1 対応する.
//
// BL-040 の変更点 (旧 BL-002 からの差分):
//   - 起票フォームの <select id="task-priority"> は撤去, 横並び 3 つの星 (role="radio")
//     を持つ <PriorityStars /> に置き換わる.
//   - タスクカード上 (focusedTask / 一覧行) の <button aria-label="優先度を切替">
//     (cycle ボタン) は撤去, 同じ <PriorityStars /> に置き換わる.
//   - クリックは「タップで直接 priority 値に飛ぶ」(cycle ではない). 1 番目=later /
//     2 番目=normal / 3 番目=highest. 現在値と同じ星クリックは no-op (PATCH 出ない).
//
// 本ファイル冒頭の makeMockRepository は patch.priority を ...cmd.patch でコピーするため,
// updateMock 経由で state[idx].priority が反映される. UI 側 (today-view.tsx) の本実装は
// implementer が green 化する.
// ============================================================

describe("TodayView (BL-002 / BL-040 優先度 UI 星 3 つ)", () => {
  it('シナリオ AC-1: 起票フォームに 3 つの星 (role=radio) が並び, 初期で 2 つ点灯 = normal. 旧 <select id="task-priority"> は存在しない', async () => {
    // priority-star-ui AC-1.
    const repo = makeMockRepository();
    renderWithQueryClient(
      <TodayView repository={repo} projectRepository={makeMockProjectRepository()} />,
    );

    // 描画完了待ち.
    await screen.findByLabelText(/タスク名/);

    // 起票フォーム scope で検証する (タスクカード側の <PriorityStars /> と衝突しないように).
    const form = screen.getByRole("form", { name: "タスク起票フォーム" });

    // 旧 select は DOM 上に存在しない.
    expect(form.querySelector("#task-priority")).toBeNull();

    // role="radiogroup" の優先度 UI が存在する.
    const group = within(form).getByRole("radiogroup");
    expect(group).toBeInTheDocument();
    // aria-label に「優先度」 + 既定値「普通」が含まれる.
    const groupLabel = group.getAttribute("aria-label") ?? "";
    expect(groupLabel).toMatch(/優先度/);
    expect(groupLabel).toMatch(/普通/);

    // 星 3 つが横並び.
    const stars = within(group).getAllByRole("radio");
    expect(stars).toHaveLength(3);
    // 初期で 2 つ点灯 (= normal). 「点灯」は data-lit="true" で観察する (plan D-002).
    const lit = group.querySelectorAll('[data-lit="true"]');
    expect(lit).toHaveLength(2);
  });

  it("シナリオ: 起票フォームで星を一度も触らずに送信すると create.priority は normal (または省略)", async () => {
    const repo = makeMockRepository();
    const user = userEvent.setup();
    renderWithQueryClient(
      <TodayView repository={repo} projectRepository={makeMockProjectRepository()} />,
    );

    const nameInput = await screen.findByLabelText(/タスク名/);
    await user.type(nameInput, "x");
    // BL-044: ヘッダ領域に「＋プロジェクトの追加」button が増えたため,
    // 起票フォーム scope 内で submit button を特定する (検証内容は不変).
    const submit = within(screen.getByRole("form", { name: "タスク起票フォーム" })).getByRole(
      "button",
      { name: /追加|起票|登録|送信/ },
    );
    await user.click(submit);

    expect(repo.createMock).toHaveBeenCalledTimes(1);
    const arg = repo.createMock.mock.calls[0]?.[0] as CreateTaskCommand;
    // 未操作 → "normal" 明示送信 / プロパティ省略 のどちらでも仕様適合.
    if (arg.priority !== undefined) {
      expect(arg.priority).toBe("normal");
    }
  });

  it('シナリオ AC-2: 起票フォームで 3 番目の星をクリックして追加すると create.priority === "highest"', async () => {
    // priority-star-ui AC-2.
    const repo = makeMockRepository();
    const user = userEvent.setup();
    renderWithQueryClient(
      <TodayView repository={repo} projectRepository={makeMockProjectRepository()} />,
    );

    const nameInput = await screen.findByLabelText(/タスク名/);
    await user.type(nameInput, "星 3 テスト");

    // 起票フォーム内の星 3 つ目をクリック.
    const form = screen.getByRole("form", { name: "タスク起票フォーム" });
    const group = within(form).getByRole("radiogroup");
    const stars = within(group).getAllByRole("radio");
    expect(stars).toHaveLength(3);
    await user.click(stars[2]!);

    // BL-044: ヘッダ領域に「＋プロジェクトの追加」button が増えたため,
    // 起票フォーム scope 内で submit button を特定する (検証内容は不変).
    const submit = within(screen.getByRole("form", { name: "タスク起票フォーム" })).getByRole(
      "button",
      { name: /追加|起票|登録|送信/ },
    );
    await user.click(submit);

    expect(repo.createMock).toHaveBeenCalledTimes(1);
    const arg = repo.createMock.mock.calls[0]?.[0] as CreateTaskCommand;
    expect(arg.name).toBe("星 3 テスト");
    expect(arg.priority).toBe("highest");
  });

  it('シナリオ AC-3: 起票フォームで 1 番目の星をクリックして追加すると create.priority === "later"', async () => {
    // priority-star-ui AC-3.
    const repo = makeMockRepository();
    const user = userEvent.setup();
    renderWithQueryClient(
      <TodayView repository={repo} projectRepository={makeMockProjectRepository()} />,
    );

    const nameInput = await screen.findByLabelText(/タスク名/);
    await user.type(nameInput, "星 1 テスト");

    const form = screen.getByRole("form", { name: "タスク起票フォーム" });
    const group = within(form).getByRole("radiogroup");
    const stars = within(group).getAllByRole("radio");
    await user.click(stars[0]!);

    // BL-044: ヘッダ領域に「＋プロジェクトの追加」button が増えたため,
    // 起票フォーム scope 内で submit button を特定する (検証内容は不変).
    const submit = within(screen.getByRole("form", { name: "タスク起票フォーム" })).getByRole(
      "button",
      { name: /追加|起票|登録|送信/ },
    );
    await user.click(submit);

    expect(repo.createMock).toHaveBeenCalledTimes(1);
    const arg = repo.createMock.mock.calls[0]?.[0] as CreateTaskCommand;
    expect(arg.name).toBe("星 1 テスト");
    expect(arg.priority).toBe("later");
  });

  it('シナリオ AC-5: タスクカード上で 1 番目の星をクリックすると update.patch.priority === "later" で PATCH が送られる', async () => {
    // priority-star-ui AC-5.
    // task は唯一の today タスクなので, 通常リストではなく「現在のタスク」セクションに入る.
    // <PriorityStars /> は focusedTask / 一覧行どちらでも同じ部品なので, どちらの位置に出ても
    // role="radiogroup" 内で 1 番目の星をクリックすれば PATCH が出る.
    const repo = makeMockRepository([
      makeTask({ id: "t1", name: "x", priority: "normal", version: 1 }),
    ]);
    const user = userEvent.setup();
    renderWithQueryClient(
      <TodayView repository={repo} projectRepository={makeMockProjectRepository()} />,
    );

    await screen.findByText("x");

    // 起票フォーム以外の radiogroup (= タスクカード上の星) を取り出す.
    const allGroups = await screen.findAllByRole("radiogroup");
    const form = screen.getByRole("form", { name: "タスク起票フォーム" });
    const cardGroups = allGroups.filter((g) => !form.contains(g));
    expect(cardGroups.length).toBeGreaterThanOrEqual(1);

    // タスクカード上の星 1 つ目をクリック.
    const stars = within(cardGroups[0]!).getAllByRole("radio");
    expect(stars).toHaveLength(3);
    await user.click(stars[0]!);

    expect(repo.updateMock).toHaveBeenCalledTimes(1);
    const arg = repo.updateMock.mock.calls[0]?.[0] as UpdateTaskCommand;
    expect(arg.id).toBe("t1");
    expect(arg.ifMatch).toBe(1);
    // 1 番目の星 = later 直接指定 (cycle ではない).
    expect(arg.patch.priority).toBe("later");
    // 優先度以外のフィールドは送らない (NFR-013 / 部分上書き原則).
    expect(arg.patch.name).toBeUndefined();
    expect(arg.patch.dueDate).toBeUndefined();
    expect(arg.patch.projectId).toBeUndefined();
  });

  it("シナリオ AC-6: タスクカード上で現在値と同じ星 (2 番目 = normal) をクリックしても update は呼ばれない", async () => {
    // priority-star-ui AC-6 / D-003 no-op.
    const repo = makeMockRepository([
      makeTask({ id: "t1", name: "x", priority: "normal", version: 1 }),
    ]);
    const user = userEvent.setup();
    renderWithQueryClient(
      <TodayView repository={repo} projectRepository={makeMockProjectRepository()} />,
    );

    await screen.findByText("x");

    const allGroups = await screen.findAllByRole("radiogroup");
    const form = screen.getByRole("form", { name: "タスク起票フォーム" });
    const cardGroups = allGroups.filter((g) => !form.contains(g));
    expect(cardGroups.length).toBeGreaterThanOrEqual(1);

    // 現在値 = normal → 2 番目の星をクリック (同値).
    const stars = within(cardGroups[0]!).getAllByRole("radio");
    await user.click(stars[1]!);

    // PATCH は出ない.
    expect(repo.updateMock).not.toHaveBeenCalled();
  });

  it("シナリオ AC-7: タスクカードに旧「優先度を切替」cycle ボタンは存在しない", async () => {
    // priority-star-ui AC-7.
    const repo = makeMockRepository([
      makeTask({ id: "t1", name: "x", priority: "normal", version: 1 }),
    ]);
    renderWithQueryClient(
      <TodayView repository={repo} projectRepository={makeMockProjectRepository()} />,
    );

    await screen.findByText("x");

    // 旧 cycle ボタンの aria-label / テキスト「優先度を切替」は DOM に存在しない.
    expect(screen.queryByRole("button", { name: /優先度を切替/ })).toBeNull();
  });

  it("シナリオ AC-10: 「現在のタスク」セクションでも 星 3 つ UI が使われている (cycle ボタンは無い)", async () => {
    // priority-star-ui AC-10.
    // task-A を currentTaskId に固定して「現在のタスク」セクションに置く.
    const repo = makeMockRepository(
      [
        makeTask({
          id: "task-A",
          name: "FOCUS-A",
          priority: "normal",
          version: 1,
        }),
      ],
      {
        initialFocus: {
          id: "singleton",
          currentTaskId: "task-A",
          version: 1,
          updatedAt: NOW,
        },
      },
    );
    const user = userEvent.setup();
    renderWithQueryClient(
      <TodayView repository={repo} projectRepository={makeMockProjectRepository()} />,
    );

    const focusSection = await screen.findByRole("region", { name: /現在のタスク/ });

    // 強調セクション内に radiogroup が存在 (= 星 3 つ UI).
    const group = within(focusSection).getByRole("radiogroup");
    const stars = within(group).getAllByRole("radio");
    expect(stars).toHaveLength(3);

    // 旧 cycle ボタンは存在しない.
    expect(within(focusSection).queryByRole("button", { name: /優先度を切替/ })).toBeNull();

    // 星 3 つ目クリック → highest が PATCH される.
    await user.click(stars[2]!);
    expect(repo.updateMock).toHaveBeenCalledTimes(1);
    const arg = repo.updateMock.mock.calls[0]?.[0] as UpdateTaskCommand;
    expect(arg.id).toBe("task-A");
    expect(arg.ifMatch).toBe(1);
    expect(arg.patch.priority).toBe("highest");
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
    renderWithQueryClient(
      <TodayView repository={repo} projectRepository={makeMockProjectRepository()} />,
    );

    // 描画後, 初期並びを確認 (A, B). sentinel は強調セクションに居て listitem には居ない.
    const itemsBefore = await screen.findAllByRole("listitem");
    expect(itemsBefore).toHaveLength(2);
    expect(itemsBefore[0]?.textContent ?? "").toContain("AAA");
    expect(itemsBefore[1]?.textContent ?? "").toContain("BBB");

    // タスク B 行の優先度 UI (星 3 つ) を取得し, 3 つ目の星 (= highest) を直接クリックする.
    // BL-040: cycle ではなく「タップで直接 priority 値に飛ぶ」.
    const bRow = itemsBefore[1]!;
    const bGroup = within(bRow).getByRole("radiogroup");
    const bStars = within(bGroup).getAllByRole("radio");
    expect(bStars).toHaveLength(3);
    // 3 番目の星 = highest を直接指定.
    await user.click(bStars[2]!);
    // update が 1 回呼ばれ patch.priority === "highest" であること.
    expect(repo.updateMock).toHaveBeenCalledTimes(1);
    const updatedArg = repo.updateMock.mock.calls[0]?.[0] as UpdateTaskCommand;
    expect(updatedArg.patch.priority).toBe("highest");

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
    const repo = makeMockRepository([makeTask({ id: "t1", name: "牛乳", version: 1 })]);
    renderWithQueryClient(
      <TodayView repository={repo} projectRepository={makeMockProjectRepository()} />,
    );

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
    const repo = makeMockRepository([makeTask({ id: "t1", name: "x", version: 1 })]);
    const user = userEvent.setup();
    renderWithQueryClient(
      <TodayView repository={repo} projectRepository={makeMockProjectRepository()} />,
    );

    await screen.findByText("x");

    const completeButton = await screen.findByRole("button", { name: /完了/ });
    await user.click(completeButton);

    expect(repo.completeMock).toHaveBeenCalledTimes(1);
    const arg = repo.completeMock.mock.calls[0]?.[0] as CompleteTaskCommand;
    expect(arg.id).toBe("t1");
    expect(arg.ifMatch).toBe(1);
  });

  it("シナリオ: 完了に成功するとタスクが今日ビューの一覧から消える (楽観 UI)", async () => {
    const repo = makeMockRepository([makeTask({ id: "t1", name: "牛乳", version: 1 })]);
    const user = userEvent.setup();
    renderWithQueryClient(
      <TodayView repository={repo} projectRepository={makeMockProjectRepository()} />,
    );

    expect(await screen.findByText("牛乳")).toBeInTheDocument();

    const completeButton = await screen.findByRole("button", { name: /完了/ });
    await user.click(completeButton);

    // 一覧から消える (楽観 UI).
    expect(screen.queryByText("牛乳")).toBeNull();
  });

  it("シナリオ: 完了ボタンクリックで Repository.delete は呼ばれない (完了と削除は別操作)", async () => {
    const repo = makeMockRepository([makeTask({ id: "t1", name: "x", version: 1 })]);
    const user = userEvent.setup();
    renderWithQueryClient(
      <TodayView repository={repo} projectRepository={makeMockProjectRepository()} />,
    );

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
    renderWithQueryClient(
      <TodayView repository={repo} projectRepository={makeMockProjectRepository()} />,
    );

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
    renderWithQueryClient(
      <TodayView repository={repo} projectRepository={makeMockProjectRepository()} />,
    );

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
    renderWithQueryClient(
      <TodayView repository={repo} projectRepository={makeMockProjectRepository()} />,
    );

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
    renderWithQueryClient(
      <TodayView repository={repo} projectRepository={makeMockProjectRepository()} />,
    );

    expect(await screen.findByText("MOVE-ME")).toBeInTheDocument();

    // 期限切替トグル. BL-042: ラベルは「明日にする」/「今日にする」に統一.
    const toggle = await screen.findByRole("button", { name: /明日にする|今日にする/ });
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
    renderWithQueryClient(
      <TodayView repository={repo} projectRepository={makeMockProjectRepository()} />,
    );

    // 見出し「今日」(FR-010) が描画される. select の option と区別するため heading で指定.
    expect(await screen.findByRole("heading", { name: "今日" })).toBeInTheDocument();
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
    const repo = makeMockRepository([makeTask({ id: "t1", name: "MILK", version: 1 })]);
    renderWithQueryClient(
      <TodayView repository={repo} projectRepository={makeMockProjectRepository()} />,
    );

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
    renderWithQueryClient(
      <TodayView repository={repo} projectRepository={makeMockProjectRepository()} />,
    );

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
    renderWithQueryClient(
      <TodayView repository={repo} projectRepository={makeMockProjectRepository()} />,
    );

    const focusSection = await screen.findByRole("region", { name: /現在のタスク/ });
    expect(within(focusSection).getByText("BBB")).toBeInTheDocument();
    // 強調されていない方 (AAA) は通常リストにある.
    const items = await screen.findAllByRole("listitem");
    const itemTexts = items.map((li) => li.textContent ?? "");
    expect(itemTexts.some((t) => t.includes("AAA"))).toBe(true);
    expect(itemTexts.some((t) => t.includes("BBB"))).toBe(false);
  });

  // BL-043 (set-focus-gesture): 「現在のタスクにする」 button として復活.
  it("シナリオ: 通常リストの行から「現在のタスクにする」を押すと setFocus({ taskId, ifMatch: focus.version }) が呼ばれる", async () => {
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
    renderWithQueryClient(
      <TodayView repository={repo} projectRepository={makeMockProjectRepository()} />,
    );

    // 「現在のタスク」セクションには AAA, 通常リストには BBB がいる.
    const focusSection = await screen.findByRole("region", { name: /現在のタスク/ });
    expect(within(focusSection).getByText("AAA")).toBeInTheDocument();

    // 通常リストの BBB 行を取得.
    const items = await screen.findAllByRole("listitem");
    const bRow = items.find((li) => (li.textContent ?? "").includes("BBB"));
    expect(bRow).toBeDefined();

    // 「現在のタスクにする」ボタンを行内で探してクリック.
    const setFocusButton = within(bRow!).getByRole("button", {
      name: "現在のタスクにする",
    });
    await user.click(setFocusButton);

    expect(repo.setFocusMock).toHaveBeenCalledTimes(1);
    const arg = repo.setFocusMock.mock.calls[0]?.[0] as SetFocusCommand;
    expect(arg.taskId).toBe("task-B");
    expect(arg.ifMatch).toBe(7);
  });

  // BL-042 で「現在解除」 button を撤去し, BL-043 (set-focus-gesture) REQ-4 で
  // 解除 UI は恒久的に提供しないことが確定した (解除は完了/削除/期限変更時の
  // サーバ側自動解除のみ). 旧テストは仕様と矛盾するため削除済み.

  it("シナリオ: 今日のタスクが 0 件のとき, 「現在のタスク」セクションは描画されない", async () => {
    // spec.md §「UI: 視覚的強調」第 3 ケース.
    const repo = makeMockRepository([]);
    renderWithQueryClient(
      <TodayView repository={repo} projectRepository={makeMockProjectRepository()} />,
    );

    // 「今日」見出しは出る.
    expect(await screen.findByRole("heading", { name: "今日" })).toBeInTheDocument();

    // 「現在のタスク」セクションは無い.
    expect(screen.queryByRole("region", { name: /現在のタスク/ })).toBeNull();
  });

  it("シナリオ: 完了 / 削除 / 期限切替後にも repository.getFocus() が再フェッチされる (サーバ側で自動解除されている可能性)", async () => {
    // plan より「各書き込み mutation 後は today() と focus() を両方再フェッチする」.
    const repo = makeMockRepository([makeTask({ id: "t1", name: "MILK", version: 1 })], {
      initialFocus: {
        id: "singleton",
        currentTaskId: "t1",
        version: 1,
        updatedAt: NOW,
      },
    });
    const user = userEvent.setup();
    renderWithQueryClient(
      <TodayView repository={repo} projectRepository={makeMockProjectRepository()} />,
    );

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
    const repo = makeMockRepository([makeTask({ id: "t1", name: "MILK", version: 1 })], {
      initialCounter: {
        id: "singleton",
        completedCount: 2,
        lastResetExecutedAt: null,
        version: 3,
        updatedAt: NOW,
      },
    });
    renderWithQueryClient(
      <TodayView repository={repo} projectRepository={makeMockProjectRepository()} />,
    );

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
    const repo = makeMockRepository([makeTask({ id: "t1", name: "MILK", version: 1 })], {
      initialCounter: {
        id: "singleton",
        completedCount: 0,
        lastResetExecutedAt: null,
        version: 1,
        updatedAt: NOW,
      },
    });
    const user = userEvent.setup();
    renderWithQueryClient(
      <TodayView repository={repo} projectRepository={makeMockProjectRepository()} />,
    );

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
    const repo = makeMockRepository([makeTask({ id: "t1", name: "MILK", version: 1 })], {
      initialCounter: {
        id: "singleton",
        completedCount: 1,
        lastResetExecutedAt: null,
        version: 2,
        updatedAt: NOW,
      },
    });
    const user = userEvent.setup();
    renderWithQueryClient(
      <TodayView repository={repo} projectRepository={makeMockProjectRepository()} />,
    );

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
    renderWithQueryClient(
      <TodayView repository={repo} projectRepository={makeMockProjectRepository()} />,
    );

    await screen.findByText("MILK");

    // 期限切替 (明日にする) クリック. BL-042: ラベルは「明日にする」/「今日にする」に統一.
    const toggle = await screen.findByRole("button", { name: /明日にする|今日にする/ });
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
    renderWithQueryClient(
      <TodayView repository={repo} projectRepository={makeMockProjectRepository()} />,
    );

    // 「今日」見出しが出る (タスク 0 件でも描画される既存仕様).
    expect(await screen.findByRole("heading", { name: "今日" })).toBeInTheDocument();

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
    renderWithQueryClient(
      <TodayView repository={repo} projectRepository={makeMockProjectRepository()} />,
    );

    // タスクが表示されるまで待つ
    expect(await screen.findByText("朝の運動")).toBeInTheDocument();

    // ルーティン由来タスクの行には期限切替ボタンが存在しない
    // BL-042: ラベルは「明日にする」「今日にする」に統一.
    const deferButtons = screen.queryAllByRole("button", { name: /明日にする|今日にする/ });
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
    renderWithQueryClient(
      <TodayView repository={repo} projectRepository={makeMockProjectRepository()} />,
    );

    // タスクが表示されるまで待つ
    expect(await screen.findByText("牛乳を買う")).toBeInTheDocument();

    // manual タスクには期限切替ボタンが存在する. BL-042: ラベルは「明日にする」「今日にする」.
    const deferButton = await screen.findByRole("button", { name: /明日にする|今日にする/ });
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
    renderWithQueryClient(
      <TodayView repository={repo} projectRepository={makeMockProjectRepository()} />,
    );

    // 両タスクが表示されるまで待つ
    await screen.findByText("牛乳を買う");

    // 期限切替ボタンの数は 1 つだけ（manual タスクのみ）.
    // BL-042: ラベルは「明日にする」「今日にする」.
    const deferButtons = screen.queryAllByRole("button", { name: /明日にする|今日にする/ });
    expect(deferButtons).toHaveLength(1);
  });
});

// ============================================================
// BL-042 / task-card-actions: タスクカードのアクションを 3 つに削減
//
// spec.md (task-card-actions) §「受け入れ基準」 AC-1 / AC-2 / AC-8 / AC-10 / AC-11 と
// 1:1 対応する.
// - REQ-1 (AC-1): /today の各タスクカードに置かれるアクションボタンは
//   「削除」「明日にする」「完了」の 3 つのみ.
// - REQ-1 / AC-2: 強調セクション (現在のタスク) も同じ 3 ボタン規約 + 編集 / 現在解除 / 現在に設定 が無い.
// - REQ-3 / AC-10: 「編集」 button と aria-label="タスク編集フォーム" の form が DOM に存在しない.
// - REQ-3 / AC-11: 「現在に設定」「現在解除」 button が DOM に存在しない.
// - REQ-1 / AC-8: origin="routine" のタスクは「明日にする」非表示 → 「削除」「完了」の 2 ボタン.
// - 「明日へ」/「今日へ」というラベル文言は撤去され「明日にする」/「今日にする」に統一される.
//
// today-view.tsx 側の本実装はまだ 6 ボタンのままなので, 以下のテストはすべて red になる.
// implementer が green 化する.
// ============================================================

describe("TodayView (BL-042 タスクカードのアクション 3 ボタン化)", () => {
  it("シナリオ AC-1: 通常リストのカードに「削除」「明日にする」「完了」の 3 つの button が各 1 個ずつ存在する", async () => {
    // BL-042 spec AC-1: アクションボタンは「削除」「明日にする」「完了」の 3 つのみ.
    // sentinel として focus 用タスクを別に置き, 検証対象タスクを listitem 側に出す.
    const repo = makeMockRepository(
      [
        makeTask({
          id: "task-focus",
          name: "FOCUS-SENTINEL",
          priority: "highest",
          createdAt: "2026-06-09T07:00:00.000Z",
          version: 1,
        }),
        makeTask({
          id: "task-A",
          name: "AAA",
          priority: "normal",
          origin: "manual",
          createdAt: "2026-06-09T08:00:00.000Z",
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
    renderWithQueryClient(
      <TodayView repository={repo} projectRepository={makeMockProjectRepository()} />,
    );

    // 通常リストのカードを取得.
    const items = await screen.findAllByRole("listitem");
    const card = items.find((li) => (li.textContent ?? "").includes("AAA"));
    expect(card).toBeDefined();

    // 「削除」「明日にする」「完了」 button が各 1 個 (accessibleName 完全一致).
    expect(within(card!).getAllByRole("button", { name: "削除" })).toHaveLength(1);
    expect(within(card!).getAllByRole("button", { name: "明日にする" })).toHaveLength(1);
    expect(within(card!).getAllByRole("button", { name: "完了" })).toHaveLength(1);
  });

  it("シナリオ AC-1: 通常リストのカードに「編集 / 現在に設定 / 現在解除 / 明日へ / 今日へ」 button が存在しない", async () => {
    // BL-042 spec AC-1 / AC-10 / AC-11: 撤去されたラベルが残らない.
    const repo = makeMockRepository(
      [
        makeTask({
          id: "task-focus",
          name: "FOCUS-SENTINEL",
          priority: "highest",
          createdAt: "2026-06-09T07:00:00.000Z",
          version: 1,
        }),
        makeTask({
          id: "task-A",
          name: "AAA",
          priority: "normal",
          origin: "manual",
          createdAt: "2026-06-09T08:00:00.000Z",
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
    renderWithQueryClient(
      <TodayView repository={repo} projectRepository={makeMockProjectRepository()} />,
    );

    const items = await screen.findAllByRole("listitem");
    const card = items.find((li) => (li.textContent ?? "").includes("AAA"));
    expect(card).toBeDefined();

    // accessibleName が「編集」/「現在に設定」/「現在解除」/「明日へ」/「今日へ」の
    // button はカード内に 1 つも存在しない (accessibleName 完全一致で評価).
    expect(within(card!).queryByRole("button", { name: "編集" })).toBeNull();
    expect(within(card!).queryByRole("button", { name: "現在に設定" })).toBeNull();
    expect(within(card!).queryByRole("button", { name: "現在解除" })).toBeNull();
    expect(within(card!).queryByRole("button", { name: "明日へ" })).toBeNull();
    expect(within(card!).queryByRole("button", { name: "今日へ" })).toBeNull();
  });

  it("シナリオ AC-2: 強調セクション (現在のタスク) も 3 ボタン (「削除」「明日にする」「完了」) のみ + 編集 / 現在解除 / 現在に設定 が存在しない", async () => {
    // BL-042 spec AC-2: 強調セクション内のアクション button は 3 個のみ.
    const repo = makeMockRepository(
      [
        makeTask({
          id: "task-A",
          name: "FOCUS-A",
          priority: "normal",
          origin: "manual",
          createdAt: "2026-06-09T08:00:00.000Z",
          version: 1,
        }),
      ],
      {
        initialFocus: {
          id: "singleton",
          currentTaskId: "task-A",
          version: 1,
          updatedAt: NOW,
        },
      },
    );
    renderWithQueryClient(
      <TodayView repository={repo} projectRepository={makeMockProjectRepository()} />,
    );

    const focusSection = await screen.findByRole("region", { name: /現在のタスク/ });

    // 強調セクション内に「削除」「明日にする」「完了」が各 1 個ずつ.
    expect(within(focusSection).getAllByRole("button", { name: "削除" })).toHaveLength(1);
    expect(within(focusSection).getAllByRole("button", { name: "明日にする" })).toHaveLength(1);
    expect(within(focusSection).getAllByRole("button", { name: "完了" })).toHaveLength(1);

    // 撤去対象が居ない.
    expect(within(focusSection).queryByRole("button", { name: "編集" })).toBeNull();
    expect(within(focusSection).queryByRole("button", { name: "現在解除" })).toBeNull();
    expect(within(focusSection).queryByRole("button", { name: "現在に設定" })).toBeNull();
    expect(within(focusSection).queryByRole("button", { name: "明日へ" })).toBeNull();
    expect(within(focusSection).queryByRole("button", { name: "今日へ" })).toBeNull();
  });

  it('シナリオ AC-10: aria-label="タスク編集フォーム" の form は DOM に存在しない', async () => {
    // BL-042 spec AC-10: 編集経路の撤去. 編集フォーム JSX 自体が DOM に存在しない.
    const repo = makeMockRepository([makeTask({ id: "task-A", name: "AAA", version: 1 })]);
    renderWithQueryClient(
      <TodayView repository={repo} projectRepository={makeMockProjectRepository()} />,
    );

    // 描画完了を待つ.
    await screen.findByText("AAA");

    // 「タスク編集フォーム」の form は DOM に存在しない.
    expect(screen.queryByRole("form", { name: "タスク編集フォーム" })).toBeNull();
    // 念のため accessibleName が「編集」の button も画面全体 (起票フォーム / カード両方) で
    // 存在しないことを確認.
    expect(screen.queryByRole("button", { name: "編集" })).toBeNull();
  });

  it("シナリオ AC-11: 画面全体で「現在に設定」「現在解除」 button が存在しない", async () => {
    // BL-042 spec AC-11: focus 操作 button の撤去. 画面全体で 1 つも存在しない.
    const repo = makeMockRepository(
      [
        makeTask({
          id: "task-A",
          name: "AAA",
          priority: "normal",
          origin: "manual",
          createdAt: "2026-06-09T08:00:00.000Z",
          version: 1,
        }),
        makeTask({
          id: "task-B",
          name: "BBB",
          priority: "normal",
          origin: "manual",
          createdAt: "2026-06-09T08:00:01.000Z",
          version: 1,
        }),
      ],
      {
        initialFocus: {
          id: "singleton",
          currentTaskId: "task-A",
          version: 1,
          updatedAt: NOW,
        },
      },
    );
    renderWithQueryClient(
      <TodayView repository={repo} projectRepository={makeMockProjectRepository()} />,
    );

    // 強調セクションが描画されるのを待ち, focus 周辺 UI を確実にレンダリングさせる.
    await screen.findByRole("region", { name: /現在のタスク/ });

    expect(screen.queryByRole("button", { name: "現在に設定" })).toBeNull();
    expect(screen.queryByRole("button", { name: "現在解除" })).toBeNull();
  });

  it('シナリオ AC-8: origin="routine" のタスクでは「明日にする」非表示, 「削除」「完了」の 2 ボタンになる', async () => {
    // BL-042 spec AC-8: routine 由来は期限切替不可 (FR-033 継承) → カード上のアクションは 2 ボタン.
    const repo = makeMockRepository(
      [
        makeTask({
          id: "task-focus",
          name: "FOCUS-SENTINEL",
          priority: "highest",
          createdAt: "2026-06-09T07:00:00.000Z",
          version: 1,
        }),
        makeTask({
          id: "task-routine",
          name: "ROUTINE-TASK",
          priority: "normal",
          origin: "routine",
          routineId: "routine-1",
          createdAt: "2026-06-09T08:00:00.000Z",
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
    renderWithQueryClient(
      <TodayView repository={repo} projectRepository={makeMockProjectRepository()} />,
    );

    const items = await screen.findAllByRole("listitem");
    const card = items.find((li) => (li.textContent ?? "").includes("ROUTINE-TASK"));
    expect(card).toBeDefined();

    // 「削除」「完了」は存在.
    expect(within(card!).getAllByRole("button", { name: "削除" })).toHaveLength(1);
    expect(within(card!).getAllByRole("button", { name: "完了" })).toHaveLength(1);
    // 「明日にする」「今日にする」は非表示 (期限切替不可 / FR-033).
    expect(within(card!).queryByRole("button", { name: "明日にする" })).toBeNull();
    expect(within(card!).queryByRole("button", { name: "今日にする" })).toBeNull();
    // 旧ラベル「明日へ」も残らないこと (BL-042 でラベル統一済み).
    expect(within(card!).queryByRole("button", { name: "明日へ" })).toBeNull();
    expect(within(card!).queryByRole("button", { name: "今日へ" })).toBeNull();
    // 撤去対象 (編集 / 旧ラベルの focus 操作) も居ない.
    expect(within(card!).queryByRole("button", { name: "編集" })).toBeNull();
    expect(within(card!).queryByRole("button", { name: "現在に設定" })).toBeNull();
    // BL-043 (set-focus-gesture) REQ-1: 状態系コントロール「現在のタスクにする」は
    // origin="routine" のカードにも 1 個置かれる (focus 対象としてルーティン由来を
    // 区別しない. PriorityStars と同じ状態系グループでアクション 3 ボタンのカウント外).
    expect(within(card!).getAllByRole("button", { name: "現在のタスクにする" })).toHaveLength(1);
    // routine origin の card 内のアクション button は「削除」「完了」の 2 個ちょうど.
    // button 総数は アクション 2 個 + 状態系「現在のタスクにする」1 個 = 3 個
    // (PriorityStars の星 button は role="radio" でカウント外).
    const cardButtons = within(card!).getAllByRole("button");
    expect(cardButtons).toHaveLength(3);
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

    // BL-044: ヘッダ領域に「＋プロジェクトの追加」button が増えたため,
    // 起票フォーム scope 内で submit button を特定する (検証内容は不変).
    const submit = within(screen.getByRole("form", { name: "タスク起票フォーム" })).getByRole(
      "button",
      { name: /追加|起票|登録|送信/ },
    );
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

    // BL-044: ヘッダ領域に「＋プロジェクトの追加」button が増えたため,
    // 起票フォーム scope 内で submit button を特定する (検証内容は不変).
    const submit = within(screen.getByRole("form", { name: "タスク起票フォーム" })).getByRole(
      "button",
      { name: /追加|起票|登録|送信/ },
    );
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

describe("TodayView (BL-016 / BL-041 プロジェクト選択 UI)", () => {
  it('シナリオ AC-1: 起票フォームにプロジェクトトグルボタンが表示され, 旧 <select id="task-project"> は存在しない', async () => {
    // BL-041 spec.md AC-1:
    //   起票フォーム内に role="button" の 1 個の要素が「プロジェクト用トグル」として存在する.
    //   <select id="task-project"> は DOM に存在しない.
    //   ボタンの aria-label に「未分類」相当が含まれる.
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

    renderWithQueryClient(<TodayView repository={taskRepo} projectRepository={projectRepo} />);

    // タスク名入力欄の描画完了を待つ (= 起票フォームのレンダリング待ち).
    await screen.findByLabelText(/タスク名/);

    // 起票フォーム scope で検証する.
    const form = screen.getByRole("form", { name: "タスク起票フォーム" });

    // BL-041 spec AC-1: 旧 <select id="task-project"> は DOM 上に存在しない.
    expect(form.querySelector("#task-project")).toBeNull();
    // フォーム scope 内に <select> が 1 つも存在しないこと (= プロジェクト選択は button のみ).
    expect(form.querySelectorAll("select")).toHaveLength(0);

    // role="button" のトグル要素が起票フォーム内に存在する.
    const toggleButton = within(form).getByRole("button", { name: /プロジェクト/ });
    expect(toggleButton).toBeInTheDocument();
    expect(toggleButton.tagName).toBe("BUTTON");

    // 初期表示は「（未分類）」 (REQ-3).
    expect(toggleButton.textContent ?? "").toMatch(/（未分類）/);
    // aria-label に「未分類」相当が含まれる (REQ-4).
    const ariaLabel = toggleButton.getAttribute("aria-label") ?? "";
    expect(ariaLabel).toMatch(/未分類/);

    // projectRepository.list() が呼ばれている (BL-016 既存挙動の維持).
    expect(projectRepo.listMock).toHaveBeenCalledTimes(1);
  });

  it('シナリオ AC-3: トグルを 1 回クリックして「仕事」を選択してタスクを起票すると create.projectId === "p-1" が送信される', async () => {
    // BL-041 spec.md AC-3:
    //   Given プロジェクト「仕事」(id: "p-1") が登録されている.
    //   When  トグルを 1 回クリックし「仕事」を選んで「追加」.
    //   Then  TaskRepository.create が projectId="p-1" を含む引数で呼ばれる.
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

    renderWithQueryClient(<TodayView repository={taskRepo} projectRepository={projectRepo} />);

    // タスク名入力
    const nameInput = await screen.findByLabelText(/タスク名/);
    await user.type(nameInput, "資料を作る");

    // BL-041: 起票フォーム内のトグルボタンを取得する (旧 select ではない).
    const form = screen.getByRole("form", { name: "タスク起票フォーム" });
    const toggleButton = await within(form).findByRole("button", {
      name: /プロジェクト/,
    });
    // 1 周巡回: null → projects[0] = "仕事" (REQ-2).
    await user.click(toggleButton);

    // クリック後 textContent / aria-label が「仕事」を含むことを確認 (AC-2).
    expect(toggleButton.textContent ?? "").toContain("仕事");
    expect(toggleButton.getAttribute("aria-label") ?? "").toMatch(/仕事/);

    // 追加ボタンをクリック.
    // BL-044: ヘッダ領域に「＋プロジェクトの追加」button が増えたため,
    // 起票フォーム scope 内で submit button を特定する (検証内容は不変).
    const submit = within(screen.getByRole("form", { name: "タスク起票フォーム" })).getByRole(
      "button",
      { name: /追加|起票|登録|送信/ },
    );
    await user.click(submit);

    // create() が呼ばれて projectId が渡っている (REQ-6).
    expect(taskRepo.createMock).toHaveBeenCalledTimes(1);
    const arg = taskRepo.createMock.mock.calls[0]?.[0] as CreateTaskCommand;
    expect(arg.name).toBe("資料を作る");
    expect(arg.projectId).toBe(PROJECT_ID_P1);
  });

  it("シナリオ AC-4: トグルをクリックせず「（未分類）」のまま起票すると create.projectId が null", async () => {
    // BL-041 spec.md AC-4:
    //   Given プロジェクトが 1 件以上登録されている.
    //   When  トグルをクリックせず「（未分類）」のまま「追加」を押す.
    //   Then  TaskRepository.create が projectId=null を含む引数で呼ばれる.
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

    renderWithQueryClient(<TodayView repository={taskRepo} projectRepository={projectRepo} />);

    // タスク名入力
    const nameInput = await screen.findByLabelText(/タスク名/);
    await user.type(nameInput, "牛乳を買う");

    // BL-041: トグルはクリックせず「（未分類）」のまま起票する.
    // 念のため初期表示が「（未分類）」であることを確認.
    const form = screen.getByRole("form", { name: "タスク起票フォーム" });
    const toggleButton = within(form).getByRole("button", { name: /プロジェクト/ });
    expect(toggleButton.textContent ?? "").toMatch(/（未分類）/);

    // 追加ボタンをクリック.
    // BL-044: ヘッダ領域に「＋プロジェクトの追加」button が増えたため,
    // 起票フォーム scope 内で submit button を特定する (検証内容は不変).
    const submit = within(screen.getByRole("form", { name: "タスク起票フォーム" })).getByRole(
      "button",
      { name: /追加|起票|登録|送信/ },
    );
    await user.click(submit);

    // create() が呼ばれて projectId が null になっている (REQ-6 / D-004 "" ↔ null 境界変換).
    expect(taskRepo.createMock).toHaveBeenCalledTimes(1);
    const arg = taskRepo.createMock.mock.calls[0]?.[0] as CreateTaskCommand;
    expect(arg.name).toBe("牛乳を買う");
    expect(arg.projectId).toBeNull();
  });

  it("シナリオ AC-10: 起票成功後にトグルが「（未分類）」にリセットされる", async () => {
    // BL-041 spec.md AC-10:
    //   Given プロジェクト「仕事」を選び, タスク名「リセット確認」で「追加」を押した.
    //   When  起票完了直後にトグルを観察する.
    //   Then  トグル表示は「（未分類）」に戻っている (= 親 state の setProjectId("") リセットで「（未分類）」表示に戻る).
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

    renderWithQueryClient(<TodayView repository={taskRepo} projectRepository={projectRepo} />);

    const nameInput = await screen.findByLabelText(/タスク名/);
    await user.type(nameInput, "リセット確認");

    const form = screen.getByRole("form", { name: "タスク起票フォーム" });
    const toggleButton = await within(form).findByRole("button", {
      name: /プロジェクト/,
    });
    // 「仕事」を選ぶ.
    await user.click(toggleButton);
    expect(toggleButton.textContent ?? "").toContain("仕事");

    // 追加.
    // BL-044: ヘッダ領域に「＋プロジェクトの追加」button が増えたため,
    // 起票フォーム scope 内で submit button を特定する (検証内容は不変).
    const submit = within(screen.getByRole("form", { name: "タスク起票フォーム" })).getByRole(
      "button",
      { name: /追加|起票|登録|送信/ },
    );
    await user.click(submit);

    // 起票完了後にトグル表示が「（未分類）」にリセットされていること.
    // 同じ form 内のトグル button を再取得 (rerender 後の最新参照).
    const formAfter = screen.getByRole("form", { name: "タスク起票フォーム" });
    const toggleAfter = within(formAfter).getByRole("button", {
      name: /プロジェクト/,
    });
    expect(toggleAfter.textContent ?? "").toMatch(/（未分類）/);
  });
});

// ============================================================
// BL-047: 完了タスク数カウンタの配置見直し
//
// spec.md (completion-counter-placement) §「受け入れ基準」と 1:1 対応する.
//
// 受け入れ基準:
//   - 配置 (REQ-1 / REQ-2): カウンタが <header> の子孫に存在する
//   - ヘッダ 3 要素 (REQ-1): h1「今日」/ カウンタ / 「＋プロジェクトの追加」が同じ <header> 内
//   - マークアップ (REQ-2): カウンタ要素が <span> タグであること（<div> ではない）
//   - 他ビューへの非波及 (REQ-4): focus-view / tomorrow-view にカウンタが存在しない
//
// 現時点の実装:
//   カウンタは <header> の「外」に <div aria-label="今日の完了タスク数"> として存在する.
//   → 以下のテスト 1・2・3 は red（失敗）になる.
//   テスト 4・5 は既存の状態で green になる可能性がある.
// ============================================================

describe("TodayView (BL-047 完了タスク数カウンタの配置見直し)", () => {
  it("シナリオ: 完了数カウンタが today-view のヘッダ内に存在する (REQ-1 / REQ-2)", async () => {
    // spec.md §「配置 (REQ-1 / REQ-2)」:
    //   Given ユーザーが今日ビュー（/today）を開く
    //   When  ページを描画する
    //   Then  aria-label="今日の完了タスク数" を持つ要素が画面に存在する
    //   And   その要素が header 要素の子孫であることをセレクタで確認できる
    //
    // 現在のカウンタは <header> の外にあるため、このテストは red になる.
    // 実装後: カウンタが <header> 内に移動され green になる.
    const repo = makeMockRepository();
    renderWithQueryClient(
      <TodayView repository={repo} projectRepository={makeMockProjectRepository()} />,
    );

    // 描画完了を待つ.
    await screen.findByRole("heading", { name: "今日" });

    // ヘッダ要素を取得する.
    const header = document.querySelector("header");
    expect(header).not.toBeNull();

    // カウンタ要素を取得する.
    const counter = screen.queryByLabelText("今日の完了タスク数");
    expect(counter).not.toBeNull();

    // カウンタが header の子孫であること（REQ-1 配置).
    // 現在は <header> の外に存在するため、このアサーションが red になる.
    expect(header!.contains(counter)).toBe(true);
  });

  it("シナリオ: ヘッダに h1「今日」・カウンタ・「＋プロジェクトの追加」ボタンが同居する (REQ-1)", async () => {
    // spec.md §「ヘッダの 3 要素が左から h1 / カウンタ / ＋プロジェクトの追加 の順で並ぶ」:
    //   Given ユーザーが今日ビュー（/today）を開く
    //   When  header 内の子要素を確認する
    //   Then  h1「今日」と aria-label="今日の完了タスク数" 要素と「＋プロジェクトの追加」ボタンが
    //         同じ header 内に存在する
    //
    // 現在のカウンタは <header> 外にあるため、このテストは red になる.
    const repo = makeMockRepository();
    renderWithQueryClient(
      <TodayView repository={repo} projectRepository={makeMockProjectRepository()} />,
    );

    await screen.findByRole("heading", { name: "今日" });

    const header = document.querySelector("header");
    expect(header).not.toBeNull();

    // h1「今日」が header 内に存在する（既存仕様 / このアサーションは green のはず）.
    const h1 = header!.querySelector("h1");
    expect(h1).not.toBeNull();
    expect(h1!.textContent).toBe("今日");

    // カウンタが header 内に存在する（このアサーションが red になる）.
    const counter = header!.querySelector("[aria-label='今日の完了タスク数']");
    expect(counter).not.toBeNull();

    // 「＋プロジェクトの追加」ボタンが header 内に存在する（既存仕様 / このアサーションは green のはず）.
    const addProjectButton = within(header!).getByRole("button", { name: /プロジェクトの追加/ });
    expect(addProjectButton).toBeInTheDocument();

    // DOM 順序: h1 → カウンタ → ＋プロジェクトの追加 の順であること (REQ-1 / auditor 指摘).
    const h1Pos = h1!.compareDocumentPosition(counter!);
    expect(h1Pos & Node.DOCUMENT_POSITION_FOLLOWING, "h1 の後にカウンタが来る").toBeTruthy();
    const counterPos = counter!.compareDocumentPosition(addProjectButton);
    expect(counterPos & Node.DOCUMENT_POSITION_FOLLOWING, "カウンタの後に＋プロジェクトの追加が来る").toBeTruthy();
  });

  it("シナリオ: カウンタ要素が <span> タグである（<div> ではない）(REQ-2)", async () => {
    // spec.md §「マークアップ (REQ-2)」:
    //   要素は <span aria-label="今日の完了タスク数"> として変更する.
    //   ラッパー <div aria-label="..."> は削除し、インライン表示に適した <span> に変更する.
    //
    // 現在は <div aria-label="今日の完了タスク数"> が存在するため、このテストは red になる.
    const repo = makeMockRepository();
    renderWithQueryClient(
      <TodayView repository={repo} projectRepository={makeMockProjectRepository()} />,
    );

    await screen.findByRole("heading", { name: "今日" });

    // aria-label でカウンタ要素を取得する.
    const counter = screen.queryByLabelText("今日の完了タスク数");
    expect(counter).not.toBeNull();

    // <span> タグであること（<div> ではない）.
    // 現在は <div> なので red. 実装後 <span> に変わり green になる.
    expect(counter!.tagName).toBe("SPAN");
  });

  it("シナリオ: focus-view には aria-label=\"今日の完了タスク数\" 要素が存在しない (REQ-4)", async () => {
    // spec.md §「focus-view には完了数カウンタが存在しない」:
    //   Given ユーザーが現在のタスクビュー（/focus）を開く
    //   When  ページを描画する
    //   Then  aria-label="今日の完了タスク数" を持つ要素が存在しない
    //
    // focus-view は BL-035 U-003 候補(b)を採用しないため、カウンタを表示しない.
    // この仕様は既存状態でも満たされているため、green になる可能性がある.
    // 実装後も green を維持することを確認する.
    const { FocusView } = await import("../src/ui/focus-view/focus-view.js");
    const focusRepo = (() => {
      const focusMakeMockRepository = (initial: import("@todica/domain/task").Task[] = []) => {
        const state = [...initial];
        const focusState = {
          id: "singleton",
          currentTaskId: null as string | null,
          version: 1,
          updatedAt: "2026-06-10T09:00:00.000Z",
        };
        const counterState = {
          id: "singleton",
          completedCount: 0,
          lastResetExecutedAt: null as string | null,
          version: 1,
          updatedAt: "2026-06-10T09:00:00.000Z",
        };
        const PRIORITY_ORDER: Record<string, number> = { highest: 0, normal: 1, later: 2 };
        return {
          list: vi.fn(async () => [...state]),
          create: vi.fn(async () => { throw new Error("not used"); }),
          update: vi.fn(async () => { throw new Error("not used"); }),
          delete: vi.fn(async () => {}),
          complete: vi.fn(async () => { throw new Error("not used"); }),
          today: vi.fn(async () => {
            const filtered = state.filter((t) => t.dueDate === "today" && t.trashedAt === null);
            const sorted = [...filtered].sort((a, b) => {
              const p = (PRIORITY_ORDER[a.priority] ?? 99) - (PRIORITY_ORDER[b.priority] ?? 99);
              if (p !== 0) return p;
              return a.createdAt.localeCompare(b.createdAt);
            });
            return {
              tasks: sorted,
              nextTaskId: sorted[0]?.id ?? null,
              currentTaskId: focusState.currentTaskId,
              completionCount: counterState.completedCount,
            };
          }),
          getFocus: vi.fn(async () => ({ ...focusState })),
          setFocus: vi.fn(async () => ({ ...focusState })),
          getCounter: vi.fn(async () => ({ ...counterState })),
        };
      };
      return focusMakeMockRepository();
    })();

    const { QueryClient, QueryClientProvider } = await import("@tanstack/react-query");
    const { render: renderDom } = await import("@testing-library/react");
    const React = await import("react");

    const focusQueryClient = new QueryClient({
      defaultOptions: {
        queries: { staleTime: Number.POSITIVE_INFINITY, retry: false, networkMode: "offlineFirst" },
        mutations: { retry: false, networkMode: "offlineFirst" },
      },
    });

    const makeFocusMockProjectRepository = () => ({
      list: vi.fn(async () => []),
      create: vi.fn(async () => { throw new Error("not used"); }),
      update: vi.fn(async () => { throw new Error("not used"); }),
      delete: vi.fn(async () => {}),
    });

    renderDom(
      React.createElement(
        QueryClientProvider,
        { client: focusQueryClient },
        React.createElement(FocusView, {
          repository: focusRepo,
          projectRepository: makeFocusMockProjectRepository(),
        }),
      ),
    );

    // 描画完了を待つ（空状態でも「現在のタスクはありません」が表示される）.
    await screen.findByRole("heading", { name: "現在のタスク", level: 1 });

    // focus-view には完了数カウンタが存在しない（REQ-4 非波及）.
    expect(screen.queryByLabelText("今日の完了タスク数")).toBeNull();
  });

  it("シナリオ: tomorrow-view には aria-label=\"今日の完了タスク数\" 要素が存在しない (REQ-4)", async () => {
    // spec.md §「tomorrow-view には完了数カウンタが存在しない」:
    //   Given ユーザーが明日のタスクビュー（/tomorrow）を開く
    //   When  ページを描画する
    //   Then  aria-label="今日の完了タスク数" を持つ要素が存在しない
    //
    // tomorrow-view は「今日」のタスク文脈を持たないため、カウンタを表示しない.
    // この仕様は既存状態でも満たされているため、green になる可能性がある.
    // 実装後も green を維持することを確認する.
    const { TomorrowView } = await import("../src/ui/tomorrow-view/tomorrow-view.js");
    const { QueryClient, QueryClientProvider } = await import("@tanstack/react-query");
    const { render: renderDom } = await import("@testing-library/react");
    const React = await import("react");

    const tomorrowQueryClient = new QueryClient({
      defaultOptions: {
        queries: { staleTime: Number.POSITIVE_INFINITY, retry: false, networkMode: "offlineFirst" },
        mutations: { retry: false, networkMode: "offlineFirst" },
      },
    });

    const makeTomorrowMockRepo = () => {
      const PRIORITY_ORDER: Record<string, number> = { highest: 0, normal: 1, later: 2 };
      return {
        list: vi.fn(async () => []),
        create: vi.fn(async () => { throw new Error("not used"); }),
        update: vi.fn(async () => { throw new Error("not used"); }),
        delete: vi.fn(async () => {}),
        complete: vi.fn(async () => { throw new Error("not used"); }),
        today: vi.fn(async () => ({
          tasks: [],
          nextTaskId: null,
          currentTaskId: null,
          completionCount: 0,
        })),
        getFocus: vi.fn(async () => ({
          id: "singleton",
          currentTaskId: null as string | null,
          version: 1,
          updatedAt: "2026-06-10T09:00:00.000Z",
        })),
        setFocus: vi.fn(async () => ({
          id: "singleton",
          currentTaskId: null as string | null,
          version: 1,
          updatedAt: "2026-06-10T09:00:00.000Z",
        })),
        getCounter: vi.fn(async () => ({
          id: "singleton",
          completedCount: 0,
          lastResetExecutedAt: null as string | null,
          version: 1,
          updatedAt: "2026-06-10T09:00:00.000Z",
        })),
        // tomorrow-view 用: list({ dueDate }) に対応
        _priorityOrder: PRIORITY_ORDER,
      };
    };

    const makeTomorrowMockProjectRepository = () => ({
      list: vi.fn(async () => []),
      create: vi.fn(async () => { throw new Error("not used"); }),
      update: vi.fn(async () => { throw new Error("not used"); }),
      delete: vi.fn(async () => {}),
    });

    renderDom(
      React.createElement(
        QueryClientProvider,
        { client: tomorrowQueryClient },
        React.createElement(TomorrowView, {
          repository: makeTomorrowMockRepo(),
          projectRepository: makeTomorrowMockProjectRepository(),
        }),
      ),
    );

    // 描画完了を待つ（tomorrow-view の見出しが表示されるまで）.
    // tomorrow-view の h1 は「明日のタスク」.
    await screen.findByRole("heading", { name: "明日のタスク" });

    // tomorrow-view には完了数カウンタが存在しない（REQ-4 非波及）.
    expect(screen.queryByLabelText("今日の完了タスク数")).toBeNull();
  });
});
