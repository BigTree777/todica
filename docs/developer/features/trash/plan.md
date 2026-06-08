# 設計・実装計画: ゴミ箱（閲覧・復元・手動「空にする」・日次清算）

> [`spec.md`](spec.md) の要件を、どう実現するかに落とす。

## 方針概要

既存の `tasks` テーブル（`trashedAt` / `trashedReason` カラムは BL-001 で確定済み）を流用し、データモデル変更なしで実装する。サーバ API 3 本（`GET /api/v1/trash`、`POST /api/v1/trash/:id/restore`、`DELETE /api/v1/trash`）を追加し、BL-010 の `purgeTrash` スタブに日次清算ロジックを充填する。BL-001 / BL-003 で確立した共通ミドルウェア（Bearer 認証 / Idempotency-Key / If-Match）をそのまま再利用する。

## 影響範囲

| 領域 | 変更内容 |
| --- | --- |
| API | `GET /api/v1/trash` の実装（骨格は openapi.yaml に存在） |
| API | `POST /api/v1/trash/:id/restore` の実装（骨格は openapi.yaml の `/tasks/:id/restore` に存在） |
| API | `DELETE /api/v1/trash` の実装（骨格は openapi.yaml に存在） |
| DB | マイグレーション不要（`tasks` テーブルは BL-001 で確定済み。物理削除は既存 `delete` 相当の SQL） |
| モジュール | `server/src/use-cases/purge-trash.ts` に日次清算ロジックを充填（no-op スタブを置き換え） |
| モジュール | `server/src/app.ts` に 3 本のハンドラを追加 |
| モジュール | `server/src/data/task-repository.ts` に物理削除メソッドを追加 |
| UI | なし（本 feature は API 層のみ） |

## 既存実装の調査結果

### 既実装（流用するもの）

| 項目 | 所在 |
| --- | --- |
| `tasks.trashedAt` / `tasks.trashedReason` カラム | DB schema（BL-001） |
| `TaskRepository.list({ trashed: "true" })` でゴミ箱タスクを取得 | `server/src/data/task-repository.ts` |
| `TaskRepository.findById()` | 同上 |
| `TaskRepository.update()` | 同上 |
| Bearer 認証ミドルウェア | `server/src/app.ts` |
| Idempotency-Key ミドルウェア / `saveAndReturn` | 同上 |
| If-Match パース + 412 応答パターン | 同上（PATCH / DELETE ハンドラに展開済み） |
| `purgeTrash(db, clock)` のシグネチャ | `server/src/use-cases/purge-trash.ts`（no-op スタブ） |
| `calcTodayBoundaryAt(nowIso, dayBoundaryTime)` | `server/src/use-cases/daily-reset.ts` |
| openapi.yaml の `/trash` および `/tasks/:id/restore` の骨格 | `docs/developer/architecture/api/openapi.yaml` |

### 新規実装が必要なもの

| 項目 | 内容 |
| --- | --- |
| `TaskRepository.delete(id: string): Promise<void>` | 物理削除。既存の `update` で `trashedAt` を立てる「論理削除」とは別。 |
| `TaskRepository.deleteAllTrashed(): Promise<void>` | ゴミ箱タスクを全件物理削除。「空にする」と日次清算で共用できる。 |
| `TaskRepository.deleteTrashOlderThan(boundaryAt: string): Promise<void>` | 指定日時より前の `trashedAt` を持つタスクを物理削除。日次清算で使用。 |
| ゴミ箱一覧ハンドラ | `GET /api/v1/trash` |
| 復元ハンドラ | `POST /api/v1/trash/:id/restore` |
| 「空にする」ハンドラ | `DELETE /api/v1/trash` |
| `purgeTrash` の本実装 | スタブを置き換え |
| ドメイン関数 `restoreTask` | 復元ロジック |

## 設計詳細

### データモデル

変更なし。本 feature が読み書きするカラムは以下のみ。

- 復元時: `trashedAt = null`, `trashedReason = null`, `dueDate = "today"`, `updatedAt = now`, `version + 1`
- 物理削除時: `DELETE FROM tasks WHERE id = ?`（ゴミ箱タスクを行ごと消去）

### ドメイン関数: `restoreTask`（D-001）

```typescript
// domain/src/task/index.ts に追加
export function restoreTask(
  current: Task,
  clock: Clock
): Task {
  // ゴミ箱に入っていないタスクへの呼び出しは呼び出し側が事前ガードする
  return {
    ...current,
    trashedAt: null,
    trashedReason: null,
    dueDate: "today",   // 元の期限に戻さず "today" で固定（spec.md §ゴール）
    updatedAt: clock.now(),
    version: current.version + 1,
  };
}
```

