# 設計・実装計画: routine-soft-delete

> [`spec.md`](spec.md) の要件を, どう実現するかに落とす。
> BL-119 ([`../project-soft-delete/plan.md`](../project-soft-delete/plan.md)) を正典パターンとして踏襲する。

## 方針概要

Routine の DELETE を物理削除からゴミ箱化 (soft delete) に変える. `domain/routine` に `trashRoutine` /
`restoreRoutine` / `isTrashed` 純関数を追加し, `server/src/app/routine-usecases.ts` の `deleteRoutine` を
「配下タスクのデタッチ (routineId NULL 化) + Routine ゴミ箱化」へ書き換える. 既存の `/api/v1/trash` GET /
`/trash/{id}/restore` POST / `/trash` DELETE を Task/Project/Routine 共用に拡張する (新 endpoint は作らない).
web は trash-view に Routine セクションを追加し, 復元は `useTrashMutations` 経由で行う. server schema に
`routines.trashed_at` を drizzle migration (`0003_*`) で追加し, Android local schema にも BL-117 の
マイグレーション機構で `trashed_at` を v002 として追加する.

## 影響範囲

| 領域 | 変更内容 |
| --- | --- |
| API | `/api/v1/trash` GET レスポンスに `routines` 配列を追加 (3 配列構成)。`/trash/{id}/restore` POST が Routine にも対応 (200 で `{ routine }` を返す)。`/trash` DELETE が Routine も物理削除。`/routines/{id}` DELETE はパス・メソッド不変で挙動のみ soft delete 化。**新規 path/method なし** → openapi-drift の path 集合は不変。`openapi.yaml` は trash 系レスポンススキーマ・Routine schema・DELETE /routines の description を更新。 |
| DB (server) | `routines` テーブルに `trashed_at TEXT` を追加。`schema.ts` の `routines` 定義に `trashedAt` を追加し, drizzle-kit で `server/drizzle/0003_routines_trashed_at.sql` + meta を生成 (D-7)。起動時 `migrate()` が適用。 |
| DB (Android local) | `web/src/repositories/local-migrations/` に `v002-routines-trashed-at.ts` を追加し `migrations` 配列へ登録。`ALTER TABLE routines ADD COLUMN trashed_at TEXT` を冪等に実行 (D-5)。 |
| モジュール (domain) | `domain/src/routine/index.ts` に `Routine.trashedAt` フィールド追加 + `trashRoutine` / `restoreRoutine` / `isTrashed` 純関数追加。`createRoutine` / `updateRoutine` の初期値・引き継ぎを更新。`domain/src/index.ts` のバレル衝突回避 (project と同じ named re-export で `trashRoutine` / `restoreRoutine` / `isTrashed` を公開)。 |
| モジュール (server app) | `routine-usecases.ts deleteRoutine` を soft delete + デタッチ化。`trash-usecases.ts` の `listTrash` に Routine 同梱 / `restore` を task→project→routine 判別へ拡張 / `purgeTrash` に Routine 物理削除を追加。 |
| データ層 (server) | `RoutineRepository` に `listTrashed()` / `deleteAllTrashed()` を追加, `findById` がゴミ箱状態も返せること, `update` が trashedAt を取り回すこと, `list` が `trashed_at IS NULL` で絞ること。`DrizzleRoutineRepository` の `create`/`update`/`findById`/`list`/`delete` を trashedAt 対応に更新 + `listTrashed`/`deleteAllTrashed` 実装。`TaskRepository` に「routineId を NULL 化する」メソッド (`nullifyRoutineId(routineId)`) を追加 (現行 `deleteByRoutineId` の delete をやめ NULL 化に置換するか, 新メソッドを追加し usecase が新メソッドを使う)。 |
| データ層 (web/local) | `local-routine-repository` の `delete` を soft delete (UPDATE trashed_at) 化, `list` は `trashed_at IS NULL` 維持。`local-trash-repository` の `list(Routines)`/`restore`/`empty` を Routine 対応に拡張。HTTP repository (`trash-repository.ts` / `routine-repository.ts`) を新レスポンス形に追従。 |
| UI | `web/src/ui/trash-view/trash-view.tsx` に Routine セクション追加 (一覧 + 復元ボタン)。復元は `useTrashMutations` 経由 (Routine 復元時 invalidate に `["routines"]` を追加)。 |
| テスト | domain: `trashRoutine`/`restoreRoutine`/`isTrashed`。server: routine DELETE soft delete + デタッチ / trash list (Routine 同梱) / restore (Routine) / purge (Routine) / drizzle migration。web: trash-view Routine セクション, usecase invalidate, local-routine soft delete, local-trash Routine 対応, v002 migration runner。E2E: Routine 削除→復元の往復 (D-8)。既存 hard-delete 前提テストの追従 (R-1)。 |

