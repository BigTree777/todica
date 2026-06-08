# 設計・実装計画: Android ローカルモード（@capacitor-community/sqlite + 端末内リセット処理）

> [`spec.md`](spec.md) の要件を、どう実現するかに落とす。

## 方針概要

既存の Repository インターフェース（`TaskRepository`・`ProjectRepository` 等）をそのまま維持し、
`@capacitor-community/sqlite` を使った Local 実装（`LocalTaskRepository` 等）を追加する。
`main.tsx` の初期化フローで `mode` Preference を読み取り、`'local'` か `'server'` かに応じて
注入する Repository 実装を切り替える。モード切替は SettingsView から行い、切替時に旧データを全消去する。
リセット処理はローカルモード起動時に端末時刻（クライアント時刻正本、ADR-0011）を使って
`LocalResetUsecase` として実装する。

## 影響範囲

| 領域 | 変更内容 |
| --- | --- |
| 依存関係 | `web/package.json` に `@capacitor-community/sqlite` を追加 |
| 新規ファイル（Repository） | `web/src/repositories/local-db.ts`（SQLite 初期化・DDL）、`web/src/repositories/local-task-repository.ts`、`web/src/repositories/local-project-repository.ts`、`web/src/repositories/local-routine-repository.ts`、`web/src/repositories/local-trash-repository.ts`、`web/src/repositories/local-settings-repository.ts` |
| 新規ファイル（ユースケース） | `web/src/usecases/local-reset-usecase.ts` |
| `web/src/main.tsx` | `mode` Preference の読み取りと、モードに応じた Repository 実装の分岐注入 |
| `web/src/ui/setup-view/setup-view.tsx` | 「ローカルモードで使う」選択肢を追加するよう拡張 |
| `web/src/ui/settings-view/settings-view.tsx` | 「モード切替」セクションを追加 |
| テスト | 各 Local Repository のテストファイル（モック使用） |

## 設計詳細

### D-001: SQLite 初期化モジュール（local-db.ts）

`@capacitor-community/sqlite` の `CapacitorSQLite` を使い、データベース `todica.db` を開く。
DDL（CREATE TABLE IF NOT EXISTS）は起動時に 1 回だけ実行し、テーブルが存在しない場合に作成する。

**テーブル定義（論理 → 物理マッピング）:**

| 論理テーブル | 物理テーブル名 | 特記 |
| --- | --- | --- |
| Task | `tasks` | `dueDate` は TEXT（`"today"` / `"tomorrow"`）、`origin` は TEXT |
| Project | `projects` | |
| Routine | `routines` | `generateOnWeekdays` は JSON 文字列（`["mon","tue",...]` 形式で TEXT に保存） |
| Counter | `counter` | 固定 id = `"singleton"` |
| Settings | `settings` | 固定 id = `"singleton"` |
| FocusSelection | `focus_selection` | 固定 id = `"singleton"` |

全テーブル共通カラム: `id TEXT PRIMARY KEY`, `version INTEGER NOT NULL DEFAULT 1`, `created_at TEXT`, `updated_at TEXT NOT NULL`。

`local-db.ts` はシングルトンとして DB 接続を保持し、各 Local Repository に注入する。

### D-002: Local Repository 実装の構造

各 Local Repository は対応する既存の Repository インターフェースを実装する。
HTTP Repository との置き換えが可能なように、コンストラクタ引数は `db: SQLiteDBConnection` のみとする。

**インターフェース対応表:**

| インターフェース | Http 実装 | Local 実装 |
| --- | --- | --- |
| `TaskRepository` | `HttpTaskRepository` | `LocalTaskRepository` |
| `ProjectRepository` | `HttpProjectRepository` | `LocalProjectRepository` |
| `WebRoutineRepository` | `HttpRoutineRepository` | `LocalRoutineRepository` |
| `TrashRepository` | `HttpTrashRepository` | `LocalTrashRepository` |
| `SettingsRepository` | `HttpSettingsRepository` | `LocalSettingsRepository` |

**Local 実装での注意点:**

