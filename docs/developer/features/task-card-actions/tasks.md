# タスク: タスクカードのアクションを 3 つに削減 (task-card-actions)

> [`plan.md`](plan.md) を実行可能な単位に分解する. 完了したらチェックを入れる.

## 実装フェーズ

### テスト先行 (test-designer)

- [ ] **T-001 (test-designer): today-view.test.tsx の編集系シナリオを撤去 + ラベル更新**
  - 対象 `web/__tests__/today-view.test.tsx`.
  - (a) 「シナリオ: 既存タスクの名称を編集して保存できる」(409〜) を削除 or `it.skip` に変更.
  - (b) 「TodayView (BL-006 setFocus) - 「現在に設定」」(1147〜) と「「現在解除」」(1199〜) を削除 or `it.skip`.
  - (c) `name: /明日へ|期限|今日へ/` の regex を `name: /明日にする|今日にする/` に更新 (1001 行付近).
  - (d) `name: /編集/` の getByRole 呼び出しが残らないよう全置換.
  - 期待: テスト件数が一時的に減るが既存 green 部は引き続き green を保つ準備.
  - 成果物: red を残さない (skip / 削除のみ).

- [ ] **T-002 (test-designer): today-view.test.tsx に「カードの button が 3 つだけ」シナリオを追加**
  - 対象 `web/__tests__/today-view.test.tsx`.
  - 受け入れ基準 AC-1 / AC-2 / AC-10 / AC-11 に対応.
  - 追加シナリオ:
    - 「カード内に accessibleName=「削除 / 明日にする / 完了」の button が各 1 個ずつ存在する」
    - 「カード内に accessibleName=「編集 / 現在に設定 / 現在解除 / 明日へ / 今日へ」の button が存在しない」
    - 「強調セクション内も同様 (3 ボタン + PriorityStars + タスク名のみ)」
    - 「`aria-label="タスク編集フォーム"` の form が DOM に存在しない」
  - PriorityStars の星 button はカウントから除外する設計 (`accessibleName` での検出に依存しない. 「削除 / 明日にする / 完了」の 3 個を `findByRole("button", { name: ... })` で個別に取得).
  - 期待: 本タスク完了時点でテストは red (実装が無いため).

- [ ] **T-003 (test-designer): today-view.test.tsx に routine origin の AC-8 シナリオを追加**
  - 対象 `web/__tests__/today-view.test.tsx`.
  - 受け入れ基準 AC-8 に対応.
  - 追加: 「origin=\"routine\" のタスクでは「明日にする」 button が存在せず, 「削除」「完了」の 2 つだけが残る」.
  - 期待: red (実装次第).

- [ ] **T-004 (test-designer): tomorrow-view.test.tsx を「3 ボタン (削除 / 今日にする / 完了)」前提に書き換え**
  - 対象 `web/__tests__/tomorrow-view.test.tsx`.
  - (a) 既存「シナリオ A: 1 件目のカード内のボタンは「削除」「今日にする」の 2 つのみ」(664〜) を「3 つ (削除 / 今日にする / 完了) のみ」に書き換え.
  - (b) 既存「TomorrowView は complete を呼ばないはず」コメント (267〜) を撤去 + 「呼ぶ」反転.
  - (c) 新規シナリオ追加 (AC-6 対応):
    - 「「完了」クリックで `repository.complete({ id, ifMatch: task.version })` が 1 回呼ばれる」
    - 「完了成功後に `["tomorrow"]` / `["today"]` / `["focus"]` が invalidate される (queryClient のスパイで確認)」
    - 「ConflictDialog 経路 (online 412 → dialog) が完了でも動く」(BL-031 と互換)
  - (d) routine origin の「完了」も押せるシナリオを追加 (任意 / spec U-2).
  - 期待: red (実装が無いため).

- [ ] **T-005 (test-designer): E2E の編集テストを skip + 明日へラベル更新**
  - 対象 `e2e/tasks.spec.ts`.
  - (a) 「タスクを編集すると名前が一覧に反映される」を `test.skip(...)` に変更. `// BL-042 でカード上の編集 button を撤去. 代替 BL (TBD) で復活予定.` コメントを残す.
  - (b) 「「明日へ」を押すと今日の一覧から消える」の `name: "明日へ"` を `name: "明日にする"` に更新.
  - 期待: skip 後の green / 文言更新後の green 化 (実装後).

### 実装 (implementer)

