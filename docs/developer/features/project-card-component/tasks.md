# タスク: ProjectCard / ProjectFormCard コンポーネント新設 + projects-view 適用 (project-card-component)

> [`plan.md`](plan.md) を実行可能な単位に分解する. 完了したらチェックを入れる.

## 実装

### 新規ファイル骨格

- [x] T-01: `web/src/ui/project-card/` ディレクトリを新規作成する (P-001).

### CSS (`web/src/ui/project-card/project-card.css` 新設)

- [x] T-02: `.project-card` 基底ルールを定義する (REQ-3 / AC-1).
  - visual 4 宣言: `background: var(--color-bg)` / `border: 1px solid var(--color-border)` / `border-radius: var(--radius-lg)` / `padding: var(--space-md)`.
  - 1 段 flex 横並び layout: `display: flex` / `flex-direction: row` / `align-items: center` / `gap: var(--space-sm)`.
  - 宣言順序は「visual → layout」(P-003).
- [x] T-03: `.project-card--form` ルールを定義する (空ルール or コメントのみ / P-004).
- [x] T-04: `.project-card--editing` ルールを定義する (空ルール or コメントのみ / P-004).
- [x] T-05: `.project-card__name` ルールを定義する (REQ-3 / V-4 / AC-2).
  - `flex: 1` のみ.
- [x] T-06: `.project-card__actions` ルールを定義する (REQ-3 / V-5 / AC-3).
  - `display: flex` / `align-items: center` / `gap: var(--space-sm)`.
- [x] T-07: `.project-card__actions__edit` ルールを定義する (空ルール / P-004 / D-006).
- [x] T-08: `.project-card__actions__delete` ルールを定義する (空ルール / P-004 / D-006).
- [x] T-09: `.project-card__form-inline` ルールを定義する (REQ-3 / 編集モード form 用).
  - `display: flex` / `flex: 1` / `align-items: center` / `gap: var(--space-sm)`.
- [x] T-10: `.project-card__input` ルールを定義する (REQ-3 / V-2 / AC-4).
  - `flex: 1` のみ.
- [x] T-11: `.project-card__input::placeholder` ルールを定義する (REQ-3 / V-2 / AC-4).
  - `color: var(--color-fg-subtle)`.
- [x] T-12: `.project-card__submit` ルールを定義する (空ルール / P-004).
- [x] T-13: `.visually-hidden` ルールを定義する (REQ-3 / D-008 / AC-5).
  - 9 宣言: position / width / height / padding / margin / overflow / clip / white-space / border (BL-063 と同形).
- [x] T-14: `.project-card` 系セレクタに `:hover` / `:focus-within` / `transition` / `animation` / `box-shadow` を追加していないことを目視確認する (NFR-NO-SHADOW / NFR-NO-HOVER-TRANSITION / AC-18).

### コンポーネント (`web/src/ui/project-card/project-card.tsx` 新設)

- [x] T-15: `ProjectCardProps` 型を export する (REQ-1).
  - フィールド: `project` / `isEditing` / `editingName` / `onEditingNameChange` / `onStartEdit` / `onCancelEdit` / `onSaveEdit` / `onDelete` / `as`.
- [x] T-16: `ProjectCard` コンポーネント本体を実装する (REQ-1 / D-002 / D-003 / D-012).
  - `isEditing=false`: `<li class="project-card">` 内に `<span class="project-card__name">` + `<div class="project-card__actions">` (内に「変更」「削除」 button).
  - `isEditing=true`: `<li class="project-card project-card--editing">` 内に `<form aria-label="プロジェクト名称変更フォーム" class="project-card__form-inline">` + visually-hidden label + input + 「保存」「キャンセル」 button.
  - `as` prop に応じて root tag (`<li>` / `<div>`) を切替 (P-002 / D-012).
  - 「変更」 button のラベル文字列は `"変更"` (G-8 / REQ-6 / AC-10).
- [x] T-17: 「変更」 button に `className="project-card__actions__edit"` (D-006), 「削除」 button に `className="project-card__actions__delete"` (D-006) を付与する.
- [x] T-18: 編集 form の input id は `project-edit-${project.id}` (動的) で生成する (D-003).
- [x] T-19: `import "./project-card.css"` を先頭に追加 (P-006).

### コンポーネント (`web/src/ui/project-card/project-form-card.tsx` 新設)

- [x] T-20: `ProjectFormCardProps` 型を export する (REQ-2).
  - フィールド: `name` / `onNameChange` / `onSubmit` / `inputId?` / `formAriaLabel?`.
- [x] T-21: `ProjectFormCard` コンポーネント本体を実装する (REQ-2 / D-004).
  - root 要素は `<form className="project-card project-card--form" aria-label={formAriaLabel}>`.
  - visually-hidden label + input + 「追加」 submit button の 1 段 flex 横並び.
  - `inputId` default = `"project-name"` (D-004 / 既存テスト互換).
  - `formAriaLabel` default = `"プロジェクト作成フォーム"`.