- `TaskRepository.today()` が返す `TodayViewResponse.nextTaskId` と `currentTaskId` は、ローカル実装でも同じ意味を持つ。`nextTaskId` は `dueDate = 'today'` かつ `trashedAt IS NULL` のタスクを priority → createdAt → id 順に並べた先頭の id を返す。`currentTaskId` は `focus_selection` テーブルの `current_task_id` を返す。
- `TaskRepository.complete()` は `trashedAt = now`、`trashedReason = 'completed'` に更新し、Counter.completedCount を +1 する（1 トランザクション内）。
- 楽観ロック（`ifMatch` / `version`）は Local 実装でも検証する。ローカルモードでは競合は基本発生しないが、インターフェース上の契約として維持する。
- `TaskRepository.getFocus()` / `setFocus()` / `getCounter()` は `focus_selection` / `counter` テーブルの CRUD で実装する。初回アクセス時にレコードが存在しない場合は `version = 1` で INSERT する。

### D-003: main.tsx の初期化フロー変更

現在の `loadCapacitorPreferences()` を拡張し、`mode` キーも読み取る。

```
1. Capacitor.isNativePlatform() を確認
2. ネイティブの場合:
   a. Preferences.get('mode') を await → 'local' | 'server' | null
   b. Preferences.get('serverUrl') を await
   c. Preferences.get('authToken') を await
3. mode = 'local' の場合:
   - LocalDB を初期化（local-db.ts の initDb()）
   - Local Repository 実装を注入
   - needsSetup = false（SetupView スキップ）
   - LocalResetUsecase.runIfNeeded() を await（起動時リセット判定）
4. mode = 'server' の場合（または mode = null かつ serverUrl が設定済みの場合）:
   - Http Repository 実装を注入
   - needsSetup = !serverUrl
5. mode = null かつ serverUrl 未設定の場合:
   - needsSetup = true（SetupView 表示。モード選択を促す）
6. Web の場合:
   - 従来通り import.meta.env から読み取り
```

### D-004: SetupView の拡張

BL-019 で実装した SetupView に「ローカルモードで使う」ボタンを追加する。
モード選択のフロー:

```
SetupView
  ├─「ローカルモードで使う」ボタン
  │    → Preferences.set('mode', 'local')
  │    → LocalDB 初期化
  │    → /today に遷移
  └─「サーバモードで使う」ボタン（または既存のサーバ URL 入力フォーム）
       → 既存の BL-019 フロー（Preferences.set('serverUrl', ...) + Preferences.set('mode', 'server')）
       → /today に遷移
```

SetupView コンポーネントは `onSelectLocal: () => void` プロップを新たに受け取る。
（`onSave` は既存のサーバモード保存コールバック。`onSelectLocal` はローカルモード選択時のコールバック。）

### D-005: SettingsView のモード切替セクション

`Capacitor.isNativePlatform()` が `true` の場合のみ表示するセクションを追加する。

**表示内容:**
- 現在のモード（`Preferences.get('mode')` の値に応じて「ローカルモード」または「サーバモード」を表示）
- 切替ボタン（「サーバモードへ切り替える」または「ローカルモードへ切り替える」）

**切替フロー:**
1. ボタンタップ → `window.confirm()` または React の確認ダイアログで「現在のモードのデータが初期化されます。よろしいですか？」を表示
2. キャンセル → 何もしない
3. 確認 → 以下を順に実行:
   - ローカル → サーバ切替: `LocalDB.dropAllTables()` → `Preferences.remove('serverUrl')` → `Preferences.remove('authToken')` → `Preferences.set('mode', 'server')` → `/setup` に遷移
   - サーバ → ローカル切替: `Preferences.remove('serverUrl')` → `Preferences.remove('authToken')` → `LocalDB.dropAllTables()` → `LocalDB.initDb()` → `Preferences.set('mode', 'local')` → `/today` に遷移

### D-006: LocalResetUsecase

`web/src/usecases/local-reset-usecase.ts` として実装する。

**依存:**
- `LocalSettingsRepository`（境界時刻・タイムゾーンの取得）
- `LocalTaskRepository`（タスクの読み取り・更新）
- `counter` テーブルへの直接アクセス（または `LocalTaskRepository` に `resetCounter()` メソッドを追加）

**アルゴリズム:**

