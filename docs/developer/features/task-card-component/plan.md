# 設計・実装計画: TaskCard / TaskFormCard コンポーネント新設 + モックアップ通り visual 確定 (task-card-component)

> [`spec.md`](spec.md) の要件を, どう実現するかに落とす.

## 方針概要

新規ディレクトリ `web/src/ui/task-card/` を作り, **`<TaskCard>`** (タスク表示) / **`<TaskFormCard>`** (タスク起票) / **`task-card.css`** (専用 CSS) の 3 ファイルを新設する. today-view / tomorrow-view / focus-view の計 3 ビューで `<TaskCard>` を再利用し, today / tomorrow の起票フォームは `<TaskFormCard>` に置換する.

同時に旧 CSS セレクタ (`.day-view__card` 系 / `.day-view__form` 系 / `.focus-view__card` 系) を撤去し, モックアップ通りの visual 残課題 (V-1 〜 V-7) を `.task-card` 系の新規 CSS で**最初から**反映する.

`<PriorityStars />` / `<ProjectToggle />` / `.project-chip` / tokens.css は**完全無改修**. 系統間共通の `<Card>` 基底は作らず, ProjectCard / RoutineCard は別 BL (BL-060 / 061) で独立した CSS / コンポーネントを持つ.

## 影響範囲

| 領域 | 変更内容 |
| --- | --- |
| API | 変更なし (NFR-COMPAT) |
| DB | 変更なし |
| domain | 変更なし |
| サーバ (`server/`) | 変更なし |
| Repository (`web/src/repositories/`) | 変更なし |
| mutation / query / ConflictDialog / notifyError | 変更なし (NFR-COMPAT) |
| トークン (`web/src/styles/tokens.css`) | **変更なし** (NFR-NO-NEW-TOKENS / G-9 / D-005) |
| 新規 (`web/src/ui/task-card/task-card.tsx`) | `<TaskCard>` コンポーネントを新設. props 駆動で 3 段ゾーン構造 (header / title / actions) を描画 (REQ-1) |
| 新規 (`web/src/ui/task-card/task-form-card.tsx`) | `<TaskFormCard>` コンポーネントを新設. 同じ 3 段ゾーンで起票フォームを描画 (REQ-2) |
| 新規 (`web/src/ui/task-card/task-card.css`) | `.task-card` / `.task-card--focus` / `.task-card--form` / `.task-card__header` / `.task-card__title` / `.task-card__actions` / `.task-card__title input[type="text"]` を定義 (REQ-3) |
| CSS (`web/src/ui/day-view/day-view.css`) | 旧セレクタ `.day-view__card` / `.day-view__card--focus` / `.day-view__card__header` / `.day-view__card__title` / `.day-view__card__actions` / `.day-view__form` / `.day-view__form__project` / `.day-view__form__priority` / `.day-view__form__priority-hint` / `.day-view__form__name` / `.day-view__form__submit` を**撤去** (REQ-7). `.day-view` / `.day-view__header` / `.day-view__header h1` / `.day-view__list` / `.day-view__empty` / `.project-chip` は**維持** (REQ-13) |
| CSS (`web/src/ui/focus-view/focus-view.css`) | 旧セレクタ `.focus-view__card` / `.focus-view__project` / `.focus-view__name` / `.focus-view__actions` を**撤去** (REQ-7). `.focus-view` / `.focus-view h1` / `.focus-view__empty` は**維持** (D-007) |
| JSX (`web/src/ui/today-view/today-view.tsx`) | `<h2>現在のタスク</h2>` 撤去 (V-5). `<section className="day-view__card day-view__card--focus">` → `<TaskCard as="section" variant="focus" aria-label="現在のタスク" ... />` 置換 (REQ-4-2). `otherTasks` の `<li className="day-view__card">` → `<TaskCard as="li" variant="default" showSetFocus={true} ... />` 置換 (REQ-4-3). 起票フォーム → `<TaskFormCard idPrefix="create" inputId="task-name" ... />` 置換 (REQ-4-4). import 追加 (REQ-4-5) |
| JSX (`web/src/ui/tomorrow-view/tomorrow-view.tsx`) | `<li className="day-view__card">` → `<TaskCard as="li" variant="default" showPriority={false} dueDateMode="tomorrow" ... />` 置換 (REQ-5-1). 起票フォーム → `<TaskFormCard idPrefix="tomorrow-create" inputId="tomorrow-task-name" ... />` 置換 (REQ-5-2). import 追加 (REQ-5-3) |
| JSX (`web/src/ui/focus-view/focus-view.tsx`) | `<div className="focus-view__card">{...}</div>` → `<TaskCard as="div" variant="focus" actionSet="minimal" showPriority={false} showSetFocus={false} ... />` 置換 (REQ-6-1). `<h1>現在のタスク</h1>` は維持 (REQ-6-4 / D-007). 空状態 placeholder「現在のタスクはありません」は維持 (D-007). import 追加 |
| Component (`web/src/ui/priority-stars/priority-stars.tsx`) | **変更なし** (REQ-8 / NFR-COMPONENT-API-FROZEN / G-10) |
| Component (`web/src/ui/project-toggle/project-toggle.tsx`) | **変更なし** (REQ-8 / NFR-COMPONENT-API-FROZEN / G-10) |
| Component (`web/src/ui/conflict-dialog/`) | **変更なし** (NFR-COMPAT) |
| 新規 単体テスト (`web/__tests__/task-card-component.test.tsx`) | CSS 直読み + jsdom DOM レンダの 2 系統で AC-1 〜 AC-26 を網羅 (D-011) |
| 既存単体テスト追従 (BL-052 / 054 / 056 / 057 / 058) | `task-card-design.test.ts` / `task-card-zone-layout.test.tsx` / `form-card-design.test.ts` / `task-form-grid-layout.test.tsx` / `project-chip.test.tsx` の旧セレクタ assert を `task-card` 系に置換 / 撤去確認に書き換え (D-009 / D-011) |
| 既存単体テスト追従 (view 単体) | `today-view.test.tsx` / `tomorrow-view.test.tsx` / `focus-view.test.tsx` / `unified-day-view.test.tsx` の DOM クラス名 assert を新クラスに追従 |
| E2E (`e2e/tasks.spec.ts` 等) | 原則無改修. `taskRow` helper (`xpath=ancestor::li`) は `<li class="task-card">` でも引き続き機能. label 紐付け・role + accessibleName ベースの取得は壊れない見込み. 壊れた場合のみ最小限の追従修正 |
| E2E (`e2e/design-tokens.spec.ts`) | `.focus-view__card` ロケータ (L95-96, L150-151) を `.task-card` に追従修正 (REQ-7 / AC-20) |
| a11y E2E (`e2e/a11y.spec.ts`) | 無改修. 既存スキャンが violations 0 件のまま通る想定 (NFR-A11Y / AC-29) |

