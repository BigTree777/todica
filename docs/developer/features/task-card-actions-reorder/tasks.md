# タスク: TaskCard actions の DOM 順を「削除 → 現在のタスクにする → 明日にする → 完了」に変更 (task-card-actions-reorder)

> [`plan.md`](plan.md) を実行可能な単位に分解する. 完了したらチェックを入れる.

## 実装

- [ ] `web/src/ui/task-card/task-card.tsx` の `<div className="task-card__actions">` 内の button JSX を以下の順序に入れ替える (REQ-1 / D-001).
  1. `<button type="button" className="task-card__actions__delete" onClick={onDelete}>削除</button>`
  2. `{showSetFocus && onSetFocus && (<button type="button" onClick={onSetFocus}>現在のタスクにする</button>)}`
  3. `{showDueDateBtn && onToggleDueDate && (<button type="button" onClick={onToggleDueDate}>{dueDateMode === "today" ? "明日にする" : "今日にする"}</button>)}`
  4. `<button type="button" className="task-card__actions__complete" onClick={onComplete}>完了</button>`
- [ ] `web/src/ui/task-card/task-card.css` が無改修であることを確認する (NFR-CSS-FROZEN / AC-10).
- [ ] `web/src/ui/task-card/task-form-card.tsx` が無改修であることを確認する (NFR-FORMCARD-FROZEN / AC-11).
- [ ] 各 view (today-view / tomorrow-view / focus-view) の `<TaskCard ... />` 呼び出し側が無改修であることを確認する (AC-12).
- [ ] `TaskCardProps` の 14 フィールドに差分が無いことを確認する (NFR-API-FROZEN / AC-9).

## テスト

### 単体テスト (新規)

- [ ] `web/__tests__/task-card-actions-reorder.test.tsx` を新規作成し, AC-1 〜 AC-8 を網羅する (D-003).
  - [ ] AC-1: `actionSet="full" + showSetFocus=true + dueDateMode="today" + manual origin` で DOM 順「削除 → 現在のタスクにする → 明日にする → 完了」.
  - [ ] AC-2: 削除 button が DOM 順最先頭 + className "task-card__actions__delete" を持つ.
  - [ ] AC-3: 完了 button が DOM 順最末尾 + className "task-card__actions__complete" を持つ.
  - [ ] AC-4: 「現在のタスクにする」 button が削除と「明日にする」の間.
  - [ ] AC-5: `dueDateMode="tomorrow"` で「今日にする」が「現在のタスクにする」と「完了」の間.
  - [ ] AC-6: `showSetFocus=false + actionSet="full"` で DOM 順「削除 → 明日にする → 完了」(3 ボタン).
  - [ ] AC-7: `task.origin="routine" + actionSet="full" + showSetFocus=true` で DOM 順「削除 → 現在のタスクにする → 完了」(3 ボタン).
  - [ ] AC-8: `actionSet="minimal"` で DOM 順「削除 → 完了」(2 ボタン) + 各 className 維持.

### 既存単体テスト追従 (条件付き)

- [ ] `web/__tests__/task-card-component.test.tsx` / `web/__tests__/task-card-hotfix.test.tsx` を `buttons\[0\]` / `buttons\[1\]` / `nth-of-type` 等で grep する.
- [ ] strict 順序 assert が見つかった場合, 本 BL の新ルールに追従修正する (D-002).
- [ ] 見つからなかった場合, 既存テストは無改修で green を維持することを確認する.

### E2E

- [ ] `e2e/` 配下を `nth-child` / `nth-of-type` / `buttons\[0\]` 等で grep し, DOM index 依存の取得が無いことを確認する.
- [ ] `npx playwright test` で全件 green を確認する (AC-14).
- [ ] `e2e/a11y.spec.ts` の WCAG 2.1 AA で violations 0 件を確認する (AC-15).

### 既存 BL の不変項

- [ ] BL-063 D-002 の auto-margin パターン (`.task-card__actions__delete { margin-right: auto }` / `.task-card__actions__complete { margin-left: auto }`) が引き続き存在することを確認する (REQ-6 / AC-10).
- [ ] BL-063 D-005 の `.task-card--form .task-card__actions { justify-content: flex-end }` が引き続き存在することを確認する (REQ-6 / AC-10).
- [ ] BL-059 V-1 / V-3 / V-4 / V-5 / V-7 不変項が引き続き満たされることを確認する (REQ-6).

## ドキュメント

- [ ] backlog.md の BL-064 行は既に追加済み (起票時点で記載済み). 追加更新は不要.
- [ ] 本 feature ディレクトリ (`docs/developer/features/task-card-actions-reorder/`) の spec / plan / tasks を完成させる.
- [ ] 必要なら ADR を作成 (本 BL は単一 JSX の順序入れ替えのため ADR 化不要の判断).

## 仕上げ

- [ ] 受け入れ基準 (spec.md AC-1 〜 AC-15) を全て満たすことを確認する.
- [ ] `npm test` (vitest 単体) と `npx playwright test` (E2E) が全件 green であることを確認する.
- [ ] `npm run lint` / `npm run typecheck` が green であることを確認する.
- [ ] 実機 (`npm run dev`) で `/today` / `/tomorrow` / `/focus` を目視確認し, 配置が `[削除]──[現在のタスクにする][明日にする]──[完了]` (or 各 view の想定構成) になっていることを確認する.
- [ ] auditor サブエージェントに監査依頼.
