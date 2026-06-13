/**
 * ErrorNotification コンポーネント .
 *
 * `useErrorNotification` フックで現在のメッセージを受け取り, 非 null の間だけ
 * 画面上部に role="alert" のバナーを描画する.
 *
 * 仕様:
 *   401 / ネットワークエラー時に user に失敗が伝わる UI を提供する.
 *   現状の方針はトースト的な短時間表示 (5 秒) で auto-dismiss. user の操作を
 *   ブロックしない. ConflictDialog はモーダルなので別経路.
 */
import { dismissError, useErrorNotification } from "../../error-notification.js";

export function ErrorNotification(): JSX.Element | null {
  const message = useErrorNotification();
  if (!message) return null;
  return (
    <div role="alert" aria-live="assertive" aria-label="通信エラー通知">
      <span>{message}</span>
      <button
        type="button"
        className="button button--ghost"
        onClick={dismissError}
        aria-label="通知を閉じる"
      >
        ×
      </button>
    </div>
  );
}