- [x] T-22: input に `placeholder="プロジェクト名"` (REQ-2 / V-2 / AC-9) と `required` を付与する.
- [x] T-23: label に `htmlFor={inputId}` + `className="visually-hidden"` を付与する (NFR-LABEL-PRESERVE / AC-16).
- [x] T-24: 「追加」 submit button に `className="project-card__submit"` を付与する (D-006).
- [x] T-25: `import "./project-card.css"` を先頭に追加 (P-006).

### projects-view 適用 (`web/src/ui/projects-view/projects-view.tsx`)

- [x] T-26: `import { ProjectCard } from "../project-card/project-card.js"` を追加 (REQ-4-4 / AC-11).
- [x] T-27: `import { ProjectFormCard } from "../project-card/project-form-card.js"` を追加 (REQ-4-4 / AC-11).
- [x] T-28: `<form onSubmit={handleCreate} aria-label="プロジェクト作成フォーム" className="projects-view__form">{...}</form>` (L236-252 付近) を `<ProjectFormCard name={newName} onNameChange={setNewName} onSubmit={handleCreate} />` に置換する (REQ-4-1).
- [x] T-29: `<li key={project.id} className="projects-view__item">{...}</li>` (L256-281 付近) を `<ProjectCard key={project.id} project={project} isEditing={editingId === project.id} editingName={editingName} onEditingNameChange={setEditingName} onStartEdit={() => openEdit(project)} onCancelEdit={cancelEdit} onSaveEdit={handleSaveEdit} onDelete={() => handleDelete(project)} />` に置換する (REQ-4-2).
- [x] T-30: `<ul className="projects-view__list">` は維持する (REQ-4-3 / NFR-PRESERVE-SHELL).
- [x] T-31: `import "./projects-view.css"` は維持する (REQ-4-5 / 枠系セレクタ用).
- [x] T-32: projects-view.tsx から `projects-view__form` / `projects-view__item` / `projects-view__actions` の className 使用が全て消えていることを確認 (AC-11).

### CSS 撤去 (`web/src/ui/projects-view/projects-view.css`)

- [x] T-33: `.projects-view__form` ルールを撤去する (REQ-5 / D-009 / AC-12).
- [x] T-34: `.projects-view__item` ルールを撤去する (REQ-5 / D-009 / AC-12).
- [x] T-35: `.projects-view__actions` ルールを撤去する (REQ-5 / D-009 / AC-12).
- [x] T-36: `.projects-view` / `.projects-view h1` / `.projects-view__list` / `.projects-view__empty` を**維持**する (NFR-PRESERVE-SHELL / AC-13).

### 周辺ファイル (無改修)

- [x] T-37: `web/src/repositories/project-repository.ts` を**変更しない** (NFR-COMPAT / AC-15).
- [x] T-38: `web/src/styles/tokens.css` を**変更しない** (NFR-NO-NEW-TOKENS / G-9 / AC-14).
- [x] T-39: `web/src/ui/conflict-dialog/` を**変更しない** (NFR-COMPAT).

## テスト

### 新規テスト (`web/__tests__/project-card-component.test.tsx`)

- [x] T-40: テストファイル骨格 (extractRuleBody ヘルパ / repoRoot / path 定数) を BL-054 / BL-057 / BL-058 / BL-059 と同じスタイルで用意する (P-005 / D-007).

#### CSS 直読み系

- [x] T-41: AC-1 系: `.project-card` ルール本文に visual 4 宣言 + 1 段 flex 横並び layout 宣言が存在することを assert.
- [x] T-42: AC-2 系: `.project-card__name` ルール本文に `flex: 1` (または `flex-grow: 1`) が存在することを assert.
- [x] T-43: AC-3 系: `.project-card__actions` ルール本文に `display: flex` / `align-items: center` / `gap: var(--space-sm)` が存在することを assert.
- [x] T-44: AC-4 系: `.project-card__input` に `flex: 1` が存在し, `.project-card__input::placeholder` に `color: var(--color-fg-subtle)` が存在することを assert.
- [x] T-45: AC-5 系: `.visually-hidden` ルール本文に position / width / height / overflow / clip 等の 9 宣言が存在することを assert.
- [x] T-46: AC-12 系: `projects-view.css` から `.projects-view__form` / `.projects-view__item` / `.projects-view__actions` が撤去されていることを assert.
- [x] T-47: AC-13 系: `projects-view.css` に `.projects-view` / `.projects-view h1` / `.projects-view__list` / `.projects-view__empty` が引き続き存在することを assert.
- [x] T-48: AC-14 系: tokens.css に本 BL で参照する `--color-bg` / `--color-border` / `--radius-lg` / `--space-md` / `--space-sm` / `--color-fg-subtle` が引き続き定義されていることを assert.
- [x] T-49: AC-18 系: `project-card.css` 全体で `box-shadow` / `transition` / `animation` が存在せず, `.project-card:hover` 等の `:hover` セレクタが存在しないことを assert.

