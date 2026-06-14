/**
 * Web クライアント単体テスト: SettingsView の「リセット時刻」ラベル化と重複表示撤去.
 *
 * 受け入れ基準の出典:
 *   - docs/developer/features/reset-time-rework/spec.md §「(G-3) UI ラベル変更」
 *   - docs/developer/features/reset-time-rework/spec.md §「(G-4) SettingsView の重複表示撤去」
 *
 * 検証ポイント:
 *   1. 入力欄のラベルが「リセット時刻」と表示される (G-3).
 *   2. 入力欄の id は "day-boundary-time" のまま (内部識別子据え置き / G-3).
 *   3. <div className="settings-view__current"> 相当 (aria-label="設定値" の div)
 *      が DOM に存在しない (G-4).
 *   4. 保存後の最新値は input の value で表示される (重複表示しない / G-4).
 *
 * 現状実装 (settings-view.tsx):
 *   - <label htmlFor="day-boundary-time">境界時刻</label> となっており
 *     「リセット時刻」を期待する 1. は失敗する.
 *   - <div className="settings-view__current" aria-label="設定値"> が DOM に残っており
 *     3. は失敗する.
 *   - 2. (id 据え置き) と 4. (保存後 input 反映) は現状でも通る可能性があるが,
 *     スペックの維持要件として明示的に表現する.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsView } from "../src/ui/settings-view/settings-view.js";

interface Settings {
  id: string;
  dayBoundaryTime: string;
  version: number;
  updatedAt: string;
}

interface PatchSettingsCommand {
  dayBoundaryTime: string;
  ifMatch: number;
}

interface SettingsRepository {
  getSettings(): Promise<Settings>;
  patchSettings(cmd: PatchSettingsCommand): Promise<Settings>;
}

function renderWithQueryClient(ui: ReactNode): ReturnType<typeof render> {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Number.POSITIVE_INFINITY, networkMode: "offlineFirst" },
      mutations: { retry: false, networkMode: "offlineFirst" },
    },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

function makeMockRepository(initial?: Partial<Settings>): SettingsRepository & {
  getSettingsMock: ReturnType<typeof vi.fn>;
  patchSettingsMock: ReturnType<typeof vi.fn>;
} {
  const state: Settings = {
    id: "singleton",
    dayBoundaryTime: "04:00",
    version: 1,
    updatedAt: "2026-06-07T09:00:00.000Z",
    ...initial,
  };

  const getSettingsMock = vi.fn(async (): Promise<Settings> => ({ ...state }));
  const patchSettingsMock = vi.fn(async (cmd: PatchSettingsCommand): Promise<Settings> => {
    state.dayBoundaryTime = cmd.dayBoundaryTime;
    state.version = cmd.ifMatch + 1;
    state.updatedAt = new Date().toISOString();
    return { ...state };
  });

  return {
    getSettings: getSettingsMock,
    patchSettings: patchSettingsMock,
    getSettingsMock,
    patchSettingsMock,
  };
}

describe("SettingsView (BL-091 / spec.md G-3 ラベル「リセット時刻」)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("シナリオ: 入力欄のラベルテキストが「リセット時刻」と表示される", async () => {
    // spec.md §G-3 シナリオ:
    //   Given SettingsView を開く
    //   When  画面を確認する
    //   Then  入力欄のラベルテキストが「リセット時刻」と表示されている
    const repo = makeMockRepository({ dayBoundaryTime: "04:00" });
    renderWithQueryClient(<SettingsView repository={repo} />);

    // 「リセット時刻」というラベル文字列を持つ要素が存在する.
    expect(await screen.findByText("リセット時刻")).toBeInTheDocument();

    // getByLabelText で input に到達できる.
    const input = await screen.findByLabelText("リセット時刻");
    expect(input).toBeInstanceOf(HTMLInputElement);
  });

  it("シナリオ: 入力欄の id は 'day-boundary-time' のまま (内部識別子据え置き)", async () => {
    // spec.md §G-3 シナリオ「入力欄の id は 'day-boundary-time' のまま (内部識別子は据え置き)」
    const repo = makeMockRepository({ dayBoundaryTime: "04:00" });
    renderWithQueryClient(<SettingsView repository={repo} />);

    // ラベル経由でも id 直指定でも同じ要素が取れることを確認する.
    const inputByLabel = await screen.findByLabelText("リセット時刻");
    expect((inputByLabel as HTMLInputElement).id).toBe("day-boundary-time");

    const inputById = document.getElementById("day-boundary-time");
    expect(inputById).not.toBeNull();
    expect(inputById).toBe(inputByLabel);
  });

  it("シナリオ: 「境界時刻」というラベル文字列は表示されない (旧文言の撤去)", async () => {
    // spec.md §G-3: ユーザーに見える文言は「境界時刻」→「リセット時刻」に統一する.
    // 内部識別子は据え置きだが, label 表示テキストは新文言のみ.
    const repo = makeMockRepository({ dayBoundaryTime: "04:00" });
    renderWithQueryClient(<SettingsView repository={repo} />);

    // 「リセット時刻」が描画されるのを待ってから「境界時刻」が DOM に無いことを確認する.
    await screen.findByText("リセット時刻");
    // 完全一致での「境界時刻」テキスト要素は無い.
    expect(screen.queryByText("境界時刻")).toBeNull();
  });
});

describe("SettingsView (BL-091 / spec.md G-4 重複表示の撤去)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("シナリオ: aria-label='設定値' を持つ <div className='settings-view__current'> 相当の要素は存在しない", async () => {
    // spec.md §G-4 シナリオ:
    //   Given SettingsView を開く
    //   When  画面を確認する
    //   Then  aria-label="設定値" を持つ <div className="settings-view__current"> 相当の要素は存在しない
    const repo = makeMockRepository({ dayBoundaryTime: "04:00" });
    const { container } = renderWithQueryClient(<SettingsView repository={repo} />);

    // 初期表示が落ち着くのを待つ. リセット時刻ラベルがあれば描画完了.
    await screen.findByLabelText("リセット時刻");

    // aria-label="設定値" を持つ要素は無い.
    expect(screen.queryByLabelText("設定値")).toBeNull();

    // class 名 settings-view__current を持つ要素も無い.
    const dupBlock = container.querySelector(".settings-view__current");
    expect(dupBlock).toBeNull();
  });

  it("シナリオ: 現在値は input 欄の value として表示されている", async () => {
    // spec.md §G-4: input 欄が現在値の表示と編集を兼ねる.
    const repo = makeMockRepository({ dayBoundaryTime: "04:00" });
    renderWithQueryClient(<SettingsView repository={repo} />);

    const input = (await screen.findByLabelText("リセット時刻")) as HTMLInputElement;
    expect(input.value).toBe("04:00");
  });

  it("シナリオ: dayBoundaryTime は input control 以外の DOM ノードに表示されない", async () => {
    const repo = makeMockRepository({ dayBoundaryTime: "04:00" });
    const { container } = renderWithQueryClient(<SettingsView repository={repo} />);

    const input = await screen.findByLabelText("リセット時刻");
    const form = input.closest("form");

    expect(form).not.toBeNull();
    expect(form?.querySelector("output")).toBeNull();
    expect(screen.queryByText("04:00")).toBeNull();
    expect(input).toHaveValue("04:00");
    expect(container.querySelectorAll('input[value="04:00"]')).toHaveLength(1);
  });

  it("シナリオ: 保存後の最新値は input の value に反映される (重複表示しない)", async () => {
    // spec.md §G-4 シナリオ:
    //   Given SettingsView が開かれており input 欄に "04:00" が表示されている
    //   When  ユーザーが input 欄に "06:00" を入力して保存操作をする
    //   And   サーバが 200 OK で dayBoundaryTime = "06:00" を返す
    //   Then  入力欄の value が "06:00" になっている
    //   And   別の「現在値表示ブロック」は表示されない
    const repo = makeMockRepository({ dayBoundaryTime: "04:00", version: 1 });
    const user = userEvent.setup();
    const { container } = renderWithQueryClient(<SettingsView repository={repo} />);

    const input = (await screen.findByLabelText("リセット時刻")) as HTMLInputElement;
    expect(input.value).toBe("04:00");

    await user.clear(input);
    await user.type(input, "06:00");

    const saveButton = screen.getByRole("button", { name: /保存|更新/ });
    await user.click(saveButton);

    // patchSettings が呼ばれる.
    expect(repo.patchSettingsMock).toHaveBeenCalledTimes(1);

    // 保存後に input の value が "06:00" になる.
    const updated = (await screen.findByLabelText("リセット時刻")) as HTMLInputElement;
    // ラベル経由再取得した input の value が更新後の値である.
    // (DOM は同じ要素なので value プロパティで確認する)
    expect(updated.value).toBe("06:00");

    // 別の「現在値表示ブロック」は無い.
    expect(screen.queryByLabelText("設定値")).toBeNull();
    expect(container.querySelector(".settings-view__current")).toBeNull();
  });
});
