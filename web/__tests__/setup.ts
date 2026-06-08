/**
 * Vitest セットアップ (web ワークスペース向け).
 *
 * - @testing-library/jest-dom のマッチャを expect に登録する.
 * - DOM クリーンアップ (jsdom 環境のみ).
 * - fake-indexeddb: 各テスト前に新しい IDBFactory インスタンスを設定して
 *   テスト間の IndexedDB データ汚染を防ぐ。
 */
import "@testing-library/jest-dom/vitest";
import "fake-indexeddb/auto";
import { afterEach, beforeEach } from "vitest";
import { cleanup } from "@testing-library/react";

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
