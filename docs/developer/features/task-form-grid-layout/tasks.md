# タスク: 起票フォームのレイアウト 2D グリッド化 (task-form-grid-layout)

> [`plan.md`](plan.md) を実行可能な単位に分解する. 完了したらチェックを入れる.

## 実装

### CSS (`web/src/ui/day-view/day-view.css`)

- [x] T-01: `.day-view__form` の宣言ブロックを更新する.
  - 旧 layout (`display: flex` / `flex-direction: column` / `gap: var(--space-sm)`) を撤去する.
  - 新 layout (`display: grid` / `grid-template-areas: "project priority" "name name" ". submit"` / `grid-template-columns: 1fr auto` / `gap: var(--space-md)`) を追加する.
  - BL-054 visual 4 宣言 (`background` / `border` / `border-radius` / `padding`) は**完全に保持**する (REQ-2 / NFR-BL054-PRESERVE).
  - 宣言順序は layout → visual の順で揃える (P-001).
- [x] T-02: 新規クラス `.day-view__form__project` に `grid-area: project` を追加する (REQ-3).
- [x] T-03: 新規クラス `.day-view__form__priority` に `grid-area: priority` + `display: flex` + `flex-direction: column` + `gap: var(--space-xs)` を追加する (REQ-3 / D-002 / P-003).
- [x] T-04: 新規クラス `.day-view__form__priority-hint` を追加する (本 BL では空ルール or 最小スタイル. 視覚的補助テキスト. D-002).
- [x] T-05: 新規クラス `.day-view__form__name` に `grid-area: name` を追加する (REQ-3).
- [x] T-06: 新規クラス `.day-view__form__submit` に `grid-area: submit` + `justify-self: end` を追加する (REQ-3 / D-005).
- [x] T-07: `.day-view__form` 系セレクタに `:hover` / `:focus-within` / `transition` / `animation` / `box-shadow` を追加していないことを目視確認する (NFR-NO-SHADOW / NFR-NO-HOVER-TRANSITION).

### JSX (`web/src/ui/today-view/today-view.tsx`)

- [x] T-08: 起票フォーム (`<form aria-label="タスク起票フォーム" className="day-view__form">`) 内の各子要素 `<div>` に grid-area 用クラスを付与する (REQ-5).
  - ProjectToggle ラップ `<div>` に `className="day-view__form__project"`.
  - PriorityStars ラップ `<div>` に `className="day-view__form__priority"`.
  - タスク名 input ラップ `<div>` に `className="day-view__form__name"`.
- [x] T-09: 「追加」ボタンに `className="day-view__form__submit"` を付与する (REQ-5).
- [x] T-10: PriorityStars の直下 (= 次の sibling) に `<span className="day-view__form__priority-hint">↑タップで選択</span>` を追加する (REQ-4 / P-003).
- [x] T-11: 既存の `<label htmlFor="task-name">タスク名</label>` + `<input id="task-name">` 構造を**完全に保持**する (REQ-7 / D-004 / NFR-LABEL-PRESERVE).
- [x] T-12: 既存の `<span id="task-priority-label">優先度</span>` を `.day-view__form__priority` ラップ内に同居させる (P-004).
- [x] T-13: PriorityStars / ProjectToggle の prop は無改修 (groupLabel / idPrefix / value / onChange / projects). 既存呼び出しをそのまま保つ (REQ-10).

### JSX (`web/src/ui/tomorrow-view/tomorrow-view.tsx`)

- [x] T-14: today-view と同等の変更を加える (REQ-6).
  - `<form aria-label="明日のタスク起票フォーム" className="day-view__form">` 内の各 `<div>` に同じクラスを付与する.
  - 「追加」ボタンに `className="day-view__form__submit"` を付与する.
  - PriorityStars 直下に `<span className="day-view__form__priority-hint">↑タップで選択</span>` を追加する.
- [x] T-15: 既存の `<label htmlFor="tomorrow-task-name">タスク名</label>` + `<input id="tomorrow-task-name">` 構造を**完全に保持**する (REQ-7).
- [x] T-16: 既存の `<span id="tomorrow-task-priority-label">優先度</span>` を `.day-view__form__priority` ラップ内に同居させる (P-004).

### コンポーネント本体 (無改修)

- [x] T-17: `web/src/ui/priority-stars/priority-stars.tsx` を**変更しない** (REQ-10 / NFR-COMPONENT-API-FROZEN).
- [x] T-18: `web/src/ui/project-toggle/project-toggle.tsx` を**変更しない** (REQ-10 / NFR-COMPONENT-API-FROZEN).

### 周辺ファイル (無改修)

- [x] T-19: `web/src/styles/tokens.css` を**変更しない** (REQ-8 / NFR-NO-NEW-TOKENS).
- [x] T-20: `web/src/ui/focus-view/focus-view.css` を**変更しない** (REQ-9 / G-6).
- [x] T-21: `web/src/ui/focus-view/focus-view.tsx` を**変更しない** (REQ-9 / G-6).
- [x] T-22: `.day-view__card` / `.day-view__card__header` / `.day-view__card__title` / `.day-view__card__actions` / `.day-view__card--focus` / `.project-chip` のルール本文を**変更しない** (G-7).

## テスト

### 新規テスト (`web/__tests__/task-form-grid-layout.test.tsx`)

