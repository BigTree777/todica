# タスク: SW ビルド deprecation warning の抑止 (BL-109)

> [`plan.md`](plan.md) を実行可能な単位に分解する. 完了したらチェックを入れる.
> TDD サイクル: test-designer が red を用意 → implementer が green 化 → auditor が検証.

## test-designer (失敗するテストを先に用意)

- [x] `web/__tests__/build-warning.test.ts` を新規作成する.
- [x] 単体テストケース 1: `customLogger.warn("inlineDynamicImports option is deprecated, please use codeSplitting: false instead.")` を呼ぶと, base logger の `warn` が呼ばれないこと (vi.spyOn で `createLogger()` の戻り値 or 別経路で base logger を spy する).
- [x] 単体テストケース 2: `customLogger.warn("foo bar baz")` を呼ぶと, base logger の `warn` がちょうど 1 回呼ばれること.
- [x] 単体テストケース 3: `customLogger` に `info` / `warn` / `warnOnce` / `error` / `clearScreen` / `hasErrorLogged` が関数として存在すること.
- [x] 単体テストケース 4: `customLogger.hasWarned` プロパティが取得可能であること (boolean).
- [x] 統合テストケース 5: `child_process.execSync("npm run build -w web", { cwd: repoRoot, encoding: "utf8" })` を実行し, stdout/stderr に `"inlineDynamicImports option is deprecated"` が含まれないこと. exit code 0 / `web/dist/` 配下に SW ファイルが存在することも検証. `testTimeout` を 120_000 ms に設定.
- [x] customLogger を import するため `web/vite.config.ts` に `export const customLogger` を生やすことを implementer に依頼 (タスク間連携). 暫定で `import { customLogger } from "../vite.config";` を書いて red を確認.
- [x] テストファイルを追加した状態で `npx vitest run web/__tests__/build-warning.test.ts` を実行し, 全ケース red (もしくは "customLogger が存在しない" による型エラー) であることを確認.

## implementer (テストを green 化)

- [x] `web/vite.config.ts` を編集.
  - [x] `vite` から `createLogger`, `Logger` 型を import 追加.
  - [x] `const baseLogger = createLogger();` を定義.
  - [x] `const SUPPRESSED_WARNING = "inlineDynamicImports option is deprecated";` を定義.
  - [x] `export const customLogger: Logger = { ... };` を定義. `info` / `warn` / `warnOnce` / `error` / `clearScreen` / `hasErrorLogged` を明示的に baseLogger に delegate. `hasWarned` は getter で baseLogger を参照.
  - [x] `warn(msg, options)` で `typeof msg === "string" && msg.includes(SUPPRESSED_WARNING)` の場合は早期 return.
  - [x] `defineConfig({ ..., customLogger })` に customLogger を渡す.
- [x] `npx vitest run web/__tests__/build-warning.test.ts` を実行し, 全ケース green.
- [x] `npx vitest run` を実行し, 既存全件 green を確認 (デグレなし).
- [x] `npm run typecheck` を実行し 0 エラー.
- [x] `npm run lint` を実行し 0 警告.
- [x] `npm run build -w web` を手動でも実行し, stdout/stderr に当該警告が現れないことを目視確認.
- [x] `npx playwright test pwa-prod.spec.ts` を実行し green を確認 (build artifact が壊れていないこと).

## auditor (受け入れ基準と品質を検証)

- [x] spec.md の 5 シナリオが全て満たされていることを確認.
- [x] `web/vite.config.ts` の変更が customLogger の追加と export 以外に副作用を含まないことを diff で確認.
- [x] `web/dist/sw.js` の build 前後 hash 差分 (任意, できる範囲で) または artifact 構成が同一であることを spot check.
- [x] vitest 全件 green / Playwright `pwa-prod.spec.ts` green / typecheck 0 / lint 0 を確認.
- [x] 新規 dependency 追加が無いこと (`web/package.json` の diff が無いこと) を確認.
- [x] backlog `BL-109` のステータス更新と PR 説明文の妥当性を確認.

## ドキュメント

- [x] backlog (`docs/developer/planning/backlog.md`) の BL-109 を `Doing` → `Done` に進める (implementer or auditor がフロー終盤で実施).
- [x] 仕様適合の最終確認のため `docs/developer/features/sw-build-warning-cleanup/spec.md` の状態を `確定` のまま維持 (修正不要).

## 仕上げ

- [x] 受け入れ基準 (spec.md) を全て満たすことを確認.
- [x] feature ブランチで PR を作成し, auditor 承認後に main へマージ.
