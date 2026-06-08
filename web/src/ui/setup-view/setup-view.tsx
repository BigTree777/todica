/**
 * SetupView コンポーネント (BL-019 / AC-AND-003).
 *
 * Android アプリ初回起動時に表示されるサーバ接続設定画面.
 * サーバ URL と認証トークンを入力して保存する.
 *
 * 仕様参照:
 *   - docs/developer/features/android-server-mode/spec.md §「AC-AND-003: SetupView（初回起動）」
 */
import { useState } from "react";

export interface SetupViewProps {
  onSave: (serverUrl: string, authToken: string) => void;
  initialServerUrl?: string;
  initialAuthToken?: string;
  /** BL-020: ローカルモード選択時のコールバック. 渡されている場合は「ローカルモードで使う」ボタンを表示する. */
  onSelectLocal?: () => void;
}

export function SetupView(props: SetupViewProps): JSX.Element {
  const { onSave, initialServerUrl = "", initialAuthToken = "", onSelectLocal } = props;

  const [serverUrl, setServerUrl] = useState(initialServerUrl);
  const [authToken, setAuthToken] = useState(initialAuthToken);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!serverUrl) {
      setError("サーバURLを入力してください");
      return;
    }

    if (!authToken) {
      setError("認証トークンを入力してください");
      return;
    }

    if (!serverUrl.startsWith("http://") && !serverUrl.startsWith("https://")) {
      setError("URLはhttp://またはhttps://で始まる必要があります");
      return;
    }

    onSave(serverUrl, authToken);
  };

  return (
    <main>
      <h1>サーバ接続設定</h1>

      {error && (
        <div role="alert" aria-live="assertive">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} aria-label="サーバ接続設定フォーム">
        <div>
          <label htmlFor="server-url">サーバ URL</label>
          <input
            id="server-url"
            type="text"
            value={serverUrl}
            onChange={(e) => setServerUrl(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="auth-token">認証トークン</label>
          <input
            id="auth-token"
            type="password"
            value={authToken}
            onChange={(e) => setAuthToken(e.target.value)}
          />
        </div>
        <button type="submit">接続する</button>
      </form>

      {onSelectLocal !== undefined && (
        <div>
          <button type="button" onClick={onSelectLocal}>
            ローカルモードで使う
          </button>
        </div>
      )}
    </main>
  );
}
