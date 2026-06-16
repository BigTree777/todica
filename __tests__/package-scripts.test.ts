import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * BL-107 (ci-automated-gate): ルート `package.json` の `scripts.ci` 検証.
 *
 * spec.md「シナリオ: ローカルでも CI と同じ 4 種を 1 コマンドで再現できる」に対応する.
 * - `scripts.ci` が存在する.
 * - typecheck → lint → vitest → playwright の順に 4 キーワードを含む.
 *   (`&&` 連結で fail-fast にするのが plan.md の方針.)
 */

const repoRoot = resolve(__dirname, "..");
const pkg = JSON.parse(readFileSync(resolve(repoRoot, "package.json"), "utf-8")) as {
  scripts: Record<string, string>;
};

describe("package.json scripts.ci", () => {
  it("`scripts.ci` が定義されている", () => {
    expect(pkg.scripts.ci).toBeDefined();
    expect(typeof pkg.scripts.ci).toBe("string");
    expect(pkg.scripts.ci.length).toBeGreaterThan(0);
  });

  it("typecheck / lint / vitest / playwright のキーワードを順序付きで含む", () => {
    const script = pkg.scripts.ci ?? "";
    // それぞれの最初の出現位置を取り, 厳密な昇順で並ぶことを確認する.
    const idxTypecheck = script.indexOf("typecheck");
    const idxLint = script.indexOf("lint");
    const idxVitest = script.indexOf("vitest");
    const idxPlaywright = script.indexOf("playwright");

    expect(idxTypecheck).toBeGreaterThanOrEqual(0);
    expect(idxLint).toBeGreaterThan(idxTypecheck);
    expect(idxVitest).toBeGreaterThan(idxLint);
    expect(idxPlaywright).toBeGreaterThan(idxVitest);
  });
});
