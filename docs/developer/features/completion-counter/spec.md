# 仕様: 今日の完了タスク数カウントの表示

- 状態: ドラフト
- 関連: [`../../planning/backlog.md`](../../planning/backlog.md) BL-008
- 由来要件: FR-040 (今日の完了タスク数を表示)
- 関連 FR: FR-006 (完了アクション +1) / FR-007 (削除アクションはカウント非加算) / FR-060 (ゴミ箱経由)
- 関連 NFR: NFR-001 (単一ワークフロー) / NFR-010 (最小手数) / NFR-013 (今日ビューの予測可能性) / NFR-020 (日次状態の整合的管理)
- 関連先行 feature:
  - [`../task-complete/spec.md`](../task-complete/spec.md) (BL-003 で確立した完了アクション. 「カウント +1 は本 feature の責務」と明示済)
  - [`../today-view/spec.md`](../today-view/spec.md) (BL-005 で確立した今日ビュー API)
  - [`../focus-task/spec.md`](../focus-task/spec.md) (BL-006 で `/today` レスポンスに `currentTaskId` を追加した前例)

## 背景 / 課題

Todica の中核体験 UC-001「今日のループを回す」は「やる → 完了 → 次へ」のリズムで成り立つ. 「今日 N 個終わらせた」という日次の達成感の可視化が, UC-001 を継続させるための最小限の動機付けになる (project.md §6 Value Proposition, §8 In Scope「今日の完了タスク数のカウント表示」).

BL-001 〜 BL-007 までで以下が稼働済である.

- 完了アクション (`POST /api/v1/tasks/:id/complete`) は `trashedReason = "completed"` への遷移を担っており, BL-003 の spec.md / plan.md で「カウント +1 は BL-008 待ち」と明記されている.
- 今日ビュー (`GET /api/v1/today`) は `{ tasks, nextTaskId, currentTaskId }` を返す (BL-006 で `currentTaskId` 同梱に拡張済). 1 リクエストで「今日見るべきもの」を集約できる構造になっている.
- Counter エンティティは論理スキーマ ([`architecture/database/schema.md`](../../architecture/database/schema.md) §Counter) に定義済 (`id = "singleton"`, `completedCount`, `lastResetExecutedAt`, `version`, `updatedAt`). ただし物理スキーマ (drizzle) / Repository / API は未実装.
- OpenAPI (`architecture/api/openapi.yaml`) の `/counter` path は骨格のみで, request / response schema は未定義.

未充足は次のとおり.

- **Counter 物理スキーマと Repository 不在**: schema.md の論理定義はあるが, drizzle テーブル / repository / 起動時 INSERT のいずれも未実装.
- **`GET /api/v1/counter` 未実装**: 「今日の完了数」を読む手段が API にも UI にも無い.
- **完了アクションでカウントが増えない**: BL-003 が「+1 は BL-008 待ち」のまま留め置いた集計副作用が不在. `trashedReason = "completed"` への遷移は起きているが, それを `completedCount` に反映する経路が無い.
- **今日ビュー UI に完了数表示が無い**: `web/src/ui/today-view/today-view.tsx` には起票フォーム / 現在のタスク強調 / タスク一覧はあるが, 「今日の完了数」を可視化する要素が無い.

本 feature は FR-040 を満たすため, Counter の物理化, `GET /api/v1/counter` の実装, 完了アクションへの +1 集計の統合, そして今日ビュー UI への表示までを end-to-end で完成させる. 「リセット時の 0 クリア」(FR-043) は BL-010 の責務であり, 本 feature では `completedCount` の **増加経路** のみを実装する.

## ゴール / 非ゴール

### ゴール

