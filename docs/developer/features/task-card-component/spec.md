# 仕様: TaskCard / TaskFormCard コンポーネント新設 + モックアップ通り visual 確定 (task-card-component)

- 状態: 確定
- 関連:
  - [`../../planning/backlog.md`](../../planning/backlog.md) BL-059
  - 依存 BL: BL-035 (ui-redesign-foundation) / BL-037 (focus-view) / BL-040 (priority-star-ui) / BL-041 (project-toggle-ui) / BL-042 (task-card-actions) / BL-043 (set-focus-gesture) / BL-046 (design-tokens) / BL-051 (unified-day-view) / BL-052 (task-card-design) / BL-054 (form-card-design) / BL-056 (project-chip) / BL-057 (task-card-zone-layout) / BL-058 (task-form-grid-layout)
  - 関連 feature:
    - [`../task-card-design/spec.md`](../task-card-design/spec.md) (BL-052) — `.day-view__card` の visual 4 宣言. 本 BL で同セレクタは**撤去**し, `.task-card` 系へ責務を移譲する.
    - [`../form-card-design/spec.md`](../form-card-design/spec.md) (BL-054) — `.day-view__form` の visual 4 宣言. 本 BL で同セレクタは**撤去**し, `.task-card` 系へ責務を移譲する.
    - [`../project-chip/spec.md`](../project-chip/spec.md) (BL-056) — `.project-chip` クラス. 本 BL では **chip クラス本体は無改修**, 配置先 (header 段) のみ継続.
    - [`../task-card-zone-layout/spec.md`](../task-card-zone-layout/spec.md) (BL-057) — `.day-view__card` の 3 段ゾーン (header / title / actions). 本 BL は同じ 3 段構造を `.task-card` 名前空間で再表現する (= ゾーン構造そのものは継承し, 親クラス名を変える).
    - [`../task-form-grid-layout/spec.md`](../task-form-grid-layout/spec.md) (BL-058) — `.day-view__form` の 2D グリッド. 本 BL では起票カードを `.task-card` 系の 3 段ゾーンに**置き換える** (= 2D グリッドから 3 段 flex column への構造移行).
    - [`../focus-view/spec.md`](../focus-view/spec.md) (BL-037) — `/focus` 単独ページ. 本 BL の最大の変更点として focus-view も `<TaskCard>` で置換する (D-007).
    - [`../task-card-actions/spec.md`](../task-card-actions/spec.md) (BL-042) — 「削除 / 明日にする (今日にする) / 完了」の 3 ボタン. 本 BL の actions 段に同じ 3 ボタンが配置される. focus-view のみ 2 ボタン (D-003).
    - [`../set-focus-gesture/spec.md`](../set-focus-gesture/spec.md) (BL-043) — 「現在のタスクにする」 button. today-view の `otherTasks` カードのみで描画される (D-003).
    - [`../priority-star-ui/spec.md`](../priority-star-ui/spec.md) (BL-040) — `<PriorityStars />`. 本 BL では**コンポーネント本体無改修**で, 配置を header 段右に変更する (D-002 / D-006).
    - [`../project-toggle-ui/spec.md`](../project-toggle-ui/spec.md) (BL-041) — `<ProjectToggle />`. 本 BL では**コンポーネント本体無改修**で, 起票カードの header 段左に配置する.
    - [`../design-tokens/`](../design-tokens/) (BL-046) — `--font-size-h2` / `--space-md` / `--radius-lg` 等の参照元. 本 BL では tokens.css を**変更しない**.
  - 後続 BL (依存される側): BL-060 (ProjectCard / ProjectFormCard) / BL-061 (RoutineCard / RoutineFormCard) — 系統間で CSS を共有しない方針の起点が本 BL.
  - 上位要件: NFR-010 (最小手数 / 一貫した UI) / FR-001 (タスク起票) / FR-012 (現在のタスク強調)
  - モックアップ: `local/image.png`

## 背景 / 課題

BL-052 / BL-054 / BL-056 / BL-057 / BL-058 を通じて, タスクカード / 起票フォームは順次 visual と 3 段ゾーン構造 (BL-057) / 2D グリッド (BL-058) を獲得した. しかし完成形に近づいた今, 以下の構造的問題と visual 残課題が顕在化している.

### 構造的問題

- **JSX 重複**: タスクカードの DOM 構造が現在 3 か所に散在している.
  - `web/src/ui/today-view/today-view.tsx` の `focusedTask` `<section className="day-view__card day-view__card--focus">` (L448 付近) と `otherTasks` `<li className="day-view__card">` (L534 付近).
  - `web/src/ui/tomorrow-view/tomorrow-view.tsx` の `<li className="day-view__card">` (L442 付近).
  - 各箇所で BL-057 の 3 段ゾーン (header / title / actions), BL-056 の chip, BL-040 の PriorityStars, BL-042 の 4 ボタンを個別に組み立てており, 仕様変更時に 3 か所同時修正が必要.
- **focus-view が別構造**: `/focus` ルート (`web/src/ui/focus-view/focus-view.tsx`) は BL-037 の独自構造 `.focus-view__card` を持ち, day-view 系と統一されていない. user の意図は「タスクはどのビューであろうが同じタスクカード」であり, focus-view も同じ `<TaskCard>` で表現したい.
- **起票カードとタスクカードの配置が別 CSS**: モックアップでは起票カード (BL-058 の `.day-view__form`) と既存タスクカード (BL-057 の `.day-view__card`) が同じ枠線・角丸・padding・3 段ゾーンで並んでいる. 現状は CSS クラスが別 (`.day-view__form` / `.day-view__card`) で 4 visual 宣言を二重に書いている.

### モックアップ通り visual の残課題

BL-057 完了時点で残っている visual ズレ:

- 現在のタスクカード (`.day-view__card--focus`) の `padding: var(--space-lg)` が他のカードより大きく, モックアップの「同じ大きさ + 縁だけ太い」見えと不一致.
- actions の 4 ボタンが `justify-content: flex-end` で右寄せ. user は中央揃えを望む.
- 優先度 (PriorityStars) が title 段でタスク名と並列だが, user は header 段の右側 (= chip の対角) を望む.
- タスク名が title 段の左寄せ + 普通サイズだが, モック上は中央寄せ + フォント拡大.
- 「現在のタスク」h2 見出し (today-view.tsx L449) を撤去したい (section の `aria-label` で landmark は維持).
- 起票カードの「↑タップで選択」span (BL-058 の `.day-view__form__priority-hint`) と「優先度」label span (PriorityStars 上のラベル `id="task-priority-label"`) を撤去したい.
- 起票カードのタスク名 input のフォントも一回り大きくしたい.
- 現在のタスクカードは padding を通常と揃えつつ border-width だけ太く (= 3px) して強調を保つ.

### user 指摘 (要約)

