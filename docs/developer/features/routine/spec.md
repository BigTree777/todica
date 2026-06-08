# 仕様: ルーティン機能

- 状態: 確定
- 関連: BL-017

## 背景 / 課題

毎日または特定の曜日に繰り返すタスク（朝の運動・日報記入など）を、毎回手動で起票する手間がある。
ルーティンとして一度定義しておけば、指定した曜日に自動で今日のタスクとして生成され、
当日未完了でも翌日に持ち越されないため「やり残し」の心理的負担を残さない。

## ゴール / 非ゴール

- ゴール:
  - ルーティンの定義・編集・削除ができる（FR-030, FR-035）
  - 指定曜日の日次リセット時に自動でタスクを生成する（FR-031）
  - ルーティン由来タスクは当日限りで翌日に持ち越されない（FR-033）
  - 実施履歴・ストリークを保持しない（FR-034）
- 非ゴール:
  - 実施履歴・ストリーク機能（FR-034 で明示除外）
  - ルーティンのサブタスク対応
  - 繰り返し間隔（毎日・毎週・毎月など）のうち「曜日指定」以外のパターン
  - 通知・リマインダー機能

## 要件

- 機能要件:
  - FR-030: ルーティンを定義できる（名称・生成曜日・既定優先度を指定）
  - FR-031: ルーティンは指定曜日に自動で今日のタスクとして生成される（日次リセット時）
  - FR-033: ルーティン由来タスクは翌日に持ち越さない
  - FR-034: 実施履歴・ストリークは保持しない
  - FR-035: ルーティンの名称・生成曜日・既定優先度は変更できる
- 非機能要件:
  - ルーティンタスクの生成は日次リセット（`maybeRunDailyReset`）の一部として同一トランザクション内で完結すること
  - 生成は冪等であること（同じ境界日に二重生成しない）

## 受け入れ基準

### ルーティン作成（FR-030）

```
シナリオ: 有効なルーティンを作成できる
  Given 認証済みの状態
  When  POST /api/v1/routines に name="朝の運動", daysOfWeek=[1,2,3,4,5], defaultPriority="normal" を送る
  Then  HTTP 201 が返り、レスポンスボディに作成されたルーティンが含まれる
```

```
シナリオ: 名称が空のルーティンは作成できない
  Given 認証済みの状態
  When  POST /api/v1/routines に name="" を送る
  Then  HTTP 400 / INVALID_ROUTINE_NAME が返る
```

```
シナリオ: 名称が 201 文字以上のルーティンは作成できない
  Given 認証済みの状態
  When  POST /api/v1/routines に 201 文字の name を送る
  Then  HTTP 400 / INVALID_ROUTINE_NAME が返る
```

```
シナリオ: 名称に制御文字を含むルーティンは作成できない
  Given 認証済みの状態
  When  POST /api/v1/routines に name に改行文字（U+000A）を含む文字列を送る
  Then  HTTP 400 / INVALID_ROUTINE_NAME が返る
```

```
シナリオ: daysOfWeek が空配列のルーティンは作成できない
  Given 認証済みの状態
  When  POST /api/v1/routines に daysOfWeek=[] を送る
  Then  HTTP 400 / INVALID_DAYS_OF_WEEK が返る
```

```
シナリオ: daysOfWeek に 0〜6 以外の値を含む場合は作成できない
  Given 認証済みの状態
  When  POST /api/v1/routines に daysOfWeek=[7] を送る
  Then  HTTP 400 / INVALID_DAYS_OF_WEEK が返る
```

```
シナリオ: daysOfWeek に重複値を含む場合は重複を排除して保存される
  Given 認証済みの状態
  When  POST /api/v1/routines に daysOfWeek=[1,1,2] を送る
  Then  HTTP 201 が返り、保存されたルーティンの daysOfWeek は [1,2] になる
```

```
シナリオ: 同一 Idempotency-Key で 2 回送っても 1 件しか作成されない
  Given 認証済みの状態
  When  同一 Idempotency-Key で POST /api/v1/routines を 2 回送る
  Then  2 回目も HTTP 201 が返り、レスポンスボディは 1 回目と同じである
  And   ルーティン一覧に同一 ID のルーティンは 1 件しか存在しない
```

### ルーティン一覧取得（FR-030 / FR-035）

```
シナリオ: ルーティン一覧が name 昇順（BINARY）で返る
  Given 3 件のルーティン（name が "B", "A", "C"）が登録されている
  When  GET /api/v1/routines を呼ぶ
  Then  HTTP 200 が返り、routines 配列が name 昇順（"A","B","C"）で並んでいる
```

### ルーティン編集（FR-035）

```
シナリオ: ルーティンの名称・生成曜日・既定優先度を変更できる
  Given ルーティン（id=R1, version=1）が存在する
  When  PATCH /api/v1/routines/R1 に name="夜の運動", daysOfWeek=[6,0], defaultPriority="later",
        If-Match="1" を送る
  Then  HTTP 200 が返り、レスポンスボディのルーティンが更新されており version=2 になっている
```

