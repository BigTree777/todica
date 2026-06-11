# タスク: TaskCard / TaskFormCard コンポーネント新設 + モックアップ通り visual 確定 (task-card-component)

> [`plan.md`](plan.md) を実行可能な単位に分解する. 完了したらチェックを入れる.

## 実装

### 新規ファイル骨格

- [x] T-01: `web/src/ui/task-card/` ディレクトリを新規作成する (P-001).

### CSS (`web/src/ui/task-card/task-card.css` 新設)

- [x] T-02: `.task-card` 基底ルールを定義する (REQ-3).
  - visual 4 宣言: `background: var(--color-bg)` / `border: 1px solid var(--color-border)` / `border-radius: var(--radius-lg)` / `padding: var(--space-md)`.
  - 3 段 layout 宣言: `display: flex` / `flex-direction: column` / `gap: var(--space-md)`.
  - 宣言順序は「visual → layout」(P-003).
- [x] T-03: `.task-card--focus` ルールを定義する (REQ-3 / V-1 / AC-2).
  - `border-width: 3px` のみ. `padding` 上書きは入れない (= `.task-card` の `var(--space-md)` を継承).
- [x] T-04: `.task-card--form` ルールを定義する (本 BL 時点では空ルール or コメントのみ / P-004).
- [x] T-05: `.task-card__header` ルールを定義する (REQ-3 / V-3 / AC-3).
  - `display: flex` / `align-items: center` / `justify-content: space-between` / `gap: var(--space-sm)`.
- [x] T-06: `.task-card__title` ルールを定義する (REQ-3 / V-4 / V-7 / AC-4).
  - `display: flex` / `align-items: center` / `justify-content: center` / `gap: var(--space-md)` / `font-size: var(--font-size-h2)`.
- [x] T-07: `.task-card__title input[type="text"]` ルールを定義する (REQ-3 / V-7 / AC-6).
  - `font: inherit` (input にカード font 拡大を継承).
- [x] T-08: `.task-card__actions` ルールを定義する (REQ-3 / V-2 / AC-5).
  - `display: flex` / `align-items: center` / `justify-content: center` / `gap: var(--space-sm)` / `flex-wrap: wrap`.
- [x] T-09: `.task-card` 系セレクタに `:hover` / `:focus-within` / `transition` / `animation` / `box-shadow` を追加していないことを目視確認する (NFR-NO-SHADOW / NFR-NO-HOVER-TRANSITION / AC-26).

### コンポーネント (`web/src/ui/task-card/task-card.tsx` 新設)

- [x] T-10: `TaskCardProps` 型を export する (REQ-1).
  - フィールド: `task` / `project` / `variant` / `showPriority` / `showSetFocus` / `actionSet` / `dueDateMode` / `onSetPriority` / `onSetFocus` / `onDelete` / `onToggleDueDate` / `onComplete` / `as` / `aria-label`.
- [x] T-11: `TaskCard` コンポーネント本体を実装する (REQ-1 / D-002 / D-003 / D-004).
  - 3 段ゾーン構造 (header / title / actions) を出力.
  - `variant === "focus"` で `.task-card--focus` modifier を付与.
  - `as` prop に応じて root tag (`<li>` / `<section>` / `<div>`) を切替 (P-002).
  - header 段: chip (左) + `<PriorityStars />` (右, showPriority=true のとき).
  - title 段: タスク名 `<span>` のみ.
  - actions 段: `showSetFocus` で「現在のタスクにする」/ 「削除」/ `actionSet="full"` かつ `task.origin !== "routine"` で「明日にする」or「今日にする」/「完了」.
  - `actionSet="minimal"` のとき「削除 / 完了」の 2 ボタンのみ.
- [x] T-12: PriorityStars の `groupLabel={`${task.name} の優先度`}` / `idPrefix={`task-${task.id}`}` を渡す (P-010).
- [x] T-13: `import "./task-card.css"` を先頭に追加 (P-009).

