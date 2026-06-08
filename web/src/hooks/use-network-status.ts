/**
 * useNetworkStatus フック (フェーズ C: オフライン状態監視)
 *
 * navigator.onLine を初期値とし、`online` / `offline` イベントで
 * isOnline 状態を更新する。
 *
 * 仕様:
 *   WQ-004: オフライン時は UI に「オフライン中」を示す表示を出す。
 */
import { useEffect, useState } from "react";

export interface NetworkStatus {
  isOnline: boolean;
}

export function useNetworkStatus(): NetworkStatus {
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return { isOnline };
}
