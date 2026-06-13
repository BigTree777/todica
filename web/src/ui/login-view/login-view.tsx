/**
 * LoginView.
 *
 * - パスワード入力 → submit で `login(password)` を呼び, 成功時に `onSuccess` を発火する.
 * - 401 (InvalidPasswordError) → 「パスワードが正しくありません」.
 * - NetworkError / その他 → 「サーバに接続できません」.
 * - a11y (plan D-19):
 *   - 明示ラベル `<label>パスワード</label>`.
 *   - `<input type="password" autocomplete="current-password" required>`.
 *   - エラー要素は `role="alert" aria-live="assertive"`.
 *   - `aria-invalid` / `aria-describedby` で input とエラーを紐付け.
 *   - submit 中は `aria-busy="true"` で二重押下抑止.
 *   - 初回マウント / 失敗後に password input へ focus.
 */
import { useEffect, useRef, useState } from "react";
import "./login-view.css";

export interface LoginViewProps {
  /** `(password) => Promise<{ token, expiresAt }>`. 401 は `InvalidPasswordError`, ネットワーク失敗は `NetworkError`. */
  login: (password: string) => Promise<{ token: string; expiresAt: number }>;
  onSuccess: (result: { token: string; expiresAt: number }) => void;
}

const ERROR_ID = "login-view-error";

export function LoginView({ login, onSuccess }: LoginViewProps): JSX.Element {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // 初回マウント時に autofocus.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // 失敗後 (error が出た時) に password input にフォーカスを戻す.
  useEffect(() => {
    if (error) {
      inputRef.current?.focus();
    }
  }, [error]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const result = await login(password);
      onSuccess(result);
    } catch (err) {
      const name = err instanceof Error ? err.name : "";
      if (name === "InvalidPasswordError") {
        setError("パスワードが正しくありません");
      } else {
        setError("サーバに接続できません");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="login-view">
      <h1 className="login-view__title">ログイン</h1>

      {error && (
        <div id={ERROR_ID} className="login-view__error" role="alert" aria-live="assertive">
          {error}
        </div>
      )}

      <form className="login-view__form" onSubmit={handleSubmit} aria-label="ログインフォーム">
        <div className="login-view__field">
          <label htmlFor="login-password">パスワード</label>
          <input
            id="login-password"
            ref={inputRef}
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={error ? "true" : "false"}
            aria-describedby={error ? ERROR_ID : undefined}
          />
        </div>
        <button
          type="submit"
          className="button button--primary"
          aria-busy={submitting ? "true" : "false"}
          disabled={submitting}
        >
          ログイン
        </button>
      </form>
    </main>
  );
}
