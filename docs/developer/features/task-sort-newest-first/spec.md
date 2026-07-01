# 仕様: タスク並び順のタイブレークを作成日時降順に統一する

- 状態: 確定
- 関連: [`../../planning/backlog.md`](../../planning/backlog.md) の BL-141

## 背景 / 課題

タスク一覧の並び順は `priority (highest→normal→later) → createdAt → id` の 3 段で決まる。
このうち第 2 キー `createdAt` が **昇順（古い順）** のため、同一優先度のタスクは
「先に作ったものが上・先頭」に並ぶ。今日ビューでは並びの先頭が「次の 1 つ」
（フォーカス対象）として選ばれるため、同一優先度なら常に一番古いタスクが先頭になる。

利用者が期待するのは「後から足したタスクほど手前に見える」振る舞いであり、
現状の「古い順」は直感に反する。全ビュー（today / tomorrow、サーバモード / Android
ローカルモード）で並びの第 2 キーを **作成日時降順（新しい順）** に統一する。

加えて、この並び順ルールは現在 3 箇所（サーバの `sortToday`、Android ローカルの
`today()`、同 `list()`）に重複実装されており、`list()` に至っては未適用（DB 返却順の
まま）である。ルールの正本が分散していると、今回のような変更で不整合が生じやすい。

## ゴール / 非ゴール

- ゴール:
  - 全ビュー・全モードでタスクの並び順を
    `priority (highest→normal→later) → createdAt 降順（新しい順） → id 昇順` に統一する。
  - 今日ビューの「次の 1 つ」= 並びの先頭が、同一優先度では**最新のタスク**になる。
  - Android ローカルモードの `list()`（明日ビューで使用）に並び順を適用し、
    サーバモードと同じ順序を保証する。
  - 並び順ルールを I/O 非依存の共有部品として 1 箇所に集約し、重複を解消する。
- 非ゴール:
  - 第 1 キー（priority の順序: highest→normal→later）は変更しない。
  - 並び順を利用者が切り替える UI / API パラメータは追加しない（NFR-001 / NFR-013）。
  - trashed（ゴミ箱）タスクの並び順・表示条件は変更しない。
  - タスクの絞り込み条件（dueDate / trashedAt によるフィルタ）は変更しない。

## 要件

- 機能要件:
  - FR-1: タスクの並び順は次の 3 段で決定論的に決まる。
    1. `priority`（highest → normal → later）
    2. 同一優先度内は `createdAt` **降順**（新しいものが先頭 / 古いものが末尾）
    3. 同一 `createdAt` 内は `id` **昇順**（決定論的タイブレーク）
  - FR-2: この並び順を、今日ビュー（サーバ `/today`・Android ローカル `today()`）と
    明日ビュー（サーバ `/tasks?dueDate=tomorrow`・Android ローカル `list()`）の
    双方に適用する。
  - FR-3: 今日ビューの「次の 1 つ」（`nextTaskId` / `pickNextTaskId`）は並びの先頭タスクの
    id とする。同一優先度のタスクのみが対象のとき、最新に作成されたタスクの id になる。
  - FR-4: 並びの対象が空のとき「次の 1 つ」は `null` とする（既存挙動を維持）。
  - FR-5: クライアントはサーバから受け取った並びを再ソートしない（既存挙動を維持）。
    Android ローカルモードは共有部品を使って自前で並べる。
- 非機能要件:
  - NFR-1（決定論性 / NFR-013）: 同一の入力集合に対し、実行環境・モード・入力の
    到着順によらず常に同一の並びを返す。第 3 キー `id` により順序は一意に定まる。
  - NFR-2（正本の単一化）: 並び順ルールの実装は 1 箇所に集約し、サーバ・Android
    ローカルの両方がそれを参照する。同じルールを複数箇所に書かない。

## 受け入れ基準

> 書き方は [`../../quality/acceptance-criteria.md`](../../quality/acceptance-criteria.md) に従う。
> 以下の `createdAt` は ISO 8601 文字列。時刻の大小がそのまま作成の前後を表す。

