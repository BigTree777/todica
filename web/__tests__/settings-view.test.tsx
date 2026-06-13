import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
/**
 * Web クライアント単体テスト: 境界時刻の設定 SettingsView (BL-009 / FR-041 / FR-042).
 *
 * 受け入れ基準の出典:
 *   - docs/developer/features/settings-day-boundary/spec.md
 *     §「Web クライアント SettingsView」と 1:1 対応するシナリオを扱う.
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
 *
 * BL-075: BL-019 由来の dead path UI と関連テストを削除済み。regression guard は
 *         settings-view-dead-path-removed.test.tsx に分離。
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
// password-change feature: InvalidPasswordError をパスワード変更フォームの 401 エラー表現に用いる.
import { InvalidPasswordError } from "../src/auth/password-client.js";
import { PatchConflictError } from "../src/repositories/settings-repository.js";
import { SettingsView } from "../src/ui/settings-view/settings-view.js";

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
    renderWithQueryClient(<SettingsView repository={repo} />);

    // getSettings() が呼ばれる.
    expect(await screen.findByText(/04:00/)).toBeInTheDocument();
    expect(repo.getSettingsMock).toHaveBeenCalledTimes(1);
  });

  it('シナリオ: SettingsView のフォームで dayBoundaryTime を "06:00" に更新できる', async () => {
    // spec.md §「Web クライアント SettingsView」第 2 ケース.
    // Given SettingsView が開かれており dayBoundaryTime = "04:00" が表示されている
    // When  ユーザーがフォームに "06:00" を入力して保存操作をする
    // Then  保存が成功し, 表示が "06:00" に更新される
    const repo = makeMockRepository({ dayBoundaryTime: "04:00", version: 1 });
    const user = userEvent.setup();
    renderWithQueryClient(<SettingsView repository={repo} />);

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

  it('シナリオ: バリデーション違反の "25:00" を入力して保存するとエラーメッセージが表示される', async () => {
    // spec.md §「Web クライアント SettingsView」第 3 ケース.
    // Given SettingsView が開かれている
    // When  ユーザーがフォームに "25:00" を入力して保存操作をする
    // Then  保存が失敗し, エラーが表示される (設定値は変わらない)
    const repo = makeMockRepository({ dayBoundaryTime: "04:00", version: 1 });
    const user = userEvent.setup();
    renderWithQueryClient(<SettingsView repository={repo} />);

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

  it("シナリオ: 412 応答時はエラーメッセージが表示され、最新の設定値が画面に反映される (BL-009)", async () => {
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
    repo.patchSettingsMock.mockRejectedValueOnce(new PatchConflictError(serverCurrentSettings));

    renderWithQueryClient(<SettingsView repository={repo} />);

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

// ============================================================
// SettingsView モード切替セクション (BL-020 / AC-LOC-003 / AC-LOC-005)
// ============================================================

/**
 * AC-LOC-005 のテストで使う SettingsView の拡張 Props.
 *
 * BL-020 で SettingsView は以下の Props を追加で受け取るようになる:
 *   - currentMode?: 'local' | 'server'
 *       現在のモード. 渡されている場合は「モード切替」セクションを表示する.
 *   - onSwitchMode?: () => Promise<void>
 *       「切り替える」ボタンクリック後に呼ばれるコールバック.
 *
 * spec.md §FR-LOC-003: SettingsView に「モード切替」セクションを追加する.
 * plan.md §D-005: Capacitor.isNativePlatform() かつ currentMode が渡されている場合のみ表示する.
 *
 * 注意: 本テストブロックは TDD の "red" を作るためのテスト.
 *       BL-020 の実装が完了するまで失敗する想定.
 */

