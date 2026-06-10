import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
/**
 * SetupView コンポーネント 単体テスト (BL-019 / AC-AND-003).
 *
 * 受け入れ基準の出典: docs/developer/features/android-server-mode/spec.md
 * §「AC-AND-003: SetupView（初回起動）」と 1:1 対応するシナリオを扱う.
 *
 * 注意: 本ファイルは TDD の "red" を作るためのテスト.
 *       SetupView コンポーネントはまだ存在しないため,
 *       このファイル内のテストはすべてコンパイルエラー / 失敗する想定.
 *       implementer が SetupView を実装することで green 化する.
 *
 * SetupView の Props インターフェース（テスト対象）:
 *   interface SetupViewProps {
 *     onSave: (serverUrl: string, authToken: string) => void;
 *     initialServerUrl?: string;
 *     initialAuthToken?: string;
 *   }
 *
 * 注意: plan.md D-003 では Props 名が `onSetupComplete` と定義されているが,
 * テスト依頼書の指示に従い `onSave` を使用する.
 * 実装者は `onSave` で実装すること（矛盾があれば project-designer にフィードバック）.
 */
import { describe, expect, it, vi } from "vitest";
import { SetupView } from "./setup-view.js";

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
// AC-AND-003: SetupView（初回起動）
// ============================================================

describe("SetupView (BL-019 AC-AND-003: SetupView 初回起動)", () => {
  // ----------------------------------------------------------
  // シナリオ: 「サーバ URL」入力欄と「認証トークン」入力欄が表示される
  // spec.md §AC-AND-003:
  //   Given Android アプリを初回起動する（Preferences にサーバ URL が未設定）
  //   When  アプリが起動する
  //   Then  SetupView が表示される
  //   And   「サーバ URL」入力欄と「認証トークン」入力欄が存在する
  //   And   「接続する」ボタンが存在する
  // ----------------------------------------------------------
  it("AC-AND-003: 「サーバ URL」入力欄と「認証トークン」入力欄と「接続する」ボタンが表示される", () => {
    const onSave = vi.fn();
    renderWithQueryClient(<SetupView onSave={onSave} />);

    // サーバ URL 入力欄が存在する
    expect(screen.getByLabelText(/サーバ\s*URL/)).toBeInTheDocument();

    // 認証トークン入力欄が存在する
    expect(screen.getByLabelText(/認証\s*トークン/)).toBeInTheDocument();

    // 「接続する」または「保存」ボタンが存在する
    expect(screen.getByRole("button", { name: /接続する|保存/ })).toBeInTheDocument();
  });

  // ----------------------------------------------------------
  // シナリオ: 認証トークンはパスワードフィールドとして表示される
  // spec.md §「未決事項 / 確認待ち」:
  //   現時点ではパスワードフィールドを採用する（変更容易）
  // ----------------------------------------------------------
  it('AC-AND-003: 認証トークン入力欄は type="password" のフィールドである', () => {
    const onSave = vi.fn();
    renderWithQueryClient(<SetupView onSave={onSave} />);

    const tokenInput = screen.getByLabelText(/認証\s*トークン/);
    expect(tokenInput).toHaveAttribute("type", "password");
  });

  // ----------------------------------------------------------
  // シナリオ: SetupView でサーバ URL を入力して保存すると onSave が呼ばれる
  // spec.md §AC-AND-003:
  //   Given SetupView が表示されている
  //   When  サーバ URL に有効な URL を入力する
  //   And   認証トークンを入力する
  //   And   「接続する」ボタンをタップする
  //   Then  入力値が Preferences に保存される
  //   And   TodayView（/today）に遷移する
  //   （Vitest でテスト可能な範囲: onSave コールバックが正しい引数で呼ばれること）
  // ----------------------------------------------------------
  it("AC-AND-003: サーバ URL と認証トークンを入力して「接続する」をクリックすると onSave(serverUrl, authToken) が呼ばれる", async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    renderWithQueryClient(<SetupView onSave={onSave} />);

    const serverUrlInput = screen.getByLabelText(/サーバ\s*URL/);
    const authTokenInput = screen.getByLabelText(/認証\s*トークン/);
    const saveButton = screen.getByRole("button", { name: /接続する|保存/ });

    await user.type(serverUrlInput, "https://example.com");
    await user.type(authTokenInput, "my-secret-token");
    await user.click(saveButton);

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith("https://example.com", "my-secret-token");
  });

  // ----------------------------------------------------------
  // シナリオ: initialServerUrl / initialAuthToken が渡された場合は初期値として表示される
  // spec.md §AC-AND-005 / plan.md §D-003 の「SettingsView からの再設定」ユースケースに対応.
  // ----------------------------------------------------------
  it("AC-AND-003: initialServerUrl と initialAuthToken が Props として渡された場合は入力欄の初期値として表示される", () => {
    const onSave = vi.fn();
    renderWithQueryClient(
      <SetupView
        onSave={onSave}
        initialServerUrl="https://initial.example.com"
        initialAuthToken="initial-token"
      />,
    );

    expect(screen.getByLabelText(/サーバ\s*URL/)).toHaveValue("https://initial.example.com");
    expect(screen.getByLabelText(/認証\s*トークン/)).toHaveValue("initial-token");
  });

  // ----------------------------------------------------------
  // シナリオ: サーバ URL が空の場合はエラーメッセージが表示される
  // spec.md §AC-AND-003（バリデーション）:
  //   Given SetupView が表示されている
  //   When  サーバ URL を空のまま「接続する」ボタンをタップする
  //   Then  エラーメッセージが表示される
  //   And   onSave は呼ばれない
  // ----------------------------------------------------------
  it("AC-AND-003: サーバ URL が空の場合に「接続する」をクリックするとエラーメッセージが表示される", async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    renderWithQueryClient(<SetupView onSave={onSave} />);

    // サーバ URL は空、認証トークンだけ入力する
    await user.type(screen.getByLabelText(/認証\s*トークン/), "my-token");
    await user.click(screen.getByRole("button", { name: /接続する|保存/ }));

    // エラーメッセージが表示される
    expect(screen.getByRole("alert")).toBeInTheDocument();

    // onSave は呼ばれない
    expect(onSave).not.toHaveBeenCalled();
  });

  // ----------------------------------------------------------
  // シナリオ: 認証トークンが空の場合はエラーメッセージが表示される
  // spec.md §AC-AND-003（バリデーション）:
  //   Given SetupView が表示されている
  //   When  認証トークンを空のまま「接続する」ボタンをタップする
  //   Then  エラーメッセージが表示される
  //   And   onSave は呼ばれない
  // ----------------------------------------------------------
  it("AC-AND-003: 認証トークンが空の場合に「接続する」をクリックするとエラーメッセージが表示される", async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    renderWithQueryClient(<SetupView onSave={onSave} />);

    // 認証トークンは空、サーバ URL だけ入力する
    await user.type(screen.getByLabelText(/サーバ\s*URL/), "https://example.com");
    await user.click(screen.getByRole("button", { name: /接続する|保存/ }));

    // エラーメッセージが表示される
    expect(screen.getByRole("alert")).toBeInTheDocument();

    // onSave は呼ばれない
    expect(onSave).not.toHaveBeenCalled();
  });

  // ----------------------------------------------------------
  // シナリオ: URL が http:// または https:// で始まらない場合はエラーメッセージが表示される
  // spec.md §FR-AND-004 / plan.md §D-003（入力フィールドは type="url"）:
  //   Given SetupView が表示されている
  //   When  サーバ URL に "example.com"（スキームなし）を入力して「接続する」をタップする
  //   Then  エラーメッセージが表示される
  //   And   onSave は呼ばれない
  // ----------------------------------------------------------
  it('AC-AND-003: サーバ URL が "http://" または "https://" で始まらない場合にエラーメッセージが表示される', async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    renderWithQueryClient(<SetupView onSave={onSave} />);

    await user.type(screen.getByLabelText(/サーバ\s*URL/), "example.com");
    await user.type(screen.getByLabelText(/認証\s*トークン/), "my-token");
    await user.click(screen.getByRole("button", { name: /接続する|保存/ }));

    // エラーメッセージが表示される
    expect(screen.getByRole("alert")).toBeInTheDocument();

    // onSave は呼ばれない
    expect(onSave).not.toHaveBeenCalled();
  });
});

