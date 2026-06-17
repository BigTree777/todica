# 仕様: Android ローカル DB マイグレーション版管理機構

- 状態: 確定
- 関連: [`../../planning/backlog.md`](../../planning/backlog.md) の BL-117
- 関連ポリシー: [`../../architecture/database/migration-policy.md`](../../architecture/database/migration-policy.md) §2 §4 / [`../../architecture/database/overview.md`](../../architecture/database/overview.md) §8.2

## 背景 / 課題

[`migration-policy.md`](../../architecture/database/migration-policy.md) §4 は次を規定する。

- 破壊的変更（カラム削除・型変更）はバージョンを進めた上で、既存データを新スキーマへ移行する処理を必ず書く。
- 後方互換: Android ローカル側は古いバージョンのアプリで作られたデータを、新しいバージョンのアプリで開けるようにする（順方向の移行のみ。逆方向はサポートしない）。

しかし現状の [`web/src/repositories/local-db.ts`](../../../../web/src/repositories/local-db.ts) は、`getDb()` 内で `CREATE TABLE IF NOT EXISTS` を 6 テーブルぶん冪等実行し、シングルトンレコードを `INSERT OR IGNORE` するのみである。

- スキーマバージョンを追跡する仕組みが無い。
- 「現在のバージョン → 目標バージョン」の差分マイグレーションを順に流す仕組みが無い。
- このため、カラム追加 / 型変更 / NOT NULL 制約追加が必要になった瞬間に、既存 Android ユーザの端末内データをどう新スキーマへ移行するかの手段が存在しない。

直近では BL-120（Routine の soft delete 化）が `routines.trashed_at` の追加を必要とし、本機構に依存する。

## ゴール / 非ゴール

- ゴール:
  - Android ローカル DB（`@capacitor-community/sqlite` 経由）に、適用済みスキーマバージョンを記録する `__local_migrations` テーブルを新設する。
  - アプリ起動時（`getDb()` 内）に「現在の適用済みバージョン → 定義済みの最新バージョン」の差分マイグレーションを、バージョン昇順で 1 回ずつ実行する仕組み（migration runner）を導入する。
  - マイグレーション定義を `web/src/repositories/local-migrations/` 配下に「1 ファイル = 1 バージョン」で配置する。各ファイルは `up(db: LocalDb): Promise<void>` を export する。
  - 既存の `CREATE TABLE IF NOT EXISTS`（初期スキーマ）を v001 として吸収する。
  - 既存ユーザ（`__local_migrations` 不在、かつ旧 `CREATE TABLE` 済みの端末）が、起動時にデータを失わずに最新バージョンへ整合する。
  - migration runner / 既存スキーマ移行 / 連続適用がテストで担保される。
- 非ゴール:
  - `drizzle-kit` の生成 SQL を流用しない（server とは独立に管理する。`overview.md` §8.2 の方針）。
  - down マイグレーション（rollback）はサポートしない（`migration-policy.md` §2 のロールバック非対応に従う）。
  - server / domain / API の変更。本 BL は `web/` 内に閉じる。
  - v002（`routines.trashed_at` 追加）の本実装は BL-120 の範囲。本 BL は機構と、機構が正しく連続適用することを示すテストのみを担う。
  - サーバ ↔ ローカルのデータ移送、バックアップ / エクスポート（`overview.md` §7）。

## 用語

- バージョン: 整数。`1` を初期スキーマとする（`migration-policy.md` §1 の「整数で持つ」に従う）。
- migration runner: 起動時に未適用マイグレーションを順に実行する処理。
- マイグレーション定義: `up(db): Promise<void>` を export する 1 ファイル。
- v0 ユーザ: `__local_migrations` テーブルが存在しない端末（本機構導入前のユーザ、または完全な新規ユーザ）。

## 要件

