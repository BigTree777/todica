# 仕様: タスク完了アクション（ゴミ箱経由 + カウント +1）

- 状態: ドラフト
- 関連: [`../../planning/backlog.md`](../../planning/backlog.md) BL-003
- 由来要件: FR-006（タスク完了アクション）/ FR-060（ゴミ箱経由）
- 関連 NFR: NFR-001（単一ワークフロー）/ NFR-010（最小手数）/ NFR-013（並び順の予測可能性）/ NFR-020（日次整合 / リセット冪等性）
- 関連先行 feature:
  - [`../task-crud/spec.md`](../task-crud/spec.md)（BL-001 で確立した CRUD / 共通ミドルウェア / `trashedAt` / `trashedReason` を再利用）
  - [`../task-priority/spec.md`](../task-priority/spec.md)（BL-002 で確立した PATCH 部分上書きと整合させる）

## 背景 / 課題

Todica の中核ループは「今日のタスクから 1 つを選び, 終わったら完了して次に進む」である（UC-001, FR-006, FR-013）. 削除（`trashedReason = "deleted"`, カウント非加算）と完了（`trashedReason = "completed"`, カウント +1）は **ユーザーから見ても内部状態でも別の意味** を持つが, **ゴミ箱経由で論理削除する経路は共通** である（FR-060, schema.md §Task §状態遷移）.

BL-001（タスク CRUD）と BL-002（タスク優先度）の完了により次の前提が確立済である.

- Task エンティティに `trashedAt` / `trashedReason` カラムがあり, 値域は `"completed" | "deleted" | null`.
- `domain/task` に `trashTask` 関数が存在し, 現状は `trashedReason = "deleted"` を固定で書き込む（BL-001 の責務範囲）.
- `DELETE /api/v1/tasks/{id}` は論理削除 + `trashedReason = "deleted"` 化を担当する（BL-001 / FR-007）.
- Idempotency-Key / If-Match の共通ミドルウェア, `idempotency_keys` テーブル, drizzle 配線が稼働済.
- OpenAPI 骨格には `POST /tasks/{id}/complete` の path だけ予約されているが, レスポンススキーマも実装も未着手（BL-001 plan.md「`POST /tasks/{id}/complete` / `POST /tasks/{id}/restore` は本機能ではスタブのみ」と明記）.
- Web クライアントの今日ビュー（`TodayView`）には「削除」ボタンがあるが「完了」ボタンは無い.

本 feature は **完了アクションを API + UI で end-to-end に動かす最小差分** を埋め, FR-006 / FR-060 を満たす. 「完了で `completedCount` が +1」される **カウント側の集計実装は本 feature の責務外**（後述 §非ゴール）.

## ゴール / 非ゴール

### ゴール

- タスクを完了状態（`trashedAt != null`, `trashedReason = "completed"`）に遷移させる **新規 API `POST /api/v1/tasks/{id}/complete`** を提供する（FR-006, FR-060）.
  - Idempotency-Key 必須 / If-Match による楽観ロック必須 / Bearer 認証必須（既存共通経路を継承）.
  - 既に完了済（`trashedReason = "completed"`）な相手への再 complete は no-op 冪等扱い（200 OK + 現行 task を返す）.
- ドメイン層に **「完了による論理削除」を表現する関数** を追加する. 既存 `trashTask` と並列に `completeTask` を新設し, `trashedReason` の固定差分以外は同等の挙動を取る（version+1, updatedAt 更新, 二重遷移は no-op）.
- Web クライアントの今日ビューに **「完了」ボタンを追加** し, クリック → `POST /api/v1/tasks/{id}/complete` を発行 → 楽観 UI で一覧から消える経路を提供する（NFR-001 / NFR-010 を侵さない最小 UI）.
- 完了アクションは **「ゴミ箱経由」である** ことを論理状態で担保する（`trashedAt` を立てる. 物理削除はしない）. これにより BL-011（ゴミ箱閲覧・復元）の対象に乗る.

### 非ゴール

