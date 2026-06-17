// @vitest-environment node

/**
 * 受け入れ基準テスト: SW ビルド deprecation warning の抑止 (BL-109)
 *
 * 仕様参照:
 *   docs/developer/features/sw-build-warning-cleanup/spec.md
 *   docs/developer/features/sw-build-warning-cleanup/plan.md
 *
 * 確定方針: (c) Vite `customLogger` で当該 warning のみ抑止.
 *
 * 本ファイルが検証する受け入れ基準シナリオ:
 *   シナリオ 1: production build から deprecation warning が消える
 *     Given web/vite.config.ts に customLogger が設定されている
 *     When  リポジトリルートから `npm run build -w web` を実行する
 *     Then  stdout / stderr いずれにも文字列 "inlineDynamicImports option is deprecated" が現れない
 *      And  exit code は 0
 *      And  web/dist/ 配下に SW ファイルが生成されている
 *
 *   シナリオ 2: 他の warning は従来通り出力される
 *     Given customLogger が当該文字列のみフィルタする実装である
 *     When  ダミーの warning ("foo bar baz") を customLogger.warn に渡す
 *     Then  base logger の warn が 1 回呼ばれる
 *
 *   シナリオ 3: 当該 warning は base logger に渡らない
 *     Given customLogger が当該文字列のみフィルタする実装である
 *     When  "inlineDynamicImports option is deprecated, ..." を customLogger.warn に渡す
 *     Then  base logger の warn は呼ばれない
 *
 *   シナリオ 4: Logger interface のメソッドが欠落していない
 *     Given customLogger オブジェクト
 *     Then  info / warn / warnOnce / error / clearScreen / hasErrorLogged が関数として定義されている
 *      And  hasWarned プロパティを持つ
 *
 *   シナリオ 5: customLogger が vite.config.ts から名前付き export されている
 *     Given plan.md の方針 (単体テスト用に customLogger を named export する)
 *     Then  web/vite.config.ts の文面に `export const customLogger` が含まれる
 *      And  当該フィルタ文字列が web/vite.config.ts に文面として含まれる
 *
 * TDD の "red" を作るためのテスト:
 *   - 実装前は web/vite.config.ts に customLogger が無いため,
 *     文面 assert / customLogger import のテストが red になる.
 *   - `npm run build -w web` の出力にも当該 deprecation warning が残るため,
 *     統合テストも red になる.
 *   - 実装者がこのテストを green 化する.
 */

import { execSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it, vi } from "vitest";

// リポジトリルートを cwd として指定する (web/__tests__/ から 2 階層上)
const repoRoot = resolve(__dirname, "../..");
const webDir = resolve(repoRoot, "web");
const viteConfigPath = resolve(webDir, "vite.config.ts");
const webDistDir = resolve(webDir, "dist");

const SUPPRESSED_WARNING = "inlineDynamicImports option is deprecated";

/**
 * `web/vite.config.ts` から名前付き export `customLogger` を取得する.
 *
 * `tsconfig.json` の include に `vite.config.ts` を入れていないため,
 * 直接 `import("../vite.config")` すると `TS6307` (Project には含まれないファイル) になる.
 * `pathToFileURL` + 文字列変数 経由で動的 import することで tsc の resolution を回避する.
 */
async function loadViteConfigModule(): Promise<Record<string, unknown>> {
  const url = pathToFileURL(viteConfigPath).href;
  return (await import(/* @vite-ignore */ url)) as Record<string, unknown>;
}
/**
 * build 出力に現れる 2 種類の warning format を両方検出する正規表現.
 * - Vite logger 経由: `WARN  inlineDynamicImports option is deprecated, ...`
 * - Rollup/rolldown 直接: ``[warn] `inlineDynamicImports` option is deprecated, ...``
 */
