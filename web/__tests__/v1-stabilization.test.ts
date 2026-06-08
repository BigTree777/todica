// @vitest-environment node

/**
 * 受け入れ基準テスト: v1.0.0 安定化 (BL-024)
 *
 * 受け入れ基準の出典:
 *   - docs/developer/features/v1-stabilization/spec.md
 *
 * TDD 原則: 対象ファイルがまだ存在しないため、全テストは失敗する状態で作成する。
 * テストが通る == 各ドキュメントが仕様を満たした状態で作成されている。
 */

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const repoRoot = resolve(__dirname, "../..");

describe("v1.0.0 安定化 (BL-024)", () => {
  // --- シナリオ 1: 要件カバレッジ監査ドキュメントが作成されている ---
  // 対応要件: REQ-001, REQ-002
  // Given: BL-001〜BL-023 の実装が完了している
  // When:  coverage-audit.md を参照する
  // Then:  FR-001〜FR-070 の全件について適合状況が記録されている
  // And:   NFR-001〜NFR-050 の全件について適合状況が記録されている
  // And:   全件で「非適合」の行が存在しない

  it("docs/developer/features/v1-stabilization/coverage-audit.md が存在する", () => {
    expect(
      existsSync(resolve(repoRoot, "docs/developer/features/v1-stabilization/coverage-audit.md"))
    ).toBe(true);
  });

  it("coverage-audit.md に「FR-001」が含まれる（FR-001〜FR-070 の記録）", () => {
    const content = readFileSync(
      resolve(repoRoot, "docs/developer/features/v1-stabilization/coverage-audit.md"),
      "utf-8"
    );
    expect(content).toContain("FR-001");
  });

  it("coverage-audit.md に「FR-070」が含まれる（最後の FR まで記録）", () => {
    const content = readFileSync(
      resolve(repoRoot, "docs/developer/features/v1-stabilization/coverage-audit.md"),
      "utf-8"
    );
    expect(content).toContain("FR-070");
  });

  it("coverage-audit.md に「NFR-001」が含まれる（NFR-001〜NFR-050 の記録）", () => {
    const content = readFileSync(
      resolve(repoRoot, "docs/developer/features/v1-stabilization/coverage-audit.md"),
      "utf-8"
    );
    expect(content).toContain("NFR-001");
  });

  it("coverage-audit.md に「NFR-050」が含まれる（最後の NFR まで記録）", () => {
    const content = readFileSync(
      resolve(repoRoot, "docs/developer/features/v1-stabilization/coverage-audit.md"),
      "utf-8"
    );
    expect(content).toContain("NFR-050");
  });

  it("coverage-audit.md に「非適合」の文字列が含まれない（全件適合 or 対象外のみ）", () => {
    const content = readFileSync(
      resolve(repoRoot, "docs/developer/features/v1-stabilization/coverage-audit.md"),
      "utf-8"
    );
    expect(content).not.toContain("非適合");
  });

  it("coverage-audit.md に FR が 31 件以上記録されている", () => {
    const content = readFileSync(
      resolve(repoRoot, "docs/developer/features/v1-stabilization/coverage-audit.md"),
      "utf-8"
    );
    const frRows = content.split("\n").filter((line) => /\|\s*FR-\d+/.test(line));
    expect(frRows.length).toBeGreaterThanOrEqual(31);
  });

  it("coverage-audit.md に NFR が 12 件以上記録されている", () => {
    const content = readFileSync(
      resolve(repoRoot, "docs/developer/features/v1-stabilization/coverage-audit.md"),
      "utf-8"
    );
    const nfrRows = content.split("\n").filter((line) => /\|\s*NFR-\d+/.test(line));
    expect(nfrRows.length).toBeGreaterThanOrEqual(12);
  });

  // --- シナリオ 2: バックログ全件 Done の確認が記録されている ---
  // 対応要件: REQ-004
  // Given: BL-001〜BL-023 の実装が完了している
  // When:  coverage-audit.md のバックログ整合性セクションを参照する
  // Then:  BL-001〜BL-023 の全 23 件が Done として記録されている
  // And:   BL-024 のみ Todo / Doing のいずれかとして記録されている

  it("coverage-audit.md に「BL-001」が含まれる（BL-001〜023 全件の記録）", () => {
    const content = readFileSync(
      resolve(repoRoot, "docs/developer/features/v1-stabilization/coverage-audit.md"),
      "utf-8"
    );
    expect(content).toContain("BL-001");
  });

  it("coverage-audit.md に「BL-023」が含まれる（BL-001〜023 全件の記録）", () => {
    const content = readFileSync(
      resolve(repoRoot, "docs/developer/features/v1-stabilization/coverage-audit.md"),
      "utf-8"
    );
    expect(content).toContain("BL-023");
  });

  it("coverage-audit.md に「Done」が含まれる（全件 Done の記録）", () => {
    const content = readFileSync(
      resolve(repoRoot, "docs/developer/features/v1-stabilization/coverage-audit.md"),
      "utf-8"
    );
    expect(content).toContain("Done");
  });

  it("coverage-audit.md の BL-024 行が Done になっていない（Doing または Todo として記録）", () => {
    const content = readFileSync(
      resolve(repoRoot, "docs/developer/features/v1-stabilization/coverage-audit.md"),
      "utf-8"
    );
    // BL-024 の行を抽出して Done でないことを確認
    const bl024Line = content.split("\n").find((line) => line.includes("BL-024"));
    expect(bl024Line).toBeDefined();
    expect(bl024Line).not.toMatch(/BL-024.*Done|Done.*BL-024/);
  });

  // --- シナリオ 3: テスト通過記録が存在する ---
  // 対応要件: REQ-003
  // Given: CI またはローカルで全テストを実行する
  // When:  test-results.md を参照する
  // Then:  合計テスト件数（531 件以上）・通過件数・失敗件数・実行日時が記録されている
  // And:   失敗件数が 0 件である

  it("docs/developer/features/v1-stabilization/test-results.md が存在する", () => {
    expect(
      existsSync(resolve(repoRoot, "docs/developer/features/v1-stabilization/test-results.md"))
    ).toBe(true);
  });

  it("test-results.md に 531 以上のテスト件数が含まれる", () => {
    const content = readFileSync(
      resolve(repoRoot, "docs/developer/features/v1-stabilization/test-results.md"),
      "utf-8"
    );
    // 531 以上の数値が含まれることを確認する
    expect(content).toMatch(/53[1-9]|5[4-9]\d|[6-9]\d{2}|\d{4}/);
  });

  it("test-results.md に失敗件数 0 件の記録が含まれる", () => {
    const content = readFileSync(
      resolve(repoRoot, "docs/developer/features/v1-stabilization/test-results.md"),
      "utf-8"
    );
    expect(content).toMatch(/失敗件数.*0|0.*失敗/);
  });

  it("test-results.md に実行日時（2026 年）が含まれる", () => {
    const content = readFileSync(
      resolve(repoRoot, "docs/developer/features/v1-stabilization/test-results.md"),
      "utf-8"
    );
    expect(content).toContain("2026");
  });

  // --- シナリオ 4: GitHub リポジトリ公開準備チェックが完了している ---
  // 対応要件: REQ-005
  // Given: BL-022 が Done である
  // When:  release-checklist.md の「リポジトリ公開準備」セクションを参照する
  // Then:  README.md・LICENSE・CONTRIBUTING.md の存在確認がチェック済みである

  it("docs/developer/features/v1-stabilization/release-checklist.md が存在する", () => {
    expect(
      existsSync(
        resolve(repoRoot, "docs/developer/features/v1-stabilization/release-checklist.md")
      )
    ).toBe(true);
  });

  it("release-checklist.md の README がチェック済み（- [x]）として記録されている", () => {
    const content = readFileSync(
      resolve(repoRoot, "docs/developer/features/v1-stabilization/release-checklist.md"),
      "utf-8"
    );
    expect(content).toMatch(/\[x\].*README|README.*\[x\]/);
  });

  it("release-checklist.md の LICENSE がチェック済み（- [x]）として記録されている", () => {
    const content = readFileSync(
      resolve(repoRoot, "docs/developer/features/v1-stabilization/release-checklist.md"),
      "utf-8"
    );
    expect(content).toMatch(/\[x\].*LICENSE|LICENSE.*\[x\]/);
  });

  it("release-checklist.md の CONTRIBUTING がチェック済み（- [x]）として記録されている", () => {
    const content = readFileSync(
      resolve(repoRoot, "docs/developer/features/v1-stabilization/release-checklist.md"),
      "utf-8"
    );
    expect(content).toMatch(/\[x\].*CONTRIBUTING|CONTRIBUTING.*\[x\]/);
  });

  // --- シナリオ 5: ドッグフーディング確認チェックリストが定義されている ---
  // 対応要件: REQ-006
  // Given: v1.0.0 安定化の作業が完了している
  // When:  release-checklist.md の「ドッグフーディング確認」セクションを参照する
  // Then:  SC-001 に対応する手動確認項目が列挙されている
  // And:   各項目にチェックボックスが設けられている

  it("release-checklist.md に「ドッグフーディング」が含まれる", () => {
    const content = readFileSync(
      resolve(repoRoot, "docs/developer/features/v1-stabilization/release-checklist.md"),
      "utf-8"
    );
    expect(content).toContain("ドッグフーディング");
  });

  it("release-checklist.md に「- [ ]」形式のチェックボックスが含まれる", () => {
    const content = readFileSync(
      resolve(repoRoot, "docs/developer/features/v1-stabilization/release-checklist.md"),
      "utf-8"
    );
    expect(content).toContain("- [ ]");
  });

  // --- シナリオ 6: v1.0.0 リリースゲートが定義されている ---
  // 対応要件: REQ-007
  // Given: release-checklist.md が作成されている
  // When:  「リリースゲート」セクションを参照する
  // Then:  タグを打つための条件（全テスト green・全監査項目チェック済み・auditor 承認）が明示されている

  it("release-checklist.md に「リリースゲート」が含まれる", () => {
    const content = readFileSync(
      resolve(repoRoot, "docs/developer/features/v1-stabilization/release-checklist.md"),
      "utf-8"
    );
    expect(content).toContain("リリースゲート");
  });

  it("release-checklist.md に「v1.0.0」が含まれる", () => {
    const content = readFileSync(
      resolve(repoRoot, "docs/developer/features/v1-stabilization/release-checklist.md"),
      "utf-8"
    );
    expect(content).toContain("v1.0.0");
  });

  it("release-checklist.md に「auditor」または「承認」が含まれる", () => {
    const content = readFileSync(
      resolve(repoRoot, "docs/developer/features/v1-stabilization/release-checklist.md"),
      "utf-8"
    );
    expect(content).toMatch(/auditor|承認/);
  });

  it("release-checklist.md のリリースゲートに「全テスト green」または「失敗件数 0」に相当する文言がある", () => {
    const content = readFileSync(
      resolve(repoRoot, "docs/developer/features/v1-stabilization/release-checklist.md"),
      "utf-8"
    );
    expect(content).toMatch(/全テスト.*green|green.*全テスト|失敗件数.*0|0.*失敗/);
  });
});