## 設計詳細

### データモデル

変更なし. 本 BL は presentation 層のみ.

### 処理フロー (DOM 構造 + コンポーネント API)

#### `<TaskCard>` API (REQ-1)

```ts
// web/src/ui/task-card/task-card.tsx
import type { Task, Priority } from "@todica/domain/task";
import type { Project } from "../../repositories/project-repository.js";
import { PriorityStars } from "../priority-stars/priority-stars.js";
import "./task-card.css";

export interface TaskCardProps {
  task: Task;
  project: Project | null;
  variant?: "default" | "focus";
  showPriority?: boolean;
  showSetFocus?: boolean;
  actionSet?: "full" | "minimal";
  dueDateMode?: "today" | "tomorrow";
  onSetPriority?: (next: Priority) => void;
  onSetFocus?: () => void;
  onDelete: () => void;
  onToggleDueDate?: () => void;
  onComplete: () => void;
  as?: "li" | "section" | "div";
  "aria-label"?: string;
}

export function TaskCard(props: TaskCardProps): JSX.Element {
  const {
    task,
    project,
    variant = "default",
    showPriority = true,
    showSetFocus = false,
    actionSet = "full",
    dueDateMode,
    onSetPriority,
    onSetFocus,
    onDelete,
    onToggleDueDate,
    onComplete,
    as = "li",
    "aria-label": ariaLabel,
  } = props;

  const className = `task-card${variant === "focus" ? " task-card--focus" : ""}`;
  const Tag = as as "li"; // 型安全のため as cast (= 各タグで type は同一)

  const showDueDateBtn = actionSet === "full" && task.origin !== "routine";

  return (
    <Tag className={className} aria-label={ariaLabel}>
      <div className="task-card__header">
        {project && <span className="project-chip">{project.name}</span>}
        {showPriority && onSetPriority && (
          <PriorityStars
            value={task.priority}
            onChange={onSetPriority}
            groupLabel={`${task.name} の優先度`}
            idPrefix={`task-${task.id}`}
          />
        )}
      </div>
      <div className="task-card__title">
        <span>{task.name}</span>
      </div>
      <div className="task-card__actions">
        {showSetFocus && onSetFocus && (
          <button type="button" onClick={onSetFocus}>
            現在のタスクにする
          </button>
        )}
        <button type="button" onClick={onDelete}>削除</button>
        {showDueDateBtn && onToggleDueDate && (
          <button type="button" onClick={onToggleDueDate}>
            {dueDateMode === "today" ? "明日にする" : "今日にする"}
          </button>
        )}
        <button type="button" onClick={onComplete}>完了</button>
      </div>
    </Tag>
  );
}
```

- `as` prop により root tag を `<li>` (一覧用 / default) / `<section>` (today focused) / `<div>` (focus-view) で切り替える. JSX 上の `Tag` 変数で表現.
- header 段に chip (左) + PriorityStars (右) を配置. `justify-content: space-between` (CSS 側) で左右に分かれる (D-002).
- title 段はタスク名のみ. `justify-content: center` で中央寄せ (V-4).
- actions 段は条件分岐で「現在のタスクにする」「削除」「明日にする / 今日にする」「完了」を構築. `justify-content: center` で中央揃え (V-2).
- `task.origin === "routine"` の場合は「明日にする / 今日にする」 button を出さない (BL-017 / BL-042 仕様維持 / D-010).

