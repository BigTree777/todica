# 仕様: routine-soft-delete (Routine の soft delete + ゴミ箱経由復元)

- 状態: 確定
- 関連: [`../../planning/backlog.md`](../../planning/backlog.md) の BL-120
- 要件: [`../../requirements.md`](../../requirements.md) FR-060 / FR-061
- 先行: [`../project-soft-delete/spec.md`](../project-soft-delete/spec.md) (BL-119 / 同型パターンの正典)

## 背景 / 課題

`requirements.md` FR-060「すべての削除・完了はゴミ箱を経由する」/ FR-061「ゴミ箱から復元できる」は
削除・完了の全経路をゴミ箱経由と定め, FR-060 の「すべて」は Routine も含む.

しかし現実装は Routine をゴミ箱経由にしていない. `server/src/app/routine-usecases.ts` の `deleteRoutine`
は Routine を物理削除 (hard delete) し, さらに配下の未ゴミ箱タスク (`routineId = {id}` かつ
`trashedAt IS NULL`) も物理削除 (カスケード hard delete) する. Routine は `/trash` ビューに表示されず,
復元手段が無い. このため FR-060 / FR-061 に違反している.

加えて, server schema (`server/src/db/schema.ts`) の `routines` テーブルには `trashed_at` カラム自体が
存在しない. Project (BL-119) では `projects.trashed_at` が既存だったが, Routine ではカラム追加 (server の
drizzle migration + Android local migration) から必要になる点が BL-119 と決定的に異なる.

## ゴール / 非ゴール

- ゴール:
  - Routine の DELETE をゴミ箱化 (soft delete) に変更する. `trashed_at = now` をセットし version を +1 する.
  - Routine をゴミ箱経由で復元できるようにする.
  - `/trash` ビューに Routine セクションを追加し, ゴミ箱内 Routine の一覧表示と復元 UI を提供する.
  - 既存の `/api/v1/trash` GET / `/trash/{id}/restore` POST / `/trash` DELETE ハンドラを Routine にも対応させる.
  - server schema に `routines.trashed_at` カラムを追加する (drizzle migration).
  - Android local schema に `routines.trashed_at` カラムを追加する (BL-117 のマイグレーション機構 v002).
  - `domain/routine` に純関数 `trashRoutine` / `restoreRoutine` / `isTrashed` を追加する.
- 非ゴール:
  - Project soft delete (BL-119 で対応済み).
  - Task 側の削除・完了・復元の挙動変更 (無改修).
  - Routine の「実施履歴」「ストリーク」等の概念追加 (FR-034 OOS-008).
  - ゴミ箱内 Routine の自動完全削除 (FR-062 のリセット清算) の対象化. 既存清算機構を Routine へ広げるかは
    別 backlog で扱う (本書「非ゴール (確定)」参照). 手動「空にする」(FR-5) のみ Routine 対応する.
  - Routine 復元時に, 削除時にデタッチ (routineId NULL 化) した配下タスクを再紐付けすること
    (D-4 / 「確定事項」参照).

## 用語

- **ゴミ箱化 (trash)**: `trashed_at` に時刻をセットし, 通常の一覧から除外される論理削除状態にすること.
- **復元 (restore)**: `trashed_at` を NULL に戻し, 通常状態へ戻すこと.
- **デタッチ (カスケード NULL)**: Routine 削除時, 配下タスクを削除せず `routineId` を NULL にすること (D-4 採用).
- **ルーティンタスク**: 日次リセット時に Routine から生成された具体タスク (`origin = "routine"`, `routineId = R`).
  Routine 自体はテンプレートであり, 生成済みタスクは独立した `tasks` レコードである.

## 要件

### 機能要件

- FR-1: `DELETE /api/v1/routines/{id}` は Routine を物理削除せず, `trashed_at` をセットしてゴミ箱化する.
  - version を +1 し, `updated_at` を更新する.
  - 楽観ロック (If-Match) は現行と同じ. version 不一致は 412, 不存在は 404 を返す.
- FR-2: Routine 削除時, 配下の未ゴミ箱タスク (`routineId = {id}` かつ `trashedAt IS NULL`) の `routineId` を
  NULL 化する (デタッチ = カスケード NULL, D-4). タスク自体はゴミ箱化も削除もしない. 既にゴミ箱状態のタスク
  (完了済み等) には触れない.