- **Counter エンティティ本実装と `completedCount` の +1 集計**: BL-008 の責務. 本 feature では Counter テーブル作成・カウンタ更新・カウンタ取得 API は **一切実装しない**. 「完了で `completedCount` が +1 されるべき」という FR-006 の集計側の充足は, BL-008 が完了アクションのドメインイベント（あるいは `trashedReason = "completed"` への遷移）を読み取って実装する.
- **復元時のカウント減算**: schema.md §Task §状態遷移で確定済（「完了済み Task の復元も可能だが, **完了カウントは戻さない**」）. 本 feature は復元処理そのものを実装しないため（BL-011 の責務）, 「完了カウントを戻さない」のはコード上「何もしないこと」で担保される. 本 spec ではその前提のみ明示する.
- **「現在のタスク」(FocusSelection) の自動繰り上げ**: BL-006 / FR-013 の責務. 本 feature の完了 API はフォーカス状態を読み書きしない（FocusSelection エンティティ自体が未実装）.
- **今日ビューの並び順の本決定**: BL-005 の責務. 完了後の一覧は BL-001 / BL-002 で導入済の暫定 3 段ソート（dueDate → priority → createdAt）を流用し, 完了済タスク（`trashedAt != null`）は既存の `?trashed=false` フィルタにより自動的に表示から外れる.
- **完了済タスク専用のビュー（"完了履歴" 等）**: 完了済タスクの閲覧は BL-011（ゴミ箱）で `GET /api/v1/tasks?trashed=true` 経由で参照される. 完了履歴・ストリーク・統計は OOS-008 と整合する形で提供しない.
- **完了 → 削除 / 削除 → 完了の遷移**: 既にゴミ箱状態のタスクに対する `complete` / `delete` は **`trashedReason` を書き換えない**（既存 BL-001 の DELETE 冪等規則と対称な扱い. 詳細は受け入れ基準を参照）. UI からも「ゴミ箱内タスクへの完了操作」は導線として提供しない.
- **DELETE エンドポイントの `?reason=completed` 拡張等の代替設計**: 設計 D-001 で「専用 `:id/complete` エンドポイントを採用」する判断を plan.md §重要な決定で確定する. spec ではエンドポイント形状を `POST /api/v1/tasks/{id}/complete` で固定する.

## 要件

### 機能要件

本 feature で実装する FR は以下のとおり.

- **FR-006 (タスクを完了できる. 完了アクション)**
  - 完了されたタスクは `trashedAt != null`, `trashedReason = "completed"` の状態に遷移する.
  - 完了は「ゴミ箱経由」である（物理削除しない. FR-060 と整合）.
  - 「今日の完了タスク数」のカウント +1 は本 feature では集計しない（BL-008 が担う. 本 feature では `trashedReason = "completed"` の遷移を残すところまで担保する）.
- **FR-060 (すべての削除・完了はゴミ箱を経由する)**
  - 完了処理は `trashedAt` を立てる遷移として実装し, 物理削除を伴わない.
  - BL-001 で削除（`"deleted"`）について同要件を満たし済. 本 feature で完了（`"completed"`）側を満たし, FR-060 が両理由ともカバーされる状態にする.

### 関連する FR（本 feature では新規実装しないが整合確認する）

- **FR-013 (現在のタスクの自動繰り上げ)**: BL-006 で実装される際, 完了 API のレスポンス（あるいはドメインイベント）を起点に再選定される設計余地を残す. 本 feature は FocusSelection を読み書きしないが, **完了 API のレスポンスに更新後 task を含める**（U-001 で確定）ことで, BL-006 / 今日ビューの再フェッチ・再描画に十分な情報を提供する.
- **FR-040 / NFR-020 (今日の完了タスク数の集計と日次整合)**: BL-008 が `trashedReason = "completed"` への遷移を読み取る前提で, 本 feature では遷移の **冪等性**（同じタスクへ複数回 complete しても遷移は 1 回しか起きない）を担保する. これは「BL-008 がイベント駆動で +1 する場合でも, 楽観ロック + idempotency により二重カウントが起きない」ための土台になる.

### 非機能要件

