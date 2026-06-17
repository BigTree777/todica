# 設計・実装計画: SW ビルド deprecation warning の抑止 (BL-109)

> [`spec.md`](spec.md) の要件を, どう実現するかに落とす.

## 方針概要

Vite の `defineConfig` に `customLogger` を渡し, `vite.createLogger()` で生成した base logger を base にして `warn` のみラップする.
`msg` に `inlineDynamicImports option is deprecated` が含まれる場合のみ無視し, それ以外は base logger に委譲する.
これにより `vite-plugin-pwa` が SW ビルドで吐く 1 行の deprecation warning だけが消え, 他の出力は変わらない.

## 影響範囲

| 領域 | 変更内容 |
| --- | --- |
| API | 変更なし |
| DB | 変更なし |
| モジュール (`web/`) | `web/vite.config.ts` に `customLogger` を追加 (1 ファイル) |
| UI | 変更なし |
| ビルド | `npm run build` の stdout から当該 deprecation warning が消える. artifact は不変 |
| テスト | `web/__tests__/build-warning.test.ts` を新規追加 (vitest 配下, 単体テスト + 1 ケース統合テスト) |

## 設計詳細

### データモデル

- なし.

### 処理フロー (build 時)

1. Vite が `defineConfig` を読む.
2. `customLogger` として「base logger (`createLogger()`) をラップしたオブジェクト」を渡す.
3. `vite-plugin-pwa` が SW ビルドを開始し, 内部で `inlineDynamicImports` warning を `config.logger.warn(msg)` で出力しようとする.
4. ラップした `warn` が `msg` を検査:
   - `"inlineDynamicImports option is deprecated"` を含む → 何もしない (return).
   - それ以外 → `base.warn(msg, options)` に委譲.
5. 他の `info` / `error` / `warnOnce` / `clearScreen` / `hasErrorLogged` / getter `hasWarned` は base にそのまま委譲する.

### 実装スケッチ (`web/vite.config.ts`)

```ts
import { createLogger, defineConfig } from "vite";

const logger = createLogger();
const SUPPRESSED = "inlineDynamicImports option is deprecated";

const customLogger = {
  ...logger,
  warn(msg, options) {
    if (msg.includes(SUPPRESSED)) return;
    logger.warn(msg, options);
  },
};

export default defineConfig({
  customLogger,
  // ... 既存設定
});
```

実装時は `Logger` interface の全メソッド (info / warn / warnOnce / error / clearScreen / hasErrorLogged) と
プロパティ (`hasWarned`) を欠落なく保持する必要がある. spread (`...logger`) は logger の class 実装次第で
プロパティが拾えない場合があるため, 明示的に各メソッドを delegate する実装にする (test-designer が単体テストで担保).

### 例外 / エラー処理

- 当該 deprecation warning 以外で base logger 呼び出しに例外が出ても customLogger 側で握り潰さない.
- `customLogger.warn` の引数 `msg` が `undefined` / 非 string で来た場合の防御:
  `typeof msg === "string" && msg.includes(SUPPRESSED)` でガードする (`Logger` interface 上は `msg: string` だが安全側に倒す).

## 重要な決定

- **方針 (c) を採用** (spec の候補比較表参照). (a) は upstream に修正版が無く不可, (b) はプラグインが output を完全上書きするため上書き経路が無い.
- 大きな設計判断ではないため ADR 化はしない (1 ファイル数行の defensive workaround).
- フィルタは「文字列 includes」で十分. 正規表現は不要 (1 種類しか抑止しない).

## リスク / 代替案

### リスク

- **R-1**: Vite v8 系の `Logger` interface 仕様変更. → `Logger` を import して型付けし, 欠落メソッドは tsc が検出する.
- **R-2**: `createLogger()` の戻り値が将来 class instance になり, spread でプロパティが落ちる可能性.
  → 各メソッドを明示 delegate する実装にする (test-designer の単体テストで担保).
- **R-3**: 上流 (`vite-plugin-pwa`) が当該文字列を変更した場合, フィルタが効かなくなる. ただし悪化はせず, 警告が再表示されるだけ.
  → 統合テスト (`npm run build` 実行) で常時 detect 可能. テストが赤くなったら spec に従い対処.

### 代替案

- (b) 案で `format: "iife"` に切替えるルートは, SW artifact format が変わるため非ゴール衝突で却下.
- patch-package で `vite-plugin-pwa` を直接書き換えるルートは, dependency 管理が複雑化するため却下.

## テスト方針

> 全体方針は [`../../quality/test-catalog.md`](../../quality/test-catalog.md).

### 単体テスト (vitest)

`web/__tests__/build-warning.test.ts` (新規) に以下のスイートを置く.

1. `customLogger.warn("inlineDynamicImports option is deprecated, please use codeSplitting: false instead.")` を呼んでも base logger の `warn` が呼ばれないこと (spy 検証).
2. `customLogger.warn("foo bar baz")` を呼ぶと base logger の `warn` がちょうど 1 回呼ばれること.
3. `customLogger.info` / `error` / `warnOnce` / `clearScreen` / `hasErrorLogged` がすべて関数として存在し, base に委譲されること.
4. `customLogger.hasWarned` プロパティが取得可能であること.
5. `msg` が `undefined` / 非 string で来た場合に throw しない (防御コード検証, 任意).

customLogger を単体テストから参照可能にするため, `web/vite.config.ts` から **customLogger を named export する** か,
あるいは `vite.config.ts` 自体を import せず, customLogger を別ファイル (例: `web/src/build/custom-logger.ts`) に切り出してそこから両方 import する形にする.
**plan としては, 新規ファイル追加を避けて vite.config.ts から `export const customLogger` を生やす方針を採用する** (新規 dep / 新規ファイル禁止の制約とは別軸; テスト用に同一ファイル内 export は許容).

### 統合テスト (vitest, 1 ケースだけ)

同 `build-warning.test.ts` に, 実際に `npm run build -w web` を `child_process.execSync` で起動するテストを 1 件追加.

- stdout / stderr に `"inlineDynamicImports option is deprecated"` が含まれない.
- exit code 0.
- `web/dist/sw.js` (もしくは vite-plugin-pwa が生成する SW ファイル) が存在する.
- このテストは `vi.setConfig({ testTimeout: 120_000 })` 相当のタイムアウトを設定する (build に時間がかかる前提).
- CI 環境負荷を考慮し, `describe.concurrent` ではなく直列実行する.
- 必要に応じ `test.skipIf(process.env.SKIP_BUILD_E2E === "1")` ガードを付けるが, **デフォルトでは実行する** (BL-109 完了判定が build 出力に依存するため).

### E2E (Playwright)

- `e2e/pwa-prod.spec.ts` を **無改修で** green に保つ. (test-designer は新規 spec を書かない. 既存スイートを実装後に走らせて確認する.)

### typecheck / lint

- `npm run typecheck` で `Logger` interface 準拠を担保.
- `npm run lint` で biome の警告 0 を維持.

## 役割分担 (タスク振り分けの参照)

| 役割 | 主な範囲 |
| --- | --- |
| test-designer | `web/__tests__/build-warning.test.ts` 新規作成 (上記単体 + 統合, 全て red の状態で). customLogger を import するため, vite.config.ts に named export が無ければ implementer に依頼してから埋める. |
| implementer | `web/vite.config.ts` に customLogger 実装 + named export. test-designer が用意したテストを green 化. |
| auditor | spec の受け入れ基準 5 件が全て満たされているか, build artifact diff がゼロか, Playwright `pwa-prod.spec.ts` が green か, typecheck / lint 0 か, を確認. |