// ============================================================
// BL-020 / AC-LOC-002: SetupView でのローカルモード選択（onSelectLocal プロップ）
// ============================================================

/**
 * AC-LOC-002 のテストで使う SetupView の拡張 Props.
 *
 * BL-020 で SetupView は以下の Props を追加で受け取るようになる:
 *   - onSelectLocal?: () => void
 *       ローカルモード選択時のコールバック.
 *       渡されている場合は「ローカルモードで使う」ボタンを表示する.
 *       渡されていない場合はボタンを表示しない.
 *
 * 注意: 本テストブロックは TDD の "red" を作るためのテスト.
 *       BL-020 の実装が完了するまで失敗する想定.
 */

describe("SetupView (BL-020 AC-LOC-002: ローカルモード選択 onSelectLocal プロップ)", () => {
  // ----------------------------------------------------------
  // シナリオ: onSelectLocal が渡されている場合、「ローカルモードで使う」ボタンが表示される
  // spec.md §AC-LOC-002:
  //   Given SetupView が表示されている
  //   When  「ローカルモードで使う」を選択できる状態
  //   Then  「ローカルモードで使う」ボタンが表示される
  // plan.md §D-004: onSelectLocal が渡されている場合は「ローカルモードで使う」ボタンを表示する
  // ----------------------------------------------------------
  it("AC-LOC-002: onSelectLocal が渡されている場合、「ローカルモードで使う」ボタンが表示される", () => {
    const onSave = vi.fn();
    const onSelectLocal = vi.fn();
    renderWithQueryClient(<SetupView onSave={onSave} onSelectLocal={onSelectLocal} />);

    // 「ローカルモードで使う」ボタンが存在する
    expect(screen.getByRole("button", { name: /ローカルモード/ })).toBeInTheDocument();
  });

  // ----------------------------------------------------------
  // シナリオ: 「ローカルモードで使う」ボタンをクリックすると onSelectLocal が呼ばれる
  // spec.md §AC-LOC-002:
  //   Given SetupView が表示されている
  //   When  「ローカルモードで使う」を選択する
  //   Then  Preferences に mode = 'local' が保存される
  //   And   TodayView（/today）に遷移する
  //   （Vitest でテスト可能な範囲: onSelectLocal コールバックが呼ばれること）
  // ----------------------------------------------------------
  it("AC-LOC-002: 「ローカルモードで使う」ボタンをクリックすると onSelectLocal が呼ばれる", async () => {
    const onSave = vi.fn();
    const onSelectLocal = vi.fn();
    const user = userEvent.setup();
    renderWithQueryClient(<SetupView onSave={onSave} onSelectLocal={onSelectLocal} />);

    const localButton = screen.getByRole("button", { name: /ローカルモード/ });
    await user.click(localButton);

    expect(onSelectLocal).toHaveBeenCalledTimes(1);
  });
});
