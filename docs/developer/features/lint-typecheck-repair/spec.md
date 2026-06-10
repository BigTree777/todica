# 仕様: lint / typecheck 修復

- 状態: 確定
- 関連: [`../../planning/backlog.md`](../../planning/backlog.md) の BL-048

## 背景 / 課題

`main` ブランチ時点で `npm run lint`（biome check）と `npm run typecheck`（tsc -b --noEmit）がともに失敗している。
各 feature の tasks.md には「lint / typecheck が通る」チェック項目が存在するが、コマンド自体が失敗するため実態を持たない空チェックになっている。

### lint の現状

- `npm run lint` が 346 errors / 4 warnings で失敗している。
- biome の `files.ignore` に Capacitor ビルド成果物（`android/app/src/main/assets/public/`）が含まれておらず、コミット済みのビルド成果物に大量の診断が発生している。
  - `android/app/src/main/assets/public/assets/index-*.js`（バンドル本体）
  - `android/app/src/main/assets/public/service-worker.js`
  - `android/app/src/main/assets/public/registerSW.js` など
- 上記以外の手書きコードにも、`format`・`organizeImports`・`lint/suspicious/noControlCharactersInRegex` などの違反が残っている。
  - 対象ファイル: `e2e/` 配下のスペック群、`domain/src/routine/index.ts`、`server/__tests__/helpers/build-test-app.ts`、`web/vite.config.ts`、設定ファイル（`biome.json`、`tsconfig.json`、`package.json`、`capacitor.config.ts`）

### typecheck の現状

- `npm run typecheck`（`tsc -b --noEmit`）が 4 つのエラーで失敗している。
  - **TS6059 × 2**: `domain/__tests__/*.ts` が `rootDir`（`domain/src`）の外にある。domain の tsconfig が `composite: true` かつ `rootDir: ./src` のため、`__tests__/` が対象外となる。
  - **TS6310 × 2**: `server/tsconfig.json` と `web/tsconfig.json` が `domain` を project reference で参照しているが、domain が現状のビルドでは emit を無効化している（`noEmit` 相当の状態）ように tsc が判断している。

## ゴール / 非ゴール

- ゴール:
  - `npm run lint` が exit 0 で完了する
  - `npm run typecheck` が exit 0 で完了する
  - 修復後も既存の vitest テストが green を維持する
- 非ゴール:
  - CI ゲートの設定（別判断）
  - Capacitor ビルド成果物をリポジトリからトラッキング解除すること（本 BL では scope 外とし未決事項に記録）
  - lint ルールの厳格化・新規ルール追加

## 要件

- 機能要件:
  - biome の `files.ignore` に Capacitor ビルド成果物のパスを追加し、ビルド成果物が lint 対象から除外される
  - 手書きコードの format / organizeImports / lint 違反を修正または抑制する
  - `domain/__tests__/` が typecheck の対象から外れる、または `rootDir` の制約を満たすよう tsconfig を修正する
  - `server/tsconfig.json` および `web/tsconfig.json` が domain を正しく project reference で参照できるよう tsconfig を修正する
- 非機能要件:
  - typecheck の修正は vitest によるテスト実行に影響を与えない（vitest は tsconfig の `references` を使わず vite-node/tsx で直接 `.ts` を実行するため）

## 受け入れ基準

```
シナリオ: lint が通る
  Given リポジトリのルートディレクトリにいる
  When  npm run lint を実行する
  Then  exit 0 で完了し、errors 件数が 0 である
```

```
シナリオ: typecheck が通る
  Given リポジトリのルートディレクトリにいる
  When  npm run typecheck を実行する
  Then  exit 0 で完了し、TS エラーが出力されない
```

```
シナリオ: 既存テストが壊れない
  Given typecheck / lint 修正後のコードベース
  When  npm test を実行する
  Then  すべてのテストが pass する
```

```
シナリオ: Capacitor ビルド成果物が lint 対象から除外される
  Given biome.json の files.ignore に android/app/src/main/assets/public/ が含まれている
  When  npm run lint を実行する
  Then  android/app/src/main/assets/public/ 配下のファイルへの診断が出力されない
```

```
シナリオ: domain/__tests__ が typecheck で TS6059 を起こさない
  Given domain/tsconfig.json が __tests__/ の rootDir 問題を解消している
  When  npm run typecheck を実行する
  Then  TS6059 エラーが出力されない
```

```
シナリオ: server / web から domain への project reference が解決できる
  Given domain/tsconfig.json が composite モードで declaration を emit できる状態である
  When  npm run typecheck を実行する
  Then  TS6310 エラーが出力されない
```

## 未決事項 / 確認待ち

- Capacitor ビルド成果物（`android/app/src/main/assets/public/`）を今後もリポジトリにコミットし続けるかどうか。本 BL では biome ignore 追加のみで対処し、トラッキング解除は別 BL 候補とする。
- `domain/__tests__/` の tsconfig 修正方針: テスト用 tsconfig を分離する方法と `rootDir` を `./` に拡張する方法のどちらを採るか。plan.md の「重要な決定」に記録する。
