# 設計・実装計画: project-soft-delete

> [`spec.md`](spec.md) の要件を, どう実現するかに落とす。

## 方針概要

Project の DELETE を物理削除からゴミ箱化 (soft delete) に変える. `domain/project` に `trashProject` /
`restoreProject` の純関数を追加し, `server/src/app/project-usecases.ts` の `deleteProject` を「カスケード
NULL + Project ゴミ箱化」へ書き換える. 既存の `/api/v1/trash` GET / `/trash/{id}/restore` POST /
`/trash` DELETE を Task・Project 共用に拡張する (新 endpoint は作らない). web は trash-view に Project
セクションを追加し, 復元は `useTrashMutations` 経由で行う. local 側は repository 実装を soft delete +
Project trash 表現に追従させる (スキーマ変更なし).

## 影響範囲

| 領域 | 変更内容 |
| --- | --- |
| API | `/api/v1/trash` GET レスポンスに `projects` 配列を追加. `/trash/{id}/restore` POST が Project にも対応 (200 で `{ project }` を返す)。`/trash` DELETE が Project も物理削除。`/projects/{id}` DELETE はパス・メソッド不変で挙動のみ soft delete 化。**新規 path/method なし** → openapi-drift の path 集合は不変。`openapi.yaml` はレスポンススキーマ (Trash 系 / Project schema) を更新し, あわせて実装に存在しない `cascade` 必須クエリパラメータ記述を除去 (実態は常にカスケード NULL 固定)。 |
| DB | スキーマ変更なし。server `projects.trashed_at` は既存カラムを活用。`trashed_reason` は Project に追加しない (D-6)。local も v001 の `projects.trashed_at` を活用 (新 migration 不要, D-5)。 |
| モジュール (domain) | `domain/src/project/index.ts` に `Project.trashedAt` フィールド追加 + `trashProject` / `restoreProject` / `isTrashed` 純関数追加。 |
| モジュール (server app) | `project-usecases.ts deleteProject` を soft delete 化。`trash-usecases.ts` に `listTrash` の Project 同梱 / `restoreTask` を `restore` (Task/Project 判別) へ拡張 / `purgeTrash` の Project 物理削除を追加。 |
| データ層 (server) | `ProjectRepository` に `findById` がゴミ箱状態も返せること, `listTrashed()` / `update()` (trashedAt 含む) / `deleteAllTrashed()` 相当を追加。`DrizzleProjectRepository` の `insert`/`update`/`findById`/`list` を trashedAt 対応に更新。 |
| データ層 (web/local) | `local-project-repository` の `delete` を soft delete (UPDATE trashed_at) 化, `list` は trashed_at IS NULL 維持。`local-trash-repository` の `list`/`restore`/`empty` を Project 対応に拡張。HTTP repository (`trash-repository.ts` / `project-repository.ts`) を新レスポンス形に追従。 |
| UI | `web/src/ui/trash-view/trash-view.tsx` に Project セクション追加 (一覧 + 復元ボタン)。復元は `useTrashMutations` に Project 対応 mutation を追加。Lucide `RotateCcw` 等のアイコンは既存 trash-view の復元 UI 様式に合わせる。 |
| テスト | server: project DELETE soft delete / trash list (Project 同梱) / restore (Project) / purge (Project)。domain: `trashProject`/`restoreProject`。web: trash-view Project セクション, usecase, local/http repository。E2E: Project 削除→復元の往復 (D-7)。既存 hard-delete 前提テストの追従 (R-1)。 |

## 設計詳細

### データモデル

- `domain/src/project/index.ts` の `Project` に以下を追加する:
  - `trashedAt: string | null` (既定 null)。
  - `trashProject(current, clock)`: `trashedAt === null` のときのみ `trashedAt = clock.now()`,
    `updatedAt = now`, `version + 1`。既にゴミ箱状態なら no-op 等価で `{ ...current }` を返す (冪等。
    `trashTask` と同型)。
  - `restoreProject(current, clock)`: `trashedAt = null`, `updatedAt = clock.now()`, `version + 1`。
    (Task の `restoreTask` と異なり dueDate に相当する付随リセットは無い)。
  - `isTrashed(project)`: `project.trashedAt !== null`。
  - `createProject` / `updateProject` は `trashedAt: null` を初期値として持たせる。
- `server/src/data/project-repository.ts` の `Project` インターフェースに `trashedAt: string | null` を追加。
- 注意: server schema の `projects.trashed_at` は既存。`DrizzleProjectRepository` は現状 trashedAt を読み書き
  していない (insert/update/findById/list で欠落) ため, ここを補う必要がある。

### 処理フロー