`trashTask` / `completeTask` と対称な設計とする。既にゴミ箱でないタスクへの `restoreTask` 呼び出しは API ハンドラ側でガードする（ドメイン関数自体はガードしない）。

### TaskRepository の拡張（D-002）

```typescript
export interface TaskRepository {
  // 既存
  insert(task: Task): Promise<void>;
  findById(id: string): Promise<Task | null>;
  list(filter: ListTasksFilter): Promise<Task[]>;
  update(task: Task): Promise<void>;
  // 新規
  /** 指定 id のタスクを物理削除する。存在しない場合は no-op。 */
  delete(id: string): Promise<void>;
  /** ゴミ箱タスク（trashedAt != null）を全件物理削除する。 */
  deleteAllTrashed(): Promise<void>;
  /** trashedAt が boundaryAt より前のタスクを物理削除する。日次清算で使用。 */
  deleteTrashOlderThan(boundaryAt: string): Promise<void>;
}
```

> `delete` メソッドの命名が API エンドポイントの「削除アクション（論理削除）」と混同しやすいことに注意する。ドメイン層では「物理削除」を `delete`、「論理削除（ゴミ箱移動）」は `update` で `trashedAt` を立てる既存経路で表現する。実装コメントで明記する。

### 日次清算の清算条件（D-003）

`purgeTrash` の清算条件:

```
清算対象 = trashedAt < 今日の境界時刻
```

例: `clock.now() = "2026-06-08T10:00:00.000Z"`, `dayBoundaryTime = "04:00"` の場合
- 今日の境界時刻 = `"2026-06-08T04:00:00.000Z"`（`calcTodayBoundaryAt` で算出）
- 清算対象: `trashedAt < "2026-06-08T04:00:00.000Z"` のタスク

これにより「今日の境界時刻より前（つまり前の日以前）にゴミ箱に入ったタスク」が清算される。

```typescript
// server/src/use-cases/purge-trash.ts（スタブを置き換える）
export async function purgeTrash(
  db: BetterSQLite3Database,
  clock: Clock,
): Promise<void> {
  const settings = await settingsRepository.get();
  const todayBoundaryAt = calcTodayBoundaryAt(clock.now(), settings.dayBoundaryTime);
  await taskRepository.deleteTrashOlderThan(todayBoundaryAt);
}
```

`purgeTrash` に `settingsRepository` / `taskRepository` を渡すために、シグネチャを拡張する（D-004 参照）。

### `purgeTrash` シグネチャの拡張（D-004）

BL-010 で確立したスタブのシグネチャ `purgeTrash(db, clock)` は `settings` / `taskRepository` を受け取っていない。本 feature では以下のシグネチャに拡張する。

```typescript
export async function purgeTrash(
  db: BetterSQLite3Database,
  clock: Clock,
  settingsRepository: SettingsRepository,
  taskRepository: TaskRepository,
): Promise<void>
```

呼び出し元（`server/src/use-cases/daily-reset.ts` の `maybeRunDailyReset`）も合わせて修正する。

> `db` パラメータはトランザクション実行に使う可能性を考慮して維持する（将来の拡張余地。現時点では `taskRepository.deleteTrashOlderThan` で十分なため直接呼ばない）。

### 処理フロー（D-005）

#### GET /api/v1/trash

```
1. Bearer 認証（既存ミドルウェア）
2. taskRepository.list({ trashed: "true" })
3. 200 OK { tasks: [...] }
```

#### POST /api/v1/trash/:id/restore

```
1. Bearer 認証（既存ミドルウェア）
2. Idempotency-Key 確認（既存ミドルウェア）→ キャッシュヒットなら保存済み応答を返す
3. taskRepository.findById(id) → null なら 404 TASK_NOT_FOUND
4. task.trashedAt === null なら 400 TASK_NOT_IN_TRASH
   （通常状態のタスクを復元しようとしている）
5. If-Match ヘッダなし / 数値化失敗 → 400 MISSING_IF_MATCH
6. task.version !== ifMatch → 412 { task: current }
7. domain/task/restoreTask(task, clock)
8. taskRepository.update(restoredTask)
9. saveAndReturn(c, deps, 200, { task: restoredTask })
```

#### DELETE /api/v1/trash

```
1. Bearer 認証（既存ミドルウェア）
2. Idempotency-Key 確認（既存ミドルウェア）→ キャッシュヒットなら保存済み応答を返す
3. taskRepository.deleteAllTrashed()（0 件でも no-op で正常終了）
4. saveAndReturn(c, deps, 204, null)
```

### openapi.yaml の更新（D-006）

以下を更新する。

