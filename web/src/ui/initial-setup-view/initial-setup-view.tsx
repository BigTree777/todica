import { useEffect, useRef, useState } from "react";
import "./initial-setup-view.css";

interface SetupResult {
  token: string;
  expiresAt: number;
}

export interface InitialSetupViewProps {
  setupInitialPassword: (newPassword: string) => Promise<SetupResult>;
  onSetupSuccess: (result: SetupResult) => void | Promise<void>;
  error?: string | null;
}

const ERROR_ID = "initial-setup-view-error";

export function InitialSetupView({
  setupInitialPassword,
  onSetupSuccess,
  error: externalError = null,
}: InitialSetupViewProps): JSX.Element {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const mismatch =
    newPassword.length > 0 && confirmPassword.length > 0 && newPassword !== confirmPassword;
  const error = externalError ?? (mismatch ? "パスワードが一致しません" : submitError);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (submitError || externalError) inputRef.current?.focus();
  }, [externalError, submitError]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting || newPassword.length === 0 || confirmPassword.length === 0 || mismatch) return;

    setSubmitError(null);
    setSubmitting(true);
    try {
      const result = await setupInitialPassword(newPassword);
      await onSetupSuccess(result);
    } catch (caught) {
      const name = caught instanceof Error ? caught.name : "";
      if (name === "NetworkError") {
        setSubmitError("サーバに接続できません");
      } else if (name === "BadRequestError") {
        setSubmitError("パスワードを設定できませんでした");
      } else {
        setSubmitError("初期設定に失敗しました");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="initial-setup-view">
      <h1 className="initial-setup-view__title">初期パスワード設定</h1>
      {error && (
        <div id={ERROR_ID} className="initial-setup-view__error" role="alert" aria-live="assertive">
          {error}
        </div>
      )}
      <form
        className="initial-setup-view__form"
        aria-label="初期パスワード設定フォーム"
        onSubmit={handleSubmit}
      >
        <div className="initial-setup-view__field">
          <label htmlFor="initial-setup-password">新しいパスワード</label>
          <input
            id="initial-setup-password"
            ref={inputRef}
            type="password"
            autoComplete="new-password"
            required
            value={newPassword}
            onChange={(event) => {
              setNewPassword(event.target.value);
              setSubmitError(null);
            }}
            aria-invalid={error ? "true" : "false"}
            aria-describedby={error ? ERROR_ID : undefined}
          />
        </div>
        <div className="initial-setup-view__field">
          <label htmlFor="initial-setup-password-confirm">新しいパスワード (確認)</label>
          <input
            id="initial-setup-password-confirm"
            type="password"
            autoComplete="new-password"
            required
            value={confirmPassword}
            onChange={(event) => {
              setConfirmPassword(event.target.value);
              setSubmitError(null);
            }}
            aria-invalid={error ? "true" : "false"}
            aria-describedby={error ? ERROR_ID : undefined}
          />
        </div>
        <button
          type="submit"
          className="button button--primary"
          aria-busy={submitting ? "true" : "false"}
          disabled={
            submitting || newPassword.length === 0 || confirmPassword.length === 0 || mismatch
          }
        >
          設定する
        </button>
      </form>
    </main>
  );
}