1. **Project 削除 (FR-1 / FR-2)** — `project-usecases.ts deleteProject`:
   - `findById` → なければ notFound, version 不一致なら conflict (現行と同じ)。
   - `deps.db` ありなら 1 トランザクションで:
     (a) 紐付くタスクの `projectId` を NULL 更新 (カスケード NULL, 現行維持),
     (b) `projects` を物理 delete する代わりに `trashed_at = now`, `version + 1`, `updated_at = now` で UPDATE。
   - `deps.db` なしのフォールバックは `taskRepository.nullifyProjectId` + `projectRepository.update(trashed)`。
   - ドメイン純関数 `trashProject(current, clock)` で次状態を算出し, それを update する (層構造維持)。
2. **ゴミ箱一覧 (FR-3)** — `trash-usecases.ts listTrash`:
   - 現行の `taskRepository.list({ trashed: "true" })` に加え, `projectRepository.listTrashed()` を呼ぶ。
   - 戻り値を `{ tasks, projects }` 形にして router が `c.json` する。
3. **復元 (FR-4)** — `trash-usecases.ts restore` (現 `restoreTask` を拡張 or 改名):
   - `taskRepository.findById(id)` → ヒットすれば既存の Task 復元ロジック (dueDate=today リセット)。
   - 非ヒットなら `projectRepository.findById(id)`:
     - なし → notFound (`PROJECT_NOT_FOUND` / `TASK_NOT_FOUND` を id 不明として統一コードでも可)。
     - `trashedAt === null` → invalid (`PROJECT_NOT_IN_TRASH`)。
     - version 不一致 → conflict (current Project を返す)。
     - それ以外 → `restoreProject(current, clock)` → update → `{ kind: "ok", value: project }`。
   - router は結果の種別 (task か project か) に応じて `{ task }` または `{ project }` を 200 で返す。
4. **ゴミ箱を空にする (FR-5)** — `trash-usecases.ts purgeTrash`:
   - 現行の `taskRepository.deleteAllTrashed()` に加え `projectRepository.deleteAllTrashed()` を呼ぶ。
5. **通常一覧の除外 (FR-8)** — `GET /projects`:
   - `projectRepository.list()` を `trashed_at IS NULL` で絞る (Drizzle 実装に `isNull` 条件を追加)。
     local 側は既に `trashed_at IS NULL` で絞っている。
6. **web trash-view (FR-7)**:
   - `useQuery(["trash"])` のレスポンスから `tasks` / `projects` を取り出し, タスク一覧と Project 一覧を
     別セクションで描画する。Project 行に復元ボタン → `useTrashMutations` の Project 復元 mutation を呼ぶ。
   - restore mutation は id + ifMatch を送るだけで, サーバが Task/Project を判別する (D-3)。よって web 側は
     entity 種別を意識せず, ただし invalidate 対象に `["projects"]` を追加する (Project 復元時の一覧反映)。

### 例外 / エラー処理

- 復元: 不存在 → 404, 通常状態の id → 400 (`PROJECT_NOT_IN_TRASH` / 既存 `TASK_NOT_IN_TRASH`),
  version 不一致 → 412 (current を返す)。
- 削除: 不存在 → 404, version 不一致 → 412 (現行どおり)。
- HTTP repository は 412 時に `{ project }` または `{ task }` を読んで Conflict 系エラーへ昇格する。

## 重要な決定

- **D-1: trash 系エンドポイントを Task/Project 共用にする。新 endpoint を作らない。**
  - openapi-drift は path/method 集合一致のみ強制。既存 path 再利用で drift 0。復元一本化方針と整合。
- **D-2: GET /trash のレスポンスを `{ tasks: TrashedTask[], projects: TrashedProject[] }` にする。**
  - `tasks` キーは後方互換で維持。`TrashedProject = { id, name, trashedAt, version }`。
- **D-3: restore 対象判別は usecase 内で task→project の順に `findById` する。**
  - 専用 type パラメータや別 path は導入しない。
- **D-4: カスケード復元はしない。** Project 復元時, NULL 化済みタスクの projectId は戻さない。
- **D-5: local schema 変更なし。** v001 の `projects.trashed_at` を活用。新 migration 不要。
  repository のコード追従のみ。
- **D-6: projects に `trashed_reason` を追加しない。** Project の削除理由は "deleted" 固定。
  ゴミ箱表示で理由が必要なら表示側で固定文言。
- **D-7: E2E テストを 1 件追加する。** Project 削除→`/trash` で復元→ Project 一覧へ復帰の往復シナリオ。
- **非ゴール: FR-062 のリセット自動清算の Project 対象化は本 feature では扱わない。** 手動「空にする」
  (FR-5) のみ Project 対応する。
- **ADR は新設しない。** trash の複数エンティティ表現・カスケード非復元はリリース前の feature 設計であり,
  本 feature spec / plan が記録媒体として十分。代わりに既存 architecture ドキュメント (openapi.yaml /
  api/overview / database/schema / domain-model / ADR-0010) を実装 (soft delete + カスケード NULL 固定) に
  追従させる (下記「architecture ドキュメント追従」)。

## architecture ドキュメント追従

