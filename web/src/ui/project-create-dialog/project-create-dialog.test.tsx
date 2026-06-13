/**
 * 単体テスト: ProjectCreateDialog .
 *
 * 仕様参照:
 *   docs/developer/features/inline-project-create/spec.md REQ-2〜REQ-5 / REQ-7.
 *   docs/developer/features/inline-project-create/plan.md §「コンポーネント設計」/ §「テスト方針」.
 *   docs/developer/features/inline-project-create/tasks.md §「テスト」(単体テスト 5 観点).
 *
 * 観点 (tasks.md の分解どおり):
 *   1. `open=true` で showModal が呼ばれて開き, `open=false` で閉じる (prop ↔ DOM 同期).
 *   2. 名称入力 + 送信で repository.create が { id: <uuid>, name } で呼ばれる
 *      (成功時は onCreated / onClose に伝播する. spec REQ-4).
 *   3. 入力に required / maxLength=200 属性がある (spec REQ-3 / REQ-6).
 *   4. repository.create 失敗時にダイアログが開いたままで入力値が保持される (spec REQ-7).
 *   5. mutation pending 中は「追加」button が disabled (spec REQ-7).
 *
 * 本ファイルは TDD の "red" を作るためのテスト.
 * project-create-dialog.tsx は未実装のため, 全テストはインポートエラーで失敗する想定.
 * implementer が ProjectCreateDialog を実装することで green 化する.
 *
 * jsdom は HTMLDialogElement.showModal / close が未実装のため, web/__tests__/setup.ts
 * の最小 polyfill を前提とする (spec U-5).
 * フォーカストラップ / Escape のネイティブ挙動は jsdom では再現しないため,
 * それらは Playwright E2E (e2e/inline-project-create.spec.ts AC-2 / AC-6 / AC-11) を正とする.
 *
 * モック ProjectRepository を props 注入するパターンは projects-view.test.tsx と同形とする.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project, ProjectRepository } from "../../repositories/project-repository.js";
import { ProjectCreateDialog } from "./project-create-dialog.js";

// ============================================================
// QueryClientProvider ラッパー
// ============================================================

/**
 * 同一 QueryClient を保ったまま rerender できるよう, wrapper オプションで包む.
 * defaultOptions は projects-view.test.tsx と同じ (offlineFirst).
 */
function createWrapper(): ({ children }: { children: ReactNode }) => ReactNode {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Number.POSITIVE_INFINITY, networkMode: "offlineFirst" },
      mutations: { retry: false, networkMode: "offlineFirst" },
    },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

// ============================================================
// テストフィクスチャ
// ============================================================

const NOW = "2026-06-10T09:00:00.000Z";
const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    name: "仕事",
    version: 1,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

// ============================================================
// モック ProjectRepository ファクトリ (projects-view.test.tsx と同形)
// ============================================================

function makeMockRepository(): ProjectRepository & {
  listMock: ReturnType<typeof vi.fn>;
  createMock: ReturnType<typeof vi.fn>;
} {
  const listMock = vi.fn(async (): Promise<Project[]> => []);
  const createMock = vi.fn(
    async (cmd: { id: string; name: string }): Promise<Project> =>
      makeProject({ id: cmd.id, name: cmd.name }),
  );
  const updateMock = vi.fn(async (): Promise<Project> => makeProject());
  const deleteMock = vi.fn(async (): Promise<void> => undefined);

  return {
    list: listMock,
    create: createMock,
    update: updateMock,
    delete: deleteMock,
    listMock,
    createMock,
  };
}

/** DOM 上の <dialog> 要素 (showModal の実効状態 = open プロパティで判定する). */
function dialogElement(): HTMLDialogElement | null {
  return document.querySelector("dialog");
}

// ============================================================
// ProjectCreateDialog テスト
// ============================================================

