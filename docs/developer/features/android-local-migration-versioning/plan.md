# 設計・実装計画: Android ローカル DB マイグレーション版管理機構

> [`spec.md`](spec.md) の要件を、どう実現するかに落とす。

## 方針概要

`web/src/repositories/local-db.ts` の `getDb()` から DDL 直書きを取り除き、`local-migrations/` 配下に「1 ファイル = 1 バージョン」で配置したマイグレーション定義群を、起動時に migration runner が `__local_migrations` の適用済みバージョンと突き合わせてバージョン昇順に実行する形へ置き換える。既存スキーマは v001 として吸収し、`up()` を冪等（`CREATE TABLE IF NOT EXISTS` + `INSERT OR IGNORE`）に保つことで v0 既存ユーザにも安全に再適用できる。

## 影響範囲

| 領域 | 変更内容 |
| --- | --- |
| API | 変更なし（非ゴール） |
| DB（server） | 変更なし（非ゴール。server は drizzle-kit のまま） |
| DB（Android local） | `__local_migrations` テーブル新設。v001 として既存 6 テーブルを移設 |
| モジュール | `web/src/repositories/local-db.ts` 起動シーケンス書き換え。`web/src/repositories/local-migrations/` 新設（runner / 登録 index / `v001-initial.ts`） |
| UI | 変更なし |
| ドキュメント | `overview.md` §8.2 の「`local-db.ts` 内で `CREATE TABLE IF NOT EXISTS` 冪等実行」記述を、本機構（`__local_migrations` + version runner）へ追従させる（実態追従。原文意図の「Android 側は独立管理 / drizzle-kit 非流用」は維持） |

## 設計詳細

### データモデル

`__local_migrations` テーブル（提案）:

| 列 | 型 | 制約 | 役割 |
| --- | --- | --- | --- |
| `version` | INTEGER | PRIMARY KEY NOT NULL | 適用済みスキーマバージョン |
| `applied_at` | TEXT | NOT NULL | 適用日時（ISO 8601） |
| `name` | TEXT | NULL 許可（任意） | `vNNN-<desc>`。デバッグ用（UD-4 確定: 任意保持） |

アプリ業務テーブルには `version` 列が既存だが（楽観ロック用、`overview.md` §9）、これはスキーマバージョンとは別概念。`__local_migrations.version` はスキーマ世代を指す。

### ファイル構成（UD-2 案X / UD-3 確定）

```
web/src/repositories/
  local-db.ts                      # getDb() が runner を呼ぶ。LocalDb interface は既存のまま
  local-migrations/
    index.ts                       # runMigrations(db, migrations?) と本番登録一覧 migrations をエクスポート
    v001-initial.ts                # 既存 6 テーブル DDL + singleton INSERT を up() に内包
```

- マイグレーション定義の型（提案）: `interface LocalMigration { version: number; name: string; up(db: LocalDb): Promise<void>; }`
- `index.ts` の `migrations: LocalMigration[]` を本番一覧とし、`runMigrations(db, migrations = defaultMigrations)` で注入可能にする（テストでダミー v002 を差し込めるよう、UD-2 案X に対応）。

### 処理フロー（migration runner / UD-1 案A・UD-3 案T1 確定）

1. `getDb()`: Capacitor 接続を `open()` まで確立する（現行どおり）。
2. `runMigrations(conn)` を呼ぶ。
3. runner: `CREATE TABLE IF NOT EXISTS __local_migrations (...)` を実行（FR-MIG-002）。
4. runner: `SELECT MAX(version) FROM __local_migrations` で現在バージョン `current`（レコードなしは 0）を取得。
5. runner: `migrations` を version 昇順にソートし、`version > current` のものを順に処理:
   - `beginTransaction()`
   - `up(db)` 実行
   - `INSERT INTO __local_migrations (version, applied_at, name) VALUES (...)`
   - `commitTransaction()`
   - 例外時 `rollbackTransaction()` して再 throw（FR-MIG-004 / NFR-MIG-002 / AC-MIG-007）
6. すべて成功後、`getDb()` は接続を返しキャッシュする（現行どおり）。

> v0 既存ユーザは current=0 となり v001 から流れる。v001 が冪等なので旧スキーマ済み端末でもデータを壊さず version=1 が記録される（AC-MIG-002）。

### 例外 / エラー処理

- `up()` 失敗時はトランザクションを abort し、当該バージョンを `__local_migrations` に記録しない。次回起動で再試行される。
- runner からの例外は `getDb()` の既存 try/catch 方針に合わせて扱う（現行は失敗時に固定メッセージで throw。マイグレーション失敗を握りつぶさず伝播させるか、メッセージを分けるかは実装時に確認 — AC-MIG-007 は「例外が伝播 or getDb 失敗」で許容）。

## 重要な決定

- 本機構は Android local 専用。server 側は引き続き drizzle-kit（`overview.md` §8.1）。両者は別系列の連番を持つことを許容する（`migration-policy.md` §1）。
- down / rollback は実装しない（`migration-policy.md` §2）。
- ADR 化の要否: 既存の `overview.md` §8.2・`migration-policy.md` の枠内に収まる実装詳細であり、新規 ADR は不要と判断する（`overview.md` §8.2 の実態追従ドキュメント更新で足りる）。大きな方式変更（例: drizzle-kit 流用へ転換）が生じた場合のみ ADR を起こす。

## リスク / 代替案

- リスク: `@capacitor-community/sqlite` で DDL を含むトランザクションが期待どおり機能しない可能性（UD-3 案T1 のフォールバック案T2 を用意済み）。runner は案T1（1 バージョン = 1 トランザクション: `beginTransaction` → `up(db)` → `__local_migrations` 記録 → `commitTransaction`、失敗時 `rollbackTransaction` + 再 throw）で実装する。`LocalDb` の begin/commit/rollback で T1 が成立するため、案T2 へのフォールバックは採らない。
- リスク: `v001-initial.ts` の DDL が現行 `local-db.ts` と 1 文字でもズレると既存ユーザのスキーマが分岐する。v001 は現行 DDL の逐語移植とし、テストで「v001 適用後に 6 テーブルと singleton が揃う」ことを担保する（FR-MIG-006）。
- 代替案: スキーマバージョンを SQLite の `PRAGMA user_version` で持つ案もあるが、`name` / `applied_at` の記録や複数行の適用履歴が残せないため、専用テーブル方式を採る。

## テスト方針

> 全体方針は [`../../quality/test-catalog.md`](../../quality/test-catalog.md)。

- 配置: `web/__tests__/`（バックログ指定）に migration runner のテストを追加。既存 local-* テストと同じ `@capacitor-community/sqlite` モック方針（NFR-MIG-001）。
- runner はモック `LocalDb` を受け取れるため、`__local_migrations` の状態と `up()` 呼び出し順を検証する。
- v002 はテスト内注入のダミー定義（UD-2 案X）で AC-MIG-004 / 005 / 007 を検証。
- 重点確認:
  - 新規 / 既存 v0 / 適用済み再起動の 3 経路（AC-MIG-001 / 002 / 003）。
  - 未適用が複数あるとき version 昇順に連続適用（AC-MIG-005）。
  - `up()` 失敗時に当該 version が未記録のまま（AC-MIG-007）。
  - down/rollback 経路が公開されていない（AC-MIG-006）。
- 回帰: 既存の local-task / project / routine / settings / trash リポジトリテストが緑のままであること（v001 移設でスキーマ等価が保たれる証左）。