```
シナリオ: 同一優先度では作成日時が新しいタスクが先頭に並ぶ
  Given タスク A (priority="normal", createdAt="2026-01-01T10:00:00.000Z", id="a")
  And   タスク B (priority="normal", createdAt="2026-01-01T11:00:00.000Z", id="b")
  When  並び順を適用する
  Then  並びは B, A の順（新しい B が先頭）になる
```

```
シナリオ: priority が第 1 キーであり createdAt より優先される
  Given タスク A (priority="highest", createdAt="2026-01-01T09:00:00.000Z", id="a")
  And   タスク B (priority="normal",  createdAt="2026-01-01T12:00:00.000Z", id="b")
  And   タスク C (priority="later",   createdAt="2026-01-01T13:00:00.000Z", id="c")
  When  並び順を適用する
  Then  並びは A, B, C の順（priority: highest→normal→later が最優先）になる
```

```
シナリオ: 同一優先度・同一作成日時は id 昇順で決定論的に並ぶ
  Given タスク A (priority="normal", createdAt="2026-01-01T10:00:00.000Z", id="a1")
  And   タスク B (priority="normal", createdAt="2026-01-01T10:00:00.000Z", id="b2")
  When  並び順を適用する
  Then  並びは A, B の順（createdAt が同値なので id 昇順）になる
```

```
シナリオ: 今日ビューの「次の 1 つ」は同一優先度では最新タスクになる
  Given dueDate="today" かつ trashedAt=null のタスク
        P (priority="normal", createdAt="2026-01-01T08:00:00.000Z", id="p")
  And   Q (priority="normal", createdAt="2026-01-01T09:00:00.000Z", id="q")
  When  今日ビューを取得する
  Then  tasks は Q, P の順になる
  And   nextTaskId は "q"（最新タスク）になる
```

```
シナリオ: 今日ビューが空のとき「次の 1 つ」は null
  Given dueDate="today" かつ trashedAt=null のタスクが 0 件
  When  今日ビューを取得する
  Then  tasks は空配列
  And   nextTaskId は null
```

```
シナリオ: 明日ビューでも新しい順のタイブレークが適用される
  Given dueDate="tomorrow" かつ trashedAt=null のタスク
        A (priority="highest", createdAt="2026-01-01T10:00:00.000Z", id="a")
  And   B (priority="normal",  createdAt="2026-01-01T10:00:00.000Z", id="b")
  And   C (priority="normal",  createdAt="2026-01-01T12:00:00.000Z", id="c")
  When  明日ビューの一覧を取得する
  Then  並びは A, C, B の順（highest 先頭、normal 内は新しい C が B より前）になる
```

```
シナリオ: Android ローカルモードの today() がサーバと同じ順序を返す
  Given ローカル DB に dueDate="today" / trashedAt=null のタスク
        X (priority="normal", createdAt="2026-01-01T10:00:00.000Z", id="x")
  And   Y (priority="normal", createdAt="2026-01-01T11:00:00.000Z", id="y")
  When  ローカルモードで今日ビューを取得する
  Then  tasks は Y, X の順
  And   nextTaskId は "y"
```

```
シナリオ: Android ローカルモードの list()（明日ビュー）が並び順を適用する
  Given ローカル DB が dueDate="tomorrow" / trashedAt=null のタスクを
        挿入順（M が先, N が後）で返す
        M (priority="normal", createdAt="2026-01-01T10:00:00.000Z", id="m")
  And   N (priority="normal", createdAt="2026-01-01T11:00:00.000Z", id="n")
  When  ローカルモードで list({ dueDate: "tomorrow" }) を呼ぶ
  Then  戻り値は N, M の順（DB 返却順ではなく、新しい N が先頭）になる
```

```
シナリオ: 同一入力ならサーバとローカルで並びが一致する（モード間整合）
  Given 同一のタスク集合（priority / createdAt / id が同じ）
  When  サーバの並び順とローカルモードの並び順をそれぞれ適用する
  Then  両者の並びは完全に一致する
```

## 未決事項 / 確認待ち

- なし（スコープ・タイブレークの向きは確定済み。詳細な設計判断は plan.md D-001〜D-004 を参照）。
