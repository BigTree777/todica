# タスク: タスク完了アクション（ゴミ箱経由 + カウント +1）

> [`plan.md`](plan.md) を実行可能な単位に分解する. TDD（失敗するテストを書く → 通す → リファクタ）を前提とする.
> 本 feature は BL-001（タスク CRUD）/ BL-002（タスク優先度）の最小差分拡張であり, タスク数は意図的に少なく抑える.

## 仕様 / 設計確定

- [x] spec.md 起票
- [x] plan.md 起票（§「既存実装の調査結果」で BL-001 / BL-002 充足状況を一覧化済）
- [ ] auditor によるドラフトレビュー（spec / plan の整合性, BL-001 / BL-002 との重複判定, Counter / FocusSelection に踏み込んでいないか）

## テスト（先行作成: TDD red）

### 単体（ドメイン）

- [ ] `domain/__tests__/task.test.ts` 相当に `completeTask` のテストを追加
  - 通常状態 → 完了遷移（`trashedReason = "completed"`, `trashedAt = clock.now()`, `updatedAt = clock.now()`, `version + 1`, `createdAt` 不変, 他フィールド不変）
  - 既 `"completed"` への complete → 入力と完全同一を返す（no-op）
  - 既 `"deleted"` への complete → 入力と完全同一を返す（`trashedReason` を書き換えない）

### 結合（サーバ）

- [ ] `server/__tests__/integration/tasks.test.ts` に以下シナリオを追加（spec.md と 1:1 対応）
  - 正常系: 通常状態 → POST `:id/complete` → 200 OK, `task.trashedReason === "completed"`, `task.trashedAt !== null`, `task.version === 2`, ストア更新
  - 完了後の GET `?trashed=false`（既定）に対象が含まれない
  - 完了後の GET `?trashed=true` に対象が含まれ, `trashedReason === "completed"`
  - 完了と削除の trashedReason 区別（complete → `"completed"`, delete → `"deleted"`. delete 側は既存テスト言及のみ）
  - 古い If-Match → 412 + 現行 task
  - If-Match 欠落 → 400 `MISSING_IF_MATCH`
  - Idempotency-Key 欠落 → 400 `MISSING_IDEMPOTENCY_KEY`
  - Idempotency-Key 同一値で 2 回送信 → 2 回目も同じ応答, ストアは 1 回しか遷移しない（version が 2 のまま）
  - 認証なし → 401
  - 存在しない id → 404 `TASK_NOT_FOUND`
  - 既 `"completed"` への complete → 200 OK + 現行 task（version / trashedAt 不変. If-Match 検証スキップ）
  - 既 `"deleted"` への complete → 200 OK + 現行 task（`trashedReason` は `"deleted"` のまま）

### 単体（クライアント）

- [ ] `web/__tests__/today-view.test.tsx` に以下シナリオを追加
  - タスク行に「完了」ボタンが 1 つ存在し, ラベルが「完了」
  - 完了ボタンクリック → `Repository.complete({ id, ifMatch: task.version })` が呼ばれる
  - 完了に成功すると, そのタスクが一覧から消える（楽観 UI）
  - 完了ボタンクリックで `Repository.delete` は呼ばれない

## 実装（バックエンド: red → green）

- [ ] `domain/src/task/index.ts` に `completeTask(current, clock): Task` を新設
  - 既 `trashedAt != null` なら no-op で `{ ...current }` を返す
  - それ以外は `trashedAt = clock.now()`, `trashedReason = "completed"`, `updatedAt = clock.now()`, `version + 1` を適用
- [ ] `server/src/app.ts` に `POST /api/v1/tasks/:id/complete` ハンドラを追加（PATCH / DELETE と並列に配置）
  - `taskRepository.findById` → 404 if NG
  - 既ゴミ箱状態（reason が `"completed"` / `"deleted"` どちらでも）→ 200 OK + 現行 task の no-op（If-Match 検証スキップ. `saveAndReturn` で idempotency 保管）
  - If-Match ヘッダなし / 数値以外 → 400 `MISSING_IF_MATCH`
  - `current.version !== ifMatch` → 412 + `{ task: current }`
  - `completeTask(current, clock)` で遷移 → `taskRepository.update(next)` → 200 OK + `{ task: next }`
  - Counter / FocusSelection 関連の依存は **追加しない**

## 実装（フロントエンド: red → green）

- [ ] `web/src/repositories/task-repository.ts` の `TaskRepository` インターフェースに `complete(cmd: CompleteTaskCommand): Promise<Task>` を追加
- [ ] `CompleteTaskCommand` 型を追加（`{ id: string; ifMatch: number }`）
- [ ] `HttpTaskRepository.complete` を実装（`HttpTaskRepository.delete` と同パターン. 200 OK で `{ task }` を返却. 412 で `OptimisticLockError` を投げる）
- [ ] `web/src/ui/today-view/today-view.tsx` のタスク行に「完了」ボタン + `handleComplete` ハンドラを追加（成功時 `setTasks(prev => prev.filter(t => t.id !== task.id))`）

## ドキュメント

- [ ] `docs/developer/architecture/api/openapi.yaml` の `POST /tasks/{id}/complete` を拡充
  - 200 OK の content に `{ task: $ref Task }` ボディを定義
  - 400 / 401 / 404 / 412 のレスポンスを既存 `$ref` で追記
  - description に「既ゴミ箱状態 (`"completed"` / `"deleted"` どちらでも) は no-op 冪等で 200 OK + 現行 task を返す」を明記
- [ ] `docs/developer/planning/backlog.md` の BL-003 を Done に更新（マージ後）

## 仕上げ

- [ ] spec.md の追加シナリオすべてに対応するテストが green
- [ ] BL-001 / BL-002 の既存テスト（`tasks.test.ts` / `today-view.test.tsx` の既存ケース）が引き続き green であること（DELETE の `"deleted"` 固定挙動 / PATCH の部分上書き原則が変わっていないことの担保）
- [ ] complete ハンドラ / `completeTask` / Repository.complete / UI 完了ボタンに **Counter / FocusSelection 関連の依存が混入していない** ことを目視確認
- [ ] auditor によるレビュー依頼（BL-001 / BL-002 との重複なし / spec カバレッジ / UI が NFR-001 / NFR-010 を侵していないか / Counter 集計を本 feature で実装していないか）
- [ ] PR を作成し main へマージ（マージ条件: 全テスト green + auditor 承認）
