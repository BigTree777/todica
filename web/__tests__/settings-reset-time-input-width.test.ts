/**
 * BL-113: 設定ビューの「リセット時刻」入力欄の横幅を半分にし「変更」ボタンの折り返しを解消.
 *
 * 仕様参照:
 *   docs/developer/features/settings-reset-time-input-width/spec.md
 *   docs/developer/features/settings-reset-time-input-width/plan.md
 *
 * 確定方針: (b) `.settings-view__field-row input` の宣言を `flex: 1` →
 * `flex: 0 1 50%` に置換し input 幅を行幅の半分に固定する.
 *
 * 検証手段は CSS 文面 assert (BL-105 / BL-110 / BL-111 と同パターン).
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(__dirname, "../..");
const CSS_PATH = resolve(repoRoot, "web/src/ui/settings-view/settings-view.css");

function readCss(): string {
  return readFileSync(CSS_PATH, "utf8");
}

/**
 * 指定セレクタの最初のルール本文 (中括弧の中身) を返す.
 * 同名セレクタの 2 個目以降は対象外 (本ファイルでは存在しない前提).
 */
function extractRuleBody(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`);
  const match = css.match(pattern);
  if (!match) {
    throw new Error(`selector not found: ${selector}`);
  }
  return match[1] ?? "";
}

describe("BL-113 / settings-reset-time-input-width: settings-view.css 文面検証", () => {
  it("AC-1 (REQ-1): .settings-view__field-row input ルール本文に flex: 1 を含む", () => {
    const css = readCss();
    const body = extractRuleBody(css, ".settings-view__field-row input");
    expect(body).toMatch(/flex:\s*1\s*;/);
  });

  it("AC-2 (REQ-2): .settings-view__field-spacer ルール本文に flex: 3 を含む", () => {
    const css = readCss();
    const body = extractRuleBody(css, ".settings-view__field-spacer");
    expect(body).toMatch(/flex:\s*3\s*;/);
  });

  it("AC-3 (REQ-3): .settings-view__field-row input ルール本文に font-size と padding の既存宣言が保存される", () => {
    const css = readCss();
    const body = extractRuleBody(css, ".settings-view__field-row input");
    expect(body).toMatch(/font-size:\s*var\(--font-size-h2\)/);
    expect(body).toMatch(/padding:\s*var\(--space-xs\)\s+var\(--space-sm\)/);
  });

  it("AC-4 (REQ-4): .settings-view__field-row 親ルール本体は display: flex / gap / align-items を保つ", () => {
    const css = readCss();
    const body = extractRuleBody(css, ".settings-view__field-row");
    expect(body).toMatch(/display:\s*flex/);
    expect(body).toMatch(/gap:\s*var\(--space-sm\)/);
    expect(body).toMatch(/align-items:\s*center/);
  });

  it("AC-5 (非ゴール): .settings-view__password-field / .settings-view__password-form 系ルールに 50% / flex: 0 1 は混入していない (波及防止)", () => {
    const css = readCss();
    const passwordFormBody = extractRuleBody(css, ".settings-view__password-form");
    const passwordFieldBody = extractRuleBody(css, ".settings-view__password-field");
    expect(passwordFormBody).not.toMatch(/50%/);
    expect(passwordFormBody).not.toMatch(/flex:\s*0\s+1/);
    expect(passwordFieldBody).not.toMatch(/50%/);
    expect(passwordFieldBody).not.toMatch(/flex:\s*0\s+1/);
  });
});
