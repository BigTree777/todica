# 仕様: ゴミ箱（閲覧・復元・手動「空にする」・日次清算）

- 状態: 確定
- 関連: [`../../planning/backlog.md`](../../planning/backlog.md) BL-011
- 由来要件: FR-061（ゴミ箱復元）/ FR-062（ゴミ箱閲覧・空にする・日次清算）
- 関連 NFR: NFR-020（冪等性・楽観ロック）/ NFR-021（単一ユーザーデータ）
- 関連先行 feature:
  - [`../task-crud/spec.md`](../task-crud/spec.md)（BL-001。削除で `trashedAt` / `trashedReason = "deleted"` を立てる）
  - [`../task-complete/spec.md`](../task-complete/spec.md)（BL-003。完了で `trashedAt` / `trashedReason = "completed"` を立てる）
  - [`../daily-reset/spec.md`](../daily-reset/spec.md)（BL-010。`purgeTrash` スタブを提供。本 feature で実装を充填する）

## 背景 / 課題

Todica では「削除」「完了」の両アクションがタスクをゴミ箱に移動する（`trashedAt != null`）。  
BL-001 / BL-003 でゴミ箱への遷移は実装済みだが、ゴミ箱の内容を閲覧する専用 UI・API、誤操作からの復元、ゴミ箱の空にする操作、および BL-010 で no-op スタブとして残された日次清算ロジックがすべて未実装である。

本 feature はこれらを実装し、FR-061・FR-062 を完全に満たす。

## ゴール / 非ゴール

### ゴール

- **ゴミ箱一覧 (`GET /api/v1/trash`)** を提供し、現在ゴミ箱にある全タスクを取得できる。
- **タスク復元 (`POST /api/v1/trash/:id/restore`)** を提供し、ゴミ箱のタスクをアクティブ状態に戻せる。復元後の `dueDate` は `"today"` に固定する（元の期限には戻らない）。
- **手動「空にする」(`DELETE /api/v1/trash`)** を提供し、現在のゴミ箱タスクを全件物理削除できる。
- **`purgeTrash` の日次清算ロジック充填**: BL-010 で no-op スタブとして提供した `purgeTrash(db, clock)` に、前日の境界時刻より前に入ったゴミ箱タスクを物理削除するロジックを実装する。
- 上記操作が **API（REST + Idempotency-Key + If-Match）** として動く。

### 非ゴール

- **ゴミ箱の Web クライアント UI**: 本 feature では API 層のみを担当する。クライアント UI 導線の実装は後続の BL に委ねる。
- **復元後の `completedCount` 補正**: schema.md §Task §状態遷移で「完了済みタスクの復元も可能だが、完了カウントは戻さない」と確定済み。本 feature では `completedCount` に触らない。
- **プロジェクト・ルーティンのゴミ箱**: 本 feature はタスクのゴミ箱のみを対象とする。プロジェクト・ルーティンのゴミ箱は各機能の BL で扱う。
- **ゴミ箱の保持期間の設定**: 清算条件（前日の境界時刻より古いものを削除）は固定とし、ユーザー設定は提供しない。

## 要件

### 機能要件

- **FR-061（ゴミ箱復元）**
  - ゴミ箱にあるタスクを通常状態（`trashedAt = null`, `trashedReason = null`）に戻せる。
  - 復元後の `dueDate` は `"today"` にリセットする（元の期限に戻らない）。
  - 復元後は `version + 1`。
  - 存在しない ID・ゴミ箱に入っていないタスクへの復元は 404 / 400 を返す。

- **FR-062（ゴミ箱閲覧・空にする・日次清算）**
  - ゴミ箱の内容を一覧で閲覧できる（`GET /api/v1/trash`）。
  - 手動で「ゴミ箱を空にする」操作ができる（`DELETE /api/v1/trash`）。全件物理削除。
  - 日次リセット時（`maybeRunDailyReset` から呼ばれる `purgeTrash`）に、前日の境界時刻より前に入ったゴミ箱タスクを物理削除する。

### 非機能要件

- **NFR-020（冪等性・楽観ロック）**
  - `POST /api/v1/trash/:id/restore` は If-Match（`task.version`）と Idempotency-Key を使う。
  - `DELETE /api/v1/trash` は Idempotency-Key を使う。If-Match は不要（全件削除に version 競合がない）。
  - 既に通常状態のタスクへの restore は no-op 冪等扱い（200 OK + 現行 task を返す）。
  - 既に空のゴミ箱への `DELETE /api/v1/trash` は no-op（204 を返す）。

## 受け入れ基準

### ゴミ箱一覧（FR-062 閲覧）

```
シナリオ: ゴミ箱の一覧を取得できる
  Given 認証済みのリクエストである
  And   タスク T1（trashedReason = "deleted"）と T2（trashedReason = "completed"）がゴミ箱に存在する
  And   タスク T3 が通常状態（trashedAt = null）で存在する
  When  クライアントが GET /api/v1/trash を送る
  Then  HTTP 200 OK が返る
  And   レスポンスボディの tasks に T1 と T2 が含まれ、T3 は含まれない
  And   各タスクの trashedAt は null ではなく、trashedReason は "deleted" または "completed" である
```

