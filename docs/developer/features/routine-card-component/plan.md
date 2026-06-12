# 設計・実装計画: RoutineCard / RoutineFormCard コンポーネント新設 + routines-view 適用 (routine-card-component)

> [`spec.md`](spec.md) の要件を, どう実現するかに落とす.

## 方針概要

新規ディレクトリ `web/src/ui/routine-card/` を作り, **`<RoutineCard>`** (ルーティン表示 / 編集) / **`<RoutineFormCard>`** (ルーティン作成) / **`routine-card.css`** (専用 CSS) の 3 ファイルを新設する. `routines-view.tsx` の作成 form と一覧の `<li>` をそれぞれ置換する.

同時に旧 CSS セレクタ (`.routines-view__form` / `.routines-view__item` / `.routines-view__days` / `.routines-view__days-label` / `.routines-view__actions`) を撤去し, ペア専用 CSS で visual を**最初から**反映する. BL-045 の `.routines-view` 枠 / `.routines-view__list` / `.routines-view__empty` は無改修.

`RoutineRepository` / mutation / query / ConflictDialog / notifyError / tokens.css は**完全無改修**. 系統間共通の `<Card>` 基底は作らず, TaskCard 系 (BL-059) / ProjectCard 系 (BL-060) とは独立した CSS / コンポーネント.

## 影響範囲

| 領域 | 変更内容 |
| --- | --- |
| API | 変更なし (NFR-COMPAT) |
| DB | 変更なし |
| domain | 変更なし |
| サーバ (`server/`) | 変更なし |
| Repository (`web/src/repositories/routine-repository.ts`) | 変更なし (NFR-COMPAT) |
| mutation / query / ConflictDialog / offline-queue / notifyError | 変更なし (NFR-COMPAT) |
| トークン (`web/src/styles/tokens.css`) | **変更なし** (NFR-NO-NEW-TOKENS / G-9) |
| 新規 (`web/src/ui/routine-card/routine-card.tsx`) | `<RoutineCard>` コンポーネントを新設. props 駆動で表示 ↔ 編集モードを切替 (REQ-1 / D-003) |
| 新規 (`web/src/ui/routine-card/routine-form-card.tsx`) | `<RoutineFormCard>` コンポーネントを新設. 2 段構成 (1 段目: name + 追加, 2 段目: 曜日 + 優先度) (REQ-2) |
| 新規 (`web/src/ui/routine-card/routine-card.css`) | `.routine-card` / `.routine-card--form` / `.routine-card--editing` / `.routine-card__main` / `.routine-card__name` / `.routine-card__days-label` / `.routine-card__actions` / `.routine-card__actions__edit` / `.routine-card__actions__delete` / `.routine-card__form-inline` / `.routine-card__form-row` / `.routine-card__day-checkboxes` / `.routine-card__input` / `.routine-card__input::placeholder` / `.routine-card__select` / `.routine-card__priority-row` / `.routine-card__submit` / `.visually-hidden` を定義 (REQ-3 / D-008) |
| CSS (`web/src/ui/routines-view/routines-view.css`) | 旧セレクタ `.routines-view__form` / `.routines-view__item` / `.routines-view__days` / `.routines-view__days-label` / `.routines-view__actions` を**撤去** (REQ-5 / D-009-2). `.routines-view` / `.routines-view h1` / `.routines-view__list` / `.routines-view__empty` は**維持** (NFR-PRESERVE-SHELL) |
| JSX (`web/src/ui/routines-view/routines-view.tsx`) | `<form className="routines-view__form">{...}</form>` → `<RoutineFormCard ... />` 置換 (REQ-4-1). `<li className="routines-view__item">{...}</li>` → `<RoutineCard ... />` 置換 (REQ-4-2). `<ul className="routines-view__list">` は維持. import 追加 (REQ-4-4). state (`newName` / `newDaysOfWeek` / `newDefaultPriority` / `editingId` / `editingName`) と mutation handler はそのまま prop で渡す. button ラベル「名称変更」→「変更」 (G-8 / REQ-6). aria-label「ルーティン作成フォーム」「ルーティン名称変更フォーム」は維持 (NFR-FORM-ARIA-LABEL-PRESERVE). `DAY_LABELS` 定数は RoutineCard / RoutineFormCard 側へ移送し routines-view.tsx から削除 (REQ-4-6) |
| Component (`web/src/repositories/routine-repository.ts`) | **変更なし** (NFR-COMPAT) |
| Component (`web/src/ui/conflict-dialog/`) | **変更なし** (NFR-COMPAT) |
| 新規 単体テスト (`web/__tests__/routine-card-component.test.tsx`) | CSS 直読み + jsdom DOM レンダの 2 系統で AC-1 〜 AC-22 を網羅 (D-007) |
| 既存単体テスト追従 (`web/__tests__/design-tokens.test.ts`) | L81 `ui/routines-view/routines-view.css` を参照する箇所が, 旧セレクタ撤去後も green を維持することを確認 (P-007) |
| E2E (`e2e/routines.spec.ts`) | `getByLabel("名前")` を `getByLabel("ルーティン名")` に追従修正 (P-008-1 / R-002 / NFR-NAME-LABEL-CHANGE) |
| E2E (`e2e/secondary-views-style.spec.ts`) | AC-4 / AC-5 から routines を**除外**する追従修正 (P-008-2 / D-013). 残る対象は AC-4 で `/settings`, AC-5 で `/trash` のみ |
| E2E (`e2e/a11y.spec.ts`) | 無修正. 既存スキャンが violations 0 件のまま通る想定 (NFR-A11Y / AC-25) |

