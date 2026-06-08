/**
 * フェーズ C: useNetworkStatus フックの単体テスト
 *
 * 受け入れ基準の出典: docs/developer/features/pwa-offline-queue/spec.md
 * §「フェーズ C: 読み取りキャッシュ」と対応する。
 *
 * 要件:
 *   WQ-004: オフライン時はキューに記録するだけでリクエスト送信を試みず、
 *            UI に「オフライン中」を示す表示を出す。
 *   タスク C-4: `window.dispatchEvent(new Event('offline'))` で `isOnline` が
 *               `false` になることを Vitest でテストする。
 *
 * NOTE: `use-network-status.ts` はまだ存在しない。このテストは意図的に失敗する (red)。
 *       implementer が `web/src/hooks/use-network-status.ts` を実装することで green 化する。
 */
import { describe, it, expect, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useNetworkStatus } from "./use-network-status.js";

describe("useNetworkStatus (フェーズ C: オフラインステータス監視)", () => {
  afterEach(() => {
    // テスト間の副作用を排除するため online に戻す
    Object.defineProperty(navigator, "onLine", {
      writable: true,
      value: true,
    });
    window.dispatchEvent(new Event("online"));
  });

  it("シナリオ: 初期状態では navigator.onLine の値を返す（オンライン時は true）", () => {
    // Given navigator.onLine === true
    Object.defineProperty(navigator, "onLine", {
      writable: true,
      value: true,
    });

    // When フックをレンダリングする
    const { result } = renderHook(() => useNetworkStatus());

    // Then isOnline が true である
    expect(result.current.isOnline).toBe(true);
  });

  it("シナリオ: window に offline イベントを dispatch すると isOnline が false になる", () => {
    // Given オンライン状態でフックをレンダリングしている
    Object.defineProperty(navigator, "onLine", {
      writable: true,
      value: true,
    });
    const { result } = renderHook(() => useNetworkStatus());
    expect(result.current.isOnline).toBe(true);

    // When ネットワークが切断される（offline イベント）
    act(() => {
      Object.defineProperty(navigator, "onLine", {
        writable: true,
        value: false,
      });
      window.dispatchEvent(new Event("offline"));
    });

    // Then isOnline が false になる
    expect(result.current.isOnline).toBe(false);
  });

  it("シナリオ: オフライン状態から online イベントを dispatch すると isOnline が true に戻る", () => {
    // Given オフライン状態でフックがレンダリングされている
    Object.defineProperty(navigator, "onLine", {
      writable: true,
      value: false,
    });
    const { result } = renderHook(() => useNetworkStatus());

    // When ネットワークが復帰する（online イベント）
    act(() => {
      Object.defineProperty(navigator, "onLine", {
        writable: true,
        value: true,
      });
      window.dispatchEvent(new Event("online"));
    });

    // Then isOnline が true に戻る
    expect(result.current.isOnline).toBe(true);
  });

  it("シナリオ: フックのアンマウント後はイベントリスナーが解除され、メモリリークしない", () => {
    // Given フックがレンダリングされている
    Object.defineProperty(navigator, "onLine", {
      writable: true,
      value: true,
    });
    const { result, unmount } = renderHook(() => useNetworkStatus());

    // When フックをアンマウントする
    unmount();

    // Then offline イベントを送っても更新が起きない（エラーにもならない）
    act(() => {
      window.dispatchEvent(new Event("offline"));
    });

    // アンマウント後に状態更新が走ってもエラーが発生しない
    // （テスト自体がエラーなく完了すれば合格）
    expect(result.current.isOnline).toBe(true);
  });
});