```
シナリオ: ゴミ箱が空のときは空配列が返る
  Given 認証済みのリクエストである
  And   ゴミ箱にタスクが 1 件も存在しない
  When  クライアントが GET /api/v1/trash を送る
  Then  HTTP 200 OK が返り、レスポンスの tasks が空配列（[]）である
```

```
シナリオ: 認証なしのゴミ箱一覧は 401 を返す
  Given Authorization ヘッダを付けない
  When  クライアントが GET /api/v1/trash を送る
  Then  HTTP 401 Unauthorized が返る
```

---

### タスク復元（FR-061）

```
シナリオ: ゴミ箱のタスクを復元できる（dueDate は "today" にリセット）
  Given 認証済みのリクエストである
  And   タスク T が { trashedAt: <過去>, trashedReason: "deleted", dueDate: "tomorrow", version: 2 } でゴミ箱にある
  When  クライアントが POST /api/v1/trash/<T の id>/restore を送る
  And   ヘッダに Idempotency-Key: <UUID v4> と If-Match: 2 を付ける
  Then  HTTP 200 OK が返る
  And   レスポンスボディの task は { trashedAt: null, trashedReason: null, dueDate: "today", version: 3 } を含む
  And   ストア上の T は trashedAt = null, trashedReason = null, dueDate = "today", version = 3 に更新されている
  And   createdAt は変更されていない
```

```
シナリオ: 完了済タスクも復元できる（completedCount は変わらない）
  Given 認証済みのリクエストである
  And   タスク T が { trashedAt: <過去>, trashedReason: "completed", version: 2 } でゴミ箱にある
  When  クライアントが POST /api/v1/trash/<T の id>/restore を送る
  And   ヘッダに Idempotency-Key: <UUID v4> と If-Match: 2 を付ける
  Then  HTTP 200 OK が返り、T の trashedReason が null, trashedAt が null, version が 3 になっている
  And   completedCount は変更されない（本 feature では Counter に触らない）
```

```
シナリオ: 存在しない ID への復元は 404 を返す
  Given 認証済みのリクエストである
  And   サーバに該当 id のタスクが存在しない
  When  クライアントが POST /api/v1/trash/<存在しない id>/restore を送る
  Then  HTTP 404 Not Found が返り、レスポンスの code が "TASK_NOT_FOUND" である
```

```
シナリオ: ゴミ箱に入っていないタスクへの復元は 400 を返す
  Given 認証済みのリクエストである
  And   タスク T が通常状態（trashedAt = null）で存在する
  When  クライアントが POST /api/v1/trash/<T の id>/restore を送る
  Then  HTTP 400 Bad Request が返り、レスポンスの code が "TASK_NOT_IN_TRASH" である
```

```
シナリオ: 既に通常状態のタスクへの復元（新しい Idempotency-Key）は 400 を返す
  ※ 「ゴミ箱に入っていないタスクへの復元は 400」シナリオと同義。
  ※ Idempotency-Key キャッシュによる冪等応答（キャッシュヒット）とは別の経路である。
  Given タスク T が { trashedAt: null, trashedReason: null, version: 3 } で存在する
  When  クライアントが POST /api/v1/trash/<T の id>/restore を新しい Idempotency-Key で送る
  Then  HTTP 400 Bad Request が返り、レスポンスの code が "TASK_NOT_IN_TRASH" である
```

```
シナリオ: 古い version での復元は 412 を返す
  Given タスク T が { trashedAt: <過去>, trashedReason: "deleted", version: 3 } でゴミ箱にある
  When  クライアントが POST /api/v1/trash/<T の id>/restore を If-Match: 2 で送る
  Then  HTTP 412 Precondition Failed が返る
  And   レスポンスボディに現行 task（version = 3 の状態）が含まれる
  And   ストア上の T は変更されない
```

```
シナリオ: If-Match ヘッダが欠落した復元リクエストは 400 を返す
  Given タスク T がゴミ箱にある
  When  クライアントが POST /api/v1/trash/<T の id>/restore を If-Match なしで送る
  Then  HTTP 400 Bad Request が返り、レスポンスの code が "MISSING_IF_MATCH" である
```

```
シナリオ: Idempotency-Key ヘッダが欠落した復元リクエストは 400 を返す
  Given タスク T がゴミ箱にある
  When  クライアントが POST /api/v1/trash/<T の id>/restore を Idempotency-Key なしで送る
  Then  HTTP 400 Bad Request が返り、レスポンスの code が "MISSING_IDEMPOTENCY_KEY" である
```

