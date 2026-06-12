# タスク: 全カードのインライン常時編集化 (inline-edit-all-cards)

> [`plan.md`](plan.md) を実行可能な単位に分解する. 完了したらチェックを入れる.
> **PR 単位**: 採用案 α / 1 PR にまとめる. branch: `feature/inline-edit-all-cards`.

## 仕様策定 / 設計

- [x] spec.md 起票 (BL-070)
- [x] plan.md 起票
- [x] tasks.md 起票
- [x] auditor / user による spec レビュー → 「確定」状態へ

## test-designer フェーズ (失敗テストを用意)

### 新規テスト

- [ ] `web/__tests__/inline-edit-all-cards.test.tsx` を新設し以下を含める:
  - [ ] AC-1: TaskCard 表示で `<input>` が常時表示 (jsdom DOM レンダ).
  - [ ] AC-2: TaskCard input の blur で `onNameBlur(next)` が呼ばれる.
  - [ ] AC-3: ProjectCard で「変更」「保存」「キャンセル」 button が不在.
  - [ ] AC-4: ProjectCard で `<input>` が常時表示 + visually-hidden label.
  - [ ] AC-5: ProjectCard input の blur で `onNameBlur(next)` が呼ばれる.
  - [ ] AC-6: RoutineCard で「変更」「保存」「キャンセル」 button が不在.
  - [ ] AC-7: RoutineCard で `<input>` + 曜日 7 checkbox + PriorityStars が常時表示.
  - [ ] AC-8: RoutineCard 曜日 click で即時 `onDaysOfWeekChange(next)` が呼ばれる.
  - [ ] AC-9: RoutineCard PriorityStars click で即時 `onDefaultPriorityChange(next)` が呼ばれる.
  - [ ] AC-10: RoutineCard input の blur で `onNameBlur(next)` が呼ばれる.
  - [ ] AC-11: 起票カード TaskFormCard / ProjectFormCard / RoutineFormCard が無改修.
  - [ ] AC-12: projects-view.tsx から isEditing 系 state / handler が撤去.
  - [ ] AC-13: routines-view.tsx から isEditing 系 state / handler が撤去.
  - [ ] AC-14: today / tomorrow / focus の TaskCard が `onNameBlur` を受ける.
  - [ ] AC-15: 空文字 blur で Repository.update が呼ばれない (mock).
  - [ ] AC-16: 同値 blur で Repository.update が呼ばれない (mock).
  - [ ] AC-17: 実値変更 blur で Repository.update が呼ばれる (mock).
  - [ ] AC-18: 曜日 click で即時 RoutineRepository.update が呼ばれる (mock).
  - [ ] AC-19: PriorityStars click で即時 RoutineRepository.update が呼ばれる (mock).
  - [ ] AC-20: 412 で ConflictDialog が開く (mock).
  - [ ] AC-21: BL-042 spec に注釈 1 行追記 assert (テキスト直読み).
  - [ ] AC-23: tokens.css / Repository / Mutation 不変性 assert.

### 既存テスト追従パッチ

- [ ] `web/__tests__/task-card-component.test.tsx` の name span assert を input assert に追従.
- [ ] `web/__tests__/task-card-hotfix.test.tsx` の関連 assert を追従.
- [ ] `web/__tests__/task-card-zone-layout.test.tsx` の `task-card__title` 関連 assert を追従.
- [ ] `web/__tests__/task-card-design.test.tsx` の不変性 assert を追従 (必要に応じて).
- [ ] `web/__tests__/project-card-component.test.tsx` の `isEditing` 系 / 「変更」「保存」「キャンセル」 button 関連 assert を撤去 / 新流儀に追従.
- [ ] `web/__tests__/routine-card-component.test.tsx` の `isEditing` 系 assert を撤去 / 新流儀に追従.
- [ ] `web/__tests__/routine-card-edit-fields.test.tsx` (BL-068) の編集モード assert を全て新流儀に追従.
- [ ] `web/__tests__/routine-card-edit-priority.test.tsx` (BL-069) の編集モード assert を全て新流儀に追従.
- [ ] `web/src/ui/projects-view/projects-view.test.tsx` の編集経路を input blur 経路に書き換え.
- [ ] `web/src/ui/routines-view/routines-view.test.tsx` の編集経路 (曜日 / 優先度 / name) を新流儀に書き換え.
- [ ] (もしあれば) `web/__tests__/today-view.test.tsx` / `tomorrow-view.test.tsx` を確認.

### E2E 追従パッチ

- [ ] `e2e/conflict-handling.spec.ts` の「名称変更」 button 経路を「name input → blur」経路に追従.
- [ ] `e2e/projects.spec.ts` の編集経路を「name input → blur」経路に追従.
- [ ] `e2e/routines.spec.ts` の編集経路 (曜日 / 優先度 / name) を新流儀に追従.
- [ ] `e2e/tasks.spec.ts` のタスク名編集経路を「name input → blur」経路に追従.

## implementer フェーズ (テストを green 化する実装)

### カードコンポーネント

- [ ] `web/src/ui/task-card/task-card.tsx`:
  - [ ] `TaskCardProps` に `onNameBlur: (next: string) => void` を必須で追加.
  - [ ] `task-card__title` 内の `<span>{task.name}</span>` を `<input type="text" value={task.name} onBlur={...} onChange={() => {}} aria-label={...}>` に置換.
  - [ ] PriorityStars / actions / variant / showSetFocus / actionSet / dueDateMode は無改修.

