// @vitest-environment node

/**
 * ダークモード対応 / OS カラースキーム追従 (BL-140 / dark-mode) 受け入れ基準テスト.
 *
 * 仕様参照:
 *   docs/developer/features/dark-mode/spec.md
 *   docs/developer/features/dark-mode/plan.md
 *
 * 本ファイルが検証する受け入れ基準:
 *   AC-1: web/src/ui/**\/*.css の宣言値・var() フォールバックに生の色リテラルが残らない
 *         (hex / rgb() / rgba() / hsl() / hsla() / CSS 名前付き色). CSS コメント内の色は対象外.
 *   AC-2: tokens.css に @media (prefers-color-scheme: dark) が存在し, 内側に :root がある.
 *   AC-3: :root(ライト)の --color-* 集合と, ダーク @media 内 :root の --color-* 集合が完全一致.
 *   AC-4: 新設 3 トークン (--color-danger / --color-success / --color-scrim) が
 *         ライト・ダーク双方に存在.
 *   AC-5: ダーク @media 内 :root の宣言は --color-* のみ (非カラートークンが混入しない).
 *
 * 本ファイルで扱わない受け入れ基準 (担保方法が別):
 *   AC-6: 既存の全テスト green 維持 → リポジトリルートで npx vitest run 全体を実行して確認.
 *   AC-V1〜AC-V3: 視覚 / コントラスト基準 → auditor / architecture-reviewer が実在確認.
 *
 * 本ファイルは TDD の "red" を作るテスト.
 *   - ダーク @media 未追加 / コンポーネント CSS に生色残存 / 新トークン未定義の現状では
 *     AC-1〜AC-5 が失敗する. implementer が実装することで green 化する.
 */

import { readdirSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(__dirname, "../..");
const webSrcRoot = resolve(repoRoot, "web/src");
const uiRoot = resolve(webSrcRoot, "ui");
const tokensCssPath = resolve(webSrcRoot, "styles/tokens.css");

// spec.md REQ-2 / plan.md「トークン一覧」で新設する 3 カラートークン.
const NEW_COLOR_TOKENS = ["--color-danger", "--color-success", "--color-scrim"] as const;

// ---------------------------------------------------------------------------
// CSS 走査ヘルパ
// ---------------------------------------------------------------------------

/**
 * CSS のブロックコメント (/* ... *\/) を全て除去する.
 * CSS のコメントは /* *\/ のみ (行コメントは無い) なので, 複数行にまたがる
 * コメントも 1 つの正規表現で除去できる. コメント内に書かれた WCAG 根拠の hex を
 * 生の色として誤検知するのを防ぐ.
 */
function stripCssComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

/**
 * `web/src/ui` 配下の全 *.css を再帰的に収集する (絶対パス).
 * tokens.css は web/src/styles 配下のため, この収集には含まれない (AC-1 の対象外).
 * 動的収集により, 将来追加されるコンポーネント CSS も自動的にガード対象になる.
 */
function collectUiCssFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectUiCssFiles(full));
    } else if (entry.name.endsWith(".css")) {
      out.push(full);
    }
  }
  return out.sort();
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