- FR-3: `GET /api/v1/trash` は, ゴミ箱内のタスク・Project に加えてゴミ箱内の Routine も返す.
  - レスポンス形状は `{ tasks: [...], projects: [...], routines: [...] }` の 3 配列構成 (D-2) に従う.
- FR-4: `POST /api/v1/trash/{id}/restore` は, 対象 id がゴミ箱内 Routine の場合に Routine を復元する.
  - `trashed_at` を NULL に戻し, version +1, `updated_at` 更新.
  - 対象が Task / Project の場合の挙動は現行のまま.
  - 復元経路は `/trash/{id}/restore` の 1 本に一本化されたまま (per-entity restore path を新設しない).
- FR-5: `DELETE /api/v1/trash` (ゴミ箱を空にする) は, ゴミ箱内 Task / Project に加えてゴミ箱内 Routine も
  物理削除する.
- FR-6: `domain/routine` に純関数 `trashRoutine` / `restoreRoutine` / `isTrashed` を追加する.
  `domain/project` の `trashProject` / `restoreProject` / `isTrashed` と同型のシグネチャ・冪等性を持つ.
  Routine は `trashedReason` を持たない (D-6).
- FR-7: `/trash` ビューに Routine セクションを追加し, ゴミ箱内 Routine を一覧し, 各行に復元 UI を表示する.
  復元 mutation は web の usecase 層 (`useTrashMutations`) 経由とし, view から直接 `useMutation` しない.
- FR-8: ゴミ箱化された Routine は通常の Routine 一覧 (`GET /api/v1/routines`) から除外される.
- FR-9: server schema (`routines` テーブル) に `trashed_at` カラムを追加する. 既存 routine レコードの
  `trashed_at` は NULL 初期化される (drizzle migration の `ADD COLUMN` の既定で NULL).
- FR-10: Android local schema (`routines` テーブル) に `trashed_at` カラムを追加する. BL-117 の
  マイグレーション機構を用い, v002 として冪等に追加する (FR-MIG 系に準拠). 既存ローカル routine レコードの
  `trashed_at` は NULL 初期化される.

### 非機能要件

- 整合性: Routine 削除のデタッチ (カスケード NULL) とゴミ箱化は同一トランザクション境界で実行し,
  アトミック性を保つ (現行 `deleteRoutine` の `deps.db.transaction` 方針を維持).
- 層構造の維持: soft delete / restore のロジックは `server/src/app/*-usecases.ts` に置き, router は写像のみ
  (§5.2). web の trash-view の復元 mutation は usecase (`useTrashMutations`) に集約し view から直接
  `useMutation` しない (§5.3).
- ドキュメント整合: trash 系エンドポイントのレスポンススキーマを変更する場合は `openapi.yaml` を同時更新し,
  `__tests__/structure/openapi-drift.test.ts` (path/method 集合一致) を green に保つ. 新規 path/method は
  追加しない (D-1) ため path 集合は不変.
- 冪等性: ゴミ箱化・復元の純関数は冪等とする (既にゴミ箱状態の Routine の trash は no-op 等価で返す).
  local migration v002 の up() は冪等とする (既に `trashed_at` を持つ DB に再適用しても破壊しない / FR-MIG-009).

## 受け入れ基準

> 書き方は [`../../quality/acceptance-criteria.md`](../../quality/acceptance-criteria.md) に従う。

```
AC-1: Routine 削除はゴミ箱化される (物理削除されない)
  Given 通常状態の Routine R (version=1) が存在する
  When  DELETE /api/v1/routines/{R.id} を If-Match: 1 で実行する
  Then  HTTP 204 が返る
  And   R は物理削除されず trashed_at != null になる
  And   R の version は 2 に増える
```

```
AC-2: Routine 削除のデタッチ (カスケード NULL) が行われる
  Given Routine R と, R に紐付く未ゴミ箱のルーティンタスク T (routineId = R.id, trashedAt = null) が存在する
  When  R を削除する
  Then  T は削除されず残る
  And   T.routineId が null になる
  And   T.origin は変化しない
```

```
AC-3: Routine 削除はゴミ箱状態のタスクに触れない
  Given Routine R と, R に紐付く既にゴミ箱状態のタスク T (routineId = R.id, trashedAt != null) が存在する
  When  R を削除する
  Then  T の routineId は変化しない (NULL 化されない)
  And   T は引き続きゴミ箱状態のまま残る
```

```
AC-4: ゴミ箱化された Routine は通常一覧から除外される
  Given ゴミ箱化された Routine R が存在する
  When  GET /api/v1/routines を実行する
  Then  レスポンスの routines に R は含まれない
```

