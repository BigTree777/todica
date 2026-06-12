# タスク: RoutineCard / RoutineFormCard コンポーネント新設 + routines-view 適用 (routine-card-component)

> [`plan.md`](plan.md) を実行可能な単位に分解する. 完了したらチェックを入れる.

## 実装

### 新規ファイル骨格

- [x] T-01: `web/src/ui/routine-card/` ディレクトリを新規作成する (P-001).

### CSS (`web/src/ui/routine-card/routine-card.css` 新設)

- [x] T-02: `.routine-card` 基底ルールを定義する (REQ-3 / AC-1).
  - visual 4 宣言: `background: var(--color-bg)` / `border: 1px solid var(--color-border)` / `border-radius: var(--radius-lg)` / `padding: var(--space-md)`.
  - 1 段 flex 横並び layout: `display: flex` / `flex-direction: row` / `align-items: center` / `gap: var(--space-sm)`.
  - 宣言順序は「visual → layout」(P-003).
- [x] T-03: `.routine-card--form` ルールを定義する (REQ-3 / V-1 / AC-2).
  - `flex-direction: column` / `align-items: stretch`.
- [x] T-04: `.routine-card--editing` ルールを定義する (空ルール or コメントのみ / P-004).
- [x] T-05: `.routine-card__main` ルールを定義する (REQ-3 / V-4 / V-5 / AC-3).
  - `flex: 1` / `display: flex` / `flex-direction: column` / `gap: var(--space-xs)`.
- [x] T-06: `.routine-card__name` ルールを定義する (空ルール / P-004).
- [x] T-07: `.routine-card__days-label` ルールを定義する (REQ-3 / V-5 / AC-6).
  - `font-size: var(--font-size-small)` / `color: var(--color-fg-subtle)`.
  - 旧 `routines-view.css` L51-54 から移送.
- [x] T-08: `.routine-card__actions` ルールを定義する (REQ-3 / V-6 / AC-4).
  - `display: flex` / `align-items: center` / `gap: var(--space-sm)`.
- [x] T-09: `.routine-card__actions__edit` ルールを定義する (空ルール / P-004 / D-006).
- [x] T-10: `.routine-card__actions__delete` ルールを定義する (空ルール / P-004 / D-006).
- [x] T-11: `.routine-card__form-inline` ルールを定義する (REQ-3 / 編集モード form 用).
  - `display: flex` / `flex: 1` / `align-items: center` / `gap: var(--space-sm)`.
- [x] T-12: `.routine-card__form-row` ルールを定義する (REQ-3 / V-1).
  - `display: flex` / `flex-direction: row` / `align-items: center` / `gap: var(--space-sm)`.
- [x] T-13: `.routine-card__day-checkboxes` ルールを定義する (REQ-3 / V-1 / AC-7).
  - `display: flex` / `flex-wrap: wrap` / `gap: var(--space-sm)`.
  - 旧 `routines-view.css` L26-30 から移送.
- [x] T-14: `.routine-card__priority-row` ルールを定義する (空ルール / P-004).
- [x] T-15: `.routine-card__input` ルールを定義する (REQ-3 / V-2 / AC-5).
  - `flex: 1` のみ.
- [x] T-16: `.routine-card__input::placeholder` ルールを定義する (REQ-3 / V-2 / AC-5).
  - `color: var(--color-fg-subtle)`.
- [x] T-17: `.routine-card__select` ルールを定義する (空ルール / P-004).
- [x] T-18: `.routine-card__submit` ルールを定義する (空ルール / P-004).
- [x] T-19: `.visually-hidden` ルールを定義する (REQ-3 / D-008 / AC-8).
  - 9 宣言: position / width / height / padding / margin / overflow / clip / white-space / border (BL-060 と同形).
- [x] T-20: `.routine-card` 系セレクタに `:hover` / `:focus-within` / `transition` / `animation` / `box-shadow` を追加していないことを目視確認する (NFR-NO-SHADOW / NFR-NO-HOVER-TRANSITION / AC-22).

