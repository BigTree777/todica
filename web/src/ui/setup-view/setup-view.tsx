/**
 * SetupView コンポーネント.
 *
 * Android アプリ初回起動時に表示されるサーバ接続設定画面.
 * 役割: サーバ URL 入力 + `/healthz` 接続検証.
 *
 * 仕様参照:
 *   - docs/developer/features/app-login/spec.md §「Android クライアント」/ AC-6
 *   - docs/developer/features/app-login/plan.md §「Android 初回起動 (SetupView)」/ D-10
 *   - docs/developer/features/android-server-mode/spec.md §「AC-AND-003: SetupView（初回起動）」(URL 部分のみ流用)
 */
import type { JSX } from "react";
import { useState } from "react";

export interface SetupViewProps {
  /** URL 検証成功時のコールバック. `fetch(url + "/healthz")` が 200 を返した時に呼ばれる. */
  onValidated: (serverUrl: string) => void | Promise<void>;
  initialServerUrl?: string;
  /** ローカルモード選択時のコールバック. 渡されている場合は「ローカルモードで使う」ボタンを表示する. */
  onSelectLocal?: () => void | Promise<void>;
}

export function SetupView(props: SetupViewProps): JSX.Element {
  const { onValidated, initialServerUrl = "", onSelectLocal } = props;

  const [serverUrl, setServerUrl] = useState(initialServerUrl);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);

    if (!serverUrl) {
      setError("サーバURLを入力してください");
      return;
    }

    if (!serverUrl.startsWith("http://") && !serverUrl.startsWith("https://")) {
      setError("URLはhttp://またはhttps://で始まる必要があります");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`${serverUrl}/healthz`);
      if (!res.ok) {
        setError("サーバに接続できませんでした");
        return;
      }
      await onValidated(serverUrl);
    } catch {
      setError("サーバに接続できませんでした");
    } finally {
      setSubmitting(false);
    }
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
        <button type="submit" className="button button--primary" disabled={submitting}>
          接続する
        </button>
      </form>

      {onSelectLocal !== undefined && (
        <div>
          <button type="button" className="button button--ghost" onClick={onSelectLocal}>
            ローカルモードで使う
          </button>
        </div>
      )}
    </main>
  );
}
