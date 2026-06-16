import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * BL-107 (ci-automated-gate): `.github/pull_request_template.md` の文言検証.
 *
 * spec.md「シナリオ: PR テンプレートが自動ゲート前提に揃っている」に対応する.
 * - 「テストがすべて green」を手で押すチェック行を撤去する.
 * - CI ゲート (typecheck / lint / vitest / playwright) を前提とする文言に揃える.
 */

const repoRoot = resolve(__dirname, "..");
const templatePath = resolve(repoRoot, ".github/pull_request_template.md");

describe("pull request template (.github/pull_request_template.md)", () => {
  it("ファイルが存在する", () => {
    expect(existsSync(templatePath)).toBe(true);
  });

  const text = existsSync(templatePath) ? readFileSync(templatePath, "utf-8") : "";

  it("「テストがすべて green」を含む行が存在しない", () => {
    const lines = text.split(/\r?\n/);
    const hits = lines.filter((line) => line.includes("テストがすべて green"));
    expect(hits).toEqual([]);
  });

  it("「CI ゲート」というキーワードを含む", () => {
    expect(text).toContain("CI ゲート");
  });

  it("CI ゲート 4 job のキーワード (typecheck / lint / vitest / playwright) をすべて含む", () => {
    expect(text).toMatch(/typecheck/);
    expect(text).toMatch(/lint/);
    expect(text).toMatch(/vitest/);
    expect(text).toMatch(/playwright/);
  });
});
