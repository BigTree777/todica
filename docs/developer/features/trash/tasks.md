# タスク: ゴミ箱（閲覧・復元・手動「空にする」・日次清算）

> [`plan.md`](plan.md) を実行可能な単位に分解する。完了したらチェックを入れる。
>
> 実装は TDD で進める: 「失敗するテストを書く → 通す → リファクタ」のサイクル。

---

## フェーズ 1: ドメイン関数 `restoreTask`

### テスト（先行）

- [ ] `domain/__tests__/task.test.ts`（または相当ファイル）に `restoreTask` のテストを追加する
  - [ ] `trashedReason = "deleted"` のタスクを restoreTask すると `trashedAt = null`, `trashedReason = null`, `dueDate = "today"`, `version + 1`, `updatedAt = clock.now()` になる
  - [ ] `trashedReason = "completed"` のタスクを restoreTask しても同様に復元される
  - [ ] 復元後の `dueDate` は元の値（`"tomorrow"` 等）ではなく `"today"` になる
  - [ ] `createdAt` は変更されない
  - [ ] `name`, `projectId`, `priority`, `origin`, `routineId` は変更されない

### 実装

- [ ] `domain/src/task/index.ts` に `restoreTask(current: Task, clock: Clock): Task` を追加する
  - `trashedAt = null`, `trashedReason = null`, `dueDate = "today"`, `updatedAt = clock.now()`, `version + 1`
  - ゴミ箱状態でないタスクへの呼び出しは API ハンドラ側でガードするため、ドメイン関数自体はガードしない

---

## フェーズ 2: TaskRepository の物理削除メソッド追加

### テスト（先行）

- [ ] in-memory TaskRepository の実装 (`server/__tests__/helpers/in-memory-repositories.ts`) に物理削除メソッドを追加する
  - [ ] `delete(id)`: 指定 id のタスクを削除。存在しない場合は no-op
  - [ ] `deleteAllTrashed()`: `trashedAt != null` のタスクを全件削除。通常状態のタスクは残る
  - [ ] `deleteTrashOlderThan(boundaryAt)`: `trashedAt < boundaryAt` のタスクを削除
  - [ ] 各メソッドの動作を確認するユニットテストを書く

### 実装

- [ ] `server/src/data/task-repository.ts` の `TaskRepository` インターフェースに以下を追加する
  ```typescript
  delete(id: string): Promise<void>;
  deleteAllTrashed(): Promise<void>;
  deleteTrashOlderThan(boundaryAt: string): Promise<void>;
  ```
- [ ] SQLite 実装（`server/src/data/task-repository-sqlite.ts` 相当）に各メソッドを実装する
  - `delete`: `DELETE FROM tasks WHERE id = ?`
  - `deleteAllTrashed`: `DELETE FROM tasks WHERE trashed_at IS NOT NULL`
  - `deleteTrashOlderThan`: `DELETE FROM tasks WHERE trashed_at IS NOT NULL AND trashed_at < ?`

---

## フェーズ 3: `purgeTrash` の本実装

### テスト（先行）

- [ ] `server/__tests__/use-cases/purge-trash.test.ts`（または `maybe-run-daily-reset.test.ts` に追加）でテストを書く
  - 清算対象あり:
    - [ ] `trashedAt < 今日の境界時刻` のタスクが物理削除される
    - [ ] `trashedAt >= 今日の境界時刻` のタスクは残る
    - [ ] 通常状態のタスク（`trashedAt = null`）は削除されない
  - 清算対象なし:
    - [ ] 清算対象が 0 件でも例外を投げずに正常終了する
  - 境界値:
    - [ ] `trashedAt` が境界時刻ぴったりのタスクは清算対象外（`<` であって `<=` ではない）
    - [ ] `trashedAt` が境界時刻の 1 ミリ秒前のタスクは清算対象
  - BL-010 の既存テスト (`daily-reset.test.ts`) に以下を追加:
    - [ ] 日次リセット実行後に `purgeTrash` が呼ばれ、前日の境界時刻より古いゴミ箱タスクが削除される
    - [ ] 日次リセット不要の場合は `purgeTrash` が呼ばれない（タスクは削除されない）

### 実装

- [ ] `server/src/use-cases/purge-trash.ts` のスタブを本実装に置き換える
  - シグネチャを `(db, clock, settingsRepository, taskRepository)` に拡張する
  - `calcTodayBoundaryAt(clock.now(), settings.dayBoundaryTime)` で今日の境界時刻を算出
  - `taskRepository.deleteTrashOlderThan(todayBoundaryAt)` を呼ぶ

- [ ] `server/src/use-cases/daily-reset.ts` の `maybeRunDailyReset` を修正する
  - `purgeTrash(deps.db, deps.clock)` の呼び出しを `purgeTrash(deps.db, deps.clock, deps.settingsRepository, deps.taskRepository)` に変更する

