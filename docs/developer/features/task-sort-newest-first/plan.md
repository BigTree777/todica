# 設計・実装計画: タスク並び順のタイブレークを作成日時降順に統一する

> [`spec.md`](spec.md) の要件を、どう実現するかに落とす。

## 方針概要

並び順ルールを I/O 非依存の共有比較器として domain 層（`domain/src/task`）に切り出し、
サーバの `sortToday` と Android ローカルの `today()` / `list()` の 3 箇所をこの共有比較器に
統一する。比較器の第 2 キー `createdAt` を昇順から**降順（新しい順）**へ反転させ、
第 1 キー priority・第 3 キー id 昇順は据え置く。これにより「並び順の正本を 1 箇所に集約」
と「タイブレークの新しい順への変更」を同時に達成する。

## 影響範囲

| 領域 | 変更内容 |
| --- | --- |
| API | 振る舞い変更のみ。`GET /api/v1/today` と `GET /api/v1/tasks`（`?dueDate=tomorrow` 含む）の返す並びが、同一優先度で新しい順になる。エンドポイント・スキーマ・パラメータの追加や形状変更は無し。`openapi.yaml` の並び順の説明文（現状「createdAt 昇順」）を降順へ更新する。 |
| DB | スキーマ変更なし。SQL の `ORDER BY` には依存せず（現状も未使用）、取得後にアプリ層で共有比較器により並べる方針を維持する。 |
| モジュール | domain: `domain/src/task/index.ts` に優先度順序・比較器・ソート関数を追加（下記 D-002）。server: `server/src/today.ts` の `sortToday` を domain の共有ソートへ委譲。`server/src/routers/_shared.ts` の `sortTasks`・`server/src/app/today-usecases.ts` は `sortToday` 経由のため差分は生じない。web(local): `web/src/repositories/local-task-repository.ts` の `today()` のローカルソートと `list()`（現状ソート無し）を domain 共有ソートへ置換し、ローカル定義の `priorityOrder` を撤去。 |
| UI | 変更なし。UI はサーバ / ローカルの返り順をそのまま表示する（再ソートしない既存挙動を維持）。「次の 1 つ」の見た目上のフォーカス対象が同一優先度では最新タスクに変わる。 |

## 設計詳細

- データモデル: 変更なし。並び順は `Task` の既存フィールド `priority` / `createdAt` / `id`
  のみに依存する。`Task.createdAt` は ISO 8601 文字列で、辞書順比較が時刻順と一致する。

- 処理フロー（新仕様の比較器 `compareTasksForView(a, b)`）:
  1. `priority` を数値化して比較（highest=0 → normal=1 → later=2、小さいほど先頭）。差があればそれで確定。
  2. 同値なら `createdAt` を**降順**比較（`b.createdAt` と `a.createdAt` の辞書順比較 =
     新しいものが先頭）。差があればそれで確定。
  3. 同値なら `id` を**昇順**比較（`a.id` と `b.id` の辞書順比較）。id は一意なので必ず確定する。
  `sortTasksForView(tasks)` は入力配列を破壊せず（spread でコピー）、`compareTasksForView`
  で安定ソートした新配列を返す。

- 各呼び出し箇所の処理フロー:
  - サーバ今日ビュー: `filterToday`（既存）→ `sortTasksForView`（旧 `sortToday` の中身を置換）
    → `pickNextTaskId`（既存、先頭 id）。`filterToday` / `pickNextTaskId` は today.ts に残す
    （「今日」の絞り込み・先頭抽出はビュー固有の意味論であり、並び順ルールとは責務が別）。
  - サーバ明日ビュー / 一覧: `_shared.ts` の `sortTasks` は `sortToday` を呼ぶ構造を維持し、
    `sortToday` が内部で `sortTasksForView` に委譲することで自動追従する。
  - Android ローカル `today()`: 取得行を `rowToTask` で `Task[]` に変換してから
    `sortTasksForView` を適用し、先頭 id を `nextTaskId` にする（現状の row 段階ソートを廃止）。
  - Android ローカル `list()`: 取得行を `rowToTask` で変換後、`sortTasksForView` を適用して返す
    （現状は未ソート = DB 返却順。ここを共有比較器に載せる）。

- 例外 / エラー処理: 追加の失敗経路なし。空配列入力時 `sortTasksForView` は空配列、
  `pickNextTaskId` / `nextTaskId` は `null`（既存挙動を維持）。未知の priority 値は
  数値化フォールバック（既存の `?? 99` 相当、末尾扱い）を共有比較器側に集約して踏襲する。