- 「同種類のペア (TaskCard 表示 + TaskFormCard 起票) は配置を揃える」「系統間 (Task 系 ↔ Project 系 ↔ Routine 系) は独立」.
- 「タスクはどのビューであろうが (today / tomorrow / focus) 同じタスクカード」.
- モックアップ通りの visual を「最初から組み込んだ状態で新設」する (= 後で別 BL の visual 微調整に回さない).

### 方針の核

本 BL は以下の 3 つを同時に実現する.

1. **新規 React コンポーネント `<TaskCard>`** (タスク表示) を `web/src/ui/task-card/task-card.tsx` に新設し, today-view / tomorrow-view / focus-view の**計 3 ビュー全て**で再利用する.
2. **新規 React コンポーネント `<TaskFormCard>`** (タスク起票) を `web/src/ui/task-card/task-form-card.tsx` に新設し, today-view / tomorrow-view の起票フォームを置換する.
3. **ペア専用 CSS `web/src/ui/task-card/task-card.css`** に `.task-card` / `.task-card__header` / `.task-card__title` / `.task-card__actions` を新設し, 両コンポーネントが共有する. 系統間共通の `<Card>` 基底は作らない. project-card / routine-card は別 BL (BL-060 / 061) で独立した CSS / コンポーネントを持つ.

これと同時にモックアップ通りの visual も**最初から組み込んだ状態**で新設する (BL-062 として後追いしない).

shadow / hover / transition / animation は BL-052 / BL-054 / BL-056 / BL-057 / BL-058 と同方針で**一切追加しない**.

## ゴール / 非ゴール

### ゴール

- **G-1 (TaskCard コンポーネントの新設)**: `web/src/ui/task-card/task-card.tsx` に `<TaskCard>` を新設し, 3 段ゾーン (header / title / actions) を持つタスクカードを props 駆動で描画する.
- **G-2 (TaskFormCard コンポーネントの新設)**: `web/src/ui/task-card/task-form-card.tsx` に `<TaskFormCard>` を新設し, 同じ 3 段ゾーンで起票フォーム (project / priority / name / submit) を描画する.
- **G-3 (専用 CSS の新設)**: `web/src/ui/task-card/task-card.css` に `.task-card` / `.task-card__header` / `.task-card__title` / `.task-card__actions` 等を新設し, TaskCard / TaskFormCard が共有する.
- **G-4 (today-view 適用)**: today-view の `focusedTask` セクションと `otherTasks` 一覧の各 `<li>` が `<TaskCard>` に置換される. 起票フォームは `<TaskFormCard>` に置換される.
- **G-5 (tomorrow-view 適用)**: tomorrow-view の `<li>` が `<TaskCard>` に置換される. 起票フォームは `<TaskFormCard>` に置換される.
- **G-6 (focus-view 適用)**: focus-view の `.focus-view__card` が `<TaskCard>` に置換され, 同じ `.task-card` クラスで描画される.
- **G-7 (モックアップ通りの visual 反映)**: 以下の visual がすべて反映される:
  - V-1: 現在のタスクカード (`.task-card--focus`) の `padding` を通常カードと揃え, 強調は `border-width: 3px` で表現する (BL-052 の `.day-view__card--focus` の `padding: var(--space-lg)` 撤去).
  - V-2: actions の 4 ボタンを `justify-content: center` で中央揃え.
  - V-3: 優先度 (PriorityStars) を header 段の右側 (= chip の右) に配置.
  - V-4: タスク名を title 段で中央寄せ + フォント拡大 (`--font-size-h2` 流用 / D-005).
  - V-5: today-view の `<h2>現在のタスク</h2>` を撤去 (section の `aria-label="現在のタスク"` で landmark は維持).
  - V-6: 起票カードから「↑タップで選択」span と「優先度」label span を撤去.
  - V-7: 起票カードのタスク名 input のフォントを `--font-size-h2` に拡大.
- **G-8 (旧 CSS 系の撤去)**: `.day-view__card` / `.day-view__card--focus` / `.day-view__card__header` / `.day-view__card__title` / `.day-view__card__actions` / `.day-view__form` / `.day-view__form__project` / `.day-view__form__priority` / `.day-view__form__priority-hint` / `.day-view__form__name` / `.day-view__form__submit` / `.focus-view__card` / `.focus-view__project` / `.focus-view__name` / `.focus-view__actions` の各セレクタを CSS から**撤去**する (= 新クラス系 `.task-card` 系に責務を移譲).
- **G-9 (tokens.css 無改修)**: `web/src/styles/tokens.css` を**変更しない**. visual 拡大は既存トークン (`--font-size-h2` = 20px) を流用する (D-005).
- **G-10 (コンポーネント本体無改修)**: `<PriorityStars />` (BL-040) / `<ProjectToggle />` (BL-041) の **prop API / 内部 DOM / class 名**を一切変更しない. 配置だけを変える.
- **G-11 (chip 本体無改修)**: `.project-chip` クラス (BL-056) のルール本文を**変更しない**. 配置だけを継続する (header 段).
- **G-12 (a11y 違反 0 件維持)**: `e2e/a11y.spec.ts` の WCAG 2.1 AA スキャンで violations 0 件を維持する.

### 非ゴール

- **ProjectCard / ProjectFormCard 系の新設**: BL-060 のスコープ.
- **RoutineCard / RoutineFormCard 系の新設**: BL-061 のスコープ.
- **系統間共通の基底 `<Card>` コンポーネント**: 作らない. project-card / routine-card は別 CSS ファイル / 別コンポーネント (D-001).
- **`<PriorityStars />` / `<ProjectToggle />` 本体の改修**: G-10 / D-006 で本体無改修を確定. ヘルプラベル「↑タップで選択」(BL-058 で追加) は `<TaskFormCard>` 内 (= PriorityStars 外側) で削除するだけ.
- **`.project-chip` クラス本体の変更**: BL-056 で確定済み.
- **tokens.css への新規トークン追加**: 既存トークンで完結する (D-005).
- **focus-view の機能変更**: actions の 2 ボタン (削除 / 完了) 制約 (BL-037 D-008) は維持する. focus 経路で `<TaskCard>` が 4 ボタンを出さないよう, `<TaskCard>` の variant prop で actions を制御する (D-003).
- **起票フォームの 2D グリッド維持**: BL-058 の `.day-view__form` の 2 列 × 3 段は本 BL で**撤去**し, `.task-card` の 3 段 flex column 構造に**変換**する. 起票フォームの 4 子要素 (project / priority / name / submit) は機能としては維持されるが, 内部レイアウトは 3 段化される (D-006).
- **既存 E2E の積極的な書き換え**: 既存 E2E は role + accessibleName ベースのロケータが大半. `taskRow` helper (`xpath=ancestor::li`) は `<li className="task-card">` でも引き続き動く想定. 壊れたら最小限の追従修正にとどめる.
- **サーバ API / domain / Repository / mutation / query / ConflictDialog / notifyError 経路**: 一切無改修.

## 要件

### 機能要件

