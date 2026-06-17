# タスク: routine-soft-delete

> [`plan.md`](plan.md) を実行可能な単位に分解する。完了したらチェックを入れる。

## ドメイン

- [ ] T-01: `domain/src/routine/index.ts` の `Routine` に `trashedAt: string | null` を追加し,
      `createRoutine` の結果に `trashedAt: null` を含める / `updateRoutine` が `trashedAt` を引き継ぐ (AC-11)。
- [ ] T-02: `domain/src/routine/index.ts` に `trashRoutine(current, clock)` を追加する
      (冪等。既ゴミ箱状態は no-op 等価。`trashProject` と同型) (FR-6 / AC-11)。
- [ ] T-03: `domain/src/routine/index.ts` に `restoreRoutine(current, clock)` と `isTrashed(routine)` を
      追加する (FR-6 / AC-11)。
- [ ] T-04: `domain/src/index.ts` のバレル re-export に Routine 版 (`trashRoutine` / `restoreRoutine` /
      `isTrashed`) を project と同じ衝突回避方式で公開する。

## DB / マイグレーション

- [ ] T-05: `server/src/db/schema.ts` の `routines` に `trashedAt: text("trashed_at")` を追加する (FR-9)。
- [ ] T-06: drizzle-kit で `server/drizzle/0003_routines_trashed_at.sql` (`ALTER TABLE routines ADD COLUMN
      trashed_at text;`) + `meta/0003_snapshot.json` + `_journal` を生成する (D-7 / AC-13)。
- [ ] T-07: `web/src/repositories/local-migrations/v002-routines-trashed-at.ts` を新規作成する。
      up() で `routines` に `trashed_at TEXT` を冪等に追加 (列存在チェック or 重複エラー握り潰し / FR-MIG-009)。
      `{ version: 2, name: "v002-routines-trashed-at", up }` (FR-10 / AC-14)。
- [ ] T-08: `web/src/repositories/local-migrations/index.ts` の `migrations` 配列に `v002RoutinesTrashedAt`
      を登録する (FR-10)。

## サーバ (データ層)

- [ ] T-09: `server/src/data/routine-repository.ts` の `RoutineRepository` に `listTrashed()` /
      `deleteAllTrashed()` を追加する (FR-3 / FR-5)。
- [ ] T-10: `DrizzleRoutineRepository` の `rowToRoutine` / `routineToValues` / `create` / `update` /
      `findById` / `list` を `trashed_at` 対応にする (create は null, update は trashedAt 書込, list は
      `trashed_at IS NULL` で絞る) (FR-8)。
- [ ] T-11: `DrizzleRoutineRepository` に `listTrashed()` (trashed_at IS NOT NULL) と `deleteAllTrashed()`
      (trashed_at IS NOT NULL を物理削除) を実装する (FR-3 / FR-5)。
- [ ] T-12: `TaskRepository` / `DrizzleTaskRepository` に `nullifyRoutineId(routineId)` (未ゴミ箱タスクの
      routine_id を NULL 化) を追加する。現行 `deleteByRoutineId` (hard delete) は usecase から外す
      (他に呼び出しが無ければ削除) (FR-2 / D-4)。

## サーバ (app 層 / router)

- [ ] T-13: `routine-usecases.ts deleteRoutine` を soft delete + デタッチ化する。トランザクション内で
      配下未ゴミ箱タスクの routineId NULL 化 + `trashRoutine` による UPDATE。`deps.db` なしのフォールバックも
      対応 (FR-1 / FR-2 / AC-1 / AC-2 / AC-3)。
- [ ] T-14: `trash-usecases.ts listTrash` を `{ tasks, projects, routines }` を返す形に拡張する。
      `TrashedRoutine` 射影を追加 (FR-3 / AC-5)。
- [ ] T-15: `trash-usecases.ts` の `restore` を task→project→routine 判別に拡張する。`RestoreResult` に
      `{ entity: "routine"; routine }` を追加。`ROUTINE_NOT_IN_TRASH` / version 412 / 再紐付けしない
      (FR-4 / AC-6 / AC-7 / AC-9 / AC-10)。
- [ ] T-16: `trash-usecases.ts purgeTrash` に Routine の物理削除を追加する (FR-5 / AC-8)。
- [ ] T-17: `routers/trash.ts` の restore ハンドラを Routine 対応に拡張する
      (Routine なら `{ routine }` を 200 / 412 で返す) (§5.2 写像のみ維持)。
- [ ] T-18: `routers/routines.ts` の DELETE ハンドラは現状の写像 (204) で動くことを確認する
      (挙動は usecase 側で soft delete に変わる)。

## Web (データ層 / usecase / UI)

- [ ] T-19: `web/src/repositories/trash-repository.ts` (HTTP) を `{ tasks, projects, routines }` レスポンスと
      Routine 復元 (`{ routine }`) に追従させる。`TrashedRoutine` 型 + `listRoutines()` を追加する (FR-3 / FR-4)。