### コンポーネント (`web/src/ui/task-card/task-form-card.tsx` 新設)

- [x] T-14: `TaskFormCardProps` 型を export する (REQ-2).
  - フィールド: `projects` / `projectId` / `onProjectIdChange` / `priority` / `onPriorityChange` / `name` / `onNameChange` / `onSubmit` / `idPrefix` / `inputId` / `formAriaLabel`.
- [x] T-15: `TaskFormCard` コンポーネント本体を実装する (REQ-2 / D-006).
  - root 要素は `<form className="task-card task-card--form" aria-label={formAriaLabel}>`.
  - header 段: `<ProjectToggle />` (左) + `<PriorityStars />` (右).
  - title 段: `<label htmlFor={inputId}>タスク名</label>` + `<input id={inputId} type="text">`.
  - actions 段: `<button type="submit">追加</button>`.
- [x] T-16: 「↑タップで選択」span と「優先度」label span (`#task-priority-label` / `#tomorrow-task-priority-label`) を**含めない** (V-6 / D-008 / AC-14).
- [x] T-17: PriorityStars の `groupLabel="優先度"` / `idPrefix={idPrefix}` を渡す (P-010).
- [x] T-18: ProjectToggle の `groupLabel="プロジェクト"` / `idPrefix={idPrefix}` / `value={projectId === "" ? null : projectId}` / `onChange={(next) => onProjectIdChange(next ?? "")}` を渡す.
- [x] T-19: `import "./task-card.css"` を先頭に追加 (P-009).

### today-view (`web/src/ui/today-view/today-view.tsx`)

- [x] T-20: `import { TaskCard } from "../task-card/task-card.js"` を追加 (REQ-4-5 / AC-15).
- [x] T-21: `import { TaskFormCard } from "../task-card/task-form-card.js"` を追加 (REQ-4-5 / AC-15).
- [x] T-22: `<h2>現在のタスク</h2>` (L449 付近) を**撤去**する (V-5 / AC-15).
- [x] T-23: `<section aria-label="現在のタスク" className="day-view__card day-view__card--focus">{...}</section>` (L448 付近) を `<TaskCard as="section" variant="focus" aria-label="現在のタスク" task={focusedTask} project={focusedProject} showPriority showSetFocus={false} actionSet="full" dueDateMode="today" onSetPriority={...} onDelete={...} onToggleDueDate={...} onComplete={...} />` に置換 (REQ-4-2).
- [x] T-24: `otherTasks.map(...)` 内の `<li key={task.id} className="day-view__card">{...}</li>` (L534 付近) を `<TaskCard key={task.id} as="li" variant="default" task={task} project={project} showPriority showSetFocus actionSet="full" dueDateMode="today" onSetPriority={...} onSetFocus={...} onDelete={...} onToggleDueDate={...} onComplete={...} />` に置換 (REQ-4-3).
- [x] T-25: `<form onSubmit={handleCreate} aria-label="タスク起票フォーム" className="day-view__form">{...}</form>` (L482 付近) を `<TaskFormCard projects={projects} projectId={projectId} onProjectIdChange={setProjectId} priority={priority} onPriorityChange={setPriority} name={name} onNameChange={setName} onSubmit={handleCreate} idPrefix="create" inputId="task-name" formAriaLabel="タスク起票フォーム" />` に置換 (REQ-4-4).
- [x] T-26: `import "../day-view/day-view.css"` を維持する (REQ-4-6 / day-view の枠系セレクタは引き続き必要).
- [x] T-27: today-view.tsx から `day-view__card` / `day-view__form` の className 使用が全て消えていることを確認 (AC-15).

### tomorrow-view (`web/src/ui/tomorrow-view/tomorrow-view.tsx`)

