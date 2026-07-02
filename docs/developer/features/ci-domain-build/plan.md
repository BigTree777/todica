# 設計・実装計画: CI で domain をビルドしてから typecheck / vitest / playwright を実行する

> [`spec.md`](spec.md) の要件を、どう実現するかに落とす。

## 方針概要

`.github/workflows/ci.yml` の typecheck / vitest / playwright の 3 job に,
`install dependencies` の直後の step として `npm run build -w domain` を追加し,
playwright job の `timeout-minutes` を 30 とする.
それ以外 (トリガ・並列構成・キャッシュ・job 名) は ci-automated-gate の構成を変えない.

## 影響範囲

| 領域 | 変更内容 |
| --- | --- |
| CI 定義 | `.github/workflows/ci.yml` の typecheck / vitest / playwright job に build step を 1 つずつ追加 (計 3 step). playwright job の `timeout-minutes` を 30 に設定 |
| API | 変更なし |
| DB | 変更なし |
| モジュール | 変更なし (domain の build script `tsc` をそのまま使う) |
| UI | 変更なし |

## 設計詳細

- 追加する step (3 job 共通):

  ```yaml
  - name: build domain
    run: npm run build -w domain
  ```

- 挿入位置: 各 job の `install dependencies` (`npm ci`) の直後.
  - typecheck job: `install dependencies` → **build domain** → `run typecheck`
  - vitest job: `install dependencies` → **build domain** → `run vitest`
  - playwright job: `install dependencies` → **build domain** → `cache playwright browsers` →
    `install playwright browsers` → `run playwright tests`
    (ブラウザ取得より前に置くのは「軽く速い step を先に失敗させる」ためであり,
    ブラウザキャッシュの前後どちらでも機能上の差は無い)
- lint job には追加しない. Biome はソーステキストのみを検査し `domain/dist/` に依存しないため,
  build step を持たないことが「lint は成果物非依存で最速に返る job」という現状の性質を保つ.
- ビルドコマンドは `npm run build -w domain` (実体は `tsc`). ワークスペース指定の `-w` により
  リポジトリルートから実行できる. `domain/tsconfig.json` は `composite: true` だが,
  CI のクリーンチェックアウトには tsbuildinfo が存在しないため常にフル emit される.
- 例外 / エラー処理: build step が失敗した場合は job がその時点で failure になる.
  domain のコンパイルエラーが typecheck を待たずに顕在化するだけであり, 追加の処理は不要.

## 重要な決定

- **build step を 3 job に個別追加し, 共通化 (composite action / reusable workflow / 前段 job +
  artifact 受け渡し) はしない**: 追加は 2 行 × 3 箇所であり, 共通化の仕組みを入れるほうが
  変更量・理解コストが大きい. 前段 job に分けると artifact のアップロード / ダウンロードで
  かえって遅くなり, 「単一 job の失敗が他 job を巻き込まない」並列構成も崩れる.
- **ガードテスト (workflow YAML の構造検査 vitest) は不採用**:
  「build step が存在すること」を YAML パースで検査するテストは追加しない.
  理由: (1) この構成の破壊 (build step の削除・順序入れ替え) は CI 自体が即座に
  failure として検出する self-detecting な性質を持ち, ガードテストが守る面が実質無い.
  (2) YAML の構造一致は「job が green になる」ことを保証せず, 検証として弱い.
  (3) step 名や順序に対する構造テストはリファクタ耐性が低く, メンテコストだけが残る.
  完了検証は実 CI run の green + auditor の実在確認で行う.
- **ADR は新設しない**: CI 定義内のビルド順序の修正であり, アーキテクチャ上の新しい決定
  (技術選定・構成方針の変更) を伴わない. CI ゲートの構成方針は ci-automated-gate の
  spec が既に定めており, 本変更はその実行前提の修正に留まる.
- **ルート `npm run ci` script には手を入れない**: ローカルは `domain/dist/` が通常残存し,
  クリーン化したい場合も `npm run clean:dist` が domain 再ビルドまで行うため既存手段で足りる.
  scope を CI 定義のみに閉じる (spec の非ゴールとして明記済み).
- **playwright job の `timeout-minutes` は 30 とする**: 30 は playwright が green である
  前提の正常運用に十分な余裕を持たせた上限値であり, 正常時の所要時間を変えるものではない.
  なお, この値は大量失敗の状態を救うものではない: 実測 (PR #193 の run 28565796297) では
  timeout 30 分でも, e2e の残失敗 (spec の「切り分け済み」参照) × retries (CI では 2 回) の
  再実行により完走せず cancel で終了した. timeout の cancel では `if: failure()` の
  trace / report upload step も実行されないため, この状態では artifact も残らない.
  大量失敗時の完走と調査材料の確保は timeout の延長ではなく, 失敗自体の解消 (BL-145) で行う.

## リスク / 代替案

- リスク: 低 (CI 定義のみの変更で, アプリコード・テストコードに触れない).
- CI には success の run が無いため, domain 起因の失敗を解消すると別の潜在失敗が露出しうる.
  扱いは spec の「想定される追加失敗の扱い」に従う: 原因を切り分け, domain 非起因のものは
  backlog に別項目として記録する. 実測で playwright job の残失敗は e2e の `.env` 暗黙依存
  (`VITE_API_BASE_URL` 未定義) と切り分け済みで, BL-145 (e2e-env-self-contained 想定) に
  切り出している. 本 feature の Done は「typecheck / vitest / lint green + playwright が
  テスト実行到達」で判定する (spec の受け入れ基準参照).
- 代替案 (不採用): domain の `exports` を `src/` 直参照に変える案は, ビルド成果物を正とする
  現行のパッケージ設計 (server / web / vitest すべてが `dist/` 解決で動いている) を崩すため
  採らない.

## テスト方針

> 全体方針は [`../../quality/test-catalog.md`](../../quality/test-catalog.md)。

- 本成果物は CI 定義 (YAML) であり, 振る舞いテスト (vitest) を生まない. ガードテストも
  不採用 (上記「重要な決定」参照).
- 検証は次の 2 点で行う.
  1. **実 CI run**: 本変更の PR で typecheck / vitest / lint の 3 job が success になり,
     playwright job が domain 起因の起動失敗を脱してテスト実行に到達すること
     (spec の受け入れシナリオそのもの). run URL を tasks.md に記録する.
     playwright job の green 化は BL-145 の検証範囲とする.
  2. **auditor の実在確認**: `.github/workflows/ci.yml` に build step が仕様どおりの位置・
     内容で存在し, lint job には無く, job 名が不変であり, playwright job の
     `timeout-minutes` が 30 であることを直接確認する.
- 補助的なローカル再現 (任意): `domain/dist/` を退避し `domain/tsconfig.tsbuildinfo` を
  削除した状態で `npm ci && npm run build -w domain && npm run typecheck` が exit 0 に
  なることを確認できる (原因調査時に再現確認済みの手順).
