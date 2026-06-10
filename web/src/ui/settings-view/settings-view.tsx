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
 * BL-018: TanStack Query (useQuery / useMutation) でデータ取得・書込みを管理.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import "./settings-view.css";
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
  serverUrl?: string;
  authToken?: string;
  onSaveServer?: (serverUrl: string, authToken: string) => void;
  /** BL-020: 現在のモード（渡されている場合は「モード切替」セクションを表示する） */
  currentMode?: "local" | "server";
  /** BL-020: モード切替ボタンクリック時のコールバック */
  onSwitchMode?: () => void | Promise<void>;
}

export function SettingsView(props: SettingsViewProps): JSX.Element {
  const {
    repository,
    serverUrl: initialServerUrl,
    authToken: initialAuthToken,
    onSaveServer,
    currentMode,
    onSwitchMode,
  } = props;
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

  // サーバ接続設定 (BL-019)
  const [serverUrlValue, setServerUrlValue] = useState(initialServerUrl ?? "");
  const [authTokenValue, setAuthTokenValue] = useState(initialAuthToken ?? "");

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

  return (
    <main className="settings-view">
      <h1>設定</h1>

      {settings && (
        <div className="settings-view__current" aria-label="設定値">
          <span>{settings.dayBoundaryTime}</span>
        </div>
      )}

      {error && (
        <div role="alert" aria-live="assertive">
          {error}
        </div>
      )}

      <form onSubmit={handleSave} aria-label="設定フォーム" className="settings-view__form">
        <div>
          <label htmlFor="day-boundary-time">境界時刻</label>
          <input
            id="day-boundary-time"
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
          />
        </div>
        <button type="submit">保存</button>
      </form>

      {onSaveServer !== undefined && (
        <section aria-label="サーバ接続設定" className="settings-view__section">
          <h2>サーバ接続設定</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onSaveServer(serverUrlValue, authTokenValue);
            }}
            aria-label="サーバ接続設定フォーム"
          >
            <div>
              <label htmlFor="settings-server-url">サーバ URL</label>
              <input
                id="settings-server-url"
                type="text"
                value={serverUrlValue}
                onChange={(e) => setServerUrlValue(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="settings-auth-token">認証トークン</label>
              <input
                id="settings-auth-token"
                type="password"
                value={authTokenValue}
                onChange={(e) => setAuthTokenValue(e.target.value)}
              />
            </div>
            <button type="submit">変更を保存</button>
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
    </main>
  );
}
