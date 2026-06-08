/**
 * Web クライアント単体テスト: 境界時刻の設定 SettingsView (BL-009 / FR-041 / FR-042).
 *
 * 受け入れ基準の出典: docs/developer/features/settings-day-boundary/spec.md
 * §「Web クライアント SettingsView」と 1:1 対応するシナリオを扱う.
 *
 * 注意: 本ファイルは TDD の "red" を作るためのテスト.
 *       SettingsView コンポーネントはまだ存在しないため,
 *       このファイル内のテストはすべてコンパイルエラー / 失敗する想定.
 *       implementer が SettingsView を実装することで green 化する.
 *
 * SettingsRepository インターフェース (web 側):
 *   - getSettings(): Promise<Settings>
 *   - patchSettings(cmd: PatchSettingsCommand): Promise<Settings>
 *
 * Settings 型 (web 側):
 *   - id: string
 *   - dayBoundaryTime: string
 *   - version: number
 *   - updatedAt: string
 *
 * PatchSettingsCommand:
 *   - dayBoundaryTime: string
 *   - ifMatch: number
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SettingsView } from "../src/ui/settings-view/settings-view.js";
import { PatchConflictError } from "../src/repositories/settings-repository.js";

// ============================================================
// 型定義 (web 側 SettingsRepository — implementer が本ファイルを作成する前の inline 定義)
// ============================================================

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

// ============================================================
// モック Repository ファクトリ
// ============================================================

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

// ============================================================
// SettingsView テスト (spec.md §「Web クライアント SettingsView」)
// ============================================================

describe("SettingsView (BL-009 境界時刻の設定)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("シナリオ: SettingsView を開くと現在の dayBoundaryTime が表示される", async () => {
    // spec.md §「Web クライアント SettingsView」第 1 ケース.
    // Given サーバ正本で dayBoundaryTime = "04:00"
    // When  ユーザーが SettingsView を開く
    // Then  "04:00" が設定値として画面に表示される
    const repo = makeMockRepository({ dayBoundaryTime: "04:00" });
    render(<SettingsView repository={repo} />);

    // getSettings() が呼ばれる.
    expect(await screen.findByText(/04:00/)).toBeInTheDocument();
    expect(repo.getSettingsMock).toHaveBeenCalledTimes(1);
  });

  it("シナリオ: SettingsView のフォームで dayBoundaryTime を \"06:00\" に更新できる", async () => {
    // spec.md §「Web クライアント SettingsView」第 2 ケース.
    // Given SettingsView が開かれており dayBoundaryTime = "04:00" が表示されている
    // When  ユーザーがフォームに "06:00" を入力して保存操作をする
    // Then  保存が成功し, 表示が "06:00" に更新される
    const repo = makeMockRepository({ dayBoundaryTime: "04:00", version: 1 });
    const user = userEvent.setup();
    render(<SettingsView repository={repo} />);

    // 初期表示を待つ.
    await screen.findByText(/04:00/);

    // フォームに "06:00" を入力する.
    const input = screen.getByLabelText(/境界時刻/);
    await user.clear(input);
    await user.type(input, "06:00");

    // 保存ボタンをクリックする.
    const saveButton = screen.getByRole("button", { name: /保存|更新/ });
    await user.click(saveButton);

    // patchSettings が呼ばれ、引数に dayBoundaryTime と ifMatch が含まれる.
    expect(repo.patchSettingsMock).toHaveBeenCalledTimes(1);
    const arg = repo.patchSettingsMock.mock.calls[0]?.[0] as PatchSettingsCommand;
    expect(arg.dayBoundaryTime).toBe("06:00");
    expect(arg.ifMatch).toBe(1);

    // 保存成功後に表示が "06:00" に更新される.
    expect(await screen.findByText(/06:00/)).toBeInTheDocument();

    // PATCH 成功後に getSettings() を再フェッチしてサーバ正本値を反映する（初回 + 再フェッチ = 2 回）.
    expect(repo.getSettingsMock).toHaveBeenCalledTimes(2);
  });

  it("シナリオ: バリデーション違反の \"25:00\" を入力して保存するとエラーメッセージが表示される", async () => {
    // spec.md §「Web クライアント SettingsView」第 3 ケース.
    // Given SettingsView が開かれている
    // When  ユーザーがフォームに "25:00" を入力して保存操作をする
    // Then  保存が失敗し, エラーが表示される (設定値は変わらない)
    const repo = makeMockRepository({ dayBoundaryTime: "04:00", version: 1 });
    const user = userEvent.setup();
    render(<SettingsView repository={repo} />);

    // 初期表示を待つ.
    await screen.findByText(/04:00/);

    // バリデーション違反の値を入力する.
    const input = screen.getByLabelText(/境界時刻/);
    await user.clear(input);
    await user.type(input, "25:00");

    const saveButton = screen.getByRole("button", { name: /保存|更新/ });
    await user.click(saveButton);

    // エラーメッセージが表示される.
    const errorMessage = await screen.findByRole("alert");
    expect(errorMessage).toBeInTheDocument();

    // patchSettings は呼ばれない (バリデーション失敗のため).
    expect(repo.patchSettingsMock).not.toHaveBeenCalled();
  });

  it("シナリオ: 412 応答時はエラーメッセージが表示され、最新の設定値が画面に反映される", async () => {
    // spec.md §「楽観ロック (If-Match)」: 412 時はクライアントがエラーを表示して再試行を促す.
    // plan.md §「UI 設計」: 412 (version 不一致) は設定値を再取得して表示し, ユーザーに再試行を促す.
    const serverCurrentSettings: Settings = {
      id: "singleton",
      dayBoundaryTime: "05:00",
      version: 2,
      updatedAt: "2026-06-07T10:00:00.000Z",
    };

    const repo = makeMockRepository({ dayBoundaryTime: "04:00", version: 1 });
    const user = userEvent.setup();

    // patchSettings が PatchConflictError をスロー (版不一致). サーバ側の最新値を含む.
    repo.patchSettingsMock.mockRejectedValueOnce(
      new PatchConflictError(serverCurrentSettings),
    );

    render(<SettingsView repository={repo} />);

    // 初期表示を待つ.
    await screen.findByText(/04:00/);

    const input = screen.getByLabelText(/境界時刻/);
    await user.clear(input);
    await user.type(input, "06:00");

    const saveButton = screen.getByRole("button", { name: /保存|更新/ });
    await user.click(saveButton);

    // エラーメッセージが表示される.
    const errorMessage = await screen.findByRole("alert");
    expect(errorMessage).toBeInTheDocument();

    // 412 ボディから取得したサーバ最新値 "05:00" が設定値として表示される (D-004: 追加リクエスト不要).
    expect(await screen.findByText(/05:00/)).toBeInTheDocument();

    // 412 時は getSettings() の追加呼び出しはしない（初回のみ = 1 回）(D-004).
    expect(repo.getSettingsMock).toHaveBeenCalledTimes(1);
  });
});
