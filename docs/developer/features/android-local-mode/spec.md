# 仕様: Android ローカルモード（@capacitor-community/sqlite + 端末内リセット処理）

- 状態: 確定
- 関連: BL-020
- 由来要件: ADR-0009（Capacitor でラップ、ローカル/サーバ両モード対応）、ADR-0011（ローカルモード時はクライアント時刻が正本）、ADR-0004（永続化方針）

## 背景 / 課題

BL-019 で Android アプリをサーバに接続して動作させるサーバモードを実装した。
ADR-0009 は「Android クライアントはローカルモードとサーバモードのいずれかを選べる」と定めており、
ローカルモードの実装が残っている。

ローカルモードでは、ユーザーがサーバを用意しなくても Android 端末単体で Todica を利用できる。
端末内 SQLite にタスク・プロジェクト・ルーティン・設定を永続化し、リセット処理（繰越・カウンタリセット・
ゴミ箱清算）もクライアント内で完結させる。

ADR-0009 の「モード切替 = 初期化」方針により、ローカル ↔ サーバ間のデータ同期は行わない。

## ゴール / 非ゴール

### ゴール

- `@capacitor-community/sqlite` を使って端末内 SQLite にデータを永続化する各 Repository のローカル実装を作成する。
- SettingsView にローカルモード / サーバモードの切替 UI を追加する。切替時は確認ダイアログを表示し、確認後に旧モードのデータを全消去して新モードで初期化する。
- モード設定を `@capacitor/preferences` の `mode` キーで永続化し、起動時に読み取って適切な Repository 実装を注入する。
- ローカルモード時の起動時リセット処理を実装する（クライアント時刻を正本とする ADR-0011 の方針に従う）。
- ローカルモードでの初回起動は SetupView をスキップして直接 `/today` に遷移する。

### 非ゴール

- ローカル ↔ サーバ間のデータ同期（ADR-0009 の決定により対象外）
- iOS 対応
- ローカルモード時のオフライン書込キュー（端末内 SQLite が正本のため不要）
- サーバモードのリセット処理（サーバ側で実行。本 BL は対象外）
- エクスポート / インポート機能
- Google Play Store への公開（BL-023）

## 要件

### 機能要件

- FR-LOC-001: `@capacitor-community/sqlite` を使い、端末内 SQLite に Task・Project・Routine・Counter・Settings・FocusSelection の 6 テーブルを持つデータベースを初期化する。スキーマは `docs/developer/architecture/database/schema.md` の論理スキーマに従う。
- FR-LOC-002: `LocalTaskRepository`・`LocalProjectRepository`・`LocalRoutineRepository`・`LocalTrashRepository`・`LocalSettingsRepository` を実装し、それぞれ既存の `TaskRepository`・`ProjectRepository`・`WebRoutineRepository`・`TrashRepository`・`SettingsRepository` インターフェースを満たす。
- FR-LOC-003: SettingsView に「モード切替」セクションを追加する。現在のモード（ローカル / サーバ）を表示し、切替ボタンを提供する。ボタンタップ時に「現在のモードのデータが初期化されます」という確認ダイアログを表示する。
- FR-LOC-004: モード切替の確認後、旧モードのデータを全消去（ローカルモードは SQLite を DROP/再作成、サーバモードは `@capacitor/preferences` の `serverUrl`・`authToken` キーを削除）してから新モードで初期化する。
- FR-LOC-005: `@capacitor/preferences` の `mode` キー（値: `'local'` または `'server'`）にモードを保存する。アプリ起動時に `mode` を読み取り、`'local'` であればローカル Repository 実装を、`'server'` であれば HTTP Repository 実装を注入する。
- FR-LOC-006: ローカルモード時の初回起動（`mode` キーが `'local'` かつサーバ URL 未設定時に `mode = 'local'` を選択した場合）は SetupView をスキップして直接 `/today` に遷移する。
- FR-LOC-007: ローカルモード時、アプリ起動時に「最後のリセット実行境界時刻（Counter.lastResetExecutedAt）」を確認し、未実行の境界時刻が存在する場合はリセット処理を実行する。リセット処理の内容は次の 3 ステップとする。
  1. `dueDate = "today"` かつ `trashedAt = null` かつ `origin = "routine"` のタスクをゴミ箱化（`trashedAt = now`、`trashedReason = "deleted"`）
  2. `dueDate = "today"` かつ `trashedAt = null` かつ `origin = "manual"` のタスクを `dueDate = "tomorrow"` に変更（繰越）
  3. Counter の `completedCount` を 0 にリセット、`lastResetExecutedAt` を境界時刻に更新