describe("ProjectCreateDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * 観点 1 (spec REQ-2 / plan §コンポーネント設計):
   *   Given open=false でマウントされた
   *   Then  <dialog> は開いていない
   *   When  open=true に変わる
   *   Then  showModal によりモーダルとして開く
   *   When  open=false に戻る
   *   Then  閉じる
   */
  it("open prop と <dialog> の開閉状態が同期する (showModal / close)", async () => {
    const repo = makeMockRepository();
    const wrapper = createWrapper();
    const onClose = vi.fn();
    const onCreated = vi.fn();

    const { rerender } = render(
      <ProjectCreateDialog
        repository={repo}
        open={false}
        onClose={onClose}
        onCreated={onCreated}
      />,
      { wrapper },
    );

    // open=false: <dialog> は存在するが開いていない.
    expect(dialogElement()).not.toBeNull();
    expect(dialogElement()?.open).toBe(false);

    // open=true: showModal で開く.
    rerender(
      <ProjectCreateDialog repository={repo} open={true} onClose={onClose} onCreated={onCreated} />,
    );
    await waitFor(() => expect(dialogElement()?.open).toBe(true));
    // 見出し「プロジェクトの追加」がアクセシブルネームになっている (spec REQ-2).
    expect(screen.getByRole("dialog", { name: "プロジェクトの追加" })).toBeInTheDocument();

    // open=false: 閉じる.
    rerender(
      <ProjectCreateDialog
        repository={repo}
        open={false}
        onClose={onClose}
        onCreated={onCreated}
      />,
    );
    await waitFor(() => expect(dialogElement()?.open).toBe(false));
  });

  /**
   * 観点 2 (spec REQ-4):
   *   Given モーダルが開いている
   *   When  名称「仕事」を入力して「追加」を押す
   *   Then  repository.create が { id: <クライアント生成 UUID>, name: "仕事" } で呼ばれる
   *   And   オンライン成功時は onCreated(作成された Project) と onClose が呼ばれる
   */
  it("名称入力 + 送信で repository.create が { id: <uuid>, name } で呼ばれ, 成功が親へ伝播する", async () => {
    const repo = makeMockRepository();
    const wrapper = createWrapper();
    const onClose = vi.fn();
    const onCreated = vi.fn();
    const user = userEvent.setup();

    render(
      <ProjectCreateDialog repository={repo} open={true} onClose={onClose} onCreated={onCreated} />,
      { wrapper },
    );

    await user.type(screen.getByLabelText("プロジェクト名"), "仕事");
    await user.click(screen.getByRole("button", { name: "追加" }));

    await waitFor(() => expect(repo.createMock).toHaveBeenCalledTimes(1));
    const arg = repo.createMock.mock.calls[0]?.[0] as { id: string; name: string };
    expect(arg.name).toBe("仕事");
    expect(arg.id).toMatch(UUID_V4_PATTERN);

    // オンライン成功 (jsdom は navigator.onLine = true): onCreated に Project が渡る.
    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
    expect(onCreated.mock.calls[0]?.[0]).toMatchObject({ name: "仕事" });
    // 成功でモーダルは閉鎖経路へ (親が open=false にするための onClose).
    expect(onClose).toHaveBeenCalled();
  });

  /**
   * 観点 3 (spec REQ-3 / REQ-6):
   *   Then 名称入力は required かつ maxLength=200 である
   *   And  「追加」は submit, 「キャンセル」は button である
   */
  it("名称入力に required / maxLength=200 があり, 追加=submit / キャンセル=button である", () => {
    const repo = makeMockRepository();
    const wrapper = createWrapper();

    render(
      <ProjectCreateDialog repository={repo} open={true} onClose={vi.fn()} onCreated={vi.fn()} />,
      { wrapper },
    );

    const input = screen.getByLabelText("プロジェクト名");
    expect(input).toBeRequired();
    expect(input).toHaveAttribute("maxlength", "200");

    expect(screen.getByRole("button", { name: "追加" })).toHaveAttribute("type", "submit");
    expect(screen.getByRole("button", { name: "キャンセル" })).toHaveAttribute("type", "button");
  });

  /**
   * 観点 4 (spec REQ-7):
   *   Given repository.create がサーバエラーで失敗する
   *   When  名称「再試行プロジェクト」で送信する
   *   Then  ダイアログは開いたままで入力値が保持され, onClose / onCreated は呼ばれない
   *         (notifyError 経路. バナー表示自体は E2E AC-8 を正とする)
   */
  it("repository.create 失敗時はダイアログが開いたままで入力値が保持される", async () => {
    const repo = makeMockRepository();
    repo.createMock.mockRejectedValueOnce(new Error("HTTP 500: failed to create project"));
    const wrapper = createWrapper();
    const onClose = vi.fn();
    const onCreated = vi.fn();
    const user = userEvent.setup();

    render(
      <ProjectCreateDialog repository={repo} open={true} onClose={onClose} onCreated={onCreated} />,
      { wrapper },
    );

    await user.type(screen.getByLabelText("プロジェクト名"), "再試行プロジェクト");
    await user.click(screen.getByRole("button", { name: "追加" }));

    await waitFor(() => expect(repo.createMock).toHaveBeenCalledTimes(1));

    // ダイアログは開いたまま (閉鎖経路に入らない).
    expect(dialogElement()?.open).toBe(true);
    expect(onClose).not.toHaveBeenCalled();
    expect(onCreated).not.toHaveBeenCalled();
    // 入力した名称が保持されている (そのまま再試行できる).
    expect(screen.getByLabelText("プロジェクト名")).toHaveValue("再試行プロジェクト");
  });

  /**
   * 観点 5 (spec REQ-7):
   *   Given repository.create が未解決 (pending) である
   *   When  送信する
   *   Then  「追加」button が disabled になり多重送信を防ぐ
   */
  it("mutation pending 中は「追加」button が disabled になる", async () => {
    const repo = makeMockRepository();
    let resolveCreate: ((project: Project) => void) | undefined;
    repo.createMock.mockImplementationOnce(
      () =>
        new Promise<Project>((resolve) => {
          resolveCreate = resolve;
        }),
    );
    const wrapper = createWrapper();
    const user = userEvent.setup();

    render(
      <ProjectCreateDialog repository={repo} open={true} onClose={vi.fn()} onCreated={vi.fn()} />,
      { wrapper },
    );

    await user.type(screen.getByLabelText("プロジェクト名"), "送信中");
    await user.click(screen.getByRole("button", { name: "追加" }));

    // pending 中: 「追加」が disabled.
    await waitFor(() => expect(screen.getByRole("button", { name: "追加" })).toBeDisabled());

    // 後始末: pending を解決してテストを終える.
    resolveCreate?.(makeProject({ name: "送信中" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "追加" })).not.toBeDisabled());
  });
});