#### jsdom DOM レンダ系

- [x] T-50: AC-6 系: `<ProjectCard isEditing={false}>` を render し, ルート要素が `<li class="project-card">` で `.project-card__name` / `.project-card__actions` 子要素が存在し, actions 内に「変更」「削除」 button が DOM 順「変更 → 削除」で存在することを assert.
- [x] T-51: AC-7 系: `<ProjectCard isEditing={true}>` を render し, ルートが `<li class="project-card project-card--editing">` で form `aria-label="プロジェクト名称変更フォーム"` が存在し, 内部に visually-hidden label + input + 「保存」「キャンセル」 button が存在することを assert. label の htmlFor と input id が一致することも確認.
- [x] T-52: AC-8 系: `<ProjectFormCard>` を render し, ルートが `<form aria-label="プロジェクト作成フォーム" class="project-card project-card--form">` で visually-hidden label + input + 「追加」 button が存在し, getByLabelText("プロジェクト名") で input が取得可能であることを assert.
- [x] T-53: AC-9 系: `<ProjectFormCard>` の input placeholder が「プロジェクト名」であることを assert.
- [x] T-54: AC-10 系: `<ProjectCard isEditing={false}>` を render し, 「変更」 button が存在し, 「名称変更」 button が存在しないことを assert.
- [x] T-55: AC-16 系: `<ProjectFormCard>` を render し, label の class に `visually-hidden` が含まれ, htmlFor + id 関連付けが維持されていることを assert.
- [x] T-56: AC-17 系: `<ProjectFormCard>` の aria-label が「プロジェクト作成フォーム」であり, `<ProjectCard isEditing={true}>` の form aria-label が「プロジェクト名称変更フォーム」であることを assert.

#### view 適用 (readFileSync 系)

- [x] T-57: AC-11 系: projects-view.tsx に `import { ProjectCard }` / `import { ProjectFormCard }` が含まれ, `<ProjectCard` の使用が 1 か所以上 / `<ProjectFormCard` の使用が 1 か所以上, かつ `className="projects-view__form"` / `className="projects-view__item"` / `className="projects-view__actions"` が含まれないことを assert.

#### 不変性 assert

- [x] T-58: AC-15 系: `web/src/repositories/project-repository.ts` に `export interface ProjectRepository` / `export class ProjectConflictError` 等の主要シンボルが残っていることを readFileSync で assert (本 BL で touch していないことの確認).

### 既存テストへの追従修正

- [x] T-59: `web/__tests__/design-tokens.test.ts` L80 周辺で `ui/projects-view/projects-view.css` を参照している箇所が, 旧セレクタ撤去後も green を維持することを確認 (P-007). 落ちた場合のみ追従修正.

### E2E

- [x] T-60: `e2e/conflict-handling.spec.ts` L105 / L118 の `getByRole("button", { name: "名称変更" })` を `getByRole("button", { name: "変更" })` に追従修正する (P-008 / D-005 / R-002).
- [x] T-61: `e2e/projects.spec.ts` を実行し, 作成 / 削除 / 編集フローが green であることを確認する (R-001 緩和). 「名称変更」 button を見ている箇所があれば「変更」へ追従修正.
- [x] T-62: `e2e/secondary-views-style.spec.ts` を実行し, `.projects-view` ベースの style 確認が green であることを確認する (NFR-PRESERVE-SHELL).
- [x] T-63: `e2e/a11y.spec.ts` を実行し, `/projects` の WCAG 2.1 AA で violations 0 件を維持していることを確認する (AC-21 / NFR-A11Y / R-005 緩和).
- [x] T-64: `e2e/state-restoration.spec.ts` などのその他 E2E が green であることを確認する.

## ドキュメント

- [x] T-65: 関連ドキュメント (API / schema / user ガイド) への影響は無いことを確認する (presentation 層のみの変更).
- [x] T-66: ADR 起票は本 BL では不要 (大きな設計判断は spec D 章 / plan P 章で吸収済み. 系統間共通基底を作らない方針は backlog BL-059 / BL-060 / BL-061 で明示済み).

## 仕上げ

- [x] T-67: spec.md の受け入れ基準 AC-1 〜 AC-21 を全て満たすことを確認する.
- [x] T-68: lint / typecheck が green であることを確認する.
- [x] T-69: 単体テスト全件 + E2E 全件 green を確認する (= 「テストが通る == 機能が実装されている」).
- [x] T-70: モックアップ / user 要求と実画面の visual を目視比較し, 作成フォームが横並び / 表示行が `[プロジェクト名]──[変更][削除]` の配置になっていることを確認する.
- [x] T-71: auditor へレビュー依頼する.
