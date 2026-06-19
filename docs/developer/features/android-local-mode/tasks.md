# タスク: Android ローカルモード（@capacitor-community/sqlite + 端末内リセット処理）

> [`plan.md`](plan.md) を実行可能な単位に分解する。完了したらチェックを入れる。

## 実装

### T-01: @capacitor-community/sqlite のインストールと互換性確認

- [ ] `web/package.json` の依存関係を確認し、`@capacitor/core` の現行バージョン（v6 系か v8 系か）を特定する
- [ ] `@capacitor-community/sqlite` の互換バージョンを調査する（`npm info @capacitor-community/sqlite peerDependencies` 等）
- [ ] `npm install @capacitor-community/sqlite` を `web/` ワークスペースに実行する
- [ ] `android/` ディレクトリで `npx cap sync android` を実行し、ネイティブプラグインが同期されることを確認する

### T-02: SQLite 初期化モジュールの作成（local-db.ts）

- [ ] `web/src/repositories/local-db.ts` を新規作成する
  - `@capacitor-community/sqlite` の `CapacitorSQLite` を import する
  - データベース名を `todica.db` とする
  - `initDb()`: DB 接続を開き、以下のテーブルを `CREATE TABLE IF NOT EXISTS` で作成する関数を実装する
    - `tasks`（id, name, project_id, due_date, priority, origin, routine_id, created_at, updated_at, trashed_at, trashed_reason, version）
    - `projects`（id, name, created_at, updated_at, trashed_at, version）
    - `routines`（id, name, generate_on_weekdays, default_priority, last_generated_for_date, created_at, updated_at, trashed_at, version）
    - `counter`（id, completed_count, last_reset_executed_at, updated_at, version）
    - `settings`（id, day_boundary_time, day_boundary_timezone, updated_at, version）
    - `focus_selection`（id, current_task_id, updated_at, version）
  - `dropAllTables()`: 全テーブルを DROP する関数を実装する（モード切替時のデータ全消去に使用）
  - `getDb()`: 初期化済みの DB 接続を返すシングルトン関数を実装する

### T-03: LocalTaskRepository の実装

- [ ] `web/src/repositories/local-task-repository.ts` を新規作成する
  - `TaskRepository` インターフェースを実装する
  - `list()`: `tasks` から `trashedAt IS NULL` 条件でタスクを返す
  - `create(cmd)`: `tasks` に INSERT し、生成したタスクを返す。`version = 1` で初期化する
  - `update(cmd)`: `id` と `version = cmd.ifMatch` を条件に UPDATE し、version を +1 する。不一致の場合は `OptimisticLockError` を投げる
  - `delete(cmd)`: `trashedAt = now`・`trashedReason = 'deleted'` に UPDATE し（ゴミ箱化）、version を +1 する。不一致の場合は `OptimisticLockError` を投げる
  - `complete(cmd)`: `trashedAt = now`・`trashedReason = 'completed'` に UPDATE し、counter.completed_count を +1 するトランザクションを実装する
  - `today()`: `dueDate = 'today'` かつ `trashedAt IS NULL` のタスクを priority → created_at → id 順で取得し、`TodayViewResponse` を返す（`nextTaskId` は先頭の id、`currentTaskId` は `focus_selection.current_task_id`）
  - `getFocus()`: `focus_selection` テーブルから `id = 'singleton'` のレコードを返す（存在しない場合は `version=1` で INSERT して返す）
  - `setFocus(cmd)`: `focus_selection` の `current_task_id` と `version` を更新する。`ifMatch` 不一致の場合は `OptimisticLockError` を投げる
  - `getCounter()`: `counter` テーブルから `id = 'singleton'` のレコードを返す（存在しない場合は `completed_count = 0`・`version = 1` で INSERT して返す）

### T-04: LocalProjectRepository の実装

- [ ] `web/src/repositories/local-project-repository.ts` を新規作成する
  - `ProjectRepository` インターフェースを実装する
  - `list()`: `projects` から `trashedAt IS NULL` のプロジェクトを返す
  - `create(cmd)`: `projects` に INSERT する
  - `update(cmd)`: `id` と `version = cmd.ifMatch` を条件に UPDATE し、version を +1 する
  - `delete(cmd)`: `trashedAt = now` に UPDATE し（ゴミ箱化）、version を +1 する

### T-05: LocalRoutineRepository の実装

