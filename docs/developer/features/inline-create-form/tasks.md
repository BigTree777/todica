# タスク: 起票フォームから期限セレクトを削除 (ビュー文脈で dueDate 決定)

> [`plan.md`](plan.md) を実行可能な単位に分解する. 完了したらチェックを入れる.

## 実装

- [x] **T-001 (test-designer)** `web/__tests__/today-view.test.tsx` 305-326 行のシナリオ「今日ビューの起票フォームはタスク名のみ必須である」の 318-319 行のアサーション (`expect(dueDateControl).not.toBeNull()`) を「起票フォーム内に期限 UI が存在しないこと」を期待する向きへ反転する. これにより red 状態を作る (現状実装では fail する).
- [x] **T-002 (implementer)** `web/src/ui/today-view/today-view.tsx` の起票フォーム (`<form aria-label="タスク起票フォーム">`, 467-518 行付近) から `<label htmlFor="task-due-date">期限</label>` と対応 `<select id="task-due-date">` 要素を削除する.
- [x] **T-003 (implementer)** `today-view.tsx` の `const [dueDate, setDueDate] = useState<DueDate>("today")` (119 行付近) を削除し, `handleCreate` (345-363 行付近) 内の `CreateTaskCommand` 構築で `dueDate: "today"` をリテラルで指定する. submit 後の `setDueDate("today")` 呼び出しも削除. `handleCreate` の `useCallback` 依存配列から `dueDate` を除く. `import type { DueDate, ... }` は `handleToggleDueDate` で参照され続けるため残す.

## テスト

- [x] **T-004 (test-designer + implementer)** `web/__tests__/today-view.test.tsx` の他シナリオ (起票成功 / 期限切替 / 完了 / 削除 / focus / routine 「明日へ」非表示 等) を実行し, 起票フォーム外の期限関連テスト (376-395 / 818-840 / 1088 行付近 / 1246-1270 / 1319-1360 行付近) が無修正で green を維持することを確認する.
- [x] **T-005 (implementer)** `e2e/tasks.spec.ts` の「「明日へ」を押すと今日の一覧から消える」(50-59 行) を含む E2E 全シナリオを実機ブラウザで実行し, 起票 (`createTask` helper) → カード上「明日へ」ボタン → 一覧から消える の経路が green を維持することを確認する.

## ドキュメント

- [x] **T-006 (project-designer)** `docs/developer/planning/backlog.md` の BL-039 行を Doing → Done に更新する (auditor 承認後に行う. 本タスクは承認待ち状態で着手).

## 仕上げ

- [x] **T-007 (auditor)** 受け入れ基準 (spec.md §「受け入れ基準」全シナリオ) を満たすことを確認する. 特に以下を重点的に検査:
  - REQ-1: 起票フォームの入力要素が 4 つのみ (期限 UI が DOM 上に存在しない).
  - REQ-2: `repository.create` 呼び出し時の `dueDate` が常に `"today"` である.
  - REQ-3: タスクカード上の「明日へ」ボタンが引き続き機能する (BL-007 / FR-005 維持).
  - REQ-6: 既存テストの修正範囲が 1 アサーションのみで, 他のテストは無修正であること.
  - 非ゴール: focus-view / tomorrow-view / 編集フォーム / サーバ API に変更が入っていないこと.
  - BL-029 の axe 検査で violations 0 が維持されていること.