- FR-LOC-008: リセット処理は冪等にする。`lastResetExecutedAt` が最後の境界時刻以降であれば再実行しない（NFR-020 の二重繰越防止）。
- FR-LOC-009: ゴミ箱清算処理を実装する。リセット時、ゴミ箱内の Task（`trashedAt != null`）のうち、`trashedAt` が Settings.dayBoundaryTime に基づく前日以前のものを物理削除する（FR-062 相当）。

### 非機能要件

- NFR-LOC-001: 既存の Vitest テスト（423件）は green を維持する。
- NFR-LOC-002: ローカルモードのすべての操作はオフラインで完結する。ネットワーク接続を必要としない。
- NFR-LOC-003: Vitest（jsdom 環境）では `@capacitor-community/sqlite` が動作しないため、ローカル Repository のテストは SQLite をモックして実装する。
- NFR-LOC-004: `@capacitor-community/sqlite` のバージョンは `@capacitor/core` v6 と互換性のある版を使う。

## 受け入れ基準

### AC-LOC-001: ローカルモードの初回起動

```
シナリオ: mode = 'local' が設定されている場合は SetupView をスキップする
  Given Preferences に mode = 'local' が保存されている
  When  Android アプリを起動する
  Then  SetupView は表示されない
  And   TodayView（/today）が直接表示される
```

```
シナリオ: mode 未設定かつサーバ URL 未設定の場合は SetupView を表示する
  Given Preferences に mode キーが存在しない
  And   Preferences に serverUrl キーが存在しない
  When  Android アプリを起動する
  Then  SetupView が表示される
  And   モード選択肢（ローカルモード / サーバモード）が表示される
```

### AC-LOC-002: SetupView でのモード選択（初回起動）

```
シナリオ: SetupView でローカルモードを選択すると TodayView に遷移する
  Given SetupView が表示されている
  When  「ローカルモードで使う」を選択する
  Then  Preferences に mode = 'local' が保存される
  And   TodayView（/today）に遷移する
  And   サーバ URL・認証トークンの入力なしで遷移が完了する
```

```
シナリオ: SetupView でサーバモードを選択するとサーバ設定入力へ進む
  Given SetupView が表示されている
  When  「サーバモードで使う」を選択する
  Then  サーバ URL と認証トークンの入力欄が表示される
  And   入力して接続すると Preferences に mode = 'server' および serverUrl・authToken が保存される
  And   TodayView（/today）に遷移する
```

### AC-LOC-003: ローカルモード時のタスク操作

```
シナリオ: ローカルモードでタスクを作成できる
  Given mode = 'local' でアプリが起動している
  When  TodayView で新しいタスク名を入力して追加する
  Then  タスクが端末内 SQLite に保存される
  And   TodayView にタスクが表示される
  And   ネットワーク接続なしで操作が完了する
```

```
シナリオ: ローカルモードでタスクを完了できる
  Given mode = 'local' でアプリが起動している
  And   TodayView にタスクが 1 件表示されている
  When  タスクの完了チェックボックスをタップする
  Then  タスクがゴミ箱に移動する（trashedReason = 'completed'）
  And   Counter.completedCount が 1 増加する
```

```
シナリオ: ローカルモードでタスクを削除できる
  Given mode = 'local' でアプリが起動している
  And   TodayView にタスクが 1 件表示されている
  When  タスクを削除する
  Then  タスクがゴミ箱に移動する（trashedReason = 'deleted'）
  And   Counter.completedCount は変化しない
```

