# 仕様: project-soft-delete (Project の soft delete + ゴミ箱経由復元)

- 状態: 確定
- 関連: [`../../planning/backlog.md`](../../planning/backlog.md) の BL-119
- 要件: [`../../requirements.md`](../../requirements.md) FR-060 / FR-061 / FR-062

## 背景 / 課題

`requirements.md` FR-060「すべての削除・完了はゴミ箱を経由する」/ FR-061「ゴミ箱から復元できる」は
復元対象を「元の状態（タスク・プロジェクト）」と明示し, Project もゴミ箱経由の削除・復元の対象である.

しかし現実装は `server/src/app/project-usecases.ts` の `deleteProject` が物理削除 (hard delete) を実行し,
紐付くタスクの `projectId` を NULL 化するのみ. Project は `/trash` ビューに表示されず, 復元手段が無い.
このため FR-060 / FR-061 に違反している.

server schema の `projects` テーブルには `trashed_at` カラムが既に存在する (`server/src/db/schema.ts`) が
活用されていない. 一方 `trashed_reason` カラムは tasks にはあるが projects には無い.

## ゴール / 非ゴール

- ゴール:
  - Project の DELETE をゴミ箱化 (soft delete) に変更する. `trashed_at = now` をセットする.
  - Project をゴミ箱経由で復元できるようにする.
  - `/trash` ビューに Project セクションを追加し, ゴミ箱内 Project の一覧表示と復元 UI を提供する.
  - 既存の `/api/v1/trash` GET / `/trash/{id}/restore` POST / DELETE ハンドラを Project にも対応させる.
  - Project 削除時のカスケード方針 (紐付くタスクの `projectId` を NULL 化) は維持する.
- 非ゴール:
  - routine の soft delete (BL-120 で扱う).
  - Task 側の削除・完了・復元の挙動変更 (無改修).
  - ゴミ箱内 Project の自動完全削除 (FR-062 のリセット清算) の挙動変更. 既存清算機構の対象を Project へ
    広げるかは別 backlog で扱う (本書「非ゴール (確定)」参照).
  - 紐付くタスクの「カスケード復元」(Project 復元時に NULL 化された `projectId` を元へ戻すこと) は行わない
    (D-4 / 「確定事項」参照).

## 用語

- **ゴミ箱化 (trash)**: `trashed_at` に時刻をセットし, 通常の一覧から除外される論理削除状態にすること.
- **復元 (restore)**: `trashed_at` を NULL に戻し, 通常状態へ戻すこと.
- **カスケード NULL**: Project 削除時, 紐付くタスクを削除せず `projectId` を NULL にすること (現行方針).

## 要件

### 機能要件

- FR-1: `DELETE /api/v1/projects/{id}` は Project を物理削除せず, `trashed_at` をセットしてゴミ箱化する.
  - version を +1 し, `updated_at` を更新する.
  - 楽観ロック (If-Match) は現行と同じ. version 不一致は 412, 不存在は 404 を返す.
- FR-2: Project 削除時, 紐付くタスク (`projectId = {id}`) の `projectId` を NULL 化する (カスケード NULL を維持).
  タスク自体はゴミ箱化も削除もしない.
- FR-3: `GET /api/v1/trash` は, ゴミ箱内のタスクに加えてゴミ箱内の Project も返す.
  - レスポンス形状は `{ tasks: [...], projects: [...] }` の 2 配列構成 (D-2) に従う.
- FR-4: `POST /api/v1/trash/{id}/restore` は, 対象 id がゴミ箱内 Project の場合に Project を復元する.
  - `trashed_at` を NULL に戻し, version +1, `updated_at` 更新.
  - 対象が Task の場合の挙動は現行のまま (Task 復元時は dueDate を today にリセット).
  - 復元経路は `/trash/{id}/restore` の 1 本に一本化されたまま (per-entity restore path を新設しない).
- FR-5: `DELETE /api/v1/trash` (ゴミ箱を空にする) は, ゴミ箱内 Task に加えてゴミ箱内 Project も物理削除する.
- FR-6: `domain/project` に純関数 `trashProject` / `restoreProject` を追加する. `domain/task` の
  `trashTask` / `restoreTask` と同型のシグネチャ・冪等性を持つ.
- FR-7: `/trash` ビューに Project セクションを追加し, ゴミ箱内 Project を一覧し, 各行に復元 UI を表示する.
  復元 mutation は web の usecase 層 (`useTrashMutations`) 経由とし, view から直接 `useMutation` しない.
