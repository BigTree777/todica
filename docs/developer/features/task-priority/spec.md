# 仕様: タスク優先度（3 段階の付与・変更）

- 状態: ドラフト
- 関連: [`../../planning/backlog.md`](../../planning/backlog.md) BL-002
- 由来要件: FR-003（優先度 3 段階の付与）/ FR-004（優先度の登録後変更）
- 関連 NFR: NFR-001（単一ワークフロー）/ NFR-010（最小手数の起票）/ NFR-012（設定項目最小化）/ NFR-013（並び順の予測可能性）/ NFR-020（日次整合）
- 関連先行 feature: [`../task-crud/spec.md`](../task-crud/spec.md)（BL-001 で実装済の起票・編集 API / UI を本機能で拡張する）

## 背景 / 課題

Todica の中核体験は「今日のタスクを優先度順に上から消化する」ことであり, 優先度はそれを成立させる唯一の並び替え軸である（FR-011 / 今日ビュー BL-005 の前提）. BL-001（タスク CRUD）でデータモデル・API・並びの暫定実装までは整っているが, **優先度をユーザーが UI から付与・変更できる経路** と, **既存の編集 API（PATCH）で priority を受理する経路** が未実装である. BL-002 はこの 2 経路を埋め, FR-003 / FR-004 を end-to-end で成立させる.

## ゴール / 非ゴール

### ゴール

- 登録済みタスクの優先度を **API（PATCH /api/v1/tasks/{id}）から変更できる**（FR-004）.
- Web クライアントの今日ビュー上で, **起票時の優先度指定** と **既存タスクの優先度変更** を, 単一ワークフローを崩さない最小手数で行える（FR-003 / FR-004, NFR-001 / NFR-010 / NFR-012）.
- 優先度未指定で起票したタスクは `"normal"` になることが API レベル / UI レベルで明示的に保証される（FR-003 既定値）.

### 非ゴール

- データモデルの追加・変更. Task の `priority` フィールドは BL-001 で確定済（`"highest" | "normal" | "later"` の enum）であり, 本機能では一切変更しない.
- 起票 API（POST /api/v1/tasks）の優先度受理. **BL-001 で実装済**（POST のリクエストスキーマで `priority` を受理し, enum 違反は `INVALID_PRIORITY` 400 で弾く挙動が `server/src/app.ts` と `domain/src/task` に既に存在）. 本機能では既存挙動の確認テストのみ追加する.
- ドメインの `validatePriority` / `createTask` 既定値補完. **BL-001 で実装済**.
- 優先度に基づく今日ビューの並び順仕様の本決定（BL-005 の責務）. 本機能は priority を変更したら一覧の表示順が再計算される, ことのみ担保する.
- 優先度の自動繰越（FR-051: 日次リセット時に未完了タスクを `priority="highest"` に持ち上げる）. これは BL-010 の責務.
- ルーティンの既定優先度（FR-030 / FR-035 の `defaultPriority`）. これは BL-017 の責務.
- 「最優先（highest）の付与可能数に上限を設ける」等の **意味的な制約**. project.md / requirements.md にはそのような記述がない（NFR-012 設定項目最小化に反するため導入しない）.

## 要件

### 機能要件

本機能で実装する FR は以下のとおり.

- **FR-003 (優先度 3 段階の付与)**
  - 値は `"highest"` / `"normal"` / `"later"` の 3 段階に限定する.
  - 起票時に優先度を明示しない場合は既定値 `"normal"` が割り当てられる.
  - 起票時に値域外を指定したリクエストは弾く（既存挙動の確認）.
- **FR-004 (優先度の登録後変更)**
  - 登録済みタスクの優先度を 3 段階の中で任意に変更できる.
  - 変更経路は PATCH `/api/v1/tasks/{id}` の `priority` フィールド.
  - 値域外への変更は弾く（`INVALID_PRIORITY` 400）.

### 関連する FR（本機能では新規実装しないが整合を確認する）

- **FR-011 / NFR-013**: 優先度を変更すると, 今日ビューの並び順の "次の 1 つ" が再計算される（BL-005 の責務だが, 本機能の UI も暫定 3 段ソートで即時に再計算されることを担保）.

### 非機能要件