### コンポーネント (`web/src/ui/routine-card/routine-card.tsx` 新設)

- [x] T-21: `RoutineCardProps` 型を export する (REQ-1).
  - フィールド: `routine` / `isEditing` / `editingName` / `onEditingNameChange` / `onStartEdit` / `onCancelEdit` / `onSaveEdit` / `onDelete` / `as`.
- [x] T-22: `DAY_LABELS` 定数 (`["日","月","火","水","木","金","土"]`) をファイル内に定義する (P-011).
- [x] T-23: `RoutineCard` コンポーネント本体を実装する (REQ-1 / D-002 / D-003 / D-012).
  - `isEditing=false`: `<li class="routine-card">` 内に `.routine-card__main` (内に `.routine-card__name` + `.routine-card__days-label`) + `.routine-card__actions` (内に「変更」「削除」 button).
  - `isEditing=true`: `<li class="routine-card routine-card--editing">` 内に `<form aria-label="ルーティン名称変更フォーム" class="routine-card__form-inline">` + visually-hidden label「ルーティン名」 + input + 「保存」「キャンセル」 button.
  - `as` prop に応じて root tag (`<li>` / `<div>`) を切替 (P-002 / D-012).
  - 「変更」 button のラベル文字列は `"変更"` (G-8 / REQ-6 / AC-13).
- [x] T-24: 「変更」 button に `className="routine-card__actions__edit"` (D-006), 「削除」 button に `className="routine-card__actions__delete"` (D-006) を付与する.
- [x] T-25: 編集 form の input id は `routine-edit-${routine.id}` (動的) で生成する (D-003).
- [x] T-26: 曜日表示文字列は `routine.daysOfWeek.map((d) => DAY_LABELS[d]).join("・")` で組み立てる (REQ-1).
- [x] T-27: `import "./routine-card.css"` を先頭に追加 (P-006).

### コンポーネント (`web/src/ui/routine-card/routine-form-card.tsx` 新設)

- [x] T-28: `RoutineFormCardProps` 型を export する (REQ-2).
  - フィールド: `name` / `onNameChange` / `daysOfWeek` / `onToggleDay` / `defaultPriority` / `onDefaultPriorityChange` / `onSubmit` / `inputId?` / `priorityId?` / `formAriaLabel?`.
- [x] T-29: `DAY_LABELS` 定数を本ファイル内にも定義する (P-011).
- [x] T-30: `RoutineFormCard` コンポーネント本体を実装する (REQ-2 / D-004).
  - root 要素は `<form className="routine-card routine-card--form" aria-label={formAriaLabel}>`.
  - 1 段目 row: visually-hidden label「ルーティン名」 + name input + 「追加」 submit button.
  - 2 段目 row: 曜日チェックボックス群 (7 個 / `role="group" aria-label="曜日"` ラッパ) + 優先度 row (label「優先度」 + select).
  - `inputId` default = `"routine-name"` (D-004).
  - `priorityId` default = `"routine-priority"` (D-004).
  - `formAriaLabel` default = `"ルーティン作成フォーム"`.
- [x] T-31: name input に `placeholder="ルーティン名"` (REQ-2 / V-2 / AC-12) と `required` を付与する.
- [x] T-32: name input の label に `htmlFor={inputId}` + `className="visually-hidden"` + テキスト「ルーティン名」を付与する (NFR-NAME-LABEL-CHANGE / D-008 / AC-20).
- [x] T-33: 「追加」 submit button に `className="routine-card__submit"` を付与する (D-006).
- [x] T-34: 曜日チェックボックス群を `<div role="group" aria-label="曜日" className="routine-card__day-checkboxes">` で囲む (P-012).
- [x] T-35: 各曜日 label は `<label><input type="checkbox" ... />{DAY_LABELS[day]}</label>` の構造とする (NFR-DAY-LABEL-PRESERVE / AC-14).
- [x] T-36: 優先度 label は visually-hidden にせず可視で残す (D-008-2). `<label htmlFor={priorityId}>優先度</label>`.
- [x] T-37: 優先度 select に `className="routine-card__select"` を付与する.
- [x] T-38: 優先度 select の option は `highest` / `normal` / `later` の 3 個 (現行と同じ).
- [x] T-39: `import "./routine-card.css"` を先頭に追加 (P-006).

