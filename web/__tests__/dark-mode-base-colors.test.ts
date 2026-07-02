// @vitest-environment node

/**
 * ダークモードのベース色適用 (BL-143 / dark-mode-base-colors) 受け入れ基準テスト.
 *
 * 仕様参照:
 *   docs/developer/features/dark-mode-base-colors/spec.md
 *   docs/developer/features/dark-mode-base-colors/plan.md
 *
 * 本ファイルが検証する受け入れ基準:
 *   AC-1: web/src/styles/base.css の body ブロックに background (または background-color) の
 *         値 var(--color-bg) と, color の値 var(--color-fg) が存在する.
 *   AC-2: base.css の :root ブロックに color-scheme: light dark が宣言されている.
 *   AC-3: web/src/main.tsx が ./styles/base.css を import している.
 *   AC-4: base.css の宣言値・var() フォールバック引数に生の色リテラルが無い
 *         (hex / rgb() / rgba() / hsl() / hsla() / CSS 名前付き色). CSS コメント内は対象外.
 *
 * 本ファイルで扱わない受け入れ基準 (担保方法が別):
 *   AC-5: 既存テスト全 green + tokens.css 無変更 + lint / typecheck
 *         → リポジトリルートで npx vitest run / npm run lint / npm run typecheck と
 *           git diff で確認する.
 *   AC-V1〜AC-V3: 視覚基準 → auditor / architecture-reviewer が実在確認.
 *
 * 本ファイルはガードテスト.
 *   - base.css の不在 / body ベース色ルールの欠落 / color-scheme 宣言の欠落 /
 *     main.tsx の import 欠落 / 生の色リテラルの混入を fail として検出し,
 *     ベース色適用工程の欠落 (spec「背景 / 課題」) の再発を恒久的に防ぐ.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(__dirname, "../..");
const webSrcRoot = resolve(repoRoot, "web/src");
const baseCssPath = resolve(webSrcRoot, "styles/base.css");
const mainTsxPath = resolve(webSrcRoot, "main.tsx");

// ---------------------------------------------------------------------------
// CSS 走査ヘルパ (dark-mode-tokens.test.ts と同等の基準で走査する)
// ---------------------------------------------------------------------------

/**
 * CSS のブロックコメント (/* ... *\/) を全て除去する.
 * コメント内に書かれた解説用の色名・hex を生の色として誤検知するのを防ぐ.
 */
function stripCssComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

/**
 * base.css を読み込み, コメント除去済みの内容を返す.
 * ファイルが存在しない場合は null を返す (各テストが「ファイル不在」を
 * 意味のあるアサーション失敗として報告できるようにする).
 */
function readBaseCss(): string | null {
  if (!existsSync(baseCssPath)) return null;
  return stripCssComments(readFileSync(baseCssPath, "utf-8"));
}

/**
 * 開き波括弧 `{` の位置を起点に, 対応する閉じ波括弧までの本文を返す
 * (ネストした波括弧に対応). openBraceIndex は `{` を指す.
 */
function extractBraceBlock(css: string, openBraceIndex: number): string | null {
  let depth = 0;
  for (let i = openBraceIndex; i < css.length; i++) {
    const ch = css[i];
    if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0) {
        return css.slice(openBraceIndex + 1, i);
      }
    }
  }
  return null;
}

/**
 * 指定セレクタのルール本文を全て返す.
 * selectorPattern はセレクタ直後の `{` までを含む正規表現ソース
 * (先頭は「行頭 or 非識別子文字」で縛り, `tbody` 等の部分一致を防ぐ).
 */
function extractSelectorBodies(css: string, selectorPattern: string): string[] {
  const bodies: string[] = [];
  const re = new RegExp(selectorPattern, "g");
  let m: RegExpExecArray | null;
  // biome-ignore lint/suspicious/noAssignInExpressions: 正規表現の逐次マッチはこの形が定石.
  while ((m = re.exec(css)) !== null) {
    const openIdx = m.index + m[0].length - 1; // マッチ末尾は `{`
    const body = extractBraceBlock(css, openIdx);
    if (body !== null) bodies.push(body);
    re.lastIndex = openIdx + 1;
  }
  return bodies;
}

/** `body { ... }` の本文一覧 (要素セレクタ単独の body のみ). */
function extractBodyRuleBodies(css: string): string[] {
  return extractSelectorBodies(css, "(?:^|[^\\w.#-])body\\s*\\{");
}

