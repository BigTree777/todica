# タスク: project-soft-delete

> [`plan.md`](plan.md) を実行可能な単位に分解する。完了したらチェックを入れる。

## ドメイン

- [ ] T-01: `domain/src/project/index.ts` の `Project` に `trashedAt: string | null` を追加し,
      `createProject` / `updateProject` の初期値・引き継ぎを更新する (AC-10)。
- [ ] T-02: `domain/src/project/index.ts` に `trashProject(current, clock)` を追加する
      (冪等。既ゴミ箱状態は no-op 等価。`trashTask` と同型) (FR-6 / AC-10)。
- [ ] T-03: `domain/src/project/index.ts` に `restoreProject(current, clock)` と `isTrashed(project)` を
      追加する (FR-6 / AC-10)。

## サーバ (データ層)

- [ ] T-04: `server/src/data/project-repository.ts` の `Project` に `trashedAt` を追加し,
      `listTrashed()` / `deleteAllTrashed()` をインターフェースに追加する。
- [ ] T-05: `DrizzleProjectRepository` の `insert` / `update` / `findById` / `list` を `trashed_at` 対応に
      する (insert は null, update は trashedAt を書き込み, list は `trashed_at IS NULL` で絞る) (FR-8)。
- [ ] T-06: `DrizzleProjectRepository` に `listTrashed()` (trashed_at IS NOT NULL) と `deleteAllTrashed()`
      (trashed_at IS NOT NULL を物理削除) を実装する (FR-3 / FR-5)。

## サーバ (app 層 / router)

- [ ] T-07: `project-usecases.ts deleteProject` を soft delete 化する。トランザクション内でカスケード NULL +
      `trashProject` による UPDATE。`deps.db` なしのフォールバックも対応 (FR-1 / FR-2 / AC-1 / AC-2)。
- [ ] T-08: `trash-usecases.ts listTrash` を `{ tasks, projects }` を返す形に拡張する (FR-3 / AC-4)。
- [ ] T-09: `trash-usecases.ts` の restore を Task→Project 判別ロジックに拡張する
      (`PROJECT_NOT_IN_TRASH` / version 412 / カスケード復元しない) (FR-4 / AC-5 / AC-6 / AC-8 / AC-9)。
- [ ] T-10: `trash-usecases.ts purgeTrash` に Project の物理削除を追加する (FR-5 / AC-7)。
- [ ] T-11: `routers/trash.ts` の GET / restore / DELETE ハンドラを usecase 戻り値に追従させる
      (restore は Task なら `{ task }`, Project なら `{ project }` を 200 で返す) (§5.2 写像のみ維持)。
- [ ] T-12: `routers/projects.ts` の DELETE ハンドラは現状の写像で動くことを確認する (挙動は usecase 側で変わる)。

## Web (データ層 / usecase / UI)

- [ ] T-13: `web/src/repositories/trash-repository.ts` (HTTP) を `{ tasks, projects }` レスポンスと
      Project 復元 (`{ project }`) に追従させる。`TrashedProject` 型を追加する。
- [ ] T-14: `web/src/repositories/local-project-repository.ts` の `delete` を soft delete (UPDATE trashed_at)
      にする。`list` は `trashed_at IS NULL` 維持 (FR-8)。
- [ ] T-15: `web/src/repositories/local-trash-repository.ts` の `list` / `restore` / `empty` を Project 対応に
      する (projects テーブルの trashed_at を含める) (FR-3 / FR-4 / FR-5)。
- [ ] T-16: `web/src/usecases/trash-usecases.ts` の restore mutation の invalidate に `["projects"]` を追加し,
      Project 復元時に Project 一覧へ反映されるようにする (FR-7)。
- [ ] T-17: `web/src/ui/trash-view/trash-view.tsx` に Project セクションを追加する (一覧 + 復元ボタン /
      Lucide `RotateCcw` 等)。復元は `useTrashMutations` 経由 (view から直接 useMutation しない) (FR-7 / AC-11)。

## ドキュメント (architecture 追従 / R-2)

> ADR は新設しない (plan.md「重要な決定」)。下記は既存 architecture ドキュメントの実態追従。
> リリース前のため履歴表現を使わず timeless に記述する。

- [ ] T-18: `docs/developer/architecture/api/openapi.yaml` を更新する。
      (a) `GET /trash` 200 を `{ tasks, projects }` の 2 配列構成に定義。
      (b) `TrashedProject` (`{ id, name, trashedAt, version }`) スキーマを追加。
      (c) `POST /trash/{id}/restore` 200 を `{ task }` / `{ project }` の oneOf に拡張。
      (d) `DELETE /projects/{id}` の `cascade` 必須クエリパラメータを除去し description をカスケード NULL 固定 +
          ゴミ箱化に修正。
      (e) `Project` schema に `trashedAt` を含める。
      `__tests__/structure/openapi-drift.test.ts` を green に保つ (path/method 不変) (AC-12)。
- [ ] T-19: `docs/developer/architecture/database/schema.md` §Project / §確定事項 の「配下 Task は UI で確認
      (カスケード or 独立化)」記述を, 実態「ゴミ箱化 + カスケード NULL 固定」に修正する。Project が
      trashed_reason を持たない旨を明記する。
- [ ] T-19b: `docs/developer/architecture/domain-model.md` / `architecture/api/overview.md` /
      `adr/0010-api-design.md` の Project 削除に関する「UI で確認 / cascade 選択」記述を soft delete +
      カスケード NULL 固定の実態に追従させる (path/method 表は不変)。
- [ ] T-20: ADR は新設しない方針を再確認する (新規 ADR ファイルは作成しない)。

## テスト

- [ ] T-21: domain 単体テスト (`trashProject` / `restoreProject` / `isTrashed`) (AC-10)。
- [ ] T-22: server 結合テスト: DELETE /projects soft delete + カスケード NULL + 通常一覧除外
      (AC-1 / AC-2 / AC-3)。
- [ ] T-23: server 結合テスト: GET /trash (Project 同梱) / restore (Project 復元・楽観ロック・非ゴミ箱 400・
      カスケード復元なし) / DELETE /trash (Project 物理削除) (AC-4〜AC-9)。
- [ ] T-24: web 単体テスト: trash-view Project セクション (AC-11), usecase invalidate,
      local-project / local-trash / HTTP repository の追従。
- [ ] T-25: 既存 hard-delete 前提テストの追従修正 (R-1。server / web で findById null 前提の箇所)。
- [ ] T-26: E2E: Project 削除→`/trash` で復元→ Project 一覧へ復帰の往復シナリオを追加 (D-7)。

## 仕上げ

- [ ] T-27: 受け入れ基準 (spec.md AC-1〜AC-12) を全て満たすことを確認する。
- [ ] T-28: `npx vitest run` (リポジトリルート) と E2E が green であることを確認する。
- [ ] T-29: レビュー依頼 (auditor)。