- **NFR-001 (単一ワークフロー)**: UI に追加する完了操作は **タスク行の「完了」ボタン 1 つ** に限定する. 完了の取り消し（undo）, 完了済み一覧, 設定項目, バルク完了などは追加しない.
- **NFR-010 (最小手数)**: 完了は「ボタン 1 クリック」で成立する. 確認ダイアログを挟まない（誤操作リスクは BL-011 の復元で吸収する設計と整合）.
- **NFR-013 (並び順の予測可能性)**: 完了後の一覧は既存の暫定 3 段ソートと `?trashed=false` フィルタによって決定論的に再描画される（完了済タスクが外れた状態で再ソート）. 本 feature ではソート規則そのものを変えない.
- **NFR-020 (リセット冪等性 / 日次整合)**: 完了遷移は 1 トランザクション内で `trashedAt = now`, `trashedReason = "completed"`, `updatedAt = now`, `version + 1` を行う. Idempotency-Key 再送, If-Match による楽観ロック, 既完了相手の no-op 冪等扱いを揃え, **「同じタスクに対する完了遷移が複数回適用される」状態を作らない**. これは将来 BL-008 が `completedCount` を集計する際の前提となる.

## 受け入れ基準

> 書き方は [`../../quality/acceptance-criteria.md`](../../quality/acceptance-criteria.md) に従う. Gherkin の Given/When/Then で表現し, 後続 test-designer がそのままテストに落とせる粒度.
>
> **BL-001 / BL-002 にて担保済の項目は明示的に「BL-XXX にて担保済」と注記し, 本 feature では再掲しない.**

### API: 完了アクションの正常系（FR-006 / FR-060）

```
シナリオ: 通常状態のタスクを完了するとゴミ箱状態 (completed) になる
  Given 認証済みのリクエストである
  And   タスク T が { trashedAt: null, trashedReason: null, version: 1 } で存在する
  When  クライアントが POST /api/v1/tasks/<T の id>/complete を送る
  And   ヘッダに Idempotency-Key: <UUID v4> と If-Match: 1 を付ける
  Then  HTTP 200 OK が返る
  And   レスポンスボディに更新後 task が含まれ, trashedAt は null ではなく, trashedReason は "completed", version は 2 になっている
  And   ストア上の T は trashedAt != null, trashedReason = "completed", version = 2 に更新されている
  And   createdAt は変更されていない
```

```
シナリオ: 完了済タスクは既定の一覧 (?trashed=false) から外れる
  Given タスク T を完了させた直後である
  When  クライアントが GET /api/v1/tasks (= ?trashed=false 既定) を送る
  Then  HTTP 200 OK が返り, レスポンスの tasks に T が含まれない
```

```
シナリオ: 完了済タスクは trashed=true の一覧で参照できる
  Given タスク T を完了させた直後である
  When  クライアントが GET /api/v1/tasks?trashed=true を送る
  Then  HTTP 200 OK が返り, レスポンスの tasks に T が含まれる
  And   その task の trashedReason は "completed" である
```

### API: 完了と削除の区別（FR-006 / FR-007 と意味的に区別）

```
シナリオ: 完了は削除と異なる trashedReason を記録する
  Given タスク T が通常状態で存在する
  When  クライアントが POST /api/v1/tasks/<T の id>/complete を送る
  Then  ストア上の T の trashedReason は "completed" である (※ "deleted" ではない)
```

```
シナリオ: 削除は完了とは異なる trashedReason を記録する (BL-001 にて担保済の確認)
  Given タスク T が通常状態で存在する
  When  クライアントが DELETE /api/v1/tasks/<T の id> を送る
  Then  ストア上の T の trashedReason は "deleted" である
  ※ 本シナリオは BL-001 のテストで既に green. 本 feature で重複実装はしない. 完了との対比のために再掲のみ.
```

### API: 楽観ロック / 冪等性 / 認証（NFR-020）

```
シナリオ: 古い version で完了しようとすると 412 が返る
  Given タスク T が version = 2 で存在する
  When  クライアントが POST /api/v1/tasks/<T の id>/complete を If-Match: 1 で送る
  Then  HTTP 412 Precondition Failed が返る
  And   レスポンスボディに現行 task (version = 2 の状態) が含まれる
  And   ストア上の T は変更されない (trashedAt は null のまま, version も 2 のまま)
```

