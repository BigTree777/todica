# 仕様: ProjectCard / ProjectFormCard コンポーネント新設 + projects-view 適用 (project-card-component)

- 状態: 確定
- 関連:
  - [`../../planning/backlog.md`](../../planning/backlog.md) BL-060
  - 依存 BL:
    - BL-016 (project-crud) — 既存 projects-view (作成 / 名称変更 / 削除) と Repository / mutation 経路.
    - BL-045 (secondary-views-shell) — projects-view の `<h1>` / 空状態 / outer shell.
    - BL-046 (design-tokens) — `--space-md` / `--radius-lg` / `--color-border` 等.
    - BL-059 (task-card-component) — ペア component + 専用 CSS パターンの起点.
  - 関連 feature:
    - [`../project-crud/spec.md`](../project-crud/spec.md) (BL-016) — 「ProjectsView」の DOM / 機能.
    - [`../secondary-views-shell/spec.md`](../secondary-views-shell/spec.md) (BL-045) — `.projects-view` / `.projects-view h1` / `.projects-view__empty` の枠ルール.
    - [`../task-card-component/spec.md`](../task-card-component/spec.md) (BL-059) — TaskCard / TaskFormCard のペア component + 専用 CSS パターン. 本 BL の design 雛形.
    - [`../design-tokens/`](../design-tokens/) (BL-046) — 参照トークン群. 本 BL では tokens.css を**変更しない**.
  - 後続 BL: BL-061 (RoutineCard / RoutineFormCard) — 同じパターンを routines-view に適用する後続作業.
  - 上位要件: NFR-010 (一貫した UI / 最小手数) / FR-PROJECT-CRUD.
  - 関係しない feature: BL-044 (inline-project-create) / BL-050 (remove-inline-project-create) は `/today` の inline create ダイアログに関わるもので, `/projects` の projects-view には touch しない.

## 背景 / 課題

現状 `web/src/ui/projects-view/projects-view.tsx` のプロジェクト一覧と作成フォームは, BL-016 当時の素朴な DOM のまま残っている.

### 現状 DOM

- 作成フォーム (`projects-view.tsx` L236-252 付近):

  ```jsx
  <form aria-label="プロジェクト作成フォーム" className="projects-view__form">
    <div>
      <label htmlFor="project-name">プロジェクト名</label>
      <input id="project-name" type="text" value={newName} ... required />
    </div>
    <button type="submit">追加</button>
  </form>
  ```

  - label + input が `<div>` で 1 行目, 「追加」 button が 2 行目で**縦並び**.
  - `.projects-view__form` は `display: flex; flex-direction: column; gap: --space-sm` (`projects-view.css` L17-24).

- 一覧の各行 (L254-282 付近):

  ```jsx
  <ul className="projects-view__list">
    {projects.map((project) => (
      <li className="projects-view__item">
        {editingId === project.id ? (
          <form aria-label="プロジェクト名称変更フォーム" ... >
            <input ... />
            <button type="submit">保存</button>
            <button type="button">キャンセル</button>
          </form>
        ) : (
          <>
            <span>{project.name}</span>
            <button type="button">名称変更</button>
            <button type="button">削除</button>
          </>
        )}
      </li>
    ))}
  </ul>
  ```

  - 表示モード: プロジェクト名 + 「名称変更」 + 「削除」が同じ `<li>` 内で flex 並び.
  - inline edit モード: 編集用 form が `<li>` 内に展開され, 「保存」「キャンセル」 button.

### 問題点

1. **コンポーネント分割の不整合**: BL-059 で task 系 (`<TaskCard>` / `<TaskFormCard>`) は「ペア component + 専用 CSS」パターンを採用したが, projects-view は依然として view が直接 DOM を組み立てている. 同じパターンを project 系にも適用したい.
2. **作成フォームの縦並び**: モックアップでは作成フォームは「input と submit ボタンが横並び (= 1 段 flex)」が望ましい (タスクカード起票時の上下ゾーン構造とは異なり, project は要素が少ないため 1 段で十分).
3. **表示行のレイアウト未整理**: 「名称変更」「削除」は現状 `.projects-view__actions` で `margin-left: auto` で右に寄せているが, ボタンのラベル / 並び順 / 専用 CSS が確定していない. user は「変更」「削除」の順で右端に並べたい (ラベルも「名称変更」→「変更」へ短縮).
4. **入力ヒントの統一**: タスク起票カード (BL-063) では input に `placeholder` を薄く出すパターンが確立した. 作成フォームでも label は visually-hidden で a11y 維持し, input に `placeholder="プロジェクト名"` を出したい.

### user 要求

- **ProjectFormCard** (作成カード):
  - input に薄く `placeholder="プロジェクト名"` を表示. label は visually-hidden で a11y 維持.
  - 「追加」ボタンを input と同じ高さで右端に配置.
  - 1 段 flex 横並び layout: `[<input>] ... [追加 button]`.

