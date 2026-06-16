import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

/**
 * モノレポ全体のテスト設定.
 *
 * - 各ワークスペース (domain / server / web) のテストをまとめて実行する.
 * - web の React コンポーネントテストは jsdom が必要.
 *   vitest 4 で `environmentMatchGlobs` が削除されたため `projects` で
 *   node / jsdom の 2 環境に分けて実行する.
 */
const pwaRegisterAlias = {
  // vite-plugin-pwa の仮想モジュール (本番ビルドでのみ生成される) を
  // テスト時は no-op スタブで置き換える.
  "virtual:pwa-register": resolve(__dirname, "web/__tests__/mocks/pwa-register.ts"),
};

export default defineConfig({
  resolve: { alias: pwaRegisterAlias },
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      exclude: ["**/node_modules/**", "**/dist/**", "**/__tests__/**"],
    },
    projects: [
      {
        resolve: { alias: pwaRegisterAlias },
        test: {
          name: "node",
          globals: true,
          environment: "node",
          include: ["domain/**/*.test.ts", "server/**/*.test.ts", "__tests__/**/*.test.ts"],
        },
      },
      {
        resolve: { alias: pwaRegisterAlias },
        test: {
          name: "web",
          globals: true,
          environment: "jsdom",
          setupFiles: ["./web/__tests__/setup.ts"],
          css: true,
          include: ["web/**/*.test.ts", "web/**/*.test.tsx"],
        },
      },
    ],
  },
});