### routines-view 適用 (`web/src/ui/routines-view/routines-view.tsx`)

- [x] T-40: `import { RoutineCard } from "../routine-card/routine-card.js"` を追加 (REQ-4-4 / AC-15).
- [x] T-41: `import { RoutineFormCard } from "../routine-card/routine-form-card.js"` を追加 (REQ-4-4 / AC-15).
- [x] T-42: `DAY_LABELS` 定数を routines-view.tsx から**削除**する (REQ-4-6 / P-011).
- [x] T-43: `<form onSubmit={handleCreate} aria-label="ルーティン作成フォーム" className="routines-view__form">{...}</form>` (L263-303 付近) を `<RoutineFormCard name={newName} onNameChange={setNewName} daysOfWeek={newDaysOfWeek} onToggleDay={toggleDay} defaultPriority={newDefaultPriority} onDefaultPriorityChange={setNewDefaultPriority} onSubmit={handleCreate} />` に置換する (REQ-4-1).
- [x] T-44: `<li key={routine.id} className="routines-view__item">{...}</li>` (L307-333 付近) を `<RoutineCard key={routine.id} routine={routine} isEditing={editingId === routine.id} editingName={editingName} onEditingNameChange={setEditingName} onStartEdit={() => openEdit(routine)} onCancelEdit={cancelEdit} onSaveEdit={handleSaveEdit} onDelete={() => handleDelete(routine)} />` に置換する (REQ-4-2).
- [x] T-45: `<ul className="routines-view__list">` は維持する (REQ-4-3 / NFR-PRESERVE-SHELL).
- [x] T-46: `import "./routines-view.css"` は維持する (REQ-4-5 / 枠系セレクタ用).
- [x] T-47: routines-view.tsx から `routines-view__form` / `routines-view__item` / `routines-view__actions` / `routines-view__days` / `routines-view__days-label` の className 使用が全て消えていることを確認 (AC-15).

### CSS 撤去 (`web/src/ui/routines-view/routines-view.css`)

- [x] T-48: `.routines-view__form` ルールを撤去する (REQ-5 / D-009-2 / AC-16).
- [x] T-49: `.routines-view__item` ルールを撤去する (REQ-5 / D-009-2 / AC-16).
- [x] T-50: `.routines-view__days` ルールを撤去する (REQ-5 / D-009-2 / AC-16).
- [x] T-51: `.routines-view__days-label` ルールを撤去する (REQ-5 / D-009-2 / AC-16).
- [x] T-52: `.routines-view__actions` ルールを撤去する (REQ-5 / D-009-2 / AC-16).
- [x] T-53: `.routines-view` / `.routines-view h1` / `.routines-view__list` / `.routines-view__empty` を**維持**する (NFR-PRESERVE-SHELL / AC-17).

### 周辺ファイル (無改修)

- [x] T-54: `web/src/repositories/routine-repository.ts` を**変更しない** (NFR-COMPAT / AC-19).
- [x] T-55: `web/src/styles/tokens.css` を**変更しない** (NFR-NO-NEW-TOKENS / G-9 / AC-18).
- [x] T-56: `web/src/ui/conflict-dialog/` を**変更しない** (NFR-COMPAT).

## テスト

### 新規テスト (`web/__tests__/routine-card-component.test.tsx`)

- [x] T-57: テストファイル骨格 (extractRuleBody ヘルパ / repoRoot / path 定数) を BL-054 / BL-057 / BL-058 / BL-059 / BL-060 と同じスタイルで用意する (P-005 / D-007).

#### CSS 直読み系