- 機能要件:
  - FR-MIG-001: `getDb()` は DB 接続確立後、テーブル DDL を直書きで流すのではなく migration runner を 1 回呼び出す。
  - FR-MIG-002: migration runner は `__local_migrations` テーブル（少なくとも `version INTEGER PRIMARY KEY NOT NULL`、`applied_at TEXT NOT NULL`）を冪等に用意する。
  - FR-MIG-003: migration runner は適用済みの最大バージョンを `__local_migrations` から読み取り、それより大きいバージョンの定義のみを、バージョン昇順で `up(db)` 実行する。
  - FR-MIG-004: `up(db)` が成功するたびに、そのバージョンを `__local_migrations` に記録する。
  - FR-MIG-005: マイグレーション定義は `web/src/repositories/local-migrations/` 配下に `vNNN-<desc>.ts` 命名で 1 ファイル = 1 バージョン配置する。runner が参照する定義一覧は単一の登録ポイント（index）に集約する。
  - FR-MIG-006: v001 は現状の 6 テーブル（`tasks` / `projects` / `routines` / `counter` / `settings` / `focus_selection`）の `CREATE TABLE IF NOT EXISTS` と、シングルトンレコードの `INSERT OR IGNORE`（`counter` / `settings` / `focus_selection`）を内包する。v001 適用後のスキーマは現行 `local-db.ts` と等価でなければならない。
  - FR-MIG-007: 既に最新バージョンまで適用済みの端末で再起動した場合、いずれの `up(db)` も再実行されない（冪等）。
  - FR-MIG-008: down / rollback の API・経路を提供しない。
  - FR-MIG-009（v0 ユーザの扱い）: `__local_migrations` 不在の端末では現在バージョンを 0 とみなし、runner は v001 から登録一覧を昇順に実行する（UD-1 案A 確定）。v001 の `up(db)` は冪等（`CREATE TABLE IF NOT EXISTS` + `INSERT OR IGNORE`）であるため、旧スキーマ済み端末で再実行してもデータを失わず version=1 を記録できる。runner は「不在検出時に記録だけしてスキップする」ような特別分岐を持たない。
  - FR-MIG-010: runner は本番のマイグレーション定義一覧を注入可能にする（`runMigrations(db, migrations?)`。既定引数が本番一覧）。本番一覧には死蔵の v002 を置かず、v002 はテストでダミー定義として注入する（UD-2 案X 確定）。v002（`routines.trashed_at` 追加）の本実装は BL-120 の責務。
  - FR-MIG-011: マイグレーション定義の signature は `up(db: LocalDb): Promise<void>`、登録形は `{ version: number; name: string; up: (db: LocalDb) => Promise<void> }`（UD-3 確定）。`name` は `vNNN-<desc>` 形式。
- 非機能要件:
  - NFR-MIG-001: マイグレーション実行は jsdom + `@capacitor-community/sqlite` モック環境でテスト可能であること（既存 local-* テストと同じモック方針）。
  - NFR-MIG-002: あるバージョンの `up(db)` が失敗した場合、そのバージョンを適用済みとして記録しない（次回起動で再試行できる）。トランザクション境界は「1 バージョン = 1 トランザクション」（UD-3 案T1: begin → up → version 記録 → commit、失敗時 rollback）を第一候補とする。`@capacitor-community/sqlite` で DDL を含むトランザクションが機能しない場合に限り、案T2（`up()` 内完結 + runner は version 記録のみ）へフォールバックしてよい。いずれの場合も「up 成功なら version 記録、up 失敗なら未記録」を満たす。
  - NFR-MIG-003: runner は `local-db.ts` の `LocalDb` インターフェース（`query` / `run` / `execute` / `beginTransaction` / `commitTransaction` / `rollbackTransaction`）のみに依存し、Capacitor プラグインへ直接依存しない（テスト容易性）。

## 受け入れ基準

> 書き方は [`../../quality/acceptance-criteria.md`](../../quality/acceptance-criteria.md) に従う。

```
シナリオ: AC-MIG-001 新規ユーザの初回起動で v001 が適用される
  Given __local_migrations もアプリのテーブルも存在しない空の DB
  When  getDb()（= migration runner）を実行する
  Then  __local_migrations に version=1 が記録される
  And   tasks / projects / routines / counter / settings / focus_selection の 6 テーブルが存在する
  And   counter / settings / focus_selection に singleton レコードが 1 件ずつ存在する
```