### AC-LOC-004: ローカルモード時のリセット処理

```
シナリオ: 起動時に未実行のリセットがある場合にリセット処理を実行する
  Given mode = 'local' でアプリが起動している
  And   Counter.lastResetExecutedAt が最後の境界時刻より前の値である
  When  アプリを起動する
  Then  origin = 'routine' かつ dueDate = 'today' かつ trashedAt = null のタスクがゴミ箱化される
  And   origin = 'manual' かつ dueDate = 'today' かつ trashedAt = null のタスクの dueDate が 'tomorrow' になる
  And   Counter.completedCount が 0 になる
  And   Counter.lastResetExecutedAt が境界時刻に更新される
```

```
シナリオ: lastResetExecutedAt が最新境界時刻以降の場合はリセット処理を実行しない
  Given mode = 'local' でアプリが起動している
  And   Counter.lastResetExecutedAt が最新の境界時刻以降の値である
  When  アプリを起動する
  Then  タスクの dueDate は変化しない
  And   Counter.completedCount は変化しない
```

### AC-LOC-005: モード切替

```
シナリオ: ローカルモードからサーバモードへ切り替える
  Given mode = 'local' でアプリが起動している
  And   SettingsView の「モード切替」セクションが表示されている
  And   ローカル SQLite にタスクが複数存在する
  When  「サーバモードへ切り替える」ボタンをタップする
  Then  「現在のモードのデータが初期化されます。よろしいですか？」という確認ダイアログが表示される
```

```
シナリオ: モード切替確認後にローカルデータが消去されサーバモードで起動する
  Given 切替確認ダイアログが表示されている（ローカル → サーバ）
  When  「切り替える」をタップする
  Then  端末内 SQLite のすべてのテーブルが空になる
  And   Preferences の mode が 'server' に更新される
  And   SetupView（サーバ設定入力）が表示される
```

```
シナリオ: サーバモードからローカルモードへ切り替える
  Given mode = 'server' でアプリが起動している
  And   SettingsView の「モード切替」セクションが表示されている
  When  「ローカルモードへ切り替える」ボタンをタップし、確認ダイアログで「切り替える」をタップする
  Then  Preferences の serverUrl・authToken が削除される
  And   Preferences の mode が 'local' に更新される
  And   端末内 SQLite が初期化（空）される
  And   TodayView に遷移する
```

```
シナリオ: モード切替確認ダイアログでキャンセルするとデータは保持される
  Given 切替確認ダイアログが表示されている
  When  「キャンセル」をタップする
  Then  モードは変わらない
  And   データは消去されない
```

### AC-LOC-006: モード永続化

```
シナリオ: ローカルモードで設定してアプリを再起動してもローカルモードが維持される
  Given Preferences に mode = 'local' が保存されている
  When  アプリを再起動する
  Then  ローカル Repository 実装が注入される
  And   SetupView は表示されない
  And   TodayView が表示される
```

### AC-LOC-007: ゴミ箱清算

```
シナリオ: リセット時に古いゴミ箱のアイテムが物理削除される
  Given mode = 'local' でリセット処理が実行される
  And   trashedAt が前回境界時刻より前の Task が存在する
  When  リセット処理が実行される
  Then  当該タスクが SQLite から物理削除される
  And   trashedAt が当日境界時刻以降のタスクは物理削除されない
```

## 未決事項 / 確認待ち

- **SetupView のモード選択 UI**: 現在の SetupView（BL-019）は「サーバモード専用」の入力フォームである。BL-020 では「ローカルモード」か「サーバモード」かを最初に選ばせる必要がある。SetupView をモード選択+サーバ設定に拡張するか、新しい画面として分離するかは実装者の判断に委ねる。
- **SQLite データベース名**: `todica.db` を使う予定。変更が必要な場合は implementer が判断する。
- **ゴミ箱清算の「前日以前」の定義**: `trashedAt < 前回境界時刻` を条件とする。具体的な比較方法（ISO 8601 文字列の辞書順比較 vs Date オブジェクト比較）は implementer が実装時に確定する。
