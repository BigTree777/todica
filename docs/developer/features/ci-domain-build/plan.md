# 設計・実装計画: CI で domain をビルドしてから typecheck / vitest / playwright を実行する

> [`spec.md`](spec.md) の要件を、どう実現するかに落とす。

## 方針概要

`.github/workflows/ci.yml` の typecheck / vitest / playwright の 3 job に,
`install dependencies` の直後の step として `npm run build -w domain` を追加する.
それ以外 (トリガ・並列構成・キャッシュ・job 名) は ci-automated-gate の構成を一切変えない.

## 影響範囲

| 領域 | 変更内容 |
| --- | --- |
| CI 定義 | `.github/workflows/ci.yml` の typecheck / vitest / playwright job に build step を 1 つずつ追加 (計 3 step) |
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

## リスク / 代替案

- リスク: 低 (CI 定義のみの変更で, アプリコード・テストコードに触れない).
- CI が一度も green になったことが無いため, domain 起因の失敗を解消した後に別の潜在失敗が
  順次露出する可能性がある (特に playwright job). その場合の扱いは spec の
  「想定される追加失敗の扱い」に従う: 原因を切り分け, domain 非起因のものは backlog に
  別項目として記録する. 本 feature の Done は 4 job green をもって判定する.
- 代替案 (不採用): domain の `exports` を `src/` 直参照に変える案は, ビルド成果物を正とする
  現行のパッケージ設計 (server / web / vitest すべてが `dist/` 解決で動いている) を崩すため
  採らない.

## テスト方針

> 全体方針は [`../../quality/test-catalog.md`](../../quality/test-catalog.md)。

- 本成果物は CI 定義 (YAML) であり, 振る舞いテスト (vitest) を生まない. ガードテストも
  不採用 (上記「重要な決定」参照).
- 検証は次の 2 点で行う.
  1. **実 CI run**: 本変更の PR で typecheck / lint / vitest / playwright の 4 job が
     success になること (spec の受け入れシナリオそのもの). run URL を tasks.md に記録する.
  2. **auditor の実在確認**: `.github/workflows/ci.yml` に build step が仕様どおりの位置・
     内容で存在し, lint job には無く, job 名が不変であることを直接確認する.
- 補助的なローカル再現 (任意): `domain/dist/` を退避し `domain/tsconfig.tsbuildinfo` を
  削除した状態で `npm ci && npm run build -w domain && npm run typecheck` が exit 0 に
  なることを確認できる (原因調査時に再現確認済みの手順).
