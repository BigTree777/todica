// @vitest-environment node

/**
 * 受け入れ基準テスト: Google Play Store 公開対応 (BL-023)
 *
 * 受け入れ基準の出典:
 *   - docs/developer/features/play-store-release/spec.md
 *
 * TDD 原則: 対象ファイルがまだ存在しないため、全テストは失敗する状態で作成する。
 * テストが通る == 各ドキュメントが仕様を満たした状態で作成されている。
 */

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const repoRoot = resolve(__dirname, "../..");

describe("Google Play Store 公開対応 (BL-023)", () => {
  // --- シナリオ 1: プライバシーポリシーファイルが作成されている ---
  // 対応要件: FR-001
  // Given: リポジトリの docs/privacy-policy.md を確認する

  it("docs/privacy-policy.md が存在する", () => {
    expect(existsSync(resolve(repoRoot, "docs/privacy-policy.md"))).toBe(true);
  });

  it("プライバシーポリシーに収集するデータの種類に関する記述がある", () => {
    const content = readFileSync(resolve(repoRoot, "docs/privacy-policy.md"), "utf-8");
    expect(content).toContain("収集");
  });

  it("プライバシーポリシーに第三者へのデータ送信をしない旨が明記されている", () => {
    const content = readFileSync(resolve(repoRoot, "docs/privacy-policy.md"), "utf-8");
    expect(content).toContain("第三者");
  });

  it("プライバシーポリシーにデータの保存場所が明記されている", () => {
    const content = readFileSync(resolve(repoRoot, "docs/privacy-policy.md"), "utf-8");
    expect(content).toContain("保存");
  });

  it("プライバシーポリシーに連絡先情報が記載されている", () => {
    const content = readFileSync(resolve(repoRoot, "docs/privacy-policy.md"), "utf-8");
    expect(content).toContain("連絡先");
  });

  it("プライバシーポリシーに最終更新日が記載されている", () => {
    const content = readFileSync(resolve(repoRoot, "docs/privacy-policy.md"), "utf-8");
    expect(content).toContain("最終更新");
  });

  // --- シナリオ 2: プライバシーポリシーの公開 URL が文書化されている ---
  // 対応要件: FR-002
  // Given: docs/developer/features/play-store-release/store-listing.md が存在する

  it("docs/developer/features/play-store-release/store-listing.md が存在する", () => {
    expect(
      existsSync(resolve(repoRoot, "docs/developer/features/play-store-release/store-listing.md"))
    ).toBe(true);
  });

  it("store-listing.md にプライバシーポリシー URL の項目がある", () => {
    const content = readFileSync(
      resolve(repoRoot, "docs/developer/features/play-store-release/store-listing.md"),
      "utf-8"
    );
    expect(content).toContain("プライバシーポリシー URL");
  });

  it('store-listing.md のプライバシーポリシー URL が "https://bigtree777.github.io/todica/privacy-policy" と一致する', () => {
    const content = readFileSync(
      resolve(repoRoot, "docs/developer/features/play-store-release/store-listing.md"),
      "utf-8"
    );
    expect(content).toContain("https://bigtree777.github.io/todica/privacy-policy");
  });

  // --- シナリオ 3: データセーフティ情報が記録されている ---
  // 対応要件: FR-003
  // Given: docs/developer/features/play-store-release/data-safety.md が存在する

  it("docs/developer/features/play-store-release/data-safety.md が存在する", () => {
    expect(
      existsSync(resolve(repoRoot, "docs/developer/features/play-store-release/data-safety.md"))
    ).toBe(true);
  });

  it("data-safety.md に収集するデータの種類の項目がある", () => {
    const content = readFileSync(
      resolve(repoRoot, "docs/developer/features/play-store-release/data-safety.md"),
      "utf-8"
    );
    expect(content).toContain("収集");
  });

  it("data-safety.md に共有するデータの項目がある", () => {
    const content = readFileSync(
      resolve(repoRoot, "docs/developer/features/play-store-release/data-safety.md"),
      "utf-8"
    );
    expect(content).toContain("共有");
  });

  it("data-safety.md にデータの暗号化に関する記述がある", () => {
    const content = readFileSync(
      resolve(repoRoot, "docs/developer/features/play-store-release/data-safety.md"),
      "utf-8"
    );
    expect(content).toContain("暗号化");
  });

  it("data-safety.md に削除リクエストへの対応方法が記載されている", () => {
    const content = readFileSync(
      resolve(repoRoot, "docs/developer/features/play-store-release/data-safety.md"),
      "utf-8"
    );
    expect(content).toContain("削除");
  });

  it("data-safety.md に独立監査の有無が記載されている", () => {
    const content = readFileSync(
      resolve(repoRoot, "docs/developer/features/play-store-release/data-safety.md"),
      "utf-8"
    );
    expect(content).toContain("独立監査");
  });

  // --- シナリオ 4: ストア掲載情報が定義されている ---
  // 対応要件: FR-004
  // Given: store-listing.md が存在する（シナリオ 2 で確認済み）

  it("store-listing.md にアプリ名が定義されている", () => {
    const content = readFileSync(
      resolve(repoRoot, "docs/developer/features/play-store-release/store-listing.md"),
      "utf-8"
    );
    expect(content).toContain("アプリ名");
  });

  it("store-listing.md のアプリ名の実際の値が 30 文字以内である", () => {
    const content = readFileSync(
      resolve(repoRoot, "docs/developer/features/play-store-release/store-listing.md"),
      "utf-8"
    );
    // 「アプリ名」行から値を抽出して文字数を検証する
    // 例: "アプリ名: Todica" や "| アプリ名 | Todica |" のような記述を想定
    const match = content.match(/アプリ名[^\n]*[:：|]\s*([^\n|]+)/);
    expect(match).not.toBeNull();
    const appName = match![1].trim();
    expect(appName.length).toBeLessThanOrEqual(30);
  });

  it("store-listing.md に短い説明文が定義されている（80 文字以内）", () => {
    const content = readFileSync(
      resolve(repoRoot, "docs/developer/features/play-store-release/store-listing.md"),
      "utf-8"
    );
    expect(content).toContain("短い説明");
  });

  it("store-listing.md の短い説明文が実際に 80 文字以内である", () => {
    const content = readFileSync(
      resolve(repoRoot, "docs/developer/features/play-store-release/store-listing.md"),
      "utf-8"
    );
    // 「## 短い説明」セクションの直後の非空行をキャッチ
    const match = content.match(/##\s*短い説明\s*\n\n([^\n（]+)/);
    expect(match).not.toBeNull();
    const shortDesc = match![1].trim();
    expect(shortDesc.length).toBeLessThanOrEqual(80);
  });

  it("store-listing.md にタグが定義されている", () => {
    const content = readFileSync(
      resolve(repoRoot, "docs/developer/features/play-store-release/store-listing.md"),
      "utf-8"
    );
    expect(content).toContain("タグ");
  });

  it("store-listing.md に詳細説明文が定義されている", () => {
    const content = readFileSync(
      resolve(repoRoot, "docs/developer/features/play-store-release/store-listing.md"),
      "utf-8"
    );
    expect(content).toContain("詳細説明");
  });

  it("store-listing.md にカテゴリが定義されている", () => {
    const content = readFileSync(
      resolve(repoRoot, "docs/developer/features/play-store-release/store-listing.md"),
      "utf-8"
    );
    expect(content).toContain("カテゴリ");
  });

  it("store-listing.md に連絡先メールアドレスが記載されている", () => {
    const content = readFileSync(
      resolve(repoRoot, "docs/developer/features/play-store-release/store-listing.md"),
      "utf-8"
    );
    expect(content).toMatch(/@/);
  });

  // --- シナリオ 5: スクリーンショット要件が定義されている ---
  // 対応要件: FR-005
  // Given: store-listing.md を読む

  it("store-listing.md にスクリーンショットのセクションがある", () => {
    const content = readFileSync(
      resolve(repoRoot, "docs/developer/features/play-store-release/store-listing.md"),
      "utf-8"
    );
    expect(content).toContain("スクリーンショット");
  });

  it("store-listing.md にフィーチャーグラフィックの 1024 × 500 のサイズ要件がある", () => {
    const content = readFileSync(
      resolve(repoRoot, "docs/developer/features/play-store-release/store-listing.md"),
      "utf-8"
    );
    expect(content).toContain("1024");
  });

  it("store-listing.md にアイコンの 512 × 512 のサイズ要件がある", () => {
    const content = readFileSync(
      resolve(repoRoot, "docs/developer/features/play-store-release/store-listing.md"),
      "utf-8"
    );
    expect(content).toContain("512");
  });

  it("store-listing.md にキャプチャすべき画面の一覧がある（今日ビューを含む）", () => {
    const content = readFileSync(
      resolve(repoRoot, "docs/developer/features/play-store-release/store-listing.md"),
      "utf-8"
    );
    expect(content).toContain("今日ビュー");
  });

  it("store-listing.md にスクリーンショットの枚数要件（最低 2 枚）が記載されている", () => {
    const content = readFileSync(
      resolve(repoRoot, "docs/developer/features/play-store-release/store-listing.md"),
      "utf-8"
    );
    expect(content).toMatch(/最低\s*2\s*枚|2\s*枚以上/);
  });

  // --- シナリオ 6: ポリシー適合確認チェックリストが作成されている ---
  // 対応要件: FR-006
  // Given: docs/developer/features/play-store-release/policy-checklist.md が存在する

  it("docs/developer/features/play-store-release/policy-checklist.md が存在する", () => {
    expect(
      existsSync(
        resolve(repoRoot, "docs/developer/features/play-store-release/policy-checklist.md")
      )
    ).toBe(true);
  });

  it("policy-checklist.md にターゲット API レベルの確認項目がある", () => {
    const content = readFileSync(
      resolve(repoRoot, "docs/developer/features/play-store-release/policy-checklist.md"),
      "utf-8"
    );
    expect(content).toMatch(/targetSdkVersion|ターゲット API/);
  });

  it("policy-checklist.md に IARC コンテンツレーティングの確認項目がある", () => {
    const content = readFileSync(
      resolve(repoRoot, "docs/developer/features/play-store-release/policy-checklist.md"),
      "utf-8"
    );
    expect(content).toContain("IARC");
  });

  it("policy-checklist.md にパーミッション宣言の確認項目がある", () => {
    const content = readFileSync(
      resolve(repoRoot, "docs/developer/features/play-store-release/policy-checklist.md"),
      "utf-8"
    );
    expect(content).toContain("パーミッション");
  });

  it("policy-checklist.md にプライバシーポリシーの確認項目がある", () => {
    const content = readFileSync(
      resolve(repoRoot, "docs/developer/features/play-store-release/policy-checklist.md"),
      "utf-8"
    );
    expect(content).toContain("プライバシーポリシー");
  });

  it("policy-checklist.md にデータセーフティセクションの確認項目がある", () => {
    const content = readFileSync(
      resolve(repoRoot, "docs/developer/features/play-store-release/policy-checklist.md"),
      "utf-8"
    );
    expect(content).toContain("データセーフティ");
  });

  it("policy-checklist.md に不正行為ポリシーの確認項目がある", () => {
    const content = readFileSync(
      resolve(repoRoot, "docs/developer/features/play-store-release/policy-checklist.md"),
      "utf-8"
    );
    expect(content).toContain("不正行為");
  });

  it("policy-checklist.md に広告ポリシーの確認項目がある", () => {
    const content = readFileSync(
      resolve(repoRoot, "docs/developer/features/play-store-release/policy-checklist.md"),
      "utf-8"
    );
    expect(content).toContain("広告");
  });
});
