// @vitest-environment node

/**
 * デザイントークン / CSS 基盤の整備 (BL-046 / design-tokens) 受け入れ基準テスト.
 *
 * 仕様参照:
 *   docs/developer/features/design-tokens/spec.md
 *   docs/developer/features/design-tokens/plan.md
 *
 * 本ファイルが検証する受け入れ基準:
 *   AC-1: tokens.css が存在し :root に 18 変数が定義されている.
 *   AC-2: main.tsx に tokens.css の import が追加されている.
 *   AC-3: grep -r 'TODO(BL-046)' web/src/ の出力がゼロである.
 *   AC-4: 対象 10 CSS ファイルの旧暫定値が var(--トークン名) に置き換わっている.
 *   AC-7: tokens.css に --sidebar-width が定義されていない.
 *
 * 本ファイルで扱わない受け入れ基準 (担保方法が別):
 *   AC-5: 既存テスト全体の green 維持 → npm test / npx playwright test を実行して確認.
 *   AC-6: focus-view の computed style → e2e/design-tokens.spec.ts の Playwright テスト.
 *
 * 本ファイルは TDD の "red" を作るためのテスト.
 *   - tokens.css が未作成 / main.tsx が未修正 / CSS ファイルが未置換の状態では全て失敗する.
 *   - implementer が実装することで green 化する.
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(__dirname, "../..");
const webSrcRoot = resolve(repoRoot, "web/src");
const tokensCssPath = resolve(webSrcRoot, "styles/tokens.css");
const mainTsxPath = resolve(webSrcRoot, "main.tsx");

/**
 * CSS ファイルの内容からコメント行（// ... または * ... 行）を除去した文字列を返す.
 * トークン参照検証で「コメント内に書かれた変数名」が誤検知されるのを防ぐ.
 */
function stripCssComments(content: string): string {
  return content
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      return !trimmed.startsWith("//") && !trimmed.startsWith("*") && !trimmed.startsWith("/*");
    })
    .join("\n");
}

// spec.md REQ-2 で定義された 18 トークン（--color-danger を除く）.
const REQUIRED_TOKENS = [
  "--font-size-h1",
  "--font-size-h2",
  "--font-size-body",
  "--font-size-small",
  "--space-xs",
  "--space-sm",
  "--space-md",
  "--space-lg",
  "--space-xl",
  "--radius-sm",
  "--radius-md",
  "--radius-lg",
  "--color-bg",
  "--color-fg",
  "--color-fg-subtle",
  "--color-border",
  "--color-border-subtle",
  "--color-accent",
  "--color-focus-ring",
] as const;

// spec.md REQ-3 で定めた置換対象 CSS ファイル.
// 注: tomorrow-view.css は BL-051 で削除済みのため対象外.
// 注: ui/project-toggle/project-toggle.css は BL-065 (project-toggle-removal) で
//     ディレクトリごと撤去済みのため対象外.
const TARGET_CSS_FILES = [
  "ui/app-shell/app-shell.css",
  "ui/focus-view/focus-view.css",
  "ui/projects-view/projects-view.css",
  "ui/routines-view/routines-view.css",
  "ui/settings-view/settings-view.css",
  "ui/trash-view/trash-view.css",
  "ui/priority-stars/priority-stars.css",
  "ui/project-create-dialog/project-create-dialog.css",
] as const;