- **Counter エンティティの物理化**. drizzle テーブル `counter` を新設し, 起動時 INSERT で singleton レコード (`id = "singleton"`, `completedCount = 0`, `lastResetExecutedAt = null`, `version = 1`) を 1 件確保する.
- **`GET /api/v1/counter` を実装する**. Bearer 認証必須 / 読取専用. レスポンスは `{ counter: { id, completedCount, lastResetExecutedAt, version, updatedAt } }`.
- **完了アクションで `completedCount` を +1 する**. `POST /api/v1/tasks/:id/complete` で **通常状態 (`trashedAt = null`)** のタスクを完了させたときのみ +1. 既ゴミ箱状態 (`trashedReason = "completed"` / `"deleted"` のいずれか) への no-op 再 complete では +1 しない (FR-006 の「完了アクションでカウント +1」と D-002 の冪等性が両立する).
- **削除アクションは `completedCount` を変えない** (FR-007).
- **今日ビュー UI に「今日の完了数」を表示する**. ユーザーが完了ボタンを押した直後に表示が +1 反映される (楽観 UI ではなくサーバ正本値の再フェッチで反映する).
- **`GET /api/v1/today` レスポンスに `completionCount: number` を含める**. BL-006 で `currentTaskId` を `/today` に同梱した前例と同じ思想で, 「今日ビューに必要な情報を 1 リクエストで完結させる」ためのフィールド追加.
- **`completedCount` の整合性をトランザクションで担保する**. 完了遷移 (`tasks` 更新) と `completedCount` の +1 は 1 トランザクション内で atomic に行う. 同じ Idempotency-Key で再送されても 2 回 +1 されない (NFR-020).
- **`Counter` を `version` 付きの楽観ロック対象として定義する**. ただし本 feature が直接 `If-Match` で更新するクライアント経路 (`PUT /api/v1/counter` 等) は **提供しない**. `version` カラムを持つ理由は schema.md §同期メタデータの共通方針との整合と, BL-010 (日次リセット) で更新する際の整合確認のため.

### 非ゴール

- **日次リセット (`completedCount = 0` クリア)**: BL-010 / FR-043 の責務. 本 feature では `lastResetExecutedAt` カラムを持つことのみ整え, リセット処理は実装しない. `completedCount` の **増加のみ** を扱う.
- **手動カウンタ補正 / リセット API**: `PUT /api/v1/counter` `POST /api/v1/counter/reset` などのユーザー操作経路は提供しない (NFR-001 単一ワークフロー / NFR-012 設定項目最小化). カウントは「完了アクション → +1」「日次リセット → 0」の 2 経路だけで動く.
- **完了履歴 / 過去日のカウント / グラフ表示**: project.md §8 Out of Scope の「進捗管理 / 進捗率」「ルーティンの実施履歴・ストリーク」と同じ精神で, 「今日の完了数」のみを単一数値として提示する. 累積カウント・週次グラフなどは持たない.
- **復元時のカウント減算**: schema.md §Task §状態遷移で確定済 (「完了済み Task の復元も可能だが, 完了カウントは戻さない」). 本 feature では復元 API (BL-011 の責務) を実装しないため, コード上「何もしないこと」で担保される.
- **ルーティン由来タスクと通常タスクで完了カウントを区別**: schema.md §Task の `origin` カラムは区別を可能にするが, FR-040 は「完了タスク数」を単一値で扱うため区別しない.
- **完了アクション以外の経路でのカウント増加**: 例えば「タスクを直接 `trashedReason = "completed"` に書き換える」「ゴミ箱から復元 → 再度完了」のような経路でも `completedCount` は **完了 API を経由した時のみ** 増える. 復元 + 再完了の二重カウントが懸念されるが, 復元は BL-011 の責務であり, 復元後の再完了は新たな完了行為として +1 する (= 利用者から見ても妥当な意味付け).
- **オフライン / PWA 対応のキュー処理**: BL-018 の責務. 本 feature はオンライン HTTP 経由の動作のみ規定する.
- **`PUT /api/v1/counter` (任意更新)**: 上記の「手動補正なし」方針により API として提供しない. BL-010 の日次リセット処理はサーバ内部のサービス層から直接 Repository を叩く想定で, クライアント向け書き込み API としては存在しない.

## 要件

### 機能要件

本 feature で実装する FR は以下のとおり.

- **FR-040 (今日の完了タスク数を表示)**
  - サーバは「今日の完了タスク数」(`completedCount`) を保持し, API 経由でクライアントに提供する.
  - クライアント (今日ビュー) は当該値を視覚的にユーザーに提示する.
- **FR-006 (タスクを完了できる) のうち「完了は今日の完了タスク数のカウントに +1 として反映される」部分**
  - BL-003 で「ゴミ箱経由の完了遷移」までを実装済. 本 feature で「+1 集計」を実装する.
  - 集計トリガは `POST /api/v1/tasks/:id/complete` で **通常状態のタスクを完了させた** 経路のみ. 既ゴミ箱状態への no-op 再 complete では +1 しない.
- **FR-007 (タスクを削除できる) のうち「削除はカウントに含めない」部分**
  - BL-001 で削除 API を実装済. 本 feature では「削除では `completedCount` が動かない」ことをテストで担保するのみ (削除コードに新規変更は無い).

### 非機能要件

