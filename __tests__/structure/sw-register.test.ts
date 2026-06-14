import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(__dirname, "../..");

describe("SW 登録 (BL-096)", () => {
  const main = readFileSync(resolve(repoRoot, "web/src/main.tsx"), "utf-8");

  it("main.tsx が virtual:pwa-register から registerSW を import している", () => {
    expect(main).toMatch(/import\s+\{\s*registerSW\s*\}\s+from\s+"virtual:pwa-register"/);
  });

  it("main.tsx で registerSW() が呼ばれている", () => {
    expect(main).toMatch(/registerSW\s*\(/);
  });

  it("vite-env.d.ts が vite-plugin-pwa/client 型参照を含む", () => {
    const env = readFileSync(resolve(repoRoot, "web/src/vite-env.d.ts"), "utf-8");
    expect(env).toMatch(/vite-plugin-pwa\/client/);
  });

  it("vitest.config.ts に virtual:pwa-register の alias がある", () => {
    const config = readFileSync(resolve(repoRoot, "vitest.config.ts"), "utf-8");
    expect(config).toMatch(/virtual:pwa-register/);
  });
});
