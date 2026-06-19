import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { load } from "js-yaml";
import { describe, expect, it } from "vitest";

/**
 * OpenAPI ErrorCode enum ドリフト検出 (BL-125).
 *
 * BL-116 の openapi-drift.test.ts は (path, method) の集合一致のみを担保し,
 * response schema / enum の値域は対象外だった (spec 上 Phase 2 扱い). その穴から
 * `ErrorCode` enum が実装の追加分 (routine / project / trash / auth feature の
 * エラーコード) を取りこぼし, 長期間ドリフトしていた (BL-124 で 11 → 21 種へ是正).
 *
 * 本テストは実装 (server/src + domain/src) が返し得るエラーコード集合と
 * openapi.yaml の `ErrorCode` enum を双方向に照合し, 片側更新漏れで red 化する.
 *
 * 抽出規約 (実装が返すコードは次の 2 形でのみ literal として現れる):
 *   - `code: "XXX"`                          (ドメイン検証 / ユースケース Result)
 *   - `errorJson(c, <status>, "XXX", ...)`    (ルータ / ミドルウェアの応答生成)
 * 非 literal (変数経由) でコードを返す箇所を新設した場合は本抽出が追従しないため,
 * その際は抽出規約側の更新が必要 (= 規約逸脱を強制的に気付かせる).
 */

const repoRoot = resolve(__dirname, "../..");

/** server/src + domain/src 配下の実装 .ts (テストを除く) を再帰列挙する. */
function sourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = resolve(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "__tests__" || entry.name === "node_modules") continue;
        walk(full);
      } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
        out.push(full);
      }
    }
  };
  for (const root of ["server/src", "domain/src"]) walk(resolve(repoRoot, root));
  return out;
}

const CODE_LITERAL = /\bcode:\s*"([A-Z][A-Z0-9_]+)"/g;
const ERROR_JSON = /errorJson\s*\([^,]*,\s*\d+\s*,\s*"([A-Z][A-Z0-9_]+)"/g;

/** 実装が応答で返し得るエラーコード集合を抽出する. */
function implementationErrorCodes(): Set<string> {
  const codes = new Set<string>();
  for (const file of sourceFiles()) {
    const src = readFileSync(file, "utf8");
    for (const re of [CODE_LITERAL, ERROR_JSON]) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null = re.exec(src);
      while (m !== null) {
        codes.add(m[1] as string);
        m = re.exec(src);
      }
    }
  }
  return codes;
}

/** openapi.yaml の ErrorCode enum 値域を抽出する. */
function openapiErrorCodeEnum(): Set<string> {
  const doc = load(
    readFileSync(resolve(repoRoot, "docs/developer/architecture/api/openapi.yaml"), "utf8"),
  ) as { components?: { schemas?: { ErrorCode?: { enum?: string[] } } } };
  const values = doc.components?.schemas?.ErrorCode?.enum;
  if (!values) throw new Error("openapi.yaml に components.schemas.ErrorCode.enum が存在しない");
  return new Set(values);
}

describe("BL-125 OpenAPI ErrorCode enum ドリフト検出", () => {
  it("抽出規約が成立する (実装からコードが 1 つ以上抽出される)", () => {
    expect(implementationErrorCodes().size).toBeGreaterThan(0);
  });

  it("実装が返す全エラーコードが openapi enum に列挙されている (追記漏れ検出)", () => {
    const enumv = openapiErrorCodeEnum();
    const missing = [...implementationErrorCodes()].filter((c) => !enumv.has(c)).sort();
    expect(missing).toEqual([]);
  });

  it("openapi enum の全コードが実装で使われている (幻のコード検出)", () => {
    const used = implementationErrorCodes();
    const extra = [...openapiErrorCodeEnum()].filter((c) => !used.has(c)).sort();
    expect(extra).toEqual([]);
  });

  it("実装のエラーコード集合と openapi enum が完全一致する", () => {
    const used = [...implementationErrorCodes()].sort();
    const enumv = [...openapiErrorCodeEnum()].sort();
    expect(enumv).toEqual(used);
  });
});
