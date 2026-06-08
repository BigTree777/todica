# 仕様: 日次リセット処理

- 状態: 確定
- 関連: [`../../planning/backlog.md`](../../planning/backlog.md) BL-010
- 由来要件: FR-043（未完了タスクの繰り越し）/ FR-051（completedCount リセット）/ FR-062（ゴミ箱清算。詳細は BL-011）
- 関連 NFR: NFR-020（リセット処理の冪等性）
- 関連 ADR: [ADR-0011](../../adr/0011-day-boundary-time-source.md)（T3 ハイブリッド時刻設計。本 feature は Server モード専任）
- 関連先行 feature:
  - [`../completion-counter/spec.md`](../completion-counter/spec.md)（BL-008。Counter.completedCount / lastResetExecutedAt の定義）
  - [`../settings-day-boundary/spec.md`](../settings-day-boundary/spec.md)（BL-009。dayBoundaryTime の設定・取得）

## 背景 / 課題

Todica の「今日ビュー」は毎日リセットされる必要がある。リセットとは次の 3 つの操作をアトミックに実行することである。

1. **タスクの繰り越し（FR-043）**: `dueDate = "tomorrow"` のアクティブタスクを `dueDate = "today"` に変更する。`dueDate = "today"` のタスクはそのまま。ゴミ箱タスク（`trashedAt != null`）は対象外。
2. **completedCount のリセット（FR-051）**: `counter.completedCount` を 0 にクリアする。
3. **ゴミ箱清算のフック（FR-062）**: ゴミ箱に入って一定期間経過したアイテムの物理削除。詳細ロジックは BL-011 が担う。本 feature ではフックの呼び出し口（スタブ）を用意するだけ。

BL-008（completion-counter）で Counter テーブルに `lastResetExecutedAt` フィールドが追加済みである。本 feature はこのフィールドを「リセット実行日時」の記録に使い、冪等性（NFR-020）を担保する。

BL-009（settings-day-boundary）で `SettingsRepository.get()` から `dayBoundaryTime` を取得できる。本 feature はこの値を「今日」の境界判定に使う。

ADR-0011 により、サーバモードではサーバ時刻（`clock.now()`）を正本とする。

## ゴール / 非ゴール

### ゴール

- **リセット判定ロジックの実装**: `dayBoundaryTime` とサーバ時刻（`clock.now()`）から「今日の境界時刻（ISO 8601）」を算出し、`counter.lastResetExecutedAt` と比較してリセットが必要かどうかを判定する。
- **リセット処理の実装**: タスク繰り越し（`tomorrow` → `today`）+ `completedCount = 0` + `lastResetExecutedAt` 更新 + ゴミ箱清算フック呼び出しを、1 トランザクション内でアトミックに実行する。
- **`GET /api/v1/today` ハンドラへの自動リセット統合**: ハンドラ実行前にリセット判定を行い、必要なら実行してからレスポンスを返す。クライアントはリセットを意識しない。
- **`POST /api/v1/reset` エンドポイントの実装**: 手動トリガー用。テスト・保守・将来の拡張のために提供する。冪等。
- **冪等性の保証（NFR-020）**: `counter.lastResetExecutedAt` が「今日の境界時刻以降」であれば no-op とする。何度呼ばれても結果は同じ。
- **ゴミ箱清算スタブの用意**: `purgeTrash(db, clock)` という関数シグネチャを定義し、本 feature では空実装（no-op）とする。BL-011 が実際の削除ロジックを充填する。

### 非ゴール

- **ゴミ箱清算の詳細ロジック（FR-062）**: BL-011 の責務。本 feature ではスタブのみ。
- **Android ローカルモードのリセット**: ADR-0011 により、ローカルモードはクライアント時刻を使うが、その実装は BL-020 の責務。
- **リセットのスケジューリング（cron・定期実行）**: 本 feature は「アクセス時の lazy 実行」のみを実装する。定期実行は将来の feature で対応する。
- **クライアント側でのリセット状態の表示**: クライアントは `GET /api/v1/today` の結果（リセット後の状態）を表示するのみ。「リセットが実行された」ことを別途通知しない。
- **タイムゾーン設定**: BL-020 の責務。本 feature では UTC または `clock.now()` が返す時刻をそのまま使い、タイムゾーン変換は行わない。