- [x] T-28: `import { TaskCard } from "../task-card/task-card.js"` を追加 (REQ-5-3 / AC-16).
- [x] T-29: `import { TaskFormCard } from "../task-card/task-form-card.js"` を追加 (REQ-5-3 / AC-16).
- [x] T-30: `<li key={task.id} className="day-view__card">{...}</li>` (L442 付近) を `<TaskCard key={task.id} as="li" variant="default" task={task} project={project} showPriority={false} showSetFocus={false} actionSet="full" dueDateMode="tomorrow" onDelete={...} onToggleDueDate={() => handleMoveToToday(task)} onComplete={...} />` に置換 (REQ-5-1 / D-010).
- [x] T-31: `<form onSubmit={handleCreate} aria-label="明日のタスク起票フォーム" className="day-view__form">{...}</form>` を `<TaskFormCard projects={projects} projectId={projectId} onProjectIdChange={setProjectId} priority={priority} onPriorityChange={setPriority} name={name} onNameChange={setName} onSubmit={handleCreate} idPrefix="tomorrow-create" inputId="tomorrow-task-name" formAriaLabel="明日のタスク起票フォーム" />` に置換 (REQ-5-2).
- [x] T-32: tomorrow-view.tsx から `day-view__card` / `day-view__form` の className 使用が全て消えていることを確認 (AC-16).

### focus-view (`web/src/ui/focus-view/focus-view.tsx`)

- [x] T-33: `import { TaskCard } from "../task-card/task-card.js"` を追加 (REQ-6-5 / AC-17).
- [x] T-34: `<div className="focus-view__card">{focusedTask ? ... : ...}</div>` (L230 付近) を `{focusedTask ? <TaskCard as="div" variant="focus" task={focusedTask} project={project} showPriority={false} showSetFocus={false} actionSet="minimal" onDelete={handleDelete} onComplete={handleComplete} /> : <div className="focus-view__empty">現在のタスクはありません</div>}` に置換 (REQ-6-1 / REQ-6-2 / REQ-6-3 / D-012).
- [x] T-35: `<h1>現在のタスク</h1>` (L229) は**維持**する (REQ-6-4 / D-007 / AC-17).
- [x] T-36: `<section aria-label="現在のタスク" className="focus-view">` は維持する.
- [x] T-37: `import "./focus-view.css"` は維持する (D-007 / 枠 / 空状態用).
- [x] T-38: focus-view.tsx から `focus-view__card` / `focus-view__project` / `focus-view__name` / `focus-view__actions` の className 使用が全て消えていることを確認 (AC-17).

### CSS 撤去 (`web/src/ui/day-view/day-view.css`)

- [x] T-39: `.day-view__card` ルールを撤去する (REQ-7 / AC-18).
- [x] T-40: `.day-view__card--focus` ルールを撤去する (REQ-7 / AC-18).
- [x] T-41: `.day-view__card__header` / `.day-view__card__title` / `.day-view__card__actions` ルールを撤去する (REQ-7 / AC-18).
- [x] T-42: `.day-view__form` ルールを撤去する (REQ-7 / AC-18).
- [x] T-43: `.day-view__form__project` / `.day-view__form__priority` / `.day-view__form__priority-hint` / `.day-view__form__name` / `.day-view__form__submit` ルールを撤去する (REQ-7 / AC-18).
- [x] T-44: `.day-view` / `.day-view__header` / `.day-view__header h1` / `.day-view__list` / `.day-view__empty` を**維持**する (REQ-13 / AC-19).
- [x] T-45: `.project-chip` ルール本文を**変更しない** (NFR-CHIP-PRESERVE / REQ-10 / AC-21).

### CSS 撤去 (`web/src/ui/focus-view/focus-view.css`)

- [x] T-46: `.focus-view__card` ルールを撤去する (REQ-7 / AC-20 / P-007).
- [x] T-47: `.focus-view__project` / `.focus-view__name` / `.focus-view__actions` ルールを撤去する (REQ-7 / AC-20 / P-007).
- [x] T-48: `.focus-view` / `.focus-view h1` / `.focus-view__empty` を**維持**する (D-007 / AC-20).

### コンポーネント本体 (無改修)

