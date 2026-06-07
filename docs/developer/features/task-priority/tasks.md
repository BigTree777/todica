# タスク: タスク優先度（3 段階の付与・変更）

> [`plan.md`](plan.md) を実行可能な単位に分解する. TDD（失敗するテストを書く → 通す → リファクタ）を前提とする.
> 本機能は BL-001（タスク CRUD）の最小差分拡張であり, タスク数は意図的に少なく抑える.

## 仕様 / 設計確定

- [x] spec.md 起票
- [x] plan.md 起票（§「既存実装の調査結果」で BL-001 充足状況を一覧化済）
- [ ] auditor によるドラフトレビュー（spec / plan の整合性, BL-001 との重複判定）

## テスト（先行作成: TDD red）

### 単体（ドメイン）

- [ ] `domain/task/updateTask` に priority 部分上書きの単体テストを追加
  - patch.priority 指定時のみ上書き / 未指定は不変 / version+1 / createdAt 不変
  - priority 値域違反 → `INVALID_PRIORITY` を返す

### 結合（サーバ）

- [ ] `server/__tests__/integration/tasks.test.ts` に以下シナリオを追加（spec.md と 1:1 対応）
  - POST: priority 省略 → normal
  - POST: priority = "highest" 明示
  - POST: priority = "later" 明示
  - PATCH: normal → highest（version+1, createdAt 不変, 他フィールド不変）
  - PATCH: later → highest
  - PATCH: normal → later
  - PATCH: 値域外 → 400 INVALID_PRIORITY, ストア不変
  - PATCH: name と priority を同時変更

### 単体（クライアント）

- [ ] `web/__tests__/today-view.test.tsx` に以下シナリオを追加
  - 起票フォームに任意項目「優先度」が存在し, 値域が 3 段階
  - 起票フォームで優先度を「最優先」に指定して送信 → `Repository.create.priority === "highest"`
  - 起票フォームで優先度を未操作 → `Repository.create.priority === "normal"`（または省略）
  - タスク行の優先度変更操作 → `Repository.update` の `patch.priority`, `ifMatch` が正しい
  - 優先度変更後の一覧並びが再描画される

## 実装（バックエンド: red → green）

- [ ] `domain/src/task/index.ts` の `UpdateTaskInput` に `priority?: Priority` を追加
- [ ] `domain/src/task/index.ts` の `updateTask` で patch.priority の検証 + 部分上書きを実装
- [ ] `server/src/app.ts` の PATCH ハンドラで body.priority を受理（enum 検証 → INVALID_PRIORITY, patch オブジェクトに積む）

## 実装（フロントエンド: red → green）

- [ ] `web/src/repositories/task-repository.ts` の `CreateTaskCommand` に `priority?: Priority` を追加
- [ ] `web/src/repositories/task-repository.ts` の `UpdateTaskCommand.patch` に `priority?: Priority` を追加
- [ ] `HttpTaskRepository.create` で body に priority を積む（既存 dueDate と同パターン）
- [ ] `HttpTaskRepository.update` で body に priority を積む
- [ ] `web/src/ui/today-view/today-view.tsx` の起票フォームに優先度 select を追加（既定 normal, 値域 3 段階, 表記「最優先 / 普通 / 後回し」）
- [ ] `today-view.tsx` のタスク行に現在の優先度ラベル表示を追加
- [ ] `today-view.tsx` のタスク行に優先度 cycle ボタン（normal → highest → later → normal）を追加し, `Repository.update` を呼ぶ

## ドキュメント

- [ ] `docs/developer/architecture/api/openapi.yaml` の `TaskPatch` スキーマに `priority` プロパティを追加（enum: highest / normal / later）
- [ ] `docs/developer/planning/backlog.md` の BL-002 を「Done」に更新（マージ後）

## 仕上げ

- [ ] spec.md の追加シナリオすべてに対応するテストが green
- [ ] BL-001 既存テスト（`tasks.test.ts` の既存ケース, `today-view.test.tsx` の既存ケース）が引き続き green であること（部分上書き原則の不変を確認）
- [ ] auditor によるレビュー依頼（BL-001 との重複なし / spec カバレッジ / UI が NFR-001 / NFR-010 を侵していないか）
- [ ] PR を作成し main へマージ（マージ条件: 全テスト green + auditor 承認）