/** `:root { ... }` の本文一覧. */
function extractRootRuleBodies(css: string): string[] {
  return extractSelectorBodies(css, "(?:^|[^\\w-]):root\\s*\\{");
}

/**
 * ルール本文を宣言 (prop → value) の Map に変換する.
 * 同名プロパティが複数あれば後勝ち (CSS のカスケードと同じ).
 * プロパティ名は小文字化, 値は前後空白の除去と連続空白の 1 個化のみ行う.
 */
function parseDeclarations(ruleBody: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const decl of ruleBody.split(";")) {
    const idx = decl.indexOf(":");
    if (idx === -1) continue;
    const prop = decl.slice(0, idx).trim().toLowerCase();
    const value = decl
      .slice(idx + 1)
      .trim()
      .replace(/\s+/g, " ");
    if (prop) map.set(prop, value);
  }
  return map;
}

/** 複数ルール本文の宣言をマージする (後のルールが勝つ). */
function mergedDeclarations(ruleBodies: string[]): Map<string, string> {
  const merged = new Map<string, string>();
  for (const body of ruleBodies) {
    for (const [prop, value] of parseDeclarations(body)) {
      merged.set(prop, value);
    }
  }
  return merged;
}

/**
 * CSS の名前付き色の検出対象集合 (dark-mode-tokens.test.ts と同一の意図的な限定).
 * CSS Level 1 の基本 16 色 + UI CSS に紛れ込みやすい主要色に限定し,
 * 稀な色名 (rebeccapurple 等) の部分一致誤検知よりガードの信頼性を優先する.
 */
const NAMED_COLORS = new Set<string>([
  "aqua",
  "black",
  "blue",
  "brown",
  "cyan",
  "fuchsia",
  "gold",
  "gray",
  "green",
  "grey",
  "lime",
  "magenta",
  "maroon",
  "navy",
  "olive",
  "orange",
  "pink",
  "purple",
  "red",
  "silver",
  "teal",
  "white",
  "yellow",
]);

/**
 * コメント除去済み CSS の宣言値位置に現れる名前付き色を列挙する.
 * 値内の識別子をトークン化し集合と完全一致で判定するため,
 * `var(--color-red)` の `color-red` や `color-scheme: light dark` の
 * `light` / `dark` (NAMED_COLORS 非該当) は誤検出しない.
 */
function findNamedColors(strippedCss: string): string[] {
  const out: string[] = [];
  const declRe = /[\w-]+\s*:\s*([^;{}]+)/g;
  let m: RegExpExecArray | null;
  // biome-ignore lint/suspicious/noAssignInExpressions: 正規表現の逐次マッチはこの形が定石.
  while ((m = declRe.exec(strippedCss)) !== null) {
    const tokens = (m[1] ?? "").match(/[A-Za-z0-9][A-Za-z0-9-]*/g) ?? [];
    for (const tok of tokens) {
      if (NAMED_COLORS.has(tok.toLowerCase())) out.push(tok);
    }
  }
  return out;
}

/**
 * コメント除去済み CSS 文字列に含まれる生の色リテラルを列挙する.
 * 対象: hex / rgb() / rgba() / hsl() / hsla() / 名前付き色 (値位置のみ).
 * `var(--color-bg, #fff)` のようなフォールバック引数内の hex もここで捕捉される.
 */
function findRawColors(strippedCss: string): string[] {
  const re = /#[0-9a-fA-F]{3,8}\b|\brgba?\s*\(|\bhsla?\s*\(/gi;
  const literals = strippedCss.match(re) ?? [];
  return [...literals, ...findNamedColors(strippedCss)];
}

/** `var(--token)` 形式 (フォールバック無し) かを判定する正規表現を作る. */
function varRefRe(token: string): RegExp {
  return new RegExp(`^var\\(\\s*${token}\\s*\\)$`);
}

// ---------------------------------------------------------------------------
// テスト
// ---------------------------------------------------------------------------