const DARK_MEDIA_RE = /@media[^{]*prefers-color-scheme\s*:\s*dark[^{]*\{/;

/** ダーク @media ブロックの本文 (中身) を返す. 無ければ null. */
function extractDarkMediaBody(css: string): string | null {
  const m = css.match(DARK_MEDIA_RE);
  if (m?.index === undefined) return null;
  const openIdx = m.index + m[0].length - 1;
  return extractBraceBlock(css, openIdx);
}

/** ダーク @media ブロックを丸ごと取り除いた CSS を返す (ライト :root 抽出用). */
function removeDarkMediaBlock(css: string): string {
  const m = css.match(DARK_MEDIA_RE);
  if (m?.index === undefined) return css;
  const openIdx = m.index + m[0].length - 1;
  let depth = 0;
  for (let i = openIdx; i < css.length; i++) {
    const ch = css[i];
    if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0) {
        return css.slice(0, m.index) + css.slice(i + 1);
      }
    }
  }
  return css;
}

/** 与えられた文字列内で最初に現れる `:root { ... }` の本文を返す. 無ければ null. */
function extractRootBody(css: string): string | null {
  const m = css.match(/:root\s*\{/);
  if (m?.index === undefined) return null;
  const openIdx = m.index + m[0].length - 1;
  return extractBraceBlock(css, openIdx);
}

/** ブロック本文から `--xxx:` の形で宣言されたカスタムプロパティ名の一覧を返す. */
function customPropertyNames(body: string): string[] {
  const matches = body.match(/--[\w-]+\s*:/g) ?? [];
  return matches.map((s) => s.replace(/\s*:$/, "").trim());
}

/** ブロック本文から `--color-*` のカスタムプロパティ名の集合を返す. */
function colorTokenNames(body: string): Set<string> {
  return new Set(customPropertyNames(body).filter((name) => name.startsWith("--color-")));
}

/**
 * CSS の名前付き色 (color: red; background: white; 等) の検出対象集合.
 *
 * CSS の named colors は 140 以上あるが, ここでは「意図的に」基本 16 色
 * (CSS Level 1: aqua/black/blue/fuchsia/gray/green/lime/maroon/navy/olive/
 *  purple/red/silver/teal/white/yellow) と, UI CSS に生値として紛れ込みやすい
 * 主要色 (grey/orange/pink/brown/gold/cyan/magenta) に限定する.
 * この集合外の名前付き色 (例: rebeccapurple / azure など) は検出しない — 意図的な限界.
 * 稀な色名まで広げると, 語の一部 (例: `azure` を含む識別子) を拾う誤検知余地が増えるため,
 * 実用上の主要色に絞ってガードの信頼性を優先する.
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
 * コメント除去済み CSS の宣言 (prop: value) の値位置に現れる名前付き色を列挙する.
 *
 * 検出は「宣言の値 (value) 部分」に限定する. これにより誤検知を避ける:
 *   - プロパティ名は走査対象外なので `white-space` の `white` を誤検出しない.
 *   - 値内の識別子は英数字・ハイフンを含む 1 トークンとして扱い集合と完全一致で判定するため,
 *     トークン名 (`var(--color-red)` の `color-red`) や `blue700` のような語は誤検出しない.
 *   - `currentColor` / `transparent` / `inherit` / `initial` / `unset` / `none` 等の
 *     CSS キーワードは NAMED_COLORS に含めないため, 自然に除外される.
 *
 * 限界: 値位置のみを見るため, 万一セレクタや at-rule に色名が現れても検出しない
 * (名前付き色はセレクタ/キーワードには通常現れないため実用上問題ない).
 */
function findNamedColors(strippedCss: string): string[] {
  const out: string[] = [];
  // 宣言: `prop: value` (value は `;` / `{` / `}` の手前まで). value のみを走査する.
  const declRe = /[\w-]+\s*:\s*([^;{}]+)/g;
  let m: RegExpExecArray | null;
  // biome-ignore lint/suspicious/noAssignInExpressions: 正規表現の逐次マッチはこの形が定石.
  while ((m = declRe.exec(strippedCss)) !== null) {
    // 値を「英数字始まりの英数字・ハイフン連なり」でトークン化し, 集合と完全一致で判定.
    const tokens = (m[1] ?? "").match(/[A-Za-z0-9][A-Za-z0-9-]*/g) ?? [];
    for (const tok of tokens) {
      if (NAMED_COLORS.has(tok.toLowerCase())) out.push(tok);
    }
  }
  return out;
}

/**
 * コメント除去済み CSS 文字列に含まれる生の色リテラルを列挙する.
 * 対象:
 *   - hex (#RGB / #RGBA / #RRGGBB / #RRGGBBAA) / rgb() / rgba() / hsl() / hsla()
 *   - CSS 名前付き色 (color: red; 等, 値位置のみ / findNamedColors 参照)
 * `var(--color-danger, #c00)` のようなフォールバック引数内の hex もここで捕捉される.
 * (transparent / currentColor 等の CSS キーワードはトークン上書きで正しく解決されるため
 *  生の色リテラルとして扱わない.)
 */
function findRawColors(strippedCss: string): string[] {
  const re = /#[0-9a-fA-F]{3,8}\b|\brgba?\s*\(|\bhsla?\s*\(/gi;
  const literals = strippedCss.match(re) ?? [];
  return [...literals, ...findNamedColors(strippedCss)];
}

// ---------------------------------------------------------------------------
// テスト
// ---------------------------------------------------------------------------

describe("ダークモード対応 / OS カラースキーム追従 (BL-140)", () => {
  /**
   * AC-1: コンポーネント CSS に生の色リテラルが残らない.
   *
   * シナリオ: AC-1 コンポーネント CSS に生の色リテラルが残らない
   *   Given web/src/ui 配下の全 *.css (tokens.css を除く)
   *   When  各ファイルの宣言値・var() フォールバック引数を走査する (コメントは除外)
   *   Then  hex / rgb() / rgba() / hsl() / hsla() / 名前付き色が 1 件も検出されない
   *         (色は全て var(--color-*) 経由である)
   */
  describe("AC-1: コンポーネント CSS に生の色リテラルが残らない", () => {
    const uiCssFiles = collectUiCssFiles(uiRoot);

    it("web/src/ui 配下に走査対象の *.css が存在する (前提)", () => {
      expect(uiCssFiles.length).toBeGreaterThan(0);
    });

    it.each(
      uiCssFiles.map((f) => [relative(repoRoot, f), f] as const),
    )("%s の宣言値・var() フォールバックに生の色が残っていない", (rel, filePath) => {
      const stripped = stripCssComments(readFileSync(filePath, "utf-8"));
      const rawColors = findRawColors(stripped);
      expect(
        rawColors,
        `${rel} に生の色リテラルが残っています: ${rawColors.join(", ")}. var(--color-*) 参照に置き換えてください`,
      ).toEqual([]);
    });
  });

  /**
   * AC-2: ダーク上書きブロックが存在する.
   *
   * シナリオ: AC-2 ダーク上書きブロックが存在する
   *   Given web/src/styles/tokens.css
   *   When  ファイル内容を走査する
   *   Then  @media (prefers-color-scheme: dark) を含むブロックが存在し,
   *         その中に :root セレクタが存在する
   */
  describe("AC-2: ダーク上書きブロックが存在する", () => {
    it("tokens.css に @media (prefers-color-scheme: dark) ブロックが存在する", () => {
      const css = stripCssComments(readFileSync(tokensCssPath, "utf-8"));
      expect(
        extractDarkMediaBody(css),
        "tokens.css に @media (prefers-color-scheme: dark) ブロックがありません",
      ).not.toBeNull();
    });

    it("ダーク @media ブロックの内側に :root セレクタが存在する", () => {
      const css = stripCssComments(readFileSync(tokensCssPath, "utf-8"));
      const darkBody = extractDarkMediaBody(css);
      expect(darkBody, "ダーク @media ブロックがありません").not.toBeNull();
      expect(
        extractRootBody(darkBody ?? ""),
        "ダーク @media 内に :root セレクタがありません",
      ).not.toBeNull();
    });
  });

  /**
   * AC-3: ダーク上書きが全カラートークンを網羅する.
   *
   * シナリオ: AC-3 ダーク上書きが全カラートークンを網羅する
   *   Given tokens.css の :root(ライト)で定義された --color-* の全集合
   *   When  @media (prefers-color-scheme: dark) 内の :root で再定義される集合と比較する
   *   Then  ライトで定義した全 --color-* がダークでも再定義されている (欠け・余りが無い)
   */
  describe("AC-3: ダーク上書きが全カラートークンを網羅する", () => {
    it("ライト :root とダーク :root の --color-* 集合が完全一致する", () => {
      const css = stripCssComments(readFileSync(tokensCssPath, "utf-8"));

      const lightRootBody = extractRootBody(removeDarkMediaBlock(css));
      expect(lightRootBody, "tokens.css にライト :root が見つかりません").not.toBeNull();

      const darkBody = extractDarkMediaBody(css);
      expect(darkBody, "ダーク @media ブロックがありません").not.toBeNull();
      const darkRootBody = extractRootBody(darkBody ?? "");
      expect(darkRootBody, "ダーク @media 内に :root がありません").not.toBeNull();

      const lightColors = colorTokenNames(lightRootBody ?? "");
      const darkColors = colorTokenNames(darkRootBody ?? "");

      const missingInDark = [...lightColors].filter((t) => !darkColors.has(t)).sort();
      const extraInDark = [...darkColors].filter((t) => !lightColors.has(t)).sort();

      expect(
        missingInDark,
        `ダークで再定義されていない --color-* があります: ${missingInDark.join(", ")}`,
      ).toEqual([]);
      expect(
        extraInDark,
        `ライトに存在しない --color-* がダークにあります: ${extraInDark.join(", ")}`,
      ).toEqual([]);
    });
  });

  /**
   * AC-4: 新設トークンがライト / ダーク双方に定義される.
   *
   * シナリオ: AC-4 新設トークンがライト / ダーク双方に定義される
   *   Given tokens.css
   *   When  --color-danger / --color-success / --color-scrim を探す
   *   Then  :root(ライト)と @media dark の :root の双方に 3 トークンとも定義されている
   */
  describe("AC-4: 新設トークンがライト / ダーク双方に定義される", () => {
    it.each(NEW_COLOR_TOKENS)("ライト :root に %s が定義されている", (token) => {
      const css = stripCssComments(readFileSync(tokensCssPath, "utf-8"));
      const lightRootBody = extractRootBody(removeDarkMediaBlock(css));
      expect(lightRootBody, "tokens.css にライト :root が見つかりません").not.toBeNull();
      expect(colorTokenNames(lightRootBody ?? "").has(token)).toBe(true);
    });

    it.each(NEW_COLOR_TOKENS)("ダーク @media 内 :root に %s が定義されている", (token) => {
      const css = stripCssComments(readFileSync(tokensCssPath, "utf-8"));
      const darkBody = extractDarkMediaBody(css);
      expect(darkBody, "ダーク @media ブロックがありません").not.toBeNull();
      const darkRootBody = extractRootBody(darkBody ?? "");
      expect(darkRootBody, "ダーク @media 内に :root がありません").not.toBeNull();
      expect(colorTokenNames(darkRootBody ?? "").has(token)).toBe(true);
    });
  });

  /**
   * AC-5: ダーク上書きはカラートークンに限定される.
   *
   * シナリオ: AC-5 ダーク上書きはカラートークンに限定される
   *   Given @media (prefers-color-scheme: dark) 内の :root ブロック
   *   When  宣言されているカスタムプロパティを走査する
   *   Then  すべて --color-* であり, --space-* / --radius-* / --font-size-* /
   *         --sidebar-width 等 非カラーのトークンは含まれない
   */
  describe("AC-5: ダーク上書きはカラートークンに限定される", () => {
    it("ダーク :root の宣言は全て --color-* である (非カラートークン混入なし)", () => {
      const css = stripCssComments(readFileSync(tokensCssPath, "utf-8"));
      const darkBody = extractDarkMediaBody(css);
      expect(darkBody, "ダーク @media ブロックがありません").not.toBeNull();
      const darkRootBody = extractRootBody(darkBody ?? "");
      expect(darkRootBody, "ダーク @media 内に :root がありません").not.toBeNull();

      const nonColor = customPropertyNames(darkRootBody ?? "").filter(
        (name) => !name.startsWith("--color-"),
      );
      expect(
        nonColor,
        `ダーク :root に非カラートークンが混入しています: ${nonColor.join(", ")}`,
      ).toEqual([]);
    });
  });
});