- **ProjectCard** (表示カード):
  - 左にプロジェクト名.
  - 右端に「変更」「削除」を横並びで配置.
  - 1 段 flex 横並び layout: `[プロジェクト名] ... [変更 button][削除 button]`.

### 方針の核

本 BL は以下を実現する.

1. **新規 React コンポーネント `<ProjectCard>`** (表示) を `web/src/ui/project-card/project-card.tsx` に新設し, projects-view の一覧で再利用する.
2. **新規 React コンポーネント `<ProjectFormCard>`** (作成) を `web/src/ui/project-card/project-form-card.tsx` に新設し, projects-view の作成フォームを置換する.
3. **ペア専用 CSS `web/src/ui/project-card/project-card.css`** に `.project-card` / `.project-card--form` / `.project-card__name` / `.project-card__actions` 等を集約する.
4. TaskCard 系 (BL-059) / RoutineCard 系 (BL-061) とは**別 CSS / 別 visual** (系統間独立). 共通基底 `<Card>` は作らない.
5. 既存 `.projects-view__form` / `.projects-view__item` / `.projects-view__actions` を撤去し, 役割を `.project-card` 系に移譲する.
6. 「名称変更」 button のラベルを「変更」に短縮する (= user 要求どおり). ただし「名称変更」アクション本体 (inline edit) は維持する.

shadow / hover / transition / animation は **一切追加しない** (BL-059 / NFR-NO-SHADOW / NFR-NO-HOVER-TRANSITION と同方針).

## ゴール / 非ゴール

### ゴール

- **G-1 (ProjectCard コンポーネントの新設)**: `web/src/ui/project-card/project-card.tsx` に `<ProjectCard>` を新設し, 表示モード (プロジェクト名 + 「変更」「削除」) を 1 段 flex 横並びで描画する.
- **G-2 (ProjectFormCard コンポーネントの新設)**: `web/src/ui/project-card/project-form-card.tsx` に `<ProjectFormCard>` を新設し, 作成フォーム (input + 「追加」 submit) を 1 段 flex 横並びで描画する.
- **G-3 (専用 CSS の新設)**: `web/src/ui/project-card/project-card.css` に `.project-card` / `.project-card--form` / `.project-card__name` / `.project-card__actions` / `.project-card__actions__edit` / `.project-card__actions__delete` / `.project-card__input` / `.project-card__submit` を新設し, ProjectCard / ProjectFormCard が共有する.
- **G-4 (projects-view 適用)**: `projects-view.tsx` の作成 form を `<ProjectFormCard>` に置換, 一覧の各 `<li>` を `<ProjectCard as="li">` に置換する. 編集モードの DOM 構造は D-003 で確定した方針で統合する.
- **G-5 (visual 反映)**:
  - V-1: ProjectFormCard の `.project-card--form` は flex 横並び (`flex-direction: row` / `align-items: center` / `gap: var(--space-sm)`). label は visually-hidden で隠す.
  - V-2: input は `flex: 1` で残り幅を占有し, placeholder「プロジェクト名」を `--color-fg-subtle` で薄く描画 (BL-063 の `.task-card__title input::placeholder` と同方針).
  - V-3: 「追加」 button は input の右側に置かれ, height は input と揃う.
  - V-4: ProjectCard の `.project-card` は flex 横並び. プロジェクト名 (`.project-card__name`) が左, actions (`.project-card__actions`) が右. プロジェクト名側に `flex: 1` を当て, actions は `margin-left: auto` 不要で自然に右端に並ぶ.
  - V-5: actions 内 button は「変更」→「削除」の順で並ぶ (= DOM 順 / 視覚順とも左→右で「変更」「削除」).
  - V-6: visual 4 宣言 (`background: var(--color-bg)` / `border: 1px solid var(--color-border)` / `border-radius: var(--radius-lg)` / `padding: var(--space-md)`) は `.project-card` 基底に集約.
- **G-6 (旧 CSS 撤去)**: `projects-view.css` から `.projects-view__form` / `.projects-view__item` / `.projects-view__actions` を撤去する. `.projects-view` / `.projects-view h1` / `.projects-view__list` / `.projects-view__empty` は維持する (BL-045 の枠スタイル).
- **G-7 (visually-hidden ユーティリティの再利用)**: BL-063 で `web/src/ui/task-card/task-card.css` 末尾に追加された `.visually-hidden` クラスは task-card 専用ではなく汎用ユーティリティ. 本 BL でも同じ振る舞いを得るため, project-card.css にも `.visually-hidden` を再定義するか, task-card.css の同クラスを流用するかは D-008 で確定.
- **G-8 (「変更」ラベル化)**: 表示モード の「名称変更」 button ラベルを「変更」に短縮する. 編集モード form の `aria-label` は既存 e2e との互換のため「プロジェクト名称変更フォーム」のまま維持する (D-005).
- **G-9 (tokens.css 無改修)**: `web/src/styles/tokens.css` を**変更しない**. 既存トークンのみで構成する.
- **G-10 (component / Repository 無改修)**: ConflictDialog / repository / mutation / query / offline-queue / notifyError は無改修. 本 BL は presentation 層のみ.
- **G-11 (a11y 違反 0 件維持)**: `e2e/a11y.spec.ts` の WCAG 2.1 AA スキャンで violations 0 件を維持する.

