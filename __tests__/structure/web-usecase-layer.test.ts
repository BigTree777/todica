import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * BL-118 Web mutation のアプリケーション層への移設 — 構造的受け入れ基準の静的検証.
 *
 * 仕様: docs/developer/features/web-mutation-application-layer/spec.md
 *   - AC-0: web/src/usecases/ に task/project/routine/trash/settings の各 *-usecases.ts が存在する.
 *   - AC-1: 対象 8 view が "@tanstack/react-query" から useMutation を import せず,
 *           useMutation( の直接構成も持たない.
 *   - AC-2: 対象 8 view (settings-view 含む) が衝突例外型
 *           (OptimisticLockError / ProjectConflictError / RoutineConflictError /
 *            RestoreConflictError / PatchConflictError) と
 *           "../../offline-queue.js" を直接 import しない.
 *   - AC-3: usecases/*-usecases.ts が ui/ 配下を import しない (UI 非依存).
 *
 * 移設前の現状では usecases モジュールが未作成で, view 側に useMutation / 衝突例外型 /
 * offline-queue の直接 import が残るため, AC-0 / AC-1 / AC-2 は意図的に red になる
 * (TDD の失敗するテスト). AC-3 は usecases モジュール未作成のため存在検証段階で red になる.
 *
 * 静的走査の方針は BL-115 の __tests__/structure/server-app-layer.test.ts を踏襲する
 * (AST は使わず import 文・ソース文字列を正規表現で走査する / D-6).
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

/**
 * import 文を「named バインディング集合」と「モジュール指定子」の組として抽出する.
 *
 * AC-2 は「型を prop として import する (Project / ProjectRepository 等) のは許容し,
 * 衝突例外型の named import だけを禁止する」要件 (spec NFR-2) のため,
 * モジュールパス単位ではなく import される識別子単位で判定する必要がある.
 * 例: projects-view は同じ project-repository.js から ProjectRepository (許容) と
 *     ProjectConflictError (禁止) の双方を import している.
 */
interface ParsedImport {
  /** import { a, b } / import { type a } の中括弧内に現れる識別子 (型インポート含む). */
  names: string[];
  /** from の後ろのモジュール指定子. */
  specifier: string;
}

function parseImports(source: string): ParsedImport[] {
  const results: ParsedImport[] = [];
  // import { ... } from "..."; / import x, { ... } from "..."; / import type { ... } from "...";
  const namedRe = /import\s+(?:type\s+)?(?:[\w$]+\s*,\s*)?\{([^}]*)\}\s*from\s*["']([^"']+)["']/g;
  for (const match of source.matchAll(namedRe)) {
    const inside = match[1];
    const specifier = match[2];
    const names = inside
      .split(",")
      .map((part) => part.trim())
      .filter((part) => part.length > 0)
      // `type Foo` / `Foo as Bar` を識別子名へ正規化する.
      .map((part) =>
        part
          .replace(/^type\s+/, "")
          .split(/\s+as\s+/)[0]
          .trim(),
      )
      .filter((part) => part.length > 0);
    results.push({ names, specifier });
  }
  return results;
}