- **NFR-001 (単一ワークフロー)**: 優先度操作 UI は「起票フォームに既定 `normal` の select を 1 つ」「タスク行に優先度を変更する 1 操作」のみとし, 設定画面・並び替えカスタマイズなどの選択肢を増やす UI を導入しない.
- **NFR-010 (最小手数の起票)**: 起票フォームの必須入力は引き続き **タスク名のみ**. 優先度欄は任意項目（既定 `normal`）として追加し, 未操作のままでも起票できる.
- **NFR-012 (設定項目最小化)**: 「優先度の既定値を変える」等のユーザー設定は提供しない.
- **NFR-013 (並び順の予測可能性)**: 優先度変更後の一覧表示は決定論的に `dueDate → priority → createdAt` の暫定 3 段ソートで再描画する（BL-005 で本決定するまでの暫定実装を維持）.
- **NFR-020 (日次整合)**: 優先度変更も他の PATCH と同様, 1 トランザクション内で `version + 1`, `updatedAt = now()` を行い, `Idempotency-Key` / `If-Match` の制約を踏襲する（BL-001 で確立済の経路を再利用）.

## 受け入れ基準

> 書き方は [`../../quality/acceptance-criteria.md`](../../quality/acceptance-criteria.md) に従う. 後段 test-designer がそのままテストに落とせる粒度.
> BL-001 の受け入れ基準で既にカバーされているものは「**BL-001 にて担保済**」と注記し, 本 feature では再掲しない.

### 起票時の優先度（FR-003）

> BL-001 にて担保済の項目（本 feature では再掲しない）:
> - 値域外の `priority` を指定した起票は `INVALID_PRIORITY` 400 で弾かれる（`server/src/app.ts` の enum チェックおよび `domain/src/task/validatePriority` に実装済）.
> - `priority` を明示指定して起票できる経路（POST のリクエストスキーマで受理される）.

本 feature で追加するシナリオは以下.

```
シナリオ: 起票時に priority を省略すると normal が割り当たる
  Given 認証済みのリクエストである
  When  クライアントが POST /api/v1/tasks を { "id": <UUIDv4>, "name": "x" } で送る
  And   リクエストボディに priority フィールドを含めない
  Then  HTTP 201 Created が返り, レスポンスの task.priority が "normal" である
```

```
シナリオ: 起票時に priority = "highest" を明示できる
  Given 認証済みのリクエストである
  When  クライアントが POST /api/v1/tasks を { "id": <UUIDv4>, "name": "x", "priority": "highest" } で送る
  Then  HTTP 201 Created が返り, レスポンスの task.priority が "highest" である
```

```
シナリオ: 起票時に priority = "later" を明示できる
  Given 認証済みのリクエストである
  When  クライアントが POST /api/v1/tasks を { "id": <UUIDv4>, "name": "x", "priority": "later" } で送る
  Then  HTTP 201 Created が返り, レスポンスの task.priority が "later" である
```

### 優先度の変更（FR-004）

```
シナリオ: PATCH で priority を normal から highest に変更できる
  Given タスク T が { priority: "normal", version: 1 } で存在する
  When  クライアントが PATCH /api/v1/tasks/<T の id> を { "priority": "highest" }, If-Match: 1 で送る
  Then  HTTP 200 OK が返り, レスポンスの task.priority が "highest", task.version が 2 になる
  And   createdAt は変更されていない
  And   他のフィールド（name / projectId / dueDate）は変更されない
```

```
シナリオ: PATCH で priority を later から highest に変更できる（任意の段階間遷移）
  Given タスク T が { priority: "later", version: 3 } で存在する
  When  クライアントが PATCH /api/v1/tasks/<T の id> を { "priority": "highest" }, If-Match: 3 で送る
  Then  HTTP 200 OK が返り, レスポンスの task.priority が "highest", task.version が 4 になる
```

```
シナリオ: PATCH で priority を normal から later に変更できる
  Given タスク T が { priority: "normal", version: 1 } で存在する
  When  クライアントが PATCH /api/v1/tasks/<T の id> を { "priority": "later" }, If-Match: 1 で送る
  Then  HTTP 200 OK が返り, レスポンスの task.priority が "later", task.version が 2 になる
```

```
シナリオ: PATCH で priority を値域外に変更しようとすると弾かれる
  Given タスク T が { priority: "normal", version: 1 } で存在する
  When  クライアントが PATCH /api/v1/tasks/<T の id> を { "priority": "urgent" }, If-Match: 1 で送る
  Then  HTTP 400 Bad Request が返り, レスポンスの code が "INVALID_PRIORITY" である
  And   ストアの T の priority は "normal" のまま, version は 1 のままである
```

```
シナリオ: PATCH で name と priority を同時に変更できる
  Given タスク T が { name: "x", priority: "normal", version: 1 } で存在する
  When  クライアントが PATCH /api/v1/tasks/<T の id> を { "name": "y", "priority": "later" }, If-Match: 1 で送る
  Then  HTTP 200 OK が返り, レスポンスの task が { name: "y", priority: "later", version: 2 } を含む
```

