# 設計・実装計画: ProjectCard / ProjectFormCard コンポーネント新設 + projects-view 適用 (project-card-component)

> [`spec.md`](spec.md) の要件を, どう実現するかに落とす.

## 方針概要

新規ディレクトリ `web/src/ui/project-card/` を作り, **`<ProjectCard>`** (プロジェクト表示 / 編集) / **`<ProjectFormCard>`** (プロジェクト作成) / **`project-card.css`** (専用 CSS) の 3 ファイルを新設する. `projects-view.tsx` の作成 form と一覧の `<li>` をそれぞれ置換する.

同時に旧 CSS セレクタ (`.projects-view__form` / `.projects-view__item` / `.projects-view__actions`) を撤去し, ペア専用 CSS で 1 段 flex 横並びの visual を**最初から**反映する. BL-045 の `.projects-view` 枠 / `.projects-view__list` / `.projects-view__empty` は無改修.

`ProjectRepository` / mutation / query / ConflictDialog / notifyError / tokens.css は**完全無改修**. 系統間共通の `<Card>` 基底は作らず, TaskCard 系 (BL-059) / RoutineCard 系 (BL-061) とは独立した CSS / コンポーネント.

## 影響範囲

| 領域 | 変更内容 |
| --- | --- |
| API | 変更なし (NFR-COMPAT) |
| DB | 変更なし |
| domain | 変更なし |
| サーバ (`server/`) | 変更なし |
| Repository (`web/src/repositories/project-repository.ts`) | 変更なし (NFR-COMPAT) |
| mutation / query / ConflictDialog / offline-queue / notifyError | 変更なし (NFR-COMPAT) |
| トークン (`web/src/styles/tokens.css`) | **変更なし** (NFR-NO-NEW-TOKENS / G-9) |
| 新規 (`web/src/ui/project-card/project-card.tsx`) | `<ProjectCard>` コンポーネントを新設. props 駆動で表示 ↔ 編集モードを切替 (REQ-1 / D-003) |
| 新規 (`web/src/ui/project-card/project-form-card.tsx`) | `<ProjectFormCard>` コンポーネントを新設. 1 段 flex 横並びの作成フォーム (REQ-2) |
| 新規 (`web/src/ui/project-card/project-card.css`) | `.project-card` / `.project-card--form` / `.project-card--editing` / `.project-card__name` / `.project-card__actions` / `.project-card__actions__edit` / `.project-card__actions__delete` / `.project-card__form-inline` / `.project-card__input` / `.project-card__input::placeholder` / `.project-card__submit` / `.visually-hidden` を定義 (REQ-3 / D-008) |
| CSS (`web/src/ui/projects-view/projects-view.css`) | 旧セレクタ `.projects-view__form` / `.projects-view__item` / `.projects-view__actions` を**撤去** (REQ-5 / D-009). `.projects-view` / `.projects-view h1` / `.projects-view__list` / `.projects-view__empty` は**維持** (NFR-PRESERVE-SHELL) |
| JSX (`web/src/ui/projects-view/projects-view.tsx`) | `<form className="projects-view__form">{...}</form>` → `<ProjectFormCard ... />` 置換 (REQ-4-1). `<li className="projects-view__item">{...}</li>` → `<ProjectCard ... />` 置換 (REQ-4-2). `<ul className="projects-view__list">` は維持. import 追加 (REQ-4-4). state (`newName` / `editingId` / `editingName`) と mutation handler はそのまま prop で渡す. button ラベル「名称変更」→「変更」 (G-8 / REQ-6). aria-label「プロジェクト作成フォーム」「プロジェクト名称変更フォーム」は維持 (NFR-FORM-ARIA-LABEL-PRESERVE) |
| Component (`web/src/repositories/project-repository.ts`) | **変更なし** (NFR-COMPAT) |
| Component (`web/src/ui/conflict-dialog/`) | **変更なし** (NFR-COMPAT) |
| 新規 単体テスト (`web/__tests__/project-card-component.test.tsx`) | CSS 直読み + jsdom DOM レンダの 2 系統で AC-1 〜 AC-18 を網羅 (D-007) |
| 既存単体テスト追従 (`web/__tests__/design-tokens.test.ts`) | `ui/projects-view/projects-view.css` を参照する箇所がトークン参照のみであれば変更不要. 旧セレクタ撤去後も参照トークンが残っていることを確認 (P-007) |
| E2E (`e2e/conflict-handling.spec.ts`) | 「名称変更」 button accessibleName を「変更」に追従修正 (L105 / L118 / R-002 / D-005) |
| E2E (`e2e/projects.spec.ts`) | 原則無修正. accessibleName + role ベースのため作成 / 削除フローは壊れない見込み. 壊れた場合のみ最小限の追従修正 |
| E2E (`e2e/secondary-views-style.spec.ts`) | 無修正. `.projects-view` ベースの style 確認は維持セレクタを見るため壊れない |
| a11y E2E (`e2e/a11y.spec.ts`) | 無修正. 既存スキャンが violations 0 件のまま通る想定 (NFR-A11Y / AC-21) |