- **NFR-001 (単一ワークフロー)**: 完了数を変える手段は「完了アクション (+1)」「日次リセット (0 クリア, BL-010)」の 2 経路に限定する. ユーザーが直接補正する UI / API は提供しない.
- **NFR-010 (最小手数)**: 完了数の表示は今日ビューに常時 1 箇所だけ. 設定で表示 ON/OFF などは持たない (NFR-012).
- **NFR-013 (今日ビューの予測可能性)**: 同じ完了履歴なら常に同じ `completedCount` が表示される. 完了アクション直後の再描画で「サーバが返した正本値」を表示することで, クライアント側の独自カウンタによる揺らぎを排除する.
- **NFR-020 (日次状態の整合的管理)**:
  - 完了遷移 (`tasks` 更新) と `completedCount` +1 は 1 トランザクション内で atomic に行う.
  - 同じ Idempotency-Key で再送されても保存済み応答が返り, `completedCount` は +1 から +2 に進まない.
  - `version` カラムは BL-010 (日次リセット) との衝突検知に使う土台として用意する.

### 認証 / 冪等性 / 楽観ロックの規約

- `/api/v1/counter` も他の読取系 API と同じく Bearer 認証必須 (`UNAUTHORIZED` で 401).
- `GET /api/v1/counter` は読取専用 (Idempotency-Key / If-Match 不要).
- 本 feature では `PUT /api/v1/counter` を提供しないため, クライアント向けの If-Match 規約は無し.

## 受け入れ基準

> 書き方は [`../../quality/acceptance-criteria.md`](../../quality/acceptance-criteria.md) に従う. Gherkin の Given/When/Then で表現する.

### Counter の初期状態 (FR-040)

```
シナリオ: 初回アクセス時の Counter は completedCount = 0 で 1 件存在する
  Given サーバを起動した直後で Counter を一度も更新していない
  When  GET /api/v1/counter を呼ぶ
  Then  200 OK で { counter: { id: "singleton", completedCount: 0, lastResetExecutedAt: null, version: 1, updatedAt: <ISO 8601> } } が返る
```

```
シナリオ: 認証なしの GET /api/v1/counter は 401
  Given Authorization ヘッダを付けない
  When  GET /api/v1/counter を呼ぶ
  Then  401 UNAUTHORIZED が返る
```

### 完了アクションによる +1 (FR-006 / FR-040)

```
シナリオ: 通常状態のタスクを完了すると completedCount が +1 になる
  Given Counter.completedCount = 0
  And   タスク T が { trashedAt: null, trashedReason: null, version: 1 } で存在する
  When  POST /api/v1/tasks/<T の id>/complete を Idempotency-Key と If-Match: 1 で送る
  Then  200 OK が返り, T は trashedReason = "completed" になる
  And   その後の GET /api/v1/counter は completedCount = 1 を返す
  And   その GET /api/v1/counter の version は 2 になっている (Counter は更新された)
```

```
シナリオ: 2 件続けて完了すると completedCount は 2 になる
  Given Counter.completedCount = 0, タスク T1 / T2 が通常状態で存在する
  When  T1, T2 の順で POST /api/v1/tasks/:id/complete を送る
  Then  GET /api/v1/counter は completedCount = 2 を返す
```

```
シナリオ: 既にゴミ箱状態 (trashedReason = "completed") のタスクへの再 complete では completedCount は増えない
  Given Counter.completedCount = 1
  And   タスク T が { trashedAt: <過去>, trashedReason: "completed", version: 2 } で存在する
  When  POST /api/v1/tasks/<T の id>/complete を新しい Idempotency-Key で送る
  Then  200 OK が返り, T は変更されない
  And   GET /api/v1/counter は completedCount = 1 のまま
  ※ BL-003 (task-complete) の D-003 で「既ゴミ箱は no-op 200」と確定. その no-op 経路では +1 しない.
```

```
シナリオ: 既に削除済 (trashedReason = "deleted") のタスクへの complete は completedCount を増やさない
  Given Counter.completedCount = 0
  And   タスク T が { trashedAt: <過去>, trashedReason: "deleted", version: 2 } で存在する
  When  POST /api/v1/tasks/<T の id>/complete を送る
  Then  200 OK が返り, T は変更されない (BL-003 の no-op 経路)
  And   GET /api/v1/counter は completedCount = 0 のまま
```

### 削除アクションはカウントを変えない (FR-007)

```
シナリオ: 通常状態のタスクを削除しても completedCount は変わらない
  Given Counter.completedCount = 0
  And   タスク T が通常状態で存在する
  When  DELETE /api/v1/tasks/<T の id> を送る
  Then  204 が返り, T は trashedReason = "deleted" になる
  And   GET /api/v1/counter は completedCount = 0 のまま
```

