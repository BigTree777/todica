# 仕様: web workspace の vitest 実行基盤修復 (web-test-config-repair)

- 状態: 確定
- 関連:
  - [`../../planning/backlog.md`](../../planning/backlog.md) BL-055
  - 関連 feature:
    - [`../lint-typecheck-repair/spec.md`](../lint-typecheck-repair/spec.md) (BL-048) — 「リポジトリ全体の開発基盤を本来あるべき状態に戻す」種別の前例 BL
    - [`../form-card-design/spec.md`](../form-card-design/spec.md) (BL-054) — 本 BL の動機が発覚した直近 BL
  - 上位要件: 開発基盤 (各 feature の `tasks.md` 完了条件「`npm test -w web` が green」を実体化するため)

## 背景 / 課題

BL-054 (form-card-design) の検証中に, 本来 web workspace 単体で実行できるべき `npm test -w web` が大量失敗することが発覚した.

### 現状

- ルート `vitest.config.ts` は `domain` / `server` / `web` の 3 workspace 横断で vitest を実行する設定を持つ. ここには web の React コンポーネントテスト (`*.test.tsx` および `web/**/*.test.ts`) を **jsdom** 環境で実行するための `environmentMatchGlobs` と, `web/__tests__/setup.ts` を読み込む `setupFiles` が含まれている.
- 一方で `web/` 配下には独自の `vitest.config.ts` が存在しない. このため `npm test -w web` (= `cd web && vitest run`) は web 配下から vitest を起動した時点でルート設定を発見できず, vitest のデフォルト (= `environment: "node"` / `setupFiles` なし) で実行される.
- 結果, web の React コンポーネントテストは `document is not defined` などで一斉に失敗する (BL-054 確認時点で **219 件失敗**).
- 過去 BL (BL-048〜BL-053) の各 `tasks.md` も完了条件として「`npm test -w web` が全件 green」を掲げているが, 実体は**ルートからの** `npm test` で代替的に検証されていた (= ルート設定が読まれる経路でしか web の jsdom テストが通っていない). この乖離が長期間放置されてきた.

### user 指摘 (要約)

- 「`npm test -w web` 単体実行が機能していない. web workspace に独自の `vitest.config.ts` が無いのが原因」
- 「ルート `vitest.config.ts` には触れない (= 既存検証経路は無改修で維持する)」
- 「`web/vitest.config.ts` を新設して `globals: true` / `environment: "jsdom"` / `include` / `setupFiles` の最小構成だけ持たせる」

### 方針の核

本 BL は **`web/vitest.config.ts` を新設**し, web workspace 単体で vitest が jsdom 環境で web 配下のテストを実行できる最小構成を与える. ルートの `vitest.config.ts` は無改修で, ルートからの `npm test` 経路 (= 過去 BL の実体的な検証経路) には一切副作用を与えない.

## ゴール / 非ゴール

### ゴール

- **G-1 (`npm test -w web` 単体の機能化)**: `npm test -w web` が exit 0 で全件 green となり, web 配下のテストのみを対象に jsdom 環境で実行される.
- **G-2 (ルート経路の無改変)**: ルートからの `npm test` も従来通り全件 green を維持する (domain / server / web の 3 workspace 合算).
- **G-3 (差分の局所化)**: 変更は `web/vitest.config.ts` の **新規作成 1 ファイル**のみに閉じる. ルート `vitest.config.ts` / `web/package.json` / `web/__tests__/setup.ts` / その他既存ファイルは無改修.
- **G-4 (過去 BL の `tasks.md` 完了条件の実体化)**: BL-048〜BL-053 の各 `tasks.md` が掲げる「`npm test -w web` が green」が, 文言通りの経路で実際に成立するようになる.

### 非ゴール

- **ルート `vitest.config.ts` の改修**: 触れない. `include` / `environmentMatchGlobs` / `setupFiles` / `coverage` などはすべて現状維持.
- **`web/__tests__/setup.ts` の中身の変更**: 既存ファイルをそのまま `setupFiles` から参照するのみ. setup.ts 内のロジック (jsdom polyfill / fake-indexeddb / cleanup 等) は無改修.
- **過去 BL (BL-048〜BL-053) の `tasks.md` 文言の遡及修正**: 本 BL で実体が文言と一致するようになるため不要.
- **domain / server workspace 用の独自 `vitest.config.ts` 新設**: 対象外. domain / server は引き続きルート設定のみで運用する.
- **CI 設定 (statusCheckRollup, GitHub Actions 等)**: 本 BL は CI gate 化を含まない (BL-048 と同じスタンス).
- **`web/package.json` の `test` スクリプト変更**: 引き続き `vitest run`. 引数追加・コマンド差し替えは行わない.
- **テストファイル本体 (`web/__tests__/*.test.ts(x)`) の追加・変更**: 既存テストは無改修. 新規テストも本 BL では追加しない (= 本 BL の検証は「設定ファイルそのもの」と「コマンド実行結果」で行う).
- **ルート経路と web 単体経路の重複排除 / 共通化**: 本 BL ではルートと web の双方が同じ setup.ts を参照する形を許容する. 共通化 (例: web 設定を import してルート設定が re-export する等) は将来 BL の余地として残すのみ.
- **カバレッジ設定 (`coverage.*`) の web 側追加**: 本 BL では `web/vitest.config.ts` に `coverage` を含めない. カバレッジ取得経路はルート設定で十分.