## 設計詳細

### データモデル

変更なし. 本 BL は presentation 層のみ.

### 処理フロー (DOM 構造 + コンポーネント API)

#### `<ProjectCard>` API (REQ-1)

```ts
// web/src/ui/project-card/project-card.tsx
import type { Project } from "../../repositories/project-repository.js";
import "./project-card.css";

export interface ProjectCardProps {
  project: Project;
  isEditing: boolean;
  editingName: string;
  onEditingNameChange: (next: string) => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: (e: React.FormEvent) => void;
  onDelete: () => void;
  as?: "li" | "div";
}

export function ProjectCard(props: ProjectCardProps): JSX.Element {
  const {
    project,
    isEditing,
    editingName,
    onEditingNameChange,
    onStartEdit,
    onCancelEdit,
    onSaveEdit,
    onDelete,
    as = "li",
  } = props;

  const Tag = as as "li";  // BL-059 P-002 と同じ cast (D-012)
  const className = `project-card${isEditing ? " project-card--editing" : ""}`;
  const editInputId = `project-edit-${project.id}`;

  if (isEditing) {
    return (
      <Tag className={className}>
        <form
          onSubmit={onSaveEdit}
          aria-label="プロジェクト名称変更フォーム"
          className="project-card__form-inline"
        >
          <label htmlFor={editInputId} className="visually-hidden">プロジェクト名</label>
          <input
            id={editInputId}
            type="text"
            className="project-card__input"
            value={editingName}
            placeholder="プロジェクト名"
            onChange={(e) => onEditingNameChange(e.target.value)}
            required
          />
          <button type="submit">保存</button>
          <button type="button" onClick={onCancelEdit}>キャンセル</button>
        </form>
      </Tag>
    );
  }

  return (
    <Tag className={className}>
      <span className="project-card__name">{project.name}</span>
      <div className="project-card__actions">
        <button
          type="button"
          className="project-card__actions__edit"
          onClick={onStartEdit}
        >
          変更
        </button>
        <button
          type="button"
          className="project-card__actions__delete"
          onClick={onDelete}
        >
          削除
        </button>
      </div>
    </Tag>
  );
}
```

- `isEditing` で表示モード / 編集モードの 2 つの DOM 構造を切替 (D-003).
- 表示モード: 1 段 flex 横並びで `[プロジェクト名]──[変更][削除]`. `.project-card__name` の `flex: 1` で残り幅を占有し, actions が自然に右端へ.
- 編集モード: `<form>` を `<li>` 内に展開し, `.project-card__form-inline` の `flex: 1` で残り幅を占有. 同じ 1 段 flex 横並びを保つ.
- 「変更」 button のラベル文字列は `"変更"` (G-8). 編集 form の `aria-label` は `"プロジェクト名称変更フォーム"` (D-005).
- `as` cast は BL-059 P-002 と同じ. JSX 上で 2 タグ (`<li>` / `<div>`) を同じ HTMLAttributes 型として扱う (D-012).

#### `<ProjectFormCard>` API (REQ-2)