```
シナリオ: If-Match ヘッダが欠落した完了リクエストは弾かれる
  Given タスク T が version = 1 で存在する
  When  クライアントが POST /api/v1/tasks/<T の id>/complete を If-Match なしで送る
  Then  HTTP 400 Bad Request が返り, レスポンスの code が "MISSING_IF_MATCH" である
```

```
シナリオ: Idempotency-Key ヘッダが欠落した完了リクエストは弾かれる
  Given タスク T が version = 1 で存在する
  When  クライアントが POST /api/v1/tasks/<T の id>/complete を Idempotency-Key なしで送る
  Then  HTTP 400 Bad Request が返り, レスポンスの code が "MISSING_IDEMPOTENCY_KEY" である
```

```
シナリオ: 同じ Idempotency-Key で 2 回完了リクエストを送っても遷移は 1 回しか起きない
  Given タスク T が { trashedAt: null, version: 1 } で存在する
  When  クライアントが POST /api/v1/tasks/<T の id>/complete を Idempotency-Key: "k1", If-Match: 1 で送る
  And   サーバが 200 OK を返した後, クライアントが同じヘッダ・同じパスをもう一度送る
  Then  2 回目も HTTP 200 OK が返り, レスポンスボディは 1 回目と同じ内容である
  And   ストア上の T は version = 2 のまま (version = 3 に進んでいない)
```

```
シナリオ: 認証なしの完了リクエストは 401 を返す
  Given 認証ミドルウェアが有効である
  When  クライアントが Authorization ヘッダなしで POST /api/v1/tasks/<id>/complete を送る
  Then  HTTP 401 Unauthorized が返り, ストアは変更されない
```

```
シナリオ: 存在しないタスクへの完了は 404 を返す
  Given サーバに該当 id のタスクが存在しない
  When  クライアントが POST /api/v1/tasks/<存在しない id>/complete を送る
  Then  HTTP 404 Not Found が返り, レスポンスの code が "TASK_NOT_FOUND" である
```

### API: ゴミ箱状態のタスクへの再完了 / クロス遷移（冪等性 / 状態遷移の安定）

```
シナリオ: 既に完了済 (trashedReason = "completed") のタスクへの再 complete は no-op 冪等扱い
  Given タスク T が { trashedAt: <過去>, trashedReason: "completed", version: 2 } で存在する
  When  クライアントが POST /api/v1/tasks/<T の id>/complete を新しい Idempotency-Key で送る
  Then  HTTP 200 OK が返り, レスポンスボディの task は現行のまま (trashedAt / trashedReason は変わらず, version も 2 のまま) である
  And   ストア上の T は変更されない
  ※ If-Match の必須性は本シナリオでは規定しない. BL-001 の DELETE 冪等 (既削除は If-Match 検証もスキップ) と対称の扱いを取る. 詳細は plan.md §D-003.
```

```
シナリオ: 既に削除済 (trashedReason = "deleted") のタスクへの complete は trashedReason を書き換えない
  Given タスク T が { trashedAt: <過去>, trashedReason: "deleted", version: 2 } で存在する
  When  クライアントが POST /api/v1/tasks/<T の id>/complete を送る
  Then  HTTP 200 OK が返り, ストア上の T は変更されない (trashedReason は "deleted" のまま, version も 2 のまま)
  ※ 完了で削除済を上書きすると, BL-011 の復元 / BL-008 のカウント集計が意味的に壊れるため "no-op" 扱いとする (D-003).
```

### Web クライアント UI（FR-006, NFR-001 / NFR-010）

```
シナリオ: 今日ビューのタスク行に「完了」ボタンが存在する
  Given Web クライアントが起動済みで, 今日ビューに既存タスク T が表示されている
  When  タスク行の操作 UI を確認する
  Then  「完了」相当のボタンが 1 つ存在する (削除ボタンとは別)
  And   完了ボタンに確認ダイアログは紐づいていない (NFR-010 最小手数)
```

```
シナリオ: 完了ボタンを押すと Repository.complete が呼ばれる
  Given 今日ビューに T が { id: "T の id", version: 1 } で表示されている
  When  T の行の「完了」ボタンをクリックする
  Then  Repository.complete が { id: "T の id", ifMatch: 1 } で呼ばれる
```