### 非ゴール

- **TaskCard 系 (BL-059) / RoutineCard 系 (BL-061) の変更**: スコープ外.
- **系統間共通の `<Card>` 基底コンポーネント**: 作らない (user 確定方針).
- **ProjectCreateDialog (`/today` の inline create / BL-044) への影響**: 関係しない. 本 BL は `/projects` の projects-view のみが対象.
- **ProjectRepository / ProjectConflictError / mutation 経路**: 無改修 (NFR-COMPAT).
- **inline edit のフロー変更**: 「変更」ボタン押下 → inline edit form 表示 → 「保存」/「キャンセル」 button → mutation → 元の表示モードへ復帰のフロー自体は維持する. DOM レイアウトのみ ProjectCard / ProjectFormCard に統合する (D-003).
- **`.projects-view` / `.projects-view h1` / `.projects-view__list` / `.projects-view__empty` のルール本文変更**: BL-045 で確定済みのため touch しない.
- **tokens.css への新規トークン追加**: G-9.
- **shadow / hover / transition / animation の追加**: NFR-NO-SHADOW / NFR-NO-HOVER-TRANSITION.
- **domain / server API**: 無改修.

## 要件

### 機能要件

- **REQ-1 (`<ProjectCard>` コンポーネントの新設)**

  `web/src/ui/project-card/project-card.tsx` に以下の React コンポーネントを新設する:

  ```ts
  export interface ProjectCardProps {
    project: Project;
    isEditing: boolean;                // 親 (projects-view) が editingId === project.id で判定して渡す
    editingName: string;               // isEditing=true のときの input value (親が state を持つ)
    onEditingNameChange: (next: string) => void;
    onStartEdit: () => void;
    onCancelEdit: () => void;
    onSaveEdit: (e: React.FormEvent) => void;
    onDelete: () => void;
    as?: "li" | "div";                 // default: "li"
  }
  ```

  - 出力 DOM 構造 (表示モード / `isEditing=false`):

    ```html
    <li class="project-card">
      <span class="project-card__name">{project.name}</span>
      <div class="project-card__actions">
        <button type="button" class="project-card__actions__edit">変更</button>
        <button type="button" class="project-card__actions__delete">削除</button>
      </div>
    </li>
    ```

  - 出力 DOM 構造 (編集モード / `isEditing=true`):

    ```html
    <li class="project-card project-card--editing">
      <form aria-label="プロジェクト名称変更フォーム" class="project-card__form-inline">
        <label htmlFor="project-edit-{project.id}" class="visually-hidden">プロジェクト名</label>
        <input id="project-edit-{project.id}" type="text" class="project-card__input"
               value={editingName} placeholder="プロジェクト名" required />
        <button type="submit">保存</button>
        <button type="button" onClick={onCancelEdit}>キャンセル</button>
      </form>
    </li>
    ```

  - 表示モードでは 1 段 flex 横並び. プロジェクト名は左, actions は右. user 要求「変更 → 削除」の DOM 順 (= 視覚順とも左→右).
  - 編集モードでは `<form>` を `<li>` 内に展開し, 同じ 1 段 flex 横並びを保つ. 「保存」「キャンセル」 button は input 右側.
  - 「変更」 button のラベル文字列は `"変更"` (G-8).
  - 編集 form の `aria-label` は `"プロジェクト名称変更フォーム"` (D-005 / `e2e/conflict-handling.spec.ts` 互換).

- **REQ-2 (`<ProjectFormCard>` コンポーネントの新設)**

  `web/src/ui/project-card/project-form-card.tsx` に以下の React コンポーネントを新設する:

  ```ts
  export interface ProjectFormCardProps {
    name: string;
    onNameChange: (next: string) => void;
    onSubmit: (e: React.FormEvent) => void;
    inputId?: string;                  // default: "project-name" (既存テスト互換 / D-004)
    formAriaLabel?: string;            // default: "プロジェクト作成フォーム"
  }
  ```

  - 出力 DOM 構造:

    ```html
    <form aria-label="プロジェクト作成フォーム" class="project-card project-card--form">
      <label htmlFor="project-name" class="visually-hidden">プロジェクト名</label>
      <input id="project-name" type="text" class="project-card__input"
             value={name} placeholder="プロジェクト名" required />
      <button type="submit" class="project-card__submit">追加</button>
    </form>
    ```

  - 1 段 flex 横並び layout (V-1). label は visually-hidden で a11y 維持しつつ視覚的には隠す (D-008).
  - input は `flex: 1` で残り幅を占有 (V-2). `placeholder="プロジェクト名"` を `--color-fg-subtle` で薄く出す.
  - 「追加」 button は input の右隣に置かれる. height は input と揃う (V-3).
  - `<form>` の `aria-label` default は `"プロジェクト作成フォーム"` (既存 `e2e/projects.spec.ts` / 既存 testid の互換).
  - input id default は `"project-name"` (既存 testid 互換 / D-004).