## 設計詳細

### データモデル

変更なし. 本 BL は presentation 層のみ.

### 処理フロー (DOM 構造 + コンポーネント API)

#### `<RoutineCard>` API (REQ-1)

```tsx
// web/src/ui/routine-card/routine-card.tsx
import type { WebRoutine } from "../../repositories/routine-repository.js";
import "./routine-card.css";

const DAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

export interface RoutineCardProps {
  routine: WebRoutine;
  isEditing: boolean;
  editingName: string;
  onEditingNameChange: (next: string) => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: (e: React.FormEvent) => void;
  onDelete: () => void;
  as?: "li" | "div";
}

export function RoutineCard(props: RoutineCardProps): JSX.Element {
  const {
    routine,
    isEditing,
    editingName,
    onEditingNameChange,
    onStartEdit,
    onCancelEdit,
    onSaveEdit,
    onDelete,
    as = "li",
  } = props;

  const Tag = as as "li";
  const className = `routine-card${isEditing ? " routine-card--editing" : ""}`;
  const editInputId = `routine-edit-${routine.id}`;
  const daysLabel = routine.daysOfWeek.map((d) => DAY_LABELS[d]).join("・");

  if (isEditing) {
    return (
      <Tag className={className}>
        <form
          onSubmit={onSaveEdit}
          aria-label="ルーティン名称変更フォーム"
          className="routine-card__form-inline"
        >
          <label htmlFor={editInputId} className="visually-hidden">ルーティン名</label>
          <input
            id={editInputId}
            type="text"
            className="routine-card__input"
            value={editingName}
            placeholder="ルーティン名"
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
      <div className="routine-card__main">
        <span className="routine-card__name">{routine.name}</span>
        <span className="routine-card__days-label">{daysLabel}</span>
      </div>
      <div className="routine-card__actions">
        <button type="button" className="routine-card__actions__edit" onClick={onStartEdit}>
          変更
        </button>
        <button type="button" className="routine-card__actions__delete" onClick={onDelete}>
          削除
        </button>
      </div>
    </Tag>
  );
}
```

- `isEditing` で表示モード / 編集モードの 2 つの DOM 構造を切替 (D-003).
- 表示モード: 1 段 flex 横並びで `[name + days-label]──[変更][削除]`. 左ブロック `.routine-card__main` の `flex: 1` で残り幅を占有し, actions が自然に右端へ.
- 編集モード: `<form>` を `<li>` 内に展開し, `.routine-card__form-inline` の `flex: 1` で残り幅を占有.

#### `<RoutineFormCard>` API (REQ-2)

