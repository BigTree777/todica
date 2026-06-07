/**
 * Vitest セットアップ (web ワークスペース向け).
 *
 * - @testing-library/jest-dom のマッチャを expect に登録する.
 * - DOM クリーンアップ (jsdom 環境のみ).
 */
import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
});