- **REQ-3 (専用 CSS `project-card.css` の新設)**

  `web/src/ui/project-card/project-card.css` に以下のルールを定義する.

  - **基底 `.project-card`** (visual 4 宣言 + 1 段 flex 横並び layout 共通):

    ```css
    .project-card {
      background: var(--color-bg);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      padding: var(--space-md);
      display: flex;
      flex-direction: row;
      align-items: center;
      gap: var(--space-sm);
    }
    ```

  - **編集中 modifier `.project-card--editing`** (本 BL 時点では空ルール / P-004 と同方針): 将来の差異用足場.

  - **起票カード modifier `.project-card--form`** (本 BL 時点では空ルール / P-004 と同方針): `.project-card` 基底と同じレイアウト. 差異が出たらここに追加する.

  - **プロジェクト名 `.project-card__name`** (V-4):

    ```css
    .project-card__name {
      flex: 1;
    }
    ```

    残り幅を占有し, 右側の actions を自然に右端へ押し出す.

  - **actions `.project-card__actions`** (V-5):

    ```css
    .project-card__actions {
      display: flex;
      align-items: center;
      gap: var(--space-sm);
    }
    ```

    DOM 順「変更 → 削除」がそのまま視覚順「左 → 右」になる.

  - **編集モードの inline form `.project-card__form-inline`**:

    ```css
    .project-card__form-inline {
      display: flex;
      flex: 1;
      align-items: center;
      gap: var(--space-sm);
    }
    ```

    `<li class="project-card">` の中に `<form>` を入れる構造のため, form 自体も flex 横並びにする. `flex: 1` で残り幅を占有する.

  - **input `.project-card__input`** (V-2):

    ```css
    .project-card__input {
      flex: 1;
    }

    .project-card__input::placeholder {
      color: var(--color-fg-subtle);
    }
    ```

    残り幅を占有し, placeholder を薄く描画する.

  - **submit ボタン `.project-card__submit`** (V-3):

    ```css
    .project-card__submit {
      /* 本 BL 時点では空ルール or font-size 等の最低限のみ.
         input と同じ高さは button の line-height + padding で自然に揃う想定. */
    }
    ```

  - **visually-hidden ユーティリティ** (D-008):

    ```css
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

    BL-063 で task-card.css に追加された同名クラスと同じ 9 宣言. 名前は同じだが project-card.css 内で再定義する (D-008 / 各 view が import するファイルで独立).

  - shadow / hover / transition / animation は**追加しない**.

- **REQ-4 (projects-view の置換)**

  `web/src/ui/projects-view/projects-view.tsx` を以下のように変更する:

  - 4-1. `<form className="projects-view__form">{...}</form>` (L236-252 付近) を `<ProjectFormCard name={newName} onNameChange={setNewName} onSubmit={handleCreate} />` に置換する.
  - 4-2. `<ul className="projects-view__list">` 内の `<li className="projects-view__item">{...}</li>` を `<ProjectCard project={project} isEditing={editingId === project.id} editingName={editingName} onEditingNameChange={setEditingName} onStartEdit={() => openEdit(project)} onCancelEdit={cancelEdit} onSaveEdit={handleSaveEdit} onDelete={() => handleDelete(project)} />` に置換する.
  - 4-3. `<ul className="projects-view__list">` 自体は維持する (BL-045 の枠).
  - 4-4. import 文に以下を追加:

    ```ts
    import { ProjectCard } from "../project-card/project-card.js";
    import { ProjectFormCard } from "../project-card/project-form-card.js";
    ```

  - 4-5. `import "./projects-view.css"` は維持する (枠系セレクタ用).

- **REQ-5 (旧 CSS 撤去)**

  `web/src/ui/projects-view/projects-view.css` から以下のセレクタを**撤去**する:

  - `.projects-view__form`
  - `.projects-view__item`
  - `.projects-view__actions`

  以下のセレクタは**維持**する (BL-045 の枠 / NFR-PRESERVE-SHELL):

  - `.projects-view`
  - `.projects-view h1`
  - `.projects-view__list`
  - `.projects-view__empty`

- **REQ-6 (「名称変更」ラベル → 「変更」短縮)**

  表示モード button のラベル文字列を `"名称変更"` から `"変更"` に変更する. 編集 form の `aria-label="プロジェクト名称変更フォーム"` は維持する (D-005).

- **REQ-7 (placeholder + visually-hidden パターン)**

  - 作成 form の `<input>` に `placeholder="プロジェクト名"` を追加. label は visually-hidden で残し, `htmlFor` で `<input>` と関連付け維持.
  - 編集 form の `<input>` にも同じ placeholder と visually-hidden label を適用 (D-008 整合).

- **REQ-8 (CSS import 追加)**

  `<ProjectCard>` / `<ProjectFormCard>` のファイル先頭で `import "./project-card.css"` する. 既存 view (`projects-view.tsx`) は `<ProjectCard>` / `<ProjectFormCard>` を import するだけで CSS が連動する.

- **REQ-9 (component 本体 / Repository 無改修)**

  ConflictDialog / repository / mutation / query / offline-queue / notifyError / `useConflictDialog` には**触れない**. 本 BL は presentation 層のみ.

### 非機能要件

- **NFR-NO-NEW-TOKENS**: tokens.css を変更しない. 既存トークンのみで構成する.
- **NFR-NO-SHADOW**: `.project-card` 系セレクタに `box-shadow` を追加しない.
- **NFR-NO-HOVER-TRANSITION**: `.project-card` 系セレクタに `:hover` / `transition` / `animation` を追加しない.
- **NFR-A11Y**: `e2e/a11y.spec.ts` の WCAG 2.1 AA スキャンで violations 0 件を維持する.
- **NFR-DOM-COMPATIBLE-LI**: 一覧の各行は引き続き `<li>` 直下に配置する (= `<ProjectCard as="li">`). 既存テストの `<li>` ベース取得が壊れない.
- **NFR-LABEL-PRESERVE**: `<label htmlFor="project-name">プロジェクト名</label>` + `<input id="project-name">` の関連付けは**保持**する (label は visually-hidden で隠すが DOM 上は存在). `getByLabelText("プロジェクト名")` で input が取得可能.
- **NFR-FORM-ARIA-LABEL-PRESERVE**: 作成 form の `aria-label="プロジェクト作成フォーム"` と編集 form の `aria-label="プロジェクト名称変更フォーム"` は**維持**する (`e2e/conflict-handling.spec.ts` 互換).
- **NFR-PRESERVE-SHELL**: BL-045 の `.projects-view` / `.projects-view h1` / `.projects-view__list` / `.projects-view__empty` のルール本文は無改修.
- **NFR-COMPAT**: サーバ API / domain / Repository / mutation / query / ConflictDialog / notifyError 経路は無改修.

## 受け入れ基準

> 書き方は [`../../quality/acceptance-criteria.md`](../../quality/acceptance-criteria.md) に従う.
> 検証コマンドはルートからの `npm test` (vitest 単体) と `npx playwright test` (E2E) を基準とする.

```
シナリオ AC-1: .project-card 基底クラスが visual 4 宣言 + 1 段 flex 横並び layout を持つ
  Given web/src/ui/project-card/project-card.css を開いた
  When  .project-card セレクタのルール本文を観察する
  Then  background: var(--color-bg) の宣言を含む
   かつ border: 1px solid var(--color-border) (または等価分解) の宣言を含む
   かつ border-radius: var(--radius-lg) の宣言を含む
   かつ padding: var(--space-md) の宣言を含む
   かつ display: flex の宣言を含む
   かつ flex-direction: row の宣言を含む (または flex-direction を持たず既定の row)
   かつ align-items: center の宣言を含む
   かつ gap: var(--space-sm) の宣言を含む