```ts
// web/src/ui/project-card/project-form-card.tsx
import "./project-card.css";

export interface ProjectFormCardProps {
  name: string;
  onNameChange: (next: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  inputId?: string;
  formAriaLabel?: string;
}

export function ProjectFormCard(props: ProjectFormCardProps): JSX.Element {
  const {
    name,
    onNameChange,
    onSubmit,
    inputId = "project-name",
    formAriaLabel = "プロジェクト作成フォーム",
  } = props;

  return (
    <form
      onSubmit={onSubmit}
      aria-label={formAriaLabel}
      className="project-card project-card--form"
    >
      <label htmlFor={inputId} className="visually-hidden">プロジェクト名</label>
      <input
        id={inputId}
        type="text"
        className="project-card__input"
        value={name}
        placeholder="プロジェクト名"
        onChange={(e) => onNameChange(e.target.value)}
        required
      />
      <button type="submit" className="project-card__submit">追加</button>
    </form>
  );
}
```

- root は `<form className="project-card project-card--form">`.
- `.project-card` 基底の 1 段 flex 横並びをそのまま使う. `.project-card--form` は modifier (本 BL 時点では空ルール / P-004).
- label は `visually-hidden` で隠す. `htmlFor + id` 関連付けで `getByLabelText("プロジェクト名")` 取得を維持 (NFR-LABEL-PRESERVE).
- input は `flex: 1` で残り幅を占有. placeholder「プロジェクト名」を `--color-fg-subtle` で薄く描画 (V-2).
- 「追加」 button は input 右隣に並ぶ (V-3).

#### CSS (`project-card.css`)

```css
/*
 * BL-060 (project-card-component): ProjectCard / ProjectFormCard の専用 CSS.
 *
 * - 系統間で共有しない (task-card / routine-card は別 BL の別 CSS).
 * - shadow / hover / transition / animation は意図的に持たない
 *   (NFR-NO-SHADOW / NFR-NO-HOVER-TRANSITION).
 * - .visually-hidden は task-card.css と同形だが系統独立のため再定義 (D-008).
 */

.project-card {
  /* visual 4 宣言. */
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--space-md);
  /* 1 段 flex 横並び layout. */
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: var(--space-sm);
}

.project-card--form {
  /* 本 BL 時点では .project-card と同じ. 将来差異が出たらここに. */
}

.project-card--editing {
  /* 本 BL 時点では .project-card と同じ. 将来差異が出たらここに. */
}

.project-card__name {
  /* V-4: 残り幅を占有し, 右の actions を右端へ押し出す. */
  flex: 1;
}

.project-card__actions {
  display: flex;
  align-items: center;
  /* V-5: DOM 順「変更 → 削除」がそのまま視覚順「左 → 右」になる. */
  gap: var(--space-sm);
}

.project-card__actions__edit {
  /* 本 BL 時点では空ルール. 将来 specificity 制御や色付け用の足場 (P-004). */
}

.project-card__actions__delete {
  /* 本 BL 時点では空ルール. */
}

.project-card__form-inline {
  /* 編集モードで <li> 内の form を 1 段 flex 横並びにする. */
  display: flex;
  flex: 1;
  align-items: center;
  gap: var(--space-sm);
}

.project-card__input {
  /* V-2: 残り幅を占有. */
  flex: 1;
}

.project-card__input::placeholder {
  /* V-2: placeholder を --color-fg-subtle (WCAG AA 7:1) で薄く描画. */
  color: var(--color-fg-subtle);
}

.project-card__submit {
  /* 本 BL 時点では空ルール. input と高さは line-height + padding で自然に揃う. */
}

/* visually-hidden ユーティリティ (D-008 / 9 宣言の標準パターン).
   BL-063 で task-card.css に追加された同名クラスと同形. 系統独立のため再定義. */
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
```

#### projects-view.tsx 置換後の JSX (REQ-4)

