# タスク: 優先度 UI を星 3 つの評価式に変更 (priority-star-ui)

> [`plan.md`](plan.md) を実行可能な単位に分解する. 完了したらチェックを入れる.
> 各タスクには担当サブエージェント (test-designer / implementer / project-designer / auditor) を明記する.

## テスト設計 (red を作る)

- [ ] **T-001 (test-designer)**: `<PriorityStars />` 単体テスト `web/__tests__/priority-stars.test.tsx` を新規作成.
  対象 spec: REQ-1, REQ-2, REQ-4, AC-6. it ケース最低 6 件 (構造 / 初期 lit 数 / 1 つ目クリック / 3 つ目クリック / 同値クリック no-op / aria-label に現在値が乗る).

- [ ] **T-002 (test-designer)**: `web/__tests__/today-view.test.tsx` の優先度関連 it を書き換え.
  範囲: `describe("TodayView (BL-002 優先度 UI)", ...)` 配下の it. 「優先度 select」前提を「星 UI」前提 (3 つの role=radio) に置換. 一覧行の「cycle ボタンクリック」テストを「1 つ目の星クリックで PATCH priority="later"」へ変更.
  併せて, 同 describe 外で `[優先度: 普通]` 等の補助文字列を assert している箇所も外す.
  対象 spec: AC-1, AC-2, AC-3, AC-5, AC-6, AC-7, AC-10.

- [ ] **T-003 (test-designer)**: `web/__tests__/tomorrow-view.test.tsx` の優先度関連 it を書き換え.
  範囲: 起票フォームの 4 要素 (タスク名 / プロジェクト / 優先度 / 追加) assert を「優先度 = 星 UI」に修正. 「未指定で送信 → normal」「priority 指定なし PATCH の検証」は維持. カード上の「優先度切替が無い」assert は維持.
  対象 spec: AC-4.

- [ ] **T-004 (test-designer)**: `e2e/tasks.spec.ts` の「優先度ボタンを押すと表示と aria-label が更新される」を「星 1 つ目クリックで radiogroup の aria-label が "後回し" を含むに変わる」に書き換え.
  対象 spec: AC-5, AC-9 (axe は別ファイルなので変更不要).

## 実装 (green 化する)

- [ ] **T-005 (implementer)**: `<PriorityStars />` 本体を実装.
  作成ファイル: `web/src/ui/priority-stars/priority-stars.tsx`, `web/src/ui/priority-stars/priority-stars.css`.
  満たすべき: REQ-1, REQ-2, REQ-4, REQ-5, plan D-001〜D-006. T-001 を green にする.
  チェック観点: `npm run -w web test -- priority-stars` で green / axe ローカル実行で violations 0.

- [ ] **T-006 (implementer)**: today-view の起票フォームに組み込み.
  対象: `web/src/ui/today-view/today-view.tsx` の `<select id="task-priority">` ブロック.
  満たすべき: REQ-1, AC-1, AC-2, AC-3.

- [ ] **T-007 (implementer)**: today-view のタスクカードに組み込み (`focusedTask` セクション + 一覧行の両方).
  対象: `<button aria-label="優先度を切替">` の 2 箇所 + `[優先度: ...]` 補助表示 (plan D-004). 旧 `handleCyclePriority` / `NEXT_PRIORITY` の削除と新 `handleSetPriority` の追加.
  満たすべき: REQ-3, REQ-6, AC-5, AC-6, AC-7, AC-8, AC-10. T-002 を green にする.

- [ ] **T-008 (implementer)**: tomorrow-view の起票フォームに組み込み.
  対象: `<select id="tomorrow-task-priority">` ブロックの置換 + `[優先度: ...]` 補助表示の撤去.
  満たすべき: REQ-1, AC-4. T-003 を green にする.

## テスト (E2E green 化)

- [ ] **T-009 (implementer)**: E2E の修正を反映して `npm run test:e2e -- tasks.spec.ts a11y.spec.ts` を green にする.
  T-004 で書き換えた tasks.spec.ts の「星クリック」シナリオが通り, a11y.spec.ts で violations 0 を維持する.

## ドキュメント / 仕上げ

- [ ] **T-010 (project-designer)**: `docs/developer/planning/backlog.md` の BL-040 行の状態を Done に更新する (実装が green になった後).
  併せて備考に「BL-042 で前提として参照される」旨を残す.

- [ ] **T-011 (auditor)**: 監査.
  - spec の AC-1〜AC-10 すべてに対応するテストが存在し green であること.
  - WCAG 2.1 AA axe 違反 0 件 (e2e/a11y.spec.ts).
  - 既存テストの破壊が「優先度関連」のみで, 他 (focus / 期限切替 / 完了 / 削除 / プロジェクト) は touched でないこと.
  - `Priority` 型 / API / サーバが無改修であること.
  - 旧 cycle ボタン (`<button aria-label="優先度を切替">`) と `[優先度: ...]` 補助表示がコードベースから消えていること (grep で 0 件).
  - 問題があれば該当サブエージェントに差し戻し.

## 受け入れ基準と完了条件

- [ ] [`spec.md`](spec.md) の AC-1〜AC-10 がすべてテストとして表現され, 全 green.
- [ ] auditor (T-011) の承認.
- [ ] `main` への PR レビュー完了.