```

```
シナリオ AC-2: .project-card__name が flex: 1 で残り幅を占有する (V-4)
  Given project-card.css を開いた
  When  .project-card__name セレクタのルール本文を観察する
  Then  flex: 1 (または flex-grow: 1) の宣言を含む
```

```
シナリオ AC-3: .project-card__actions がボタン横並びを持つ (V-5)
  Given project-card.css を開いた
  When  .project-card__actions セレクタのルール本文を観察する
  Then  display: flex の宣言を含む
   かつ align-items: center の宣言を含む
   かつ gap: var(--space-sm) の宣言を含む
```

```
シナリオ AC-4: .project-card__input が flex: 1 + placeholder の薄色を持つ (V-2)
  Given project-card.css を開いた
  When  .project-card__input / .project-card__input::placeholder セレクタを観察する
  Then  .project-card__input に flex: 1 (または flex-grow: 1) の宣言を含む
   かつ .project-card__input::placeholder に color: var(--color-fg-subtle) の宣言を含む
```

```
シナリオ AC-5: .visually-hidden ユーティリティが project-card.css に定義されている (D-008)
  Given project-card.css を開いた
  When  .visually-hidden セレクタのルール本文を観察する
  Then  position: absolute の宣言を含む
   かつ width: 1px / height: 1px の宣言を含む
   かつ overflow: hidden の宣言を含む
   かつ clip: rect(0, 0, 0, 0) の宣言を含む
```

```
シナリオ AC-6: <ProjectCard isEditing=false> が表示モードの DOM を出す
  Given <ProjectCard project={...} isEditing={false} ... /> を render する
  When  出力 DOM を観察する
  Then  ルート要素は <li class="project-card"> である
   かつ .project-card 内に <span class="project-card__name">{project.name}</span> が存在する
   かつ .project-card 内に <div class="project-card__actions"> が存在する
   かつ .project-card__actions 内に「変更」 button が存在する
   かつ .project-card__actions 内に「削除」 button が存在する
   かつ DOM 順は「変更」が「削除」より先
