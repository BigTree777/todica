/**
 * Vitest セットアップ (web ワークスペース向け).
 *
 * - @testing-library/jest-dom のマッチャを expect に登録する.
 * - DOM クリーンアップ (jsdom 環境のみ).
 * - fake-indexeddb: 各テスト前に新しい IDBFactory インスタンスを設定して
 *   テスト間の IndexedDB データ汚染を防ぐ。
 * - HTMLDialogElement polyfill: jsdom は `<dialog>` の showModal / close を
 *   実装していない (jsdom 25/26 ともスタブのみ. https://github.com/jsdom/jsdom/issues/3294).
 *   BL-044 の ProjectCreateDialog 単体テストが開閉同期を検証できるよう,
 *   open 属性の付け外し + close/cancel イベント発火のみの最小 polyfill を入れる。
 *   フォーカストラップ等のネイティブモーダル挙動は Playwright E2E を正とする
 *   (docs/developer/features/inline-project-create/spec.md U-5)。
 */
import "@testing-library/jest-dom/vitest";
import "fake-indexeddb/auto";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach } from "vitest";

if (typeof HTMLDialogElement !== "undefined") {
  const proto = HTMLDialogElement.prototype as HTMLDialogElement & {
    showModal?: () => void;
    show?: () => void;
    close?: (returnValue?: string) => void;
  };
  if (typeof proto.showModal !== "function") {
    proto.showModal = function showModal(this: HTMLDialogElement) {
      this.setAttribute("open", "");
    };
  }
  if (typeof proto.show !== "function") {
    proto.show = function show(this: HTMLDialogElement) {
      this.setAttribute("open", "");
    };
  }
  if (typeof proto.close !== "function") {
    proto.close = function close(this: HTMLDialogElement) {
      if (!this.open) return;
      this.removeAttribute("open");
      this.dispatchEvent(new Event("close"));
    };
  }
}

beforeEach(async () => {
  // fake-indexeddb が利用可能な環境（jsdom）では各テスト前に新しい IDBFactory を使う。
  // これにより offline-queue.test.ts のテスト間でデータが残らない。
  try {
    const { IDBFactory } = await import("fake-indexeddb");
    (globalThis as unknown as Record<string, unknown>).indexedDB = new IDBFactory();
    // offline-queue.ts の DB 接続キャッシュをリセット
    const offlineQueue = await import("../src/offline-queue.js").catch(() => null);
    if (offlineQueue && typeof offlineQueue._resetDbCache === "function") {
      offlineQueue._resetDbCache();
    }
  } catch {
    // fake-indexeddb が利用できない環境では何もしない
  }
});

afterEach(() => {
  cleanup();
});