```
シナリオ: AC-MIG-002 既存 v0 ユーザ（__local_migrations 不在 + 旧スキーマ済み）が整合する
  Given __local_migrations は存在しないが、旧 CREATE TABLE 済みで tasks 等にユーザデータが入っている DB
  When  getDb()（= migration runner）を実行する
  Then  既存のユーザデータが失われない
  And   __local_migrations に version=1 が記録される（v001 適用済みとみなされる）
```

```
シナリオ: AC-MIG-003 適用済み端末の再起動で up() が再実行されない
  Given __local_migrations に version=1 が記録済みの DB
  When  getDb()（= migration runner）を再度実行する
  Then  v001 の up() に相当する DDL/INSERT が再実行されない（または再実行されても副作用が無い）
  And   __local_migrations の version=1 のレコードが重複しない
```

```
シナリオ: AC-MIG-004 v002 を追加して起動すると v001→v002 が昇順で流れる
  Given v001 まで適用済みの DB と、登録一覧に追加された v002 のマイグレーション定義
  When  getDb()（= migration runner）を実行する
  Then  v002 の up() が実行される
  And   v001 の up() は再実行されない
  And   __local_migrations に version=2 が記録される
```

```
シナリオ: AC-MIG-005 複数バージョン未適用を 1 回の起動で昇順に連続適用する
  Given __local_migrations が空（version 記録なし）で、登録一覧に v001 と v002 が存在する DB
  When  getDb()（= migration runner）を実行する
  Then  v001 → v002 の順に up() が実行される
  And   __local_migrations に version=1 と version=2 の両方が記録される
```

```
シナリオ: AC-MIG-006 down/rollback の経路を持たない
  Given migration runner と登録済みマイグレーション定義
  When  実装の公開 API を確認する
  Then  down / rollback を実行する関数・経路が公開されていない
```

```
シナリオ: AC-MIG-007 あるバージョンの up() が失敗したらそのバージョンは未記録のまま残る
  Given v002 の up() が途中で例外を投げる DB
  When  getDb()（= migration runner）を実行する
  Then  例外が呼び出し元へ伝播する（または getDb が失敗する）
  And   __local_migrations に version=2 が記録されていない
```

## 決定事項（確定済み）

- UD-1（既存 v0 ユーザの v001 済み判定方法）→ 案A 採用: `__local_migrations` 不在を検出したら current=0 とみなし、v001 から登録一覧を昇順に常に実行する。v001 は冪等（`CREATE TABLE IF NOT EXISTS` + `INSERT OR IGNORE`）のため旧スキーマ済み端末でも安全。runner に「不在検出時は記録だけしてスキップ」の特別分岐を持たせない（FR-MIG-009）。
- UD-2（v002 のテスト用意）→ 案X 採用: 本番の登録一覧に死蔵 v002 を置かない。runner を「マイグレーション定義一覧を注入可能」な形にし、テストでダミー v002 を差し込んで AC-MIG-004 / 005 / 007 を検証する。v002 本実装は BL-120 の責務（本 BL では非ゴール）（FR-MIG-010）。
- UD-3（signature / 登録形 / トランザクション境界）→ 確定:
  - signature: `up(db: LocalDb): Promise<void>`。登録形: `{ version: number; name: string; up: (db: LocalDb) => Promise<void> }`（FR-MIG-011）。
  - トランザクション境界は案T1（1 バージョン = 1 トランザクション: `beginTransaction` → `up(db)` → `__local_migrations` 記録 → `commitTransaction`、失敗時 `rollbackTransaction`）を第一候補とする。`@capacitor-community/sqlite` で DDL を含むトランザクションが機能しない場合に限り案T2（`up()` 内完結 + runner は version 記録のみ）へフォールバックしてよい。可否は実装段階で実機 / テストで確認する（NFR-MIG-002、plan「リスク / 代替案」参照）。
- UD-4（`__local_migrations` のスキーマ詳細）→ 確定: `version`（PRIMARY KEY NOT NULL）と `applied_at`（NOT NULL）を必須とする。`name`（`vNNN-<desc>`）はデバッグ用に任意で持つ（NULL 許可）。

## 未決事項 / 確認待ち

- なし（UD-1〜UD-4 はすべて上記「決定事項」で確定済み）。
