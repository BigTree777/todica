# 仕様: 境界時刻の設定

- 状態: ドラフト
- 関連: [`../../planning/backlog.md`](../../planning/backlog.md) BL-009
- 由来要件: FR-041 (境界時刻の設定), FR-042 (デフォルト値 04:00), NFR-012 (設定の永続化)
- 関連 ADR: [ADR-0011](../../adr/0011-day-boundary-time-source.md) (T3 ハイブリッド時刻設計)
- 関連先行 feature:
  - [`../completion-counter/spec.md`](../completion-counter/spec.md) (BL-008. Counter singleton パターンの参考)

## 背景 / 課題

Todica の「今日ビュー」は「今日」か「明日」という 2 値の期限でタスクを管理する. この「今日」と「翌日」の境界をいつとするかは固定値ではなく, ユーザーが自分のライフスタイルに合わせて設定できる必要がある.

例: 夜型のユーザーが境界時刻を「04:00」に設定すると, 深夜 3 時でもまだ「今日」として扱われ, 04:00 になると翌日扱いになる. デフォルト値は 04:00 (FR-042).

現状 `GET /api/v1/settings` と `PATCH /api/v1/settings` の API エンドポイントは OpenAPI に定義済みだが, `Settings` スキーマの properties が空であり, 境界時刻フィールドが存在しない. 本 feature でこれを実装する.

境界時刻の **適用**（日付計算への利用・リセット処理）は BL-010 / BL-020 の責務であり, 本 feature のスコープは「境界時刻を設定・取得する」のみとする.

## ゴール / 非ゴール

### ゴール

- **Settings エンティティの物理化**. drizzle テーブル `settings` を新設し, 起動時または lazy upsert で singleton レコード (`id = "singleton"`, `dayBoundaryTime = "04:00"`, `version = 1`) を 1 件確保する.
- **`GET /api/v1/settings` を実装する**. Bearer 認証必須 / 読取専用. レスポンスは `{ settings: { id, dayBoundaryTime, version, updatedAt } }`.
- **`PATCH /api/v1/settings` を実装する**. `dayBoundaryTime` を更新できる. 楽観ロック (`If-Match` + `version`) および冪等性キー (`Idempotency-Key`) を使う.
- **バリデーション**. `dayBoundaryTime` は `"HH:MM"` 形式 (`"00:00"` 〜 `"23:59"`) のみ受け付ける. 範囲外・形式違反は 400 を返す.
- **永続化**. SQLite に保存し, サーバ再起動後も設定値を維持する (NFR-012).
- **Web クライアント側に設定画面 (SettingsView) を新規作成する**. 現在の `dayBoundaryTime` を表示し, フォームで更新できる. 今日ビュー (TodayView) への統合はしない.
- **OpenAPI の `Settings` スキーマを具体化する**. GET / PATCH のリクエスト・レスポンス schema を詳細化する.

### 非ゴール

- **境界時刻の日付計算への適用**: BL-010 / BL-020 の責務. 本 feature では設定値を保存・返却するのみ.
- **リセット処理**: BL-010 の責務. 境界時刻を元にした `completedCount` のクリアは本 feature では実装しない.
- **タイムゾーン入力 UI / multi-TZ 設定**: 本 feature では扱わない. `dayBoundaryTime` の TZ 解釈は [`../reset-time-rework/spec.md`](../reset-time-rework/spec.md) に従い, サーバプロセスまたは端末のローカル TZ を採用する.
- **設定値の削除 API**: ユーザーは設定値を削除しない. デフォルト値への戻しは `"04:00"` を PATCH するだけで実現する.
- **複数ユーザーへの対応**: 単一ユーザー前提 (ADR-0010). singleton パターンで管理する.
- **Android クライアントの設定画面**: BL-020 の責務.

## 要件

### 機能要件

- **FR-041 (境界時刻の設定)**
  - ユーザーは `PATCH /api/v1/settings` で境界時刻を設定できる.
  - `dayBoundaryTime` フィールド: `"HH:MM"` 形式の文字列 (例: `"04:00"`, `"23:30"`).
  - バリデーション: `"00:00"` 〜 `"23:59"` の範囲, かつ `HH:MM` 正規表現 (`^([01]\d|2[0-3]):[0-5]\d$`) に一致すること.
- **FR-042 (デフォルト値 04:00)**
  - 初期状態（起動時・初回設定前）の `dayBoundaryTime` は `"04:00"`.