```
AC-5: ゴミ箱一覧に Routine が含まれる
  Given ゴミ箱内のタスク T, ゴミ箱内の Project P, ゴミ箱内の Routine R が存在する
  When  GET /api/v1/trash を実行する
  Then  レスポンスは T を含む tasks 配列, P を含む projects 配列, R を含む routines 配列を返す
```

```
AC-6: ゴミ箱の Routine を復元できる
  Given ゴミ箱内の Routine R (trashed_at != null, version=2) が存在する
  When  POST /api/v1/trash/{R.id}/restore を If-Match: 2 で実行する
  Then  HTTP 200 が返り R が返却される
  And   R の trashed_at が null になる
  And   R の version が 3 に増える
  And   GET /api/v1/routines に R が再び含まれる
```

```
AC-7: Routine 復元はデタッチしたタスクを再紐付けしない
  Given Routine R を削除した結果 routineId が NULL 化されたタスク T が存在する
  When  ゴミ箱から R を復元する
  Then  R は通常状態に戻る
  And   T.routineId は NULL のまま (元の R.id には戻らない)
```

```
AC-8: ゴミ箱を空にすると Routine も物理削除される
  Given ゴミ箱内のタスク T, ゴミ箱内の Project P, ゴミ箱内の Routine R が存在する
  When  DELETE /api/v1/trash を実行する
  Then  T と P と R がいずれも物理削除される
  And   GET /api/v1/trash の tasks / projects / routines 配列がいずれも空になる
```

```
AC-9: 復元の楽観ロック (Routine)
  Given ゴミ箱内の Routine R (version=2) が存在する
  When  POST /api/v1/trash/{R.id}/restore を If-Match: 1 (古い version) で実行する
  Then  HTTP 412 が返り 最新の R が返却される
```

```
AC-10: 通常状態の id を復元しようとするとエラー
  Given 通常状態 (trashed_at = null) の Routine R が存在する
  When  POST /api/v1/trash/{R.id}/restore を実行する
  Then  HTTP 400 が返る (ROUTINE_NOT_IN_TRASH 相当)
```

```
AC-11: trashRoutine / restoreRoutine / isTrashed 純関数の挙動
  Given 通常状態の Routine R (version=1)
  When  trashRoutine(R, clock) を呼ぶ
  Then  trashedAt が clock.now() にセットされ version=2 になる
  And   既にゴミ箱状態の Routine に trashRoutine を再適用しても trashedAt と version は変化しない (no-op 等価)
  And   restoreRoutine(ゴミ箱状態の Routine, clock) は trashedAt を null に戻し version を +1 する
  And   isTrashed(R) は trashedAt != null のとき true を返す
```

```
AC-12: /trash ビューに Routine セクションが表示され復元できる
  Given ゴミ箱に Routine R が 1 件存在する
  When  /trash ビューを開く
  Then  Routine セクションに R の名前が表示される
  And   R の行の復元操作を行うと R がゴミ箱から消え 通常の Routine 一覧に戻る
```

```
AC-13: server schema に trashed_at が追加され既存レコードは NULL 初期化される
  Given trashed_at カラムを持たない既存の routines レコード R が存在する DB
  When  server を起動し drizzle migration を適用する
  Then  routines テーブルに trashed_at カラムが追加される
  And   R.trashed_at は NULL である (通常状態として扱われる)
```

```
AC-14: Android local schema に v002 で trashed_at が追加される
  Given trashed_at カラムを持たない local routines テーブルを持つ DB
  When  runMigrations を実行する
  Then  v002 が適用され routines テーブルに trashed_at カラムが追加される
  And   __local_migrations に version=2 が記録される
  And   既存 routine レコードの trashed_at は NULL である
  And   既に trashed_at を持つ DB に v002 を再適用しても破壊されない (冪等 / FR-MIG-009)
```

```
AC-15: ローカル (offline) でも Routine 削除がゴミ箱化される
  Given local モードで通常状態の Routine R が存在する
  When  R を削除する
  Then  R は local DB から物理削除されず trashed_at != null になる
  And   通常の Routine 一覧 (trashed_at IS NULL) から除外される
  And   /trash の Routine セクションに R が表示される
```

```
AC-16: trash 系エンドポイントのドキュメント整合
  Given trash 系エンドポイントのレスポンススキーマを変更した
  When  openapi-drift テストおよび openapi.yaml を検証する
  Then  openapi.yaml と実装の (path, method) 集合が一致し drift テストが green である
```

