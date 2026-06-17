# タスク: Android ローカル DB マイグレーション版管理機構

> [`plan.md`](plan.md) を実行可能な単位に分解する。完了したらチェックを入れる。

## 前提（確定済み）

- [x] UD-1（v0 既存ユーザの判定）: 案A（v001 を常に流す / 冪等前提）で確定
- [x] UD-2（v002 のテスト用意）: 案X（runner に定義一覧を注入、テストでダミー v002）で確定
- [x] UD-3（signature / トランザクション境界）: `up(db: LocalDb): Promise<void>` + 登録形 `{ version, name, up }`、境界は案T1（実機 / テストで不可と判明した場合のみ案T2へフォールバック）で確定
- [x] UD-4（`__local_migrations` 列）: `version`（PK NOT NULL）/ `applied_at`（NOT NULL）必須 + `name`（任意・デバッグ用）で確定

## 実装

- [ ] `web/src/repositories/local-migrations/index.ts` を新設し、`LocalMigration` 型・本番登録一覧 `migrations`・`runMigrations(db, migrations?)` を定義（FR-MIG-002 / 003 / 004 / 005）
- [ ] `runMigrations` で `__local_migrations` テーブルを冪等作成し、`MAX(version)` 取得 → `version > current` を昇順に `up()` 実行 → version 記録（案T1 のトランザクション境界）
- [ ] `web/src/repositories/local-migrations/v001-initial.ts` を新設し、現行 `local-db.ts` の 6 テーブル DDL + singleton `INSERT OR IGNORE` を `up()` に逐語移植（FR-MIG-006）
- [ ] `web/src/repositories/local-db.ts` の `getDb()` を、DDL 直書きから `runMigrations(conn)` 呼び出しへ置き換え（FR-MIG-001）。`LocalDb` interface / `resetDbCache` は維持
- [ ] down/rollback の関数・経路を一切公開しない（FR-MIG-008 / AC-MIG-006）

## テスト

- [ ] 単体テスト（`web/__tests__/` に追加、`@capacitor-community/sqlite` モック）
  - [ ] AC-MIG-001: 新規 DB で v001 適用 → version=1 記録 + 6 テーブル + singleton
  - [ ] AC-MIG-002: `__local_migrations` 不在 + 旧スキーマ済み → データ保持 + version=1 記録
  - [ ] AC-MIG-003: version=1 記録済みで再実行 → up() 再実行されず重複記録なし
  - [ ] AC-MIG-004: v001 済み + ダミー v002 注入 → v002 のみ実行 + version=2 記録
  - [ ] AC-MIG-005: 空 + v001/v002 注入 → v001→v002 昇順実行 + 両 version 記録
  - [ ] AC-MIG-006: 公開 API に down/rollback が無いことを確認
  - [ ] AC-MIG-007: v002 の up() が throw → 例外伝播 + version=2 未記録
- [ ] 回帰: 既存 local-task / project / routine / settings / trash リポジトリテストが緑のまま

## ドキュメント

- [x] [`../../architecture/database/overview.md`](../../architecture/database/overview.md) §8.2 の「`local-db.ts` 内で `CREATE TABLE IF NOT EXISTS` を冪等実行」記述を、本機構（`__local_migrations` + version runner + `local-migrations/` 配下の定義）へ実態追従更新。§8.2 に「マイグレーション機構（version runner）」小節を追加し、§9 の「`local-db.ts` 内で独立管理」記述も `local-migrations/` 管理へ追従。原文意図（Android 側は独立管理 / `drizzle-kit` 生成 SQL 非流用）はそのまま維持
- [x] [`../../architecture/database/migration-policy.md`](../../architecture/database/migration-policy.md) §2 の「マイグレーションファイルを持たず `local-db.ts` 内で起動時に冪等実行」記述を、`local-migrations/` 配下の version runner 機構へ追従（rollback 非対応の原則は維持）
- [x] `schema.md` 更新要否を確認 → 不要と判断。`__local_migrations` は適用済みバージョン記録用の物理メタテーブルであり、論理エンティティ専用の `schema.md` には載せない。物理メタは `overview.md` §8.2「マイグレーション機構」で記述済み

## 仕上げ

- [ ] 受け入れ基準（spec.md AC-MIG-001〜007）を全て満たすことを確認
- [ ] vitest / typecheck / lint を確認
- [ ] レビュー依頼（auditor）