- **REQ-1 (`<TaskCard>` コンポーネントの新設)**

  `web/src/ui/task-card/task-card.tsx` に以下の React コンポーネントを新設する:

  ```ts
  export interface TaskCardProps {
    task: Task;                        // 表示対象タスク (domain Task 型)
    project: Project | null;           // 紐づくプロジェクト (chip 表示用)
    variant?: "default" | "focus";     // 強調 variant 切替 (D-002)
    showPriority?: boolean;            // PriorityStars を出すか (default: true). tomorrow-view では false (D-003)
    showSetFocus?: boolean;            // 「現在のタスクにする」ボタンを出すか (default: false). today-view otherTasks のみ true (D-003)
    actionSet?: "full" | "minimal";    // actions の構成 (D-003). full: 削除/明日にする(今日にする)/完了 (+ origin 条件分岐). minimal: 削除/完了 のみ (focus-view 用)
    dueDateMode?: "today" | "tomorrow"; // 期限切替ボタンのラベルを「明日にする」/「今日にする」のどちらにするか (D-003). actionSet="full" のとき必須
    onSetPriority?: (next: Priority) => void;
    onSetFocus?: () => void;
    onDelete: () => void;
    onToggleDueDate?: () => void;       // actionSet="full" のとき必須
    onComplete: () => void;
    // ラッパ要素のタグを選択可能にする (D-004)
    as?: "li" | "section" | "div";     // default: "li"
    "aria-label"?: string;             // section variant 用 (today の現在のタスクで `aria-label="現在のタスク"` を渡す)
  }
  ```

  - 出力 DOM 構造は以下の 3 段ゾーン:

    ```html
    <li class="task-card task-card--<variant>" aria-label="...">
      <div class="task-card__header">
        {project && <span class="project-chip">{project.name}</span>}
        {showPriority && <PriorityStars ... />}
      </div>
      <div class="task-card__title">
        <span>{task.name}</span>
      </div>
      <div class="task-card__actions">
        {showSetFocus && <button>現在のタスクにする</button>}
        <button>削除</button>
        {actionSet === "full" && task.origin !== "routine" && (
          <button>{dueDateMode === "today" ? "明日にする" : "今日にする"}</button>
        )}
        <button>完了</button>
      </div>
    </li>
    ```

  - PriorityStars の配置は **header 段の右側** (V-3 / D-002) とし, chip の右に並ぶ.
  - title 段はタスク名のみ (V-4. 星は header に移ったため title からは星を撤去).
  - `aria-label` prop が渡された場合のみ `<li>` (or `<section>`) に `aria-label` を付与する.
  - PriorityStars / ProjectToggle / project-chip の class / role / accessibleName は一切変えない (REQ-10).

- **REQ-2 (`<TaskFormCard>` コンポーネントの新設)**

  `web/src/ui/task-card/task-form-card.tsx` に以下の React コンポーネントを新設する:

  ```ts
  export interface TaskFormCardProps {
    projects: Project[];
    projectId: string;                 // "" or Project["id"]
    onProjectIdChange: (next: string) => void;
    priority: Priority;
    onPriorityChange: (next: Priority) => void;
    name: string;
    onNameChange: (next: string) => void;
    onSubmit: (e: React.FormEvent) => void;
    idPrefix: "create" | "tomorrow-create";   // ProjectToggle / PriorityStars / input の id prefix
    inputId: "task-name" | "tomorrow-task-name"; // タスク名 input の id (既存テスト互換)
    formAriaLabel: "タスク起票フォーム" | "明日のタスク起票フォーム";
  }
  ```

  - 出力 DOM 構造は `<TaskCard>` と**同じ 3 段ゾーン**:

    ```html
    <form class="task-card task-card--form" aria-label="...">
      <div class="task-card__header">
        <ProjectToggle ... />        ← 左
        <PriorityStars ... />        ← 右 (chip と対角配置 / V-3 と同形)
      </div>
      <div class="task-card__title">
        <label for="task-name">タスク名</label>
        <input id="task-name" ... />    ← 中央寄せ + フォント拡大 (V-7)
      </div>
      <div class="task-card__actions">
        <button type="submit">追加</button>  ← 中央 (V-2)
      </div>
    </form>
    ```

  - BL-058 で追加した「↑タップで選択」`<span class="day-view__form__priority-hint">` は**含めない** (V-6).
  - BL-040 / BL-058 で残っている「優先度」`<span id="task-priority-label">` も**含めない** (V-6).
  - タスク名 label/input 関連付け (`<label htmlFor>` + `<input id>`) は**保持**する (REQ-9 / NFR-LABEL-PRESERVE).
  - 起票フォームの 2D グリッド (BL-058) は撤去し, `.task-card` の 3 段 flex column 構造に変換する.

- **REQ-3 (専用 CSS `task-card.css` の新設)**

  `web/src/ui/task-card/task-card.css` に以下のルールを定義する.

  - **基底 `.task-card`** (visual 4 宣言 + 3 段 layout 共通):

    ```css
    .task-card {
      display: flex;
      flex-direction: column;
      gap: var(--space-md);
      background: var(--color-bg);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      padding: var(--space-md);
    }
    ```

  - **強調 variant `.task-card--focus`** (V-1):

    ```css
    .task-card--focus {
      border-width: 3px;
      /* padding は .task-card と同じ (var(--space-md)). BL-052 の var(--space-lg) は撤去. */
    }
    ```

  - **header 段** (V-3 / V-6):

    ```css
    .task-card__header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-sm);
    }
    ```

    左に chip, 右に PriorityStars (TaskCard) / 右に PriorityStars (TaskFormCard) が配置される.

  - **title 段** (V-4 / V-7):

    ```css
    .task-card__title {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--space-md);
      font-size: var(--font-size-h2);
    }
    ```

    タスク名 (`<span>` または `<input>`) が中央寄せ + フォント拡大. `font-size: var(--font-size-h2)` は子の span / input にも継承される (= input には別途 `font-size: inherit` を当てる必要があるかは plan で確定).

  - **actions 段** (V-2):

    ```css
    .task-card__actions {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--space-sm);
      flex-wrap: wrap;
    }
    ```

    ボタン群が中央揃え (= 旧 `flex-end` から変更). `flex-wrap: wrap` は狭幅端末への安全弁.

  - **タスク名 input の font 継承** (V-7):

    ```css
    .task-card__title input[type="text"] {
      font: inherit;
    }
    ```

    `<input>` はブラウザ既定でフォントを継承しないため明示する.

  - shadow / hover / transition / animation は**追加しない**.