## 確定事項

下記はすべて確定済み (D-1〜D-9 採用). 設計上の根拠は plan.md「重要な決定」を正典とする.

- **D-1: trash 系エンドポイントは Task/Project/Routine 共用.** 既存 `/api/v1/trash` (GET) /
  `/trash/{id}/restore` (POST) / `/trash` (DELETE) を 3 エンティティで共用し, 新 endpoint は設けない.
  openapi-drift は path/method 集合一致のみを強制するため, 既存 path 再利用で drift は発生しない.
- **D-2: trash list レスポンスは `{ tasks, projects, routines }` の 3 配列構成.**
  既存クライアントが読む `tasks` / `projects` キーを維持し `routines` キーを追加する (後方互換).
  `TrashedRoutine = { id, name, trashedAt, version }` 形 (Routine は trashedReason を持たない. D-6 参照.
  daysOfWeek / defaultPriority はゴミ箱表示に不要なので射影に含めない).
- **D-3: restore 対象判別は usecase 内で task→project→routine の順に `findById` する.**
  task ヒットでタスク復元, 非ヒットなら project, さらに非ヒットなら routine を `findById` し, ゴミ箱内なら
  routine 復元, どれにも該当しなければ 404. id は UUID で衝突しない前提. 判別用の専用 endpoint や type
  パラメータは導入しない (BL-119 D-3 と同型に拡張).
- **D-4 (最重要): Routine 削除は配下タスクをデタッチ (routineId NULL 化) する. 配下タスクは hard delete しない.**
  - 現行は配下の未ゴミ箱タスクを hard delete するが, soft delete 化に合わせて Project (BL-119) と同じ
    「カスケード NULL = デタッチ」方針へ揃える. 配下の未ゴミ箱タスク (`routineId = R AND trashedAt IS NULL`)
    の `routineId` を NULL 化し, タスク自体は通常状態のまま残す. `origin` は変更しない.
  - 根拠: ルーティンタスクは日次リセットで生成された独立した具体タスクであり, ユーザが当日着手済みの場合がある.
    Routine をゴミ箱に入れただけで, 当日のタスクが消えるのはデータ喪失リスクが高い. Project 削除時に配下タスクを
    残す (projectId NULL 化) のと同じ思想で, タスクを保全しつつ Routine とのリンクのみ切る.
  - 既にゴミ箱状態のタスク (完了済み = trashedReason="completed" 等) には触れない (現行 `deleteByRoutineId` が
    未ゴミ箱のみ対象であったのと整合. AC-3).
  - **復元時にデタッチしたタスクを再紐付けしない (カスケード復元なし).** 削除時点でタスク側の `routineId` が
    失われ, どのタスクが元 R に属したかを復元時に再同定する手段が無いため. FR-061 の「対象を元の状態に戻す」の
    「対象」はゴミ箱内 Routine 自身を指す.
  - 代替案 (却下): (b) 配下タスクも一緒に soft delete し復元時に戻す案 → タスクの trashedReason をどう持たせるか
    曖昧で, 復元時の再紐付けも routineId 保持が必要となり実装が重い. (c) 配下タスクを従来通り hard delete する案
    → ゴミ箱経由 (FR-060) の精神に反しデータ喪失が残る. いずれも採らない. 詳細は plan.md「重要な決定」.
- **D-5: Android local schema 変更が必要. v002 を追加する (v001 への吸収はしない).**
  - 現状調査の結果, local の v001-initial.ts (`web/src/repositories/local-migrations/v001-initial.ts`) の
    `routines` テーブル DDL には `trashed_at` カラムが無い (`days_of_week` / `default_priority` のみ).
    したがって「既に v001 で吸収済み」ではなく, **新規に追加が必要**である.
  - v001 は確定済み (既存ユーザに適用済みの可能性がある) ため改変せず, **v002 として `ALTER TABLE routines ADD
    COLUMN trashed_at TEXT` を追加する**. up() は冪等とし, 既に `trashed_at` がある DB への再適用でも壊れない
    実装にする (PRAGMA で列存在を確認してから ADD COLUMN するか, ADD COLUMN 失敗を握り潰す. 具体方式は plan.md
    D-5 を正典とする). BL-117 の `migrations` 配列に v002 を登録する.
  - 関連の現状問題 (R-3 参照): `local-routine-repository.ts` は v001 の DDL と整合しない列名を読み書きしている.
    v001 の routines DDL は `days_of_week` / `default_priority` のみだが, repository は `generate_on_weekdays`
    (名前不一致) / `last_generated_for_date` (DDL に列が存在しない) を参照する. テストはモック行で通っている.
    実機の local routines スキーマ実態と repository の整合は本 feature の v002 設計時に確認し, soft delete に
    必要な範囲 (`trashed_at` の追加と list の `trashed_at IS NULL` 絞り込み, delete の soft delete 化) を
    確実に成立させる. **列名不整合の全面修正は本 feature のゴールに含めず** (致命的なら別 BL 起票を推奨), trashed_at
    の往復 (削除→ゴミ箱→復元) が local で成立することを完了条件とする (R-3 / plan.md「リスク / 代替案」を正典).
