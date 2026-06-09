/**
 * グローバルなエラー通知ストア (BL-034).
 *
 * 各 view の `onError` で `ConflictError` 以外の失敗 (401 / fetch ネットワークエラー /
 * 500 等) を `notifyError(message)` 経由でこのストアに流すと, `<ErrorNotification />`
 * コンポーネントが画面上部に短時間バナーを出す.
 *
 * シンプルな pub/sub 実装. React Context を使わないのは, ストアを 1 つしか持たず
 * かつ provider ラッピングが不要にしたいため (mutation onError から直接 import).
 */
import { useEffect, useState } from "react";

const DEFAULT_DISMISS_MS = 5000;

type Listener = (message: string | null) => void;
const listeners = new Set<Listener>();
let currentMessage: string | null = null;
let dismissTimer: ReturnType<typeof setTimeout> | null = null;

function publish(message: string | null): void {
  currentMessage = message;
  for (const l of listeners) l(message);
}

/** 通知バナーを表示する. 既存のバナーがあれば置き換える. */
export function notifyError(message: string, dismissMs: number = DEFAULT_DISMISS_MS): void {
  if (dismissTimer) clearTimeout(dismissTimer);
  publish(message);
  dismissTimer = setTimeout(() => {
    dismissTimer = null;
    publish(null);
  }, dismissMs);
}

/** 通知バナーをすぐ閉じる. */
export function dismissError(): void {
  if (dismissTimer) {
    clearTimeout(dismissTimer);
    dismissTimer = null;
  }
  publish(null);
}

/** バナー描画用フック. 現在のメッセージ (null なら非表示) を返す. */
export function useErrorNotification(): string | null {
  const [message, setMessage] = useState<string | null>(currentMessage);
  useEffect(() => {
    listeners.add(setMessage);
    return () => {
      listeners.delete(setMessage);
    };
  }, []);
  return message;
}