## 重要な決定

- **D-001: 第 2 キー `createdAt` を降順（新しい順）にする**。BL-141 の目的そのもの。
  同一優先度では後から作ったタスクほど先頭に並び、今日ビューの「次の 1 つ」も最新になる。

- **D-002: 並び順ルールを domain 層の共有比較器に集約する**。配置は
  `domain/src/task/index.ts`（Task 型・生成/更新ロジックと同居。並び順は Task の性質であり、
  I/O 非依存で純粋関数として表現できるため domain に属する）。公開する関数（推奨シグネチャ）:
  - `compareTasksForView(a: Task, b: Task): number` — 上記 3 段比較の比較器。
  - `sortTasksForView(tasks: Task[]): Task[]` — 非破壊ソート。
  優先度の数値順序（`PRIORITY_ORDER` 相当）も domain 側に一元化し、server の `PRIORITY_ORDER`
  と local の `priorityOrder` の重複を解消する。関数名は実装者が既存命名規約に合わせて微調整して
  よいが、「ビュー表示順の正本」であることが名前から分かること。

- **D-003: 第 3 キー `id` は昇順のまま据え置く**。理由: `id` は UUIDv4（乱数）で作成時刻と
  相関しないため、`id` の向きは「新しい/古い」の意味を持たない。したがって「新しい順」の意図が
  正当に及ぶのは `createdAt` のみで、`id` はあくまで `createdAt` 同値時の決定論的タイブレーカーに
  過ぎない。`id` を降順にしても「より新しい」を意味せず、逆に時刻順という誤った含意を与える。
  昇順据え置きは変更を `createdAt` の 1 段に限定し、既存の決定論性ルールを保ちつつ差分・
  リスクを最小化する。安定性の観点でも、`id` が一意である以上 3 段で全順序が定まり、
  ソートの安定性（同値要素の相対順維持）に結果は依存しない。

- **D-004: ADR 化は管理者 / auditor 判断とする**。並び順の正本を domain へ移し monorepo 全体の
  表示順ルールを変える変更であり、ADR（例:「タスク表示順の正本を domain 共有比較器に置く」）の
  候補になりうる。ただし現状この並び順ルールに対応する ADR は存在せず、仕様は本 plan.md D-001〜
  D-003 に書ききれている。ADR を新設するかは管理者に委ね、`project-designer` としては自己判断で
  ADR ファイルを作成しない（tasks.md に判断項目として明示）。

## リスク / 代替案

- R-001: `list()` は現状未ソートのため、これに並び順を適用すると Android ローカル明日ビューの
  表示順が変わる（意図した改善だが挙動変化）。受け入れ基準のローカル `list()` シナリオで担保する。

- R-002: 「次の 1 つ」= フォーカス対象の選ばれ方が同一優先度で最新タスクに変わる（ユーザー承認済み）。
  既存の focus / today 系テストで旧順序（古い順）を前提にした検証があれば新仕様へ追従が必要
  （tasks.md に回帰確認を明記）。

- 代替案 A: `id` も降順にして全キーを降順で揃える。D-003 の理由により不採用（UUIDv4 は時刻と
  無相関のため「向きを揃える」ことに意味論的な利得が無く、時刻順の誤った含意だけ生む）。

- 代替案 B: 比較器を domain に切り出さず、各所で `createdAt` の向きだけ個別に直す。BL-141 の
  再発（正本分散）を残すため不採用。NFR-2（正本の単一化）に反する。

## テスト方針

> 全体方針は [`../../quality/test-catalog.md`](../../quality/test-catalog.md)。

- domain 単体: `compareTasksForView` / `sortTasksForView` の 3 段規則を、spec.md の各シナリオ
  （同一優先度で新しい順・priority 優先・createdAt 同値で id 昇順・非破壊性・空配列）で検証。
- server 単体 / 結合: `sortToday` 経由で今日ビュー（`getTodayView` の `tasks` / `nextTaskId`）と
  一覧 / 明日ビュー（`_shared.ts` の `sortTasks`）が新順序になること。既存の並び順検証テストを
  新仕様へ更新。
- web(local) 単体: `LocalTaskRepository.today()` の `tasks` / `nextTaskId`、および `list()`
  （`dueDate="tomorrow"`）が新順序になること。特に `list()` は「DB 返却順ではなく共有比較器順」
  を確認する（挿入順と異なる期待順を与える）。
- モード間整合: 同一入力で server 側ソート結果と local 側ソート結果が一致することを確認。
