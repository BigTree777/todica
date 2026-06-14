import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(__dirname, "../..");

describe("repo clean script", () => {
  const pkg = JSON.parse(readFileSync(resolve(repoRoot, "package.json"), "utf-8")) as {
    scripts: Record<string, string>;
    devDependencies: Record<string, string>;
  };

  it("`clean` script が定義されている", () => {
    expect(pkg.scripts.clean).toBeDefined();
    expect(pkg.scripts.clean).toMatch(/rimraf/);
  });

  it("`clean` script が test-results / web/dev-dist / .e2e-data / *.tsbuildinfo を対象とする", () => {
    expect(pkg.scripts.clean).toMatch(/test-results/);
    expect(pkg.scripts.clean).toMatch(/web\/dev-dist/);
    expect(pkg.scripts.clean).toMatch(/\.e2e-data/);
    expect(pkg.scripts.clean).toMatch(/tsbuildinfo/);
  });

  it("`clean:dist` script が定義されている", () => {
    expect(pkg.scripts["clean:dist"]).toBeDefined();
    expect(pkg.scripts["clean:dist"]).toMatch(/rimraf/);
  });

  it("`clean:dist` script が 3 workspace の dist を消した後 domain を build する", () => {
    const script = pkg.scripts["clean:dist"] ?? "";
    expect(script).toMatch(/domain\/dist/);
    expect(script).toMatch(/server\/dist/);
    expect(script).toMatch(/web\/dist/);
    expect(script).toMatch(/npm run build -w domain/);
  });

  it("rimraf が devDependency に含まれる", () => {
    expect(pkg.devDependencies.rimraf).toBeDefined();
  });
});