- **REQ-4 (today-view の置換)**

  `web/src/ui/today-view/today-view.tsx` を以下のように変更する:

  - 4-1. `<h2>現在のタスク</h2>` を**撤去**する (V-5). section の `aria-label="現在のタスク"` は維持.
  - 4-2. `focusedTask` の `<section className="day-view__card day-view__card--focus">` を `<TaskCard as="section" variant="focus" aria-label="現在のタスク" actionSet="full" dueDateMode="today" showPriority showSetFocus={false} ... />` に置換する.
  - 4-3. `otherTasks.map(...)` 内の `<li className="day-view__card">` を `<TaskCard as="li" variant="default" actionSet="full" dueDateMode="today" showPriority showSetFocus={true} ... />` に置換する.
  - 4-4. 起票フォーム `<form className="day-view__form">` を `<TaskFormCard idPrefix="create" inputId="task-name" formAriaLabel="タスク起票フォーム" ... />` に置換する.
  - 4-5. import 文に `import { TaskCard } from "../task-card/task-card.js"` / `import { TaskFormCard } from "../task-card/task-form-card.js"` を追加する.
  - 4-6. `import "../day-view/day-view.css"` は保持する (day-view.css の `.day-view` / `.day-view__header` / `.day-view__list` / `.day-view__empty` 等は引き続き必要).

- **REQ-5 (tomorrow-view の置換)**

  `web/src/ui/tomorrow-view/tomorrow-view.tsx` を以下のように変更する:

  - 5-1. `<li className="day-view__card">` を `<TaskCard as="li" variant="default" actionSet="full" dueDateMode="tomorrow" showPriority={false} showSetFocus={false} ... />` に置換する.
    - `showPriority={false}` は tomorrow-view が PriorityStars を持たない既存仕様 (BL-057 REQ-6) を維持するため.
  - 5-2. 起票フォーム `<form className="day-view__form">` を `<TaskFormCard idPrefix="tomorrow-create" inputId="tomorrow-task-name" formAriaLabel="明日のタスク起票フォーム" ... />` に置換する.
  - 5-3. import 文に同様の追加.

- **REQ-6 (focus-view の置換)**

  `web/src/ui/focus-view/focus-view.tsx` を以下のように変更する:

  - 6-1. `<div className="focus-view__card">{ ... }</div>` を `<TaskCard as="div" variant="focus" actionSet="minimal" showPriority={false} showSetFocus={false} ... />` に置換する. ただし focused タスクが無い場合 (`focusedTask === null`) は「現在のタスクはありません」表示を維持する (= `<TaskCard>` を出さず空状態 placeholder を出す).
  - 6-2. `actionSet="minimal"` により actions 段は「削除」「完了」の 2 ボタンのみとなる (BL-037 D-008 の仕様維持 / D-003).
  - 6-3. `variant="focus"` により縁が 3px 太枠で描画される (= 「単独の主要表示」感を保つ).
  - 6-4. `<h1>現在のタスク</h1>` (focus-view L229) は**維持**する (= focus-view 全体の見出しで, カード内ではない).
  - 6-5. import 文に `import { TaskCard } from "../task-card/task-card.js"` を追加する.
  - 6-6. `import "./focus-view.css"` は撤去または維持する (D-007 で確定).

- **REQ-7 (旧 CSS 撤去)**

  `web/src/ui/day-view/day-view.css` から以下のセレクタを**撤去**する:

  - `.day-view__card`
  - `.day-view__card--focus`
  - `.day-view__card__header`
  - `.day-view__card__title`
  - `.day-view__card__actions`
  - `.day-view__form`
  - `.day-view__form__project`
  - `.day-view__form__priority`
  - `.day-view__form__priority-hint`
  - `.day-view__form__name`
  - `.day-view__form__submit`

  ただし `.day-view` / `.day-view__header` / `.day-view__header h1` / `.day-view__list` / `.day-view__empty` / `.project-chip` の各セレクタは**維持**する (= 引き続き今日 / 明日ビューの枠組み, 一覧, 空状態, chip で必要).

  `web/src/ui/focus-view/focus-view.css` から以下のセレクタを撤去する (D-007):

  - `.focus-view__card`
  - `.focus-view__project`
  - `.focus-view__name`
  - `.focus-view__actions`

  `.focus-view` / `.focus-view h1` / `.focus-view__empty` は維持する (= 枠と空状態 placeholder で必要).

- **REQ-8 (`<PriorityStars />` / `<ProjectToggle />` 本体無改修)**

  `web/src/ui/priority-stars/priority-stars.tsx` および `web/src/ui/project-toggle/project-toggle.tsx` の **prop API / 内部 DOM / class 名** に一切触れない. 本 BL の TaskCard / TaskFormCard は既存 prop で呼び出すだけ.

- **REQ-9 (タスク名 label/input 関連付けの保持)**

  既存の `<label htmlFor="task-name">タスク名</label>` + `<input id="task-name">` (today) / `<label htmlFor="tomorrow-task-name">タスク名</label>` + `<input id="tomorrow-task-name">` (tomorrow) の関連付けを**完全に保持**する. `<TaskFormCard>` の `inputId` prop で id を渡し, label も同 prop に基づき出力する.

- **REQ-10 (`.project-chip` 無改修)**

  `.project-chip` クラスのルール本文 (`day-view.css` 内 L153-159) を**変更しない**. 配置先 (header 段) のみ維持.

- **REQ-11 (tokens.css 無改修)**

  `web/src/styles/tokens.css` を**変更しない**. 本 BL で参照する `--font-size-h2` / `--font-size-body` / `--space-xs` / `--space-sm` / `--space-md` / `--space-lg` / `--radius-lg` / `--color-bg` / `--color-fg` / `--color-fg-subtle` / `--color-border` は既に存在する.

- **REQ-12 (CSS import の追加)**

  `<TaskCard>` / `<TaskFormCard>` のいずれか, または両方の tsx ファイル先頭で `import "./task-card.css"` する. 既存 view (today / tomorrow / focus) は `<TaskCard>` / `<TaskFormCard>` を import するだけで CSS が連動する.

- **REQ-13 (空状態 / ヘッダ / リスト枠は無改修)**

  本 BL の対象は `.task-card` 系の新設と `.day-view__card` / `.day-view__form` / `.focus-view__card` 系の撤去のみ. `.day-view` / `.day-view__header` / `.day-view__header h1` / `.day-view__list` / `.day-view__empty` / `.focus-view` / `.focus-view h1` / `.focus-view__empty` / `.project-chip` のルール本文には触れない.

### 非機能要件