## 設計詳細

### データモデル

- `domain/src/routine/index.ts` の `Routine` に追加する:
  - `trashedAt: string | null` (既定 null)。
  - `trashRoutine(current, clock)`: `trashedAt === null` のときのみ `trashedAt = clock.now()`,
    `updatedAt = now`, `version + 1`。既にゴミ箱状態なら no-op 等価で `{ ...current }` を返す (冪等。
    `trashProject` / `trashTask` と同型)。
  - `restoreRoutine(current, clock)`: `trashedAt = null`, `updatedAt = clock.now()`, `version + 1`。
  - `isTrashed(routine)`: `routine.trashedAt !== null`。
  - `createRoutine` の結果 routine に `trashedAt: null` を含める。`updateRoutine` は `...current` 展開で
    `trashedAt` を引き継ぐ (明示更新はしない)。
- `server/src/data/routine-repository.ts` の `Routine` 再エクスポート (= `@todica/domain/routine` の `Routine`)
  に `trashedAt` が含まれるようになるので, `RoutineRepository` インターフェースに `listTrashed()` /
  `deleteAllTrashed()` を追加する。
- server schema `routines` に `trashedAt: text("trashed_at")` を追加する (nullable, 既定なし = NULL)。
- 注意: 現状 `DrizzleRoutineRepository` の `rowToRoutine` / `routineToValues` は `trashedAt` を扱っていないため,
  insert (null) / update (trashedAt 書込) / findById / list (`trashed_at IS NULL` 絞り) 全体を補う必要がある。
- `TrashedRoutine = { id, name, trashedAt, version }` (D-2)。`daysOfWeek` / `defaultPriority` は射影に含めない。

### 処理フロー

1. **Routine 削除 (FR-1 / FR-2 / FR-3)** — `routine-usecases.ts deleteRoutine`:
   - `findById` → なければ notFound, version 不一致なら conflict (現行と同じ)。
   - ドメイン純関数 `trashRoutine(current, clock)` で次状態 (trashedAt=now, version+1) を算出する。
   - `deps.db` ありなら 1 トランザクションで:
     (a) 配下の未ゴミ箱タスクの `routineId` を NULL 更新 (デタッチ。`UPDATE tasks SET routine_id = NULL WHERE
         routine_id = {id} AND trashed_at IS NULL`),
     (b) `routines` を物理 delete する代わりに `trashed_at = now`, `version + 1`, `updated_at = now` で UPDATE。
   - `deps.db` なしのフォールバックは `taskRepository.nullifyRoutineId(id)` + `routineRepository.update(trashed)`。
   - **現行の `deps.taskRepository.deleteByRoutineId` (hard delete) は使わない**。デタッチ (NULL 化) に置き換える。
     `deleteByRoutineId` を残すか削除するかは実装時に判断 (他に呼び出しが無ければ削除可)。
   - 戻り値は `{ kind: "ok", value: trashed }`。router は 204 を返す (現行どおり)。
2. **ゴミ箱一覧 (FR-3)** — `trash-usecases.ts listTrash`:
   - 現行の `taskRepository.list({ trashed: "true" })` + `projectRepository.listTrashed()` に加え,
     `routineRepository.listTrashed()` を呼ぶ。
   - 戻り値を `{ tasks, projects, routines }` 形にし router が `c.json` する。`TrashedRoutine` へ射影する。
3. **復元 (FR-4)** — `trash-usecases.ts restore`:
   - 現行は task→project の順。これに routine を加える: task 非ヒット かつ project 非ヒット なら
     `routineRepository.findById(id)`:
     - なし → notFound (現行統一コード `TASK_NOT_FOUND` を維持 / id 不明として)。
     - `trashedAt === null` → invalid (`ROUTINE_NOT_IN_TRASH`)。
     - version 不一致 → conflict (`{ entity: "routine", routine }`)。
     - それ以外 → `restoreRoutine(current, clock)` → update → `{ kind: "ok", value: { entity: "routine", routine } }`。
   - `RestoreResult` discriminated union に `{ entity: "routine"; routine: Routine }` を追加する。
   - router は entity 種別に応じて `{ task }` / `{ project }` / `{ routine }` を 200 (conflict 時 412) で返す。
