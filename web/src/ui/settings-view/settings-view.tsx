import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
/**
 * 境界時刻の設定ビュー (BL-009 / FR-041 / FR-042).
 *
 * 仕様参照:
 *   - docs/developer/features/settings-day-boundary/spec.md §「Web クライアント SettingsView」
 *   - docs/developer/features/settings-day-boundary/plan.md §「UI 設計」
 *
 * 機能:
 *   - 初期表示: repository.getSettings() で dayBoundaryTime を取得して表示.
 *   - 保存: repository.patchSettings() でサーバに送信し、表示を更新.
 *   - クライアントバリデーション: HH:MM 形式 (00:00 - 23:59) のみ送信する.
 *   - 412 (楽観ロック): エラーメッセージを表示してユーザーに再試行を促す.
 *
 * TanStack Query (useQuery / useMutation) でデータ取得・書込みを管理.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import "./settings-view.css";
import { InvalidPasswordError } from "../../auth/password-client.js";
import { PatchConflictError } from "../../repositories/settings-repository.js";
import type {
  PatchSettingsCommand,
  Settings,
  SettingsRepository,
} from "../../repositories/settings-repository.js";

/** dayBoundaryTime の形式バリデーション: HH:MM (00:00 - 23:59). */
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export interface SettingsViewProps {
  repository: SettingsRepository;
  /** 現在のモード（渡されている場合は「モード切替」セクションを表示する） */
  currentMode?: "local" | "server";
  /** モード切替ボタンクリック時のコールバック */
  onSwitchMode?: () => void | Promise<void>;
  /** ログアウトボタン押下時のコールバック (渡されている場合のみボタンを表示) */
  onLogout?: () => void | Promise<void>;
  /** パスワード変更 API 呼び出し. */
  onChangePassword?: (currentPassword: string, newPassword: string) => Promise<void>;
  /** パスワード変更成功後のセッション破棄. */
  onPasswordChanged?: () => void | Promise<void>;
}