1. `GET /api/v1/trash` の 200 レスポンスに `tasks` 配列（`Task` スキーマ）を追記。
2. `POST /api/v1/trash/:id/restore`（現在は `/tasks/{id}/restore`）のパスとレスポンスを本 feature の仕様に沿って具体化:
   - `/trash/{id}/restore` として定義（既存の `/tasks/{id}/restore` は OpenAPI 骨格では `/tasks` タグ管理だが、本 feature では `/trash` で実装する）
   - 200 OK のレスポンスボディに `{ task: Task }` を追記。
   - 400（`TASK_NOT_IN_TRASH`）/ 401 / 404 / 412 を追記。
3. `DELETE /api/v1/trash` の 204 レスポンスを具体化。
4. `ErrorCode` enum に `TASK_NOT_IN_TRASH` を追加。

> openapi.yaml の既存骨格では復元エンドポイントが `/tasks/{id}/restore` として定義されているが、実装上は `/trash/{id}/restore` として提供する（ゴミ箱からの復元操作であるため `trash` リソース配下が意味的に正確）。

### エラー処理（D-007）

| 状況 | ステータス | code |
| --- | --- | --- |
| 存在しない id への restore | 404 | `TASK_NOT_FOUND` |
| 通常状態のタスクへの restore | 400 | `TASK_NOT_IN_TRASH` |
| If-Match ヘッダなし / 数値以外 | 400 | `MISSING_IF_MATCH` |
| Idempotency-Key なし | 400 | `MISSING_IDEMPOTENCY_KEY` |
| If-Match と現行 version 不一致 | 412 | -（body に `{ task: current }`） |
| 認証なし | 401 | `UNAUTHORIZED` |

## 重要な決定

- **D-001（restoreTask の dueDate 固定）**: 復元後の `dueDate` は `"today"` に固定する。元の `dueDate`（`"tomorrow"` 等）に戻さない。理由: ゴミ箱から復元したタスクを「今日やるべきもの」として再配置する設計上の選択であり、spec.md §ゴールで確定済み。
- **D-002（TaskRepository の物理削除メソッドを分離）**: `delete(id)` / `deleteAllTrashed()` / `deleteTrashOlderThan(boundaryAt)` を別メソッドとして追加する。既存の `update` による論理削除と物理削除を明確に分離することで、誤ってアクティブタスクを消す事故を防ぐ。
- **D-003（日次清算の清算条件）**: `trashedAt < 今日の境界時刻` で清算する（spec.md §日次清算で確定）。「前日の境界時刻より古いもの」= 今日の境界時刻より前に入ったもの、という解釈で実装する。
- **D-004（purgeTrash のシグネチャ拡張）**: BL-010 のスタブシグネチャを `(db, clock, settingsRepository, taskRepository)` に拡張する。呼び出し元の `maybeRunDailyReset` も修正が必要。この変更は BL-010 の実装（`daily-reset.ts`）に影響するため、tasks.md でその修正を明示する。
- **D-005（`DELETE /api/v1/trash` は If-Match 不要）**: 全件削除に対して個別タスクの version 競合は無意味なため、If-Match を要求しない。冪等性は Idempotency-Key で担保する。
- **D-006（`/trash/{id}/restore` として実装）**: OpenAPI 骨格の `/tasks/{id}/restore` を使わず、`/trash/{id}/restore` を新規定義する。ゴミ箱リソース配下の操作として意味的に整合するため。

## リスク / 代替案

- **リスク: `purgeTrash` シグネチャ変更が BL-010 テストを壊す可能性**: `daily-reset.ts` の `purgeTrash` 呼び出し箇所を修正するため、BL-010 の既存テスト（API テスト）が壊れる可能性がある。対策: `purgeTrash` のシグネチャ変更と `maybeRunDailyReset` の修正は同一 PR でアトミックに行う。テストも同時に修正する。
- **代替案: `deleteTrashOlderThan` を Repository ではなく直 SQL で実装**: `purgeTrash` 内で直接 Drizzle の `db.delete().where(lt(tasks.trashedAt, boundary))` を呼ぶ方がシンプルだが、テスト容易性（in-memory Repository でモック可能）のため Repository メソッドとして抽象化する。

## テスト方針

- **単体テスト（ドメイン）**: `restoreTask` を純関数テスト。通常ケース（`"deleted"` → 復元 / `"completed"` → 復元 / dueDate が `"today"` になること / version +1 / createdAt 不変）。
- **単体テスト（purgeTrash 純関数部分）**: 清算条件の境界値テスト（`trashedAt` が境界時刻ぴったり / 1 ミリ秒前 / 1 ミリ秒後）。
- **結合テスト（サーバ API）**: spec.md の Gherkin シナリオと 1:1 対応するテストを `server/__tests__/` に追加。in-memory Repository を使用。
- **purgeTrash 結合テスト**: `maybeRunDailyReset` の既存テストに「清算対象タスクが物理削除される」シナリオを追加（BL-010 テストの拡張）。
