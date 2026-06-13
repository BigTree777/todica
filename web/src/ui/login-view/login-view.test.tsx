import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
/**
 * 単体テスト: LoginView コンポーネント (BL-074 / Step 4).
 *
 * 受け入れ基準の出典:
 *   - docs/developer/features/app-login/spec.md §「受け入れ基準」AC-2 / AC-3
 *   - docs/developer/features/app-login/plan.md §「非機能 / アクセシビリティ」/ D-19
 *
 * 観点:
 *   1. 初期表示: パスワード入力欄 + 「ログイン」ボタン + a11y (label / role / autocomplete).
 *   2. AC-2: 正しいパスワード送信 → onSuccess コールバックが token 付きで呼ばれる.
 *   3. AC-3: 401 で「パスワードが正しくありません」を `role="alert"` で表示し入力欄に focus 戻し.
 *   4. ネットワークエラーで「サーバに接続できません」を表示.
 *   5. submit 中は button に `aria-busy="true"` が付与され, 二重押下を抑止.
 *   6. autofocus が password input に当たっている (初回マウント時).
 *   7. `<input type="password" autocomplete="current-password" required>` であること.
 *   8. `aria-invalid` / `aria-describedby` がエラー表示と input に紐付く.
 *
 * 現状: `web/src/ui/login-view/login-view.tsx` は未実装. インポート不能で red.
 */
import { describe, expect, it, vi } from "vitest";
import { LoginView } from "./login-view.js";

describe("LoginView 初期表示", () => {
  it("パスワード入力欄と「ログイン」ボタンが描画される", () => {
    const onSuccess = vi.fn();
    const login = vi.fn();

    render(<LoginView login={login} onSuccess={onSuccess} />);

    // 「パスワード」の明示ラベル + input.
    const passwordInput = screen.getByLabelText("パスワード");
    expect(passwordInput).toBeInTheDocument();
    expect(passwordInput).toHaveAttribute("type", "password");
    expect(passwordInput).toHaveAttribute("autocomplete", "current-password");
    expect(passwordInput).toHaveAttribute("required");

    // 「ログイン」ボタン.
    expect(screen.getByRole("button", { name: /ログイン/ })).toBeInTheDocument();
  });

  it("password input は初回マウント時に autofocus されている", () => {
    const login = vi.fn();
    render(<LoginView login={login} onSuccess={vi.fn()} />);

    const passwordInput = screen.getByLabelText("パスワード");
    expect(passwordInput).toHaveFocus();
  });
});

describe("LoginView 正常系 (AC-2)", () => {
  it("正しいパスワードを入力 → submit すると login が呼ばれ onSuccess に token が渡る", async () => {
    const login = vi.fn(async () => ({
      token: "f".repeat(64),
      expiresAt: 1_700_000_000_000,
    }));
    const onSuccess = vi.fn();
    const user = userEvent.setup();

    render(<LoginView login={login} onSuccess={onSuccess} />);

    const passwordInput = screen.getByLabelText("パスワード");
    await user.type(passwordInput, "correct-password");
    await user.click(screen.getByRole("button", { name: /ログイン/ }));

    expect(login).toHaveBeenCalledTimes(1);
    expect(login).toHaveBeenCalledWith("correct-password");

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledWith({
        token: "f".repeat(64),
        expiresAt: 1_700_000_000_000,
      });
    });
  });
});

describe("LoginView 異常系 (AC-3)", () => {
  it("401 (InvalidPasswordError) で「パスワードが正しくありません」を role='alert' で表示し onSuccess は呼ばれない", async () => {
    class InvalidPasswordError extends Error {
      constructor() {
        super("invalid");
        this.name = "InvalidPasswordError";
      }
    }
    const login = vi.fn(async () => {
      throw new InvalidPasswordError();
    });
    const onSuccess = vi.fn();
    const user = userEvent.setup();

    render(<LoginView login={login} onSuccess={onSuccess} />);

    await user.type(screen.getByLabelText("パスワード"), "wrong-password");
    await user.click(screen.getByRole("button", { name: /ログイン/ }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/パスワードが正しくありません/);

    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("401 失敗後, password input にフォーカスが戻る", async () => {
    class InvalidPasswordError extends Error {
      constructor() {
        super("invalid");
        this.name = "InvalidPasswordError";
      }
    }
    const login = vi.fn(async () => {
      throw new InvalidPasswordError();
    });
    const user = userEvent.setup();

    render(<LoginView login={login} onSuccess={vi.fn()} />);

    const passwordInput = screen.getByLabelText("パスワード");
    await user.type(passwordInput, "wrong-password");
    await user.click(screen.getByRole("button", { name: /ログイン/ }));

    // alert 表示後にフォーカスが戻る.
    await screen.findByRole("alert");
    await waitFor(() => {
      expect(passwordInput).toHaveFocus();
    });
  });

  it("ネットワークエラーで「サーバに接続できません」を表示する", async () => {
    class NetworkError extends Error {
      constructor() {
        super("network");
        this.name = "NetworkError";
      }
    }
    const login = vi.fn(async () => {
      throw new NetworkError();
    });
    const user = userEvent.setup();

    render(<LoginView login={login} onSuccess={vi.fn()} />);

    await user.type(screen.getByLabelText("パスワード"), "any");
    await user.click(screen.getByRole("button", { name: /ログイン/ }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/サーバに接続できません/);
  });

  it("入力エラー時の input に aria-invalid='true' と aria-describedby が付与される (plan D-19)", async () => {
    class InvalidPasswordError extends Error {
      constructor() {
        super("invalid");
        this.name = "InvalidPasswordError";
      }
    }
    const login = vi.fn(async () => {
      throw new InvalidPasswordError();
    });
    const user = userEvent.setup();

    render(<LoginView login={login} onSuccess={vi.fn()} />);

    const passwordInput = screen.getByLabelText("パスワード");
    await user.type(passwordInput, "wrong");
    await user.click(screen.getByRole("button", { name: /ログイン/ }));

    const alert = await screen.findByRole("alert");
    await waitFor(() => {
      expect(passwordInput).toHaveAttribute("aria-invalid", "true");
    });

    // aria-describedby は alert 要素を指している.
    const describedBy = passwordInput.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    expect(alert.id).toBe(describedBy);
  });
});

describe("LoginView 送信中 (二重送信抑止)", () => {
  it("submit 中は button に aria-busy='true' が付与され, 二重押下できない", async () => {
    // login を pending のまま留める Promise を作る.
    let resolveLogin: (value: { token: string; expiresAt: number }) => void = () => {};
    const pending = new Promise<{ token: string; expiresAt: number }>((resolve) => {
      resolveLogin = resolve;
    });
    const login = vi.fn(() => pending);
    const onSuccess = vi.fn();
    const user = userEvent.setup();

    render(<LoginView login={login} onSuccess={onSuccess} />);

    await user.type(screen.getByLabelText("パスワード"), "abc");
    const button = screen.getByRole("button", { name: /ログイン/ });
    await user.click(button);

    // submit 中: aria-busy="true".
    await waitFor(() => {
      expect(button).toHaveAttribute("aria-busy", "true");
    });

    // 二重押下しても login は 1 回しか呼ばれない.
    await user.click(button);
    expect(login).toHaveBeenCalledTimes(1);

    // 後始末: 待機を解放してテストを終わらせる.
    resolveLogin({ token: "x".repeat(64), expiresAt: 1 });
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
  });
});