```
シナリオ: version 不一致時は 412 が返る
  Given ルーティン（id=R1, version=2）が存在する
  When  PATCH /api/v1/routines/R1 に If-Match="1" を送る
  Then  HTTP 412 が返る
```

```
シナリオ: 存在しないルーティンを編集すると 404 が返る
  Given ルーティン R99 が存在しない
  When  PATCH /api/v1/routines/R99 を送る
  Then  HTTP 404 / ROUTINE_NOT_FOUND が返る
```

### ルーティン削除（FR-030 補足）

```
シナリオ: ルーティンを削除すると紐付くタスクも削除される
  Given ルーティン（id=R1）が存在し、そのルーティンに紐付く今日のタスク T1 が存在する
  When  DELETE /api/v1/routines/R1 に If-Match="1" を送る
  Then  HTTP 204 が返る
  And   GET /api/v1/routines にルーティン R1 が含まれない
  And   GET /api/v1/tasks?trashed=false にタスク T1 が含まれない
```

### 日次リセット時の自動タスク生成（FR-031）

```
シナリオ: 日次リセット時に指定曜日のルーティンタスクが生成される
  Given ルーティン（daysOfWeek=[1]、月曜）が存在し、境界時刻設定は "04:00"
  And   現在時刻が月曜日 04:01 UTC（日次リセット未実行）
  When  POST /api/v1/reset を呼ぶ（または日次リセットがトリガーされる）
  Then  リセットが実行され、dueDate="today", origin="routine", routineId=R1 のタスクが 1 件生成される
```

```
シナリオ: 生成曜日でない日はタスクが生成されない
  Given ルーティン（daysOfWeek=[1]、月曜）が存在し、境界時刻設定は "04:00"
  And   現在時刻が火曜日 04:01 UTC（日次リセット未実行）
  When  日次リセットがトリガーされる
  Then  リセットが実行され、そのルーティンに対応するタスクは生成されない
```

```
シナリオ: 同じ境界日に 2 回リセットしてもタスクは重複生成されない
  Given ルーティン（daysOfWeek=[1]）が存在し、1 回目のリセットで月曜タスクが生成済み
  When  同じ境界日に POST /api/v1/reset を再度呼ぶ
  Then  HTTP 200 が返り executed=false
  And   同ルーティンのタスクは追加生成されていない
```

```
シナリオ: ルーティンタスクの名称・優先度はルーティン定義に従う
  Given ルーティン（name="日報", defaultPriority="highest", daysOfWeek=[1]）が存在する
  When  月曜の日次リセットが実行される
  Then  生成されたタスクの name="日報", priority="highest", origin="routine" になっている
```

### 翌日非持越し（FR-033）

```
シナリオ: 当日未完了のルーティンタスクは翌日リセット時に削除される
  Given 月曜の日次リセットで T1（origin="routine", dueDate="today"）が生成された
  And   T1 が未完了のまま
  When  翌日（火曜）の日次リセットが実行される
  Then  T1 は物理削除されており、GET /api/v1/tasks?trashed=all にも T1 が含まれない
```

```
シナリオ: 完了済みのルーティンタスクは翌日リセット時に影響を受けない
  Given 月曜の日次リセットで T1（origin="routine"）が生成された
  And   T1 が完了されており trashedAt!=null
  When  翌日の日次リセットが実行される
  Then  T1（trashedAt!=null の完了済みタスク）は削除対象にならない
```

```
シナリオ: ルーティン由来タスクの翌日繰越（FR-051）は実行されない
  Given 日次リセットで T1（origin="routine", dueDate="today"）が生成された
  And   T1 が未完了のまま
  When  翌日の日次リセットが実行される
  Then  T1 の dueDate が "tomorrow" に変わることなく削除されている
  And   翌日の今日ビューに T1 由来のタスクは存在しない（新しい日に対応するルーティンタスクが別途生成される）
```

### 手動期限切替の禁止（FR-033）

```
シナリオ: TodayView でルーティン由来タスクには「明日へ」ボタンが表示されない
  Given TodayView に origin="routine" のタスク T1 が表示されている
  When  TodayView を確認する
  Then  T1 の行に「明日へ」ボタン（dueDate を "tomorrow" に変更するボタン）が表示されていない
```

### 実施履歴なし（FR-034）

```
シナリオ: ルーティンタスクが物理削除されると履歴が一切残らない
  Given 月曜の日次リセットで T1（origin="routine"）が生成された
  And   T1 が未完了のまま
  When  翌日の日次リセットが実行される
  Then  GET /api/v1/tasks?trashed=all に T1 が含まれない
  And   GET /api/v1/tasks?trashed=true に T1 が含まれない
```

## 未決事項 / 確認待ち

- daysOfWeek の重複値は排除して保存することを確定した（受け入れ基準に明記）
- ルーティン削除時の紐付きタスクの扱いは「物理削除」で確定
  （ゴミ箱経由はルーティン由来タスクの「履歴なし」原則と矛盾するため）
- 「明日へ」ボタンは UI で非表示にする方針で確定（API 側では PATCH /tasks/{id} での dueDate 変更は禁止しない）