- **NFR-012 (設定の永続化)**
  - 設定値は SQLite に永続化される. サーバ再起動後も更新された設定値が維持される.

### 非機能要件

- **楽観ロック**: `PATCH /api/v1/settings` は `If-Match: <version>` ヘッダを必須とする. サーバ側 version と不一致の場合は 412 Precondition Failed を返す.
- **冪等性**: `PATCH /api/v1/settings` は `Idempotency-Key` ヘッダを必須とする. 同じキーで再送された場合は保存済み応答を返す.
- **認証**: `GET` / `PATCH` ともに Bearer 認証必須. 未認証は 401.

## 受け入れ基準

> 書き方は [`../../quality/acceptance-criteria.md`](../../quality/acceptance-criteria.md) に従う. Gherkin の Given/When/Then で表現する.

### Settings の初期状態 (FR-042)

```
シナリオ: 初回アクセス時の Settings は dayBoundaryTime = "04:00" で存在する
  Given サーバを起動した直後で Settings を一度も更新していない
  When  GET /api/v1/settings を認証付きで呼ぶ
  Then  200 OK で { settings: { id: "singleton", dayBoundaryTime: "04:00", version: 1, updatedAt: <ISO 8601> } } が返る
```

```
シナリオ: 認証なしの GET /api/v1/settings は 401
  Given Authorization ヘッダを付けない
  When  GET /api/v1/settings を呼ぶ
  Then  401 UNAUTHORIZED が返る
```

### 境界時刻の更新 (FR-041)

```
シナリオ: dayBoundaryTime を有効な値に更新できる
  Given Settings が { dayBoundaryTime: "04:00", version: 1 } で存在する
  When  PATCH /api/v1/settings に { dayBoundaryTime: "03:30" } を Idempotency-Key と If-Match: 1 で送る
  Then  200 OK で { settings: { id: "singleton", dayBoundaryTime: "03:30", version: 2, updatedAt: <更新後の ISO 8601> } } が返る
```

```
シナリオ: サーバ再起動後も更新した設定値が維持される (NFR-012)
  Given PATCH /api/v1/settings で dayBoundaryTime を "06:00" に更新した
  When  サーバを再起動して GET /api/v1/settings を呼ぶ
  Then  200 OK で { settings: { dayBoundaryTime: "06:00", ... } } が返る
```

```
シナリオ: dayBoundaryTime に "00:00" を設定できる
  Given Settings が { version: 1 } で存在する
  When  PATCH /api/v1/settings に { dayBoundaryTime: "00:00" } を送る
  Then  200 OK で { settings: { dayBoundaryTime: "00:00", version: 2, ... } } が返る
```

```
シナリオ: dayBoundaryTime に "23:59" を設定できる
  Given Settings が { version: 1 } で存在する
  When  PATCH /api/v1/settings に { dayBoundaryTime: "23:59" } を送る
  Then  200 OK で { settings: { dayBoundaryTime: "23:59", version: 2, ... } } が返る
```

### バリデーション (FR-041)

```
シナリオ: HH:MM 形式に合わない文字列は拒否される
  Given Settings が { version: 1 } で存在する
  When  PATCH /api/v1/settings に { dayBoundaryTime: "4:00" } を送る (1 桁の時)
  Then  400 INVALID_DAY_BOUNDARY_TIME が返る
```

```
シナリオ: 時が 24 以上の値は拒否される
  Given Settings が { version: 1 } で存在する
  When  PATCH /api/v1/settings に { dayBoundaryTime: "24:00" } を送る
  Then  400 INVALID_DAY_BOUNDARY_TIME が返る
```

```
シナリオ: 分が 60 以上の値は拒否される
  Given Settings が { version: 1 } で存在する
  When  PATCH /api/v1/settings に { dayBoundaryTime: "12:60" } を送る
  Then  400 INVALID_DAY_BOUNDARY_TIME が返る
```

```
シナリオ: dayBoundaryTime フィールドを省略した PATCH は拒否される
  Given Settings が { version: 1 } で存在する
  When  PATCH /api/v1/settings に {} を送る (空オブジェクト)
  Then  400 INVALID_REQUEST_BODY が返る
```

```
シナリオ: 認証なしの PATCH /api/v1/settings は 401
  Given Authorization ヘッダを付けない
  When  PATCH /api/v1/settings に { dayBoundaryTime: "05:00" } を送る
  Then  401 UNAUTHORIZED が返る
```

