import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * BL-107 (ci-automated-gate): `.github/workflows/ci.yml` の構造検証.
 *
 * spec.md の受け入れ基準のうち,
 * - PR と main への push で 4 job が起動すること
 * - job 名が `typecheck` / `lint` / `vitest` / `playwright` に固定されていること
 * - 各 job が想定コマンドを実行すること
 * - `concurrency` で同一 PR の古い実行をキャンセルすること
 * - Node が `'24'` で固定されること
 * - Playwright 失敗時のみ artifact が upload されること
 * を文字列マッチで縛る. YAML パーサ依存は plan.md の方針どおり持ち込まない.
 */

const repoRoot = resolve(__dirname, "..");
const workflowPath = resolve(repoRoot, ".github/workflows/ci.yml");

describe("ci workflow (.github/workflows/ci.yml)", () => {
  it("ファイルが存在する", () => {
    expect(existsSync(workflowPath)).toBe(true);
  });

  // 以降のテストはファイルがある前提で文字列を読み込む.
  // ファイルが無い場合は空文字を渡し, それぞれの assert で失敗させる.
  const yaml = existsSync(workflowPath) ? readFileSync(workflowPath, "utf-8") : "";

  it("`jobs.typecheck` が定義されている", () => {
    expect(yaml).toMatch(/^\s{2}typecheck\s*:/m);
  });

  it("`jobs.lint` が定義されている", () => {
    expect(yaml).toMatch(/^\s{2}lint\s*:/m);
  });

  it("`jobs.vitest` が定義されている", () => {
    expect(yaml).toMatch(/^\s{2}vitest\s*:/m);
  });

  it("`jobs.playwright` が定義されている", () => {
    expect(yaml).toMatch(/^\s{2}playwright\s*:/m);
  });

  it("typecheck job のステップに `npm run typecheck` が含まれる", () => {
    expect(yaml).toMatch(/npm run typecheck/);
  });

  it("lint job のステップに `npm run lint` が含まれる", () => {
    expect(yaml).toMatch(/npm run lint/);
  });

  it("vitest job のステップに `npx vitest run` が含まれる", () => {
    expect(yaml).toMatch(/npx vitest run/);
  });

  it("playwright job のステップに `npx playwright install --with-deps chromium` が含まれる", () => {
    expect(yaml).toMatch(/npx playwright install --with-deps chromium/);
  });

  it("playwright job のステップに `npx playwright test` が含まれる", () => {
    expect(yaml).toMatch(/npx playwright test/);
  });

  it("`on:` に `pull_request` トリガが含まれる", () => {
    expect(yaml).toMatch(/^\s*pull_request\s*:/m);
  });

  it("`on:` に `push` トリガが含まれ, branches に `main` を持つ", () => {
    expect(yaml).toMatch(/^\s*push\s*:/m);
    // `push:` ブロック近傍に `branches` と `main` が現れることを緩く確認.
    expect(yaml).toMatch(/push\s*:[\s\S]{0,200}branches\s*:[\s\S]{0,200}main/);
  });

  it("`concurrency:` ブロックが宣言されている", () => {
    expect(yaml).toMatch(/^concurrency\s*:/m);
  });

  it("`concurrency` で `cancel-in-progress: true` が指定されている", () => {
    expect(yaml).toMatch(/cancel-in-progress\s*:\s*true/);
  });

  it("`actions/setup-node@v4` を利用している", () => {
    expect(yaml).toMatch(/actions\/setup-node@v4/);
  });

  it("`actions/setup-node@v4` の `node-version` が `'24'` で始まる文字列である", () => {
    // `node-version: '24'` または `node-version: '24.x'` のような形式を許容.
    expect(yaml).toMatch(/node-version\s*:\s*['"]24/);
  });

  it("playwright job が `actions/upload-artifact@v4` を `if: failure()` ガード下に持つ", () => {
    // 失敗時のみ artifact upload する step を 1 つ以上含む.
    // step 単位を厳密にパースせず, `if: failure()` 行と `actions/upload-artifact@v4` 行が
    // 近接して現れることで判定する.
    const failureUploadPattern =
      /if\s*:\s*failure\(\)[\s\S]{0,400}actions\/upload-artifact@v4|actions\/upload-artifact@v4[\s\S]{0,400}if\s*:\s*failure\(\)/;
    expect(yaml).toMatch(failureUploadPattern);
  });
});
