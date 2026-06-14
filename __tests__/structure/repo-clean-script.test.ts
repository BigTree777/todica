import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

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

  it("`clean` script が glob (`-g`) で *.tsbuildinfo を確実に消す", () => {
    expect(pkg.scripts.clean).toMatch(/rimraf\s+-g/);
  });
});

describe("repo clean script 実動作", () => {
  const sentinels = [
    "test-results/_bl089_sentinel.txt",
    "web/dev-dist/_bl089_sentinel.txt",
    ".e2e-data/_bl089_sentinel.txt",
    "__bl089_sentinel.tsbuildinfo",
  ];

  beforeEach(() => {
    for (const rel of sentinels) {
      const abs = resolve(repoRoot, rel);
      mkdirSync(resolve(abs, ".."), { recursive: true });
      writeFileSync(abs, "sentinel");
    }
  });

  afterEach(() => {
    for (const rel of sentinels) {
      const abs = resolve(repoRoot, rel);
      if (existsSync(abs)) rmSync(abs, { force: true });
    }
  });

  it("`npm run clean` が対象 4 種類を実際に削除する", () => {
    for (const rel of sentinels) {
      expect(existsSync(resolve(repoRoot, rel))).toBe(true);
    }
    execSync("npm run clean", { cwd: repoRoot, stdio: "ignore" });
    for (const rel of sentinels) {
      expect(existsSync(resolve(repoRoot, rel))).toBe(false);
    }
  });
});
