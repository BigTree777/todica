# 設計・実装計画: OpenAPI ドリフト検出機構

> [`spec.md`](spec.md) の要件を, どう実現するかに落とす。

## 方針概要

リポジトリルートの node プロジェクトに静的ドリフト検出テストを 1 本追加する。
`openapi.yaml` を `js-yaml` でパースして (path, method) 集合を作り, サーバ実装ソースを
読取・抽出して (path, method) 集合を作り, 正規化後に**双方向の差集合がともに空**であることを
assert する。同時に, 検出機構を導入した瞬間に green を保つため, 既存の実ドリフト 5 件を
openapi.yaml 側の整合で解消する。実装本体（ハンドラ）は変更しない。

## 影響範囲

| 領域 | 変更内容 |
| --- | --- |
| API（openapi） | `architecture/api/openapi.yaml` を実装に整合させる: `/healthz` を `x-internal: true` で追加 / `/trash/{id}/restore` を追加 / 実装に無い `/tasks/{id}/restore`・`/projects/{id}/restore`・`/routines/{id}/restore` を削除。`x-internal` 規約コメントを明文化 |
| DB | 変更なし |
| モジュール | サーバ本体（`server/src/**` のハンドラ・ロジック）は変更しない |
| UI | 変更なし |
| テスト | 新規 `__tests__/structure/openapi-drift.test.ts`（配置は下記決定参照） |
| 依存 | ルート `package.json` の devDependencies に `js-yaml` と `@types/js-yaml` を追加 |
| ドキュメント | `architecture/api/overview.md` §8 に検出機構と `x-internal` 規約への参照を追記（必要時） |

## 設計詳細

### データモデル（テスト内の中間表現）

- エンドポイントキー = `` `${method} ${normalizedPath}` ``（例: `post /tasks/{id}`）。
- 集合 A = openapi 由来のキー集合。集合 B = 実装由来のキー集合。
- 報告対象: `A \ B`（openapi だけにある）, `B \ A`（実装だけにある）。

### 処理フロー

1. openapi 抽出: `js-yaml.load(readFileSync(openapi.yaml))` → `doc.paths` を走査。
   各 path key の子のうち HTTP メソッド名（get/post/put/patch/delete）のキーを (path, method) として収集。
   `servers[].url` には `/api/v1` が含まれ path key には含まれないため, openapi の path key は
   そのまま `/api/v1` を持たない正規形（例: `/tasks/{id}`）として扱える。
2. 実装抽出:
   - マウント prefix 対応表を用意し（決定 D-2 参照）, 各ルータファイルから
     `router.<method>("<relative>")` を抽出して `prefix + relative` を完全 path とする。
   - `server/src/app.ts` のインライン `app.<method>("<absolute>")` を抽出。
   - 完全 path から先頭 `/api/v1` を除去して正規形にする（`/healthz` は除去対象外）。
3. 正規化: `:param` → `{param}`, method を小文字化, 末尾スラッシュ除去, 空 path は `/` ではなく
   prefix 直下（例: `/api/v1/tasks` + `/` → `/tasks`）に解決。
4. 集合比較: `A \ B` と `B \ A` を算出。両方が空であることを `expect(...).toEqual([])` で assert。
   失敗時は両差分をソート済み配列でメッセージに出す。

### 例外 / エラー処理

- openapi.yaml が読めない / paths が無い場合はテストを fail させる（黙って pass しない）。
- ルータファイルや app.ts が prefix 対応表に無いルータをマウントしている場合（=対応表の保守漏れ）も
  検出して fail させる。これにより「新ルータを足したが対応表更新を忘れた」状態を防ぐ（決定 D-2 参照）。

## 重要な決定

- D-1（抽出方式: 正規表現を採用 / 未決-1 を解決）:
  実装側の path 抽出は**正規表現**で行う。対象は `router.<method>("…")` と `app.<method>("…")` の
  文字列リテラル第 1 引数のみで, 現状すべて静的リテラルである（動的 path は存在しない）。
  TypeScript Compiler API による AST 走査は依存と複雑度が増す割に, この単純な抽出では利得が小さい。
  ただし正規表現は「リテラルでない引数」を取りこぼし得るため, D-3 の防御を併用する。