describe("SettingsView モード切替セクション (BL-020 AC-LOC-005)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ----------------------------------------------------------
  // シナリオ: currentMode = 'local' が渡されている場合、「ローカルモード」と表示される
  // spec.md §FR-LOC-003:
  //   現在のモード（ローカル / サーバ）を表示する
  // plan.md §D-005:
  //   mode = 'local' の場合は「ローカルモード」を表示する
  // ----------------------------------------------------------
  it("AC-LOC-005: currentMode='local' が渡されている場合、「ローカルモード」と表示される", async () => {
    const repo = makeMockRepository({ dayBoundaryTime: "04:00" });
    const onSwitchMode = vi.fn();

    renderWithQueryClient(
      <SettingsView repository={repo} currentMode="local" onSwitchMode={onSwitchMode} />,
    );

    // 「ローカルモード」というテキストが表示される
    expect(await screen.findByText(/ローカルモード/)).toBeInTheDocument();
  });

  // ----------------------------------------------------------
  // シナリオ: currentMode = 'server' が渡されている場合、「サーバモードへ切り替える」ボタンが表示される
  // spec.md §FR-LOC-003:
  //   切替ボタンを提供する
  // plan.md §D-005:
  //   mode = 'local' の場合は「サーバモードへ切り替える」ボタンを表示する
  // (currentMode='local' のときサーバへの切替ボタン、'server' のときローカルへの切替ボタン)
  // ----------------------------------------------------------
  it("AC-LOC-005: currentMode='server' が渡されている場合、「サーバモードへ切り替える」ボタンが表示される", async () => {
    const repo = makeMockRepository({ dayBoundaryTime: "04:00" });
    const onSwitchMode = vi.fn();

    renderWithQueryClient(
      <SettingsView repository={repo} currentMode="server" onSwitchMode={onSwitchMode} />,
    );

    // 「サーバモードへ切り替える」ボタンは currentMode='local' のとき
    // 「ローカルモードへ切り替える」ボタンは currentMode='server' のとき表示される
    // spec では切替先ボタンを表示するため、currentMode='server' → ローカル切替ボタン
    const switchButton = await screen.findByRole("button", {
      name: /ローカルモード|切り替える/,
    });
    expect(switchButton).toBeInTheDocument();
  });

  // ----------------------------------------------------------
  // シナリオ: 「サーバモードへ切り替える」ボタンをクリックすると onSwitchMode が呼ばれる
  // spec.md §AC-LOC-005:
  //   When  「サーバモードへ切り替える」ボタンをタップする
  //   Then  「現在のモードのデータが初期化されます。よろしいですか？」という確認ダイアログが表示される
  // （Vitest でテスト可能な範囲: onSwitchMode コールバックが呼ばれること）
  // plan.md §D-005: 確認後に onSwitchMode() を呼び出す
  // ----------------------------------------------------------
  it("AC-LOC-005: 「サーバモードへ切り替える」ボタンをクリックすると onSwitchMode が呼ばれる", async () => {
    const repo = makeMockRepository({ dayBoundaryTime: "04:00" });
    const onSwitchMode = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();

    // window.confirm を自動承認にモック
    vi.spyOn(window, "confirm").mockReturnValue(true);

    renderWithQueryClient(
      <SettingsView repository={repo} currentMode="local" onSwitchMode={onSwitchMode} />,
    );

    // 切替ボタンをクリック
    const switchButton = await screen.findByRole("button", {
      name: /サーバモード|切り替える/,
    });
    await user.click(switchButton);

    // onSwitchMode が呼ばれること
    expect(onSwitchMode).toHaveBeenCalledTimes(1);

    vi.restoreAllMocks();
  });
});

// ============================================================
// SettingsView ログアウトボタン (BL-074 / AC-5)
//
// 受け入れ基準の出典:
//   - docs/developer/features/app-login/spec.md §「受け入れ基準」AC-5
//   - docs/developer/features/app-login/plan.md §「UI」/ D-11
//
// 観点:
//   1. 「ログアウト」ボタンが描画されており role / accessible name が正しい.
//   2. 押下で onLogout コールバックが呼ばれる.
//   3. onLogout が省略された場合はボタンが表示されない (BL-019 / 020 既存テストへの非影響を担保).
// ============================================================

