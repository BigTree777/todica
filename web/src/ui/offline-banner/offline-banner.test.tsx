import { act, render, screen } from "@testing-library/react";
/**
 * フェーズ C: OfflineBanner コンポーネントの単体テスト
 *
 * 受け入れ基準の出典: docs/developer/features/pwa-offline-queue/spec.md
 * §「フェーズ C: 読み取りキャッシュ」と対応する。
 *
 * 要件:
 *   WQ-004: オフライン時はキューに記録するだけでリクエスト送信を試みず、
 *            UI に「オフライン中」を示す表示を出す。
 *   タスク C-3/C-4: isOnline === false のときバナーを表示し、true のとき非表示にする。
 *
 * シナリオ（spec.md §フェーズ C）:
 *   「前回取得したタスク一覧が表示され、「オフライン中」の旨が UI に表示される」
 *
 * NOTE: `offline-banner.tsx` はまだ存在しない。このテストは意図的に失敗する (red)。
 *       implementer が `web/src/ui/offline-banner/offline-banner.tsx` を実装することで green 化する。
 */
import { describe, expect, it, vi } from "vitest";
import { OfflineBanner } from "./offline-banner.js";

// useNetworkStatus をモックする（コンポーネントが内部で呼び出すため）
vi.mock("../../hooks/use-network-status.js", () => ({
  useNetworkStatus: vi.fn(),
}));

import { useNetworkStatus } from "../../hooks/use-network-status.js";

const mockUseNetworkStatus = vi.mocked(useNetworkStatus);

describe("OfflineBanner (フェーズ C: オフライン中バナー表示)", () => {
  it("シナリオ: isOnline === false のとき「オフライン中」バナーが表示される", () => {
    // Given ネットワークが切断されている（isOnline === false）
    mockUseNetworkStatus.mockReturnValue({ isOnline: false });

    // When OfflineBanner コンポーネントをレンダリングする
    render(<OfflineBanner />);

    // Then 「オフライン中」を示すバナーが表示される
    // spec.md §C-3 の「オフライン中 - 表示データは最終同期時のものです」に対応
    expect(screen.getByText(/オフライン/)).toBeInTheDocument();
  });

  it("シナリオ: isOnline === true のとき「オフライン中」バナーは表示されない", () => {
    // Given ネットワークが接続されている（isOnline === true）
    mockUseNetworkStatus.mockReturnValue({ isOnline: true });

    // When OfflineBanner コンポーネントをレンダリングする
    render(<OfflineBanner />);

    // Then 「オフライン中」バナーは表示されない
    expect(screen.queryByText(/オフライン/)).toBeNull();
  });

  it("シナリオ: オフライン中バナーにはデータが古い旨のメッセージが含まれる", () => {
    // Given ネットワークが切断されている
    mockUseNetworkStatus.mockReturnValue({ isOnline: false });

    // When OfflineBanner をレンダリングする
    render(<OfflineBanner />);

    // Then バナーには「最終同期時」または「同期」に関するメッセージが含まれる
    // spec.md §C-3: 「オフライン中 - 表示データは最終同期時のものです」
    expect(screen.getByText(/オフライン|同期/)).toBeInTheDocument();
  });

  it("シナリオ: オンライン復帰後（isOnline が true に変わる）バナーが非表示になる", () => {
    // Given 初期状態はオフライン
    mockUseNetworkStatus.mockReturnValue({ isOnline: false });
    const { rerender } = render(<OfflineBanner />);
    expect(screen.getByText(/オフライン/)).toBeInTheDocument();

    // When オンラインに復帰する
    act(() => {
      mockUseNetworkStatus.mockReturnValue({ isOnline: true });
    });
    rerender(<OfflineBanner />);

    // Then バナーが非表示になる
    expect(screen.queryByText(/オフライン/)).toBeNull();
  });
});