```tsx
// web/src/ui/routine-card/routine-form-card.tsx
import "./routine-card.css";

const DAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

export interface RoutineFormCardProps {
  name: string;
  onNameChange: (next: string) => void;
  daysOfWeek: number[];
  onToggleDay: (day: number) => void;
  defaultPriority: string;
  onDefaultPriorityChange: (next: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  inputId?: string;
  priorityId?: string;
  formAriaLabel?: string;
}

export function RoutineFormCard(props: RoutineFormCardProps): JSX.Element {
  const {
    name,
    onNameChange,
    daysOfWeek,
    onToggleDay,
    defaultPriority,
    onDefaultPriorityChange,
    onSubmit,
    inputId = "routine-name",
    priorityId = "routine-priority",
    formAriaLabel = "ルーティン作成フォーム",
  } = props;

  return (
    <form
      onSubmit={onSubmit}
      aria-label={formAriaLabel}
      className="routine-card routine-card--form"
    >
      <div className="routine-card__form-row routine-card__form-row--name">
        <label htmlFor={inputId} className="visually-hidden">ルーティン名</label>
        <input
          id={inputId}
          type="text"
          className="routine-card__input"
          value={name}
          placeholder="ルーティン名"
          onChange={(e) => onNameChange(e.target.value)}
          required
        />
        <button type="submit" className="routine-card__submit">追加</button>
      </div>
      <div className="routine-card__form-row routine-card__form-row--options">
        <div className="routine-card__day-checkboxes" role="group" aria-label="曜日">
          {DAY_LABELS.map((label, day) => (
            <label key={day}>
              <input
                type="checkbox"
                checked={daysOfWeek.includes(day)}
                onChange={() => onToggleDay(day)}
              />
              {label}
            </label>
          ))}
        </div>
        <div className="routine-card__priority-row">
          <label htmlFor={priorityId}>優先度</label>
          <select
            id={priorityId}
            className="routine-card__select"
            value={defaultPriority}
            onChange={(e) => onDefaultPriorityChange(e.target.value)}
          >
            <option value="highest">最優先</option>
            <option value="normal">普通</option>
            <option value="later">後回し</option>
          </select>
        </div>
      </div>
    </form>
  );
}
```

- root は `<form className="routine-card routine-card--form">`.
- `.routine-card` 基底に `.routine-card--form` modifier を当てて `flex-direction: column` で 2 段構成.
- 1 段目: visually-hidden label + name input + 「追加」 button (横並び). input は `flex: 1` で残り幅を占有.
- 2 段目: 曜日チェックボックス群 (7 個 / `role="group"` で a11y 確保) + 優先度 select (label 可視維持 / D-008-2).
- name label テキストは「ルーティン名」(D-008 / NFR-NAME-LABEL-CHANGE).

#### CSS (`routine-card.css`)

