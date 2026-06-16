// @vitest-environment node

/**
 * 受け入れ基準テスト: lint / typecheck 修復 (BL-048)
 *
 * 仕様参照:
 *   docs/developer/features/lint-typecheck-repair/spec.md
 *
 * 本ファイルが検証する受け入れ基準:
 *   シナリオ 1: lint が通る
 *     Given リポジトリのルートディレクトリにいる
 *     When  npm run lint を実行する
 *     Then  exit 0 で完了し、errors 件数が 0 である
 *
 *   シナリオ 2: typecheck が通る
 *     Given リポジトリのルートディレクトリにいる
 *     When  npm run typecheck を実行する
 *     Then  exit 0 で完了し、TS エラーが出力されない
 *
 *   シナリオ 3: Capacitor ビルド成果物が lint 対象から除外される
 *     Given biome.json の files.includes に android/app/src/main/assets/public/ が含まれている
 *     When  npm run lint を実行する
 *     Then  android/app/src/main/assets/public/ 配下のファイルへの診断が出力されない
 *
 *   シナリオ 4: domain/__tests__ が typecheck で TS6059 を起こさない
 *     Given domain/tsconfig.json が __tests__/ の rootDir 問題を解消している
 *     When  npm run typecheck を実行する
 *     Then  TS6059 エラーが出力されない
 *
 *   シナリオ 5: server / web から domain への project reference が解決できる
 *     Given domain/tsconfig.json が composite モードで declaration を emit できる状態である
 *     When  npm run typecheck を実行する
 *     Then  TS6310 エラーが出力されない
 *
 *   シナリオ 6: 既存テストが壊れない
 *     Given lint / typecheck 修正後のコードベース
 *     When  npx vitest run domain/__tests__/ を実行する（npm test の再帰呼び出しを避けるため代表スイートで確認）
 *     Then  すべてのテストが pass する
 *
 * TDD の "red" を作るためのテスト:
 *   - 現時点では npm run lint は 346 errors で失敗し、npm run typecheck は TS6059/TS6310 で失敗する。
 *   - 実装者がこのテストを green 化する。
 */

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// リポジトリルートを cwd として指定する（web/__tests__/ から 2 階層上）
const repoRoot = resolve(__dirname, "../..");