- [x] T-49: `web/src/ui/priority-stars/priority-stars.tsx` を**変更しない** (REQ-8 / NFR-COMPONENT-API-FROZEN / G-10 / AC-23).
- [x] T-50: `web/src/ui/project-toggle/project-toggle.tsx` を**変更しない** (REQ-8 / NFR-COMPONENT-API-FROZEN / G-10 / AC-23).

### 周辺ファイル (無改修)

- [x] T-51: `web/src/styles/tokens.css` を**変更しない** (REQ-11 / NFR-NO-NEW-TOKENS / G-9 / AC-22).

## テスト

### 新規テスト (`web/__tests__/task-card-component.test.tsx`)

- [x] T-52: テストファイル骨格 (extractRuleBody ヘルパ / repoRoot / path 定数) を BL-054 / BL-057 / BL-058 と同じスタイルで用意する (P-005 / D-011).

#### CSS 直読み系

- [x] T-53: AC-1 系: `.task-card` ルール本文に visual 4 宣言 (`background` / `border` / `border-radius` / `padding`) と 3 段 layout 宣言 (`display: flex` / `flex-direction: column` / `gap: var(--space-md)`) が存在することを assert.
- [x] T-54: AC-2 系: `.task-card--focus` ルール本文に `border-width: 3px` が存在し `padding: var(--space-lg)` が存在しないことを assert.
- [x] T-55: AC-3 系: `.task-card__header` ルール本文に `display: flex` / `justify-content: space-between` / `align-items: center` が存在することを assert.
- [x] T-56: AC-4 系: `.task-card__title` ルール本文に `display: flex` / `justify-content: center` / `font-size: var(--font-size-h2)` が存在することを assert.
- [x] T-57: AC-5 系: `.task-card__actions` ルール本文に `display: flex` / `justify-content: center` が存在し `justify-content: flex-end` が存在しないことを assert.
- [x] T-58: AC-6 系: `.task-card__title input[type="text"]` ルール本文に `font: inherit` (または `font-size: inherit`) が存在することを assert.
- [x] T-59: AC-18 系: `day-view.css` から `.day-view__card` / `.day-view__card--focus` / `.day-view__card__header` / `.day-view__card__title` / `.day-view__card__actions` / `.day-view__form` / `.day-view__form__project` / `.day-view__form__priority` / `.day-view__form__priority-hint` / `.day-view__form__name` / `.day-view__form__submit` の各セレクタが撤去されていることを assert.
- [x] T-60: AC-19 系: `day-view.css` に `.day-view` / `.day-view__header` / `.day-view__list` / `.day-view__empty` / `.project-chip` が引き続き存在することを assert.
- [x] T-61: AC-20 系: `focus-view.css` から `.focus-view__card` / `.focus-view__project` / `.focus-view__name` / `.focus-view__actions` が撤去され, `.focus-view` / `.focus-view__empty` が引き続き存在することを assert.
- [x] T-62: AC-21 系: `.project-chip` ルール本文が BL-056 完了時点の宣言を保持していることを assert (`border: 1px solid var(--color-border)` / `border-radius: var(--radius-lg)` / `padding: var(--space-xs) var(--space-sm)` / `font-size: var(--font-size-small)` / `color: var(--color-fg)`).
- [x] T-63: AC-22 系: tokens.css に本 BL で参照する `--font-size-h2` / `--space-md` / `--radius-lg` / `--color-bg` 等が引き続き定義されていることを assert.
- [x] T-64: AC-23 系: priority-stars.tsx / project-toggle.tsx に `export interface PriorityStarsProps` / `export interface ProjectToggleProps` が含まれることを readFileSync で assert.
- [x] T-65: AC-26 系: `task-card.css` 全体で `box-shadow` / `transition` / `animation` が存在せず, `.task-card:hover` 等の `:hover` セレクタが存在しないことを assert.

#### jsdom DOM レンダ系