- D-2（prefix 対応表: テスト内に明示保持 / 未決-2 を解決）:
  `app.route(prefix, xxxRouter)` の prefix → ルータファイルの対応は, テスト内に**明示的な定数表**
  として持つ（例: `{ "auth": "/api/v1", "tasks": "/api/v1/tasks", ... }`）。
  併せて, `app.ts` から `app.route("<prefix>", <ident>(deps))` を正規表現で抽出し,
  「対応表に載っていないマウントがある」「対応表にあるが app.ts に無い」を検出して fail させる。
  これにより対応表の保守漏れ自体がテストで捕まる。
- D-3（リテラル以外の混入検出）:
  ルータ / app.ts に `router.<method>(` / `app.<method>(` が現れるのに第 1 引数が文字列リテラルで
  ない箇所を検出したらテストを fail させる（抽出漏れの sentinel）。
- D-4（既存ドリフト解消方向: openapi を実装に寄せる / ADR 非設置 / 未決-3 を解決）:
  実装ハンドラを正本とし, openapi.yaml を実装へ整合させる（spec 非ゴール「本体に触れない」と整合）。
  - `/healthz`（GET）を openapi に追加し `x-internal: true` を付与。
  - `/trash/{id}/restore`（POST）を openapi に追加。
  - openapi の `/tasks/{id}/restore`・`/projects/{id}/restore`・`/routines/{id}/restore` を削除。
  - **ADR は新設しない。** これらの削除・追記は新たなアーキテクチャ決定ではなく, 実装に存在しない記載（願望）を
    スキーマから消し, 実装に存在する endpoint を追記する**ドリフト解消**に過ぎない。復元は実装上すでに
    `/trash/{id}/restore` に一本化されており, per-entity restore の 3 path には実装ハンドラが無い。
    判断根拠と将来 feature（BL-119 / BL-120）との整合は spec.md「ドリフト解消の方向と扱い」に記述する。
- D-5（テスト配置: structure 配下 / 未決-4 を解決）:
  `__tests__/structure/openapi-drift.test.ts` に置く。既存の構造的制約テスト群と同種であり,
  `__dirname` 基準で `repoRoot` を解決する既存パターン（`server-app-layer.test.ts`）を踏襲する。
- D-6（パーサ: js-yaml / 未決-5 を解決）:
  `js-yaml` + `@types/js-yaml` をルート `package.json` の devDependencies に追加する。

## リスク / 代替案

- リスク 1: 正規表現抽出が将来の動的 path 定義を取りこぼす。→ D-3 の sentinel で緩和。
- リスク 2: prefix 対応表のハードコードが app.ts のマウント変更と乖離する。→ D-2 の相互検証で緩和。
- リスク 3: openapi の restore 系削除が, クライアントや他 doc の前提と矛盾する。→ 実装は既に
  `/trash/{id}/restore` のみを公開しており, 削除対象 path には実装ハンドラが無い。BL-119 / BL-120 で
  Project / Routine の soft delete を実装する際も復元は `/trash/{id}/restore` 経由で統一されるため,
  per-entity restore path を削除しても将来の整合は崩れない。ドリフト解消であり ADR 化は不要（D-4）。
- 代替案（不採用）: `openapi-typescript` で型を生成し型レベルで突き合わせる案。型は path/method の
  集合一致検証には過剰で, 生成物の管理コストが増えるため不採用。

## テスト方針

> 全体方針は [`../../quality/test-catalog.md`](../../quality/test-catalog.md)。

- 本 feature の成果物自体がテスト（ドリフト検出テスト）であるため, テストは
  「整合状態で green / 片側更新漏れで red」を確実に表現することを最重要視する。
- AC-2 / AC-3（片側更新漏れで落ちる）は, 検出関数を純粋関数として切り出し,
  人工的な集合 A / B を渡して差分が正しく出ることをユニットに落として検証する
  （実ファイル改変なしに red 化挙動を確認できるようにする）。
- AC-4 / AC-5（正規化の偽陽性回避）も同関数のユニットで検証する。
- AC-1 / AC-6 / AC-7 / AC-8 は実ファイル（openapi.yaml + 実装ソース）に対する統合的 assert で検証する。
