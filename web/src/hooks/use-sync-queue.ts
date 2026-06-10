/**
 * useSyncQueue フック (フェーズ D: Background Sync + オンライン復帰フォールバック)
 *
 * 書込キューを同期するためのフック。
 * - Service Worker からの { type: 'SYNC_QUEUE' } メッセージを受信して flush() を呼ぶ (WQ-005)
 * - window.addEventListener('online', flush) によるフォールバック (WQ-006)
 * - Background Sync 登録 (navigator.serviceWorker.ready) (WQ-005)
 *
 * 仕様:
 *   WQ-005: Background Sync API が利用可能な場合、Service Worker がオンライン復帰イベントを受けてキューを自動再送する。
 *   WQ-006: Background Sync API が利用不可の場合、`online` イベントをトリガーとしてキューを手動再送する。
 */
import { useEffect } from "react";
import { flush } from "../offline-queue.js";

const SYNC_TAG = "todica-write-queue";

export function useSyncQueue(): void {
  useEffect(() => {
    // WQ-006: オンラインイベントによるフォールバック再送
    const handleOnline = () => {
      void flush().catch((err: unknown) => {
        console.error("[useSyncQueue] flush failed on online event:", err);
      });
    };

    window.addEventListener("online", handleOnline);

    // WQ-005: Service Worker からの SYNC_QUEUE メッセージを受信して flush()
    let messageHandler: ((event: MessageEvent) => void) | null = null;
    if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
      messageHandler = (event: MessageEvent) => {
        if (event.data && (event.data as { type?: string }).type === "SYNC_QUEUE") {
          void flush().catch((err: unknown) => {
            console.error("[useSyncQueue] flush failed on SW message:", err);
          });
        }
      };
      navigator.serviceWorker.addEventListener("message", messageHandler);

      // Background Sync 登録
      void navigator.serviceWorker.ready
        .then((registration) => {
          // Background Sync API が利用可能な場合に登録
          const syncManager = (
            registration as ServiceWorkerRegistration & {
              sync?: { register: (tag: string) => Promise<void> };
            }
          ).sync;
          if (syncManager) {
            return syncManager.register(SYNC_TAG);
          }
        })
        .catch((err: unknown) => {
          // Background Sync が利用不可の場合は無視（WQ-006 フォールバックで対応）
          console.warn("[useSyncQueue] Background Sync registration failed:", err);
        });
    }

    return () => {
      window.removeEventListener("online", handleOnline);
      if (messageHandler && typeof navigator !== "undefined" && "serviceWorker" in navigator) {
        navigator.serviceWorker.removeEventListener("message", messageHandler);
      }
    };
  }, []);
}
