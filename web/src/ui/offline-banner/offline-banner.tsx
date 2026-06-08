/**
 * OfflineBanner コンポーネント (フェーズ C: オフライン中バナー表示)
 *
 * useNetworkStatus フックを内部で呼び出し、isOnline が false のときに
 * 「オフライン中 - 表示データは最終同期時のものです」バナーを表示する。
 *
 * 仕様:
 *   WQ-004: オフライン時は UI に「オフライン中」を示す表示を出す。
 */
import { useNetworkStatus } from "../../hooks/use-network-status.js";

export function OfflineBanner(): JSX.Element | null {
  const { isOnline } = useNetworkStatus();

  if (isOnline) {
    return null;
  }

  return (
    <div role="alert" aria-live="polite">
      <span>オフライン中 - 表示データは最終同期時のものです</span>
    </div>
  );
}