// execSync でコマンドを実行し、{ stdout, stderr, status } を返すヘルパー
// exit 0 以外でも例外を投げず、終了ステータスとともに出力を返す
function runCommand(cmd: string): { stdout: string; stderr: string; exitCode: number } {
  try {
    const stdout = execSync(cmd, {
      cwd: repoRoot,
      encoding: "utf-8",
      // 子プロセスが非 0 終了しても例外にする（後で catch して status を取得）
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

describe("lint / typecheck 修復 (BL-048)", () => {
  /**
   * シナリオ 1: lint が通る
   *   spec.md 受け入れ基準: npm run lint が exit 0 で完了し、errors 件数が 0 である
   *
   * 現状: 346 errors で失敗 → 実装前はこのテストが red になる
   */
  describe("シナリオ 1: npm run lint が通る", () => {
    it("npm run lint が exit 0 で完了する", () => {
      // lint の実行時間を考慮してタイムアウトを長めに設定する
      const result = runCommand("npm run lint");
      expect(
        result.exitCode,
        `npm run lint が exit ${result.exitCode} で終了しました。\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
      ).toBe(0);
    }, 60_000); // biome が大量のファイルを処理するため 60 秒のタイムアウトを設定する

    it("npm run lint の出力に 'found X error(s)' の error 件数が 0 である", () => {
      const result = runCommand("npm run lint");
      // biome の出力形式: "Found X error(s) in Y file(s)" — errors が 1 件以上なら red
      const errorMatch = result.stdout.match(/(\d+)\s+error/i);
      if (errorMatch) {
        const errorCount = Number.parseInt(errorMatch[1] ?? "0", 10);
        expect(errorCount, `lint errors が ${errorCount} 件残っています`).toBe(0);
      }
      // エラー件数の記述がなければ exit コードで判断する（上のテストで担保）
    }, 60_000);
  });

  /**
   * シナリオ 2: typecheck が通る
   *   spec.md 受け入れ基準: npm run typecheck が exit 0 で完了し、TS エラーが出力されない
   *
   * 現状: TS6059 × 2 / TS6310 × 2 で失敗 → 実装前はこのテストが red になる
   */
  describe("シナリオ 2: npm run typecheck が通る", () => {
    it("npm run typecheck が exit 0 で完了する", () => {
      const result = runCommand("npm run typecheck");
      expect(
        result.exitCode,
        `npm run typecheck が exit ${result.exitCode} で終了しました。\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
      ).toBe(0);
    }, 120_000); // tsc -b は複数パッケージをビルドするため 120 秒のタイムアウトを設定する
  });

  /**
   * シナリオ 3: Capacitor ビルド成果物が lint 対象から除外される
   *   spec.md 受け入れ基準:
   *     Given biome.json の files.includes に android/app/src/main/assets/public/ が含まれている
   *     Then  android/app/src/main/assets/public/ 配下のファイルへの診断が出力されない
   *
   * このシナリオはコマンド実行前に biome.json の設定内容を静的検証する
   */
  describe("シナリオ 3: Capacitor ビルド成果物が lint 対象から除外される", () => {
    it("biome.json の files.includes に android/app/src/main/assets/public が含まれている", () => {
      const biomeJsonPath = resolve(repoRoot, "biome.json");
      const biomeConfig = JSON.parse(readFileSync(biomeJsonPath, "utf-8"));

      // biome 2 では files.includes の負のグロブ ("!...") で除外を表現する
      const includesPatterns: string[] = biomeConfig?.files?.includes ?? [];
      const hasCapacitorPath = includesPatterns.some(
        (pattern) =>
          pattern.startsWith("!") && pattern.includes("android/app/src/main/assets/public"),
      );
      expect(
        hasCapacitorPath,
        `biome.json の files.includes に android/app/src/main/assets/public の除外パターンが含まれていません。現在の files.includes: ${JSON.stringify(includesPatterns)}`,
      ).toBe(true);
    });

    it("npm run lint の出力に android/app/src/main/assets/public/ への診断が含まれない", () => {
      const result = runCommand("npm run lint");
      // biome が lint 違反を出力する際にファイルパスを含むため、パスが出力に含まれないことを確認する
      expect(
        result.stdout,
        "android/app/src/main/assets/public/ への診断が出力されています",
      ).not.toContain("android/app/src/main/assets/public");
      expect(
        result.stderr,
        "android/app/src/main/assets/public/ への診断が出力されています",
      ).not.toContain("android/app/src/main/assets/public");
    }, 60_000);
  });

  /**
   * シナリオ 4: domain/__tests__ が typecheck で TS6059 を起こさない
   *   spec.md 受け入れ基準:
   *     Given domain/tsconfig.json が __tests__/ の rootDir 問題を解消している
   *     Then  TS6059 エラーが出力されない
   *
   * plan.md の採用方針: domain/tsconfig.test.json を分離し、composite ビルドから __tests__/ を切り出す
   */
  describe("シナリオ 4: TS6059 エラーが出力されない", () => {
    it("domain/tsconfig.json の include に __tests__/**/*.ts が含まれていない", () => {
      const domainTsConfigPath = resolve(repoRoot, "domain/tsconfig.json");
      const tsConfig = JSON.parse(readFileSync(domainTsConfigPath, "utf-8"));

      // composite ビルド対象の include に __tests__/ が含まれていないことを確認する
      const includePatterns: string[] = tsConfig?.include ?? [];
      const hasTestsInInclude = includePatterns.some((pattern) => pattern.includes("__tests__"));
      expect(
        hasTestsInInclude,
        `domain/tsconfig.json の include に __tests__/ が含まれています。plan.md の方針に従い tsconfig.test.json に分離してください。現在の include: ${JSON.stringify(includePatterns)}`,
      ).toBe(false);
    });

    it("npm run typecheck の出力に TS6059 エラーが含まれない", () => {
      const result = runCommand("npm run typecheck");
      expect(
        result.stdout + result.stderr,
        "TS6059 エラーが出力されています（rootDir の外にファイルがあります）",
      ).not.toContain("TS6059");
    }, 120_000);
  });

  /**
   * シナリオ 5: server / web から domain への project reference が解決できる
   *   spec.md 受け入れ基準:
   *     Given domain/tsconfig.json が composite モードで declaration を emit できる状態である
   *     Then  TS6310 エラーが出力されない
   */
  describe("シナリオ 5: TS6310 エラーが出力されない", () => {
    it("domain/tsconfig.json に composite: true が設定されている", () => {
      const domainTsConfigPath = resolve(repoRoot, "domain/tsconfig.json");
      const tsConfig = JSON.parse(readFileSync(domainTsConfigPath, "utf-8"));

      // composite: true がないと server/web からの project reference が解決できない
      expect(
        tsConfig?.compilerOptions?.composite,
        "domain/tsconfig.json に composite: true が設定されていません",
      ).toBe(true);
    });

    it("domain/tsconfig.json に noEmit: false が設定されているか、noEmit が設定されていない", () => {
      const domainTsConfigPath = resolve(repoRoot, "domain/tsconfig.json");
      const tsConfig = JSON.parse(readFileSync(domainTsConfigPath, "utf-8"));

      // composite ビルドは declaration の emit が必須のため noEmit は false または未設定であること
      const noEmit = tsConfig?.compilerOptions?.noEmit;
      expect(
        noEmit === false || noEmit === undefined,
        `domain/tsconfig.json の noEmit が ${noEmit} になっています。composite ビルドでは false または未設定にする必要があります`,
      ).toBe(true);
    });

    it("npm run typecheck の出力に TS6310 エラーが含まれない", () => {
      const result = runCommand("npm run typecheck");
      expect(
        result.stdout + result.stderr,
        "TS6310 エラーが出力されています（project reference が emit を参照できません）",
      ).not.toContain("TS6310");
    }, 120_000);
  });

  /**
   * シナリオ 6: 既存テストが壊れない
   *   spec.md 受け入れ基準: typecheck / lint 修正後も既存テストが全て pass する
   *
   * npm test の再帰呼び出しを避けるため、domain/__tests__/ を代表スイートとして実行する。
   * （lint-typecheck-repair.test.ts 自身を含む全スイートは CI / 手動で確認する）
   */
  describe("シナリオ 6: 既存テストが壊れない", () => {
    it("domain/__tests__/ の vitest テストが全て pass する", () => {
      const result = runCommand("npx vitest run domain/__tests__/");
      expect(
        result.exitCode,
        `domain テストが失敗しています:\n${result.stdout}\n${result.stderr}`,
      ).toBe(0);
    }, 120_000);
  });
});