```

```
シナリオ AC-7: <ProjectCard isEditing=true> が編集モードの DOM を出す
  Given <ProjectCard project={...} isEditing={true} editingName="..." ... /> を render する
  When  出力 DOM を観察する
  Then  ルート要素は <li class="project-card project-card--editing"> である
   かつ ルート内に <form aria-label="プロジェクト名称変更フォーム"> が存在する
   かつ form 内に visually-hidden な <label> (= class="visually-hidden") + <input> が存在する
   かつ input の id と label の htmlFor が一致する
   かつ form 内に <button type="submit">保存</button> が存在する
   かつ form 内に <button type="button">キャンセル</button> が存在する
```

```
シナリオ AC-8: <ProjectFormCard> が 1 段 flex 横並びの作成フォームを描画する
  Given <ProjectFormCard name="" onNameChange={...} onSubmit={...} /> を render する
  When  出力 DOM を観察する
  Then  ルート要素は <form aria-label="プロジェクト作成フォーム" class="project-card project-card--form"> である
   かつ form 直下に <label class="visually-hidden" htmlFor="project-name">プロジェクト名</label> が存在する
   かつ form 直下に <input id="project-name" type="text" placeholder="プロジェクト名"> が存在する
   かつ form 直下に <button type="submit">追加</button> が存在する
   かつ getByLabelText("プロジェクト名") で input が取得可能
```

```
シナリオ AC-9: <ProjectFormCard> の input に placeholder が表示される (V-2)
  Given <ProjectFormCard name="" ... /> を render する
  When  出力 DOM の <input> を観察する
  Then  input の placeholder 属性は「プロジェクト名」である
```

```
シナリオ AC-10: 「変更」 button が「変更」ラベルで表示される (G-8 / REQ-6)
  Given <ProjectCard project={...} isEditing={false} ... /> を render する
  When  ボタンを観察する
  Then  「変更」 button が存在する
   かつ 「名称変更」 button は存在しない
```

```
シナリオ AC-11: projects-view.tsx が <ProjectCard> / <ProjectFormCard> を使う (REQ-4)
  Given web/src/ui/projects-view/projects-view.tsx を開いた
  When  ファイル本文を観察する
  Then  import { ProjectCard } from "../project-card/project-card.js" 文を含む
   かつ import { ProjectFormCard } from "../project-card/project-form-card.js" 文を含む
   かつ <ProjectCard ... /> の使用が少なくとも 1 か所存在する
   かつ <ProjectFormCard ... /> の使用が少なくとも 1 か所存在する
   かつ className="projects-view__form" の使用が存在しない
   かつ className="projects-view__item" の使用が存在しない
   かつ className="projects-view__actions" の使用が存在しない
```

```
シナリオ AC-12: 旧 .projects-view__form / __item / __actions セレクタが projects-view.css から撤去されている (REQ-5)
  Given web/src/ui/projects-view/projects-view.css を開いた
  When  ファイル本文を観察する
  Then  .projects-view__form セレクタが定義されていない
   かつ .projects-view__item セレクタが定義されていない
   かつ .projects-view__actions セレクタが定義されていない
```

```
シナリオ AC-13: projects-view.css の維持セレクタが引き続き存在する (NFR-PRESERVE-SHELL)
  Given projects-view.css を開いた
  When  ファイル本文を観察する
  Then  .projects-view セレクタが定義されている
   かつ .projects-view h1 セレクタが定義されている
   かつ .projects-view__list セレクタが定義されている
   かつ .projects-view__empty セレクタが定義されている
```

```
シナリオ AC-14: tokens.css を変更していない (NFR-NO-NEW-TOKENS)
  Given 本 BL の実装がマージされた
  When  tokens.css を BL-059 (or 直近マージ済み BL) 完了時点と比較する
  Then  差分が無い
   かつ 本 BL で参照する --color-bg / --color-border / --radius-lg / --space-md / --space-sm / --color-fg-subtle が引き続き定義されている
```

```
シナリオ AC-15: ProjectRepository / mutation 経路が無改修である (NFR-COMPAT)
  Given web/src/repositories/project-repository.ts を開いた
   かつ projects-view.tsx 内の createMutation / updateMutation / deleteMutation を観察する
  When  本 BL の前後で diff を取る
  Then  ProjectRepository の API / Mutation 構成に差分が無い
   かつ ConflictDialog / useConflictDialog の呼び出しに差分が無い
```

```
シナリオ AC-16: label/input 関連付けが保持されている (NFR-LABEL-PRESERVE)
  Given /projects を render する
  When  作成フォームの label と input を観察する
  Then  <label htmlFor="project-name">プロジェクト名</label> と <input id="project-name"> が共存する
   かつ label の class に "visually-hidden" を含む
   かつ getByLabelText("プロジェクト名") で input が取得可能 (テスト互換)
```

```
シナリオ AC-17: form の aria-label が保持されている (NFR-FORM-ARIA-LABEL-PRESERVE)
  Given /projects を render する
  When  form を観察する
  Then  作成 form の aria-label は「プロジェクト作成フォーム」である
   かつ 編集モード form の aria-label は「プロジェクト名称変更フォーム」である