- [x] T-66: AC-7 系: `<TaskCard>` を render し, ルート要素が `<li class="task-card">` で 3 段ゾーン子要素 (header / title / actions) が存在し, header に chip + radiogroup, title にタスク名, actions に「削除」「明日にする」「完了」 button が存在することを assert.
- [x] T-67: AC-8 系: `<TaskCard as="section" variant="focus" aria-label="現在のタスク">` を render し, ルートが `<section>` で className に `task-card` + `task-card--focus`, aria-label が「現在のタスク」であることを assert.
- [x] T-68: AC-9 系: `<TaskCard showPriority={false}>` を render し radiogroup が存在しないことを assert.
- [x] T-69: AC-10 系: `<TaskCard showSetFocus={true}>` を render し actions 内に「現在のタスクにする」 button が存在することを assert.
- [x] T-70: AC-11 系: `<TaskCard actionSet="minimal" showSetFocus={false}>` を render し actions が「削除」「完了」の 2 ボタンのみであることを assert.
- [x] T-71: AC-12 系: `task.origin === "routine"` で `<TaskCard actionSet="full">` を render し「明日にする」「今日にする」が出ないことを assert.
- [x] T-72: AC-13 系: `<TaskFormCard>` を render し, ルートが `<form aria-label class="task-card task-card--form">` で 3 段ゾーン子要素が存在し, header に ProjectToggle (= role group / 等価) + PriorityStars (radiogroup), title に label + input, actions に「追加」 button が存在することを assert.
- [x] T-73: AC-14 系: `<TaskFormCard>` を render し「↑タップで選択」テキストと `id="task-priority-label"` / `id="tomorrow-task-priority-label"` の要素と `class="day-view__form__priority-hint"` の要素が存在しないことを assert.
- [x] T-74: AC-24 系: today / tomorrow を render し `getByLabelText("タスク名")` で input が取得可能で htmlFor + id 関連付けが維持されていることを assert.
- [x] T-75: AC-25 系: focus-view を render し focused task ありで actions が「削除」「完了」の 2 ボタンのみで「明日にする」「今日にする」「現在のタスクにする」が無いことを assert.

#### view 適用 (readFileSync 系)

- [x] T-76: AC-15 系: today-view.tsx に `import { TaskCard }` と `import { TaskFormCard }` が含まれ, `<TaskCard` の使用が 2 か所以上 / `<TaskFormCard` の使用が 1 か所以上 / `<h2>現在のタスク</h2>` が含まれず / `className="day-view__card"` / `className="day-view__form"` が含まれないことを assert.
- [x] T-77: AC-16 系: tomorrow-view.tsx に同様の assert (`<TaskCard` 1 か所 / `<TaskFormCard` 1 か所 / 旧 className 不在).
- [x] T-78: AC-17 系: focus-view.tsx に `import { TaskCard }` が含まれ, `variant="focus"` + `actionSet="minimal"` の使用があり, `className="focus-view__card"` が含まれず, `<h1>現在のタスク</h1>` は引き続き含まれることを assert.

### 既存テストへの追従修正

- [x] T-79: `web/__tests__/task-card-design.test.ts` (BL-052) を追従修正する (D-009 / D-011 / §「既存テストの追従修正」).
  - 旧 `.day-view__card` の visual 4 宣言 assert を `.task-card` 側で同じ assert に振り替え, または「`.day-view__card` セレクタが撤去されている」assert に書き換える.
  - 旧 `.day-view__card--focus` の `border-width: 2px` 期待を `border-width: 3px` に追従修正 (V-1). `padding: var(--space-lg)` 期待を撤去 (V-1).
  - JSX 内 `day-view__card` 付与 assert を撤去確認に書き換え.
- [x] T-80: `web/__tests__/task-card-zone-layout.test.tsx` (BL-057) を追従修正する (D-009 / D-011).
  - 旧 `.day-view__card` / `.day-view__card__header` / `.day-view__card__title` / `.day-view__card__actions` assert を `.task-card` 系に置換.
  - title 段の `justify-content: space-between` 期待を `justify-content: center` に追従 (V-4).
  - actions 段の `justify-content: flex-end` 期待を `justify-content: center` に追従 (V-2).
  - DOM レンダの `<li class="day-view__card">` 期待を `<li class="task-card">` に置換.