- **D-6: routines テーブルに `trashed_reason` を追加しない.** Routine の削除理由は "deleted" 固定で
  Task の "completed" に相当する状態が無いため (Project D-6 と同じ). server / local いずれも追加しない.
- **D-7: server drizzle migration は連番の次番号 `0003_routines_trashed_at.sql` を追加する.**
  既存は `0000_initial.sql` / `0001_sessions.sql` / `0002_app_password.sql` の連番. drizzle-kit で
  schema.ts (`routines` に `trashedAt` 追加) から生成し, `ALTER TABLE routines ADD COLUMN trashed_at`
  相当の DDL を含む `0003_*.sql` と meta スナップショットを生成する. 起動時 `migrate()` で適用される
  (新規 migration のみ `__drizzle_migrations` で追跡され既存 DB にも安全に適用される / `server/src/main.ts`).
- **D-8: E2E テストを 1 件追加する.** Routine 削除→`/trash` で復元→ Routine 一覧に戻る往復シナリオを
  `e2e/routines.spec.ts` または `e2e/trash.spec.ts` に追加する (BL-119 D-7 と同型).
- **D-9: ADR は新設しない.** trash の複数エンティティ表現・カスケード非復元は BL-119 で本 feature spec/plan を
  記録媒体とする方針を確立済みで, Routine も同型の拡張に過ぎない. 代わりに既存 architecture ドキュメント
  (openapi.yaml / api/overview / database/schema / domain-model / ADR-0010) を実態に追従させる
  (plan.md「architecture ドキュメント追従」).

## 残作業 (実装フェーズで対応)

- **R-1: 既存の Routine hard-delete 前提テストの追従.** server / web の既存テストで「Routine 削除 = 物理削除
  (findById が null / 配下タスクも消える)」を前提にしているものを soft delete 前提 (findById が
  trashed_at != null を返す / 配下タスクは routineId NULL で残る) へ追従修正する. 特に routine 削除のカスケード
  hard delete を検証していたテスト (routine spec の「ルーティンを削除すると紐付くタスクも削除される」相当) を
  デタッチ方針へ修正する. 影響テストの洗い出しは tasks.md (T-26) で行う.
- **R-2: architecture ドキュメントの soft delete 追従.** openapi.yaml の trash 系レスポンススキーマ /
  Routine schema / DELETE /routines, および schema.md / domain-model / api/overview / ADR-0010 の Routine 削除
  記述を実態 (soft delete + デタッチ NULL 固定 + 3 配列 trash レスポンス) に追従させる. リリース前のため履歴
  表現を使わず timeless に記述する. 具体的なファイルとタスクは plan.md「architecture ドキュメント追従」/
  tasks.md (T-21〜T-23) を正典とする.
- **R-3: local routines スキーマと repository の整合確認 (スコープ限定).** D-5 後段のとおり,
  `local-routine-repository.ts` が参照する列名 (`generate_on_weekdays` / `last_generated_for_date`) と v001/v002
  の DDL 実態の不整合を確認し, soft delete に必要な範囲を成立させる. **列名不整合の全面修正は本 feature のゴールに
  含めない**. trashed_at の往復 (削除→ゴミ箱→復元) が local で成立することを完了条件とし, 致命的な場合は別 BL の
  起票を推奨する (plan.md「リスク / 代替案」を正典).

## 非ゴール (確定)

- **FR-062 リセット自動清算の Routine 対象化は本 feature の非ゴール.** 既存のゴミ箱自動完全削除系は tasks
  専用であり, Routine を対象へ広げるかは別 backlog で検討する. ただし「ゴミ箱を空にする (手動)」(FR-5) は
  本 feature で Routine 対応する.
- **Routine の実施履歴・ストリーク等の追加は非ゴール** (FR-034 OOS-008).