```
runIfNeeded(now: Date):
  1. settings から dayBoundaryTime（"HH:mm"）と dayBoundaryTimezone（IANA）を取得
  2. counter から lastResetExecutedAt を取得
  3. 「前回の境界時刻」を計算: now から dayBoundaryTime 以前の最新の境界時刻
  4. lastResetExecutedAt >= 「前回の境界時刻」 の場合は return（冪等性チェック）
  5. 以下を 1 トランザクションで実行:
     a. tasks WHERE dueDate = 'today' AND trashedAt IS NULL AND origin = 'routine'
        → SET trashedAt = now.toISOString(), trashedReason = 'deleted'
     b. tasks WHERE dueDate = 'today' AND trashedAt IS NULL AND origin = 'manual'
        → SET dueDate = 'tomorrow'
     c. counter SET completedCount = 0, lastResetExecutedAt = 「前回の境界時刻」.toISOString()
     d. （ゴミ箱清算）tasks WHERE trashedAt IS NOT NULL AND trashedAt < 「前回の境界時刻」.toISOString()
        → DELETE
```

**冪等性の保証:** ステップ 4 のチェックにより二重実行を防ぐ。`lastResetExecutedAt` は境界時刻（ユーザー設定時刻を基準とした切り捨て値）を使い、実行時刻（`now`）は使わない。

### D-007: テスト方針

`@capacitor-community/sqlite` は jsdom 環境では動作しない。
各 Local Repository のテストは以下の構造でモックする。

```typescript
// vi.mock('@capacitor-community/sqlite', ...)
// MockDB: SQLiteDBConnection の最小モック実装
// テストケースで MockDB に事前データを仕込み、Repository メソッドの結果を検証する
```

`LocalResetUsecase` のテストは `MockDB` を使い、境界時刻・タイムゾーン設定・`lastResetExecutedAt` の各パターンを網羅する。

## 重要な決定

- **Local Repository はインターフェースを完全に満たす。** `main.tsx` のインスタンス構築部分の if 分岐のみを変更し、UI 層やアプリケーション層は Local/Http 実装の差異を知らない（module-boundaries.md §5.3 準拠）。
- **`@capacitor-community/sqlite` のバージョン管理。** `@capacitor/core` v6 と互換のある版を `npm install` し、`package.json` にバージョンを固定する。Capacitor v8 系が既にインストールされている場合は互換性を確認する。
- **モード切替は「初期化」と定義する。** ADR-0009 の決定を忠実に実装する。切替後の新モードは空（データなし）から始まる。
- **リセット処理は main.tsx の初期化フロー内で同期的（await）に実行する。** アプリのレンダリング前にリセットを完了させることで、UI が古いデータを表示することを防ぐ。
- **ゴミ箱清算の対象は「前回の境界時刻より前に trashedAt が設定されたアイテム」とする。** 「当日のゴミ箱アイテム」は翌日以降のリセット時まで残る。

## リスク / 代替案

- **`@capacitor-community/sqlite` と Capacitor v6 の互換性**: インストール時に peer dependency の警告が出る可能性がある。互換性が確認できない場合は `@capacitor-community/sqlite@latest` を先に調査し、必要なら代替（`capacitor-sqlite`）を検討する。
- **既存テストの破損リスク**: `main.tsx` の変更は既存テストに影響を与えないよう、Capacitor 関連の呼び出しを `try/catch` でラップし、jsdom 環境では常にフォールバックが動くようにする（BL-019 と同方針）。
- **`window.confirm()` の代替**: Capacitor Android では `window.confirm()` がブロッキングダイアログとして動作しない可能性がある。implementer は React コンポーネントによる確認ダイアログ UI を使うことを検討する。

## テスト方針

> 全体方針は `docs/developer/quality/test-catalog.md`。

- `LocalTaskRepository`・`LocalProjectRepository`・`LocalRoutineRepository`・`LocalTrashRepository`・`LocalSettingsRepository` の各テスト: `@capacitor-community/sqlite` を `vi.mock` でモックし、CRUD の動作・楽観ロック検証・today() のレスポンス構造を単体テストする。
- `LocalResetUsecase` のテスト: 冪等性・ルーティン由来タスクのゴミ箱化・手動タスクの繰越・Counter リセット・ゴミ箱清算の各シナリオをモック DB で検証する。
- `main.tsx` のプラットフォーム分岐テスト: `mode = 'local'` を返すモックで Local Repository が注入されること、`mode = 'server'` で Http Repository が注入されることを確認する。
- 既存テストの green 確認: `npm test -w web` で全テストが green であることを確認する（NFR-LOC-001）。