```jsx
import { ProjectCard } from "../project-card/project-card.js";
import { ProjectFormCard } from "../project-card/project-form-card.js";
// 既存 import (useState / useMutation / repository / ConflictDialog 等) は維持.

return (
  <main className="projects-view">
    <h1>プロジェクト</h1>

    <ProjectFormCard
      name={newName}
      onNameChange={setNewName}
      onSubmit={handleCreate}
    />

    <ul className="projects-view__list">
      {projects.map((project) => (
        <ProjectCard
          key={project.id}
          project={project}
          isEditing={editingId === project.id}
          editingName={editingName}
          onEditingNameChange={setEditingName}
          onStartEdit={() => openEdit(project)}
          onCancelEdit={cancelEdit}
          onSaveEdit={handleSaveEdit}
          onDelete={() => handleDelete(project)}
        />
      ))}
    </ul>

    <ConflictDialog
      open={conflictDialog.dialogState.open}
      localValue={conflictDialog.dialogState.localValue}
      serverValue={conflictDialog.dialogState.serverValue}
      onAcceptServer={conflictDialog.onAcceptServer}
      onRetryWithServer={conflictDialog.onRetryWithServer}
    />
  </main>
);
```

- 既存 state (`newName` / `editingId` / `editingName`) と mutation handler (`handleCreate` / `handleSaveEdit` / `handleDelete` / `openEdit` / `cancelEdit`) はそのまま `<ProjectCard>` / `<ProjectFormCard>` の prop に渡す.
- `<ul className="projects-view__list">` は BL-045 の枠を維持.
- 空状態 (`projects.length === 0` の placeholder) は現状 projects-view.tsx に実装されていないため本 BL では追加しない. 既存 `.projects-view__empty` ルールは将来用に維持 (NFR-PRESERVE-SHELL).

#### projects-view.css 縮減後 (REQ-5)

```css
/*
 * projects-view CSS (BL-045 / BL-060).
 * BL-060 (project-card-component): .projects-view__form / __item / __actions を
 * .project-card 系へ移譲したため撤去. .projects-view / h1 / __list / __empty は維持.
 */

.projects-view {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.projects-view h1 {
  font-size: var(--font-size-h1);
  margin: 0 0 var(--space-md) 0;
}

.projects-view__list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.projects-view__empty {
  /* WCAG 2.1 AA 4.5:1 を満たす --color-fg-subtle (#595959, 7:1) を採用. */
  color: var(--color-fg-subtle);
  text-align: center;
  padding: var(--space-lg) 0;
}
```

### 例外 / エラー処理

本 BL は presentation 層の構造再編のため, 新規例外経路は無い. 既存の `createMutation` / `updateMutation` / `deleteMutation` のエラーフロー (`ProjectConflictError` → `ConflictError` → `ConflictDialog` / `notifyError`) は無改修.

### 重要な決定 (plan 固有)

spec.md の D 章を参照. ここでは plan 固有の決定を追記する.