4. **ゴミ箱を空にする (FR-5)** — `trash-usecases.ts purgeTrash`:
   - 現行の task / project 物理削除に加え `routineRepository.deleteAllTrashed()` を呼ぶ。
5. **通常一覧の除外 (FR-8)** — `GET /routines`:
   - `routineRepository.list()` を `trashed_at IS NULL` で絞る (Drizzle 実装に `isNull` 条件を追加)。
     `findByDayOfWeek` も `trashed_at IS NULL` を満たす Routine のみ対象にする (ゴミ箱 Routine が日次リセットで
     タスク生成しないように。`findByDayOfWeek` は `list()` ベースなので list の絞りで自然に満たされる)。
6. **web trash-view (FR-7)**:
   - `useQuery(["trash", "routines"])` で `repository.listRoutines()` を呼び, Routine 一覧を別セクションで描画。
   - Routine 行に復元ボタン → `restoreMutation.mutateAsync({ id, ifMatch: routine.version })` (サーバ判別 D-3)。
   - `useTrashMutations` の `onSuccess` invalidate に `["routines"]` を追加 (Routine 復元時の一覧反映)。
7. **server migration (FR-9 / D-7)**:
   - `schema.ts` の `routines` に `trashedAt` を追加 → drizzle-kit generate で `0003_routines_trashed_at.sql`
     (`ALTER TABLE routines ADD COLUMN trashed_at text;`) + `meta/0003_snapshot.json` + `_journal` 更新を生成。
   - 起動時 `migrate(db, { migrationsFolder: server/drizzle })` が新規 migration のみ適用 (既存 DB も安全)。
8. **local migration (FR-10 / D-5)**:
   - `v002-routines-trashed-at.ts` を新規作成し `{ version: 2, name, up }` を定義。
   - up() は `routines` に `trashed_at TEXT` を冪等に追加する (PRAGMA table_info で列存在を確認してから
     `ALTER TABLE ... ADD COLUMN`, あるいは ADD COLUMN の重複エラーを握り潰す。冪等性 FR-MIG-009)。
   - `local-migrations/index.ts` の `migrations` 配列に `v002RoutinesTrashedAt` を追加。runner が version>current
     のみ昇順適用するため, v001 適用済み DB には v002 のみ追加適用される。

### 例外 / エラー処理

- 復元: 不存在 → 404, 通常状態の id → 400 (`ROUTINE_NOT_IN_TRASH` / 既存 `TASK_NOT_IN_TRASH` /
  `PROJECT_NOT_IN_TRASH`), version 不一致 → 412 (current を返す)。
- 削除: 不存在 → 404, version 不一致 → 412 (現行どおり)。
- HTTP repository は 412 時に `{ routine }` (または `{ task }` / `{ project }`) を読んで Conflict 系エラーへ昇格。
- local migration v002 の up() 失敗時は runner が rollback して例外を伝播する (BL-117 案T1 / AC-MIG-007)。

### 関連: routine と task の関係 (デタッチ方針の根拠)

- routine は「テンプレート」。日次リセット (`maybeRunDailyReset`) が, その日の曜日に該当する routine から
  `origin="routine"`, `routineId=R`, `dueDate="today"` の具体タスクを生成する (FR-031)。生成済みタスクは
  独立した `tasks` レコードであり, ユーザが当日着手・優先度変更・完了し得る。
- したがって Routine をゴミ箱に入れる操作で当日の具体タスクを巻き込み削除すると, ユーザの作業を失う。
  Project (BL-119) が配下タスクを残し `projectId` だけ NULL 化したのと同じ思想で, タスクを保全しつつ
  `routineId` のみ NULL 化する (D-4)。

## 重要な決定

- **D-1: trash 系エンドポイントを Task/Project/Routine 共用にする。新 endpoint を作らない。**
  - openapi-drift は path/method 集合一致のみ強制。既存 path 再利用で drift 0。
- **D-2: GET /trash のレスポンスを `{ tasks, projects, routines }` の 3 配列にする。**
  - `tasks` / `projects` キーは後方互換で維持。`TrashedRoutine = { id, name, trashedAt, version }`。
- **D-3: restore 対象判別は usecase 内で task→project→routine の順に `findById` する。**
  - 専用 type パラメータや別 path は導入しない。