const SUPPRESSED_WARNING_PATTERN = /inlineDynamicImports`?\s+option is deprecated/;

/**
 * execSync で build コマンドを実行し, {stdout, stderr, exitCode} を返すヘルパー.
 * exit 0 以外でも例外を投げず, 終了ステータスとともに出力を返す.
 *
 * 注意: Vite (および vite-plugin-pwa 経由の Vite programmatic 呼び出し) は,
 * stdout が non-TTY のとき一部の warning を抑止する.
 * このため `npm run build -w web` を素の execSync (pipe) で起動しても,
 * 当該 deprecation warning は capture されない (false negative になる).
 * spec.md「stdout / stderr いずれにも文字列が現れない」を正しく検証するには,
 * util-linux の `script(1)` を介して TTY を割り当てて起動する必要がある.
 * `script` が無い環境 (macOS の `script` は別仕様, BSD 系) では skip する.
 */
function runCommand(cmd: string): { stdout: string; stderr: string; exitCode: number } {
  try {
    const stdout = execSync(cmd, {
      cwd: repoRoot,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { stdout, stderr: "", exitCode: 0 };
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return {
      stdout: err.stdout ?? "",
      stderr: err.stderr ?? "",
      exitCode: err.status ?? 1,
    };
  }
}

/**
 * util-linux 版 `script(1)` が使えるかを判定する.
 * `-qfec '<cmd>' <typescript>` 形式 (Linux GNU 版) のみを許容する.
 * BSD 系 (macOS デフォルト) は引数仕様が異なるため利用不可と扱う.
 */
function isLinuxScriptAvailable(): boolean {
  try {
    const help = execSync("script --version", {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return /util-linux/i.test(help);
  } catch {
    return false;
  }
}

/**
 * util-linux `script(1)` で TTY を割り当てて build を実行し, 出力を取得する.
 * 出力には ANSI エスケープが含まれるため呼び出し側で文字列検索する.
 *
 * 注意: vitest 子プロセス内では NODE_ENV=test など Vite / Rollup の挙動を
 * 変える環境変数が継承される. spec.md が示す "WARN inlineDynamicImports option ..."
 * の format は production build (NODE_ENV 未設定 もしくは production) で出力されるため,
 * NODE_ENV / VITEST 系の変数を明示的に削除して呼び出す.
 */
function runCommandWithPty(cmd: string): { output: string; exitCode: number } {
  // typescript ファイルを /dev/null に捨てつつ stdout は capture する.
  // -q: quiet, -f: flush, -e: 子プロセスの exit code を伝搬, -c: 実行コマンド.
  const cleanedEnv = { ...process.env };
  for (const key of ["NODE_ENV", "VITEST", "VITEST_POOL_ID", "VITEST_WORKER_ID"]) {
    delete cleanedEnv[key];
  }
  try {
    const output = execSync(`script -qfec ${JSON.stringify(cmd)} /dev/null`, {
      cwd: repoRoot,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      maxBuffer: 32 * 1024 * 1024,
      env: cleanedEnv,
    });
    return { output, exitCode: 0 };
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return {
      output: (err.stdout ?? "") + (err.stderr ?? ""),
      exitCode: err.status ?? 1,
    };
  }
}

/**
 * dist 配下の SW (vite-plugin-pwa が生成する service worker) を探す.
 * filename は `service-worker.ts` を指定しているため build 後は `service-worker.js`,
 * vite-plugin-pwa のバージョンや format によっては `sw.js` のこともあるため
 * いずれかが存在することで OK とする.
 */
function findServiceWorkerFile(): string | null {
  if (!existsSync(webDistDir)) return null;
  const entries = readdirSync(webDistDir);
  for (const name of entries) {
    if (name === "service-worker.js" || name === "sw.js") {
      return resolve(webDistDir, name);
    }
  }
  return null;
}

describe("SW ビルド deprecation warning の抑止 (BL-109)", () => {
  /**
   * シナリオ 5 (静的検証): customLogger が vite.config.ts に定義され, 名前付き export されている.
   * - plan.md: 「新規ファイル追加を避けて vite.config.ts から `export const customLogger` を生やす」.
   * - 文面 assert により, 実装前は red になる.
   */
  describe("シナリオ 5: web/vite.config.ts に customLogger が定義されている (文面 assert)", () => {
    it("web/vite.config.ts に `customLogger` という識別子を含む export が定義されている", () => {
      const content = readFileSync(viteConfigPath, "utf-8");
      // `export const customLogger` または `export { customLogger }` を許容する.
      const hasNamedExport =
        /export\s+const\s+customLogger\b/.test(content) ||
        /export\s*\{[^}]*\bcustomLogger\b[^}]*\}/.test(content);
      expect(
        hasNamedExport,
        "web/vite.config.ts に customLogger の名前付き export が定義されていません. " +
          "plan.md の方針に従い `export const customLogger = ...` を追加してください.",
      ).toBe(true);
    });

    it("web/vite.config.ts に当該 deprecation warning のフィルタ文字列が含まれる", () => {
      const content = readFileSync(viteConfigPath, "utf-8");
      expect(
        content,
        `web/vite.config.ts に "${SUPPRESSED_WARNING}" の文字列が見つかりません. ` +
          "REQ-002 で要求されているフィルタ条件が実装されていません.",
      ).toContain(SUPPRESSED_WARNING);
    });

    it("web/vite.config.ts に Vite の createLogger() 呼び出しが含まれる", () => {
      const content = readFileSync(viteConfigPath, "utf-8");
      expect(
        content,
        "web/vite.config.ts に createLogger() の呼び出しが含まれません. " +
          "REQ-001 に従い base logger を createLogger() で生成してください.",
      ).toMatch(/createLogger\s*\(/);
    });

    it("defineConfig に customLogger オプションが渡されている", () => {
      const content = readFileSync(viteConfigPath, "utf-8");
      // defineConfig(...) の引数オブジェクト内に customLogger key が現れることを確認する.
      // 厳密 AST 解析はせず, 文面上 `customLogger` が defineConfig より後方に出現することで近似する.
      const defineConfigIdx = content.indexOf("defineConfig");
      const customLoggerKeyIdx = content.indexOf("customLogger");
      expect(defineConfigIdx, "defineConfig が見つかりません").toBeGreaterThanOrEqual(0);
      expect(customLoggerKeyIdx, "customLogger が見つかりません").toBeGreaterThanOrEqual(0);
      // defineConfig オプションとして渡されている (= defineConfig より後ろの行に customLogger key がある)
      expect(
        customLoggerKeyIdx,
        "customLogger が defineConfig のオプションとして渡されていません.",
      ).toBeGreaterThan(defineConfigIdx);
    });
  });

  /**
   * シナリオ 2 / 3 / 4: customLogger の単体テスト.
   * vite.config.ts から `customLogger` を named import する.
   * 実装前は import 失敗 (or undefined) で red になる.
   */
  describe("シナリオ 2 / 3 / 4: customLogger の単体テスト", () => {
    it("vite.config.ts から customLogger を named import できる", async () => {
      // 実装前: customLogger が存在しないため undefined になる.
      const mod = await loadViteConfigModule();
      expect(
        mod.customLogger,
        "vite.config.ts から customLogger を named import できません. " +
          "`export const customLogger = ...` を追加してください.",
      ).toBeDefined();
    });

    it("シナリオ 3: 当該 warning を渡しても base logger.warn が呼ばれない", async () => {
      const mod = await loadViteConfigModule();
      const customLogger = mod.customLogger as
        | {
            warn: (msg: string, opts?: unknown) => void;
          }
        | undefined;
      // 実装前は customLogger が undefined なのでこの時点で red.
      expect(customLogger, "customLogger が未実装です").toBeDefined();
      if (!customLogger) return;

      // vite の createLogger() を取得して base.warn を spy する手段は実装に依存するため,
      // ここでは customLogger.warn が当該文字列で「副作用 (stderr 出力など) を起こさない」
      // ことを stderr / stdout のキャプチャで確認する.
      const stderrWrite = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
      const stdoutWrite = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
      let stderrWrites = "";
      let stdoutWrites = "";
      try {
        customLogger.warn(`${SUPPRESSED_WARNING}, please use codeSplitting: false instead.`);
        // Vitest 4: `mockRestore()` を呼ぶと `.mock.calls` が空になるため,
        // restore より前に mock.calls の中身を文字列として確定させておく.
        stderrWrites = stderrWrite.mock.calls.map((c) => String(c[0])).join("");
        stdoutWrites = stdoutWrite.mock.calls.map((c) => String(c[0])).join("");
      } finally {
        stderrWrite.mockRestore();
        stdoutWrite.mockRestore();
      }
      expect(
        stderrWrites + stdoutWrites,
        "当該 deprecation warning が base logger に渡って stdout / stderr に出力されています. " +
          "filter 条件を見直してください.",
      ).not.toContain(SUPPRESSED_WARNING);
    });

    it("シナリオ 2: フィルタ対象外の warning は base logger に委譲され出力される", async () => {
      const mod = await loadViteConfigModule();
      const customLogger = mod.customLogger as
        | {
            warn: (msg: string, opts?: unknown) => void;
          }
        | undefined;
      expect(customLogger, "customLogger が未実装です").toBeDefined();
      if (!customLogger) return;

      const stderrWrite = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
      const stdoutWrite = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
      const marker = "todica-bl109-dummy-warning-marker";
      let allWrites = "";
      try {
        customLogger.warn(`foo bar baz ${marker}`);
        // Vitest 4: `mockRestore()` を呼ぶと `.mock.calls` が空になるため,
        // restore より前に mock.calls の中身を文字列として確定させておく.
        allWrites =
          stderrWrite.mock.calls.map((c) => String(c[0])).join("") +
          stdoutWrite.mock.calls.map((c) => String(c[0])).join("");
      } finally {
        stderrWrite.mockRestore();
        stdoutWrite.mockRestore();
      }
      expect(
        allWrites,
        "フィルタ対象外の warning が base logger に委譲されていません. " +
          "他の警告まで握り潰している可能性があります.",
      ).toContain(marker);
    });

    it("シナリオ 4: Logger interface の主要メソッド / プロパティが揃っている", async () => {
      const mod = await loadViteConfigModule();
      const customLogger = mod.customLogger as Record<string, unknown> | undefined;
      expect(customLogger, "customLogger が未実装です").toBeDefined();
      if (!customLogger) return;

      // spec REQ-003: Logger interface のメソッドを完全に満たす.
      for (const method of ["info", "warn", "warnOnce", "error", "clearScreen", "hasErrorLogged"]) {
        expect(
          typeof customLogger[method],
          `customLogger.${method} が関数として定義されていません.`,
        ).toBe("function");
      }
      // hasWarned は getter プロパティ. boolean が読み取れることを確認する.
      expect(
        "hasWarned" in customLogger,
        "customLogger に hasWarned プロパティが存在しません.",
      ).toBe(true);
      expect(typeof customLogger.hasWarned).toBe("boolean");
    });
  });

  /**
   * シナリオ 1 (統合): `npm run build -w web` の出力に当該 deprecation warning が現れない.
   * - plan.md「統合テスト (vitest, 1 ケースだけ)」に対応.
   * - build に時間がかかるため timeout を長めに設定する.
   * - 環境変数 SKIP_BUILD_INTEGRATION=1 で skip 可能 (CI 制約時の安全弁).
   * - Vite は non-TTY 環境では当該 warning を抑止するため,
   *   util-linux `script(1)` で TTY を割り当てて起動する.
   *   `script` が無い (macOS など BSD 仕様) 環境では skip する.
   */
  describe("シナリオ 1: npm run build -w web の出力から deprecation warning が消える", () => {
    const skip = process.env.SKIP_BUILD_INTEGRATION === "1" || !isLinuxScriptAvailable();

    it.skipIf(skip)(
      "npm run build -w web の出力 (TTY 経由) に当該 warning が含まれない",
      () => {
        const result = runCommandWithPty("npm run build -w web");
        expect(
          result.output,
          `npm run build -w web の出力に "${SUPPRESSED_WARNING}" 相当の文字列が含まれています. ` +
            "customLogger のフィルタが効いていません.\n" +
            `output (末尾 2000 文字):\n${result.output.slice(-2000)}`,
        ).not.toMatch(SUPPRESSED_WARNING_PATTERN);
      },
      180_000,
    );

    it.skipIf(skip)(
      "npm run build -w web が exit 0 で完了する",
      () => {
        const result = runCommandWithPty("npm run build -w web");
        expect(
          result.exitCode,
          `npm run build -w web が exit ${result.exitCode} で終了しました.\n` +
            `output (末尾 2000 文字):\n${result.output.slice(-2000)}`,
        ).toBe(0);
      },
      180_000,
    );

    it.skipIf(skip)(
      "web/dist/ 配下に SW ファイル (service-worker.js もしくは sw.js) が生成される",
      () => {
        // 直前のテストで build が走っている前提だが, 単独実行されてもよいように一度走らせる.
        runCommand("npm run build -w web");
        const swPath = findServiceWorkerFile();
        expect(
          swPath,
          `web/dist/ 配下に SW ファイルが見つかりません. dist 一覧: ${
            existsSync(webDistDir) ? readdirSync(webDistDir).join(", ") : "(dist 未生成)"
          }`,
        ).not.toBeNull();
      },
      180_000,
    );
  });
});