describe("BL-118 Web mutation アプリケーション層の構造的制約", () => {
  // AC-0: web/src/usecases/ 配下に存在すべき entity 系統別ユースケースモジュール (spec FR-1).
  const usecaseModules = [
    "task-usecases",
    "project-usecases",
    "routine-usecases",
    "trash-usecases",
    "settings-usecases",
  ];

  // AC-1 / AC-2 の検査対象 view (settings-view / project-create-dialog を含む 8 ファイル).
  const targetViews = [
    "web/src/ui/today-view/today-view.tsx",
    "web/src/ui/tomorrow-view/tomorrow-view.tsx",
    "web/src/ui/focus-view/focus-view.tsx",
    "web/src/ui/projects-view/projects-view.tsx",
    "web/src/ui/routines-view/routines-view.tsx",
    "web/src/ui/trash-view/trash-view.tsx",
    "web/src/ui/settings-view/settings-view.tsx",
    "web/src/ui/project-create-dialog/project-create-dialog.tsx",
  ];

  // AC-2: 直接 import を禁止する衝突例外型 (spec FR-5b / NFR-2).
  // Repository 型 (Project / ProjectRepository 等) は prop 型として import 許容のため含めない.
  const forbiddenConflictTypes = [
    "OptimisticLockError",
    "ProjectConflictError",
    "RoutineConflictError",
    "RestoreConflictError",
    "PatchConflictError",
  ];

  describe("AC-0: usecases/ が entity 系統別ユースケースモジュールを所管する", () => {
    it("web/src/usecases/ ディレクトリが存在する", () => {
      expect(exists("web/src/usecases")).toBe(true);
    });

    it.each(usecaseModules)("web/src/usecases/%s.ts が存在する", (name) => {
      expect(exists(`web/src/usecases/${name}.ts`)).toBe(true);
    });
  });

  describe("AC-1: view 層が useMutation を直接構成しない", () => {
    it.each(
      targetViews,
    )("%s は @tanstack/react-query から useMutation を import しない", (file) => {
      const reactQueryImports = parseImports(read(file)).filter(
        (entry) => entry.specifier === "@tanstack/react-query",
      );
      const importedNames = reactQueryImports.flatMap((entry) => entry.names);
      expect(importedNames).not.toContain("useMutation");
    });

    it.each(targetViews)("%s に useMutation( の直接呼び出しが存在しない", (file) => {
      const source = read(file);
      // コメント / JSDoc 中の "useMutation" 言及で誤検出しないよう, 呼び出し形のみ判定する.
      expect(source).not.toMatch(/useMutation\s*\(/);
    });
  });

  describe("AC-2: view 層が衝突例外型 / offline-queue を直接 import しない", () => {
    it.each(targetViews)("%s は衝突例外型を直接 import しない", (file) => {
      const importedNames = parseImports(read(file)).flatMap((entry) => entry.names);
      const leaked = importedNames.filter((name) => forbiddenConflictTypes.includes(name));
      expect(leaked).toEqual([]);
    });

    it.each(targetViews)('%s は "../../offline-queue.js" を直接 import しない', (file) => {
      const specifiers = importSpecifiers(read(file));
      const offlineQueueImports = specifiers.filter((spec) => spec.includes("offline-queue"));
      expect(offlineQueueImports).toEqual([]);
    });
  });

  describe("AC-3: ユースケースが UI (ui/ 配下) に依存しない", () => {
    it.each(usecaseModules)("web/src/usecases/%s.ts が ui/ 配下を import しない", (name) => {
      const file = `web/src/usecases/${name}.ts`;
      // usecases モジュール未作成の段階ではファイルが無く AC-3 を検証しようがないため,
      // まず存在を要求して red にする (AC-0 と同じ理由).
      expect(exists(file)).toBe(true);
      const specifiers = importSpecifiers(read(file));
      const uiImports = specifiers.filter(
        (spec) => spec.includes("/ui/") || spec.startsWith("../ui/") || spec === "../ui",
      );
      expect(uiImports).toEqual([]);
    });
  });

  describe("ガード: 検査対象 view ファイルが実在する (パスずれ検出)", () => {
    it.each(targetViews)("%s が存在する", (file) => {
      expect(exists(file)).toBe(true);
    });
  });

  describe("ガード: local-reset-usecase 以外の新規モジュールを誤って見落とさない", () => {
    it("usecases/ ディレクトリが列挙可能になったとき *-usecases.ts が 5 本以上ある", () => {
      // AC-0 充足後の回帰用. usecases/ 未作成の段階ではこの assertion 手前で
      // ディレクトリ不在のため例外となり red になる.
      const dir = resolve(repoRoot, "web/src/usecases");
      const files = readdirSync(dir).filter((name) => name.endsWith("-usecases.ts"));
      // local-reset-usecase.ts は本 feature スコープ外だが命名規約上ヒットするため,
      // 5 本 (task/project/routine/trash/settings) + local-reset = 6 本以上を期待する.
      expect(files.length).toBeGreaterThanOrEqual(usecaseModules.length);
    });
  });
});