describe("SettingsView ログアウト (BL-074 AC-5)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("onLogout Props が渡されている場合「ログアウト」ボタンが描画される", async () => {
    const repo = makeMockRepository({ dayBoundaryTime: "04:00" });
    const onLogout = vi.fn();

    renderWithQueryClient(<SettingsView repository={repo} onLogout={onLogout} />);

    await screen.findByText(/04:00/);

    const logoutButton = screen.getByRole("button", { name: /ログアウト/ });
    expect(logoutButton).toBeInTheDocument();
  });

  it("「ログアウト」ボタン押下で onLogout が呼ばれる (sessions DELETE → token 破棄 → LoginView 遷移は呼出元の責務)", async () => {
    const repo = makeMockRepository({ dayBoundaryTime: "04:00" });
    const onLogout = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();

    renderWithQueryClient(<SettingsView repository={repo} onLogout={onLogout} />);

    await screen.findByText(/04:00/);

    const logoutButton = screen.getByRole("button", { name: /ログアウト/ });
    await user.click(logoutButton);

    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  it("onLogout が省略された場合は「ログアウト」ボタンは表示されない (既存 BL への非影響)", async () => {
    const repo = makeMockRepository({ dayBoundaryTime: "04:00" });

    renderWithQueryClient(<SettingsView repository={repo} />);

    await screen.findByText(/04:00/);

    expect(screen.queryByRole("button", { name: /ログアウト/ })).toBeNull();
  });
});

// ============================================================
// SettingsView パスワード変更セクション (password-change AC-1 / AC-2 / AC-4 / AC-5 / AC-7)
//
// 受け入れ基準の出典:
//   - docs/developer/features/password-change/spec.md §「受け入れ基準」
//     AC-1 (セクション表示) / AC-2 (200 で成功) / AC-4 (新 PW != 確認入力) /
//     AC-5 (必須項目空) / AC-7 (成功時 LoginView 遷移は onPasswordChanged 委譲)
//   - docs/developer/features/password-change/plan.md §「Web クライアント設計」/ NFR-PWD-3
//
// 観点:
//   1. AC-1: onChangePassword Props が渡されている場合,
//      `<section aria-label="パスワード変更">` と 3 入力 + 「変更する」ボタンが描画される.
//      各 input は type="password" + 適切な autocomplete 属性を持つ.
//   2. AC-5: 必須項目 (3 入力のいずれか) が空のとき changePassword は呼ばれない.
//   3. AC-4: 新 PW != 確認入力のとき changePassword は呼ばれず, role="alert" にエラーが表示される.
//   4. AC-2: 3 入力が有効値で送信されると changePassword(currentPassword, newPassword) が呼ばれる
//            (確認入力はサーバには送らない / plan D-5).
//   5. AC-7: changePassword が resolve すると onPasswordChanged が呼ばれる.
//   6. AC-3 (UI 側): changePassword が InvalidPasswordError で reject すると
//            role="alert" にエラーメッセージが表示され onPasswordChanged は呼ばれない.
//   7. onChangePassword Props が渡されていないとき (= local モード相当) は
//      パスワード変更セクションが表示されない (NFR-PWD-2 範囲外).
// ============================================================

