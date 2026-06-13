import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import type { ReactNode } from "react";
/**
 * SetupView コンポーネント 単体テスト (BL-019 / BL-020 / BL-074).
 *
 * 受け入れ基準の出典:
 *   - docs/developer/features/app-login/spec.md §「受け入れ基準」AC-6
 *   - docs/developer/features/app-login/plan.md §「処理フロー — Android 初回起動 (SetupView)」/ D-10
 *   - docs/developer/features/android-server-mode/spec.md §「AC-AND-003: SetupView（初回起動）」(URL 部分は維持)
 *
 * BL-074 / Step 5 での変更点:
 *   - 「認証トークン」入力欄を削除. URL 入力のみに簡素化.
 *   - 送信時に `fetch(url + "/healthz")` を実行して接続検証.
 *   - 200 応答で `onValidated(url)` (旧 onSave) コールバックを発火.
 *   - 4xx / 5xx / network エラーでビューに留まりエラーメッセージ表示.
 *   - BL-020 の `onSelectLocal` 経路は維持.
 *
 * 現状: setup-view.tsx は旧仕様 (token 欄あり / fetch 検証なし) のため red.
 *       Step 5 の改修で green 化する.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { SetupView } from "./setup-view.js";

const server = setupServer();

beforeAll(() => {
  server.listen({ onUnhandledRequest: "bypass" });
});
afterEach(() => {
  server.resetHandlers();
});
afterAll(() => {
  server.close();
});

function renderWithQueryClient(ui: ReactNode): ReturnType<typeof render> {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Number.POSITIVE_INFINITY, networkMode: "offlineFirst" },
      mutations: { retry: false, networkMode: "offlineFirst" },
    },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe("SetupView (BL-074 AC-6: URL + /healthz 検証のみ)", () => {
  it("AC-6 前段: 認証トークン入力欄が存在しない (token 欄削除)", () => {
    const onValidated = vi.fn();
    renderWithQueryClient(<SetupView onValidated={onValidated} />);

    // 「サーバ URL」入力欄は存在する.
    expect(screen.getByLabelText(/サーバ\s*URL/)).toBeInTheDocument();

    // 「認証トークン」入力欄は存在しない.
    expect(screen.queryByLabelText(/認証\s*トークン/)).toBeNull();
  });

  it("AC-6: URL を入力 → 送信で /healthz fetch が走り 200 応答時に onValidated(url) が呼ばれる", async () => {
    let receivedUrl: string | null = null;
    server.use(
      http.get("https://api.example.com/healthz", ({ request }) => {
        receivedUrl = request.url;
        return HttpResponse.json({ status: "ok" }, { status: 200 });
      }),
    );

    const onValidated = vi.fn();
    const user = userEvent.setup();
    renderWithQueryClient(<SetupView onValidated={onValidated} />);

    await user.type(screen.getByLabelText(/サーバ\s*URL/), "https://api.example.com");
    await user.click(screen.getByRole("button", { name: /接続する|確認|次へ|保存/ }));

    await waitFor(() => {
      expect(onValidated).toHaveBeenCalledTimes(1);
      expect(onValidated).toHaveBeenCalledWith("https://api.example.com");
    });
    expect(receivedUrl).toBe("https://api.example.com/healthz");
  });

  it("AC-6: /healthz が 401 を返したらエラー表示 + onValidated は呼ばれない", async () => {
    server.use(
      http.get("https://api.example.com/healthz", () => {
        return HttpResponse.json({ code: "UNAUTHORIZED" }, { status: 401 });
      }),
    );

    const onValidated = vi.fn();
    const user = userEvent.setup();
    renderWithQueryClient(<SetupView onValidated={onValidated} />);

    await user.type(screen.getByLabelText(/サーバ\s*URL/), "https://api.example.com");
    await user.click(screen.getByRole("button", { name: /接続する|確認|次へ|保存/ }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(onValidated).not.toHaveBeenCalled();
  });

  it("AC-6: /healthz がネットワークエラーで落ちたらエラー表示 + onValidated は呼ばれない", async () => {
    server.use(http.get("https://api.example.com/healthz", () => HttpResponse.error()));

    const onValidated = vi.fn();
    const user = userEvent.setup();
    renderWithQueryClient(<SetupView onValidated={onValidated} />);

    await user.type(screen.getByLabelText(/サーバ\s*URL/), "https://api.example.com");
    await user.click(screen.getByRole("button", { name: /接続する|確認|次へ|保存/ }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(onValidated).not.toHaveBeenCalled();
  });

  it("URL が空のままで送信するとエラー表示 + onValidated は呼ばれない (fetch も走らない)", async () => {
    const onValidated = vi.fn();
    const user = userEvent.setup();
    renderWithQueryClient(<SetupView onValidated={onValidated} />);

    await user.click(screen.getByRole("button", { name: /接続する|確認|次へ|保存/ }));

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(onValidated).not.toHaveBeenCalled();
  });

  it('URL が "http://" / "https://" で始まらない場合はエラー表示', async () => {
    const onValidated = vi.fn();
    const user = userEvent.setup();
    renderWithQueryClient(<SetupView onValidated={onValidated} />);

    await user.type(screen.getByLabelText(/サーバ\s*URL/), "example.com");
    await user.click(screen.getByRole("button", { name: /接続する|確認|次へ|保存/ }));

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(onValidated).not.toHaveBeenCalled();
  });

  it("initialServerUrl が Props として渡された場合は初期値として表示される", () => {
    const onValidated = vi.fn();
    renderWithQueryClient(
      <SetupView onValidated={onValidated} initialServerUrl="https://initial.example.com" />,
    );
    expect(screen.getByLabelText(/サーバ\s*URL/)).toHaveValue("https://initial.example.com");
  });
});

describe("SetupView (BL-020 AC-LOC-002: onSelectLocal は維持)", () => {
  it("onSelectLocal が渡されている場合「ローカルモードで使う」ボタンが表示される", () => {
    const onValidated = vi.fn();
    const onSelectLocal = vi.fn();
    renderWithQueryClient(<SetupView onValidated={onValidated} onSelectLocal={onSelectLocal} />);

    expect(screen.getByRole("button", { name: /ローカルモード/ })).toBeInTheDocument();
  });

  it("「ローカルモードで使う」ボタンクリックで onSelectLocal が呼ばれる", async () => {
    const onValidated = vi.fn();
    const onSelectLocal = vi.fn();
    const user = userEvent.setup();
    renderWithQueryClient(<SetupView onValidated={onValidated} onSelectLocal={onSelectLocal} />);

    await user.click(screen.getByRole("button", { name: /ローカルモード/ }));
    expect(onSelectLocal).toHaveBeenCalledTimes(1);
  });
});