- FR-8: ゴミ箱化された Project は通常の Project 一覧 (`GET /api/v1/projects`) から除外される.

### 非機能要件

- 整合性: Project 削除のカスケード NULL とゴミ箱化は同一トランザクション境界で実行し, アトミック性を保つ
  (現行 `deleteProject` の `deps.db.transaction` 方針を維持).
- 層構造の維持: soft delete / restore のロジックは `server/src/app/*-usecases.ts` に置き, router は写像のみ
  (§5.2). web の trash-view の復元 mutation は usecase (`useTrashMutations`) に集約し view から直接
  `useMutation` しない (§5.3).
- ドキュメント整合: trash 系エンドポイントのレスポンススキーマを変更する場合は `openapi.yaml` を同時更新し,
  `__tests__/structure/openapi-drift.test.ts` (path/method 集合一致) を green に保つ.
- 冪等性: ゴミ箱化・復元の純関数は冪等とする (既にゴミ箱状態の Project の trash は no-op 等価で返す).

## 受け入れ基準

> 書き方は [`../../quality/acceptance-criteria.md`](../../quality/acceptance-criteria.md) に従う。

```
AC-1: Project 削除はゴミ箱化される (物理削除されない)
  Given 通常状態の Project P (version=1) が存在する
  When  DELETE /api/v1/projects/{P.id} を If-Match: 1 で実行する
  Then  HTTP 204 が返る
  And   P は物理削除されず trashed_at != null になる
  And   P の version は 2 に増える
```

```
AC-2: Project 削除のカスケード NULL は維持される
  Given Project P と, P に紐付くタスク T (projectId = P.id) が存在する
  When  P を削除する
  Then  T は削除されず残る
  And   T.projectId が null になる
```

```
AC-3: ゴミ箱化された Project は通常一覧から除外される
  Given ゴミ箱化された Project P が存在する
  When  GET /api/v1/projects を実行する
  Then  レスポンスの projects に P は含まれない
```

```
AC-4: ゴミ箱一覧に Project が含まれる
  Given ゴミ箱内のタスク T と ゴミ箱内の Project P が存在する
  When  GET /api/v1/trash を実行する
  Then  レスポンスは T を含む tasks 配列と P を含む projects 配列を返す
```

```
AC-5: ゴミ箱の Project を復元できる
  Given ゴミ箱内の Project P (trashed_at != null, version=2) が存在する
  When  POST /api/v1/trash/{P.id}/restore を If-Match: 2 で実行する
  Then  HTTP 200 が返り P が返却される
  And   P の trashed_at が null になる
  And   P の version が 3 に増える
  And   GET /api/v1/projects に P が再び含まれる
```

```
AC-6: Project 復元はカスケード復元しない
  Given Project P を削除した結果 projectId が NULL 化されたタスク T が存在する
  When  ゴミ箱から P を復元する
  Then  P は通常状態に戻る
  And   T.projectId は NULL のまま (元の P.id には戻らない)
```

```
AC-7: ゴミ箱を空にすると Project も物理削除される
  Given ゴミ箱内のタスク T と ゴミ箱内の Project P が存在する
  When  DELETE /api/v1/trash を実行する
  Then  T と P がいずれも物理削除される
  And   GET /api/v1/trash の tasks 配列・projects 配列がともに空になる
```

```
AC-8: 復元の楽観ロック (Project)
  Given ゴミ箱内の Project P (version=2) が存在する
  When  POST /api/v1/trash/{P.id}/restore を If-Match: 1 (古い version) で実行する
  Then  HTTP 412 が返り 最新の P が返却される
```

```
AC-9: 通常状態の id を復元しようとするとエラー
  Given 通常状態 (trashed_at = null) の Project P が存在する
  When  POST /api/v1/trash/{P.id}/restore を実行する
  Then  HTTP 400 が返る (PROJECT_NOT_IN_TRASH 相当)
```

```
AC-10: trashProject / restoreProject 純関数の挙動
  Given 通常状態の Project P (version=1)
  When  trashProject(P, clock) を呼ぶ
  Then  trashedAt が clock.now() にセットされ version=2 になる
  And   既にゴミ箱状態の Project に trashProject を再適用しても trashedAt と version は変化しない (no-op 等価)
  And   restoreProject(ゴミ箱状態の Project, clock) は trashedAt を null に戻し version を +1 する
```