本 feature の実装と同時に, 下記 architecture ドキュメントを実態 (Project soft delete + カスケード NULL 固定 +
trash の 2 配列レスポンス) に追従させる。リリース前のため履歴表現を使わず timeless に記述する。

| ファイル | 追従内容 |
| --- | --- |
| `architecture/api/openapi.yaml` | (1) `GET /trash` の 200 レスポンススキーマを `{ tasks: [...], projects: [...] }` の 2 配列構成に定義。(2) `TrashedProject` ( `{ id, name, trashedAt, version }` ) スキーマ定義を追加。(3) `POST /trash/{id}/restore` の 200 を Task 復元時 `{ task }` / Project 復元時 `{ project }` の oneOf に拡張。(4) `DELETE /projects/{id}` の `cascade` 必須クエリパラメータを削除 (実装は常にカスケード NULL 固定で, UI 確認 / cascade 選択は存在しない)。description を「ゴミ箱化 + 配下 Task の projectId を null 化」に修正。(5) `Project` schema に `trashedAt: string \| null` を含める。drift テストは path/method のみだが `api/overview §8`「OpenAPI に書かれていない API は存在しない」の精神に従いレスポンススキーマも正しく保つ。 |
| `architecture/database/schema.md` | §Project の「削除時, 紐づく Task の扱いは UI でユーザーに確認 (カスケード or 独立化)」記述を, 実態「Project 削除はゴミ箱化 (`trashedAt = now`) し, 配下 Task は `projectId` を `null` 化する (カスケード NULL 固定。UI 確認・カスケードゴミ箱化は行わない)」に修正。§確定事項の「プロジェクトをゴミ箱に入れる際の配下 Task の扱い: UI でユーザーに確認」も同様に修正。Project が trashed_reason を持たない旨を明記。 |
| `architecture/domain-model.md` | Project の状態遷移図 / 注記にある「Project をゴミ箱に入れる際, 配下 Task の扱いは UI でユーザーに確認」を「配下 Task は `projectId` を null 化 (カスケード NULL 固定)」に修正。 |
| `architecture/api/overview.md` | `/projects` 行の説明を soft delete + カスケード NULL 固定の実態に合わせて確認・必要なら調整 (現状「一覧 / 作成 / 編集 / 削除 / 復元」で path 表現としては妥当。cascade 確認の記述があれば除去)。 |
| `adr/0010-api-design.md` | `/projects` の「削除 / 復元」行および本文に Project 削除の cascade 確認モデルへの言及があれば, カスケード NULL 固定 + soft delete の実態に追従。path/method 表は不変。 |

## リスク / 代替案

- リスク: `DrizzleProjectRepository` が現状 `trashed_at` を読み書きしていないため, soft delete を入れると
  insert/update/findById/list 全体の trashedAt 取り回しを揃える必要がある。漏れると「削除しても消えない /
  ゴミ箱に出ない」不整合になる。→ 各メソッドの trashedAt 対応をテストで固定する。
- リスク: restore の Task→Project 判別順で, 万一 Task と Project が同一 id を持つと誤判別する。→ id は
  UUID v4 でクライアント採番のため衝突は実用上発生しない前提を spec に明記済 (D-3)。
- 代替案 (却下): trash を entity 種別ごとに別 endpoint (`/trash/projects` 等) に分ける案。openapi-drift に
  新 path 追加が必要で復元一本化方針に反するため却下 (D-1)。
- 代替案 (却下): `trashed_reason` を Project にも追加し tasks と対称化する案 (D-6 反対案)。今回は追加しない。

## テスト方針

> 全体方針は [`../../quality/test-catalog.md`](../../quality/test-catalog.md)。

- domain 単体: `trashProject` / `restoreProject` / `isTrashed` の状態遷移・冪等性 (AC-10)。
- server 結合 (Hono app):
  - DELETE /projects が soft delete になる (findById で trashed_at != null, 物理削除されない) (AC-1)。
  - カスケード NULL 維持 (AC-2)。GET /projects がゴミ箱 Project を除外 (AC-3)。
  - GET /trash が `{ tasks, projects }` で Project を含む (AC-4)。
  - POST /trash/{id}/restore が Project を復元し 200 `{ project }` (AC-5), カスケード復元しない (AC-6),
    楽観ロック 412 (AC-8), 通常状態 id で 400 (AC-9)。
  - DELETE /trash が Project も物理削除 (AC-7)。
- web 単体: trash-view の Project セクション描画 + 復元 (AC-11), `useTrashMutations` の Project invalidate,
  local-project-repository の soft delete, local-trash-repository の Project list/restore/empty,
  HTTP repository のレスポンス追従。
- 構造: openapi-drift が green のまま (AC-12)。openapi.yaml の Trash/Project schema 更新。
- E2E (D-7): Project 削除→`/trash` で復元→ Project 一覧へ復帰の往復を 1 シナリオ追加。
- 既存テスト追従 (R-1): server/web の「Project DELETE = findById null」前提を soft delete 前提に修正。