- **P-001 (新規ディレクトリの作成順)**: `web/src/ui/project-card/` を最初に作り, `project-card.css` を最初に書く. 次に `project-card.tsx`, 次に `project-form-card.tsx`. CSS が先にあれば import 解決が確実.
- **P-002 (`as` prop の型安全 cast)**: BL-059 P-002 と同じ cast パターン. `as: "li" | "div"` の 2 値. JSX 上で `Tag = as as "li"` cast (D-012).
- **P-003 (CSS 宣言順序)**: `.project-card` 内の宣言順序は「visual (background / border / border-radius / padding) → layout (display / flex-direction / align-items / gap)」の順で揃える. BL-052 / BL-054 / BL-057 / BL-058 / BL-059 の順序方針と整合.
- **P-004 (空ルール `.project-card--form` / `.project-card--editing` / `.project-card__actions__edit` / `.project-card__actions__delete` / `.project-card__submit`)**: 本 BL 時点で `.project-card` 基底と差異が無い場合でも空のルール (or コメントのみ) として定義しておく. 将来差異が出た時にセレクタ追加で対応できる足場とする (Hyrum's law / BL-059 P-004 と同方針).
- **P-005 (新規テストの拡張子 `.tsx`)**: jsdom DOM レンダを使うため `.tsx`. CSS 直読み部分も同ファイル内に同居させる (BL-057 / BL-058 / BL-059 と同じスタイル).
- **P-006 (CSS の重複 import)**: `project-card.tsx` と `project-form-card.tsx` の両方で `import "./project-card.css"` する. Vite の dedup により実 CSS は 1 回しかロードされない (BL-059 P-009 と同方針).
- **P-007 (design-tokens.test.ts の参照確認)**: `web/__tests__/design-tokens.test.ts` L80 で `ui/projects-view/projects-view.css` を参照している. 旧セレクタ撤去後も参照トークン (`--space-md` / `--font-size-h1` / `--space-sm` / `--space-lg` / `--color-fg-subtle`) が残っているため green を維持する. 本 BL では追従修正不要の想定だが, plan 確定時にもう一度 grep で確認.
- **P-008 (e2e/conflict-handling.spec.ts の追従)**: L105 / L118 の `getByRole("button", { name: "名称変更" })` を `getByRole("button", { name: "変更" })` に置換する. L107 / L111 / L120 / L124 の form `aria-label="プロジェクト名称変更フォーム"` は無修正で維持される (D-005).
- **P-009 (PR 提出単位)**: 単一 PR で完結させる. 影響範囲が限定的 (presentation 層のみ) で, 中間状態を作ると red のまま残るリスクがあるため.
- **P-010 (visually-hidden の重複)**: `project-card.css` と `task-card.css` で同名 `.visually-hidden` クラスを定義する. CSS 上の宣言は完全同一. cascade 上は最後に load された方の宣言が勝つが宣言が同じなので可視性に影響なし. 将来共通 utility CSS に統合する余地は残る (本 BL 対象外).

### 既存テスト / E2E の追従修正

#### `web/__tests__/design-tokens.test.ts`

- L80 で `ui/projects-view/projects-view.css` を参照していれば, 旧セレクタ撤去後も `--space-md` / `--font-size-h1` 等のトークン参照が残ることを確認 (P-007). 本 BL では追従修正不要の想定. 壊れた場合のみ最小限の追従.

#### `e2e/conflict-handling.spec.ts`

- L105 / L118 の `getByRole("button", { name: "名称変更" })` を `getByRole("button", { name: "変更" })` に置換 (P-008 / D-005 / R-002).
- L107 / L111 / L120 / L124 の form `aria-label="プロジェクト名称変更フォーム"` は無修正 (D-005).

#### `e2e/projects.spec.ts`

- accessibleName + role ベース取得のため作成 / 削除 / 編集フローは原則無修正で通る見込み. 「名称変更」 button を見ている箇所があれば追従修正 (P-008 と同方針).
- 作成 form の `aria-label="プロジェクト作成フォーム"` / input の label 関連付けは維持 (NFR-LABEL-PRESERVE / NFR-FORM-ARIA-LABEL-PRESERVE).

#### `e2e/secondary-views-style.spec.ts`

- `.projects-view` ベースの style 確認は維持セレクタを見るため無修正で通る (NFR-PRESERVE-SHELL).

#### `e2e/a11y.spec.ts`

- `/projects` の WCAG 2.1 AA スキャンが violations 0 件を維持することを確認 (AC-21 / NFR-A11Y).

## リスク / 代替案

### リスク

- **R-001 (旧 CSS セレクタ撤去で既存テストが落ちる)**: `design-tokens.test.ts` / 各種 e2e で `.projects-view__form` / `.projects-view__item` / `.projects-view__actions` を直接見ている箇所があれば落ちる. 緩和策: P-007 でセレクタ参照を事前 grep 確認. 落ちた場合は AC-19 / AC-20 で確認しつつ最小限の追従修正.
- **R-002 (「名称変更」→「変更」ラベル変更で e2e が落ちる)**: `e2e/conflict-handling.spec.ts` L105 / L118 が `getByRole("button", { name: "名称変更" })` で取得している. 緩和策: P-008 で「変更」accessibleName に追従修正. 編集 form 自体の `aria-label="プロジェクト名称変更フォーム"` は維持 (D-005) するため form 取得経路は無修正.
- **R-003 (visually-hidden の再定義が cascade で衝突)**: `task-card.css` と `project-card.css` の両方で `.visually-hidden` を定義する. 緩和策: 宣言は完全同一 (9 宣言コピー) なので cascade で勝った方が同じ宣言を適用 → 可視性に影響なし. AC-5 で project-card.css 側の存在を assert.
- **R-004 (`<li>` 内に `<form>` を入れる構造の妥当性)**: 編集モードで `<li class="project-card"><form>...</form></li>` の構造になる. HTML5 仕様では `<li>` 内に `<form>` を入れることは許されている (sectioning content). 緩和策: AC-7 で DOM 構造を assert. a11y E2E (AC-21) で violations 0 件確認.
- **R-005 (label visually-hidden で a11y が崩れる)**: label が DOM 上に存在し `htmlFor` + `id` 関連付けが成立していれば WCAG 1.3.1 / 4.1.2 は満たされる. 緩和策: AC-16 / AC-21 で確認.
- **R-006 (空状態 placeholder の追加要望)**: 現状 projects-view.tsx に空状態 `<div className="projects-view__empty">` 表示は無い (= 一覧が空でも何も表示されない). 本 BL ではスコープ外とする. 緩和策: `.projects-view__empty` ルールは将来用に維持する (NFR-PRESERVE-SHELL). 追加要望があれば別 BL.
- **R-007 (`as` prop の型安全 cast)**: BL-059 P-002 と同じ cast パターン. JSX が `keyof JSX.IntrinsicElements` のうち `li` / `div` で同じ HTMLAttributes 型を持つことを前提とする. 緩和策: 2 タグ限定で typecheck が green なら問題なし.
- **R-008 (新規 component を作っても projects-view.tsx に残る state / mutation の量)**: 本 BL は presentation 層のみで, mutation 経路は projects-view.tsx に残る. projects-view.tsx は state を持って `<ProjectCard>` / `<ProjectFormCard>` に prop で渡す形になり, view 層の責務分割の中途半端さが残る. 緩和策: 本 BL のスコープは「DOM 組み立てを引き上げる」であり, state / mutation 引き上げは別 BL. AC-15 で mutation 構成の無改修を assert.

### 代替案

- **代替案 A (共通基底 `<Card>` を作る)**: TaskCard / ProjectCard / RoutineCard が `.card` / `.card__name` / `.card__actions` を継承する形. user の方針「系統間は独立」に明確に反するため不採用.
- **代替案 B (`<ProjectCard>` を表示専用にし `<ProjectEditCard>` を別 component に分離)**: D-003 の (iii) 案. DOM 差分が小さい (1 段 flex 横並びは共通) のに 3 つの component が並ぶことになり過剰分割. 不採用.
- **代替案 C (`<ProjectFormCard>` を作成と編集の両用にする / 改名 `<ProjectInputCard>`)**: D-003 の (ii) 案. 「作成」用途と「編集」用途の文脈が混じり可読性が落ちる. 不採用.
- **代替案 D (旧 `.projects-view__form` / `__item` / `__actions` を maintain しつつ `.project-card` を追加)**: 2 系統のスタイルが残り意図がぼやける. 不採用 (= G-6 で明示的に撤去を選択).
- **代替案 E (`.visually-hidden` を `web/src/styles/utilities.css` に共通化)**: 系統横断 utility になるが, 本 BL では新規 utility CSS の新設は user 確定方針「系統独立」と齟齬. 不採用. 将来 utility 化が必要になったら別 BL.
- **代替案 F (button ラベル「名称変更」を維持する)**: e2e の追従コストはゼロになる. しかし user が明示的に「変更」を要求しているため不採用.

## テスト方針

> 全体方針は [`../../quality/test-catalog.md`](../../quality/test-catalog.md).

### 新規テスト (`web/__tests__/project-card-component.test.tsx`)

CSS 直読み + jsdom DOM レンダの 2 系統で AC-1 〜 AC-18 を網羅する. BL-052 / 054 / 056 / 057 / 058 / 059 と同じ実装スタイル (`extractRuleBody` ヘルパを再定義).

#### (a) CSS 直読み系 assert

- AC-1: `.project-card` ルール本文に visual 4 宣言 + 1 段 flex 横並び layout 宣言が存在.
- AC-2: `.project-card__name` ルール本文に `flex: 1` (または `flex-grow: 1`) が存在.
- AC-3: `.project-card__actions` ルール本文に `display: flex` / `align-items: center` / `gap: var(--space-sm)` が存在.
- AC-4: `.project-card__input` に `flex: 1` が存在し, `.project-card__input::placeholder` に `color: var(--color-fg-subtle)` が存在.
- AC-5: `.visually-hidden` ルール本文に position / width / height / overflow / clip 等の 9 宣言が存在.
- AC-12: `projects-view.css` から `.projects-view__form` / `.projects-view__item` / `.projects-view__actions` セレクタが撤去されている.
- AC-13: `projects-view.css` に `.projects-view` / `.projects-view h1` / `.projects-view__list` / `.projects-view__empty` が引き続き存在.
- AC-14: tokens.css が無改修である (本 BL で参照するトークンが引き続き定義されている).
- AC-18: `.project-card` 系セレクタに box-shadow / transition / animation / :hover が無い.

#### (b) jsdom DOM レンダ系 assert

- AC-6: `<ProjectCard isEditing=false>` を render し 3 要素 (name span / actions div / 2 button) を確認.
- AC-7: `<ProjectCard isEditing=true>` を render し form / visually-hidden label / input / 保存 / キャンセル button を確認.
- AC-8: `<ProjectFormCard>` を render し form / label / input / 追加 button を確認.
- AC-9: `<ProjectFormCard>` の input placeholder が「プロジェクト名」であることを確認.
- AC-10: 「変更」 button が存在し「名称変更」 button が存在しないことを確認.
- AC-16: getByLabelText("プロジェクト名") で input 取得を確認.
- AC-17: 作成 form / 編集 form の aria-label を確認.

#### (c) view 適用 (readFileSync 系)

- AC-11: projects-view.tsx に `import { ProjectCard }` / `import { ProjectFormCard }` が含まれ, それぞれ 1 か所以上使用. 旧 className が含まれないことを確認.

#### (d) 不変性 assert (readFileSync 方式)

- AC-15: `web/src/repositories/project-repository.ts` の export 型 / API に本 BL の前後で差分が無いことを文字列確認 (= 関連するシンボル名や interface 名の存在 grep).

### 既存テストへの追従

- `web/__tests__/design-tokens.test.ts`: P-007 で参照確認. 旧セレクタ撤去後も green を維持 (追従修正不要の想定).
- `e2e/conflict-handling.spec.ts`: P-008 で「名称変更」→「変更」追従.
- `e2e/projects.spec.ts`: 原則無修正. 「名称変更」 button を見ている箇所があれば追従.
- `e2e/secondary-views-style.spec.ts`: 無修正.
- `e2e/a11y.spec.ts`: 無修正 (NFR-A11Y / AC-21).

### 重点的に確認すること

- ProjectCard / ProjectFormCard が props 駆動で表示 / 編集 / 作成の 3 用途を網羅できることを assert (R-001 / R-008 緩和).
- 旧セレクタ撤去後も `.projects-view` 枠が無改修であることを assert (R-001 / NFR-PRESERVE-SHELL 緩和).
- 「変更」ラベル変更で e2e が追従されていることを確認 (R-002 緩和).
- `<li>` 内 `<form>` の DOM 構造が a11y E2E で violations 0 件であることを確認 (R-004 / R-005 緩和).
- label visually-hidden で `getByLabelText` が引き続き機能することを `<ProjectFormCard>` の単体テストで確認 (R-005 / NFR-LABEL-PRESERVE 緩和).
- visually-hidden の重複定義が衝突しないことを CSS 直読み + 視覚目視で確認 (R-003 緩和).