describe("ダークモードのベース色適用 (BL-143)", () => {
  /**
   * AC-1: body へのベース色適用ルールが存在する.
   *
   * シナリオ: AC-1 body へのベース色適用ルールが存在する
   *   Given web/src/styles/base.css
   *   When  body セレクタの宣言ブロックを抽出する (コメントは除外)
   *   Then  background (または background-color) の値が var(--color-bg) である
   *   And   color の値が var(--color-fg) である
   */
  describe("AC-1: body へのベース色適用ルールが存在する", () => {
    it("base.css に body セレクタのルールが存在する", () => {
      const css = readBaseCss();
      expect(css, "web/src/styles/base.css がありません (REQ-1)").not.toBeNull();
      expect(
        extractBodyRuleBodies(css ?? "").length,
        "base.css に body セレクタのルールがありません",
      ).toBeGreaterThan(0);
    });

    it("body の background (または background-color) が var(--color-bg) である", () => {
      const css = readBaseCss();
      expect(css, "web/src/styles/base.css がありません (REQ-1)").not.toBeNull();
      const decls = mergedDeclarations(extractBodyRuleBodies(css ?? ""));
      const background = decls.get("background") ?? decls.get("background-color");
      expect(background, "body に background / background-color の宣言がありません").toBeDefined();
      expect(
        background ?? "",
        `body の背景が var(--color-bg) ではありません: ${background}`,
      ).toMatch(varRefRe("--color-bg"));
    });

    it("body の color が var(--color-fg) である", () => {
      const css = readBaseCss();
      expect(css, "web/src/styles/base.css がありません (REQ-1)").not.toBeNull();
      const decls = mergedDeclarations(extractBodyRuleBodies(css ?? ""));
      const color = decls.get("color");
      expect(color, "body に color の宣言がありません").toBeDefined();
      expect(color ?? "", `body の文字色が var(--color-fg) ではありません: ${color}`).toMatch(
        varRefRe("--color-fg"),
      );
    });
  });

  /**
   * AC-2: color-scheme が宣言されている.
   *
   * シナリオ: AC-2 color-scheme が宣言されている
   *   Given web/src/styles/base.css
   *   When  :root セレクタの宣言ブロックを抽出する (コメントは除外)
   *   Then  color-scheme: light dark が宣言されている
   */
  describe("AC-2: color-scheme が宣言されている", () => {
    it(":root に color-scheme: light dark が宣言されている", () => {
      const css = readBaseCss();
      expect(css, "web/src/styles/base.css がありません (REQ-1)").not.toBeNull();
      const rootBodies = extractRootRuleBodies(css ?? "");
      expect(rootBodies.length, "base.css に :root セレクタのルールがありません").toBeGreaterThan(
        0,
      );
      const colorScheme = mergedDeclarations(rootBodies).get("color-scheme");
      expect(colorScheme, ":root に color-scheme の宣言がありません").toBeDefined();
      expect(
        colorScheme,
        `color-scheme が "light dark" ではありません: ${colorScheme} (REQ-2 / plan D-2)`,
      ).toBe("light dark");
    });
  });

  /**
   * AC-3: base.css がエントリポイントから import されている.
   *
   * シナリオ: AC-3 base.css がエントリポイントから import されている
   *   Given web/src/main.tsx
   *   When  import 文を走査する
   *   Then  ./styles/base.css の import が存在する
   */
  describe("AC-3: base.css がエントリポイントから import されている", () => {
    it("main.tsx が ./styles/base.css を import している", () => {
      const source = readFileSync(mainTsxPath, "utf-8");
      expect(source, 'main.tsx に import "./styles/base.css"; がありません (REQ-3)').toMatch(
        /import\s+["']\.\/styles\/base\.css["']/,
      );
    });
  });

  /**
   * AC-4: base.css に生の色リテラルが無い.
   *
   * シナリオ: AC-4 base.css に生の色リテラルが無い
   *   Given web/src/styles/base.css
   *   When  宣言値・var() フォールバック引数を走査する (コメントは除外)
   *   Then  hex / rgb() / rgba() / hsl() / hsla() / 名前付き色が 1 件も検出されない
   *         (色は全て var(--color-*) 経由である)
   */
  describe("AC-4: base.css に生の色リテラルが無い", () => {
    it("base.css の宣言値・var() フォールバックに生の色が無い", () => {
      const css = readBaseCss();
      expect(css, "web/src/styles/base.css がありません (REQ-1)").not.toBeNull();
      const rawColors = findRawColors(css ?? "");
      expect(
        rawColors,
        `base.css に生の色リテラルがあります: ${rawColors.join(", ")}. var(--color-*) 参照のみで構成してください (REQ-6)`,
      ).toEqual([]);
    });
  });
});
