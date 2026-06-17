# 仕様: SW ビルド deprecation warning の抑止 (BL-109)

- 状態: 確定
- 関連: [`../../planning/backlog.md`](../../planning/backlog.md) の BL-109

## 背景 / 課題

`npm run build` (ルート: `vite build` を `web/` で実行) を走らせると, Service Worker (SW) の専用ビルド工程で
以下の deprecation warning が常に表示される.

```
Building src/sw/service-worker.ts service worker ("es" format)...
(!) WARN inlineDynamicImports option is deprecated, please use codeSplitting: false instead.
```

- 警告の発生源は `vite-plugin-pwa@1.3.0` の内部 (`node_modules/vite-plugin-pwa/dist/vite-build-BGK4YAIU.js:109`) で,
  SW を bundle する際に `rollupOptions.output.inlineDynamicImports: true` をハードコードしているため.
- Rollup v4 系 / Vite v8.0.16 の組合せで, この option は deprecated 扱いとなり警告化された.
- `web/vite.config.ts` 側は `injectManifest` を `globIgnores` のみ指定する設定で,
  `output.inlineDynamicImports` には触れていない.

機能上の不具合は無いが, CI ログ・ローカル build ログにノイズが残り続けるため, 警告のみを抑止したい.

### 候補方針の調査結果

| 候補 | 内容 | 評価 | 採否 |
| --- | --- | --- | --- |
| (a) | `vite-plugin-pwa` を当該設定が修正された新バージョンへ更新 | 現時点で npm 上の最新は `1.3.0` (2026-05-05 リリース). 最新版でも `vite-build-BGK4YAIU.js:109` に `inlineDynamicImports: true` がハードコードされたままで, upstream に修正版リリースが存在しない. アップデートで解決しない. | 不採用 |
| (b) | `web/vite.config.ts` 側で `injectManifest` の `rollupOptions.output` を上書き | プラグインの `prepareViteBuild` が `inlineConfig.build.rollupOptions.output` を完全に再構築 (spread せずに `{ entryFileNames, inlineDynamicImports: true }` の固定リテラル) しており, ユーザー側からの output 上書き経路が存在しない. `injectManifest` 型 (Workbox InjectManifestOptions) は Vite/Rollup build option を受け取らない. `format: "iife"` に切り替えれば else 分岐に入るが, SW の format / artifact が変わるため非ゴール (build artifact ゼロ変更) と衝突. | 不採用 |
| (c) | Vite の `customLogger` で当該 warning のみ抑止 | 1 ファイル変更 (`web/vite.config.ts`) で完結. build artifact / SW 動作 / PWA 挙動への副作用ゼロ. 他の warn/error はそのまま出力. `vite-plugin-pwa` 側で upstream 修正された段階で `customLogger` の filter 行を削除すれば原状復帰できる. | **採用 (主軸)** |
| (d) | `VitePWA({ integration: { configureCustomSWViteBuild } })` フック経由で SW 用 `inlineConfig.build.rollupOptions.output` を `{ inlineDynamicImports: undefined, codeSplitting: false }` に後付け mutate | `prepareViteBuild` で output リテラル再構築された **後** に走る hook なので (b) の「output 上書き経路が存在しない」制約を回避できる. `codeSplitting: false` は `inlineDynamicImports: true` と同義 (新 API への置換) で SW 単一 chunk 前提を維持. Rolldown の deprecation warning は `consola` 経由で `process.stderr` に直接書かれ Vite logger / Rollup `onwarn` / `onLog` で捕捉不能なため, 警告発生条件そのものを取り除く本手段が **(c) 単独では受け入れ基準 (build 出力に warning 不在) を満たせない** ことの補完として必要. | **採用 (補強)** |

## ゴール / 非ゴール

- ゴール:
  - `npm run build` (`web/` workspace) の stdout/stderr から `inlineDynamicImports option is deprecated` 警告を除去する.
  - 当該警告以外の Vite/Rollup の warn / info / error は従来通り出力する.
  - 修正は `web/vite.config.ts` 1 ファイルに閉じる.
