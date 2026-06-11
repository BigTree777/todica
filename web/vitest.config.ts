// `npm test -w web` 単体実行を成立させるための最小設定.
// ルート vitest.config.ts とは独立に動作し, web 配下のテストのみを jsdom 環境で実行する.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "jsdom",
    include: ["**/*.test.ts", "**/*.test.tsx"],
    setupFiles: ["./__tests__/setup.ts"],
  },
});
