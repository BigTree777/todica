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
  listMock: ReturnType<typeof vi.fn>;
} {
  const state = [...initial];
  const listMock = vi.fn(async () => [...state]);
  const createMock = vi.fn(async (cmd: CreateTaskCommand) => {
    const t = makeTask({
      id: cmd.id,
      name: cmd.name,
      projectId: cmd.projectId ?? null,
      dueDate: cmd.dueDate ?? "today",
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