- [ ] `web/src/repositories/local-routine-repository.ts` を新規作成する
  - `WebRoutineRepository` インターフェースを実装する
  - `daysOfWeek` は `days_of_week` 列に JSON 文字列として保存し、読み出し時に parse する
  - `list()`: `routines` から `trashedAt IS NULL` のルーティンを返す
  - `create(cmd)`・`update(cmd)`・`delete(cmd)` を実装する（T-04 と同様の楽観ロック方針）

### T-06: LocalTrashRepository の実装

- [ ] `web/src/repositories/local-trash-repository.ts` を新規作成する
  - `TrashRepository` インターフェースを実装する
  - `list()`: `tasks` から `trashedAt IS NOT NULL` のタスクを返す
  - `restore(cmd)`: `trashedAt = null`・`trashedReason = null` に UPDATE し（復元）、version を +1 する
  - `empty()`: `trashedAt IS NOT NULL` のタスクを物理 DELETE する

### T-07: LocalSettingsRepository の実装

- [ ] `web/src/repositories/local-settings-repository.ts` を新規作成する
  - `SettingsRepository` インターフェースを実装する
  - `getSettings()`: `settings` テーブルから `id = 'singleton'` のレコードを返す（存在しない場合は `dayBoundaryTime = '04:00'`・`dayBoundaryTimezone = 'Asia/Tokyo'`・`version = 1` で INSERT して返す）
  - `patchSettings(cmd)`: `id = 'singleton'` かつ `version = cmd.ifMatch` を条件に UPDATE する

### T-08: LocalResetUsecase の実装

- [ ] `web/src/usecases/local-reset-usecase.ts` を新規作成する
  - `runIfNeeded(now: Date, db: SQLiteDBConnection): Promise<void>` を実装する
  - Settings から `dayBoundaryTime`（"HH:mm"）と `dayBoundaryTimezone`（IANA 文字列）を取得する
  - Counter から `lastResetExecutedAt` を取得する
  - `now` と `dayBoundaryTime`・`dayBoundaryTimezone` から「前回の境界時刻」を計算する
  - `lastResetExecutedAt >= 「前回の境界時刻」` であれば return（冪等性チェック）
  - 以下を 1 トランザクションで実行する:
    - `tasks` で `dueDate = 'today'` かつ `trashedAt IS NULL` かつ `origin = 'routine'` → `trashedAt = now.toISOString()`・`trashedReason = 'deleted'` に更新
    - `tasks` で `dueDate = 'today'` かつ `trashedAt IS NULL` かつ `origin = 'manual'` → `dueDate = 'tomorrow'` に更新
    - `counter` で `id = 'singleton'` → `completedCount = 0`・`lastResetExecutedAt = 「前回の境界時刻」.toISOString()` に更新
    - `tasks` で `trashedAt IS NOT NULL` かつ `trashedAt < 「前回の境界時刻」.toISOString()` → DELETE（ゴミ箱清算）

### T-09: main.tsx の初期化フロー変更

- [ ] `web/src/main.tsx` の `loadCapacitorPreferences()` 関数を拡張する
  - `Preferences.get({ key: 'mode' })` を追加し、戻り値に `mode: 'local' | 'server' | null` を含める
- [ ] `init()` 関数のネイティブ分岐を以下のように更新する:
  - `mode = 'local'` の場合: `LocalDB.initDb()` を await、`LocalResetUsecase.runIfNeeded(new Date(), db)` を await、Local Repository 実装を使った `AppConfig` を生成する（`needsSetup = false`）
  - `mode = 'server'` の場合: 既存の Http Repository 分岐を維持する
  - `mode = null` かつ `serverUrl` 未設定の場合: `needsSetup = true`（モード選択を促す SetupView を表示）
  - `mode = null` かつ `serverUrl` 設定済みの場合: 後方互換として `mode = 'server'` と同様に扱う
- [ ] `App` コンポーネントに `repositories` プロップを追加し、モードに応じた実装を渡せるようにする（または既存の Repository 構築ロジックをリファクタリングする）

### T-10: SetupView の拡張（ローカルモード選択の追加）

- [ ] `web/src/ui/setup-view/setup-view.tsx` を更新する
  - `onSelectLocal?: () => void` プロップを追加する
  - `onSelectLocal` が渡されている場合は「ローカルモードで使う」ボタンを表示する
  - ボタンクリック時に `onSelectLocal()` を呼び出す