```
シナリオ: 同じ Idempotency-Key で 2 回復元しても遷移は 1 回しか起きない
  Given タスク T が { trashedAt: <過去>, trashedReason: "deleted", version: 2 } でゴミ箱にある
  When  クライアントが POST /api/v1/trash/<T の id>/restore を Idempotency-Key: "k1", If-Match: 2 で送る
  And   サーバが 200 OK を返した後、クライアントが同じヘッダ・同じパスをもう一度送る
  Then  2 回目も HTTP 200 OK が返り、レスポンスボディは 1 回目と同じ内容である
  And   ストア上の T は version = 3 のまま（version = 4 に進んでいない）
```

```
シナリオ: 認証なしの復元リクエストは 401 を返す
  Given Authorization ヘッダを付けない
  When  クライアントが POST /api/v1/trash/<id>/restore を送る
  Then  HTTP 401 Unauthorized が返る
```

---

### 手動「空にする」（FR-062 手動）

```
シナリオ: ゴミ箱を空にするとゴミ箱の全タスクが物理削除される
  Given 認証済みのリクエストである
  And   ゴミ箱にタスク T1、T2 が存在する
  And   通常状態のタスク T3 が存在する
  When  クライアントが DELETE /api/v1/trash を送る
  And   ヘッダに Idempotency-Key: <UUID v4> を付ける
  Then  HTTP 204 No Content が返る
  And   T1、T2 はストアから物理削除されている（GET /api/v1/trash で 0 件）
  And   T3 は通常状態のまま残っている
```

```
シナリオ: 既に空のゴミ箱への「空にする」は no-op で 204 を返す
  Given 認証済みのリクエストである
  And   ゴミ箱にタスクが 1 件も存在しない
  When  クライアントが DELETE /api/v1/trash を送る
  Then  HTTP 204 No Content が返る
```

```
シナリオ: 同じ Idempotency-Key で 2 回「空にする」を送っても結果は同じ
  Given ゴミ箱にタスク T1 が存在する
  When  クライアントが DELETE /api/v1/trash を Idempotency-Key: "k1" で送る
  And   サーバが 204 を返した後、同じ Idempotency-Key で再送する
  Then  2 回目も HTTP 204 No Content が返る
  And   ストアへの物理削除は 1 回分のみ（2 回目の DB 操作は発生しない）
```

```
シナリオ: 認証なしの「空にする」は 401 を返す
  Given Authorization ヘッダを付けない
  When  クライアントが DELETE /api/v1/trash を送る
  Then  HTTP 401 Unauthorized が返る
```

---

### 日次清算（FR-062 purgeTrash）

```
シナリオ: 前日の境界時刻より古いゴミ箱タスクが物理削除される
  Given dayBoundaryTime = "04:00"
  And   clock.now() = "2026-06-08T10:00:00.000Z"（今日の境界時刻は "2026-06-08T04:00:00.000Z"）
  And   タスク T1 が { trashedAt: "2026-06-07T03:59:59.999Z" }（前日の境界時刻より前）でゴミ箱にある
  And   タスク T2 が { trashedAt: "2026-06-07T10:00:00.000Z" }（昨日のゴミ箱。前日の境界時刻以降だが今日の境界時刻より前）でゴミ箱にある
  And   タスク T3 が { trashedAt: "2026-06-08T05:00:00.000Z" }（今日の境界時刻以降）でゴミ箱にある
  And   タスク T4 が通常状態（trashedAt = null）で存在する
  When  purgeTrash(db, clock) が呼ばれる（日次リセット処理の末尾）
  Then  T1 と T2 はストアから物理削除されている
  And   T3 はゴミ箱に残っている（今日の境界時刻以降に入ったため清算対象外）
  And   T4 は変更されていない
```

```
シナリオ: 清算対象がない場合は何も削除されない
  Given dayBoundaryTime = "04:00"
  And   clock.now() = "2026-06-08T10:00:00.000Z"
  And   ゴミ箱のタスクが全て { trashedAt >= "2026-06-08T04:00:00.000Z" } である
  When  purgeTrash(db, clock) が呼ばれる
  Then  ゴミ箱のタスクは削除されない
```

```
シナリオ: ゴミ箱が空の場合、purgeTrash は正常終了する
  Given ゴミ箱にタスクが 1 件も存在しない
  When  purgeTrash(db, clock) が呼ばれる
  Then  例外を投げずに正常終了する
```

```
シナリオ: 日次リセット後に purgeTrash が呼ばれている
  Given リセット実行条件を満たす状態
  And   前日の境界時刻より古いゴミ箱タスク T1 が存在する
  When  POST /api/v1/reset を送る（または GET /api/v1/today でリセットが自動実行される）
  Then  リセットは成功し（200 OK, executed = true）
  And   T1 はストアから物理削除されている
```

---

### スコープ境界の明示（本 feature が触らないことの担保）

```
シナリオ: 復元操作は completedCount を変更しない
  Given Counter.completedCount = 5 である
  And   タスク T が trashedReason = "completed" でゴミ箱にある
  When  クライアントが POST /api/v1/trash/<T の id>/restore を送る
  Then  HTTP 200 OK が返り、GET /api/v1/counter は completedCount = 5 のまま返す
```

## 未決事項 / 確認待ち

特になし。設計上の決定事項はすべて plan.md で確定する。