## 要件

### 機能要件

- **FR-043（未完了タスクの繰り越し）**
  - リセット実行時、`dueDate = "tomorrow"` かつ `trashedAt = null` のタスクを `dueDate = "today"` に変更する。
  - `dueDate = "today"` かつ `trashedAt = null` のタスクは変更しない（既に「今日」にいる）。
  - `trashedAt != null` のタスク（ゴミ箱内）は変更しない。
- **FR-051（completedCount のリセット）**
  - リセット実行時、`counter.completedCount` を 0 にクリアする。
  - `counter.lastResetExecutedAt` をリセット実行時刻（`clock.now()`）に更新する。
  - `counter.version` を +1 する。
- **FR-062（ゴミ箱清算フック）**
  - リセット処理の末尾でゴミ箱清算フック（`purgeTrash`）を呼び出す。
  - 本 feature では `purgeTrash` の実装は空（no-op）とし、BL-011 が実際のロジックを実装する。

### 非機能要件

- **NFR-020（冪等性）**
  - `counter.lastResetExecutedAt >= 今日の境界時刻（ISO 8601）` であれば、リセットは実行しない。
  - 複数回呼ばれても、`counter.completedCount`・`lastResetExecutedAt`・タスクの `dueDate` は 1 回分の変更のみ反映される。
- **アトミック実行**: タスク繰り越し・counter 更新・ゴミ箱清算フックは単一 DB トランザクション内で実行する（`db.transaction()`）。
- **認証**: `POST /api/v1/reset` は Bearer 認証必須。未認証は 401。
- **GET /api/v1/today の透過性**: クライアントはリセットの発生を気にせず `GET /api/v1/today` を呼ぶだけでよい。

## 受け入れ基準

> Gherkin の Given/When/Then で表現する。

---

### 「今日」の境界判定

```
シナリオ: dayBoundaryTime = "04:00", 現在 03:59 → リセット不要と判定する
  Given dayBoundaryTime = "04:00"
  And   clock.now() が当日の 03:59 を返す
  And   counter.lastResetExecutedAt = null（一度もリセットされていない）
  When  リセット判定を行う
  Then  リセット不要と判定される
  ※ 03:59 < 当日の 04:00 境界時刻 = まだ「昨日」
```

```
シナリオ: dayBoundaryTime = "04:00", 現在 04:01 → リセット必要と判定する
  Given dayBoundaryTime = "04:00"
  And   clock.now() が当日の 04:01 を返す
  And   counter.lastResetExecutedAt = null
  When  リセット判定を行う
  Then  リセット必要と判定される
```

```
シナリオ: 今日の境界時刻以降に既にリセット済みなら不要と判定する
  Given dayBoundaryTime = "04:00"
  And   clock.now() が当日の 10:00 を返す
  And   counter.lastResetExecutedAt = 当日の 04:05（境界時刻以降）
  When  リセット判定を行う
  Then  リセット不要と判定される（冪等）
```

```
シナリオ: lastResetExecutedAt が境界時刻より前であればリセット必要と判定する
  Given dayBoundaryTime = "04:00"
  And   clock.now() が当日の 10:00 を返す
  And   counter.lastResetExecutedAt = 前日の 10:00（前回の境界時刻より前）
  When  リセット判定を行う
  Then  リセット必要と判定される
```

---

### タスク繰り越し（FR-043）

```
シナリオ: "tomorrow" タスクはリセットで "today" に変わる
  Given counter.lastResetExecutedAt = null（リセット未実行）
  And   dayBoundaryTime = "04:00", clock.now() = 当日 04:01
  And   アクティブタスク T1 が { dueDate: "tomorrow", trashedAt: null } で存在する
  When  POST /api/v1/reset を送る（または GET /api/v1/today 経由でリセットが自動実行される）
  Then  T1 の dueDate が "today" に変わっている
```

