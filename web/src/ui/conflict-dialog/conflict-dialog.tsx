/**
 * ConflictDialog コンポーネント (フェーズ E: 競合解決 UI)
 *
 * 412 Precondition Failed 発生時に表示する衝突解決ダイアログ。
 * 「サーバの値を採用」と「クライアントの値で再送」の 2 択をユーザーに提示する。
 *
 * 仕様:
 *   CR-001: 412 時に衝突解決ダイアログを表示する。
 *   CR-002: 2 択のボタンを提示する。
 *   CR-003: 「クライアントの値で再送」選択時のコールバック。
 *   CR-004: 「サーバの値を採用」選択時のコールバック。
 */

import type { JSX } from "react";

export interface ConflictDialogProps {
  open: boolean;
  localValue: Record<string, unknown>;
  serverValue: Record<string, unknown>;
  onAcceptServer: () => void;
  onRetryWithServer: () => void;
}

export function ConflictDialog(props: ConflictDialogProps): JSX.Element | null {
  const { open, localValue, serverValue, onAcceptServer, onRetryWithServer } = props;

  if (!open) {
    return null;
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="変更が衝突しました">
      <h2>変更が衝突しました</h2>
      <p>
        オフライン中に行った変更がサーバの現在の値と競合しています。
        どちらの値を採用するか選択してください。
      </p>

      <section aria-label="サーバの値">
        <h3>サーバの値</h3>
        <pre>
          {serverValue.name !== undefined
            ? String(serverValue.name)
            : JSON.stringify(serverValue, null, 2)}
        </pre>
      </section>

      <section aria-label="クライアントの変更">
        <h3>クライアントの変更</h3>
        <pre>
          {localValue.name !== undefined
            ? String(localValue.name)
            : JSON.stringify(localValue, null, 2)}
        </pre>
      </section>

      <div>
        <button type="button" className="button button--primary" onClick={onAcceptServer}>
          サーバの値を採用
        </button>
        <button type="button" className="button button--ghost" onClick={onRetryWithServer}>
          クライアントの値で再送
        </button>
      </div>
    </div>
  );
}