- **D-4 (最重要): Routine 削除は配下の未ゴミ箱タスクを `routineId` NULL 化 (デタッチ) する。hard delete しない。**
  - 現行のカスケード hard delete をやめ, Project と同じカスケード NULL に揃える。ゴミ箱状態のタスクには触れない。
  - 復元時に再紐付けはしない (カスケード復元なし。routineId が失われ再同定不能)。
  - 代替案 (却下): (b) 配下タスクも soft delete し復元で戻す案 → trashedReason の扱いと復元時の再紐付けで
    routineId 保持が必要となり実装が重く, 仕様も曖昧。(c) 従来通り hard delete → FR-060 の精神に反しデータ喪失。
- **D-5: Android local は v002 を新設する (v001 へ吸収しない)。**
  - v001-initial.ts の routines DDL に `trashed_at` が無いことを現状調査で確認済み。v001 は改変せず v002 で
    `ALTER TABLE routines ADD COLUMN trashed_at TEXT` を冪等に追加する。
- **D-6: routines に `trashed_reason` を追加しない。** 削除理由は "deleted" 固定。
- **D-7: server drizzle migration は `0003_routines_trashed_at.sql` を drizzle-kit で生成する。**
  - 既存 `0000`〜`0002` の連番に続ける。`schema.ts` を真として generate。起動時 `migrate()` が適用。
- **D-8: E2E テストを 1 件追加する。** Routine 削除→`/trash` で復元→ Routine 一覧へ復帰の往復シナリオ。
- **D-9: ADR は新設しない。** BL-119 と同型の拡張。既存 architecture ドキュメントを実態に追従させる。
- **非ゴール: FR-062 のリセット自動清算の Routine 対象化は本 feature では扱わない。** 手動「空にする」
  (FR-5) のみ Routine 対応する。

## architecture ドキュメント追従

本 feature の実装と同時に, 下記 architecture ドキュメントを実態 (Routine soft delete + デタッチ NULL 固定 +
trash の 3 配列レスポンス) に追従させる。リリース前のため履歴表現を使わず timeless に記述する。

| ファイル | 追従内容 |
| --- | --- |
| `architecture/api/openapi.yaml` | (1) `GET /trash` の 200 レスポンスを `{ tasks, projects, routines }` の 3 配列構成に拡張。(2) `TrashedRoutine` (`{ id, name, trashedAt, version }`) スキーマ定義を追加。(3) `POST /trash/{id}/restore` の 200 を `{ task }` / `{ project }` / `{ routine }` の oneOf に拡張 (412 も同様)。(4) `DELETE /routines/{id}` の description を「ゴミ箱化 + 配下未ゴミ箱 Task の routineId を null 化 (デタッチ)」に修正。(5) `Routine` schema に `trashedAt: string \| null` を含める。drift テストは path/method のみだが `api/overview §8` の精神でレスポンススキーマも正しく保つ。 |
| `architecture/database/schema.md` | §Routine に `trashed_at` カラム (nullable, 通常状態は NULL) を追記。Routine 削除はゴミ箱化 (`trashedAt = now`) し配下未ゴミ箱 Task は `routineId` を NULL 化 (デタッチ) する旨を明記。Routine が trashed_reason を持たない旨を明記。 |
| `architecture/domain-model.md` | Routine の状態遷移 / 注記に soft delete (trashed / restored) とデタッチ NULL を追記。現行「ルーティン削除で配下タスクも削除」記述があればデタッチ NULL へ修正。 |
| `architecture/api/overview.md` | `/routines` 行 / `/trash` 行の説明を soft delete + デタッチ + 3 配列レスポンスの実態に合わせて確認・調整 (path 表現は妥当)。 |
| `adr/0010-api-design.md` | `/routines` 削除・`/trash` の記述に Routine 削除の hard delete / カスケード hard delete への言及があれば soft delete + デタッチ NULL の実態に追従。path/method 表は不変。 |
| `architecture/database/migrations.md` (存在すれば) / BL-117 関連ドキュメント | local migration に v002 が加わる旨を実態に追従 (履歴表現を使わず timeless に)。 |

## リスク / 代替案

- リスク: `DrizzleRoutineRepository` が現状 `trashed_at` を全く扱っていないため, soft delete を入れると
  create/update/findById/list 全体の trashedAt 取り回しを揃える必要がある。漏れると「削除しても消えない /
  ゴミ箱に出ない」不整合になる。→ 各メソッドの trashedAt 対応をテストで固定する。
