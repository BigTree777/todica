/**
 * 単体テスト: InitialSetupView コンポーネント (initial-password-setup).
 *
 * 受け入れ基準の出典:
 *   - docs/developer/features/initial-password-setup/spec.md §「受け入れ基準」AC-9 / AC-10 / AC-11
 *     / §NFR-IPS-3 (a11y)
 *   - docs/developer/features/initial-password-setup/plan.md §「Web — `ui/initial-setup-view/initial-setup-view.tsx` (新設)」
 *
 * 観点:
 *   1. 初期表示: 「初期パスワード設定」h1 + 新 PW input + 確認 PW input + 「設定する」ボタン.
 *      input は type="password" + autocomplete="new-password" + required.
 *      初回マウントで新 PW input に autofocus.
 *   2. AC-10: 新 PW != 確認 PW で submit すると `setupInitialPassword` は呼ばれず,
 *            role="alert" に「パスワードが一致しません」相当のエラー表示.
 *   3. AC-11: 2 入力のいずれかが空のまま submit すると `setupInitialPassword` は呼ばれない.
 *   4. 正常系 (AC-9 の前半): 2 入力一致で submit すると
 *      `setupInitialPassword(newPassword)` が呼ばれ, resolve で `onSetupSuccess(result)` が呼ばれる.
 *      `onSetupSuccess` には `{ token, expiresAt }` がそのまま渡る.
 *   5. エラー時: `BadRequestError` / `NetworkError` / 不明エラーで role="alert" に
 *               対応するエラー文言を表示し, `onSetupSuccess` は呼ばれない.
 *   6. submit 中は button に aria-busy="true" が付与され, 二重押下されない.
 *   7. a11y (NFR-IPS-3): エラー表示時に新 PW input に aria-invalid="true" と
 *      aria-describedby が付与される.
 *
 * 現状: `web/src/ui/initial-setup-view/initial-setup-view.tsx` は未実装. インポート不能で red.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { InitialSetupView } from "./initial-setup-view.js";

class BadRequestError extends Error {
  constructor() {
    super("bad request");
    this.name = "BadRequestError";
  }
}

class NetworkError extends Error {
  constructor() {
    super("network");
    this.name = "NetworkError";
  }
}

describe("InitialSetupView 初期表示 (NFR-IPS-3 a11y)", () => {
  it("「初期パスワード設定」見出し + 新 PW 入力 + 確認 PW 入力 + 「設定する」ボタンが描画される", () => {
    const setupInitialPassword = vi.fn();
    const onSetupSuccess = vi.fn();

    render(
      <InitialSetupView
        setupInitialPassword={setupInitialPassword}
        onSetupSuccess={onSetupSuccess}
      />,
    );

    // 見出し.
    expect(screen.getByRole("heading", { name: /初期パスワード設定/ })).toBeInTheDocument();

    // 2 つの password input. ラベルは label[htmlFor] で関連付けされている.
    const newInput = screen.getByLabelText(/^新しいパスワード$/);
    const confirmInput = screen.getByLabelText(/新しいパスワード\s*\(?確認\)?/);
    expect(newInput).toHaveAttribute("type", "password");
    expect(confirmInput).toHaveAttribute("type", "password");

    // NFR-IPS-3: autocomplete="new-password" + required.
    expect(newInput).toHaveAttribute("autocomplete", "new-password");
    expect(confirmInput).toHaveAttribute("autocomplete", "new-password");
    expect(newInput).toHaveAttribute("required");
    expect(confirmInput).toHaveAttribute("required");

    // 「設定する」ボタン.
    expect(screen.getByRole("button", { name: /設定|登録|保存/ })).toBeInTheDocument();
  });

  it("初回マウントで新 PW input に autofocus されている", () => {
    render(<InitialSetupView setupInitialPassword={vi.fn()} onSetupSuccess={vi.fn()} />);

    const newInput = screen.getByLabelText(/^新しいパスワード$/);
    expect(newInput).toHaveFocus();
  });
});

describe("InitialSetupView バリデーション (AC-10 / AC-11)", () => {
  it("AC-10: 新 PW != 確認 PW で submit しても setupInitialPassword は呼ばれず, role='alert' にエラーが出る", async () => {
    const setupInitialPassword = vi.fn();
    const onSetupSuccess = vi.fn();
    const user = userEvent.setup();

    render(
      <InitialSetupView
        setupInitialPassword={setupInitialPassword}
        onSetupSuccess={onSetupSuccess}
      />,
    );

    await user.type(screen.getByLabelText(/^新しいパスワード$/), "A");
    await user.type(screen.getByLabelText(/新しいパスワード\s*\(?確認\)?/), "B");
    await user.click(screen.getByRole("button", { name: /設定|登録|保存/ }));

    // setupInitialPassword は呼ばれない.
    expect(setupInitialPassword).not.toHaveBeenCalled();
    expect(onSetupSuccess).not.toHaveBeenCalled();

    // role="alert" に一致しない旨のメッセージ.
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/一致しません|一致しない/);
  });

  it("AC-11: 新 PW が空のまま submit しても setupInitialPassword は呼ばれない", async () => {
    const setupInitialPassword = vi.fn();
    const onSetupSuccess = vi.fn();
    const user = userEvent.setup();

    render(
      <InitialSetupView
        setupInitialPassword={setupInitialPassword}
        onSetupSuccess={onSetupSuccess}
      />,
    );

    // 確認 PW のみ入力.
    await user.type(screen.getByLabelText(/新しいパスワード\s*\(?確認\)?/), "P0");
    await user.click(screen.getByRole("button", { name: /設定|登録|保存/ }));

    expect(setupInitialPassword).not.toHaveBeenCalled();
    expect(onSetupSuccess).not.toHaveBeenCalled();
  });

  it("AC-11: 確認 PW が空のまま submit しても setupInitialPassword は呼ばれない", async () => {
    const setupInitialPassword = vi.fn();
    const onSetupSuccess = vi.fn();
    const user = userEvent.setup();

    render(
      <InitialSetupView
        setupInitialPassword={setupInitialPassword}
        onSetupSuccess={onSetupSuccess}
      />,
    );

    await user.type(screen.getByLabelText(/^新しいパスワード$/), "P0");
    await user.click(screen.getByRole("button", { name: /設定|登録|保存/ }));

    expect(setupInitialPassword).not.toHaveBeenCalled();
    expect(onSetupSuccess).not.toHaveBeenCalled();
  });

  it("AC-11: 2 入力とも空のまま submit しても setupInitialPassword は呼ばれない", async () => {
    const setupInitialPassword = vi.fn();
    const onSetupSuccess = vi.fn();
    const user = userEvent.setup();

    render(
      <InitialSetupView
        setupInitialPassword={setupInitialPassword}
        onSetupSuccess={onSetupSuccess}
      />,
    );

    await user.click(screen.getByRole("button", { name: /設定|登録|保存/ }));

    expect(setupInitialPassword).not.toHaveBeenCalled();
    expect(onSetupSuccess).not.toHaveBeenCalled();
  });
});

describe("InitialSetupView 正常系 (AC-9 前半)", () => {
  it("2 入力一致で submit → setupInitialPassword(newPassword) → onSetupSuccess(result)", async () => {
    const setupInitialPassword = vi.fn(async (_newPassword: string) => ({
      token: "t".repeat(64),
      expiresAt: 1_800_000_000_000,
    }));
    const onSetupSuccess = vi.fn();
    const user = userEvent.setup();

    render(
      <InitialSetupView
        setupInitialPassword={setupInitialPassword}
        onSetupSuccess={onSetupSuccess}
      />,
    );

    await user.type(screen.getByLabelText(/^新しいパスワード$/), "P0");
    await user.type(screen.getByLabelText(/新しいパスワード\s*\(?確認\)?/), "P0");
    await user.click(screen.getByRole("button", { name: /設定|登録|保存/ }));

    // setupInitialPassword は newPassword (confirmPassword は渡さない) で呼ばれる.
    await waitFor(() => {
      expect(setupInitialPassword).toHaveBeenCalledTimes(1);
    });
    expect(setupInitialPassword).toHaveBeenCalledWith("P0");

    // 成功で onSetupSuccess に { token, expiresAt } が渡る.
    await waitFor(() => {
      expect(onSetupSuccess).toHaveBeenCalledWith({
        token: "t".repeat(64),
        expiresAt: 1_800_000_000_000,
      });
    });
  });
});

describe("InitialSetupView エラー時", () => {
  it("BadRequestError で role='alert' にエラー表示 + onSetupSuccess は呼ばれない", async () => {
    const setupInitialPassword = vi.fn(async () => {
      throw new BadRequestError();
    });
    const onSetupSuccess = vi.fn();
    const user = userEvent.setup();

    render(
      <InitialSetupView
        setupInitialPassword={setupInitialPassword}
        onSetupSuccess={onSetupSuccess}
      />,
    );

    await user.type(screen.getByLabelText(/^新しいパスワード$/), "P0");
    await user.type(screen.getByLabelText(/新しいパスワード\s*\(?確認\)?/), "P0");
    await user.click(screen.getByRole("button", { name: /設定|登録|保存/ }));

    const alert = await screen.findByRole("alert");
    expect(alert).toBeInTheDocument();
    expect(onSetupSuccess).not.toHaveBeenCalled();
  });

  it("NetworkError で「サーバに接続できません」相当のエラーを role='alert' に表示する", async () => {
    const setupInitialPassword = vi.fn(async () => {
      throw new NetworkError();
    });
    const onSetupSuccess = vi.fn();
    const user = userEvent.setup();

    render(
      <InitialSetupView
        setupInitialPassword={setupInitialPassword}
        onSetupSuccess={onSetupSuccess}
      />,
    );

    await user.type(screen.getByLabelText(/^新しいパスワード$/), "P0");
    await user.type(screen.getByLabelText(/新しいパスワード\s*\(?確認\)?/), "P0");
    await user.click(screen.getByRole("button", { name: /設定|登録|保存/ }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/サーバ|接続/);
    expect(onSetupSuccess).not.toHaveBeenCalled();
  });

  it("不明エラーでも role='alert' にエラー表示 + onSetupSuccess は呼ばれない", async () => {
    const setupInitialPassword = vi.fn(async () => {
      throw new Error("unknown");
    });
    const onSetupSuccess = vi.fn();
    const user = userEvent.setup();

    render(
      <InitialSetupView
        setupInitialPassword={setupInitialPassword}
        onSetupSuccess={onSetupSuccess}
      />,
    );

    await user.type(screen.getByLabelText(/^新しいパスワード$/), "P0");
    await user.type(screen.getByLabelText(/新しいパスワード\s*\(?確認\)?/), "P0");
    await user.click(screen.getByRole("button", { name: /設定|登録|保存/ }));

    const alert = await screen.findByRole("alert");
    expect(alert).toBeInTheDocument();
    expect(onSetupSuccess).not.toHaveBeenCalled();
  });

  it("a11y: エラー時に新 PW input に aria-invalid='true' + aria-describedby が付与される", async () => {
    const setupInitialPassword = vi.fn(async () => {
      throw new BadRequestError();
    });
    const user = userEvent.setup();

    render(
      <InitialSetupView setupInitialPassword={setupInitialPassword} onSetupSuccess={vi.fn()} />,
    );

    const newInput = screen.getByLabelText(/^新しいパスワード$/);
    await user.type(newInput, "P0");
    await user.type(screen.getByLabelText(/新しいパスワード\s*\(?確認\)?/), "P0");
    await user.click(screen.getByRole("button", { name: /設定|登録|保存/ }));

    const alert = await screen.findByRole("alert");
    await waitFor(() => {
      expect(newInput).toHaveAttribute("aria-invalid", "true");
    });
    const describedBy = newInput.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    expect(alert.id).toBe(describedBy);
  });
});

describe("InitialSetupView 送信中 (二重送信抑止 / aria-busy)", () => {
  it("submit 中は button に aria-busy='true' が付与され二重押下できない", async () => {
    let resolveSetup: (value: { token: string; expiresAt: number }) => void = () => {};
    const pending = new Promise<{ token: string; expiresAt: number }>((resolve) => {
      resolveSetup = resolve;
    });
    const setupInitialPassword = vi.fn(() => pending);
    const onSetupSuccess = vi.fn();
    const user = userEvent.setup();

    render(
      <InitialSetupView
        setupInitialPassword={setupInitialPassword}
        onSetupSuccess={onSetupSuccess}
      />,
    );

    await user.type(screen.getByLabelText(/^新しいパスワード$/), "P0");
    await user.type(screen.getByLabelText(/新しいパスワード\s*\(?確認\)?/), "P0");
    const button = screen.getByRole("button", { name: /設定|登録|保存/ });
    await user.click(button);

    await waitFor(() => {
      expect(button).toHaveAttribute("aria-busy", "true");
    });
    // 二重押下しても setupInitialPassword は 1 回しか呼ばれない.
    await user.click(button);
    expect(setupInitialPassword).toHaveBeenCalledTimes(1);

    // 後始末.
    resolveSetup({ token: "x".repeat(64), expiresAt: 1 });
    await waitFor(() => expect(onSetupSuccess).toHaveBeenCalled());
  });
});
