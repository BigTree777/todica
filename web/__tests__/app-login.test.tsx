/**
 * 単体テスト: アプリ起動分岐.
 *
 * 受け入れ基準の出典:
 *   - docs/developer/features/app-login/spec.md §「受け入れ基準」AC-1 / AC-4
 *   - docs/developer/features/app-login/plan.md §「Web 起動」/ §「401 interceptor」/ D-13
 *
 * 観点:
 *   1. AC-1: token 未保存で起動すると LoginView が表示される (他ビューに遷移できない).
 *   2. 有効 token 保存済みで起動すると本体 (今日ビュー) が表示される.
 *   3. AC-4: 401 を捕捉した interceptor が `todica:auth-expired` を dispatch すると,
 *           auth-storage が空になり LoginView に戻る.
 *
 * 現状: `web/src/auth/auth-storage.ts` / `App` の token 分岐は未実装. red.
 */
import { act, render, screen, waitFor } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";
/**
 * `AppWithAuth` は `web/src/main.tsx` 内で `App` を `auth-storage.getToken()` の有無で
 * `<LoginView>` / 本体 に分岐させるラッパコンポーネント. Step 4 の実装で
 * `web/src/main.tsx` から named export するか, `web/src/app-with-auth.tsx` に切り出す.
 * テストからは `web/src/app-with-auth.js` をインポートする前提で書いている.
 */
import { AppWithAuth } from "../src/app-with-auth.js";
import { WebAuthStorage } from "../src/auth/auth-storage.js";

beforeEach(() => {
  localStorage.clear();
  // jsdom のデフォルト URL は about:blank だが BrowserRouter 用に "/" にリセット.
  window.history.replaceState({}, "", "/");
});

describe("AppWithAuth — token 未保存 (AC-1)", () => {
  it("auth-storage に token が無い状態で起動すると LoginView が表示される", async () => {
    // localStorage は空 (= getToken() は null).
    render(
      <BrowserRouter>
        <AppWithAuth />
      </BrowserRouter>,
    );

    // LoginView の特徴的要素: パスワード入力欄.
    await waitFor(() => {
      expect(screen.getByLabelText("パスワード")).toBeInTheDocument();
    });
  });

  it("/today を直接開いても LoginView にリダイレクトされる (他ビューへ遷移できない)", async () => {
    window.history.replaceState({}, "", "/today");

    render(
      <BrowserRouter>
        <AppWithAuth />
      </BrowserRouter>,
    );

    await waitFor(() => {
      expect(screen.getByLabelText("パスワード")).toBeInTheDocument();
    });
  });
});

describe("AppWithAuth — token 保存済み", () => {
  it("有効 token が auth-storage にある状態で起動すると LoginView ではなく本体が表示される", async () => {
    const storage = new WebAuthStorage();
    await storage.setToken("valid-session-token");

    render(
      <BrowserRouter>
        <AppWithAuth />
      </BrowserRouter>,
    );

    // LoginView のパスワード入力欄が「無い」ことを担保する.
    // (本体 = TodayView などの読み込みは非同期なので, LoginView が表示されないことだけ確認する.)
    await waitFor(() => {
      expect(screen.queryByLabelText("パスワード")).toBeNull();
    });
  });
});

describe("AppWithAuth — 401 interceptor (AC-4)", () => {
  it("todica:auth-expired イベントを受け取ると auth-storage がクリアされ LoginView に戻る", async () => {
    const storage = new WebAuthStorage();
    await storage.setToken("expired-session-token");

    render(
      <BrowserRouter>
        <AppWithAuth />
      </BrowserRouter>,
    );

    // 起動時は token あり → LoginView は出ない.
    await waitFor(() => {
      expect(screen.queryByLabelText("パスワード")).toBeNull();
    });

    // authed-fetch が 401 を検知して dispatch するイベント (plan D-13).
    act(() => {
      window.dispatchEvent(new Event("todica:auth-expired"));
    });

    // LoginView が表示される.
    await waitFor(() => {
      expect(screen.getByLabelText("パスワード")).toBeInTheDocument();
    });

    // token は破棄されている.
    expect(await storage.getToken()).toBeNull();
  });
});

describe("AppWithAuth — クリーンアップ", () => {
  it("vi のモジュールキャッシュ汚染を避けるため, localStorage をリセットする", () => {
    expect(localStorage.length).toBe(0);
  });
});