```
シナリオ: "today" タスクはリセットで変わらない
  Given counter.lastResetExecutedAt = null
  And   dayBoundaryTime = "04:00", clock.now() = 当日 04:01
  And   アクティブタスク T2 が { dueDate: "today", trashedAt: null } で存在する
  When  POST /api/v1/reset を送る
  Then  T2 の dueDate は "today" のまま変わっていない
```

```
シナリオ: ゴミ箱タスクはリセット対象外
  Given counter.lastResetExecutedAt = null
  And   dayBoundaryTime = "04:00", clock.now() = 当日 04:01
  And   タスク T3 が { dueDate: "tomorrow", trashedAt: <過去>, trashedReason: "deleted" } で存在する
  When  POST /api/v1/reset を送る
  Then  T3 の dueDate は "tomorrow" のまま変わっていない（ゴミ箱は対象外）
```

---

### completedCount リセット（FR-051）

```
シナリオ: リセット実行で completedCount が 0 になる
  Given counter.completedCount = 5, lastResetExecutedAt = null
  And   dayBoundaryTime = "04:00", clock.now() = 当日 04:01
  When  POST /api/v1/reset を送る
  Then  GET /api/v1/counter は { completedCount: 0 } を返す
```

```
シナリオ: リセット実行後に lastResetExecutedAt が更新される
  Given counter.lastResetExecutedAt = null
  And   clock.now() = "2026-06-08T04:01:00.000Z"（リセット実行時刻）
  When  POST /api/v1/reset を送る
  Then  GET /api/v1/counter の lastResetExecutedAt は "2026-06-08T04:01:00.000Z"（clock.now() の値）になっている
```

```
シナリオ: リセット実行後に counter.version が +1 される
  Given counter.version = 3
  When  POST /api/v1/reset を送る（リセット実行条件を満たす）
  Then  GET /api/v1/counter の version は 4 になっている
```

---

### 冪等性（NFR-020）

```
シナリオ: 境界時刻以降に 2 回 POST /api/v1/reset を送っても結果は 1 回分
  Given dayBoundaryTime = "04:00", clock.now() = 当日 04:01
  And   counter.completedCount = 5, lastResetExecutedAt = null
  And   タスク T1 が { dueDate: "tomorrow", trashedAt: null } で存在する
  When  POST /api/v1/reset を 1 回送る
  And   続けてもう 1 回 POST /api/v1/reset を送る
  Then  2 回目は executed = false で 200 OK が返る
  And   GET /api/v1/counter は completedCount = 0 のまま（0 に 2 回なっていない）
  And   T1 の dueDate は "today"（繰り越しは 1 回のみ）
```

```
シナリオ: 同一の Idempotency-Key で再送しても no-op 応答が返る
  Given POST /api/v1/reset を Idempotency-Key: "k1" で 1 回成功させた
  When  まったく同じ Idempotency-Key: "k1" で再送する
  Then  2 回目も 200 OK が返り、レスポンスボディは 1 回目と同じ
  And   DB への変更は 1 回分のみ
```

---

### POST /api/v1/reset のレスポンス

```
シナリオ: 新規リセット実行時は executed = true が返る
  Given dayBoundaryTime = "04:00", clock.now() = 当日 04:01
  And   counter.lastResetExecutedAt = null
  When  POST /api/v1/reset を送る
  Then  200 OK で { executed: true, appliedBoundaryAt: <当日の境界時刻 ISO 8601> } が返る
```

```
シナリオ: リセット不要の場合は executed = false が返る
  Given dayBoundaryTime = "04:00", clock.now() = 当日 10:00
  And   counter.lastResetExecutedAt = 当日 04:05（境界時刻以降）
  When  POST /api/v1/reset を送る
  Then  200 OK で { executed: false, appliedBoundaryAt: <当日の境界時刻 ISO 8601> } が返る
```

```
シナリオ: 認証なしの POST /api/v1/reset は 401
  Given Authorization ヘッダを付けない
  When  POST /api/v1/reset を送る
  Then  401 UNAUTHORIZED が返る
```

---

