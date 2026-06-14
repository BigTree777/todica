import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

/**
 * モノレポ全体のテスト設定.
 *
 * - 各ワークスペース (domain / server / web) のテストをまとめて実行する.
 * - web の React コンポーネントテストは jsdom が必要.
 *   ファイル名にマッチするものだけ jsdom 環境に切り替える.
 */
export default defineConfig({
  resolve: {
    alias: {
      // vite-plugin-pwa の仮想モジュール (本番ビルドでのみ生成される) を
      // テスト時は no-op スタブで置き換える.
      "virtual:pwa-register": resolve(__dirname, "web/__tests__/mocks/pwa-register.ts"),
    },
  },
  test: {
    globals: true,
    include: [
      "domain/**/*.test.ts",
      "server/**/*.test.ts",
      "web/**/*.test.ts",
      "web/**/*.test.tsx",
      "__tests__/**/*.test.ts",
    ],
    environmentMatchGlobs: [
      ["web/**/*.test.tsx", "jsdom"],
      ["web/**/*.test.ts", "jsdom"],
    ],
    environment: "node",
    setupFiles: ["./web/__tests__/setup.ts"],
    css: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      exclude: ["**/node_modules/**", "**/dist/**", "**/__tests__/**"],
    },
  },
});