- **NFR-NO-NEW-TOKENS**: tokens.css を変更しない. 既存トークンのみで構成する.
- **NFR-NO-SHADOW**: `.task-card` 系セレクタに `box-shadow` を追加しない.
- **NFR-NO-HOVER-TRANSITION**: `.task-card` 系セレクタに `:hover` / `transition` / `animation` を追加しない.
- **NFR-A11Y**: `e2e/a11y.spec.ts` の WCAG 2.1 AA スキャンで violations 0 件を維持する.
- **NFR-DOM-COMPATIBLE**: タスクカード本体の DOM タグ (`<li>` / `<section>` / `<div>` の使い分け) は既存 view と同一 (today otherTasks: `<li>`, today focused: `<section>`, tomorrow: `<li>`, focus: `<div>`). 既存 E2E の `xpath=ancestor::li` 取得が引き続き機能する.
- **NFR-LABEL-PRESERVE**: タスク名 label/input の htmlFor + id 関連付けは無改修. `getByLabelText("タスク名")` で input が取得可能.
- **NFR-COMPONENT-API-FROZEN**: PriorityStars / ProjectToggle の prop API は無改修.
- **NFR-CHIP-PRESERVE**: `.project-chip` ルール本文は無改修. BL-056 のテストが green を維持.
- **NFR-COMPAT**: サーバ API / domain / Repository / mutation / query / ConflictDialog / notifyError 経路は無改修.
- **NFR-FOCUS-VIEW-ACTIONS-2BTN**: focus-view の actions は「削除 / 完了」の 2 ボタンのみ (BL-037 D-008 の機能制約維持).

## 受け入れ基準

> 書き方は [`../../quality/acceptance-criteria.md`](../../quality/acceptance-criteria.md) に従う.
> 検証コマンドはルートからの `npm test` を基準とする.

```
シナリオ AC-1: .task-card 基底クラスが visual 4 宣言 + 3 段 layout を持つ
  Given web/src/ui/task-card/task-card.css を開いた
  When  .task-card セレクタのルール本文を観察する
  Then  display: flex の宣言を含む
   かつ flex-direction: column の宣言を含む
   かつ gap: var(--space-md) の宣言を含む
   かつ background: var(--color-bg) の宣言を含む
   かつ border: 1px solid var(--color-border) (または等価分解) の宣言を含む
   かつ border-radius: var(--radius-lg) の宣言を含む
   かつ padding: var(--space-md) の宣言を含む
```

```
シナリオ AC-2: .task-card--focus が 3px 太枠 + 通常 padding を持つ (V-1)
  Given web/src/ui/task-card/task-card.css を開いた
  When  .task-card--focus セレクタのルール本文を観察する
  Then  border-width: 3px の宣言を含む
   かつ padding: var(--space-lg) の宣言を含まない (= 通常カードと padding を揃える / V-1)
```

```
シナリオ AC-3: .task-card__header が PriorityStars を右配置するための space-between を持つ (V-3)
  Given web/src/ui/task-card/task-card.css を開いた
  When  .task-card__header セレクタのルール本文を観察する
  Then  display: flex の宣言を含む
   かつ justify-content: space-between の宣言を含む
   かつ align-items: center の宣言を含む
```

```
シナリオ AC-4: .task-card__title がタスク名中央寄せ + フォント拡大を持つ (V-4 / V-7)
  Given web/src/ui/task-card/task-card.css を開いた
  When  .task-card__title セレクタのルール本文を観察する
  Then  display: flex の宣言を含む
   かつ justify-content: center の宣言を含む
   かつ font-size: var(--font-size-h2) の宣言を含む
```

```
シナリオ AC-5: .task-card__actions がボタン中央揃えを持つ (V-2)
  Given web/src/ui/task-card/task-card.css を開いた
  When  .task-card__actions セレクタのルール本文を観察する
  Then  display: flex の宣言を含む
   かつ justify-content: center の宣言を含む
   かつ justify-content: flex-end の宣言を含まない (回帰防止)
```

```
シナリオ AC-6: タスク名 input がカードの font を継承する (V-7)
  Given web/src/ui/task-card/task-card.css を開いた
  When  .task-card__title input[type="text"] セレクタのルール本文を観察する
  Then  font: inherit (または font-size: inherit) の宣言を含む
```

```
シナリオ AC-7: <TaskCard> がタスクを 3 段ゾーン構造で描画する
  Given web/src/ui/task-card/task-card.tsx の TaskCard コンポーネントが存在する
   かつ project あり / showPriority=true / showSetFocus=false / actionSet="full" / dueDateMode="today" で render する
  When  出力 DOM を観察する
  Then  ルート要素は <li class="task-card"> である
   かつ ルート要素内に直下子要素 .task-card__header が存在する
   かつ .task-card__header 内に <span class="project-chip"> が存在する
   かつ .task-card__header 内に role="radiogroup" 要素 (= PriorityStars) が存在する
   かつ ルート要素内に直下子要素 .task-card__title が存在する
   かつ .task-card__title 内にタスク名テキストが存在する
   かつ ルート要素内に直下子要素 .task-card__actions が存在する
   かつ .task-card__actions 内に「削除」 button が存在する
   かつ .task-card__actions 内に「明日にする」 button が存在する (origin !== "routine" のとき)
   かつ .task-card__actions 内に「完了」 button が存在する
```

```
シナリオ AC-8: <TaskCard> の variant="focus" + as="section" + aria-label が反映される (D-002 / D-004)
  Given <TaskCard as="section" variant="focus" aria-label="現在のタスク" ... /> を render する
  When  出力 DOM を観察する
  Then  ルート要素は <section> である
   かつ ルート要素の className に "task-card" と "task-card--focus" の両方を含む
   かつ ルート要素は aria-label="現在のタスク" を持つ
```

```
シナリオ AC-9: <TaskCard> の showPriority=false (tomorrow-view) では PriorityStars が出ない (D-003)
  Given <TaskCard showPriority={false} ... /> を render する
  When  出力 DOM を観察する
  Then  role="radiogroup" 要素が存在しない (= PriorityStars が出ていない)
```

```
シナリオ AC-10: <TaskCard> の showSetFocus=true (today otherTasks) では「現在のタスクにする」が出る (D-003)
  Given <TaskCard showSetFocus={true} ... /> を render する
  When  出力 DOM を観察する
  Then  .task-card__actions 内に「現在のタスクにする」 button が存在する
```

```
シナリオ AC-11: <TaskCard> の actionSet="minimal" (focus-view) では actions が 2 ボタンのみ (D-003)
  Given <TaskCard actionSet="minimal" showSetFocus={false} ... /> を render する
  When  .task-card__actions 内の button を観察する
  Then  「削除」 button が存在する
   かつ 「完了」 button が存在する
   かつ 「明日にする」 / 「今日にする」 / 「現在のタスクにする」 button が存在しない
```

```
シナリオ AC-12: <TaskCard> の origin === "routine" では「明日にする」「今日にする」が出ない (BL-017 / BL-042 維持)
  Given task.origin === "routine" の task を渡して <TaskCard actionSet="full" ... /> を render する
  When  .task-card__actions 内の button を観察する
  Then  「明日にする」 / 「今日にする」 button が存在しない
   かつ 「削除」 button が存在する
   かつ 「完了」 button が存在する
```

