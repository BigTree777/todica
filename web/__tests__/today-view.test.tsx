/**
 * Web クライアント単体テスト: 今日ビューの起票・編集・期限切替・削除.
 *
 * spec.md §「Web クライアント UI (NFR-001 / NFR-010)」の 5 シナリオを扱う.
 * - Repository をモック化し, UI から呼ばれた引数・回数を検証する.
 * - TodayView は test-designer のスタブのため, ここでも全テストは red になる想定.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Task } from "@todica/domain/task";
import { TodayView } from "../src/ui/today-view/today-view.js";
import type {
  CompleteTaskCommand,
  CreateTaskCommand,
  DeleteTaskCommand,
  TaskRepository,
  UpdateTaskCommand,
} from "../src/repositories/task-repository.js";

const NOW = "2026-06-07T09:00:00.000Z";

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

function makeMockRepository(initial: Task[] = []): TaskRepository & {
  createMock: ReturnType<typeof vi.fn>;
  updateMock: ReturnType<typeof vi.fn>;
  deleteMock: ReturnType<typeof vi.fn>;
  completeMock: ReturnType<typeof vi.fn>;
  listMock: ReturnType<typeof vi.fn>;
  todayMock: ReturnType<typeof vi.fn>;
} {
  const state = [...initial];
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
    return { tasks: sorted, nextTaskId: sorted[0]?.id ?? null };
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
    const next: Task = {
      ...state[idx]!,
      trashedAt: "2026-06-07T09:00:01.000Z",
      trashedReason: "completed",
      version: (state[idx]!.version ?? 0) + 1,
    };
    state[idx] = next;
    return next;
  });
  return {
    list: listMock,
    create: createMock,
    update: updateMock,
    delete: deleteMock,
    complete: completeMock,
    today: todayMock,
    listMock,
    createMock,
    updateMock,
    deleteMock,
    completeMock,
    todayMock,
  };
}

describe("TodayView (Web クライアント UI)", () => {
  it("シナリオ: 今日ビューの起票フォームはタスク名のみ必須である", async () => {
    const repo = makeMockRepository();
    render(<TodayView repository={repo} />);

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
    render(<TodayView repository={repo} />);

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
    render(<TodayView repository={repo} />);

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
    render(<TodayView repository={repo} />);

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
    render(<TodayView repository={repo} />);

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
    render(<TodayView repository={repo} />);

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
    render(<TodayView repository={repo} />);

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
    render(<TodayView repository={repo} />);

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
    render(<TodayView repository={repo} />);

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
    const repo = makeMockRepository([
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
    ]);
    const user = userEvent.setup();
    render(<TodayView repository={repo} />);

    // 描画後, 初期並びを確認 (A, B).
    const itemsBefore = await screen.findAllByRole("listitem");
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
    render(<TodayView repository={repo} />);

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
    render(<TodayView repository={repo} />);

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
    render(<TodayView repository={repo} />);

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
    render(<TodayView repository={repo} />);

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
    render(<TodayView repository={repo} />);

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
    render(<TodayView repository={repo} />);

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
    const repo = makeMockRepository([
      // 投入順は混乱させる (UI が再ソートしなければ mock 内ソートの結果がそのまま出る).
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
    ]);
    render(<TodayView repository={repo} />);

    // 描画を待つ.
    await screen.findByText("AAA");

    const items = await screen.findAllByRole("listitem");
    // 期待: A (highest) → B (normal) → C (later).
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
    render(<TodayView repository={repo} />);

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
    render(<TodayView repository={repo} />);

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