- [ ] `web/src/ui/project-card/project-card.tsx`:
  - [ ] `ProjectCardProps` から `isEditing` / `editingName` / `onEditingNameChange` / `onStartEdit` / `onCancelEdit` / `onSaveEdit` を撤去.
  - [ ] `onNameBlur: (next: string) => void` を必須で追加.
  - [ ] JSX を REQ-2 の DOM に全置換 (= 編集モード分岐削除 / 「変更」「保存」「キャンセル」 button 削除).
  - [ ] visually-hidden label + input + 「削除」 button のみ残す.

- [ ] `web/src/ui/routine-card/routine-card.tsx`:
  - [ ] `RoutineCardProps` から 10 件 (isEditing / editingName / onEditingNameChange / editingDaysOfWeek / onEditingDaysOfWeekChange / editingDefaultPriority / onEditingDefaultPriorityChange / onStartEdit / onCancelEdit / onSaveEdit) を撤去.
  - [ ] `onNameBlur` / `onDaysOfWeekChange` / `onDefaultPriorityChange` を必須で追加.
  - [ ] JSX を REQ-3 の DOM に全置換 (= 編集モード分岐削除).
  - [ ] PriorityStars `idPrefix={`routine-${routine.id}`}` で衝突回避.
  - [ ] `DAY_LABELS` 定数の利用は維持.

### views (handler 再設計)

- [ ] `web/src/ui/today-view/today-view.tsx`:
  - [ ] `handleNameBlur(task, next)` を新設. 空文字 / 同値で短絡, それ以外で `updateMutation.mutateAsync({ id, ifMatch, patch: { name: next } })`.
  - [ ] 各 `<TaskCard>` に `onNameBlur={(next) => handleNameBlur(task, next)}` を追加.

- [ ] `web/src/ui/tomorrow-view/tomorrow-view.tsx`:
  - [ ] today と同じ handler を追加. `<TaskCard>` に `onNameBlur` を渡す.

- [ ] `web/src/ui/focus-view/focus-view.tsx`:
  - [ ] handler を追加. `<TaskCard>` に `onNameBlur` を渡す (`actionSet="minimal"` でも適用).

- [ ] `web/src/ui/projects-view/projects-view.tsx`:
  - [ ] state `editingId` / `editingName` を撤去.
  - [ ] handler `openEdit` / `cancelEdit` / `handleSaveEdit` を撤去.
  - [ ] `handleNameBlur(project, next)` を新設.
  - [ ] `<ProjectCard>` の prop を新 API に揃え, `onNameBlur` / `onDelete` のみ渡す.

- [ ] `web/src/ui/routines-view/routines-view.tsx`:
  - [ ] state `editingId` / `editingName` / `editingDaysOfWeek` / `editingDefaultPriority` を撤去.
  - [ ] handler `openEdit` / `cancelEdit` / `handleSaveEdit` を撤去.
  - [ ] `handleNameBlur(routine, next)` / `handleDaysOfWeekChange(routine, next)` / `handleDefaultPriorityChange(routine, next)` を新設.
  - [ ] 曜日 0 件 silent return を維持.
  - [ ] `<RoutineCard>` の prop を新 API に揃え, 4 つの handler を渡す.

### CSS

- [ ] `web/src/ui/project-card/project-card.css`:
  - [ ] `.project-card--editing` / `.project-card__form-inline` / `.project-card__actions__edit` / `.project-card__name` セレクタを撤去.
  - [ ] `.project-card` / `.project-card__actions` / `.project-card__input` / `.project-card__input::placeholder` / `.visually-hidden` / `.project-card--form` / `.project-card__submit` / `.project-card__actions__delete` は維持.

- [ ] `web/src/ui/routine-card/routine-card.css`:
  - [ ] `.routine-card--editing` / `.routine-card__form-inline` / `.routine-card__actions__edit` / `.routine-card__days-label` / `.routine-card__name` セレクタを撤去.
  - [ ] `.routine-card` / `.routine-card--form` / `.routine-card__main` / `.routine-card__actions` / `.routine-card__input` / `.routine-card__input::placeholder` / `.routine-card__day-checkboxes` / `.routine-card__form-row` / `.visually-hidden` / `.routine-card__select` / `.routine-card__submit` / `.routine-card__actions__delete` は維持.

- [ ] `web/src/ui/task-card/task-card.css`:
  - [ ] 変更なし or `.task-card__title input` の整え (border / background / font-size 継承確認のみ).

### 仕様文書追記

- [ ] `docs/developer/features/task-card-actions/spec.md` (BL-042) に「BL-070 で逆転」注釈を 1 行追記 (P-005 の 2 か所).

## 仕上げ

- [ ] `npm test` (vitest) 全件 green.
- [ ] `npx playwright test` 全件 green.
- [ ] `npm run lint` exit 0.
- [ ] `npm run typecheck` exit 0.
- [ ] `e2e/a11y.spec.ts` の 7 view で violations 0 件.
- [ ] 受け入れ基準 (spec.md) AC-1 〜 AC-25 を全て満たすことを確認.
- [ ] backlog.md の BL-070 行を Done に更新 (実装完了 + auditor Pass 後).
- [ ] auditor レビュー依頼.