- 非ゴール:
  - `vite-plugin-pwa` のバージョン更新.
  - SW の build format (`es`) や output filename, bundle 構造の変更.
  - 他の Vite warning の抑止 / 整形.
  - 新規 dependency の追加.

## 要件

### 機能要件

- REQ-001: `web/vite.config.ts` に `customLogger` を定義する. `vite` の `createLogger()` を base にし, `warn` のみラップする.
- REQ-002: ラップした `warn` は, 引数 `msg` (string) が `inlineDynamicImports option is deprecated` を部分一致で含む場合,
  base logger の `warn` を呼ばずに無視する.
- REQ-003: それ以外の `warn` 呼び出し, および `info` / `error` / `warnOnce` / `clearScreen` / `hasErrorLogged` / `hasWarned`
  は base logger にそのまま委譲する (Vite の `Logger` interface を完全に満たす).
- REQ-004: SW ビルドの artifact (`web/dist/sw.js` / `web/dist/manifest.webmanifest` / precache list) は本変更前後で一致する
  (warning 文字列以外の差分なし).

### 非機能要件

- NFR-001: vitest からの `vite build` 呼び出しを含むテストは CI 制限内 (1 ビルド 60 秒以内目安, タイムアウト個別に延長可).
- NFR-002: 1 ファイル変更で完結し, 既存テスト (vitest / Playwright `pwa-prod.spec.ts` 含む) を 1 件も壊さない.
- NFR-003: TypeScript の strict 設定下で型エラー 0 (`Logger` interface への準拠).

## 受け入れ基準

```
シナリオ: production build から deprecation warning が消える
  Given web/vite.config.ts に customLogger が設定されている
  When  リポジトリルートから `npm run build -w web` を実行する
  Then  stdout / stderr いずれにも文字列 "inlineDynamicImports option is deprecated" が現れない
   And  exit code は 0
   And  web/dist/ 配下に SW ファイル (sw.js) が生成されている
```

```
シナリオ: 他の warning は従来通り出力される
  Given customLogger が当該文字列のみフィルタする実装である
  When  ダミーの warning ("foo bar baz" など, 当該フィルタ文字列を含まない) を customLogger.warn に渡す
  Then  base logger の warn が 1 回呼ばれる
```

```
シナリオ: 当該 warning は base logger に渡らない
  Given customLogger が当該文字列のみフィルタする実装である
  When  "inlineDynamicImports option is deprecated, please use codeSplitting: false instead." を customLogger.warn に渡す
  Then  base logger の warn は呼ばれない
```

```
シナリオ: Logger interface のメソッドが欠落していない
  Given customLogger オブジェクト
  Then  info / warn / warnOnce / error / clearScreen / hasErrorLogged が関数として定義されている
   And  hasWarned プロパティを持つ
```

```
シナリオ: PWA E2E が従来通り通る
  Given customLogger 適用後の build artifact
  When  Playwright の `pwa-prod.spec.ts` を実行する
  Then  全テストが green になる (SW 登録 / pre-cache / offline navigation が従来通り動作する)
```

## 既存テスト互換性

- vitest スイート: 全件 green を維持. `web/__tests__/sw-update-dialog.test.tsx` を含む SW 関連テストは無改修.
- Playwright `e2e/pwa-prod.spec.ts`: 無改修で green.
- `npm run typecheck` / `npm run lint`: 0 エラー / 0 警告.

## 未決事項 / 確認待ち

- なし (採用方針 (c) + (d) で確定).

## 参考

- 警告発生コード: `node_modules/vite-plugin-pwa/dist/vite-build-BGK4YAIU.js:109`
  ```js
  output: {
    entryFileNames: swMjsName,
    inlineDynamicImports: true  // ここがハードコード
  }
  ```
- Vite Logger interface: `node_modules/vite/dist/node/index.d.ts:573` 付近 (`info` / `warn` / `warnOnce` / `error` / `clearScreen` / `hasErrorLogged` / `hasWarned`).
- 上流 (vite-plugin-pwa) の修正版がリリースされた段階で本フィルタ行は削除可能.