### 楽観ロック (If-Match)

```
シナリオ: version 不一致の PATCH は 412 を返す
  Given Settings が { dayBoundaryTime: "04:00", version: 1 } で存在する
  When  PATCH /api/v1/settings に { dayBoundaryTime: "05:00" } を If-Match: 2 で送る (実際の version は 1)
  Then  412 Precondition Failed が返る
  And   Settings の dayBoundaryTime は "04:00" のまま変わらない
```

### 冪等性 (Idempotency-Key)

```
シナリオ: 同じ Idempotency-Key で PATCH を 2 回送っても設定値は 1 回分だけ変わる
  Given Settings が { dayBoundaryTime: "04:00", version: 1 } で存在する
  When  PATCH /api/v1/settings に { dayBoundaryTime: "05:00" } を Idempotency-Key: "k1", If-Match: 1 で送る
  And   まったく同じヘッダ・ボディで再送する
  Then  2 回目も 200 OK が返り, レスポンスボディは 1 回目と同じ
  And   GET /api/v1/settings は { dayBoundaryTime: "05:00", version: 2 } を返す (= version は 2 に留まる, 3 に進まない)
```

### Web クライアント SettingsView (FR-041 / FR-042)

```
シナリオ: SettingsView を開くと現在の dayBoundaryTime が表示される
  Given サーバ正本で dayBoundaryTime = "04:00"
  When  ユーザーが SettingsView を開く
  Then  "04:00" が設定値として画面に表示される
```

```
シナリオ: SettingsView のフォームで dayBoundaryTime を更新できる
  Given SettingsView が開かれており dayBoundaryTime = "04:00" が表示されている
  When  ユーザーがフォームに "06:00" を入力して保存操作をする
  Then  保存が成功し, 表示が "06:00" に更新される
```

```
シナリオ: バリデーション違反の値を入力すると保存されない
  Given SettingsView が開かれている
  When  ユーザーがフォームに "25:00" を入力して保存操作をする
  Then  保存が失敗し, エラーが表示される (設定値は変わらない)
```

### スコープ境界の明示 (本 feature が触らないこと)

```
シナリオ: 本 feature では境界時刻は日付計算に適用されない
  Given dayBoundaryTime = "06:00" に設定した
  When  GET /api/v1/today を呼ぶ
  Then  今日のタスク一覧は従来どおり返る (境界時刻の適用は BL-010 / BL-020 で実装される)
  ※ 設定値の「保存・取得」だけが本 feature の責務.
```

## 未決事項 / 確認待ち

- **U-001: PATCH のメソッドを PUT にするか PATCH にするか**
  - 保守側デフォルト案: 既存の OpenAPI では `PUT /api/v1/settings` と定義されている. Settings は全フィールドを一括置換するのに近いが, 本 feature では `dayBoundaryTime` のみが存在するため実質的に差はない. 既存 OpenAPI 定義 (`PUT`) を踏襲するか, 部分更新として `PATCH` に変更するかを確定する.
  - 確認質問: OpenAPI の既存定義 (`PUT`) を使うか, 部分更新 (`PATCH`) に変更するか.
- **U-002: Settings の singleton レコードを起動時 INSERT で確保するか, lazy upsert にするか**
  - 保守側デフォルト案: **`get()` 内 lazy upsert** (FocusRepository / CounterRepository と同じパターン). マイグレーションとアプリ起動ロジックを分離できる.
  - 代替案: マイグレーション内 `INSERT OR IGNORE` で確保 (Counter plan.md D-004 と同じ). 起動ロジックが不要になるが, マイグレーション SQL に依存する.
  - 確認質問: lazy upsert パターンで良いか.
- **U-003: SettingsView のルーティング / ナビゲーション**
  - 保守側デフォルト案: Web クライアントに `/settings` というルートを新設し, SettingsView コンポーネントを配置する. TodayView からのリンク (ナビゲーション導線) は implementer 裁量.
  - 確認質問: ルーティング構成はこの方針で良いか.
- **U-004: PATCH レスポンスに 412 時のボディとして現在の Settings を返すか**
  - 保守側デフォルト案: **返す** (BL-001 の `tasks` PATCH が 412 時に現行 task を返すのと同じ方針). クライアントが現在値を再取得するリクエストを省ける.
  - 確認質問: 412 レスポンスボディに `{ settings }` を含める方針で良いか.