- [x] T-58: AC-1 系: `.routine-card` ルール本文に visual 4 宣言 + 1 段 flex 横並び layout 宣言が存在することを assert.
- [x] T-59: AC-2 系: `.routine-card--form` ルール本文に `flex-direction: column` / `align-items: stretch` が存在することを assert.
- [x] T-60: AC-3 系: `.routine-card__main` ルール本文に `flex: 1` / `display: flex` / `flex-direction: column` が存在することを assert.
- [x] T-61: AC-4 系: `.routine-card__actions` ルール本文に `display: flex` / `align-items: center` / `gap: var(--space-sm)` が存在することを assert.
- [x] T-62: AC-5 系: `.routine-card__input` に `flex: 1`, `.routine-card__input::placeholder` に `color: var(--color-fg-subtle)` が存在することを assert.
- [x] T-63: AC-6 系: `.routine-card__days-label` に `font-size: var(--font-size-small)` / `color: var(--color-fg-subtle)` が存在することを assert.
- [x] T-64: AC-7 系: `.routine-card__day-checkboxes` に `display: flex` / `flex-wrap: wrap` / `gap: var(--space-sm)` が存在することを assert.
- [x] T-65: AC-8 系: `.visually-hidden` ルール本文に position / width / height / overflow / clip 等の 9 宣言が存在することを assert.
- [x] T-66: AC-16 系: `routines-view.css` から `.routines-view__form` / `.routines-view__item` / `.routines-view__days` / `.routines-view__days-label` / `.routines-view__actions` が撤去されていることを assert.
- [x] T-67: AC-17 系: `routines-view.css` に `.routines-view` / `.routines-view h1` / `.routines-view__list` / `.routines-view__empty` が引き続き存在することを assert.
- [x] T-68: AC-18 系: tokens.css に本 BL で参照する `--color-bg` / `--color-border` / `--radius-lg` / `--space-md` / `--space-sm` / `--space-xs` / `--color-fg-subtle` / `--font-size-small` が引き続き定義されていることを assert.
- [x] T-69: AC-22 系: `routine-card.css` 全体で `box-shadow` / `transition` / `animation` が存在せず, `.routine-card:hover` 等の `:hover` セレクタが存在しないことを assert.

#### jsdom DOM レンダ系

- [x] T-70: AC-9 系: `<RoutineCard isEditing={false}>` を render し, ルート要素が `<li class="routine-card">` で `.routine-card__main` (内に name + days-label) / `.routine-card__actions` (内に「変更」「削除」 button が DOM 順「変更 → 削除」) が存在することを assert.
- [x] T-71: AC-10 系: `<RoutineCard isEditing={true}>` を render し, ルートが `<li class="routine-card routine-card--editing">` で form `aria-label="ルーティン名称変更フォーム"` が存在し, 内部に visually-hidden label「ルーティン名」 + input + 「保存」「キャンセル」 button が存在することを assert. label の htmlFor と input id が一致することも確認.
- [x] T-72: AC-11 系: `<RoutineFormCard>` を render し, ルートが `<form aria-label="ルーティン作成フォーム" class="routine-card routine-card--form">` で 2 つの `.routine-card__form-row` 要素が存在することを assert. 1 段目に visually-hidden label / name input / 「追加」 button. 2 段目に 7 個の曜日 checkbox / 優先度 select.
- [x] T-73: AC-12 系: `<RoutineFormCard>` の input placeholder が「ルーティン名」であることを assert.
- [x] T-74: AC-13 系: `<RoutineCard isEditing={false}>` を render し, 「変更」 button が存在し, 「名称変更」 button が存在しないことを assert.
- [x] T-75: AC-14 系: `<RoutineFormCard>` の曜日 label テキストに「日」「月」「火」「水」「木」「金」「土」が含まれ, `getByLabel("月", { exact: true })` で月曜 checkbox が取得できることを assert.
- [x] T-76: AC-20 系: `<RoutineFormCard>` を render し, `getByLabelText("ルーティン名")` で name input が取得可能であり, `<label htmlFor="routine-priority">優先度</label>` と `<select id="routine-priority">` の関連付けが維持されていることを assert.
- [x] T-77: AC-21 系: `<RoutineFormCard>` の aria-label が「ルーティン作成フォーム」であり, `<RoutineCard isEditing={true}>` の form aria-label が「ルーティン名称変更フォーム」であることを assert.

