import { defineConfig } from "vitest/config";

/**
 * モノレポ全体のテスト設定.
 *
 * - 各ワークスペース (domain / server / web) のテストをまとめて実行する.
 * - web の React コンポーネントテストは jsdom が必要.
 *   ファイル名にマッチするものだけ jsdom 環境に切り替える.
 */
export default defineConfig({
  test: {
    globals: true,
    include: [
      "domain/**/*.test.ts",
      "server/**/*.test.ts",
      "web/**/*.test.ts",
      "web/**/*.test.tsx",
    ],
    environmentMatchGlobs: [
      ["web/**/*.test.tsx", "jsdom"],
      ["web/**/*.test.ts", "jsdom"],
    ],
    environment: "node",
    setupFiles: ["./web/__tests__/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      exclude: ["**/node_modules/**", "**/dist/**", "**/__tests__/**"],
    },
  },
});