```
シナリオ AC-13: <TaskFormCard> が 3 段ゾーン構造で起票フォームを描画する
  Given <TaskFormCard projects=[...] idPrefix="create" inputId="task-name" formAriaLabel="タスク起票フォーム" ... /> を render する
  When  出力 DOM を観察する
  Then  ルート要素は <form aria-label="タスク起票フォーム" class="task-card task-card--form"> である
   かつ ルート要素内に直下子要素 .task-card__header が存在する
   かつ .task-card__header 内に <ProjectToggle /> (= role="group" or 等価) が存在する
   かつ .task-card__header 内に <PriorityStars /> (= role="radiogroup") が存在する
   かつ ルート要素内に直下子要素 .task-card__title が存在する
   かつ .task-card__title 内に <label for="task-name">タスク名</label> と <input id="task-name"> が存在する
   かつ ルート要素内に直下子要素 .task-card__actions が存在する
   かつ .task-card__actions 内に <button type="submit">追加</button> が存在する
```

```
シナリオ AC-14: <TaskFormCard> から「↑タップで選択」と「優先度」label span が撤去されている (V-6)
  Given <TaskFormCard ... /> を render する
  When  出力 DOM を観察する
  Then  テキスト「↑タップで選択」を含む要素が存在しない
   かつ id="task-priority-label" または id="tomorrow-task-priority-label" の要素が存在しない
   かつ class="day-view__form__priority-hint" の要素が存在しない
```

```
シナリオ AC-15: today-view が <TaskCard> / <TaskFormCard> を使う (REQ-4)
  Given web/src/ui/today-view/today-view.tsx を開いた
  When  ファイル本文を観察する
  Then  import { TaskCard } from "../task-card/task-card.js" 文を含む
   かつ import { TaskFormCard } from "../task-card/task-form-card.js" 文を含む
   かつ <TaskCard ... /> の使用が少なくとも 2 か所存在する (focusedTask + otherTasks)
   かつ <TaskFormCard ... /> の使用が少なくとも 1 か所存在する
   かつ <h2>現在のタスク</h2> の文字列が存在しない (V-5)
   かつ className="day-view__card" の使用が存在しない (REQ-7)
   かつ className="day-view__form" の使用が存在しない (REQ-7)
```

```
シナリオ AC-16: tomorrow-view が <TaskCard> / <TaskFormCard> を使う (REQ-5)
  Given web/src/ui/tomorrow-view/tomorrow-view.tsx を開いた
  When  ファイル本文を観察する
  Then  import { TaskCard } from "../task-card/task-card.js" 文を含む
   かつ import { TaskFormCard } from "../task-card/task-form-card.js" 文を含む
   かつ <TaskCard ... /> の使用が少なくとも 1 か所存在する
   かつ <TaskFormCard ... /> の使用が少なくとも 1 か所存在する
   かつ className="day-view__card" の使用が存在しない
   かつ className="day-view__form" の使用が存在しない
```

```
シナリオ AC-17: focus-view が <TaskCard variant="focus" actionSet="minimal"> を使う (REQ-6 / D-007)
  Given web/src/ui/focus-view/focus-view.tsx を開いた
  When  ファイル本文を観察する
  Then  import { TaskCard } from "../task-card/task-card.js" 文を含む
   かつ variant="focus" と actionSet="minimal" の組み合わせで TaskCard が使われている
   かつ className="focus-view__card" の使用が存在しない (REQ-7)
   かつ <h1>現在のタスク</h1> は維持されている (REQ-6 / 6-4)
```

```
シナリオ AC-18: 旧 .day-view__card 系セレクタが day-view.css から撤去されている (REQ-7)
  Given web/src/ui/day-view/day-view.css を開いた
  When  ファイル本文を観察する
  Then  .day-view__card セレクタが定義されていない
   かつ .day-view__card--focus セレクタが定義されていない
   かつ .day-view__card__header / .day-view__card__title / .day-view__card__actions が定義されていない
   かつ .day-view__form セレクタが定義されていない
   かつ .day-view__form__project / .day-view__form__priority / .day-view__form__priority-hint / .day-view__form__name / .day-view__form__submit が定義されていない
```

```
シナリオ AC-19: day-view.css の維持セレクタが引き続き存在する (REQ-13)
  Given web/src/ui/day-view/day-view.css を開いた
  When  ファイル本文を観察する
  Then  .day-view セレクタが定義されている
   かつ .day-view__header セレクタが定義されている
   かつ .day-view__list セレクタが定義されている
   かつ .day-view__empty セレクタが定義されている
   かつ .project-chip セレクタが定義されている (BL-056 維持)
```

```
シナリオ AC-20: 旧 .focus-view__card 系セレクタが focus-view.css から撤去されている (REQ-7)
  Given web/src/ui/focus-view/focus-view.css を開いた
  When  ファイル本文を観察する
  Then  .focus-view__card セレクタが定義されていない
   かつ .focus-view__project セレクタが定義されていない
   かつ .focus-view__name セレクタが定義されていない
   かつ .focus-view__actions セレクタが定義されていない
   かつ .focus-view セレクタは引き続き定義されている (枠維持)
   かつ .focus-view__empty セレクタは引き続き定義されている (空状態維持)
```

```
シナリオ AC-21: .project-chip ルール本文が無改修である (NFR-CHIP-PRESERVE)
  Given web/src/ui/day-view/day-view.css を開いた
  When  .project-chip セレクタのルール本文を観察する
  Then  BL-056 完了時点と同じ宣言のままで, 本 BL での書き換えが無い
   かつ border: 1px solid var(--color-border) を含む
   かつ border-radius: var(--radius-lg) を含む
   かつ padding: var(--space-xs) var(--space-sm) を含む
   かつ font-size: var(--font-size-small) を含む
   かつ color: var(--color-fg) を含む
```

```
シナリオ AC-22: tokens.css を変更していない (NFR-NO-NEW-TOKENS)
  Given 本 BL の実装がマージされた
  When  web/src/styles/tokens.css を BL-058 完了時点の状態と比較する
  Then  差分が無い
   かつ 本 BL で参照する --font-size-h2 / --space-md / --radius-lg / --color-bg 等が引き続き定義されている
```

```
シナリオ AC-23: PriorityStars / ProjectToggle のコンポーネント本体が無改修である (NFR-COMPONENT-API-FROZEN)
  Given web/src/ui/priority-stars/priority-stars.tsx と project-toggle.tsx を開いた
  When  ファイル本文を観察する
  Then  本 BL の前後で PriorityStarsProps / ProjectToggleProps の export 型定義に差分が無い
```

```
シナリオ AC-24: タスク名 label/input の関連付けが保持されている (NFR-LABEL-PRESERVE)
  Given /today と /tomorrow を render する
  When  起票フォームを観察する
  Then  /today に <label htmlFor="task-name">タスク名</label> と <input id="task-name"> が共存する
   かつ /tomorrow に <label htmlFor="tomorrow-task-name">タスク名</label> と <input id="tomorrow-task-name"> が共存する
   かつ getByLabelText("タスク名") で input が取得可能 (テスト互換性)
```

