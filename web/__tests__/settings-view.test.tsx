import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
/**
 * Web クライアント単体テスト: 境界時刻の設定 SettingsView (BL-009 / FR-041 / FR-042).
 * サーバ接続設定セクション追加テスト (BL-019 / AC-AND-005) も含む.
 *
 * 受け入れ基準の出典:
 *   - docs/developer/features/settings-day-boundary/spec.md
 *     §「Web クライアント SettingsView」と 1:1 対応するシナリオを扱う.
 *   - docs/developer/features/android-server-mode/spec.md
 *     §「AC-AND-005: SettingsView のサーバ設定変更」と 1:1 対応するシナリオを扱う.
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
 * BL-019 で拡張される SettingsView の Props（サーバ接続設定追加後）:
 *   interface SettingsViewProps {
 *     repository: SettingsRepository;
 *     serverUrl?: string;
 *     authToken?: string;
 *     onSaveServer?: (serverUrl: string, authToken: string) => void;
 *   }
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
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
// SettingsView サーバ接続設定セクション (BL-019 / AC-AND-005)
// ============================================================

/**
 * AC-AND-005 のテストで使う SettingsView の拡張 Props.
 *
 * BL-019 で SettingsView は以下の Props を追加で受け取るようになる:
 *   - serverUrl?:     string   — 現在設定されているサーバ URL
 *   - authToken?:     string   — 現在設定されている認証トークン
 *   - onSaveServer?:  (serverUrl: string, authToken: string) => void
 *                              — 「変更を保存」クリック時のコールバック
 *
 * 既存の `repository` Props はそのまま存在する（既存テストへの影響なし）.
 *
 * 注意: 本テストブロックは TDD の "red" を作るためのテスト.
 *       BL-019 の実装が完了するまで失敗する想定.
 */

describe("SettingsView サーバ接続設定セクション (BL-019 AC-AND-005)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ----------------------------------------------------------
  // シナリオ: serverUrl と authToken の Props が渡された場合、対応するフィールドに値が表示される
  // spec.md §AC-AND-005:
  //   Given SettingsView の「サーバ接続設定」セクションが表示されている
  //   When  serverUrl="https://example.com" と authToken="secret-token" が Props として渡される
  //   Then  サーバ URL フィールドに "https://example.com" が表示される
  //   And   認証トークンフィールドに "secret-token" が表示される
  // ----------------------------------------------------------
  it("AC-AND-005: serverUrl と authToken の Props が渡された場合、対応するフィールドに値が表示される", async () => {
    const repo = makeMockRepository({ dayBoundaryTime: "04:00" });
    const onSaveServer = vi.fn();

    renderWithQueryClient(
      <SettingsView
        repository={repo}
        serverUrl="https://example.com"
        authToken="secret-token"
        onSaveServer={onSaveServer}
      />,
    );

    // サーバ URL フィールドに渡した値が表示される
    const serverUrlInput = await screen.findByLabelText(/サーバ\s*URL/);
    expect(serverUrlInput).toHaveValue("https://example.com");

    // 認証トークンフィールドに渡した値が表示される
    const authTokenInput = screen.getByLabelText(/認証\s*トークン/);
    expect(authTokenInput).toHaveValue("secret-token");
  });

  // ----------------------------------------------------------
  // シナリオ: 「変更を保存」ボタンクリックで onSaveServer(serverUrl, authToken) が呼ばれる
  // spec.md §AC-AND-005:
  //   Given SettingsView の「サーバ接続設定」セクションが表示されている
  //   When  サーバ URL と認証トークンを編集して保存する
  //   Then  新しい値が Preferences に保存される
  //   And   次回の API リクエストから新しいサーバ URL と認証トークンが使用される
  //   （Vitest でテスト可能な範囲: onSaveServer コールバックが正しい引数で呼ばれること）
  // ----------------------------------------------------------
  it("AC-AND-005: サーバ URL と認証トークンを編集して「変更を保存」をクリックすると onSaveServer(serverUrl, authToken) が呼ばれる", async () => {
    const repo = makeMockRepository({ dayBoundaryTime: "04:00" });
    const onSaveServer = vi.fn();
    const user = userEvent.setup();

    renderWithQueryClient(
      <SettingsView
        repository={repo}
        serverUrl="https://old.example.com"
        authToken="old-token"
        onSaveServer={onSaveServer}
      />,
    );

    // 初期表示を待つ（既存の dayBoundaryTime セクションが表示されるまで）
    await screen.findByText(/04:00/);

    // サーバ URL を新しい値に変更する
    const serverUrlInput = screen.getByLabelText(/サーバ\s*URL/);
    await user.clear(serverUrlInput);
    await user.type(serverUrlInput, "https://new.example.com");

    // 認証トークンを新しい値に変更する
    const authTokenInput = screen.getByLabelText(/認証\s*トークン/);
    await user.clear(authTokenInput);
    await user.type(authTokenInput, "new-token");

    // 「変更を保存」ボタンをクリックする
    const saveServerButton = screen.getByRole("button", { name: /変更を保存/ });
    await user.click(saveServerButton);

    // onSaveServer が新しい値で呼ばれる
    expect(onSaveServer).toHaveBeenCalledTimes(1);
    expect(onSaveServer).toHaveBeenCalledWith("https://new.example.com", "new-token");
  });

  // ----------------------------------------------------------
  // シナリオ: serverUrl/authToken/onSaveServer が渡されない場合、既存の BL-009 動作に影響しない
  // spec.md §NFR-AND-001: web/ の既存テスト（Vitest）はすべて green を維持する.
  // ----------------------------------------------------------
  it("AC-AND-005: serverUrl/authToken/onSaveServer Props が省略された場合でも dayBoundaryTime の表示は正常に動作する", async () => {
    const repo = makeMockRepository({ dayBoundaryTime: "04:00" });

    // 既存 Props のみ渡す（サーバ接続設定 Props なし）
    renderWithQueryClient(<SettingsView repository={repo} />);

    // BL-009 の基本動作: dayBoundaryTime が表示される
    expect(await screen.findByText(/04:00/)).toBeInTheDocument();
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