```

```
シナリオ AC-18: .project-card 系セレクタに box-shadow / transition / animation / :hover が無い
  Given project-card.css を開いた
  When  ファイル全体を観察する
  Then  box-shadow キーワードを含む宣言が存在しない
   かつ transition 宣言が存在しない
   かつ animation 宣言が存在しない
   かつ .project-card:hover / .project-card--form:hover 等の :hover セレクタが存在しない
```

```
シナリオ AC-19: 既存単体テスト全件 green (追従修正後)
  Given /projects が引き続きレンダリング可能
  When  ルートから npm test (vitest 全件) を実行する
  Then  すべて green である
   かつ 追従修正された既存テスト (もしあれば) が green になる
```

```
シナリオ AC-20: 既存 E2E 全件 green (追従修正後)
  Given Playwright が起動可能
  When  npx playwright test を実行する
  Then  すべて green である
   かつ e2e/conflict-handling.spec.ts の「名称変更」 button による編集フローが
        「変更」 button への accessibleName 変更に追従して green である
   かつ e2e/projects.spec.ts の作成 / 削除フローが green である
   かつ e2e/secondary-views-style.spec.ts (`.projects-view` ベースの style 確認) が green である
```

```
シナリオ AC-21: アクセシビリティ違反 0 件を維持する (NFR-A11Y)
  Given /projects をはじめとする全 view がレンダリング可能
  When  @axe-core/playwright で WCAG 2.1 AA をスキャンする (e2e/a11y.spec.ts)
  Then  すべてのスキャンで violations.length === 0