```
シナリオ AC-25: focus-view の actions が「削除」「完了」の 2 ボタンのみである (NFR-FOCUS-VIEW-ACTIONS-2BTN)
  Given /focus を render する (focusedTask あり)
  When  .task-card__actions 内の button を観察する
  Then  「削除」 button が存在する
   かつ 「完了」 button が存在する
   かつ 「明日にする」 / 「今日にする」 / 「現在のタスクにする」 button が存在しない
```

```
シナリオ AC-26: .task-card 系セレクタに box-shadow / transition / animation / :hover が無い
  Given web/src/ui/task-card/task-card.css を開いた
  When  ファイル全体を観察する
  Then  box-shadow キーワードを含む宣言が存在しない
   かつ transition 宣言が存在しない
   かつ animation 宣言が存在しない
   かつ .task-card:hover / .task-card__header:hover / .task-card__title:hover / .task-card__actions:hover 等の :hover セレクタが存在しない
```

```
シナリオ AC-27: 既存単体テスト全件 green (追従修正後)
  Given /today /tomorrow /focus が引き続きレンダリング可能
  When  ルートから npm test (vitest 単体テスト全件) を実行する
  Then  すべて green である
   かつ 追従修正された既存テスト (task-card-design.test.ts / task-card-zone-layout.test.tsx /
        form-card-design.test.ts / task-form-grid-layout.test.tsx / project-chip.test.tsx /
        today-view.test.tsx / tomorrow-view.test.tsx / focus-view.test.tsx / unified-day-view.test.tsx)
        がすべて green になる
```

```
シナリオ AC-28: 既存 E2E 全件 green (追従修正後)
  Given Playwright が起動可能
  When  npx playwright test を実行する
  Then  すべて green である
   かつ taskRow helper (xpath=ancestor::li) が <li class="task-card"> でも引き続き機能する
```

```
シナリオ AC-29: アクセシビリティ違反 0 件を維持する (NFR-A11Y)
  Given /today /tomorrow /focus をはじめとする全 view がレンダリング可能
  When  @axe-core/playwright で WCAG 2.1 AA をスキャンする (e2e/a11y.spec.ts の既存スキャン)
  Then  すべてのスキャンで violations.length === 0
```

## 重要な決定 (D 章)

- **D-001 (新規ディレクトリ `web/src/ui/task-card/` に同居)**:
  - `<TaskCard>` / `<TaskFormCard>` / `task-card.css` を同じディレクトリに置く. 既存パターン (`priority-stars/` に `.tsx` / `.css` / `.test.tsx` が同居) と整合.
  - 系統間共通の `<Card>` 基底や `web/src/ui/card/` のような汎用ディレクトリは**作らない**. user の方針「ペア専用 CSS / 系統間は独立」に従い, project-card / routine-card は別ディレクトリ (= `web/src/ui/project-card/` / `web/src/ui/routine-card/`) で BL-060 / BL-061 に分離する.

- **D-002 (variant prop で強調を制御 / 案 i 採用)**:
  - 候補:
    - (i) `<TaskCard variant="focus" />` で variant prop により切り替え.
    - (ii) `<TaskCard isFocus={true} />` で boolean prop.
    - (iii) variant を持たず, 親が wrapper で強調を表現.
  - 採用: (i) `variant="default" | "focus"` (default の default 値は `"default"`).
    - 将来「3 つ目の variant (= 例えば trash 表示用の disabled)」が現れる可能性を考慮し, boolean ではなく enum 型で拡張に開かれた形にする.
    - 内部実装は `className={`task-card${variant === "focus" ? " task-card--focus" : ""}`}` で BEM modifier を付与.

- **D-003 (TaskCard の actions / showSetFocus / showPriority による差異吸収 / 案採用)**:
  - 既存 3 ビューでカードの中身が違うため, props で差分を吸収する.
    - today-view focusedTask: `actionSet="full"`, `dueDateMode="today"`, `showPriority={true}`, `showSetFocus={false}` (= 自カードに「現在のタスクにする」は出さない / BL-043 仕様).
    - today-view otherTasks: `actionSet="full"`, `dueDateMode="today"`, `showPriority={true}`, `showSetFocus={true}`.
    - tomorrow-view: `actionSet="full"`, `dueDateMode="tomorrow"`, `showPriority={false}`, `showSetFocus={false}`.
    - focus-view: `actionSet="minimal"`, `showPriority={false}`, `showSetFocus={false}`.
  - `actionSet="minimal"` のとき「明日にする / 今日にする / 現在のタスクにする」のいずれも出さず, 「削除 / 完了」の 2 ボタンのみ. これにより BL-037 D-008 (focus-view actions = 2 ボタン) の仕様を維持する (G-7 / NFR-FOCUS-VIEW-ACTIONS-2BTN).
  - `actionSet="full"` のとき「削除 / 明日にする (or 今日にする) / 完了」の 3 ボタン + `showSetFocus` ならその前に「現在のタスクにする」を追加.
  - `task.origin === "routine"` の条件分岐 (BL-017 / BL-042) は `actionSet="full"` 内に内蔵する.

- **D-004 (ラッパ要素のタグ選択 `as` prop)**:
  - today-view focusedTask は元 `<section>`, otherTasks / tomorrow-view は元 `<li>`, focus-view は元 `<div>`. 既存 DOM タグを維持するため `as` prop で選択する.
  - `as: "li" | "section" | "div"` の 3 値. default は `"li"` (= 一覧用途の主流).
  - 既存 E2E の `xpath=ancestor::li` 取得 (`tasks.spec.ts` 等) が壊れないよう, 一覧用途では `as="li"` を引き続き使う.

- **D-005 (タスク名フォント拡大は `--font-size-h2` 流用 / tokens.css 無改修)**:
  - 候補:
    - (i) `--font-size-h2` (= 20px / 既存) を流用.
    - (ii) `--font-size-lg` を新規追加.
    - (iii) 固定値 22px / 24px をハードコード.
  - 採用: (i) `--font-size-h2` を流用.
    - tokens.css への新規トークン追加は BL-046 安定性 (NFR-NO-NEW-TOKENS) を破る. user の指示でも「原則避ける」.
    - 20px は body 16px に対して +25% の拡大で, モックアップの「一回り大きい」見えと整合.
    - h2 セマンティクスとは無関係 (= 単なるサイズ token として使う). CSS variable は意味論を持たないため流用問題なし.
  - title 段で `font-size: var(--font-size-h2)` を当て, 子の `<span>` (タスク名) と `<input>` (起票) の両方に継承させる. input は font 継承しないため `font: inherit` で明示する.

- **D-006 (TaskFormCard の header 段は project 左 + priority 右の `justify-content: space-between`)**:
  - TaskCard の header 段と完全に同じ visual を持たせるため, TaskFormCard も `.task-card__header` を共有する.
  - PriorityStars は header 右に配置することで chip 右配置の TaskCard と「優先度 = 右端」の視覚的一貫性を獲得.
  - BL-058 で導入した「↑タップで選択」(`.day-view__form__priority-hint`) と「優先度」label (`#task-priority-label`) は撤去する (V-6 / REQ-2). ラベル無しでも PriorityStars の `groupLabel="優先度"` で role group + accessibleName が成立しており a11y は維持される (D-008).