```
シナリオ: 期限変更 (today → tomorrow) も completedCount を変えない
  Given Counter.completedCount = 0
  And   タスク T が dueDate = "today" で存在する
  When  PATCH /api/v1/tasks/<T の id> に { dueDate: "tomorrow" } を送る
  Then  200 OK が返る
  And   GET /api/v1/counter は completedCount = 0 のまま
```

### Idempotency-Key 再送による二重カウント防止 (NFR-020)

```
シナリオ: 同じ Idempotency-Key で 2 回 complete を送っても completedCount は +1 だけ
  Given Counter.completedCount = 0
  And   タスク T が { version: 1 } で存在する
  When  POST /api/v1/tasks/<T の id>/complete を Idempotency-Key: "k1", If-Match: 1 で 1 回成功させる
  And   まったく同じヘッダ・同じパスで再送する
  Then  2 回目も 200 OK が返り, レスポンスボディは 1 回目と同じ
  And   GET /api/v1/counter は completedCount = 1 のまま (= 2 に進まない)
```

### `GET /api/v1/today` レスポンスへの同梱 (UI 連携)

```
シナリオ: GET /api/v1/today に completionCount が含まれる
  Given Counter.completedCount = 3
  When  GET /api/v1/today を呼ぶ
  Then  200 OK で { tasks: [...], nextTaskId: ..., currentTaskId: ..., completionCount: 3 } が返る
```

```
シナリオ: 完了直後に GET /api/v1/today で読むと completionCount が +1 反映されている
  Given Counter.completedCount = 0
  And   今日ビューにタスク A, B が並ぶ
  When  POST /api/v1/tasks/<A の id>/complete を送る
  And   その後 GET /api/v1/today を呼ぶ
  Then  completionCount = 1 が返る (= サーバ正本値)
```

### Web クライアント UI (FR-040 / NFR-013)

```
シナリオ: 今日ビューに「今日の完了数」が表示される
  Given サーバ正本で Counter.completedCount = 2
  When  ユーザーが今日ビューを開く
  Then  「今日の完了: 2」相当の表示が画面に存在する
  ※ 文言・位置・装飾は UI 実装の裁量. 「2 という数値が表示されている」「ラベルが完了数を意味する」が成り立つこと.
```

```
シナリオ: 完了ボタンで完了すると, 今日ビューの完了数表示が +1 反映される
  Given 今日ビューに タスク A が表示され, completionCount = 0 が表示されている
  When  ユーザーが A の「完了」ボタンをクリックする
  Then  A は今日ビューから消える
  And   完了数表示が 1 に更新される (= サーバ再フェッチによる正本値反映)
```

```
シナリオ: 削除ボタンでは完了数表示は変化しない
  Given 今日ビューに タスク B が表示され, completionCount = 1 が表示されている
  When  ユーザーが B の「削除」ボタンをクリックする
  Then  B は今日ビューから消える
  And   完了数表示は 1 のまま
```

```
シナリオ: 期限切替 (today → tomorrow) でも完了数表示は変化しない
  Given 今日ビューに タスク C が dueDate = "today" で表示され, completionCount = 1 が表示されている
  When  ユーザーが C の「明日へ」ボタンをクリックする
  Then  C は今日ビューから消える
  And   完了数表示は 1 のまま
```

```
シナリオ: ページ再読込でも完了数表示はサーバ正本値で復元される
  Given Counter.completedCount = 5 (サーバ正本)
  When  ユーザーが今日ビューをリロードする
  Then  完了数表示は 5 で描画される (クライアント側に独自カウンタを持たない)
```

### スコープ境界の明示 (本 feature が触らないこと)

```
シナリオ: 本 feature ではリセット API / 手動補正 API は提供しない
  Given 本 feature がマージされた直後
  When  PUT /api/v1/counter / POST /api/v1/counter/reset 等を呼ぶ
  Then  該当エンドポイントは存在せず 404 が返る
  ※ リセットは BL-010 の責務. リセット API は BL-010 で `/reset` (既骨格あり) として整える.
```

```
シナリオ: 本 feature ではゴミ箱からの復元時にカウントを減算しない
  Given Counter.completedCount = 3
  And   完了済タスク T が trashedReason = "completed" でゴミ箱にある
  When  (BL-011 で実装される) 復元 API でタスク T を復元する
  Then  GET /api/v1/counter は completedCount = 3 のまま (減算しない)
  ※ schema.md §Task §状態遷移で確定済. 復元 API そのものの実装は BL-011 の責務.
```

## 未決事項 / 確認待ち