- [x] T-23: テストファイル骨格 (extractRuleBody ヘルパ / repoRoot / path 定数) を BL-054 / BL-057 と同じスタイルで用意する (P-005).
- [x] T-24: AC-1 系: `.day-view__form` ルール本文に `display: grid` が存在し `flex-direction` が存在しないことを assert する.
- [x] T-25: AC-2 系: `.day-view__form` ルール本文に `grid-template-areas` が定義され `"project priority"` / `"name name"` / `". submit"` の 3 行を含むことを assert する.
- [x] T-26: AC-3 系: `.day-view__form` ルール本文に `grid-template-columns: 1fr auto` を assert する.
- [x] T-27: AC-4 系: `.day-view__form` ルール本文に `gap: var(--space-md)` が存在し `gap: var(--space-sm)` が存在しないことを assert する.
- [x] T-28: AC-5 系: `.day-view__form` ルール本文に BL-054 visual 4 宣言 (`background: var(--color-bg)` / `border: 1px solid var(--color-border)` / `border-radius: var(--radius-md)` / `padding: var(--space-md)`) が保持されていることを assert する.
- [x] T-29: AC-6 系: `.day-view__form__project` / `.day-view__form__priority` / `.day-view__form__name` / `.day-view__form__submit` の各セレクタに対応する `grid-area: <role>` 宣言が存在することを assert する.
- [x] T-30: AC-7 系: `.day-view__form__submit` に `justify-self: end` を assert する.
- [x] T-31: AC-8 系: today-view を render し, 起票フォーム内に「↑タップで選択」テキストが存在することを assert する (jsdom DOM レンダ).
- [x] T-32: AC-9 系: tomorrow-view を render し, 起票フォーム内に「↑タップで選択」テキストが存在することを assert する.
- [x] T-33: AC-10 系: today / tomorrow 双方で `getByLabelText("タスク名")` が input を返すことを assert する.
- [x] T-34: AC-11 系: priority-stars.tsx / project-toggle.tsx に `export interface PriorityStarsProps` / `export interface ProjectToggleProps` が含まれることを CSS と同じ readFileSync 方式で assert する.
- [x] T-35: AC-12 系: tokens.css に `--space-md` / `--space-sm` トークンが定義されていることを assert する.
- [x] T-36: AC-13 系: focus-view.css に `.day-view__form` 系セレクタが含まれないことを assert する.
- [x] T-37: AC-14 系: `.day-view__card` / `.day-view__card__header` / `.day-view__card__title` / `.day-view__card__actions` / `.day-view__card--focus` / `.project-chip` のルール本文が BL-057 完了時点の宣言を保持していることを assert する.
- [x] T-38: AC-18 系: `.day-view__form` 系セレクタ全般で `box-shadow` / `transition` / `animation` 宣言が存在せず, `.day-view__form:hover` / `.day-view__form:focus-within` セレクタも存在しないことを assert する.

### 既存テストへの追従

- [x] T-39: `web/__tests__/form-card-design.test.ts` (BL-054) の AC-2 expectation を本 BL の新値に追従させる (P-006 / R-005).
  - `display: flex` → `display: grid`
  - `flex-direction: column` → 削除 (or `grid-template-areas` 確認に置換)
  - `gap: var(--space-sm)` → `gap: var(--space-md)`
  - AC-1 (visual 4 宣言) / AC-4 (box-shadow 無し) / AC-7 (他セレクタ不変) は引き続き有効として保持.
- [x] T-40: `web/__tests__/today-view.test.tsx` / `tomorrow-view.test.tsx` / `unified-day-view.test.tsx` を実行し, accessibleName / role / id ベースの取得で壊れていないことを確認する. 壊れた場合のみ最小限の追従修正.
- [x] T-41: `web/__tests__/task-card-design.test.ts` / `project-chip.test.tsx` / `task-card-zone-layout.test.tsx` がカード側無改修で全件 green であることを確認する.
- [x] T-42: `web/__tests__/priority-stars.test.tsx` / `project-toggle.test.tsx` がコンポーネント本体無改修で全件 green であることを確認する.

### E2E

- [x] T-43: `e2e/today-view-create-form.spec.ts` を実行し, label 紐付け・role + accessibleName ベースの取得が壊れていないことを確認する. 壊れた場合のみ最小限の追従修正 (R-007 緩和).
- [x] T-44: `e2e/tasks.spec.ts` / `state-restoration.spec.ts` 等の起票フォームを使う E2E が green であることを確認する.
- [x] T-45: `e2e/a11y.spec.ts` を実行し WCAG 2.1 AA で violations 0 件を維持していることを確認する (AC-17 / R-006 緩和).

## ドキュメント

- [x] T-46: 関連ドキュメント更新は本 BL では発生しない (API / schema / user ガイドへの影響なし).
- [x] T-47: ADR 起票は本 BL では不要 (大きな設計判断は spec D 章 / plan P 章で吸収済み).

## 仕上げ

- [x] T-48: spec.md の受け入れ基準 AC-1 〜 AC-18 を全て満たすことを確認する.
- [x] T-49: lint / typecheck が green であることを確認する.
- [x] T-50: 単体テスト全件 + E2E 全件 green を確認する (= 「テストが通る == 機能が実装されている」).
- [x] T-51: auditor へレビュー依頼する.