```css
/*
 * BL-061 (routine-card-component): RoutineCard / RoutineFormCard の専用 CSS.
 *
 * - 系統間で共有しない (task-card / project-card は別 BL の別 CSS).
 * - shadow / hover / transition / animation は意図的に持たない
 *   (NFR-NO-SHADOW / NFR-NO-HOVER-TRANSITION).
 * - .visually-hidden は project-card.css / task-card.css と同形だが系統独立のため再定義 (D-008).
 */

.routine-card {
  /* visual 4 宣言. */
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--space-md);
  /* 1 段 flex 横並び layout (表示モード). */
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: var(--space-sm);
}

.routine-card--form {
  /* V-1: 2 段構成 (縦並び). */
  flex-direction: column;
  align-items: stretch;
}

.routine-card--editing {
  /* 本 BL 時点では .routine-card と同じ. 将来差異が出たらここに. */
}

.routine-card__main {
  /* V-4 / V-5: 残り幅占有 + 名前 / 曜日を縦並び. */
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.routine-card__name {
  /* 本 BL 時点では空ルール. */
}

.routine-card__days-label {
  /* 旧 routines-view.css L51-54 から移送. */
  font-size: var(--font-size-small);
  color: var(--color-fg-subtle);
}

.routine-card__actions {
  display: flex;
  align-items: center;
  /* V-6: DOM 順「変更 → 削除」がそのまま視覚順「左 → 右」になる. */
  gap: var(--space-sm);
}

.routine-card__actions__edit {
  /* 本 BL 時点では空ルール (P-004). */
}

.routine-card__actions__delete {
  /* 本 BL 時点では空ルール (P-004). */
}

.routine-card__form-inline {
  /* 編集モードで <li> 内の form を 1 段 flex 横並びにする. */
  display: flex;
  flex: 1;
  align-items: center;
  gap: var(--space-sm);
}

.routine-card__form-row {
  /* V-1: 作成フォームの各 row を横並び. */
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: var(--space-sm);
}

.routine-card__day-checkboxes {
  /* 旧 routines-view.css L26-30 から移送. */
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-sm);
}

.routine-card__priority-row {
  /* 本 BL 時点では空ルール (P-004). */
}

.routine-card__input {
  /* V-2: 残り幅を占有. */
  flex: 1;
}

.routine-card__input::placeholder {
  /* V-2: placeholder を --color-fg-subtle で薄く描画. */
  color: var(--color-fg-subtle);
}

.routine-card__select {
  /* 本 BL 時点では空ルール (P-004). */
}

.routine-card__submit {
  /* 本 BL 時点では空ルール (P-004). */
}

/* visually-hidden ユーティリティ (D-008 / 9 宣言の標準パターン).
   BL-060 で project-card.css に追加された同名クラスと同形. 系統独立のため再定義. */
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

#### routines-view.tsx 置換後の JSX (REQ-4)

```jsx
import { RoutineCard } from "../routine-card/routine-card.js";
import { RoutineFormCard } from "../routine-card/routine-form-card.js";
// 既存 import (useState / useMutation / repository / ConflictDialog 等) は維持.
// DAY_LABELS は RoutineCard / RoutineFormCard 側に移送し routines-view.tsx から削除.