```

## 重要な決定 (D 章)

- **D-001 (新規ディレクトリ `web/src/ui/project-card/` に同居)**:
  - `<ProjectCard>` / `<ProjectFormCard>` / `project-card.css` を同じディレクトリに置く. BL-059 (`task-card/` に `task-card.tsx` / `task-form-card.tsx` / `task-card.css`) と同じパターン.
  - 系統間共通の `<Card>` 基底や `web/src/ui/card/` のような汎用ディレクトリは**作らない**. user の方針「ペア専用 CSS / 系統間は独立」に従う.

- **D-002 (ラッパ要素のタグ選択 `as` prop)**:
  - ProjectCard はデフォルト `<li>` (一覧用途). 将来 ProjectCard を `<li>` 以外で使うケース (例: `/projects` 以外で個別表示) が出る可能性を考慮し `as: "li" | "div"` で切り替え可能にする. default は `"li"`.
  - ProjectFormCard は常に `<form>`. `as` prop は持たない.

- **D-003 (編集モードの統合方針 / 案 i 採用)**:
  - 候補:
    - (i) `<ProjectCard isEditing={true}>` で同じ ProjectCard が編集モード DOM を出す.
    - (ii) `<ProjectFormCard>` を編集モードでも流用する (= 名前を `<ProjectInputCard>` に改名).
    - (iii) 別コンポーネント `<ProjectEditCard>` を新設.
    - (iv) 既存の inline edit ロジックを `projects-view.tsx` に残し ProjectCard は表示のみ.
  - 採用: (i) `<ProjectCard isEditing>` で内部分岐. 親 (`projects-view.tsx`) が `editingId === project.id` で `isEditing` を判定し, editingName state と関連 handler を prop で渡す.
    - 理由: 「同じ 1 件のプロジェクト行が表示 ↔ 編集を切り替える」という意味論を 1 コンポーネントで表現するのが自然. (ii) は ProjectFormCard が「新規作成」用途に特化しているため意味がぼやける. (iii) は表示と編集の DOM 差分が小さいため過剰分割. (iv) は projects-view.tsx に DOM 詳細が残り, 本 BL の目的「view から DOM 組み立てを引き上げる」に反する.
  - 編集モードの DOM は `<li class="project-card project-card--editing">` 内に `<form aria-label="プロジェクト名称変更フォーム">` を入れる構造. `.project-card--editing` modifier は将来差異用の空ルール (P-004 と同方針).
  - 編集用 input の id は `project-edit-{project.id}` (動的). 既存テストで参照されていない id のため衝突しない.

- **D-004 (ProjectFormCard の input id / 既存テスト互換)**:
  - 作成 form の input id は default `"project-name"` (既存 `projects-view.tsx` L243 で使われていた id を保持).
  - 既存 e2e (`e2e/projects.spec.ts`) は accessibleName ベース (`getByRole("textbox", { name: "プロジェクト名" })`) で取得していると想定されるため, label との関連付けが維持されれば壊れない.
  - prop 化することで, 将来別 view で再利用するときに id 衝突回避ができる.

- **D-005 (「名称変更」 → 「変更」短縮の影響と aria-label 維持方針)**:
  - 表示モード button のラベルは `"名称変更"` から `"変更"` に短縮 (G-8 / REQ-6).
  - 編集モード form の `aria-label` は `"プロジェクト名称変更フォーム"` のまま維持する (= `e2e/conflict-handling.spec.ts` L107 / L111 / L120 / L124 の `getByRole("form", { name: "プロジェクト名称変更フォーム" })` を壊さない).
  - `e2e/conflict-handling.spec.ts` L105 / L118 の `getByRole("button", { name: "名称変更" })` は「変更」に追従修正する必要がある (= e2e 追従対象 / R-002).

- **D-006 (button の className 命名)**:
  - `.project-card__actions__edit` / `.project-card__actions__delete` の 2 段 BEM 風命名を採用. TaskCard (BL-063) の `.task-card__actions__delete` / `.task-card__actions__complete` と同じパターン.
  - CSS ルール本文は本 BL 時点では空 (= 装飾不要). 将来 specificity 制御や色付けが必要になったときの足場 (P-004 と同方針).

- **D-007 (テスト方針)**:
  - 新規テストファイル `web/__tests__/project-card-component.test.tsx` を作る.
    - (a) CSS 直読み (`project-card.css` の各セレクタの宣言を assert): AC-1 〜 AC-5 / AC-18.
    - (b) jsdom DOM レンダ assert (`<ProjectCard>` / `<ProjectFormCard>` 単体): AC-6 〜 AC-10.
    - (c) view 適用 assert (`projects-view.tsx` の import + 使用): AC-11.
    - (d) 旧セレクタ撤去 assert (`projects-view.css` の差分): AC-12 / AC-13.
    - (e) 不変性 assert (tokens.css / Repository / mutation 構成): AC-14 / AC-15.
    - (f) ラベル / aria 保持 assert: AC-16 / AC-17.
    - (g) 機能制約 assert (box-shadow 無し): AC-18.
  - 既存テストの追従:
    - `web/__tests__/design-tokens.test.ts` L80 で `ui/projects-view/projects-view.css` を参照していれば差分の影響を確認. 旧セレクタ撤去後も `--space-md` 等が引き続き参照されているかを assert する.
    - `e2e/conflict-handling.spec.ts` の「名称変更」 button accessibleName を「変更」へ追従.
    - `e2e/projects.spec.ts` / `e2e/secondary-views-style.spec.ts` は role + accessibleName ベース取得のため無修正で通る想定. 壊れた場合のみ最小限の追従.

- **D-008 (visually-hidden ユーティリティの配置)**:
  - 候補:
    - (i) `project-card.css` 内に再定義 (BL-063 が `task-card.css` 内に同名クラスを定義した方式と同じ).
    - (ii) 共通 utility CSS (`web/src/styles/utilities.css` 等) を新設.
    - (iii) `task-card.css` の同クラスを流用 (= projects-view.tsx 側で `import "../task-card/task-card.css"` を追加).
  - 採用: (i) `project-card.css` 内に再定義. 系統間 (Task / Project / Routine) で CSS を独立させる方針 (user 確定 / BL-059 D-001) に従う. 同名クラスの宣言は完全同一だが, 配置先ファイルが系統ごとに独立しているため衝突しない.
  - 将来 (iii) のような view 横断利用が増えたら, 共通 utility CSS を別 BL で検討する余地はある (本 BL では対象外).

- **D-009 (旧 CSS セレクタ撤去の範囲)**:
  - `projects-view.css` から撤去: `.projects-view__form` / `.projects-view__item` / `.projects-view__actions` の 3 セレクタ.
  - `projects-view.css` で維持: `.projects-view` / `.projects-view h1` / `.projects-view__list` / `.projects-view__empty` の 4 セレクタ (BL-045 の shell / NFR-PRESERVE-SHELL).

- **D-010 (edit ボタンと delete ボタンの DOM 順序)**:
  - DOM 順は `<button class="project-card__actions__edit">変更</button>` → `<button class="project-card__actions__delete">削除</button>` の順 (= 視覚順「左 → 右」).
  - 「変更」がより日常的・低リスクな操作で左, 「削除」がより破壊的な操作で右という配置. user 要求「右端に『変更』『削除』の順」を満たす (右側のグループ内で左から「変更」「削除」).

- **D-011 (focus 順序 / キーボード操作)**:
  - 一覧の各 `<li class="project-card">` 内では DOM 順に従い Tab が「変更 → 削除」と進む. これは現状動作と同じ (現状も DOM 順は「名称変更 → 削除」).
  - 編集モードでは form 内で Tab が「input → 保存 → キャンセル」と進む.

- **D-012 (ProjectCard の DOM タグ選択の type 安全 cast)**:
  - BL-059 P-002 と同じパターン. `as` prop は `"li" | "div"` の 2 値. JSX 上で `const Tag = as as "li"` cast で同じ HTMLAttributes 型として扱う. lint / typecheck が green なら問題なし.

## 未決事項 / 確認待ち

- なし (D-001 〜 D-012 で本 BL の判断軸はすべて確定. 詳細な追従マッピングと PR 提出単位は plan.md / tasks.md で確定).