> 既に BL-001 で担保済 / 本機能でも同じ経路を使うため再掲しない項目:
> - 古い version を渡した場合の 412（楽観ロック）.
> - If-Match ヘッダ欠落時の 400 `MISSING_IF_MATCH`.
> - Idempotency-Key ヘッダ欠落時の 400 `MISSING_IDEMPOTENCY_KEY`.
> - 存在しない id への PATCH が 404 `TASK_NOT_FOUND`.
> - 認証なしリクエストが 401.

### Web クライアント UI（FR-003 / FR-004, NFR-001 / NFR-010）

```
シナリオ: 起票フォームに優先度の選択肢が任意項目として存在する
  Given Web クライアントが起動済みで, 今日ビューが表示されている
  When  起票フォームを開く
  Then  「優先度（任意, 既定: 普通）」に相当する選択 UI が存在し, 値域は "最優先 / 普通 / 後回し" の 3 段階のみである
  And   優先度欄は required ではない
  And   タスク名・プロジェクト・期限以外の必須入力は増えない（NFR-010）
```

```
シナリオ: 起票フォームで優先度を最優先に指定して起票できる
  Given 今日ビューが表示されている
  When  タスク名 "x" を入力し, 優先度を「最優先」に指定して送信する
  Then  Repository.create が priority = "highest" で呼ばれる
  And   起票が成功すると, 今日ビューに該当タスクが現れる
```

```
シナリオ: 起票フォームで優先度を未指定のまま送信すると normal で起票される
  Given 今日ビューが表示されている
  When  タスク名 "x" を入力し, 優先度欄を操作せずに送信する
  Then  Repository.create が priority = "normal"（または priority 省略）で呼ばれる
```

```
シナリオ: 一覧の各タスク行から優先度を変更できる
  Given 今日ビューに既存タスク "x" が { priority: "normal", version: 1 } で表示されている
  When  そのタスクの優先度変更 UI を操作し, 「最優先」に変更する
  Then  Repository.update が { id: "x の id", ifMatch: 1, patch: { priority: "highest" } } で呼ばれる
  And   一覧再描画後, 該当タスクの優先度表示が「最優先」になる
```

```
シナリオ: 優先度変更後の一覧は決定論的な順序で再描画される（NFR-013）
  Given 今日ビューに { id: "A", priority: "normal" } と { id: "B", priority: "later" } の 2 件が表示されている
  When  タスク B の優先度を "highest" に変更する
  Then  一覧の並びは B (highest) → A (normal) の順になる
  ※ 本機能の並び順は BL-005 で本決定されるまでの暫定. 本シナリオは「優先度変更時に再計算される」ことを担保する.
```

### 既存スコープと重複しないことの確認

```
シナリオ: 優先度変更操作はカウンタを増減させない
  Given タスク T が存在する
  When  T の優先度を変更する
  Then  「今日の完了タスク数」のカウンタ（BL-008 のスコープ. 本機能では未実装）は呼ばれない
```

## 未決事項 / 確認待ち

- **U-001 PATCH 経由の priority 受理を BL-002 に含めて良いか**: BL-001 の plan.md §例外処理表で「INVALID_PRIORITY ... 編集は priority を受理しない. 本機能では起票時のみチェック」と明記され, **意図的に BL-002 に分離されている**. 本 feature は当該分離を引き継ぐ前提で進める. ユーザー追認のみ要する.
- **U-002 UI 上の優先度表現語彙**: 内部 enum は `highest / normal / later` だが, UI 表記をどうするか. **保守側デフォルト案: 「最優先 / 普通 / 後回し」**（project.md §8 In Scope の表記に揃える）. 配色やアイコンの有無は実装者裁量とするが, 単一ワークフロー（NFR-001）を崩す装飾は禁止.
- **U-003 優先度変更 UI のパターン**: select / segmented control / cycle ボタン（クリックで highest → normal → later → highest…）のいずれを採るか. **保守側デフォルト案: 一覧行は cycle ボタン（クリック 1 回で次段階へ）, 起票フォームは select**（最小手数を優先, NFR-010 / NFR-001）. plan.md §「重要な決定」で確定する.
- **U-004 priority のみの PATCH と他フィールド併用 PATCH の表現**: BL-001 D-002 の「単純な部分上書き」を踏襲し, priority のみを送る PATCH も, 他フィールドと同時送信する PATCH も受理する（受け入れ基準シナリオ「name と priority を同時に変更」で担保）. これは確定事項として plan.md に書く.