- **U-001 `GET /api/v1/today` レスポンスに `completionCount` を含めるか, `/counter` 専用エンドポイントだけにするか**
  - 保守側デフォルト案: **`/today` に含める** (`{ tasks, nextTaskId, currentTaskId, completionCount }`). BL-006 で `/today` に `currentTaskId` を含めた前例があり, 「今日ビューに必要な情報を 1 リクエストで完結させる」設計指針と一致. クライアントは 1 リクエストで描画に必要な全情報を取得でき, 完了後の再フェッチも `/today` 1 本で済む.
  - 並行で `/counter` 単独エンドポイントも実装する (将来 BL-009 / BL-010 や他画面が完了数だけ読みたい時の素直な経路, および schema 単独で意味があるリソースとして).
  - 代替案: `/counter` のみ実装し `/today` は触らない. 1 リクエスト化を諦め, クライアントは 2 リクエスト並列フェッチする (BL-006 の旧 D-004 と同じ思想). この場合 BL-006 の `currentTaskId` 同梱と一貫しない.
  - 確認質問: `/today` 同梱 + `/counter` 単独の二重実装で良いか.
- **U-002 完了 → +1 の集計は API ハンドラ内で行うか, ドメインイベント経由か**
  - 保守側デフォルト案: **API ハンドラ内で同一トランザクションで行う**. `POST /api/v1/tasks/:id/complete` ハンドラの末尾 (BL-006 で focus 解除を追加したのと同じ位置) に「通常状態 → 完了に遷移したなら counter を +1」処理を追加. better-sqlite3 の `db.transaction()` で atomic 化.
  - 代替案: ドメインイベント駆動 (CompleteTaskEvent を発火 → イベントハンドラが counter を更新). 拡張性は高いが現状のコードベース (BL-001 〜 BL-006) にイベントバスが存在せず, 本 feature のためだけに導入すると過剰実装.
  - 確認質問: ハンドラ内集計で良いか.
- **U-003 Counter は singleton (1 件) を起動時 INSERT で確保するか, lazy 生成か**
  - 保守側デフォルト案: **マイグレーション / 起動時に 1 件 INSERT** (`id = "singleton", completedCount = 0, lastResetExecutedAt = null, version = 1`). BL-006 (focus-task) D-007 と同じ方針で揃える. lazy 生成はレース条件の考慮が増える.
  - 代替案: 初回 GET 時に存在しなければ作る. 起動コストはわずかに下がるが, マイグレーション側で 1 件 INSERT する方が API 側のコードが単純になる.
  - 確認質問: 起動時 INSERT で良いか.
- **U-004 `lastResetExecutedAt` カラムを本 feature で持つか, BL-010 で追加するか**
  - 保守側デフォルト案: **本 feature でカラムを追加** (`null` 初期値). schema.md §Counter にも既に定義されており, drizzle テーブル定義としては最初から持つ方が自然. 本 feature では値を **書き込まず読み取りもしない** (BL-010 が初めて使う).
  - 代替案: 本 feature では `completedCount` / `version` / `updatedAt` のみのテーブルにし, BL-010 でマイグレーション追加. テーブル変更 2 回になり手間.
  - 確認質問: 本 feature で `lastResetExecutedAt` カラムも持つ方針で良いか.
- **U-005 復元時に completedCount を減算しないことを「テストで担保するか, ドキュメントだけで宣言するか」**
  - 保守側デフォルト案: **本 feature では復元 API を実装しないため, 「減算するコードが無いこと」で担保する** (テスト追加なし). 「復元後も completedCount が変わらない」シナリオは BL-011 (ゴミ箱・復元) の受け入れ基準に書く.
  - 確認質問: 本 feature のテストには含めなくて良いか.
- **U-006 UI 上の表示位置・文言**
  - 保守側デフォルト案: 今日ビューの **画面上部** に「今日の完了: N」のラベルで表示. 強調セクション (BL-006 の現在のタスク) より上, あるいは横に並べる. 詳細レイアウトは UI 実装 (implementer) の裁量.
  - 代替案: 画面下部のフッタ. 完了アクション後の視線移動が大きく, 即座のフィードバックとして弱い.
  - 確認質問: 画面上部表示で良いか (詳細は implementer 裁量).
- **U-007 `GET /api/v1/today` の `completionCount` フィールド名**
  - 保守側デフォルト案: **`completionCount`** (動詞 + Count の組合せ. 「今日中に完了した数」を表す).
  - 代替案: `completedCount` (Counter エンティティと同名で揃える) / `todayCompletedCount` (冗長だが意図が明示) / `doneCount` など.
  - 確認質問: `/today` 側は `completionCount`, Counter エンティティ内は `completedCount` で揃いを欠くがそれで良いか. (内部状態と API 表現で意味の粒度を変える前例として BL-005 の `nextTaskId` がある.) **もしくは両方を `completedCount` に統一**するか.