```
シナリオ: 完了に成功すると T は今日ビューの一覧から消える (楽観 UI)
  Given 今日ビューに T が表示されている
  And   Repository.complete が解決される (成功応答)
  When  T の「完了」ボタンをクリックする
  Then  T は今日ビューの一覧表示から消える
```

```
シナリオ: 完了操作は削除操作と区別され, 同時に両方は実行されない
  Given 今日ビューに T が表示されている
  When  T の「完了」ボタンをクリックする
  Then  Repository.delete は呼ばれない
  And   Repository.complete のみが呼ばれる
```

### スコープ境界の明示（本 feature が触らないことの担保）

```
シナリオ: 完了アクションは Counter (今日の完了タスク数) の Repository を呼ばない
  Given 本 feature 時点で Counter エンティティ / Repository は未実装である
  When  タスク T を complete する
  Then  HTTP 200 OK が返り, Counter 関連の呼び出しは一切発生しない (本 feature のスコープ外)
  ※ BL-008 で Counter が導入された後, 完了遷移を集計する経路を別 feature で追加する.
```

```
シナリオ: 完了アクションは FocusSelection (現在のタスク参照) を読み書きしない
  Given 本 feature 時点で FocusSelection エンティティ / Repository は未実装である
  When  タスク T を complete する
  Then  HTTP 200 OK が返り, FocusSelection 関連の呼び出しは一切発生しない (本 feature のスコープ外)
  ※ BL-006 (FR-013 自動繰り上げ) で FocusSelection が導入された際に統合する.
```

## 未決事項 / 確認待ち

- **U-001 完了 API のレスポンス形状**: `POST /api/v1/tasks/{id}/complete` の 200 OK ボディに何を返すか. **保守側デフォルト案: `{ "task": <更新後 Task 全体> }`**（BL-001 の PATCH / POST と統一した形. 楽観 UI 更新, BL-006 の FocusSelection 再選定, BL-008 のカウント連動などで「更新後の task 状態」を 1 リクエストで取得できる方が後段の依存 feature が増えにくい）. 採用すれば plan.md §「重要な決定」で確定する.
- **U-002 既完了タスクへの再 complete に対する If-Match 必須性**: BL-001 の DELETE は「既削除なら If-Match 検証をスキップして 204 no-op」としている. 本 feature の complete も対称に **既完了なら If-Match 検証をスキップして 200 no-op** を保守側デフォルトとする. plan.md §D-003 で確定する.
- **U-003 完了済タスクの今日ビュー表示**: 「完了したタスクは今日ビューから消えるべき」（今日ビューは「今日やる残り」の場であって履歴ではない. UC-001 と整合）. 既存実装は GET `/api/v1/tasks?trashed=false` を呼ぶため, 完了による `trashedAt` 立ち上げで自動的に表示から外れる. 本 feature で追加の表示制御は不要. trash ビューでの再表示は BL-011 の責務. 保守側案として確定とし plan.md に書く.
- **U-004 完了ボタンの UI 表現**: 「完了」「✓」「Done」などの語彙とアイコンの選択肢がある. **保守側デフォルト案: 文言「完了」のみ**（既存「削除」ボタンと並列のテキストボタン. NFR-001 を侵さない最小実装）. アイコン化は BL-005（今日ビュー本実装）以降の判断に委ねる.
- **U-005 ドメイン関数の構造**: 既存 `trashTask(current, clock)` を `trashTask(current, clock, { reason: "deleted" | "completed" })` に拡張するか, 別関数 `completeTask(current, clock)` を新設するか. **保守側デフォルト案: 別関数 `completeTask` を新設**（spec.md の意味上「完了」と「削除」は明確に別操作であり, 呼び出し側のコード（API ハンドラ / 将来の BL-008 集計トリガ）が「どちらを呼んだか」を読み解きやすくするため）. plan.md §D-002 で確定する.
- **U-006 既削除タスクへの complete の表現**: spec.md 上では「no-op で 200 を返す」と定めた（D-003）が, 一部の API 設計流派では「状態遷移として不正なので 409 Conflict を返す」考え方もある. 本 feature では **「Idempotency-Key の冪等性 + ゴミ箱状態を 1 つのライフサイクル終端と見做す」** 思想を採り 200 no-op で統一する. 採用理由を plan.md §R-002 にも残す.