#### `<TaskFormCard>` API (REQ-2)

```ts
// web/src/ui/task-card/task-form-card.tsx
import type { Priority } from "@todica/domain/task";
import type { Project } from "../../repositories/project-repository.js";
import { PriorityStars } from "../priority-stars/priority-stars.js";
import { ProjectToggle } from "../project-toggle/project-toggle.js";
import "./task-card.css";

export interface TaskFormCardProps {
  projects: Project[];
  projectId: string;
  onProjectIdChange: (next: string) => void;
  priority: Priority;
  onPriorityChange: (next: Priority) => void;
  name: string;
  onNameChange: (next: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  idPrefix: "create" | "tomorrow-create";
  inputId: "task-name" | "tomorrow-task-name";
  formAriaLabel: "タスク起票フォーム" | "明日のタスク起票フォーム";
}

export function TaskFormCard(props: TaskFormCardProps): JSX.Element {
  const {
    projects, projectId, onProjectIdChange,
    priority, onPriorityChange,
    name, onNameChange,
    onSubmit, idPrefix, inputId, formAriaLabel,
  } = props;

  return (
    <form
      onSubmit={onSubmit}
      aria-label={formAriaLabel}
      className="task-card task-card--form"
    >
      <div className="task-card__header">
        <ProjectToggle
          value={projectId === "" ? null : projectId}
          onChange={(next) => onProjectIdChange(next ?? "")}
          projects={projects}
          idPrefix={idPrefix}
          groupLabel="プロジェクト"
        />
        <PriorityStars
          value={priority}
          onChange={onPriorityChange}
          groupLabel="優先度"
          idPrefix={idPrefix}
        />
      </div>
      <div className="task-card__title">
        <label htmlFor={inputId}>タスク名</label>
        <input
          id={inputId}
          type="text"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          required
        />
      </div>
      <div className="task-card__actions">
        <button type="submit">追加</button>
      </div>
    </form>
  );
}
```

- 起票フォームは `<TaskCard>` と**同じ `.task-card` クラス**を持ち, modifier `.task-card--form` で起票用差異を示す.
- header 段: `<ProjectToggle />` (左) + `<PriorityStars />` (右). chip の代わりに ProjectToggle が左に来る. `.task-card__header` の `justify-content: space-between` で左右配置 (D-006).
- title 段: `<label>` + `<input>` の組. label 関連付けは保持 (REQ-9). input は `.task-card__title` の `font-size: var(--font-size-h2)` を継承するため CSS 側で `input[type="text"] { font: inherit; }` を当てる (V-7).
- actions 段: `<button type="submit">追加</button>` 1 つ. `justify-content: center` で中央配置 (V-2).
- BL-058 で導入した「↑タップで選択」span と「優先度」label span は**含めない** (V-6 / D-008).

#### CSS (`task-card.css`)

```css
/*
 * BL-059 (task-card-component): TaskCard / TaskFormCard の専用 CSS.
 *
 * - 系統間で共有しない (project-card / routine-card は別 BL の別 CSS).
 * - shadow / hover / transition / animation は意図的に持たない
 *   (NFR-NO-SHADOW / NFR-NO-HOVER-TRANSITION).
 */

.task-card {
  /* visual 4 宣言 (旧 .day-view__card と等価. BL-052 から責務移譲). */
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--space-md);
  /* 3 段 layout (旧 .day-view__card と等価. BL-057 から責務移譲). */
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.task-card--focus {
  /* V-1: padding は通常と同じ. border-width だけ太く (3px) して強調. */
  border-width: 3px;
}

.task-card--form {
  /* 起票フォーム用の追加差異は本 BL 時点では無し. 将来差異が出たらここに. */
}

.task-card__header {
  display: flex;
  align-items: center;
  /* V-3: chip (左) と PriorityStars (右) を左右に分ける. */
  justify-content: space-between;
  gap: var(--space-sm);
}

.task-card__title {
  display: flex;
  align-items: center;
  /* V-4: タスク名を中央寄せ. */
  justify-content: center;
  gap: var(--space-md);
  /* V-4 / V-7: フォント拡大 (--font-size-h2 = 20px). 子の span / input に継承される. */
  font-size: var(--font-size-h2);
}

/* V-7: input はブラウザ既定で font を継承しない. 明示的に親の font を継承させる. */
.task-card__title input[type="text"] {
  font: inherit;
}

.task-card__actions {
  display: flex;
  align-items: center;
  /* V-2: ボタン中央揃え (旧 .day-view__card__actions の flex-end から変更). */
  justify-content: center;
  gap: var(--space-sm);
  /* 狭幅端末への安全弁. */
  flex-wrap: wrap;
}
```