- [ ] `web/src/main.tsx` の `SetupViewWithNav` を更新する
  - `onSelectLocal` コールバックを実装する:
    - `Preferences.set({ key: 'mode', value: 'local' })` を await する
    - `LocalDB.initDb()` を await する
    - `/today` に遷移する

### T-11: SettingsView へのモード切替セクション追加

- [ ] `web/src/ui/settings-view/settings-view.tsx` を更新する
  - `currentMode?: 'local' | 'server'` プロップを追加する
  - `onSwitchMode?: () => Promise<void>` プロップを追加する
  - `Capacitor.isNativePlatform()` かつ `currentMode` が渡されている場合のみ「モード切替」セクションを表示する
  - 「サーバモードへ切り替える」または「ローカルモードへ切り替える」ボタンを表示する
  - ボタンクリック時に確認メッセージを表示し（`window.confirm()` またはインライン確認 UI）、確認後に `onSwitchMode()` を呼び出す
- [ ] `web/src/main.tsx` の `App` コンポーネントを更新する
  - `currentMode` を `SettingsView` に渡す
  - `onSwitchMode` コールバックを実装する:
    - **ローカル → サーバ**: `LocalDB.dropAllTables()` → `Preferences.remove('serverUrl')` → `Preferences.remove('authToken')` → `Preferences.set('mode', 'server')` → `/setup` に遷移
    - **サーバ → ローカル**: `Preferences.remove('serverUrl')` → `Preferences.remove('authToken')` → `LocalDB.dropAllTables()` → `LocalDB.initDb()` → `Preferences.set('mode', 'local')` → `/today` に遷移

### T-12: Android ネイティブプラグイン設定（capacitor-community/sqlite 固有）

- [ ] `android/app/src/main/java/.../MainActivity.java`（または `.kt`）に `CapacitorSQLite` を登録する（`@capacitor-community/sqlite` のドキュメント参照）
- [ ] `npx cap sync android` を実行してネイティブ設定を同期する

## テスト

### T-13: local-db.ts のモック準備

- [ ] `web/src/repositories/__mocks__/@capacitor-community/sqlite.ts` を作成する（または各テストファイル内で `vi.mock('@capacitor-community/sqlite', ...)` を使う）
  - `SQLiteDBConnection` の最小モック実装（`execute`・`query`・`run`・`beginTransaction`・`commitTransaction`・`rollbackTransaction` メソッド）を用意する

### T-14: LocalTaskRepository の単体テスト

- [ ] `web/src/repositories/local-task-repository.test.ts` を新規作成する:
  - `create()`: タスクが INSERT され、戻り値が正しい形であることを検証する
  - `list()`: `trashedAt IS NULL` のタスクのみ返すことを検証する
  - `update()`: ifMatch が一致する場合に UPDATE され version が +1 されることを検証する
  - `update()`: ifMatch が不一致の場合に `OptimisticLockError` が投げられることを検証する
  - `delete()`: タスクがゴミ箱化（trashedAt が設定される）されることを検証する
  - `complete()`: タスクのゴミ箱化と Counter.completedCount の +1 が同一トランザクションで実行されることを検証する
  - `today()`: priority → created_at → id 順でタスクが返されることを検証する
  - `getFocus()`: レコードが存在しない場合は初期値で返ることを検証する
  - `getCounter()`: レコードが存在しない場合は completedCount = 0 で返ることを検証する

### T-15: LocalProjectRepository の単体テスト

- [ ] `web/src/repositories/local-project-repository.test.ts` を新規作成する:
  - CRUD の各操作（create / list / update / delete）を検証する
  - `delete()` がゴミ箱化であること（物理削除でないこと）を検証する
  - ifMatch 不一致時に `OptimisticLockError` が投げられることを検証する

### T-16: LocalRoutineRepository の単体テスト

- [ ] `web/src/repositories/local-routine-repository.test.ts` を新規作成する:
  - `create()` と `list()` で `daysOfWeek`（`days_of_week` 列）が正しく JSON 変換されることを検証する
  - CRUD の基本動作を検証する

### T-17: LocalTrashRepository の単体テスト

- [ ] `web/src/repositories/local-trash-repository.test.ts` を新規作成する:
  - `list()` が `trashedAt IS NOT NULL` のタスクのみ返すことを検証する
  - `restore()` が `trashedAt = null` に戻すことを検証する
  - `empty()` がゴミ箱内の全タスクを物理削除することを検証する

