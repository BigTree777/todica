/**
 * SwUpdateDialog — Service Worker アップデート確認のモーダルダイアログ.
 *
 * 新しい Service Worker が waiting 状態になったとき, 画面中央のダイアログで
 * 再読み込みを促す.
 *
 * 参照:
 *   - docs/developer/features/sw-update-dialog/spec.md
 *   - docs/developer/features/sw-update-dialog/plan.md
 */
import { useEffect, useRef, useState } from "react";
import "./sw-update-dialog.css";

export function SwUpdateDialog(): JSX.Element {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    void navigator.serviceWorker.ready.then((registration) => {
      if (registration.waiting) {
        setWaitingWorker(registration.waiting);
      }

      registration.addEventListener("updatefound", () => {
        const newWorker = registration.installing;
        if (!newWorker) return;

        newWorker.addEventListener("statechange", () => {
          if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
            setWaitingWorker(newWorker);
          }
        });
      });
    });
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (waitingWorker && !dialog.open) {
      dialog.showModal();
    }
    if (!waitingWorker && dialog.open) {
      dialog.close();
    }
  }, [waitingWorker]);

  const handleReload = () => {
    waitingWorker?.postMessage({ type: "SKIP_WAITING" });
    window.location.reload();
  };

  const handleDismiss = () => {
    setWaitingWorker(null);
  };

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: overlay click はマウス専用. Escape は onCancel で処理する.
    <dialog
      ref={dialogRef}
      className="sw-update-dialog"
      aria-label="アップデート"
      onCancel={handleDismiss}
      onClick={(event) => {
        if (event.target === dialogRef.current) {
          handleDismiss();
        }
      }}
    >
      <p className="sw-update-dialog__message">アップデートがあります。再読み込みしますか？</p>
      <div className="sw-update-dialog__actions">
        <button type="button" className="button button--primary" onClick={handleReload}>
          再読み込み
        </button>
        <button type="button" className="button button--ghost" onClick={handleDismiss}>
          あとで
        </button>
      </div>
    </dialog>
  );
}