describe("SettingsView パスワード変更セクション (password-change AC-1 / AC-2 / AC-4 / AC-5 / AC-7)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ----------------------------------------------------------
  // AC-1: 「パスワード変更」セクションが描画される
  // ----------------------------------------------------------
  it("AC-1: onChangePassword Props がある場合、aria-label='パスワード変更' のセクションが表示される", async () => {
    const repo = makeMockRepository({ dayBoundaryTime: "04:00" });
    const changePassword = vi.fn().mockResolvedValue(undefined);
    const onPasswordChanged = vi.fn();

    renderWithQueryClient(
      <SettingsView
        repository={repo}
        onChangePassword={changePassword}
        onPasswordChanged={onPasswordChanged}
      />,
    );

    // 「パスワード変更」セクション (aria-label) が描画される.
    // 初期表示の dayBoundaryTime を待ってから検査する.
    await screen.findByText(/04:00/);
    const section = await screen.findByRole("region", { name: /パスワード変更/ });
    expect(section).toBeInTheDocument();
  });

  it("AC-1: 3 input (現在 PW / 新 PW / 確認 PW) と「変更する」ボタンが描画される", async () => {
    const repo = makeMockRepository({ dayBoundaryTime: "04:00" });
    const changePassword = vi.fn().mockResolvedValue(undefined);
    const onPasswordChanged = vi.fn();

    renderWithQueryClient(
      <SettingsView
        repository={repo}
        onChangePassword={changePassword}
        onPasswordChanged={onPasswordChanged}
      />,
    );

    await screen.findByText(/04:00/);

    // 3 つの password input.
    const current = await screen.findByLabelText(/現在のパスワード/);
    const next = await screen.findByLabelText(/^新しいパスワード$/);
    const confirm = await screen.findByLabelText(/新しいパスワード\s*\(?確認\)?/);

    expect(current).toHaveAttribute("type", "password");
    expect(next).toHaveAttribute("type", "password");
    expect(confirm).toHaveAttribute("type", "password");

    // NFR-PWD-3 (a11y): autocomplete 属性.
    expect(current).toHaveAttribute("autocomplete", "current-password");
    expect(next).toHaveAttribute("autocomplete", "new-password");
    expect(confirm).toHaveAttribute("autocomplete", "new-password");

    // 「変更する」ボタン.
    const submit = screen.getByRole("button", { name: /変更|保存/ });
    expect(submit).toBeInTheDocument();
  });

  // ----------------------------------------------------------
  // AC-5: 必須項目が空のときは送信されない
  // ----------------------------------------------------------
  it("AC-5: 3 入力のいずれかが空のまま送信しても changePassword は呼ばれない", async () => {
    const repo = makeMockRepository({ dayBoundaryTime: "04:00" });
    const changePassword = vi.fn().mockResolvedValue(undefined);
    const onPasswordChanged = vi.fn();
    const user = userEvent.setup();

    renderWithQueryClient(
      <SettingsView
        repository={repo}
        onChangePassword={changePassword}
        onPasswordChanged={onPasswordChanged}
      />,
    );

    await screen.findByText(/04:00/);

    const current = await screen.findByLabelText(/現在のパスワード/);
    // 現在 PW だけ入力し, 新 PW / 確認 PW は空のまま submit.
    await user.type(current, "P0");

    // パスワード変更セクション内の「変更する」ボタンを取得.
    const section = await screen.findByRole("region", { name: /パスワード変更/ });
    const submit = within(section).getByRole("button", { name: /変更|保存/ });
    await user.click(submit);

    expect(changePassword).not.toHaveBeenCalled();
    expect(onPasswordChanged).not.toHaveBeenCalled();
  });

  // ----------------------------------------------------------
  // AC-4: 新 PW != 確認入力で送信されない + role="alert" にエラー表示
  // ----------------------------------------------------------
  it("AC-4: 新 PW != 確認入力のとき changePassword は呼ばれず, role='alert' にエラーが表示される", async () => {
    const repo = makeMockRepository({ dayBoundaryTime: "04:00" });
    const changePassword = vi.fn().mockResolvedValue(undefined);
    const onPasswordChanged = vi.fn();
    const user = userEvent.setup();

    renderWithQueryClient(
      <SettingsView
        repository={repo}
        onChangePassword={changePassword}
        onPasswordChanged={onPasswordChanged}
      />,
    );

    await screen.findByText(/04:00/);

    const current = await screen.findByLabelText(/現在のパスワード/);
    const next = await screen.findByLabelText(/^新しいパスワード$/);
    const confirm = await screen.findByLabelText(/新しいパスワード\s*\(?確認\)?/);

    await user.type(current, "P0");
    await user.type(next, "A");
    await user.type(confirm, "B");

    const section = await screen.findByRole("region", { name: /パスワード変更/ });
    const submit = within(section).getByRole("button", { name: /変更|保存/ });
    await user.click(submit);

    // changePassword は呼ばれない.
    expect(changePassword).not.toHaveBeenCalled();
    expect(onPasswordChanged).not.toHaveBeenCalled();

    // パスワード変更セクション内の role=alert にエラーメッセージ.
    const alert = await within(section).findByRole("alert");
    expect(alert).toBeInTheDocument();
  });

  // ----------------------------------------------------------
  // AC-2: 正しい入力で changePassword が呼ばれる
  // ----------------------------------------------------------
  it("AC-2: 3 入力が有効値で送信されると changePassword(currentPassword, newPassword) が呼ばれる", async () => {
    const repo = makeMockRepository({ dayBoundaryTime: "04:00" });
    const changePassword = vi.fn().mockResolvedValue(undefined);
    const onPasswordChanged = vi.fn();
    const user = userEvent.setup();

    renderWithQueryClient(
      <SettingsView
        repository={repo}
        onChangePassword={changePassword}
        onPasswordChanged={onPasswordChanged}
      />,
    );

    await screen.findByText(/04:00/);

    const current = await screen.findByLabelText(/現在のパスワード/);
    const next = await screen.findByLabelText(/^新しいパスワード$/);
    const confirm = await screen.findByLabelText(/新しいパスワード\s*\(?確認\)?/);

    await user.type(current, "P0");
    await user.type(next, "P1");
    await user.type(confirm, "P1");

    const section = await screen.findByRole("region", { name: /パスワード変更/ });
    const submit = within(section).getByRole("button", { name: /変更|保存/ });
    await user.click(submit);

    // plan D-5: 確認入力はサーバに送らない.
    expect(changePassword).toHaveBeenCalledTimes(1);
    expect(changePassword).toHaveBeenCalledWith("P0", "P1");
  });

  // ----------------------------------------------------------
  // AC-7: 成功時 onPasswordChanged が呼ばれる
  // ----------------------------------------------------------
  it("AC-7: changePassword が resolve すると onPasswordChanged が呼ばれる", async () => {
    const repo = makeMockRepository({ dayBoundaryTime: "04:00" });
    const changePassword = vi.fn().mockResolvedValue(undefined);
    const onPasswordChanged = vi.fn();
    const user = userEvent.setup();

    renderWithQueryClient(
      <SettingsView
        repository={repo}
        onChangePassword={changePassword}
        onPasswordChanged={onPasswordChanged}
      />,
    );

    await screen.findByText(/04:00/);

    const current = await screen.findByLabelText(/現在のパスワード/);
    const next = await screen.findByLabelText(/^新しいパスワード$/);
    const confirm = await screen.findByLabelText(/新しいパスワード\s*\(?確認\)?/);

    await user.type(current, "P0");
    await user.type(next, "P1");
    await user.type(confirm, "P1");

    const section = await screen.findByRole("region", { name: /パスワード変更/ });
    const submit = within(section).getByRole("button", { name: /変更|保存/ });
    await user.click(submit);

    await waitFor(() => {
      expect(onPasswordChanged).toHaveBeenCalledTimes(1);
    });
  });

  // ----------------------------------------------------------
  // AC-3 (UI 側): InvalidPasswordError 時のエラー表示
  // ----------------------------------------------------------
  it("AC-3 (UI 側): InvalidPasswordError で reject すると role='alert' にエラーが表示され onPasswordChanged は呼ばれない", async () => {
    const repo = makeMockRepository({ dayBoundaryTime: "04:00" });
    const changePassword = vi.fn().mockRejectedValue(new InvalidPasswordError());
    const onPasswordChanged = vi.fn();
    const user = userEvent.setup();

    renderWithQueryClient(
      <SettingsView
        repository={repo}
        onChangePassword={changePassword}
        onPasswordChanged={onPasswordChanged}
      />,
    );

    await screen.findByText(/04:00/);

    const current = await screen.findByLabelText(/現在のパスワード/);
    const next = await screen.findByLabelText(/^新しいパスワード$/);
    const confirm = await screen.findByLabelText(/新しいパスワード\s*\(?確認\)?/);

    await user.type(current, "WRONG");
    await user.type(next, "P1");
    await user.type(confirm, "P1");

    const section = await screen.findByRole("region", { name: /パスワード変更/ });
    const submit = within(section).getByRole("button", { name: /変更|保存/ });
    await user.click(submit);

    const alert = await within(section).findByRole("alert");
    expect(alert).toBeInTheDocument();
    expect(onPasswordChanged).not.toHaveBeenCalled();
  });

  // ----------------------------------------------------------
  // 非 AC: onChangePassword Props が無いときセクションは出ない
  // (local モード / NFR-PWD-2 範囲外 / spec §「スコープ境界」)
  // ----------------------------------------------------------
  it("onChangePassword Props が省略された場合はパスワード変更セクションが表示されない", async () => {
    const repo = makeMockRepository({ dayBoundaryTime: "04:00" });

    renderWithQueryClient(<SettingsView repository={repo} />);

    await screen.findByText(/04:00/);

    expect(screen.queryByRole("region", { name: /パスワード変更/ })).toBeNull();
    expect(screen.queryByLabelText(/現在のパスワード/)).toBeNull();
  });
});