## 要件

### 機能要件

- **REQ-1 (`web/vitest.config.ts` の新設)**

  `web/vitest.config.ts` を新規作成し, `vitest/config` の `defineConfig` を用いて以下の `test` 設定を持たせる:

  - `globals: true`
  - `environment: "jsdom"`
  - `include: ["**/*.test.ts", "**/*.test.tsx"]` (web/ を CWD として動作するため, web 配下のテストのみが拾われる)
  - `setupFiles: ["./__tests__/setup.ts"]` (web/ を CWD としたときの相対パスでルートと同じ setup を読む)

- **REQ-2 (ルート `vitest.config.ts` の無改修)**

  ルート `vitest.config.ts` は本 BL では一切変更しない. `include` / `environmentMatchGlobs` / `setupFiles` / `coverage` / `environment` のすべてを現状維持する.

- **REQ-3 (`web/__tests__/setup.ts` の無改修)**

  既存の `web/__tests__/setup.ts` の中身は変更しない. 本 BL の `web/vitest.config.ts` から `setupFiles` で参照するのみ.

- **REQ-4 (`web/package.json` の無改修)**

  `web/package.json` の `scripts.test` は引き続き `vitest run`. 本 BL では package.json に touch しない.

- **REQ-5 (対象テストのスコープ)**

  `web/vitest.config.ts` の `include` パターンは web/ を CWD としたときに web 配下のテストのみを拾う. domain / server のテストが `npm test -w web` で実行されないことを満たす.

### 非機能要件

- **NFR-NO-ROOT-CHANGE**: ルート `vitest.config.ts` を変更しない (= ルートからの `npm test` 経路に副作用を与えない).
- **NFR-NO-SETUP-CHANGE**: `web/__tests__/setup.ts` の本文を変更しない.
- **NFR-NO-PKG-CHANGE**: `web/package.json` を変更しない.
- **NFR-NO-PRODUCT-CHANGE**: production code (`web/src/**`, `domain/src/**`, `server/src/**`) は一切無改修. 本 BL はテスト実行基盤の設定差分のみ.
- **NFR-IDEMPOTENT**: 本 BL の修復は冪等に成立する (= 設定ファイルを 1 回追加すれば以降の vitest 実行で常に同じ結果になる. ランタイムでの状態遷移は持たない).

## 受け入れ基準

> 書き方は [`../../quality/acceptance-criteria.md`](../../quality/acceptance-criteria.md) に従う.

```
シナリオ AC-1: web workspace 単体実行が全件 green
  Given リポジトリのルートディレクトリにいる
   かつ 本 BL の web/vitest.config.ts が配置されている
  When  npm test -w web を実行する
  Then  exit 0 で完了する
   かつ vitest の test runner が web 配下のテストのみを対象に実行する
   かつ "document is not defined" 等の jsdom 未設定起因の失敗が 0 件である
```

```
シナリオ AC-2: ルート経路の無改変 (副作用なし)
  Given リポジトリのルートディレクトリにいる
   かつ 本 BL の web/vitest.config.ts が配置されている
  When  npm test (= ルートからの vitest run) を実行する
  Then  exit 0 で完了する
   かつ domain / server / web 全ワークスペースのテスト件数が BL-054 完了時点と同等以上で全件 green である
```

```
シナリオ AC-3: web/vitest.config.ts が jsdom 環境を指定している
  Given web/vitest.config.ts を開いた
  When  defineConfig に渡している test オブジェクトを観察する
  Then  environment プロパティに "jsdom" を指定する宣言を含む
```

```
シナリオ AC-4: web/vitest.config.ts が共通 setup を読み込む
  Given web/vitest.config.ts を開いた
  When  defineConfig に渡している test オブジェクトを観察する
  Then  setupFiles プロパティに "./__tests__/setup.ts" を含む配列を指定している
```

```
シナリオ AC-5: web/vitest.config.ts が globals: true を有効化している
  Given web/vitest.config.ts を開いた
  When  defineConfig に渡している test オブジェクトを観察する
  Then  globals プロパティに true を指定する宣言を含む
```