- リスク (R-3, 確認済み): `local-routine-repository.ts` が参照する列名と v001-initial.ts の routines DDL が
  不整合である。repository は `generate_on_weekdays` / `last_generated_for_date` を読み書きするが, v001 DDL の
  routines は `days_of_week` / `default_priority` のみで, `generate_on_weekdays` は名前不一致, さらに
  `last_generated_for_date` 列は **DDL に存在しない**。現状テストはモック行 (任意キーを持つ JS オブジェクト) で
  通っているため検出されていない。
  - **本 feature のスコープ (R-3)**: v002 で `trashed_at` を追加する作業に付随して, この不整合が Routine soft
    delete の挙動 (= `local-routine-repository` の `delete` が `trashed_at` を書き, `list` が
    `trashed_at IS NULL` で絞れること) を妨げないかを実装/テストで確認する。**trashed_at の往復 (削除→ゴミ箱→
    復元) が local で成立することが本 BL の完了条件**であり, ここまでを保証する。
  - **本 feature のスコープ外**: 上記列名不整合 (`generate_on_weekdays` / `last_generated_for_date`) の全面修正は
    BL-120 のゴールに含めない。もし trashed_at の往復成立に支障が出るほど致命的 (例: insert/update が実 DB で
    例外を投げ soft delete が回らない) と判明した場合は, 自己判断で広げず **別 BL の起票を推奨**する形で本リスク欄に
    記録し, BL-120 は trashed_at 往復成立に必要な最小限の対処に留める。テストはモック行に依存せず, v002 適用後の
    実 DDL で `trashed_at` を扱えることを検証する。
- リスク: restore の判別順で, 万一 Task/Project/Routine が同一 id を持つと誤判別する。→ id は UUID v4 で
  クライアント採番のため衝突は実用上発生しない前提 (D-3)。
- リスク: 既存ユーザの local DB に v002 が二重適用される懸念。→ runner が version>current のみ適用し, up() を
  冪等にする (D-5) ことで二重適用を防ぐ。
- 代替案 (却下): 配下タスクを Routine と一緒に soft delete し復元で戻す案 / 従来通り hard delete する案
  (D-4 反対案)。データ保全と実装簡潔性から「デタッチ NULL」を採る。
- 代替案 (却下): v001-initial.ts に `trashed_at` を後付けして v002 を作らない案。v001 は確定済みで改変すると
  適用済みユーザとの整合が崩れるため却下 (D-5)。

## テスト方針

> 全体方針は [`../../quality/test-catalog.md`](../../quality/test-catalog.md)。

- domain 単体: `trashRoutine` / `restoreRoutine` / `isTrashed` の状態遷移・冪等性 (AC-11)。
- server 結合 (Hono app):
  - DELETE /routines が soft delete になる (findById で trashed_at != null, 物理削除されない) (AC-1)。
  - デタッチ NULL: 未ゴミ箱タスクの routineId NULL 化 (AC-2), ゴミ箱タスクは不変 (AC-3)。
  - GET /routines がゴミ箱 Routine を除外 (AC-4)。
  - GET /trash が `{ tasks, projects, routines }` で Routine を含む (AC-5)。
  - POST /trash/{id}/restore が Routine を復元し 200 `{ routine }` (AC-6), 再紐付けしない (AC-7),
    楽観ロック 412 (AC-9), 通常状態 id で 400 (AC-10)。
  - DELETE /trash が Routine も物理削除 (AC-8)。
  - drizzle migration: `0003` 適用後 routines に trashed_at があり既存レコードは NULL (AC-13)。
- web 単体: trash-view の Routine セクション描画 + 復元 (AC-12), `useTrashMutations` の Routine invalidate,
  local-routine-repository の soft delete (AC-15), local-trash-repository の Routine list/restore/empty,
  HTTP repository のレスポンス追従, v002 migration runner 適用・冪等 (AC-14)。
- 構造: openapi-drift が green のまま (AC-16)。openapi.yaml の Trash/Routine schema 更新。
- E2E (D-8): Routine 削除→`/trash` で復元→ Routine 一覧へ復帰の往復を 1 シナリオ追加。
- 既存テスト追従 (R-1): server/web の「Routine DELETE = findById null / 配下タスクも消える」前提を
  soft delete + デタッチ前提に修正。