- [ ] **T-006 (implementer): today-view.tsx のカード JSX 削減と handler 撤去**
  - 対象 `web/src/ui/today-view/today-view.tsx`.
  - (a) 強調セクション (`<section aria-label="現在のタスク">`) 内から「編集」/「現在解除」 button JSX を削除.
  - (b) 一覧 (`<ul aria-label="タスク一覧">`) 内から「編集」/「現在に設定」 button JSX を削除.
  - (c) 「明日へ / 今日へ」ラベルを「明日にする / 今日にする」に更新 (両所).
  - (d) state `editingTask`, `editingName` の `useState` 削除.
  - (e) handler `openEdit`, `cancelEdit`, `handleSaveEdit`, `handleSetFocus` 削除.
  - (f) 編集フォームの JSX (`{isEditing && ...}`) と `isEditing` 変数を削除.
  - (g) `setFocusMutation` 定義 + import (`SetFocusCommand` の不要分) を削除.
  - 期待: T-001 〜 T-003 と既存テスト全てが green.

- [ ] **T-007 (implementer): tomorrow-view.tsx に「完了」 button + completeMutation を追加**
  - 対象 `web/src/ui/tomorrow-view/tomorrow-view.tsx`.
  - (a) `completeMutation` を today-view と同形で追加. `onSuccess` は既存 `invalidateAfterMoveToToday` を流用 (D-1).
  - (b) `handleComplete` を追加.
  - (c) `<div className="tomorrow-view__actions">` 内に `<button>完了</button>` を追加 (順序: 削除 / 今日にする / 完了).
  - (d) `import` に `CompleteTaskCommand` を追加.
  - 期待: T-004 で追加した完了系シナリオが green.

- [ ] **T-008 (implementer): focus-view.tsx の無改修確認 (回帰防止)**
  - 対象 `web/src/ui/focus-view/focus-view.tsx`.
  - 変更しない. 既存テスト (`web/__tests__/focus-view.test.tsx` / `e2e/focus-view.spec.ts`) を実行して green を確認するだけ.
  - 期待: 既存テスト件数 / 内容に diff が無い.

### 監査 / ドキュメント

- [ ] **T-009 (project-designer): backlog.md の BL-042 を Done に更新**
  - 対象 `docs/developer/planning/backlog.md` の `| BL-042 | ... | Doing |` 行.
  - 状態を `Done` に変更し, メモに「実装ブランチ名 + spec/plan/tasks 参照 + 残課題 (編集 UI 復活 BL の起票)」を記載.
  - **(派生タスク)** 編集 UI 復活 BL (BL-048 候補) を backlog に追加する Yes/No をユーザーに確認する (本 BL の責務外だが起票判断を要請).

- [ ] **T-010 (auditor): 仕様適合 + テスト妥当性の監査**
  - チェックリスト:
    - [ ] `/today` のカードに 3 個以下の button (REQ-1 / AC-1 / AC-2).
    - [ ] `/tomorrow` のカードに 3 個の button (REQ-2 / AC-3).
    - [ ] focus-view 無改修 (REQ-6 / AC-9).
    - [ ] axe violations 0 件 (NFR-A11Y / AC-12).
    - [ ] ConflictDialog / notifyError 経路の動作 (REQ-5 / AC-13).
    - [ ] routine origin の挙動継承 (AC-8 / spec U-2).
    - [ ] 編集 UI 撤去の代替 BL が backlog に登録されているか (spec U-4).
    - [ ] `setFocusMutation` の削除が完了し dead code が残っていないか.
    - [ ] 既存 BL-040 / BL-041 / BL-037 / BL-038 / BL-031 / BL-034 のテストが回帰していない.
  - 不備があれば該当タスクへ差し戻し.

## テスト

- [ ] 単体テスト (`web/__tests__/today-view.test.tsx`, `web/__tests__/tomorrow-view.test.tsx`) green.
- [ ] 既存単体テスト (`focus-view.test.tsx` 等) 回帰なし.
- [ ] E2E (`e2e/tasks.spec.ts`, `e2e/tomorrow-view.spec.ts`, `e2e/focus-view.spec.ts`, `e2e/a11y.spec.ts`) green.
- [ ] axe violations 0 件 (BL-029 既存検査).

## ドキュメント

- [ ] `docs/developer/planning/backlog.md` の BL-042 を Done に更新 (T-009).
- [ ] 編集 UI 復活 BL を backlog に追加するかをユーザーに確認 (T-009 派生).

## 仕上げ

- [ ] 受け入れ基準 (spec.md) AC-1 〜 AC-13 を全て満たすことを確認.
- [ ] auditor 承認 (T-010).
- [ ] PR 作成 → main へマージ.