---

## フェーズ 4: `GET /api/v1/trash` ハンドラ

### テスト（先行）

- [ ] `server/__tests__/app/trash.test.ts`（または `trash-list.test.ts`）を作成する
  - [ ] ゴミ箱タスクが存在するとき、200 OK と tasks 配列が返る
  - [ ] 通常状態のタスクは結果に含まれない
  - [ ] ゴミ箱が空のとき、200 OK と空配列が返る
  - [ ] 認証なし → 401 UNAUTHORIZED

### 実装

- [ ] `server/src/app.ts` に `GET /api/v1/trash` ハンドラを追加する
  - `taskRepository.list({ trashed: "true" })` を呼んで結果を返す
  - レスポンス形状: `{ tasks: Task[] }`

---

## フェーズ 5: `POST /api/v1/trash/:id/restore` ハンドラ

### テスト（先行）

- [ ] `server/__tests__/app/trash.test.ts` に restore のテストを追加する
  - 正常系:
    - [ ] `trashedReason = "deleted"` のタスクを復元 → 200 OK, `{ task: { trashedAt: null, trashedReason: null, dueDate: "today", version: +1 } }`
    - [ ] `trashedReason = "completed"` のタスクを復元 → 同様
    - [ ] `createdAt` が変更されないこと
    - [ ] GET /api/v1/trash で復元したタスクが含まれなくなること
  - 異常系:
    - [ ] 存在しない id → 404 `TASK_NOT_FOUND`
    - [ ] 通常状態のタスクへの restore → 400 `TASK_NOT_IN_TRASH`
    - [ ] 古い If-Match → 412 + 現行 task
    - [ ] If-Match なし → 400 `MISSING_IF_MATCH`
    - [ ] Idempotency-Key なし → 400 `MISSING_IDEMPOTENCY_KEY`
    - [ ] 認証なし → 401 UNAUTHORIZED
  - 冪等性:
    - [ ] 同一 Idempotency-Key で 2 回送信 → 2 回目も同じ応答、version が増えない（Idempotency-Key キャッシュによる）

### 実装

- [ ] `server/src/app.ts` に `POST /api/v1/trash/:id/restore` ハンドラを追加する
  - plan.md §処理フロー（D-005）に従って実装する
  - `restoreTask` ドメイン関数を使用する
  - `saveAndReturn` で冪等キャッシュに保存して返す

---

## フェーズ 6: `DELETE /api/v1/trash` ハンドラ

### テスト（先行）

- [ ] `server/__tests__/app/trash.test.ts` に「空にする」のテストを追加する
  - [ ] ゴミ箱タスクが全件物理削除される（204 No Content）
  - [ ] 通常状態のタスクは残る
  - [ ] ゴミ箱が空でも 204 No Content が返る（no-op）
  - [ ] 認証なし → 401 UNAUTHORIZED
  - [ ] Idempotency-Key なし → 400 `MISSING_IDEMPOTENCY_KEY`
  - [ ] 同一 Idempotency-Key で 2 回送信 → 2 回目も 204（Idempotency-Key キャッシュによる）

### 実装

- [ ] `server/src/app.ts` に `DELETE /api/v1/trash` ハンドラを追加する
  - `taskRepository.deleteAllTrashed()` を呼ぶ
  - レスポンス: 204 No Content
  - `saveAndReturn` で冪等キャッシュに保存して返す

---

## フェーズ 7: openapi.yaml の更新

- [ ] `GET /api/v1/trash` の 200 レスポンスボディを具体化する（`{ tasks: Task[] }`）
- [ ] `/trash/{id}/restore` を `POST` として追加定義する
  - 200 OK ボディ: `{ task: Task }`
  - 400（`TASK_NOT_IN_TRASH` / `MISSING_IF_MATCH` / `MISSING_IDEMPOTENCY_KEY`）
  - 401 / 404 / 412
- [ ] `DELETE /api/v1/trash` の 204 レスポンスを具体化する
- [ ] `ErrorCode` enum に `TASK_NOT_IN_TRASH` を追加する

---

## 仕上げ

- [ ] spec.md の受け入れ基準を全て満たすことを確認する
  - [ ] ゴミ箱一覧（GET /api/v1/trash）
  - [ ] タスク復元（POST /api/v1/trash/:id/restore）の全シナリオ
  - [ ] 手動「空にする」（DELETE /api/v1/trash）の全シナリオ
  - [ ] 日次清算（purgeTrash の本実装）の全シナリオ
  - [ ] スコープ境界の明示（completedCount を変更しない）
- [ ] BL-010 の既存テスト（`daily-reset.test.ts`, `app/reset.test.ts`）が引き続き green であることを確認する
- [ ] `purgeTrash` 呼び出し箇所（`daily-reset.ts`）の修正が正しいことを確認する
- [ ] レビュー依頼（auditor へ）
