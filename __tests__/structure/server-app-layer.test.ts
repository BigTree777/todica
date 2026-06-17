import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * BL-115 サーバアプリケーション層の抽出 — 構造的受け入れ基準の静的検証.
 *
 * 仕様: docs/developer/features/server-app-layer-extraction/spec.md
 *   - AC-1: server/src/app/ に 9 系統のユースケースモジュールが存在する.
 *   - AC-2: 各ルータ (auth を除く) にドメイン純関数の直接呼び出し / Repository 組み立て /
 *           deps.db.transaction(...) のトランザクション境界指定が残らない.
 *   - AC-3: server/src/app/*.ts が hono の Context など API レイヤに依存しない.
 *
 * 抽出前の現状では app/ が存在せず, ルータにロジックが直書きされているため,
 * 本テスト群は意図的に red になる (TDD の失敗するテスト).
 */

const repoRoot = resolve(__dirname, "../..");

function read(relativePath: string): string {
  return readFileSync(resolve(repoRoot, relativePath), "utf8");
}

function exists(relativePath: string): boolean {
  return existsSync(resolve(repoRoot, relativePath));
}

/** ソースから import されているモジュール指定子 (from "...") を抽出する. */
function importSpecifiers(source: string): string[] {
  return [...source.matchAll(/from\s+["']([^"']+)["']/g)].map((match) => match[1]);
}

describe("BL-115 サーバアプリケーション層の構造的制約", () => {
  // app/ 配下に存在すべき 9 系統のユースケースモジュール (spec.md FR-1 / AC-1).
  const usecaseModules = [
    "task-usecases",
    "project-usecases",
    "routine-usecases",
    "focus-usecases",
    "counter-usecases",
    "settings-usecases",
    "trash-usecases",
    "reset-usecases",
    "today-usecases",
  ];

  describe("AC-1: app/ が 9 系統のユースケースモジュールを所管する", () => {
    it("server/src/app/ ディレクトリが存在する", () => {
      expect(exists("server/src/app")).toBe(true);
    });

    it.each(usecaseModules)("server/src/app/%s.ts が存在する", (name) => {
      expect(exists(`server/src/app/${name}.ts`)).toBe(true);
    });
  });

  describe("AC-2: ルータにドメイン / データアクセスの直接組み立てが残らない", () => {
    // auth は本 feature のスコープ外 (spec.md 非ゴール / FR-2) のため検証対象から除く.
    // _shared は presentational helper であり, ルータが呼ぶことは許容される.
    const refactoredRouters = [
      "tasks",
      "projects",
      "routines",
      "focus",
      "counter",
      "settings",
      "trash",
      "reset",
      "today",
    ].map((name) => `server/src/routers/${name}.ts`);

    it.each(refactoredRouters)("%s は @todica/domain/* を直接 import しない", (file) => {
      const specifiers = importSpecifiers(read(file));
      const domainImports = specifiers.filter((spec) => spec.startsWith("@todica/domain"));
      expect(domainImports).toEqual([]);
    });

    it.each(refactoredRouters)("%s は DB schema / drizzle を直接 import しない", (file) => {
      const specifiers = importSpecifiers(read(file));
      const dataLayerImports = specifiers.filter(
        (spec) =>
          spec.includes("/db/schema") || spec === "drizzle-orm" || spec.includes("/use-cases/"),
      );
      expect(dataLayerImports).toEqual([]);
    });

    it.each(
      refactoredRouters,
    )("%s は deps.db.transaction(...) でトランザクション境界を直接指定しない", (file) => {
      const source = read(file);
      expect(source).not.toMatch(/deps\.db\.transaction\s*\(/);
      expect(source).not.toMatch(/\.transaction\s*\(\s*\(/);
    });
  });

  describe("AC-3: アプリケーション層が API レイヤ (hono) に依存しない", () => {
    it.each(usecaseModules)("server/src/app/%s.ts が hono を import しない", (name) => {
      const file = `server/src/app/${name}.ts`;
      // app/ がまだ無い段階ではファイルが存在しないため, まず存在を要求する.
      // (存在しなければ AC-3 を検証しようがなく, 失敗させる.)
      expect(exists(file)).toBe(true);
      const specifiers = importSpecifiers(read(file));
      const honoImports = specifiers.filter((spec) => spec === "hono" || spec.startsWith("hono/"));
      expect(honoImports).toEqual([]);
    });
  });
});