### GET /api/v1/today への自動リセット統合

```
シナリオ: GET /api/v1/today のアクセス時にリセット条件を満たす場合は自動でリセットが実行される
  Given dayBoundaryTime = "04:00", clock.now() = 当日 04:01
  And   counter.lastResetExecutedAt = null
  And   タスク T1 が { dueDate: "tomorrow", trashedAt: null } で存在する
  And   counter.completedCount = 3
  When  GET /api/v1/today を呼ぶ
  Then  200 OK で T1 が { dueDate: "today" } として tasks に含まれる
  And   completionCount = 0 が返る（completedCount がリセットされた）
```

```
シナリオ: GET /api/v1/today のアクセス時にリセット条件を満たさない場合はリセットされない
  Given dayBoundaryTime = "04:00", clock.now() = 当日 03:59
  And   counter.completedCount = 3
  When  GET /api/v1/today を呼ぶ
  Then  200 OK で completionCount = 3 が返る（リセット未実行）
```

---

### アトミック実行

```
シナリオ: タスク繰り越しと counter 更新は同一トランザクションで実行される
  Given リセット実行条件を満たす状態
  When  リセット処理の途中で DB エラーが発生した場合（トランザクション中断を想定）
  Then  タスクの dueDate も counter も変更前の状態に戻っている（部分適用が起きない）
  ※ テストでは DB スタブを使いトランザクションのロールバックを確認する
```

---

### スコープ境界の明示（本 feature が触らないこと）

```
シナリオ: ゴミ箱清算フックは呼ばれるが何も削除しない（スタブ）
  Given リセット実行条件を満たす状態
  And   ゴミ箱にタスクが存在する
  When  POST /api/v1/reset を送る
  Then  リセットは成功し（200 OK, executed = true）
  And   ゴミ箱のタスクは物理削除されない（BL-011 の purgeTrash スタブは no-op）
```

```
シナリオ: 本 feature ではタイムゾーン変換を行わない
  Given clock.now() がサーバの UTC 時刻を返す
  And   dayBoundaryTime = "04:00"
  When  リセット判定を行う
  Then  境界時刻は「当日 04:00 UTC」として算出される
  ※ タイムゾーン対応は BL-020 の責務
```

## 未決事項 / 確認待ち

- **U-001: `今日の境界時刻` の算出方法（日付またぎの扱い）**
  - `clock.now()` が "2026-06-08T03:00:00.000Z" で `dayBoundaryTime = "04:00"` の場合、「今日の境界時刻」は "2026-06-08T04:00:00.000Z" か "2026-06-07T04:00:00.000Z" か。
  - 保守側デフォルト案: `clock.now()` の UTC 日付部分を取り出し、`dayBoundaryTime` を合成した ISO 8601 文字列を「今日の境界時刻」とする。03:00 の場合は "2026-06-08T04:00:00.000Z" を比較対象とし、`lastResetExecutedAt` が null または "2026-06-07T04:00:00.000Z" 以前ならリセット必要と判定する。ただし 03:00 < 04:00 なので、まだ「昨日」として「リセット不要」と判定する。
  - 確認質問: UTC 日付ベースで境界を計算する方針で良いか（タイムゾーン対応は BL-020 まで据え置き）。
- **U-002: `purgeTrash` のシグネチャ**
  - 保守側デフォルト案: `async function purgeTrash(db: DrizzleDB, clock: Clock): Promise<void>` として `server/src/use-cases/daily-reset.ts`（または類似モジュール）に空実装を置く。
  - 確認質問: シグネチャおよびモジュール配置はこれで良いか。
- **U-003: `GET /api/v1/today` のリセット実行タイミング（ハンドラ内 vs ミドルウェア）**
  - 保守側デフォルト案: `GET /api/v1/today` ハンドラの先頭で `maybeRunDailyReset(deps)` を呼び出す（既存ハンドラ内での追記）。専用ミドルウェアとすることでよりクリーンだが、今は `/today` 固定なので不要な抽象化を避ける。
  - 確認質問: ハンドラ先頭での直接呼び出し方式で良いか。