#### today-view.tsx 置換後の JSX (REQ-4)

```jsx
// 現在のタスクセクション (旧 focusedTask セクション)
{focusedTask && (() => {
  const focusedProject = focusedTask.projectId
    ? (projects.find((p) => p.id === focusedTask.projectId) ?? null)
    : null;
  return (
    <TaskCard
      as="section"
      variant="focus"
      aria-label="現在のタスク"
      task={focusedTask}
      project={focusedProject}
      showPriority
      showSetFocus={false}
      actionSet="full"
      dueDateMode="today"
      onSetPriority={(next) => handleSetPriority(focusedTask, next)}
      onDelete={() => handleDelete(focusedTask)}
      onToggleDueDate={() => handleToggleDueDate(focusedTask)}
      onComplete={() => handleComplete(focusedTask)}
    />
  );
})()}
{/* V-5: <h2>現在のタスク</h2> は撤去. aria-label="現在のタスク" で landmark 維持. */}

// 起票フォーム
<TaskFormCard
  projects={projects}
  projectId={projectId}
  onProjectIdChange={setProjectId}
  priority={priority}
  onPriorityChange={setPriority}
  name={name}
  onNameChange={setName}
  onSubmit={handleCreate}
  idPrefix="create"
  inputId="task-name"
  formAriaLabel="タスク起票フォーム"
/>

// otherTasks リスト
<ul aria-label="タスク一覧" className="day-view__list">
  {otherTasks.map((task) => {
    const project = task.projectId
      ? (projects.find((p) => p.id === task.projectId) ?? null)
      : null;
    return (
      <TaskCard
        key={task.id}
        as="li"
        variant="default"
        task={task}
        project={project}
        showPriority
        showSetFocus
        actionSet="full"
        dueDateMode="today"
        onSetPriority={(next) => handleSetPriority(task, next)}
        onSetFocus={() => handleSetFocus(task.id)}
        onDelete={() => handleDelete(task)}
        onToggleDueDate={() => handleToggleDueDate(task)}
        onComplete={() => handleComplete(task)}
      />
    );
  })}
</ul>
```

#### tomorrow-view.tsx 置換後の JSX (REQ-5)

```jsx
// 起票フォーム
<TaskFormCard
  projects={projects}
  projectId={projectId}
  onProjectIdChange={setProjectId}
  priority={priority}
  onPriorityChange={setPriority}
  name={name}
  onNameChange={setName}
  onSubmit={handleCreate}
  idPrefix="tomorrow-create"
  inputId="tomorrow-task-name"
  formAriaLabel="明日のタスク起票フォーム"
/>

// タスクリスト
<ul aria-label="明日のタスク一覧" className="day-view__list">
  {tasks.map((task) => {
    const project = task.projectId
      ? (projects.find((p) => p.id === task.projectId) ?? null)
      : null;
    return (
      <TaskCard
        key={task.id}
        as="li"
        variant="default"
        task={task}
        project={project}
        showPriority={false}       // tomorrow-view は星を出さない既存仕様維持
        showSetFocus={false}
        actionSet="full"
        dueDateMode="tomorrow"     // 「今日にする」ボタンを出す
        onDelete={() => handleDelete(task)}
        onToggleDueDate={() => handleMoveToToday(task)}
        onComplete={() => handleComplete(task)}
      />
    );
  })}
</ul>
```

#### focus-view.tsx 置換後の JSX (REQ-6)

```jsx
return (
  <section aria-label="現在のタスク" className="focus-view">
    <h1>現在のタスク</h1>  {/* REQ-6-4 / D-007: focus-view 全体の見出しは維持 */}
    {focusedTask ? (
      <TaskCard
        as="div"
        variant="focus"
        task={focusedTask}
        project={project}
        showPriority={false}        // focus-view は星を操作しない既存仕様維持
        showSetFocus={false}
        actionSet="minimal"         // 「削除」「完了」の 2 ボタンのみ (BL-037 D-008 維持)
        onDelete={handleDelete}
        onComplete={handleComplete}
      />
    ) : (
      <div className="focus-view__empty">現在のタスクはありません</div>
    )}
    <ConflictDialog ... />
  </section>
);
```

### 例外 / エラー処理

本 BL は presentation 層の構造再編のため, 新規例外経路は無い. 既存の createMutation / updateMutation / deleteMutation / completeMutation 等のエラーフロー (OptimisticLockError → ConflictError → ConflictDialog / notifyError) は無改修.

### 重要な決定 (plan 固有)

spec.md の D 章を参照. ここでは plan 固有の決定を追記する.