#### view 適用 (readFileSync 系)

- [x] T-78: AC-15 系: routines-view.tsx に `import { RoutineCard }` / `import { RoutineFormCard }` が含まれ, `<RoutineCard` の使用が 1 か所以上 / `<RoutineFormCard` の使用が 1 か所以上, かつ `className="routines-view__form"` / `className="routines-view__item"` / `className="routines-view__actions"` / `className="routines-view__days"` / `className="routines-view__days-label"` が含まれないことを assert.

#### 不変性 assert

- [x] T-79: AC-19 系: `web/src/repositories/routine-repository.ts` に `export interface WebRoutineRepository` / `export class RoutineConflictError` 等の主要シンボルが残っていることを readFileSync で assert (本 BL で touch していないことの確認).

### 既存テストへの追従修正

- [x] T-80: `web/__tests__/design-tokens.test.ts` L81 周辺で `ui/routines-view/routines-view.css` を参照している箇所が, 旧セレクタ撤去後も green を維持することを確認 (P-007). 落ちた場合のみ追従修正.

### E2E

- [x] T-81: `e2e/routines.spec.ts` L20 / L33 の `page.getByLabel("名前")` を `page.getByLabel("ルーティン名")` に追従修正する (P-008-1 / R-002).
- [x] T-82: `e2e/routines.spec.ts` を実行し, 作成 / 削除フローが green であることを確認する.
- [x] T-83: `e2e/secondary-views-style.spec.ts` AC-4 の forms 配列 (L141-144) から `{ path: "/routines", formName: "ルーティン作成フォーム" }` を削除する (P-008-2 / D-013).
- [x] T-84: `e2e/secondary-views-style.spec.ts` AC-5 の targets 配列 (L175-178) から `{ path: "/routines", itemText: routineName }` を削除し, `seedRoutine` 呼び出しおよび関連変数も削除する (P-008-2 / D-013).
- [x] T-85: `e2e/secondary-views-style.spec.ts` のテスト名 / コメントを `(BL-061 追従)` で更新する (D-013).
- [x] T-86: `e2e/secondary-views-style.spec.ts` を実行し, 残る対象 (settings / trash) で green が維持されていることを確認する (R-003).
- [x] T-87: `e2e/a11y.spec.ts` を実行し, `/routines` の WCAG 2.1 AA で violations 0 件を維持していることを確認する (AC-25 / NFR-A11Y / R-007 緩和).
- [x] T-88: `e2e/boundary-time.spec.ts` / `e2e/set-focus-gesture.spec.ts` などその他 routine 関連 E2E が green であることを確認する.

## ドキュメント

- [x] T-89: 関連ドキュメント (API / schema / user ガイド) への影響は無いことを確認する (presentation 層のみの変更).
- [x] T-90: ADR 起票は本 BL では不要 (大きな設計判断は spec D 章 / plan P 章で吸収済み. 系統間共通基底を作らない方針は backlog BL-059 / BL-060 / BL-061 で明示済み).

## 仕上げ

- [x] T-91: spec.md の受け入れ基準 AC-1 〜 AC-25 を全て満たすことを確認する.
- [x] T-92: lint / typecheck が green であることを確認する.
- [x] T-93: 単体テスト全件 + E2E 全件 green を確認する (= 「テストが通る == 機能が実装されている」).
- [x] T-94: モックアップ / user 要求と実画面の visual を目視比較し, 作成フォームが 2 段構成 (1 段目: name + 追加 横並び / 2 段目: 曜日 + 優先度 横並び), 表示行が `[名前 + 曜日]──[変更][削除]` の配置になっていることを確認する.
- [x] T-95: auditor へレビュー依頼する.