- [ ] T-20: `web/src/repositories/local-routine-repository.ts` の `delete` を soft delete (UPDATE trashed_at)
      にする。`list` は `trashed_at IS NULL` 維持。R-3 として, repository が参照する列名
      (`generate_on_weekdays` / `last_generated_for_date`) と v002 適用後の実 DDL の不整合が trashed_at の往復
      (削除→ゴミ箱→復元) を妨げないことを確認する。**列名不整合の全面修正は本 BL のゴール外** (致命的なら別 BL 起票を
      推奨し本タスクは trashed_at 往復成立に必要な最小対処に留める)。trashed_at の往復が local で成立することが
      完了条件 (FR-8 / AC-15)。
- [ ] T-21: `web/src/repositories/local-trash-repository.ts` に `listRoutines` を追加し, `restore` / `empty` を
      Routine 対応にする (routines テーブルの trashed_at を含める) (FR-3 / FR-4 / FR-5)。
- [ ] T-22: `web/src/usecases/trash-usecases.ts` の restore mutation の invalidate に `["routines"]` を追加し,
      Routine 復元時に Routine 一覧へ反映されるようにする (FR-7)。
- [ ] T-23: `web/src/ui/trash-view/trash-view.tsx` に Routine セクションを追加する (一覧 + 復元ボタン /
      Lucide `RotateCcw`)。復元は `useTrashMutations` 経由 (view から直接 useMutation しない) (FR-7 / AC-12)。

## ドキュメント (architecture 追従 / R-2)

> ADR は新設しない (plan.md「重要な決定」D-9)。下記は既存 architecture ドキュメントの実態追従。
> リリース前のため履歴表現を使わず timeless に記述する。

- [ ] T-24: `docs/developer/architecture/api/openapi.yaml` を更新する。
      (a) `GET /trash` 200 を `{ tasks, projects, routines }` の 3 配列構成に拡張。
      (b) `TrashedRoutine` (`{ id, name, trashedAt, version }`) スキーマを追加。
      (c) `POST /trash/{id}/restore` 200 / 412 を `{ task }` / `{ project }` / `{ routine }` の oneOf に拡張。
      (d) `DELETE /routines/{id}` の description をゴミ箱化 + デタッチ NULL 固定に修正。
      (e) `Routine` schema に `trashedAt` を含める。
      `__tests__/structure/openapi-drift.test.ts` を green に保つ (path/method 不変) (AC-16)。
- [ ] T-25: `docs/developer/architecture/database/schema.md` §Routine に `trashed_at` と削除のデタッチ NULL,
      trashed_reason を持たない旨を追記する。
- [ ] T-26: `docs/developer/architecture/domain-model.md` / `architecture/api/overview.md` /
      `adr/0010-api-design.md` / (存在すれば BL-117 関連の migration ドキュメント) を, Routine soft delete +
      デタッチ NULL + 3 配列 trash レスポンス + local v002 の実態に追従させる (path/method 表は不変)。

## テスト

- [ ] T-27: domain 単体テスト (`trashRoutine` / `restoreRoutine` / `isTrashed`) (AC-11)。
- [ ] T-28: server 結合テスト: DELETE /routines soft delete + デタッチ NULL (未ゴミ箱のみ) + ゴミ箱タスク不変 +
      通常一覧除外 (AC-1〜AC-4)。
- [ ] T-29: server 結合テスト: GET /trash (Routine 同梱) / restore (Routine 復元・楽観ロック・非ゴミ箱 400・
      再紐付けなし) / DELETE /trash (Routine 物理削除) (AC-5〜AC-10)。
- [ ] T-30: server: drizzle migration `0003` 適用後 routines に trashed_at があり既存レコード NULL (AC-13)。
- [ ] T-31: web 単体テスト: trash-view Routine セクション (AC-12), usecase invalidate,
      local-routine soft delete (AC-15), local-trash Routine list/restore/empty, HTTP repository の追従。
- [ ] T-32: web: v002 migration runner の適用 (version=2 記録) と冪等性 (再適用で破壊しない) (AC-14)。
- [ ] T-33: 既存 hard-delete 前提テストの追従修正 (R-1。server / web で「Routine 削除 = findById null /
      配下タスクも消える」前提の箇所をデタッチ + soft delete 前提に修正)。
- [ ] T-34: E2E: Routine 削除→`/trash` で復元→ Routine 一覧へ復帰の往復シナリオを追加 (D-8)。

## 仕上げ

- [ ] T-35: 受け入れ基準 (spec.md AC-1〜AC-16) を全て満たすことを確認する。
- [ ] T-36: `npx vitest run` (リポジトリルート) と E2E が green であることを確認する。
- [ ] T-37: レビュー依頼 (auditor)。