- [x] T-81: `web/__tests__/form-card-design.test.ts` (BL-054) を追従修正する (D-009 / D-011).
  - 旧 `.day-view__form` の visual 4 宣言 assert を撤去確認に書き換え (= `.task-card` 側で網羅).
  - box-shadow 無し / 他セレクタ不変性 assert は `.task-card` 系に振り替え.
- [x] T-82: `web/__tests__/task-form-grid-layout.test.tsx` (BL-058) を追従修正する (D-009 / D-011).
  - 旧 `.day-view__form` の grid layout assert を撤去確認に書き換え.
  - 「↑タップで選択」存在 assert を撤去確認に逆転 (V-6).
  - タスク名 label/input 関連付け / PriorityStars / ProjectToggle 本体無改修 assert は維持.
- [x] T-83: `web/__tests__/project-chip.test.tsx` (BL-056) を追従修正する (D-011).
  - `.project-chip` ルール本文の不変性 assert は維持 (NFR-CHIP-PRESERVE).
  - 配置先 `.day-view__card` を `.task-card__header` に置換.
- [x] T-84: `web/__tests__/today-view.test.tsx` を追従修正する (DOM クラス名 / `<h2>` 撤去).
- [x] T-85: `web/__tests__/tomorrow-view.test.tsx` を追従修正する (DOM クラス名).
- [x] T-86: `web/__tests__/focus-view.test.tsx` を追従修正する (DOM クラス名 / `.focus-view__card` → `.task-card` / `.focus-view__name` 等の参照を撤去).
- [x] T-87: `web/__tests__/unified-day-view.test.tsx` を追従修正する (DOM クラス名).

### E2E

- [x] T-88: `e2e/tasks.spec.ts` を実行し, `taskRow` helper (`xpath=ancestor::li`) が `<li class="task-card">` でも引き続き機能することを確認 (R-008 緩和). 壊れた場合のみ最小限の追従修正.
- [x] T-89: `e2e/today-view-create-form.spec.ts` を実行し, label 紐付け・accessibleName ベースの取得が壊れていないことを確認 (R-003 緩和).
- [x] T-90: `e2e/projects.spec.ts` / `e2e/project-toggle.spec.ts` / `e2e/trash.spec.ts` を実行し, `taskRow` 使用箇所が green であることを確認.
- [x] T-91: `e2e/design-tokens.spec.ts` L95-96 / L150-151 の `.focus-view__card` ロケータを `.task-card` または `.task-card--focus` に追従修正する (P-008 / R-009 緩和).
- [x] T-92: `e2e/a11y.spec.ts` を実行し WCAG 2.1 AA で violations 0 件を維持していることを確認する (AC-29 / NFR-A11Y / R-010 緩和).
- [x] T-93: `e2e/state-restoration.spec.ts` などのその他 E2E が green であることを確認する.

## ドキュメント

- [x] T-94: 関連ドキュメント (API / schema / user ガイド) への影響は無いことを確認する (presentation 層のみの変更).
- [x] T-95: ADR 起票は本 BL では不要 (大きな設計判断は spec D 章 / plan P 章で吸収済み. 系統間共通基底を作らない方針は backlog BL-059 / BL-060 / BL-061 で明示済み).

## 仕上げ

- [x] T-96: spec.md の受け入れ基準 AC-1 〜 AC-29 を全て満たすことを確認する.
- [x] T-97: lint / typecheck が green であることを確認する.
- [x] T-98: 単体テスト全件 + E2E 全件 green を確認する (= 「テストが通る == 機能が実装されている」).
- [x] T-99: モックアップ `local/image.png` と実画面の visual を目視比較し, V-1 〜 V-7 がすべて反映されていることを確認する.
- [x] T-100: auditor へレビュー依頼する.