return (
  <main className="routines-view">
    <h1>ルーティン</h1>

    <RoutineFormCard
      name={newName}
      onNameChange={setNewName}
      daysOfWeek={newDaysOfWeek}
      onToggleDay={toggleDay}
      defaultPriority={newDefaultPriority}
      onDefaultPriorityChange={setNewDefaultPriority}
      onSubmit={handleCreate}
    />

    <ul className="routines-view__list">
      {routines.map((routine) => (
        <RoutineCard
          key={routine.id}
          routine={routine}
          isEditing={editingId === routine.id}
          editingName={editingName}
          onEditingNameChange={setEditingName}
          onStartEdit={() => openEdit(routine)}
          onCancelEdit={cancelEdit}
          onSaveEdit={handleSaveEdit}
          onDelete={() => handleDelete(routine)}
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

- 既存 state (`newName` / `newDaysOfWeek` / `newDefaultPriority` / `editingId` / `editingName`) と mutation handler (`handleCreate` / `handleSaveEdit` / `handleDelete` / `openEdit` / `cancelEdit` / `toggleDay`) はそのまま prop で渡す.
- `<ul className="routines-view__list">` は BL-045 の枠を維持.
- 空状態 (`routines.length === 0` の placeholder) は現状 routines-view.tsx に実装されていないため本 BL では追加しない. 既存 `.routines-view__empty` ルールは将来用に維持 (NFR-PRESERVE-SHELL).

#### routines-view.css 縮減後 (REQ-5)

```css
/*
 * routines-view CSS (BL-045 / BL-061).
 * BL-061 (routine-card-component): .routines-view__form / __item / __days / __days-label / __actions を
 * .routine-card 系へ移譲したため撤去. .routines-view / h1 / __list / __empty は維持.
 */

.routines-view {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.routines-view h1 {
  font-size: var(--font-size-h1);
  margin: 0 0 var(--space-md) 0;
}

.routines-view__list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.routines-view__empty {
  /* WCAG 2.1 AA 4.5:1 を満たす --color-fg-subtle (#595959, 7:1) を採用. */
  color: var(--color-fg-subtle);
  text-align: center;
  padding: var(--space-lg) 0;
}
```

### 例外 / エラー処理

本 BL は presentation 層の構造再編のため, 新規例外経路は無い. 既存の `createMutation` / `updateMutation` / `deleteMutation` のエラーフロー (`RoutineConflictError` → `ConflictError` → `ConflictDialog` / `notifyError`) は無改修.

### 重要な決定 (plan 固有)

spec.md の D 章を参照. ここでは plan 固有の決定を追記する.

- **P-001 (新規ディレクトリの作成順)**: `web/src/ui/routine-card/` を最初に作り, `routine-card.css` を最初に書く. 次に `routine-card.tsx`, 次に `routine-form-card.tsx`. CSS が先にあれば import 解決が確実.
- **P-002 (`as` prop の型安全 cast)**: BL-059 P-002 / BL-060 D-012 と同じ cast パターン.
- **P-003 (CSS 宣言順序)**: `.routine-card` 内の宣言順序は「visual (background / border / border-radius / padding) → layout (display / flex-direction / align-items / gap)」の順で揃える. BL-052 / BL-054 / BL-057 / BL-058 / BL-059 / BL-060 の順序方針と整合.
- **P-004 (空ルール群)**: 本 BL 時点で差異が無い modifier や子要素も空のルール (or コメントのみ) として定義しておく. 将来差異が出た時にセレクタ追加で対応できる足場とする (Hyrum's law / BL-059 / BL-060 P-004 と同方針).
  - 対象: `.routine-card--editing` / `.routine-card__name` / `.routine-card__actions__edit` / `.routine-card__actions__delete` / `.routine-card__priority-row` / `.routine-card__select` / `.routine-card__submit`.
- **P-005 (新規テストの拡張子 `.tsx`)**: jsdom DOM レンダを使うため `.tsx`. CSS 直読み部分も同ファイル内に同居させる (BL-057 / BL-058 / BL-059 / BL-060 と同じスタイル).
- **P-006 (CSS の重複 import)**: `routine-card.tsx` と `routine-form-card.tsx` の両方で `import "./routine-card.css"` する. Vite の dedup により実 CSS は 1 回しかロードされない (BL-059 / BL-060 P-006 と同方針).
- **P-007 (design-tokens.test.ts の参照確認)**: `web/__tests__/design-tokens.test.ts` L81 で `ui/routines-view/routines-view.css` を参照している. 旧セレクタ撤去後も参照トークン (`--space-md` / `--font-size-h1` / `--space-sm` / `--space-lg` / `--color-fg-subtle`) が残っているため green を維持する. 本 BL では追従修正不要の想定だが, plan 確定時にもう一度 grep で確認.
- **P-008 (e2e 追従修正)**:
  - **P-008-1 (`e2e/routines.spec.ts`)**: L20 / L33 の `page.getByLabel("名前").fill(...)` を `page.getByLabel("ルーティン名").fill(...)` に置換する (D-008 / NFR-NAME-LABEL-CHANGE / R-002). L22 / L23 の `getByLabel("月", { exact: true })` / `getByLabel("火", ...)` は維持 (NFR-DAY-LABEL-PRESERVE). L39 の `getByRole("button", { name: "削除" })` は維持.
  - **P-008-2 (`e2e/secondary-views-style.spec.ts`)**: AC-4 の forms 配列 (L141-144) から `{ path: "/routines", formName: "ルーティン作成フォーム" }` を**削除**する. AC-5 の targets 配列 (L175-178) から `{ path: "/routines", itemText: routineName }` を**削除**する. これに伴い AC-5 の seed (`seedRoutine`) 呼び出しも削除する. テスト名のコメントも整合させる (`(BL-061 追従)` を追記).
  - **代替案: 「routines を `--radius-md` で残す」**: 現実的でない. 本 BL のゴール (visual 統一) と矛盾する. 不採用.
- **P-009 (PR 提出単位)**: 単一 PR で完結させる. 影響範囲が限定的 (presentation 層のみ) で, 中間状態を作ると red のまま残るリスクがあるため.
- **P-010 (visually-hidden の重複)**: `routine-card.css` / `project-card.css` / `task-card.css` で同名 `.visually-hidden` クラスを定義する. CSS 上の宣言は完全同一. cascade 上は最後に load された方の宣言が勝つが宣言が同じなので可視性に影響なし.
- **P-011 (DAY_LABELS 定数の重複定義)**: `routine-card.tsx` と `routine-form-card.tsx` の両方で `DAY_LABELS = ["日","月","火","水","木","金","土"]` を定義する. routines-view.tsx 側からは削除する. 共通化のため `web/src/ui/routine-card/day-labels.ts` のような専用モジュールに切り出すか, 各 component 内に複製するかは tasks.md / T-15 で確定するが, **方針は各 component 内に複製する** (依存ファイル数を増やさない / 7 要素の小定数のため重複コスト無視できる).
- **P-012 (a11y / `role="group" aria-label="曜日"`)**: 曜日チェックボックス群を `<div role="group" aria-label="曜日">` で囲み, 7 個の checkbox が「曜日」というコンテキストでまとまっていることを支援技術に伝える. 現行 routines-view.tsx には無いラッパだが, 「曜日」label を visually-hidden せずに優先度と並べる際の文脈区別として追加する. axe-core の "form" / "label" ルールに違反しない.
- **P-013 (RoutineFormCard が `useCallback`/`useState` を持たない)**: state / callback は親 (routines-view.tsx) が保持し, prop 経由で渡す方針. ProjectFormCard (BL-060) と整合. 子側は presentational に徹する.

### 既存テスト / E2E の追従修正

#### `web/__tests__/design-tokens.test.ts`

- L81 で `ui/routines-view/routines-view.css` を参照している. 旧セレクタ撤去後も `--space-md` / `--font-size-h1` / `--space-sm` / `--space-lg` / `--color-fg-subtle` のトークン参照が残ることを確認 (P-007). 本 BL では追従修正不要の想定. 壊れた場合のみ最小限の追従.

#### `e2e/routines.spec.ts`

- L20 / L33 の `getByLabel("名前")` を `getByLabel("ルーティン名")` に追従修正 (P-008-1).
- L22 / L23 の曜日 label は維持.
- L39 の `getByRole("button", { name: "削除" })` は維持.

#### `e2e/secondary-views-style.spec.ts`

- AC-4 の forms 配列から `/routines` を削除 (P-008-2).
- AC-5 の targets 配列から `/routines` を削除し, `seedRoutine` 呼び出しも削除 (P-008-2).
- テスト本文のコメントを `(BL-061 追従)` で更新.

#### `e2e/a11y.spec.ts`

- `/routines` の WCAG 2.1 AA スキャンが violations 0 件を維持することを確認 (AC-25 / NFR-A11Y). 無修正.

#### `e2e/boundary-time.spec.ts` / `e2e/set-focus-gesture.spec.ts`

- API 直叩きで routine を作成しているのみで, UI の「名前」label を見ていない. 無修正.

## リスク / 代替案

### リスク

- **R-001 (旧 CSS セレクタ撤去で既存テストが落ちる)**: `design-tokens.test.ts` / 各種 e2e で `.routines-view__form` / `.routines-view__item` / `.routines-view__days` / `.routines-view__days-label` / `.routines-view__actions` を直接見ている箇所があれば落ちる. 緩和策: P-007 / grep でセレクタ参照を事前確認. 落ちた場合は AC-23 / AC-24 で確認しつつ最小限の追従修正.
- **R-002 (「名前」→「ルーティン名」ラベル変更で e2e が落ちる)**: `e2e/routines.spec.ts` L20 / L33 が `getByLabel("名前")` で取得している. 緩和策: P-008-1 で「ルーティン名」accessibleName に追従修正. 編集 form 自体の `aria-label="ルーティン名称変更フォーム"` は維持.
- **R-003 (`e2e/secondary-views-style.spec.ts` AC-4 / AC-5 の対象数減少)**: routines を除外すると AC-4 は `/settings` のみ, AC-5 は `/trash` のみになる. 緩和策: テスト名 / コメントを更新して意図を明示. 将来 settings / trash も `--radius-lg` 化される可能性に備え, テスト自体の存在は残す.
- **R-004 (`<li>` 内に `<form>` を入れる構造の妥当性)**: 編集モードで `<li class="routine-card"><form>...</form></li>` の構造になる. HTML5 仕様では `<li>` 内に `<form>` を入れることは許されている. 緩和策: AC-10 で DOM 構造を assert. a11y E2E (AC-25) で violations 0 件確認.
- **R-005 (label visually-hidden で a11y が崩れる)**: name label を visually-hidden 化する. label が DOM 上に存在し `htmlFor` + `id` 関連付けが成立していれば WCAG 1.3.1 / 4.1.2 は満たされる. 優先度 label は visually-hidden にしない (D-008-2). 緩和策: AC-20 / AC-25 で確認.
- **R-006 (DAY_LABELS の重複定義によるドリフト)**: routine-card.tsx / routine-form-card.tsx で別々に定義するため将来 1 つだけ更新されてズレるリスク. 緩和策: 内容が「曜日記号 7 文字」と意味的に固定なので変更頻度は低い. 必要なら別 BL で共通モジュール化.
- **R-007 (`role="group" aria-label="曜日"` の新規追加が axe に引っかかる)**: 現行 routines-view にはこのラッパが無い. 緩和策: axe-core / WCAG では `<fieldset>` 相当の意味付けとして valid. a11y E2E (AC-25) で確認.
- **R-008 (`as` prop の型安全 cast)**: BL-059 P-002 / BL-060 D-012 と同じ cast パターン. JSX が `keyof JSX.IntrinsicElements` のうち `li` / `div` で同じ HTMLAttributes 型を持つことを前提とする.
- **R-009 (RoutineFormCard が小さい prop 数になる前に検討した代替案)**: prop 数が多いため (8 個), 内部に useState を持つ「自己完結 component」にする手もある. しかし mutation 経路は親に残るため state 上げパターン (ProjectFormCard と同じ) を維持する. 不採用.

### 代替案

- **代替案 A (共通基底 `<Card>` を作る)**: user の方針「系統間は独立」に反する. 不採用.
- **代替案 B (作成フォームを 1 段だけにする / 曜日と優先度も同じ row)**: 7 個の曜日 + 優先度 select + name input + 追加 button を 1 段に並べると窮屈. 不採用.
- **代替案 C (作成フォームを 3 段以上に分割)**: 「name + 追加」「曜日」「優先度」の 3 段にも分けられるが, 縦長になり画面占有が増える. 2 段に留める (= D-009 に同じく).
- **代替案 D (`<RoutineFormCard>` を作成と編集の両用にする)**: 編集モードは name のみ更新で曜日 / 優先度 UI を持たないため流用しても DOM 差分が大きく可読性が落ちる. 不採用.
- **代替案 E (`.visually-hidden` を `web/src/styles/utilities.css` に共通化)**: 系統間 utility になる. 本 BL では新規 utility CSS の新設は user 確定方針「系統独立」と齟齬. 将来必要になれば別 BL.
- **代替案 F (name label テキストを「名前」のまま維持し placeholder のみ追加)**: e2e の追従コストはゼロになる. ただし「ルーティン名」とのほうが placeholder と一致し UX が良い. user の方針 (ProjectCard 系の「プロジェクト名」と整合) からも「ルーティン名」を採用.

## テスト方針

> 全体方針は [`../../quality/test-catalog.md`](../../quality/test-catalog.md).

### 新規テスト (`web/__tests__/routine-card-component.test.tsx`)

CSS 直読み + jsdom DOM レンダの 2 系統で AC-1 〜 AC-22 を網羅する. BL-052 / 054 / 056 / 057 / 058 / 059 / 060 と同じ実装スタイル (`extractRuleBody` ヘルパを再定義).

#### (a) CSS 直読み系 assert

- AC-1: `.routine-card` ルール本文に visual 4 宣言 + 1 段 flex 横並び layout 宣言が存在.
- AC-2: `.routine-card--form` ルール本文に `flex-direction: column` / `align-items: stretch` が存在.
- AC-3: `.routine-card__main` ルール本文に `flex: 1` / `display: flex` / `flex-direction: column` が存在.
- AC-4: `.routine-card__actions` ルール本文に `display: flex` / `align-items: center` / `gap: var(--space-sm)` が存在.
- AC-5: `.routine-card__input` に `flex: 1` が存在し, `.routine-card__input::placeholder` に `color: var(--color-fg-subtle)` が存在.
- AC-6: `.routine-card__days-label` に `font-size: var(--font-size-small)` / `color: var(--color-fg-subtle)` が存在.
- AC-7: `.routine-card__day-checkboxes` に `display: flex` / `flex-wrap: wrap` / `gap: var(--space-sm)` が存在.
- AC-8: `.visually-hidden` ルール本文に position / width / height / overflow / clip 等の 9 宣言が存在.
- AC-16: `routines-view.css` から `.routines-view__form` / `.routines-view__item` / `.routines-view__days` / `.routines-view__days-label` / `.routines-view__actions` が撤去されている.
- AC-17: `routines-view.css` に `.routines-view` / `.routines-view h1` / `.routines-view__list` / `.routines-view__empty` が引き続き存在.
- AC-18: tokens.css が無改修である (本 BL で参照するトークンが引き続き定義されている).
- AC-22: `.routine-card` 系セレクタに box-shadow / transition / animation / :hover が無い.

#### (b) jsdom DOM レンダ系 assert

- AC-9: `<RoutineCard isEditing=false>` を render し ルート `<li class="routine-card">` + `.routine-card__main` (内に name + days-label) + `.routine-card__actions` (内に 変更 / 削除 button) を確認.
- AC-10: `<RoutineCard isEditing=true>` を render し form / visually-hidden label「ルーティン名」/ input / 保存 / キャンセル button を確認.
- AC-11: `<RoutineFormCard>` を render し 2 段 row / name input / 7 個の曜日 checkbox / 優先度 select / 追加 button を確認.
- AC-12: `<RoutineFormCard>` の input placeholder が「ルーティン名」であることを確認.
- AC-13: 「変更」 button が存在し「名称変更」 button が存在しないことを確認.
- AC-14: 曜日 label テキスト「日〜土」と `getByLabel("月", { exact: true })` 取得を確認.
- AC-20: getByLabelText("ルーティン名") + 優先度 label/select の関連付け確認.
- AC-21: 作成 form / 編集 form の aria-label 確認.

#### (c) view 適用 (readFileSync 系)

- AC-15: routines-view.tsx に `import { RoutineCard }` / `import { RoutineFormCard }` が含まれ, それぞれ 1 か所以上使用. 旧 className が含まれないことを確認.

#### (d) 不変性 assert (readFileSync 方式)

- AC-19: `web/src/repositories/routine-repository.ts` の export 型 / API に本 BL の前後で差分が無いことを文字列確認 (= 関連するシンボル名や interface 名の存在 grep).

### 既存テストへの追従

- `web/__tests__/design-tokens.test.ts`: P-007 で参照確認. 旧セレクタ撤去後も green を維持 (追従修正不要の想定).
- `e2e/routines.spec.ts`: P-008-1 で「名前」→「ルーティン名」追従.
- `e2e/secondary-views-style.spec.ts`: P-008-2 で AC-4 / AC-5 から routines を除外.
- `e2e/a11y.spec.ts`: 無修正 (NFR-A11Y / AC-25).

### 重点的に確認すること

- RoutineCard / RoutineFormCard が props 駆動で表示 / 編集 / 作成の 3 用途を網羅できることを assert (R-001 / R-009 緩和).
- 旧セレクタ撤去後も `.routines-view` 枠が無改修であることを assert (R-001 / NFR-PRESERVE-SHELL 緩和).
- 「変更」ラベル変更と「ルーティン名」label 変更で e2e が追従されていることを確認 (R-002 緩和).
- `<li>` 内 `<form>` の DOM 構造が a11y E2E で violations 0 件であることを確認 (R-004 / R-005 / R-007 緩和).
- 7 個の曜日 checkbox label テキストが維持されていることを `<RoutineFormCard>` の単体テストで確認 (R-002 / NFR-DAY-LABEL-PRESERVE 緩和).
- visually-hidden の重複定義が衝突しないことを CSS 直読み + 視覚目視で確認 (R-005 緩和).
- secondary-views-style.spec.ts の AC-4 / AC-5 から routines を外しても残る対象 (settings / trash) で green が維持されることを確認 (R-003 緩和).