- **P-001 (新規ディレクトリの作成順)**: `web/src/ui/task-card/` を最初に作り, `task-card.css` を最初に書く. 次に `task-card.tsx`, 次に `task-form-card.tsx`. CSS が先にあれば import 解決が確実.
- **P-002 (`as` prop の型安全 cast)**: `Tag = as as "li"` の cast は JSX が `keyof JSX.IntrinsicElements` のうち li / section / div で同じ HTMLAttributes 型を持つことを前提とする. 厳密には `React.ElementType` のジェネリック表現で書く案もあるが, 本 BL では 3 タグ限定なので simple cast を採用. lint/typecheck が green なら問題なし.
- **P-003 (CSS 宣言順序)**: `.task-card` 内の宣言順序は「visual (background / border / border-radius / padding) → layout (display / flex-direction / gap)」の順で揃える. BL-052 / BL-054 / BL-057 / BL-058 の順序方針と整合.
- **P-004 (`.task-card--form` の空ルール)**: 本 BL 時点で `.task-card` と差異が無い場合でも空のルール (or コメントのみ) として定義しておく. 将来差異が出た時にセレクタ追加で対応できる足場とする (Hyrum's law).
- **P-005 (新規テストの拡張子 `.tsx`)**: jsdom DOM レンダを使うため `.tsx`. CSS 直読み部分も同ファイル内に同居させる (BL-057 / BL-058 と同じスタイル).
- **P-006 (既存テストの追従マッピング詳細)**: §「既存テストの追従修正」参照.
- **P-007 (focus-view.css の縮減順)**: `.focus-view__card` / `.focus-view__project` / `.focus-view__name` / `.focus-view__actions` の 4 セレクタを撤去する. `.focus-view` / `.focus-view h1` / `.focus-view__empty` は維持. ファイル全体としては縮小される (= 行数が減る).
- **P-008 (e2e/design-tokens.spec.ts の追従)**: `.focus-view__card` を locator で参照している箇所 (L95-96, L150-151) を `.task-card` または `.task-card--focus` に置換する. e2e はテスト設計者ではなく管理者の判断で本 BL 内で追従修正する.
- **P-009 (CSS の宣言を 2 component で重複させない)**: `task-card.tsx` と `task-form-card.tsx` の両方で `import "./task-card.css"` する. Vite の dedup により実 CSS は 1 回しかロードされない.
- **P-010 (PriorityStars の groupLabel 名)**: TaskCard 内で `groupLabel={`${task.name} の優先度`}` を使う (既存 today-view.tsx の表現を踏襲). TaskFormCard 内では `groupLabel="優先度"` (既存 today-view.tsx 起票フォームの表現を踏襲).

### 既存テストの追従修正

#### `task-card-design.test.ts` (BL-052)

- AC-1 系: `.day-view__card` の visual 4 宣言 (`background` / `border` / `border-radius` / `padding`) assert を撤去. 代わりに `.task-card` の同じ visual 4 宣言が存在することを assert する形に書き換える.
- AC-2 系: `.day-view__card--focus` の visual 3 宣言 (`border-width` / `border-radius` / `padding`) assert のうち `padding: var(--space-lg)` 期待は本 BL で削除. `border-width: 2px` 期待は `border-width: 3px` に追従修正 (V-1). `border-radius: var(--radius-lg)` は `.task-card` 基底側で網羅されるため `.task-card--focus` ルールからは撤去確認に変更.
- AC-3 系: `.day-view__card--focus` ルール本文に `border-color` / `background` の単独宣言が無い (継承) assert は引き続き有効. `.task-card--focus` で同様の assert を追加.
- AC-6 系: today-view.tsx / tomorrow-view.tsx 内に `day-view__card` クラスが付与されている assert は本 BL で削除する (= 撤去確認に書き換え).
- AC-7 系: 対象セレクタが `.day-view__card` / `.day-view__card--focus` 限定 assert は本 BL では撤去確認に書き換え.

#### `task-card-zone-layout.test.tsx` (BL-057)

- AC-1 系: `.day-view__card` の layout 宣言 assert (`display: flex` / `flex-direction: column` / `align-items: stretch` / `gap: var(--space-md)`) を `.task-card` の同じ宣言 assert に書き換える. `align-items: stretch` 期待は本 BL で削除 (= `.task-card` には `align-items` 宣言を入れないため. flex column では既定が stretch なので問題なし).
- AC-2 系: `.day-view__card` の `border-radius: var(--radius-lg)` assert を `.task-card` 側に振り替え.
- AC-3 系: `.day-view__card__header` / `.day-view__card__title` / `.day-view__card__actions` の存在 / 各宣言 assert を `.task-card__header` / `.task-card__title` / `.task-card__actions` に置換. 中段の `justify-content: space-between` 期待は `justify-content: center` に追従修正 (V-4). 下段の `justify-content: flex-end` 期待は `justify-content: center` に追従修正 (V-2).
- AC-4 〜 AC-10 系: DOM レンダ assert で `<li class="day-view__card">` 期待を `<li class="task-card">` に置換. `.day-view__card__header` / `.day-view__card__title` / `.day-view__card__actions` querySelector も同様に置換.
- AC-13 系: 対象外セレクタの不変性 assert (`.day-view__form` 等が無改修) は本 BL では `.day-view__form` 撤去で失敗するため, 撤去確認に書き換える.
- AC-14 / AC-15 系: box-shadow / hover-transition 無し assert は引き続き有効 (`task-card.css` 側で同様の assert).

#### `form-card-design.test.ts` (BL-054)

- AC-1 系: `.day-view__form` の visual 4 宣言 assert は本 BL で削除. `.task-card` 側で網羅されているため重複する. もしくは「`.day-view__form` セレクタが CSS から撤去されている」assert に書き換える.
- AC-2 系: `.day-view__form` の layout assert (BL-058 で grid に置換済み) は本 BL で削除.
- AC-4 系: box-shadow 無し assert は引き続き有効 (`.task-card` 系で網羅).
- AC-7 系: 他セレクタの不変性 assert は本 BL で `.task-card` 系に振り替え.

#### `task-form-grid-layout.test.tsx` (BL-058)

- AC-1 〜 AC-7 系: `.day-view__form` の grid layout assert は本 BL で全て撤去. 代わりに `.task-card--form` (or `.task-card`) を使った 3 段 flex column 構造の DOM 存在 assert に書き換える.
- AC-8 / AC-9 系: 「↑タップで選択」テキストの存在 assert は**逆転**させる (= 存在しないことを assert する / V-6 / AC-14 と同等).
- AC-10 系: タスク名 label/input 関連付け assert は引き続き有効.
- AC-11 系: PriorityStars / ProjectToggle 本体無改修 assert は引き続き有効.
- AC-12 系: tokens.css 無改修 assert は引き続き有効.
- AC-13 系: focus-view.css の `.day-view__form` 系セレクタ混入無し assert は引き続き有効 (本 BL でも混入させない).
- AC-14 系: `.day-view__card` 系 / `.project-chip` の不変性 assert は本 BL で `.day-view__card` 系撤去のため `task-card` 系 / `.project-chip` の不変性 assert に書き換え.
- AC-15 〜 AC-18 系: 既存単体 / E2E green / a11y / box-shadow 無し assert は引き続き有効.

#### `project-chip.test.tsx` (BL-056)

- `.project-chip` ルール本文の不変性 assert は引き続き有効 (NFR-CHIP-PRESERVE / AC-21).
- `.day-view__card` 内に `<span class="project-chip">` がある assert は `.task-card__header` 内に置換する.
- ProjectToggle の `.project-toggle__button` 内に chip クラスがある assert は ProjectToggle 本体無改修のため有効のまま.

#### `today-view.test.tsx` / `tomorrow-view.test.tsx` / `focus-view.test.tsx` / `unified-day-view.test.tsx`

- DOM クラス名 (`day-view__card` / `day-view__form` / `focus-view__card`) を直接 querySelector / className assert で見ている箇所を `task-card` / `task-card--focus` / `task-card--form` に置換する.
- `<h2>現在のタスク</h2>` の存在 assert (today-view.test.tsx) は撤去確認に書き換える (V-5).
- 「↑タップで選択」テキストの存在 assert (task-form-grid-layout.test.tsx でカバー) は撤去確認に書き換える (V-6).
- accessibleName / role / id ベースの取得 (`getByLabelText("タスク名")`, `getByRole("button", { name: "削除" })` 等) は無修正で通る想定.

#### `e2e/design-tokens.spec.ts`

- L95-96: `page.locator(".focus-view__card")` を `page.locator(".task-card")` または `page.locator(".task-card--focus")` に置換 (P-008).
- L150-151: 同上.

## リスク / 代替案

### リスク

- **R-001 (旧 CSS セレクタ撤去で既存テストが連鎖的に落ちる)**: BL-052 / 054 / 056 / 057 / 058 の test ファイルが旧セレクタ前提で多数の assert を持つ. 緩和策: D-009 / D-011 / §「既存テストの追従修正」で具体的な追従マッピングを事前確定する. test-designer に渡す時にこのマッピングを根拠資料にする.
- **R-002 (PriorityStars / ProjectToggle 本体への意図せぬ変更)**: 配置先変更の文脈で本体に手を入れてしまうリスク. 緩和策: AC-23 で本体無改修を assert (NFR-COMPONENT-API-FROZEN).
- **R-003 (タスク名 label/input 関連付けの破壊)**: TaskFormCard の inputId prop 渡し忘れで label htmlFor と input id が一致しなくなるリスク. 緩和策: AC-13 / AC-24 で label/input 関連付けを assert (NFR-LABEL-PRESERVE).
- **R-004 (focus-view の 2 ボタン制約が崩れる)**: TaskCard の actionSet="minimal" を渡し忘れて 4 ボタンが出てしまうリスク. 緩和策: AC-25 で focus-view actions が 2 ボタンのみを assert (NFR-FOCUS-VIEW-ACTIONS-2BTN).
- **R-005 (`<h2>現在のタスク</h2>` 撤去で landmark 構造が壊れる)**: today-view の見出し階層が変わる. 緩和策: `<section aria-label="現在のタスク">` で landmark 自体は維持. a11y E2E (AC-29) で violations 0 件確認.
- **R-006 (`.day-view__form` の 2D grid 撤去で起票フォーム visual が崩れる)**: 起票フォームの 4 子要素 (project / priority / name / submit) が 3 段配置で表示崩れする可能性. 緩和策: AC-13 / AC-14 で TaskFormCard の DOM 構造を assert. 視覚回帰は手動確認に委ねる.
- **R-007 (`.focus-view__card` 撤去で focus-view の中央寄せ表示が崩れる)**: 旧 `.focus-view__card` の `flex: 1` / `justify-content: center` / `padding: var(--space-xl)` 等のレイアウト宣言を `.task-card` で置き換えると, focus-view の単独大表示感が損なわれる. 緩和策: `<TaskCard variant="focus">` の border 3px と font-size-h2 で「主要表示」感は確保される. 中央寄せが弱まる場合は `.focus-view` 側で `<TaskCard>` を flex 中央配置する (= focus-view.css の `.focus-view` ルールに `justify-content: center` を追加する) 余地あり (本 BL のスコープ内で plan で再判断).
- **R-008 (E2E `taskRow` helper の `xpath=ancestor::li` が機能しない)**: focus-view では `<TaskCard as="div">` を使うため `<li>` が無い. ただし `taskRow` helper は today / tomorrow / projects 配下でのみ使われ, focus-view では別 locator が使われている想定. 緩和策: tasks.spec.ts / projects.spec.ts / project-toggle.spec.ts / trash.spec.ts の `taskRow` 使用箇所を確認し, focus-view では使われないことを確認する.
- **R-009 (e2e/design-tokens.spec.ts の `.focus-view__card` ロケータ落ち)**: 既存 E2E は `.focus-view__card` を直接ロケートしている. 緩和策: P-008 で `.task-card` に追従修正する.
- **R-010 (a11y violations の発生)**: `<h2>` 撤去 / 「優先度」label span 撤去 / 「↑タップで選択」span 撤去で WCAG 違反が出るリスク. 緩和策: `<section aria-label>` + PriorityStars の `groupLabel` で代替されており, axe スキャンで violations 0 件確認 (AC-29).

### 代替案

- **代替案 A (共通基底 `<Card>` を作る)**: `web/src/ui/card/card.tsx` を新設し, `.card` / `.card__header` / `.card__title` / `.card__actions` を持たせる. TaskCard / ProjectCard / RoutineCard が同じ基底を継承する. user の方針「系統間は独立」に明確に反するため不採用.
- **代替案 B (variant prop を 1 つにまとめる `variant="default" | "focus" | "form"`)**: TaskFormCard を別 component にせず TaskCard の `variant="form"` で表現する. props が肥大化し (`projects` / `onSubmit` / `inputId` 等が default variant でも optional になり型安全性が下がる) ため不採用. ペア component (`<TaskCard>` + `<TaskFormCard>`) の方が責務が明確.
- **代替案 C (旧 `.day-view__card` を maintain しつつ `.task-card` を追加)**: 既存テストの追従修正を回避できるが, 2 系統のスタイルが残るため意図がぼやけ, 将来「どちらが正?」と分からなくなる. 不採用 (= G-8 で明示的に撤去を選択).
- **代替案 D (focus-view を本 BL の対象外にする)**: focus-view の機能差 (2 ボタン制約) を理由に本 BL のスコープから外す案. user の意図「タスクはどのビューであろうが同じタスクカード」に反するため不採用. `actionSet="minimal"` で機能差を吸収する (D-003).
- **代替案 E (タスク名フォント拡大に新規トークン `--font-size-lg` を追加)**: tokens.css に追加すれば意味論的に「lg = task title 用」と明示できるが, NFR-NO-NEW-TOKENS に反する. `--font-size-h2` 流用 (D-005) で十分.

## テスト方針

> 全体方針は [`../../quality/test-catalog.md`](../../quality/test-catalog.md).

### 新規テスト (`web/__tests__/task-card-component.test.tsx`)

CSS 直読み + jsdom DOM レンダの 2 系統で AC-1 〜 AC-26 を網羅する. BL-052 / 054 / 056 / 057 / 058 と同じ実装スタイル (`extractRuleBody` ヘルパを再定義).

#### (a) CSS 直読み系 assert

- AC-1: `.task-card` ルール本文に visual 4 宣言 + 3 段 layout 宣言が存在.
- AC-2: `.task-card--focus` ルール本文に `border-width: 3px` が存在し `padding: var(--space-lg)` が存在しない.
- AC-3: `.task-card__header` ルール本文に `display: flex` + `justify-content: space-between` + `align-items: center` が存在.
- AC-4: `.task-card__title` ルール本文に `display: flex` + `justify-content: center` + `font-size: var(--font-size-h2)` が存在.
- AC-5: `.task-card__actions` ルール本文に `display: flex` + `justify-content: center` が存在し `justify-content: flex-end` が存在しない.
- AC-6: `.task-card__title input[type="text"]` ルール本文に `font: inherit` (または `font-size: inherit`) が存在.
- AC-18: `day-view.css` から `.day-view__card` 系 / `.day-view__form` 系セレクタが撤去されている.
- AC-19: `day-view.css` の維持セレクタが引き続き存在する.
- AC-20: `focus-view.css` から `.focus-view__card` 系セレクタが撤去されている.
- AC-21: `.project-chip` ルール本文が無改修である (BL-056 完了時点と同じ宣言).
- AC-22: tokens.css が無改修である.
- AC-26: `.task-card` 系セレクタに box-shadow / transition / animation / :hover が無い.

#### (b) jsdom DOM レンダ系 assert

- AC-7: `<TaskCard>` 単体を render し 3 段ゾーンと各段の中身を確認.
- AC-8: `as="section" variant="focus" aria-label` の反映を確認.
- AC-9: `showPriority=false` で PriorityStars が出ないことを確認.
- AC-10: `showSetFocus=true` で「現在のタスクにする」が出ることを確認.
- AC-11: `actionSet="minimal"` で 2 ボタンのみであることを確認.
- AC-12: `task.origin === "routine"` で「明日にする / 今日にする」が出ないことを確認.
- AC-13: `<TaskFormCard>` 単体を render し 3 段ゾーンと各段の中身を確認.
- AC-14: `<TaskFormCard>` から「↑タップで選択」と「優先度」label span が撤去されていることを確認.
- AC-15 〜 AC-17: today-view.tsx / tomorrow-view.tsx / focus-view.tsx のソース読みで TaskCard / TaskFormCard の使用を確認 (readFileSync + 正規表現).
- AC-24: today / tomorrow を render し getByLabelText("タスク名") で input 取得を確認.
- AC-25: focus-view を render し actions が 2 ボタンのみであることを確認.

#### (c) PriorityStars / ProjectToggle 無改修 assert (readFileSync 方式)

- AC-23: priority-stars.tsx / project-toggle.tsx に `export interface PriorityStarsProps` / `export interface ProjectToggleProps` が含まれる.

### 既存テストへの追従 (P-006 で詳細マッピング)

- `task-card-design.test.ts` (BL-052): 旧 `.day-view__card` 系 assert を `.task-card` 系に置換 / 撤去確認に書き換え.
- `task-card-zone-layout.test.tsx` (BL-057): 同上.
- `form-card-design.test.ts` (BL-054): 旧 `.day-view__form` 系 assert を撤去確認に書き換え.
- `task-form-grid-layout.test.tsx` (BL-058): 旧 `.day-view__form` 系 grid layout assert を撤去確認に書き換え. 「↑タップで選択」存在 assert を逆転 (撤去確認).
- `project-chip.test.tsx` (BL-056): `.project-chip` 本体不変性 assert は維持. 配置先 `.day-view__card` を `.task-card__header` に置換.
- `today-view.test.tsx` / `tomorrow-view.test.tsx` / `focus-view.test.tsx` / `unified-day-view.test.tsx`: DOM クラス名と `<h2>現在のタスク</h2>` 存在 assert を新クラス / 撤去確認に置換.

### E2E への追従

- `e2e/tasks.spec.ts` / `e2e/projects.spec.ts` / `e2e/project-toggle.spec.ts` / `e2e/trash.spec.ts`: `taskRow` helper は `xpath=ancestor::li` で動くため `<li className="task-card">` に対しても機能する想定. 無修正で通る.
- `e2e/today-view-create-form.spec.ts`: label 紐付け・accessibleName ベースで取得する想定. 無修正で通る.
- `e2e/design-tokens.spec.ts`: `.focus-view__card` ロケータを `.task-card` に追従修正 (P-008).
- `e2e/a11y.spec.ts`: WCAG 2.1 AA スキャンで violations 0 件維持 (AC-29).

### 重点的に確認すること

- TaskCard / TaskFormCard が props 駆動で 4 ビュー (today focused / today otherTasks / tomorrow / focus + 起票) を網羅できることを assert (R-001 緩和).
- 旧セレクタ撤去後も `.project-chip` / tokens.css / PriorityStars / ProjectToggle が無改修であることを assert (R-002 / NFR-CHIP-PRESERVE / NFR-COMPONENT-API-FROZEN 緩和).
- focus-view の 2 ボタン制約 (BL-037 D-008) が維持されることを assert (R-004 / NFR-FOCUS-VIEW-ACTIONS-2BTN 緩和).
- タスク名 label/input 関連付けが保たれていることを `getByLabelText` で確認 (R-003 緩和).
- a11y E2E が violations 0 件であることを確認 (R-010 緩和).
- `<h2>現在のタスク</h2>` 撤去 / 「↑タップで選択」撤去 / 「優先度」label 撤去で a11y が崩れないことを確認 (R-005 / R-010 緩和).