```
シナリオ AC-6: web/vitest.config.ts の include が web 配下のテストを拾う
  Given web/vitest.config.ts を開いた
  When  defineConfig に渡している test オブジェクトを観察する
  Then  include プロパティに "**/*.test.ts" と "**/*.test.tsx" を含む配列を指定している
```

```
シナリオ AC-7: ルート vitest.config.ts に差分がない
  Given 本 BL の実装がマージされた
  When  vitest.config.ts (リポジトリルート) を BL-054 完了時点の状態と比較する
  Then  差分が無い
```

```
シナリオ AC-8: web/__tests__/setup.ts に差分がない
  Given 本 BL の実装がマージされた
  When  web/__tests__/setup.ts を BL-054 完了時点の状態と比較する
  Then  差分が無い
```

```
シナリオ AC-9: web/package.json に差分がない
  Given 本 BL の実装がマージされた
  When  web/package.json を BL-054 完了時点の状態と比較する
  Then  差分が無い
   かつ scripts.test が "vitest run" のままである
```

```
シナリオ AC-10: production code に差分がない
  Given 本 BL の実装がマージされた
  When  web/src/ / domain/src/ / server/src/ を BL-054 完了時点の状態と比較する
  Then  差分が無い (本 BL はテスト実行基盤の設定差分のみ)
```

## 重要な決定 (D 章)

- **D-001 (`web/vitest.config.ts` を新設する)**: ルート設定の置き場・読み込み解決順は vitest の仕様に従う. workspace 配下から vitest を起動した場合, その workspace に `vitest.config.ts` があればそれを使い, 無ければ上位を探索する. 本 BL では「web 配下に専用設定を置く」方針で `npm test -w web` 経路を成立させる. ルート設定への delegate / re-export は採用しない (= 重複は許容).
- **D-002 (ルート設定は触らない)**: 過去 BL の実体的な検証経路 (= ルートからの `npm test`) を保護するため. ルート設定は domain / server / web の 3 workspace 横断パスを既に正しく扱えている (BL-054 まで全件 green の実績がある).
- **D-003 (`environmentMatchGlobs` ではなく `environment: "jsdom"` 単独)**: web workspace 単体実行では include 対象がすべて web 配下に閉じるため, ファイル名で環境を切り替える必要がない. `environment: "jsdom"` を全体に適用する単純構成で十分.
- **D-004 (`setupFiles` のパスは `./__tests__/setup.ts`)**: `web/vitest.config.ts` を web/ 直下に置くため, 相対パスで `./__tests__/setup.ts` を指定する. ルート設定での `./web/__tests__/setup.ts` とは記述が異なるが, 実体ファイルは同じ.
- **D-005 (`include` は `**/*.test.ts(x)` の 2 パターン)**: ルート設定の `web/**/*.test.ts` / `web/**/*.test.tsx` から `web/` プレフィックスを外したもの. CWD が web/ になるため.
- **D-006 (coverage を web 設定に含めない)**: カバレッジ取得経路はルート設定で十分 (`npm test` で取得済み). `npm test -w web` 単体実行ではカバレッジが不要なため設定を持たせない. 余計な exclude 重複を生まない.
- **D-007 (検証は「コマンド実行結果」で行う / 専用単体テスト不採用)**: 本 BL は「設定ファイルを置けば成立する」種類の修復であり, AC-1 / AC-2 (実コマンドの exit 0) と AC-3〜AC-6 (設定ファイル本文の目視確認) で受け入れ基準を満たす. なお BL-048 (lint-typecheck-repair) では `web/__tests__/lint-typecheck-repair.test.ts` が `execSync` で `npm run lint` / `npm run typecheck` を subprocess 起動して exit 0 を機械検証する形式を採用していたが, 本 BL で同形式を採ろうとすると `npm test -w web` を vitest 内側から subprocess 起動する形になり, 内側で同 test ファイルが再度実行されて `npm test -w web` を起動する再帰が発生する. 環境変数フラグ等で internal skip を入れれば回避は可能だが, 設定ファイル 10 行の追加に対して検証コードと回避ロジックを抱えるのは過剰. AC-1 / AC-2 の実機実行 + auditor 監査で十分に担保されると判断し, 専用単体テストは本 BL では追加しない.
- **D-008 (setup.ts の中身は確認のみ, 変更しない)**: 既存の `web/__tests__/setup.ts` は jsdom 環境を前提に書かれている (`HTMLDialogElement` polyfill / `fake-indexeddb` import / `@testing-library/react` の cleanup). `web/vitest.config.ts` で `environment: "jsdom"` を指定すれば setup.ts は意図通り動作する. setup.ts 自体の変更は plan 段階で「不要」を確認するだけにとどめる.

## 未決事項 / 確認待ち

- なし (採用アプローチ・対象ファイル・スコープ境界・受け入れ基準はすべて user との合意で確定済み).
