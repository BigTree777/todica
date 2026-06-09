# タスク: プロジェクト選択をトグル UI に変更 (project-toggle-ui)

> [`plan.md`](plan.md) を実行可能な単位に分解する. 完了したらチェックを入れる.
> 各タスクには担当サブエージェント (test-designer / implementer / project-designer / auditor) を明記する.

## テスト設計 (red を作る)

- [ ] **T-001 (test-designer)**: `<ProjectToggle />` 単体テスト `web/__tests__/project-toggle.test.tsx` を新規作成.
  対象 spec: REQ-1, REQ-2, REQ-3, REQ-4, AC-1, AC-2, AC-6, AC-7. it ケース最低 7 件 (構造 / 初期表示「（未分類）」 / 1 クリックで先頭プロジェクト / 末尾クリックで未分類に戻る / projects 空のとき no-op / 削除済 id は次クリックで null に矯正 / aria-label に現在値が乗る / キーボード Space/Enter で巡回).

- [ ] **T-002 (test-designer)**: `web/__tests__/today-view.test.tsx` のプロジェクト関連 it を書き換え.
  範囲:
  - `describe("TodayView (BL-016 プロジェクト選択 UI)", ...)` 配下の 3 件 (起票フォーム表示 / 選択して起票 / 未選択で起票).
  - 起票フォーム要素列挙の it (305-326 行付近, "起票フォームはタスク名のみ必須である") のうち `<select id="task-project">` 前提の assert を, トグルボタン (`role="button"` + name に「プロジェクト」を含む) の存在 assert に置換.
  - `userEvent.selectOptions(...)` → `userEvent.click(toggleButton)` への置換 (1 周クリックで目的プロジェクトに到達).
  維持:
  - `repository.create` への projectId 送信 assert (`PROJECT_ID_P1` / `null`).
  - その他の it (期限切替 / 完了 / 削除 / focus / 優先度) は変更しない.
  対象 spec: AC-1, AC-3, AC-4.

- [ ] **T-003 (test-designer)**: `web/__tests__/tomorrow-view.test.tsx` のプロジェクト関連 it を書き換え.
  範囲:
  - シナリオ A (起票フォーム要素列挙, 454 行付近) で `<select>` 前提の assert をトグル button に置換.
  - 起票時 `projectId === null` の assert (555 行付近) は維持. 「未分類」のままで「追加」が動くことを確認.
  - PATCH の `patch.projectId === undefined` (686 行付近) は無修正.
  - カード上のプロジェクト表示 (864-866 行付近) も無修正.
  対象 spec: AC-5.

- [ ] **T-004 (test-designer)**: E2E 巡回シナリオを追加.
  新規ファイル: `e2e/project-toggle.spec.ts` (1 件: プロジェクト 2 件作成 → トグルを 1 回クリックして "仕事" を選ぶ → タスク名入力 → 追加 → 作成タスクが "仕事" の projectId で出る).
  既存ファイル改修: `e2e/projects.spec.ts` の「カスケード null」テスト (16- 行) で `selectOption` をトグル click 経路に書き換え.
  対象 spec: AC-3, AC-5, AC-9 (axe は別ファイル).

## 実装 (green 化する)

- [ ] **T-005 (implementer)**: `<ProjectToggle />` 本体を実装.
  作成ファイル: `web/src/ui/project-toggle/project-toggle.tsx`, `web/src/ui/project-toggle/project-toggle.css`.
  満たすべき: REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, plan D-001〜D-008.
  チェック観点: `npm run -w web test -- project-toggle` で green / axe ローカル実行で violations 0 / T-001 を green にする.

- [ ] **T-006 (implementer)**: today-view の起票フォームに `<ProjectToggle />` を組み込み.
  対象: `web/src/ui/today-view/today-view.tsx` の `<select id="task-project">` ブロック (466-480 行付近).
  処理: 
  - `<label htmlFor="task-project">` + `<select>` を削除.
  - `<ProjectToggle value={projectId === "" ? null : projectId} onChange={(next) => setProjectId(next ?? "")} projects={projects} idPrefix="create" />` を配置.
  - 既存の `projectId` state (`useState("")`) と `handleCreate` 内の `projectId: projectId ? projectId : null` は無修正 (D-004 境界変換).
  - 起票後リセット (`setProjectId("")`) も既存どおり.
  満たすべき: REQ-1, REQ-6, AC-1, AC-2, AC-3, AC-4, AC-10. T-002 を green にする.

- [ ] **T-007 (implementer)**: tomorrow-view の起票フォームに `<ProjectToggle />` を組み込み.
  対象: `web/src/ui/tomorrow-view/tomorrow-view.tsx` の `<select id="tomorrow-task-project">` ブロック (326-340 行付近).
  処理:
  - `<label htmlFor="tomorrow-task-project">` + `<select>` を削除.
  - `<ProjectToggle value={projectId === "" ? null : projectId} onChange={(next) => setProjectId(next ?? "")} projects={projects} idPrefix="tomorrow-create" />` を配置.
  - カード上のプロジェクト副情報表示 (363-365 行付近) には触らない (非ゴール).
  満たすべき: REQ-1, REQ-6, AC-5. T-003 を green にする.

## テスト (E2E green 化)

- [ ] **T-008 (implementer)**: E2E の修正を反映して `npm run test:e2e -- project-toggle.spec.ts projects.spec.ts a11y.spec.ts` を green にする.
  T-004 で書き換えた / 新規作成した 2 ファイルが通り, a11y.spec.ts で violations 0 を維持する.

## ドキュメント / 仕上げ

- [ ] **T-009 (project-designer)**: `docs/developer/planning/backlog.md` の BL-041 行の状態を Doing → Done に更新する (実装が green になった後).
  併せて備考に「BL-044 (`+プロジェクトの追加` ボタン) で前提として参照される」旨を残す.

- [ ] **T-010 (auditor)**: 監査.
  - spec の AC-1〜AC-10 すべてに対応するテストが存在し green であること.
  - WCAG 2.1 AA axe 違反 0 件 (e2e/a11y.spec.ts).
  - 既存テストの破壊が「プロジェクト関連」のみで, 他 (focus / 期限切替 / 完了 / 削除 / 優先度) は touched でないこと.
  - `Project` 型 / `ProjectRepository` / API / サーバが無改修であること.
  - 旧 `<select id="task-project">` / `<select id="tomorrow-task-project">` がコードベースから消えていること (grep で 0 件).
  - タスクカード上のプロジェクト副情報表示が無修正で残っていること (AC-8).
  - 問題があれば該当サブエージェントに差し戻し.

## 受け入れ基準と完了条件

- [ ] [`spec.md`](spec.md) の AC-1〜AC-10 がすべてテストとして表現され, 全 green.
- [ ] auditor (T-010) の承認.
- [ ] `main` への PR レビュー完了.