export function SettingsView(props: SettingsViewProps): JSX.Element {
  const { repository, currentMode, onSwitchMode, onLogout, onChangePassword, onPasswordChanged } =
    props;
  const queryClient = useQueryClient();

  const { data: fetchedSettings } = useQuery({
    queryKey: ["settings"],
    queryFn: () => repository.getSettings(),
    networkMode: "offlineFirst",
  });

  // ローカル設定（PATCH 後の最新値または 412 時のサーバ値を保持）
  const [localSettings, setLocalSettings] = useState<Settings | null>(null);
  const settings = localSettings ?? fetchedSettings ?? null;

  const [inputValue, setInputValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccessMessage, setPasswordSuccessMessage] = useState<string | null>(null);

  // 初期化済みフラグ（fetchedSettings が取得されたら一度だけ inputValue を初期化）
  const initializedRef = useRef(false);
  useEffect(() => {
    if (fetchedSettings && !initializedRef.current) {
      initializedRef.current = true;
      setInputValue(fetchedSettings.dayBoundaryTime);
    }
  }, [fetchedSettings]);

  const patchMutation = useMutation({
    mutationFn: (cmd: PatchSettingsCommand) => repository.patchSettings(cmd),
    networkMode: "offlineFirst",
  });

  const handleSave = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      setSuccessMessage(null);

      // クライアントバリデーション.
      if (!TIME_PATTERN.test(inputValue)) {
        setError("HH:MM 形式 (00:00 - 23:59) で入力してください。");
        return;
      }

      const currentSettings = settings;
      if (!currentSettings) return;

      const cmd: PatchSettingsCommand = {
        dayBoundaryTime: inputValue,
        ifMatch: currentSettings.version,
      };

      try {
        await patchMutation.mutateAsync(cmd);
        // PATCH 成功後に再フェッチしてサーバ正本値を反映する（getSettings 2 回目）.
        const updated = await repository.getSettings();
        setLocalSettings(updated);
        setInputValue(updated.dayBoundaryTime);
        setError(null);
        setSuccessMessage(`リセット時刻を ${updated.dayBoundaryTime} に変更しました。`);
        // QueryClient のキャッシュを直接更新する（invalidateQueries は追加フェッチを引き起こすため使わない）
        queryClient.setQueryData(["settings"], updated);
      } catch (err) {
        if (err instanceof PatchConflictError) {
          // 412: PatchConflictError.settings（412 ボディから取得した最新値）を直接 state に反映する.
          // 追加の GET リクエストはしない（D-004）.
          setLocalSettings(err.settings);
          setInputValue(err.settings.dayBoundaryTime);
          setError(
            "設定の更新中に競合が発生しました。最新の値を表示しています。再度お試しください。",
          );
        } else {
          setError("保存に失敗しました。");
        }
      }
    },
    [inputValue, settings, patchMutation, repository, queryClient],
  );

  const handlePasswordSubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      setPasswordError(null);
      setPasswordSuccessMessage(null);
      if (!onChangePassword || !currentPassword || !newPassword || !confirmPassword) {
        return;
      }
      if (newPassword !== confirmPassword) {
        setPasswordError("新パスワードと確認入力が一致しません");
        return;
      }
      try {
        await onChangePassword(currentPassword, newPassword);
        setPasswordSuccessMessage("パスワードを変更しました。");
        await onPasswordChanged?.();
      } catch (err) {
        setPasswordError(
          err instanceof InvalidPasswordError
            ? "現在のパスワードが正しくありません"
            : "変更できませんでした",
        );
      }
    },
    [confirmPassword, currentPassword, newPassword, onChangePassword, onPasswordChanged],
  );

  return (
    <main className="settings-view">
      <h1>設定</h1>

      {error && (
        <div
          role="alert"
          aria-live="assertive"
          className="settings-view__message settings-view__message--error"
        >
          {error}
        </div>
      )}

      {successMessage && !error && (
        <div
          role="status"
          aria-live="polite"
          className="settings-view__message settings-view__message--success"
        >
          {successMessage}
        </div>
      )}

      {settings && (
        <form onSubmit={handleSave} aria-label="設定フォーム" className="settings-view__form">
          <label htmlFor="day-boundary-time" className="settings-view__label">
            リセット時刻
          </label>
          <div className="settings-view__field-row">
            <input
              id="day-boundary-time"
              type="text"
              value={inputValue}
              onChange={(e) => {
                setInputValue(e.target.value);
                setSuccessMessage(null);
                setError(null);
              }}
            />
            <button type="submit" className="button button--primary">
              変更
            </button>
          </div>
        </form>
      )}

      {onChangePassword !== undefined && (
        <section aria-label="パスワード変更" className="settings-view__section">
          <h2>パスワード変更</h2>
          <form onSubmit={handlePasswordSubmit} className="settings-view__password-form">
            <div className="settings-view__password-field">
              <label htmlFor="current-password">現在のパスワード</label>
              <input
                id="current-password"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
              />
            </div>
            <div className="settings-view__password-field">
              <label htmlFor="new-password">新しいパスワード</label>
              <input
                id="new-password"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
              />
            </div>
            <div className="settings-view__password-field">
              <label htmlFor="confirm-password">新しいパスワード (確認)</label>
              <input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
              />
            </div>
            {passwordError && (
              <div role="alert" className="settings-view__message settings-view__message--error">
                {passwordError}
              </div>
            )}
            {passwordSuccessMessage && !passwordError && (
              <div
                role="status"
                aria-live="polite"
                className="settings-view__message settings-view__message--success"
              >
                {passwordSuccessMessage}
              </div>
            )}
            <button type="submit" className="button button--primary">
              変更
            </button>
          </form>
        </section>
      )}

      {currentMode !== undefined && (
        <section aria-label="モード切替" className="settings-view__section">
          <h2>モード切替</h2>
          <p>{currentMode === "local" ? "現在: ローカルモード" : "現在: サーバモード"}</p>
          {onSwitchMode !== undefined && (
            <button
              type="button"
              className="button button--ghost"
              onClick={() => {
                if (window.confirm("現在のモードのデータが初期化されます。よろしいですか？")) {
                  void onSwitchMode();
                }
              }}
            >
              {currentMode === "local" ? "サーバモードへ切り替える" : "ローカルモードへ切り替える"}
            </button>
          )}
        </section>
      )}

      {onLogout !== undefined && (
        <section aria-label="ログアウト" className="settings-view__logout">
          <button
            type="button"
            className="button button--ghost"
            onClick={() => {
              void onLogout();
            }}
          >
            ログアウト
          </button>
        </section>
      )}
    </main>
  );
}
