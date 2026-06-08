// @vitest-environment node

/**
 * 受け入れ基準テスト: OSS 公開準備 (BL-022)
 *
 * 受け入れ基準の出典:
 *   - docs/developer/features/oss-release-prep/spec.md
 */

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const repoRoot = resolve(__dirname, "../..");

describe("OSS 公開準備 (BL-022)", () => {
  // --- FR-001: LICENSE ファイル ---

  it("LICENSE ファイルがリポジトリルートに存在する", () => {
    expect(existsSync(resolve(repoRoot, "LICENSE"))).toBe(true);
  });

  it('LICENSE ファイルに "MIT License" が含まれる', () => {
    const content = readFileSync(resolve(repoRoot, "LICENSE"), "utf-8");
    expect(content).toContain("MIT License");
  });

  it('LICENSE ファイルに "BigTree777" が含まれる', () => {
    const content = readFileSync(resolve(repoRoot, "LICENSE"), "utf-8");
    expect(content).toContain("BigTree777");
  });

  // --- FR-002: dependency-licenses.md ---

  it("docs/developer/oss/dependency-licenses.md が存在する", () => {
    expect(existsSync(resolve(repoRoot, "docs/developer/oss/dependency-licenses.md"))).toBe(true);
  });

  it('dependency-licenses.md にコピーレフト非互換パッケージなしの確認が記載されている', () => {
    const content = readFileSync(resolve(repoRoot, "docs/developer/oss/dependency-licenses.md"), "utf-8");
    expect(content).toContain("MIT 互換");
  });

  it("dependency-licenses.md に domain workspace セクションが存在する", () => {
    const content = readFileSync(resolve(repoRoot, "docs/developer/oss/dependency-licenses.md"), "utf-8");
    expect(content).toContain("domain workspace");
  });

  it("dependency-licenses.md に server workspace セクションが存在する", () => {
    const content = readFileSync(resolve(repoRoot, "docs/developer/oss/dependency-licenses.md"), "utf-8");
    expect(content).toContain("server workspace");
  });

  it("dependency-licenses.md に web workspace セクションが存在する", () => {
    const content = readFileSync(resolve(repoRoot, "docs/developer/oss/dependency-licenses.md"), "utf-8");
    expect(content).toContain("web workspace");
  });

  // --- FR-003: secret-scan-report.md ---

  it("docs/developer/oss/secret-scan-report.md が存在する", () => {
    expect(existsSync(resolve(repoRoot, "docs/developer/oss/secret-scan-report.md"))).toBe(true);
  });

  it('secret-scan-report.md に秘密情報スキャン結果が記載されている', () => {
    const content = readFileSync(resolve(repoRoot, "docs/developer/oss/secret-scan-report.md"), "utf-8");
    expect(content).toMatch(/秘密情報|secret/i);
  });

  it("secret-scan-report.md に調査手順が記載されている", () => {
    const content = readFileSync(resolve(repoRoot, "docs/developer/oss/secret-scan-report.md"), "utf-8");
    expect(content).toMatch(/調査手順|grep|git-secrets/);
  });

  it("secret-scan-report.md に調査範囲が記載されている", () => {
    const content = readFileSync(resolve(repoRoot, "docs/developer/oss/secret-scan-report.md"), "utf-8");
    expect(content).toMatch(/調査対象|調査範囲/);
  });

  it("secret-scan-report.md に調査日時が記載されている", () => {
    const content = readFileSync(resolve(repoRoot, "docs/developer/oss/secret-scan-report.md"), "utf-8");
    expect(content).toContain("調査日時");
  });

  // --- FR-004: README.md の整備 ---

  it('README.md に "MIT" の文字列が含まれる', () => {
    const content = readFileSync(resolve(repoRoot, "README.md"), "utf-8");
    expect(content).toContain("MIT");
  });

  it('README.md に "TODO:" のプレースホルダーが含まれない', () => {
    const content = readFileSync(resolve(repoRoot, "README.md"), "utf-8");
    expect(content).not.toContain("TODO:");
  });

  it("README.md にセットアップ手順（npm install）が含まれる", () => {
    const content = readFileSync(resolve(repoRoot, "README.md"), "utf-8");
    expect(content).toContain("npm install");
  });

  it("README.md にサーバ起動方法が含まれる", () => {
    const content = readFileSync(resolve(repoRoot, "README.md"), "utf-8");
    expect(content).toMatch(/AUTH_TOKEN|サーバ.*起動|起動.*サーバ/);
  });

  it("README.md に Web ビルド方法が含まれる", () => {
    const content = readFileSync(resolve(repoRoot, "README.md"), "utf-8");
    expect(content).toContain("build");
  });

  it("README.md に Android ビルド方法が含まれる", () => {
    const content = readFileSync(resolve(repoRoot, "README.md"), "utf-8");
    expect(content).toMatch(/android|Android/);
  });

  // --- FR-005: package.json フィールド ---

  it('ルート package.json の license フィールドが "MIT" である', () => {
    const pkg = JSON.parse(readFileSync(resolve(repoRoot, "package.json"), "utf-8"));
    expect(pkg.license).toBe("MIT");
  });

  it('ルート package.json に author フィールドが存在する', () => {
    const pkg = JSON.parse(readFileSync(resolve(repoRoot, "package.json"), "utf-8"));
    expect(pkg.author).toBeTruthy();
  });

  it('ルート package.json に repository フィールドが存在する', () => {
    const pkg = JSON.parse(readFileSync(resolve(repoRoot, "package.json"), "utf-8"));
    expect(pkg.repository).toBeTruthy();
  });

  it('domain/package.json の license フィールドが "MIT" である', () => {
    const pkg = JSON.parse(readFileSync(resolve(repoRoot, "domain/package.json"), "utf-8"));
    expect(pkg.license).toBe("MIT");
  });

  it('domain/package.json に author フィールドが存在する', () => {
    const pkg = JSON.parse(readFileSync(resolve(repoRoot, "domain/package.json"), "utf-8"));
    expect(pkg.author).toBeTruthy();
  });

  it('domain/package.json に repository フィールドが存在する', () => {
    const pkg = JSON.parse(readFileSync(resolve(repoRoot, "domain/package.json"), "utf-8"));
    expect(pkg.repository).toBeTruthy();
  });

  it('server/package.json の license フィールドが "MIT" である', () => {
    const pkg = JSON.parse(readFileSync(resolve(repoRoot, "server/package.json"), "utf-8"));
    expect(pkg.license).toBe("MIT");
  });

  it('server/package.json に author フィールドが存在する', () => {
    const pkg = JSON.parse(readFileSync(resolve(repoRoot, "server/package.json"), "utf-8"));
    expect(pkg.author).toBeTruthy();
  });

  it('server/package.json に repository フィールドが存在する', () => {
    const pkg = JSON.parse(readFileSync(resolve(repoRoot, "server/package.json"), "utf-8"));
    expect(pkg.repository).toBeTruthy();
  });

  it('web/package.json の license フィールドが "MIT" である', () => {
    const pkg = JSON.parse(readFileSync(resolve(repoRoot, "web/package.json"), "utf-8"));
    expect(pkg.license).toBe("MIT");
  });

  it('web/package.json に author フィールドが存在する', () => {
    const pkg = JSON.parse(readFileSync(resolve(repoRoot, "web/package.json"), "utf-8"));
    expect(pkg.author).toBeTruthy();
  });

  it('web/package.json に repository フィールドが存在する', () => {
    const pkg = JSON.parse(readFileSync(resolve(repoRoot, "web/package.json"), "utf-8"));
    expect(pkg.repository).toBeTruthy();
  });

  // --- FR-006: CONTRIBUTING.md ---

  it("CONTRIBUTING.md がリポジトリルートに存在する", () => {
    expect(existsSync(resolve(repoRoot, "CONTRIBUTING.md"))).toBe(true);
  });

  it("CONTRIBUTING.md に Conventional Commits への言及がある", () => {
    const content = readFileSync(resolve(repoRoot, "CONTRIBUTING.md"), "utf-8");
    expect(content).toContain("Conventional Commits");
  });

  it("CONTRIBUTING.md に GitHub Flow への言及がある", () => {
    const content = readFileSync(resolve(repoRoot, "CONTRIBUTING.md"), "utf-8");
    expect(content).toMatch(/GitHub Flow|GitHub flow/);
  });

  it("CONTRIBUTING.md に PR チェックリストが含まれる", () => {
    const content = readFileSync(resolve(repoRoot, "CONTRIBUTING.md"), "utf-8");
    expect(content).toMatch(/チェックリスト|checklist|\[ \]/i);
  });
});