### T-18: LocalSettingsRepository の単体テスト

- [ ] `web/src/repositories/local-settings-repository.test.ts` を新規作成する:
  - `getSettings()` でレコードが存在しない場合は `dayBoundaryTime = '04:00'` の初期値が返ることを検証する
  - `patchSettings()` が正しく更新することを検証する

### T-19: LocalResetUsecase の単体テスト

- [ ] `web/src/usecases/local-reset-usecase.test.ts` を新規作成する:
  - `lastResetExecutedAt` が境界時刻以降の場合に処理が実行されないことを検証する（冪等性）
  - `lastResetExecutedAt` が境界時刻より前の場合に以下を検証する:
    - `origin = 'routine'` かつ `dueDate = 'today'` のタスクがゴミ箱化されること
    - `origin = 'manual'` かつ `dueDate = 'today'` のタスクが `dueDate = 'tomorrow'` になること
    - `origin = 'routine'` かつ `dueDate = 'tomorrow'` のタスクは変更されないこと
    - Counter.completedCount が 0 になること
    - Counter.lastResetExecutedAt が境界時刻に更新されること
    - ゴミ箱清算（古い trashedAt のタスクが物理削除されること）
  - `lastResetExecutedAt = null`（初回起動）の場合でも正しく動作することを検証する

### T-20: main.tsx のモード分岐テスト

- [ ] `web/src/router.test.tsx` または `web/src/main.test.tsx` を更新する:
  - `mode = 'local'` を返すモックで Local Repository が注入されることを検証する
  - `mode = 'server'` を返すモックで Http Repository が注入されることを検証する
  - `mode = null` かつ `serverUrl` 未設定の場合に `needsSetup = true` になることを検証する
  - ブラウザ環境（`isNativePlatform = false`）では既存の動作が変わらないことを確認する

### T-21: SetupView の拡張テスト

- [ ] `web/src/ui/setup-view/setup-view.test.tsx` を更新する:
  - `onSelectLocal` プロップが渡されている場合に「ローカルモードで使う」ボタンが表示されることを検証する
  - 「ローカルモードで使う」ボタンクリック時に `onSelectLocal` が呼ばれることを検証する
  - `onSelectLocal` が渡されていない場合にボタンが表示されないことを検証する
  - 既存テスト（サーバモード設定フォーム）が引き続き green であることを確認する

### T-22: SettingsView のモード切替テスト

- [ ] `web/src/ui/settings-view/settings-view.test.tsx` を更新する:
  - `currentMode = 'local'` プロップが渡されている場合に「サーバモードへ切り替える」ボタンが表示されることを検証する
  - `currentMode = 'server'` プロップが渡されている場合に「ローカルモードへ切り替える」ボタンが表示されることを検証する
  - `currentMode` が渡されていない場合にモード切替セクションが表示されないことを検証する
  - ボタンクリック時に確認の後 `onSwitchMode` が呼ばれることを検証する

### T-23: 既存テストの green 確認

- [ ] `npm test -w web` を実行し、全テスト（BL-019 以前の 423 件 + 今回追加分）が green であることを確認する（NFR-LOC-001）

## ドキュメント

### T-24: android-build.md の更新

- [ ] `docs/developer/android-build.md` に以下のセクションを追加する:
  - ローカルモードの初期化手順（`@capacitor-community/sqlite` プラグインの登録方法）
  - ローカルモードとサーバモードの切替方法（ユーザー操作手順）
  - 開発時のローカルモードデバッグ方法（SQLite のデータ確認手段）

## 仕上げ

- [ ] AC-LOC-001〜AC-LOC-007 の受け入れ基準をすべて満たすことを確認する
- [ ] `npm test -w web` で全テストが green であることを確認する（NFR-LOC-001）
- [ ] Android エミュレーター（API 34）で以下を手動確認する:
  - ローカルモードでの初回起動（SetupView のモード選択 → /today 遷移）
  - ローカルモードでのタスク作成・完了・削除
  - 起動時リセット処理の動作（境界時刻を過ぎた状態でアプリを起動）
  - SettingsView からのモード切替（ローカル → サーバ、サーバ → ローカル）
  - アプリ再起動後もモードが維持されること
- [ ] レビュー依頼
