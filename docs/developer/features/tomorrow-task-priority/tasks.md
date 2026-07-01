# タスク: 明日ビューのタスク優先度変更 (tomorrow-task-priority)

> [`plan.md`](plan.md) を実行可能な単位に分解する。完了したらチェックを入れる。
> ブランチ: `feature/tomorrow-task-priority`。

## テスト設計（先行 / TDD）

- [ ] `web/__tests__/tomorrow-view.test.tsx` に失敗するテストを追加する（test-designer）:
  - [ ] REQ-1: カードに radiogroup + radio×3 が表示され、現在値 normal で星 2 つが lit。
  - [ ] REQ-1: 起票フォームの radiogroup とカードの radiogroup が別インスタンスで共存する。
  - [ ] REQ-2: カードの 3 番目の星クリックで `update({ id, ifMatch, patch: { priority: "highest" } })` が 1 回。patch に dueDate/name/projectId を含まない。
  - [ ] REQ-3: 現在値と同じ星のクリックで `update` が呼ばれない。
  - [ ] REQ-4: 優先度変更後に listMock（`["tomorrow"]`）が再フェッチされる。
  - [ ] REQ-5（最重要）: 優先度変更後、listMock は増えるが todayMock / getFocusMock は増えない。対照として「今日にする」は 3 つとも増える（既存 シナリオ C を維持）。
  - [ ] REQ-6: 優先度変更の online 412 で ConflictDialog が開く / ネットワークエラーで `notifyError("通信に失敗しました")`。
  - [ ] 回帰: カードのアクションボタン「削除 / 今日にする / 完了」構成が不変。

## 実装

- [ ] `web/src/ui/tomorrow-view/tomorrow-view.tsx`（implementer）:
  - [ ] 系統 A の `useTaskMutations`（`invalidateKeys: [["tomorrow"]]`）から `update: updatePriorityMutation` を追加 destructure する（D-002）。※ 既存の系統 B `updateMutation`（3 key）は据え置き、name/project/今日にする はそのまま。
  - [ ] `handleSetPriority(task, next)` を追加（D-001 / D-003）: `task.priority === next` の二重ガード → `updatePriorityMutation.mutateAsync({ id: task.id, ifMatch: task.version, patch: { priority: next } })` を try/catch で包む（catch 空）。
  - [ ] リストの `<TaskCard>` を `showPriority={false}` → `showPriority`（true）に変更し、`onSetPriority={(next) => handleSetPriority(task, next)}` を配線する。
  - [ ] ファイル冒頭コメントの「showPriority=false（優先度星を持たない既存仕様）」記述を現行仕様（星表示・変更あり / 優先度変更は `["tomorrow"]` のみ invalidate）に更新する。

## ドキュメント

- [ ] `docs/developer/architecture/web-client/`（存在すれば tomorrow-view / mutation invalidate を記述する現行 doc）を現状追従で更新する。architecture/ が現行状態の正本のため、優先度変更あり・invalidate 差分（優先度=tomorrow のみ / 今日にする=3 key）を反映する。architecture-reviewer に横断整合を委ねてよい。
- [ ] `docs/developer/features/tomorrow-view/spec.md` は **書き換えない**（過去記録として据え置き）。理由: features/ 配下は履歴（記録）であり、陳腐化を理由に更新しない方針。明日ビューの優先度に関する現行正本は本 feature dir の spec.md とする（spec §「先行 spec との関係」/ plan D-005）。
  - ※ backlog BL-142 の「doc 追従: tomorrow-view/spec.md を更新」記述は、features/=履歴の原則を優先して本 feature dir 側に新仕様を置く形で満たす。project.md は編集しない。

## 仕上げ

- [ ] 受け入れ基準（spec.md）を全て満たすことを確認。
- [ ] `npx vitest run`（repo ルートから）で全テスト green。
- [ ] `npm run lint`（warning 0）/ `npm run typecheck`（pass）。
- [ ] auditor による仕様適合・品質レビュー。必要に応じ architecture-reviewer で doc/code 横断整合。
</content>
