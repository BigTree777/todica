/**
 * PwaUpdateBanner コンポーネント (フェーズ A: Service Worker 更新通知)
 *
 * 新しい Service Worker がインストールされた際に「アップデートがあります。再読み込みしますか？」
 * の通知バナーを表示する。
 *
 * 仕様:
 *   SW-001: 新しい Service Worker がインストールされた際、ユーザーに「アップデートがあります。再読み込みしますか？」を通知する。
 */
import { useEffect, useState } from "react";

export function PwaUpdateBanner(): JSX.Element | null {
  const [showUpdateBanner, setShowUpdateBanner] = useState(false);
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    // Service Worker の更新を検出する
    void navigator.serviceWorker.ready.then((registration) => {
      // 既に waiting 中の SW がいれば通知
      if (registration.waiting) {
        setWaitingWorker(registration.waiting);
        setShowUpdateBanner(true);
      }

      // 新しい SW がインストールされたらバナーを表示
      registration.addEventListener("updatefound", () => {
        const newWorker = registration.installing;
        if (!newWorker) return;

        newWorker.addEventListener("statechange", () => {
          if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
            setWaitingWorker(newWorker);
            setShowUpdateBanner(true);
          }
        });
      });
    });
  }, []);

  const handleReload = () => {
    if (waitingWorker) {
      waitingWorker.postMessage({ type: "SKIP_WAITING" });
    }
    window.location.reload();
  };

  if (!showUpdateBanner) {
    return null;
  }

  return (
    <div role="alert" aria-live="polite">
      <span>アップデートがあります。再読み込みしますか？</span>
      <button type="button" className="button button--primary" onClick={handleReload}>
        再読み込み
      </button>
      <button
        type="button"
        className="button button--ghost"
        onClick={() => setShowUpdateBanner(false)}
      >
        閉じる
      </button>
    </div>
  );
}