- **D-007 (focus-view の CSS import は維持 / 「現在のタスク」h1 は維持)**:
  - focus-view.css の `.focus-view` / `.focus-view h1` / `.focus-view__empty` は引き続き必要 (枠 / 見出し / 空状態). `import "./focus-view.css"` は**維持**する.
  - focus-view.css 内の `.focus-view__card` / `.focus-view__project` / `.focus-view__name` / `.focus-view__actions` は撤去する (= 役割を `.task-card` に移譲).
  - focus-view.tsx の `<h1>現在のタスク</h1>` (L229) はカードの外の見出しであり, V-5 (today の `<h2>現在のタスク</h2>` 撤去) とは別物. focus-view では維持する.
  - 空状態 placeholder「現在のタスクはありません」(`<div className="focus-view__empty">`) も維持する. focusedTask が無い場合は `<TaskCard>` を出さずに placeholder を出す分岐は既存通り.

- **D-008 (PriorityStars のヘルプラベル撤去と a11y 維持)**:
  - BL-058 で `<PriorityStars />` 直下に追加された `<span class="day-view__form__priority-hint">↑タップで選択</span>` は本 BL で**撤去**する (V-6).
  - PriorityStars 自体は `groupLabel="優先度"` で role group + accessibleName="優先度" を生成しているため, ラベル撤去後も a11y はそのままで成立する.
  - 同様に BL-040 / BL-058 で残っている `<span id="task-priority-label">優先度</span>` (today / tomorrow の起票フォーム) も撤去する. これも `groupLabel` で代替済み.
  - a11y E2E (`e2e/a11y.spec.ts`) で violations 0 件維持を確認する (NFR-A11Y).

- **D-009 (旧 CSS セレクタの撤去と既存テストの追従)**:
  - `.day-view__card` 系 / `.day-view__form` 系 / `.focus-view__card` 系のセレクタは本 BL で**撤去**する.
  - 既存テスト (BL-052 / BL-054 / BL-056 / BL-057 / BL-058 の各 test ファイル) のうち, これらのセレクタの存在 / 宣言を assert している箇所は本 BL で**追従修正**する.
  - 修正方針:
    - 旧セレクタの「visual 4 宣言を assert」は新セレクタ `.task-card` 系の同じ宣言を assert する形に置換する (= 「BL-052 の visual 4 宣言は `.task-card` に引き継がれている」という不変性 assert に書き換える).
    - 旧セレクタの「セレクタ自身の存在」を assert している箇所は, **そのセレクタが撤去されている**ことを assert する形に置換する.
    - 旧 view (today / tomorrow / focus) の DOM クラス名 (`day-view__card` / `day-view__form` / `focus-view__card`) を assert している箇所は `task-card` 系に置換する.
  - 詳細な追従マッピングは plan.md §「既存テストの追従修正」で確定.

- **D-010 (tomorrow-view の `<button>今日にする</button>` の routine 条件分岐の取扱)**:
  - tomorrow-view では `task.origin !== "routine"` の場合のみ「今日にする」を出す (BL-042 REQ-2).
  - `<TaskCard>` 側で `actionSet="full"` + `dueDateMode="tomorrow"` のとき, 内部で `task.origin !== "routine"` を判定し「今日にする」 button を出す. 出さない場合は button 自体が DOM に存在しない.

- **D-011 (テスト方針)**:
  - 新規テストファイル `web/__tests__/task-card-component.test.tsx` を作る.
    - (a) CSS 直読み (`task-card.css` の各セレクタの宣言を assert): AC-1 〜 AC-6 / AC-26.
    - (b) jsdom DOM レンダ assert (`<TaskCard>` / `<TaskFormCard>` 単体): AC-7 〜 AC-14.
    - (c) view 適用 assert (today-view.tsx / tomorrow-view.tsx / focus-view.tsx の import + 使用): AC-15 〜 AC-17.
    - (d) 旧セレクタ撤去 assert (day-view.css / focus-view.css の差分): AC-18 〜 AC-20.
    - (e) 不変性 assert (`.project-chip` / tokens.css / PriorityStars / ProjectToggle / label-input): AC-21 〜 AC-24.
    - (f) 機能制約 assert (focus-view 2 ボタン / box-shadow 無し): AC-25 / AC-26.
  - 既存テスト追従:
    - `task-card-design.test.ts` (BL-052): `.day-view__card` の visual 4 宣言 assert を「撤去されている」assert に書き換え, または `.task-card` 側で同じ宣言があることを確認する形に振り替える (D-009).
    - `task-card-zone-layout.test.tsx` (BL-057): `.day-view__card__header` / `.day-view__card__title` / `.day-view__card__actions` の宣言と DOM 構造 assert を `.task-card__header` / `.task-card__title` / `.task-card__actions` に置換する.
    - `form-card-design.test.ts` (BL-054): `.day-view__form` の visual 4 宣言 assert を撤去 (= `.task-card` 側で網羅されるため).
    - `task-form-grid-layout.test.tsx` (BL-058): `.day-view__form` の grid layout assert を撤去 (= 3 段 flex 構造への移行に伴い grid 系 assert は意味を失う). 「↑タップで選択」「優先度」label の存在 assert は逆転させ (撤去確認), `<TaskFormCard>` 経由の DOM 構造 assert に置換する.
    - `project-chip.test.tsx` (BL-056): `.day-view__card` 内に `<span class="project-chip">` がある assert を `.task-card__header` 内に置換する. `.project-chip` ルール本文の不変性 assert は引き続き有効.
    - `today-view.test.tsx` / `tomorrow-view.test.tsx` / `focus-view.test.tsx` / `unified-day-view.test.tsx`: DOM 構造を `day-view__card` / `day-view__form` / `focus-view__card` で見ている箇所を `task-card` 系に置換する.

- **D-012 (focus-view.tsx の onComplete / onDelete の現状ハンドラ流用)**:
  - 既存の `handleComplete` / `handleDelete` (focus-view.tsx L207-225) はそのまま `<TaskCard>` の `onComplete` / `onDelete` prop に渡す.
  - mutation 経路 (offline queue / OptimisticLockError → ConflictError) は無改修 (NFR-COMPAT).

- **D-013 (新規 component 内での `import "./task-card.css"`)**:
  - `task-card.tsx` の先頭で `import "./task-card.css"` する. `task-form-card.tsx` でも同じ import を行う (= 重複 import になるが Vite は dedup する).
  - これにより, view 側 (today / tomorrow / focus) は `<TaskCard>` または `<TaskFormCard>` を import するだけで CSS が連動する.

## 未決事項 / 確認待ち

- なし (user との合意は背景・方針セクションで確定済み. D-001 〜 D-013 で本 BL の判断軸はすべて確定. 詳細な追従マッピングと PR 提出単位は plan.md / tasks.md で確定).