```
AC-11: /trash ビューに Project セクションが表示され復元できる
  Given ゴミ箱に Project P が 1 件存在する
  When  /trash ビューを開く
  Then  Project セクションに P の名前が表示される
  And   P の行の復元操作を行うと P がゴミ箱から消え 通常の Project 一覧に戻る
```

```
AC-12: trash 系エンドポイントのドキュメント整合
  Given trash 系エンドポイントのレスポンススキーマを変更した
  When  openapi-drift テストおよび openapi.yaml を検証する
  Then  openapi.yaml と実装の (path, method) 集合が一致し drift テストが green である
```

## 確定事項

下記はすべて確定済み (D-1〜D-7 採用). 設計上の根拠は plan.md「重要な決定」を正典とする.

- **D-1: trash 系エンドポイントは Task/Project 共用.** 既存 `/api/v1/trash` (GET) / `/trash/{id}/restore`
  (POST) / `/trash` (DELETE) を Task・Project で共用し, 新 endpoint は設けない. openapi-drift は path/method
  集合一致のみを強制するため既存 path 再利用で drift は発生しない. 復元一本化方針とも整合する.
- **D-2: trash list レスポンスは `{ tasks: TrashedTask[], projects: TrashedProject[] }` の 2 配列構成.**
  既存クライアントが読む `tasks` キーを維持し `projects` キーを追加する (後方互換).
  `TrashedProject = { id, name, trashedAt, version }` 形 (Project は trashedReason を持たない. D-6 参照).
- **D-3: restore 対象判別は usecase 内で task→project の順に `findById` する.** task ヒットでタスク復元,
  非ヒットなら project を `findById` しゴミ箱内なら project 復元, どちらにも該当しなければ 404.
  id は UUID で衝突しない前提. 判別用の専用 endpoint や type パラメータは導入しない.
- **D-4: カスケード復元はしない.** Project 復元時, 削除時に `projectId` を NULL 化したタスクの `projectId` は
  元へ戻さない. 削除時点でタスク側の所属情報が失われ, どのタスクが元 P に属していたかを復元時に再同定する手段が
  無いため. FR-061 の「対象を元の状態に戻す」の「対象」はゴミ箱内 Project 自身を指す. タスクの再紐付けはユーザーが
  手動で行う (Task の projectId 変更は既存機能で可能).
- **D-5: local schema 変更なし.** local `projects` テーブルは v001 で既に `trashed_at` を持つ
  (`v001-initial.ts`). Project は trashed_reason を持たないため新カラム追加も不要. local の trash/project
  repository 実装 (現状 hard delete + list が trashed_at IS NULL 除外) を soft delete + Project trash 表現へ
  追従させるコード変更のみ行う. local-migrations の新規バージョン追加は不要.
- **D-6: projects テーブルに `trashed_reason` を追加しない.** Project の削除理由は "deleted" 固定で
  Task の "completed" に相当する状態が無いため. server / local いずれも Project には追加しない.
  ゴミ箱表示で理由が必要なら表示側で「削除」固定とする.
- **D-7: E2E テストを 1 件追加する.** Project 削除→`/trash` で復元→ Project 一覧に戻る往復シナリオを
  `e2e/projects.spec.ts` または `e2e/trash.spec.ts` に追加する.

## 残作業 (実装フェーズで対応)

- **R-1: 既存の Project hard-delete 前提テストの追従.** server / web の既存テストで「Project 削除 = 物理削除
  (findById が null)」を前提にしているものを soft delete 前提 (findById が trashed_at != null を返す) へ追従
  修正する. 影響テストの洗い出しは tasks.md (T-25) で行う.
- **R-2: architecture ドキュメントの soft delete 追従.** openapi.yaml の trash 系レスポンススキーマ /
  Project schema / DELETE /projects, および schema.md / api/overview / ADR-0010 / domain-model の Project 削除
  記述を実装 (soft delete + カスケード NULL 固定) に追従させる. リリース前のため履歴表現を使わず timeless に
  記述する. 具体的なファイルとタスクは plan.md「architecture ドキュメント追従」/ tasks.md (T-18〜T-19b) を正典
  とする.

## 非ゴール (確定)

- **FR-062 リセット自動清算の Project 対象化は本 feature の非ゴール.** 既存のゴミ箱自動完全削除
  (`deleteAllTrashed` / `deleteTrashedOlderThan` 系) は tasks 専用であり, Project を対象へ広げるかは別 backlog
  で検討する. ただし「ゴミ箱を空にする (手動)」(FR-5) は本 feature で Project 対応する.