describe("デザイントークン / CSS 基盤の整備 (BL-046)", () => {
  /**
   * AC-1: tokens.css が存在し :root に 18 変数が定義されている.
   *
   * シナリオ: tokens.css が配置され、main.tsx から import されている
   *   Given web/src/styles/tokens.css が存在する
   *   When  ファイルを開く
   *   Then  :root { } ブロックに REQ-2 で定めた 19 変数（--color-danger を除く）が定義されている
   */
  describe("AC-1: tokens.css の存在と変数定義", () => {
    it("web/src/styles/tokens.css が存在する", () => {
      expect(existsSync(tokensCssPath)).toBe(true);
    });

    it("tokens.css に :root セレクタが存在する", () => {
      const content = readFileSync(tokensCssPath, "utf-8");
      expect(content).toMatch(/:root\s*\{/);
    });

    it.each(REQUIRED_TOKENS)("tokens.css の :root に %s が定義されている", (token) => {
      const content = readFileSync(tokensCssPath, "utf-8");
      // :root ブロック内に "--token-name: <value>;" 形式で定義されているか検証する.
      expect(content).toContain(token);
    });

    it("tokens.css に定義されている変数がちょうど 18 個以上である（--color-danger を除く）", () => {
      const content = readFileSync(tokensCssPath, "utf-8");
      // :root ブロック内の CSS 変数定義を抽出する.
      const variableMatches = content.match(/--[\w-]+\s*:/g) ?? [];
      // --color-danger は REQ-2 で定義不要と明示されている.
      const definedVars = variableMatches
        .map((m) => m.replace(/\s*:$/, "").trim())
        .filter((v) => v !== "--color-danger");
      expect(definedVars.length).toBeGreaterThanOrEqual(18);
    });

    it("tokens.css に --font-size-h1: 24px が定義されている（spec.md REQ-2 確定値）", () => {
      const content = readFileSync(tokensCssPath, "utf-8");
      expect(content).toMatch(/--font-size-h1\s*:\s*24px/);
    });

    it("tokens.css に --radius-lg: 16px が定義されている（spec.md REQ-2 確定値）", () => {
      const content = readFileSync(tokensCssPath, "utf-8");
      expect(content).toMatch(/--radius-lg\s*:\s*16px/);
    });

    it("tokens.css に --color-border: #ccc が定義されている（spec.md REQ-2 確定値）", () => {
      const content = readFileSync(tokensCssPath, "utf-8");
      expect(content).toMatch(/--color-border\s*:\s*#ccc/);
    });

    it("tokens.css に --space-xl: 32px が定義されている（spec.md REQ-2 確定値）", () => {
      const content = readFileSync(tokensCssPath, "utf-8");
      expect(content).toMatch(/--space-xl\s*:\s*32px/);
    });

    it("tokens.css に --color-fg-subtle: #595959 が定義されている（spec.md REQ-2 / WCAG AA）", () => {
      const content = readFileSync(tokensCssPath, "utf-8");
      expect(content).toMatch(/--color-fg-subtle\s*:\s*#595959/);
    });

    it("tokens.css に --color-accent: #B45309 が定義されている（spec.md REQ-2 / WCAG AA amber-700）", () => {
      const content = readFileSync(tokensCssPath, "utf-8");
      expect(content).toMatch(/--color-accent\s*:\s*#[Bb]45309/);
    });

    it("tokens.css に --color-focus-ring: #1d4ed8 が定義されている（spec.md REQ-2 / WCAG AAA blue-700）", () => {
      const content = readFileSync(tokensCssPath, "utf-8");
      expect(content).toMatch(/--color-focus-ring\s*:\s*#1d4ed8/);
    });
  });

  /**
   * AC-2: main.tsx に tokens.css の import が追加されている.
   *
   * シナリオ: tokens.css が配置され、main.tsx から import されている
   *   Given web/src/main.tsx を開く
   *   When  import 文を確認する
   *   Then  import './styles/tokens.css' または等価なパスの import が存在する
   */
  describe("AC-2: main.tsx からの tokens.css import", () => {
    it("main.tsx に tokens.css の import 文が存在する", () => {
      const content = readFileSync(mainTsxPath, "utf-8");
      // './styles/tokens.css' または '../styles/tokens.css' 等、パスは柔軟に確認する.
      expect(content).toMatch(/import\s+['"]\.\/styles\/tokens\.css['"]/);
    });
  });

  /**
   * AC-3: grep -r 'TODO(BL-046)' web/src/ の出力がゼロである.
   *
   * シナリオ: TODO(BL-046) マーカーがコードベースから消えている
   *   Given BL-046 の実装作業が完了した
   *   When  grep -r 'TODO(BL-046)' web/src/ を実行する
   *   Then  出力がゼロである
   */
  describe("AC-3: TODO(BL-046) マーカーの消去", () => {
    it("web/src/ 以下に TODO(BL-046) マーカーが残っていない", () => {
      let result: string;
      try {
        result = execSync("grep -r 'TODO(BL-046)' web/src/", {
          cwd: repoRoot,
          encoding: "utf-8",
        });
      } catch (e) {
        // grep が 1 件も見つからない場合は exit code 1 を返す → 正常（出力なし）.
        const err = e as { status?: number; stdout?: string };
        if (err.status === 1) {
          result = "";
        } else {
          throw e;
        }
      }
      expect(result.trim(), "TODO(BL-046) マーカーが残っています").toBe("");
    });
  });

  /**
   * AC-4: 対象 10 CSS ファイルの旧暫定値が var(--トークン名) に置き換わっている.
   *
   * シナリオ: 全 CSS ファイルがトークン変数を参照している
   *   Given tokens.css が存在し、main.tsx から import されている
   *   When  対象 10 ファイルを開く
   *   Then  各ファイルの旧暫定値の記述箇所が var(--トークン名) に置き換わっている
   */
  describe("AC-4: 対象 CSS ファイルへのトークン変数適用", () => {
    it.each(TARGET_CSS_FILES)("%s に TODO(BL-046) マーカーが残っていない", (relativePath) => {
      const filePath = resolve(webSrcRoot, relativePath);
      const content = readFileSync(filePath, "utf-8");
      expect(content, `${relativePath} に TODO(BL-046) が残っています`).not.toContain(
        "TODO(BL-046)",
      );
    });

    // BL-059 追従: .focus-view__card / .focus-view__project / .focus-view__name /
    //               .focus-view__actions を撤去したため,
    //               旧 focus-view.css で参照していた --radius-lg / --color-border /
    //               --space-xl の参照も自然に消える. これらは <TaskCard variant="focus" />
    //               (= task-card.css) 側で参照され続けるため, BL-046 の意図
    //               (= 旧暫定値からトークン参照に置換) は維持される.
    //               16px ハードコードが残っていない不変性は引き続き維持する.
    it("focus-view.css の __card に border-radius: 16px のハードコードが残っていない（BL-059 で撤去確認）", () => {
      const raw = readFileSync(resolve(webSrcRoot, "ui/focus-view/focus-view.css"), "utf-8");
      const content = stripCssComments(raw);
      // 置換後は var(--radius-lg) であり、16px のハードコードは消えるはず.
      // ただし plan.md D-005 で __name の 28px は残留するため、その行以外を確認.
      const hardcodedRadiusLine = content
        .split("\n")
        .find((line) => /border-radius\s*:\s*16px/.test(line));
      expect(
        hardcodedRadiusLine,
        "border-radius: 16px のハードコードが残っています",
      ).toBeUndefined();
    });

    it("task-card.css が --radius-lg を参照している（BL-059 / .focus-view__card から移譲）", () => {
      const raw = readFileSync(resolve(webSrcRoot, "ui/task-card/task-card.css"), "utf-8");
      const content = stripCssComments(raw);
      expect(content).toContain("var(--radius-lg)");
    });

    it("task-card.css が --color-border を参照している（BL-059 / .focus-view__card から移譲）", () => {
      const raw = readFileSync(resolve(webSrcRoot, "ui/task-card/task-card.css"), "utf-8");
      const content = stripCssComments(raw);
      expect(content).toContain("var(--color-border)");
    });

    it("priority-stars.css が --color-accent を参照している（spec.md REQ-3）", () => {
      const raw = readFileSync(
        resolve(webSrcRoot, "ui/priority-stars/priority-stars.css"),
        "utf-8",
      );
      // コメント行を除外してプロパティ値での使用のみ検証する.
      const content = stripCssComments(raw);
      expect(content).toContain("var(--color-accent)");
    });

    it("priority-stars.css が --color-fg-subtle を参照している（spec.md REQ-3）", () => {
      const raw = readFileSync(
        resolve(webSrcRoot, "ui/priority-stars/priority-stars.css"),
        "utf-8",
      );
      const content = stripCssComments(raw);
      expect(content).toContain("var(--color-fg-subtle)");
    });

    it("priority-stars.css が --color-focus-ring を参照している（spec.md REQ-3）", () => {
      const raw = readFileSync(
        resolve(webSrcRoot, "ui/priority-stars/priority-stars.css"),
        "utf-8",
      );
      const content = stripCssComments(raw);
      expect(content).toContain("var(--color-focus-ring)");
    });

    it("app-shell.css が --color-border-subtle を参照している（spec.md REQ-3）", () => {
      const raw = readFileSync(resolve(webSrcRoot, "ui/app-shell/app-shell.css"), "utf-8");
      const content = stripCssComments(raw);
      expect(content).toContain("var(--color-border-subtle)");
    });

    // BL-065 (project-toggle-removal): project-toggle.css は撤去済みのため
    // 「project-toggle.css が --color-fg を参照している」it は削除した.

    it("project-create-dialog.css が --color-bg を参照している（spec.md REQ-3）", () => {
      const raw = readFileSync(
        resolve(webSrcRoot, "ui/project-create-dialog/project-create-dialog.css"),
        "utf-8",
      );
      const content = stripCssComments(raw);
      expect(content).toContain("var(--color-bg)");
    });
  });

  /**
   * AC-7: app-shell のサイドバー幅がトークン化されていない.
   *
   * シナリオ: app-shell のサイドバー幅がトークン化されていない
   *   Given app-shell.css を開く
   *   When  sidebar の width プロパティを確認する
   *   Then  200px のハードコード値が残っている
   *   And   --sidebar-width の変数定義が tokens.css に存在しない
   */
  describe("AC-7: --sidebar-width は tokens.css に定義されていない", () => {
    it("tokens.css に --sidebar-width が定義されていない（spec.md REQ-4 / plan.md D-006）", () => {
      const content = readFileSync(tokensCssPath, "utf-8");
      expect(content, "tokens.css に --sidebar-width が定義されています").not.toContain(
        "--sidebar-width",
      );
    });

    it("app-shell.css に --sidebar-width 変数定義が存在しない（spec.md REQ-4 / BL-049 で固定サイドバー廃止済み）", () => {
      const content = readFileSync(resolve(webSrcRoot, "ui/app-shell/app-shell.css"), "utf-8");
      // BL-049 でサイドバー固定幅レイアウトを廃止したため 200px のハードコードは存在しない.
      // REQ-4 の本質（--sidebar-width をトークン体系に含めない）は tokens.css 側のテストで担保済み.
      expect(content).not.toContain("--sidebar-width");
    });
  });
});
