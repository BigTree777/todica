# 仕様: RoutineCard / RoutineFormCard コンポーネント新設 + routines-view 適用 (routine-card-component)

- 状態: 確定
- 関連:
  - [`../../planning/backlog.md`](../../planning/backlog.md) BL-061
  - 依存 BL:
    - BL-017 (routine) — 既存 routines-view (作成 / 名称変更 / 削除) と Repository / mutation 経路.
    - BL-045 (secondary-views-shell) — routines-view の `<h1>` / `.routines-view` / 枠.
    - BL-046 (design-tokens) — `--space-md` / `--radius-lg` / `--color-border` 等.
    - BL-059 (task-card-component) — ペア component + 専用 CSS パターンの起点.
    - BL-060 (project-card-component) — ProjectCard / ProjectFormCard. 本 BL の直近の雛形.
  - 関連 feature:
    - [`../routine/spec.md`](../routine/spec.md) (BL-017) — 「RoutinesView」の DOM / 機能.
    - [`../secondary-views-shell/spec.md`](../secondary-views-shell/spec.md) (BL-045) — `.routines-view` / `.routines-view h1` / `.routines-view__empty` の枠ルール.
    - [`../task-card-component/spec.md`](../task-card-component/spec.md) (BL-059) — TaskCard / TaskFormCard のペア component + 専用 CSS パターン.
    - [`../project-card-component/spec.md`](../project-card-component/spec.md) (BL-060) — ProjectCard / ProjectFormCard. 本 BL は同流儀.
    - [`../design-tokens/`](../design-tokens/) (BL-046) — 参照トークン群. 本 BL では tokens.css を**変更しない**.
  - 上位要件: NFR-010 (一貫した UI / 最小手数) / FR-ROUTINE.
  - 関係しない feature: BL-044 (inline-project-create) / BL-050 (remove-inline-project-create) / TaskCard 系 (BL-059) / ProjectCard 系 (BL-060) には触れない.

## 背景 / 課題

現状 `web/src/ui/routines-view/routines-view.tsx` のルーティン一覧と作成フォームは, BL-017 当時の素朴な DOM のまま残っている.

### 現状 DOM

- 作成フォーム (`routines-view.tsx` L263-303 付近):

  ```jsx
  <form aria-label="ルーティン作成フォーム" className="routines-view__form">
    <div>
      <label htmlFor="routine-name">名前</label>
      <input id="routine-name" type="text" value={newName} ... required />
    </div>
    <div>
      {DAY_LABELS.map((label, day) => (
        <label key={day}>
          <input type="checkbox" checked={newDaysOfWeek.includes(day)} ... />
          {label}
        </label>
      ))}
    </div>
    <div>
      <label htmlFor="routine-priority">優先度</label>
      <select id="routine-priority" value={newDefaultPriority} ...>...</select>
    </div>
    <button type="submit">追加</button>
  </form>
  ```

  - 4 つのブロック (name / 曜日チェックボックス群 / 優先度セレクト / 追加 button) が `<div>` で**縦並び**.
  - `.routines-view__form` は `display: flex; flex-direction: column; gap: --space-sm` (`routines-view.css` L17-24).

- 一覧の各行 (L305-335 付近):

  ```jsx
  <ul className="routines-view__list">
    {routines.map((routine) => (
      <li className="routines-view__item">
        {editingId === routine.id ? (
          <form aria-label="ルーティン名称変更フォーム" ... >
            <input ... />
            <button type="submit">保存</button>
            <button type="button">キャンセル</button>
          </form>
        ) : (
          <>
            <span>{routine.name}</span>
            <span>{routine.daysOfWeek.map((d) => DAY_LABELS[d]).join("・")}</span>
            <button type="button">名称変更</button>
            <button type="button">削除</button>
          </>
        )}
      </li>
    ))}
  </ul>
  ```

  - 表示モード: ルーティン名 + 曜日表示 + 「名称変更」 + 「削除」が同じ `<li>` 内に並ぶ.
  - inline edit モード: 編集用 form が `<li>` 内に展開され, 「保存」「キャンセル」 button.

### 問題点

1. **コンポーネント分割の不整合**: BL-059 で task 系 / BL-060 で project 系は「ペア component + 専用 CSS」パターンを採用したが, routines-view は依然として view が直接 DOM を組み立てている. 同じパターンを routine 系にも適用したい.
2. **作成フォームの縦並び**: モックアップでは「ルーティン名 input + 曜日チェック + 優先度 select + 追加 button」を可能な限り横一段にまとめたい. ただし routine は要素が多い (name + 7 曜日 + 優先度) ため 1 段だけだと窮屈になる可能性がある. 本 BL では 「name + 追加 button が横並びの 1 段目」+「曜日 + 優先度が横並びの 2 段目」の 2 段構成を採用する (D-004 で確定).
3. **表示行のレイアウト未整理**: 「名称変更」「削除」は現状 `.routines-view__actions` で `margin-left: auto` で右に寄せているが, ボタンのラベル / 並び順 / 専用 CSS が確定していない. user は ProjectCard と同じく「変更」→「削除」の順で右端に並べたい (ラベルも「名称変更」→「変更」へ短縮).
4. **入力ヒントの統一**: ProjectCard 系 (BL-060) で name input に `placeholder` を出すパターンが確立した. 同様にルーティン作成 form の name input にも `placeholder="ルーティン名"` を出したい.

### user 要求

- **RoutineFormCard** (作成カード):
  - name input に薄く `placeholder="ルーティン名"` を表示. label は visually-hidden で a11y 維持.
  - 「追加」ボタンを name input と同じ高さで右端に配置 (1 段目).
  - 曜日チェックボックス群 + 優先度 select を 2 段目に横並び配置.
  - カード全体は 1 枚の `.routine-card.routine-card--form` 内に収める.

- **RoutineCard** (表示カード):
  - 左にルーティン名と曜日表示.
  - 右端に「変更」「削除」を横並びで配置.
  - 1 段 flex 横並び layout: `[ルーティン名 + 曜日] ... [変更 button][削除 button]`.
  - ルーティン名と曜日表示は左ブロック内で「名前 (上) → 曜日 (下) の 2 行」または「名前と曜日が横並び」のいずれか. user 確定方針として「名前と曜日を 2 行縦並び」とする (D-009 で確定).

### 方針の核

本 BL は以下を実現する.

1. **新規 React コンポーネント `<RoutineCard>`** (表示) を `web/src/ui/routine-card/routine-card.tsx` に新設し, routines-view の一覧で再利用する.
2. **新規 React コンポーネント `<RoutineFormCard>`** (作成) を `web/src/ui/routine-card/routine-form-card.tsx` に新設し, routines-view の作成フォームを置換する.
3. **ペア専用 CSS `web/src/ui/routine-card/routine-card.css`** に `.routine-card` / `.routine-card--form` / `.routine-card__name` / `.routine-card__days` / `.routine-card__actions` 等を集約する.
4. TaskCard 系 (BL-059) / ProjectCard 系 (BL-060) とは**別 CSS / 別 visual** (系統間独立). 共通基底 `<Card>` は作らない.
5. 既存 `.routines-view__form` / `.routines-view__item` / `.routines-view__days` / `.routines-view__actions` を撤去し, 役割を `.routine-card` 系に移譲する.
6. 「名称変更」 button のラベルを「変更」に短縮する (= user 要求どおり / ProjectCard 整合). ただし「名称変更」アクション本体 (inline edit) は維持する.

shadow / hover / transition / animation は **一切追加しない** (BL-059 / BL-060 / NFR-NO-SHADOW / NFR-NO-HOVER-TRANSITION と同方針).

## ゴール / 非ゴール

### ゴール

- **G-1 (RoutineCard コンポーネントの新設)**: `web/src/ui/routine-card/routine-card.tsx` に `<RoutineCard>` を新設し, 表示モード (ルーティン名 + 曜日表示 + 「変更」「削除」) を flex 横並びで描画する.
- **G-2 (RoutineFormCard コンポーネントの新設)**: `web/src/ui/routine-card/routine-form-card.tsx` に `<RoutineFormCard>` を新設し, 作成フォーム (name + 曜日チェック + 優先度 select + 「追加」) を 2 段構成で描画する.
- **G-3 (専用 CSS の新設)**: `web/src/ui/routine-card/routine-card.css` に `.routine-card` / `.routine-card--form` / `.routine-card--editing` / `.routine-card__name` / `.routine-card__days` / `.routine-card__days-label` / `.routine-card__actions` / `.routine-card__actions__edit` / `.routine-card__actions__delete` / `.routine-card__form-inline` / `.routine-card__form-row` / `.routine-card__input` / `.routine-card__input::placeholder` / `.routine-card__select` / `.routine-card__day-checkboxes` / `.routine-card__submit` / `.visually-hidden` を新設し, RoutineCard / RoutineFormCard が共有する.
- **G-4 (routines-view 適用)**: `routines-view.tsx` の作成 form を `<RoutineFormCard>` に置換, 一覧の各 `<li>` を `<RoutineCard as="li">` に置換する. 編集モードの DOM 構造は D-003 で確定した方針で統合する.
- **G-5 (visual 反映)**:
  - V-1: RoutineFormCard の `.routine-card--form` は 2 段構成. 1 段目 = `[name input] ... [追加 button]` の flex 横並び. 2 段目 = `[曜日チェックボックス群] [優先度 select]` の flex 横並び. label は visually-hidden で隠す.
  - V-2: name input は `flex: 1` で残り幅を占有し, placeholder「ルーティン名」を `--color-fg-subtle` で薄く描画 (BL-060 V-2 と同方針).
  - V-3: 「追加」 button は name input の右側に置かれ, height は input と揃う.
  - V-4: RoutineCard の `.routine-card` は flex 横並び. 左ブロック (name + 曜日表示) が `flex: 1` で残り幅を占有, 右の actions は自然に右端へ.
  - V-5: 左ブロック内では `.routine-card__name` (1 行目) と `.routine-card__days-label` (2 行目) を縦並び (`flex-direction: column`) で配置 (D-009).
  - V-6: actions 内 button は「変更」→「削除」の順で並ぶ (= DOM 順 / 視覚順とも左→右で「変更」「削除」).
  - V-7: visual 4 宣言 (`background: var(--color-bg)` / `border: 1px solid var(--color-border)` / `border-radius: var(--radius-lg)` / `padding: var(--space-md)`) は `.routine-card` 基底に集約.
- **G-6 (旧 CSS 撤去)**: `routines-view.css` から `.routines-view__form` / `.routines-view__item` / `.routines-view__days` / `.routines-view__days-label` / `.routines-view__actions` を撤去する. `.routines-view` / `.routines-view h1` / `.routines-view__list` / `.routines-view__empty` は維持する (BL-045 の枠スタイル).
- **G-7 (visually-hidden ユーティリティの定義)**: BL-060 と同じく `.visually-hidden` を `routine-card.css` 内に再定義する. 系統間 CSS 独立方針に従う (D-008).
- **G-8 (「変更」ラベル化)**: 表示モード の「名称変更」 button ラベルを「変更」に短縮する. 編集モード form の `aria-label` は既存テストとの互換のため「ルーティン名称変更フォーム」のまま維持する (D-005).
- **G-9 (tokens.css 無改修)**: `web/src/styles/tokens.css` を**変更しない**. 既存トークンのみで構成する.
- **G-10 (component / Repository 無改修)**: ConflictDialog / repository / mutation / query / offline-queue / notifyError は無改修. 本 BL は presentation 層のみ.
- **G-11 (a11y 違反 0 件維持)**: `e2e/a11y.spec.ts` の WCAG 2.1 AA スキャンで violations 0 件を維持する.

### 非ゴール

- **TaskCard 系 (BL-059) / ProjectCard 系 (BL-060) の変更**: スコープ外.
- **系統間共通の `<Card>` 基底コンポーネント**: 作らない (user 確定方針).
- **RoutineRepository / RoutineConflictError / mutation 経路**: 無改修 (NFR-COMPAT).
- **inline edit のフロー変更**: 「変更」ボタン押下 → inline edit form 表示 → 「保存」/「キャンセル」 button → mutation → 元の表示モードへ復帰のフロー自体は維持する. DOM レイアウトのみ RoutineCard / RoutineFormCard に統合する (D-003).
- **編集モードでの曜日 / 優先度の編集**: 現状 routines-view は inline edit で name のみ更新可能で daysOfWeek / defaultPriority の編集 UI は無い. 本 BL でもこの仕様は変えない (= 編集 form は name input のみ).
- **`.routines-view` / `.routines-view h1` / `.routines-view__list` / `.routines-view__empty` のルール本文変更**: BL-045 で確定済みのため touch しない.
- **tokens.css への新規トークン追加**: G-9.
- **shadow / hover / transition / animation の追加**: NFR-NO-SHADOW / NFR-NO-HOVER-TRANSITION.
- **domain / server API**: 無改修.
- **共通 button スタイル (BL-067)**: 別 BL.

## 要件

### 機能要件

- **REQ-1 (`<RoutineCard>` コンポーネントの新設)**

  `web/src/ui/routine-card/routine-card.tsx` に以下の React コンポーネントを新設する:

  ```ts
  export interface RoutineCardProps {
    routine: WebRoutine;
    isEditing: boolean;                // 親 (routines-view) が editingId === routine.id で判定して渡す
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
    <li class="routine-card">
      <div class="routine-card__main">
        <span class="routine-card__name">{routine.name}</span>
        <span class="routine-card__days-label">{daysLabel}</span>
      </div>
      <div class="routine-card__actions">
        <button type="button" class="routine-card__actions__edit">変更</button>
        <button type="button" class="routine-card__actions__delete">削除</button>
      </div>
    </li>
    ```

    `daysLabel` は `routine.daysOfWeek.map((d) => DAY_LABELS[d]).join("・")` で組み立てる. `DAY_LABELS = ["日","月","火","水","木","金","土"]` (現行 routines-view.tsx L36 をそのまま流用).

  - 出力 DOM 構造 (編集モード / `isEditing=true`):

    ```html
    <li class="routine-card routine-card--editing">
      <form aria-label="ルーティン名称変更フォーム" class="routine-card__form-inline">
        <label htmlFor="routine-edit-{routine.id}" class="visually-hidden">ルーティン名</label>
        <input id="routine-edit-{routine.id}" type="text" class="routine-card__input"
               value={editingName} placeholder="ルーティン名" required />
        <button type="submit">保存</button>
        <button type="button" onClick={onCancelEdit}>キャンセル</button>
      </form>
    </li>
    ```

  - 表示モードは 1 段 flex 横並び. 左ブロック (`.routine-card__main`) に name + days-label を縦並びで配置, 右に actions.
  - 編集モードでは `<form>` を `<li>` 内に展開し, 1 段 flex 横並び (name input + 保存 / キャンセル button).
  - 「変更」 button のラベル文字列は `"変更"` (G-8).
  - 編集 form の `aria-label` は `"ルーティン名称変更フォーム"` (D-005 / 現行互換).

- **REQ-2 (`<RoutineFormCard>` コンポーネントの新設)**

  `web/src/ui/routine-card/routine-form-card.tsx` に以下の React コンポーネントを新設する:

  ```ts
  export interface RoutineFormCardProps {
    name: string;
    onNameChange: (next: string) => void;
    daysOfWeek: number[];               // 例: [1, 2] (月火)
    onToggleDay: (day: number) => void;
    defaultPriority: string;            // "highest" | "normal" | "later"
    onDefaultPriorityChange: (next: string) => void;
    onSubmit: (e: React.FormEvent) => void;
    inputId?: string;                  // default: "routine-name"
    priorityId?: string;               // default: "routine-priority"
    formAriaLabel?: string;            // default: "ルーティン作成フォーム"
  }
  ```

  - 出力 DOM 構造:

    ```html
    <form aria-label="ルーティン作成フォーム" class="routine-card routine-card--form">
      <div class="routine-card__form-row routine-card__form-row--name">
        <label htmlFor="routine-name" class="visually-hidden">ルーティン名</label>
        <input id="routine-name" type="text" class="routine-card__input"
               value={name} placeholder="ルーティン名" required />
        <button type="submit" class="routine-card__submit">追加</button>
      </div>
      <div class="routine-card__form-row routine-card__form-row--options">
        <div class="routine-card__day-checkboxes" role="group" aria-label="曜日">
          <label><input type="checkbox" checked={daysOfWeek.includes(0)} ... />日</label>
          <label><input type="checkbox" checked={daysOfWeek.includes(1)} ... />月</label>
          ... (火 / 水 / 木 / 金 / 土 と同様)
        </div>
        <div class="routine-card__priority-row">
          <label htmlFor="routine-priority">優先度</label>
          <select id="routine-priority" class="routine-card__select" value={defaultPriority} ...>
            <option value="highest">最優先</option>
            <option value="normal">普通</option>
            <option value="later">後回し</option>
          </select>
        </div>
      </div>
    </form>
    ```

  - 2 段構成 (V-1). `.routine-card` の `flex-direction: column` で縦並び, 各 row は `.routine-card__form-row` の `flex-direction: row` で横並び.
  - 1 段目: name label (visually-hidden) + input + 「追加」 submit button. input は `flex: 1` で残り幅を占有 (V-2). `placeholder="ルーティン名"` を `--color-fg-subtle` で薄く出す.
  - 2 段目: 曜日チェックボックス群 (7 個) + 優先度 select. 曜日チェックボックス群は `<div role="group" aria-label="曜日">` で囲み, 各 label は曜日記号テキストを含む. 既存 e2e (`e2e/routines.spec.ts` L22 / L23) の `getByLabel("月", { exact: true })` 等が壊れないようにする (NFR-DAY-LABEL-PRESERVE).
  - `<form>` の `aria-label` default は `"ルーティン作成フォーム"` (既存 `e2e/secondary-views-style.spec.ts` L142 互換).
  - name input id default は `"routine-name"` (既存 testid 互換 / D-004).
  - 優先度 select id default は `"routine-priority"` (既存 routines-view.tsx L294 互換 / D-004).
  - 優先度 label「優先度」は visually-hidden にせず, ユーザに見える形で残す (D-008-2). 曜日チェックボックス群と優先度 select の文脈区別を維持するため. **BL-068 (routine-card-edit-fields) で逆転**: 本決定は BL-068 で `<select>` から `<PriorityStars />` への置換と同時に「優先度」label 自体を撤去する形で逆転した. 詳細は `../routine-card-edit-fields/spec.md` (BL-068) REQ-6 / D-003 を参照.
  - **BL-072 (routine-form-card-header-layout) で関連変更**: `<RoutineFormCard>` の DOM が `.routine-card__form-row` / `--name` / `--options` の 2 段構造から, `.routine-card__header` (PriorityStars 単独) / `.routine-card__title` (name input) / `.routine-card__day-checkboxes` / `.routine-card__actions` (「追加」 button) の 4 段構造に再編される. `RoutineFormCardProps` の public API は無改修で, 親 view (`routines-view.tsx`) の呼び出しも変更されない. 詳細は [`../routine-form-card-header-layout/spec.md`](../routine-form-card-header-layout/spec.md).
  - **BL-073 (routine-card-align-with-form) で関連変更**: 表示カード `<RoutineCard>` も BL-072 と同じ 4 段構造 (`.routine-card__header` / `.routine-card__title` / `.routine-card__day-checkboxes` / `.routine-card__actions`) に再編される. `RoutineCardProps` の public API は無改修で, 親 view (`routines-view.tsx`) の呼び出しも変更されない. 詳細は [`../routine-card-align-with-form/spec.md`](../routine-card-align-with-form/spec.md).

- **REQ-3 (専用 CSS `routine-card.css` の新設)**

  `web/src/ui/routine-card/routine-card.css` に以下のルールを定義する.

  - **基底 `.routine-card`** (visual 4 宣言 + flex layout 共通):

    ```css
    .routine-card {
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

    表示モード (`<li class="routine-card">`) はこの基底のまま 1 段 flex 横並びになる.

  - **起票カード modifier `.routine-card--form`** (V-1):

    ```css
    .routine-card--form {
      flex-direction: column;
      align-items: stretch;
    }
    ```

    `.routine-card` 基底を override して 2 段構成 (縦並び) にする.

  - **編集中 modifier `.routine-card--editing`** (本 BL 時点では空ルール / P-004): 将来の差異用足場.

  - **左ブロック `.routine-card__main`** (V-4 / V-5):

    ```css
    .routine-card__main {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: var(--space-xs);
    }
    ```

    名前と曜日を縦並びで配置. `flex: 1` で残り幅を占有して actions を右端へ押し出す.

  - **ルーティン名 `.routine-card__name`** (V-5):

    ```css
    .routine-card__name {
      /* 本 BL 時点では空ルール. 将来 font-weight / font-size 等の差異用足場 (P-004). */
    }
    ```

  - **曜日表示 `.routine-card__days-label`** (V-5):

    ```css
    .routine-card__days-label {
      font-size: var(--font-size-small);
      color: var(--color-fg-subtle);
    }
    ```

    現行 `routines-view.css` L51-54 の宣言をそのまま移送する.

  - **actions `.routine-card__actions`** (V-6):

    ```css
    .routine-card__actions {
      display: flex;
      align-items: center;
      gap: var(--space-sm);
    }
    ```

    DOM 順「変更 → 削除」がそのまま視覚順「左 → 右」になる.

  - **編集モードの inline form `.routine-card__form-inline`**:

    ```css
    .routine-card__form-inline {
      display: flex;
      flex: 1;
      align-items: center;
      gap: var(--space-sm);
    }
    ```

  - **起票フォームの row `.routine-card__form-row`** (V-1):

    ```css
    .routine-card__form-row {
      display: flex;
      flex-direction: row;
      align-items: center;
      gap: var(--space-sm);
    }
    ```

  - **曜日チェックボックス群 `.routine-card__day-checkboxes`** (V-1):

    ```css
    .routine-card__day-checkboxes {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-sm);
    }
    ```

    現行 `.routines-view__days` (L26-30) の宣言を移送.

  - **input `.routine-card__input`** (V-2):

    ```css
    .routine-card__input {
      flex: 1;
    }

    .routine-card__input::placeholder {
      color: var(--color-fg-subtle);
    }
    ```

  - **select `.routine-card__select`** (V-1): 本 BL 時点では空ルール (P-004).

  - **submit ボタン `.routine-card__submit`** (V-3): 本 BL 時点では空ルール (P-004).

  - **空ルール (足場) (P-004)**: `.routine-card__actions__edit` / `.routine-card__actions__delete` / `.routine-card__priority-row` も空ルールとして定義. 将来 specificity 制御 / 装飾用.

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

  - shadow / hover / transition / animation は**追加しない**.

- **REQ-4 (routines-view の置換)**

  `web/src/ui/routines-view/routines-view.tsx` を以下のように変更する:

  - 4-1. `<form className="routines-view__form">{...}</form>` (L263-303 付近) を `<RoutineFormCard name={newName} onNameChange={setNewName} daysOfWeek={newDaysOfWeek} onToggleDay={toggleDay} defaultPriority={newDefaultPriority} onDefaultPriorityChange={setNewDefaultPriority} onSubmit={handleCreate} />` に置換する (REQ-4-1).
  - 4-2. `<ul className="routines-view__list">` 内の `<li className="routines-view__item">{...}</li>` を `<RoutineCard routine={routine} isEditing={editingId === routine.id} editingName={editingName} onEditingNameChange={setEditingName} onStartEdit={() => openEdit(routine)} onCancelEdit={cancelEdit} onSaveEdit={handleSaveEdit} onDelete={() => handleDelete(routine)} />` に置換する.
  - 4-3. `<ul className="routines-view__list">` 自体は維持する (BL-045 の枠).
  - 4-4. import 文に以下を追加:

    ```ts
    import { RoutineCard } from "../routine-card/routine-card.js";
    import { RoutineFormCard } from "../routine-card/routine-form-card.js";
    ```

  - 4-5. `import "./routines-view.css"` は維持する (枠系セレクタ用).
  - 4-6. `DAY_LABELS` 定数は `<RoutineCard>` / `<RoutineFormCard>` 側へ移送する. routines-view.tsx 内の `DAY_LABELS` 直接参照は撤去する.

- **REQ-5 (旧 CSS 撤去)**

  `web/src/ui/routines-view/routines-view.css` から以下のセレクタを**撤去**する:

  - `.routines-view__form`
  - `.routines-view__item`
  - `.routines-view__days`
  - `.routines-view__days-label`
  - `.routines-view__actions`

  以下のセレクタは**維持**する (BL-045 の枠 / NFR-PRESERVE-SHELL):

  - `.routines-view`
  - `.routines-view h1`
  - `.routines-view__list`
  - `.routines-view__empty`

- **REQ-6 (「名称変更」ラベル → 「変更」短縮)**

  表示モード button のラベル文字列を `"名称変更"` から `"変更"` に変更する. 編集 form の `aria-label="ルーティン名称変更フォーム"` は維持する (D-005).

- **REQ-7 (placeholder + visually-hidden パターン)**

  - 作成 form の name `<input>` に `placeholder="ルーティン名"` を追加. label は visually-hidden で残し, `htmlFor` で `<input>` と関連付け維持.
  - 編集 form の `<input>` にも同じ placeholder と visually-hidden label を適用 (D-008 整合).

- **REQ-8 (CSS import 追加)**

  `<RoutineCard>` / `<RoutineFormCard>` のファイル先頭で `import "./routine-card.css"` する. 既存 view (`routines-view.tsx`) は `<RoutineCard>` / `<RoutineFormCard>` を import するだけで CSS が連動する.

- **REQ-9 (component 本体 / Repository 無改修)**

  ConflictDialog / repository / mutation / query / offline-queue / notifyError / `useConflictDialog` には**触れない**. 本 BL は presentation 層のみ.

### 非機能要件

- **NFR-NO-NEW-TOKENS**: tokens.css を変更しない. 既存トークンのみで構成する.
- **NFR-NO-SHADOW**: `.routine-card` 系セレクタに `box-shadow` を追加しない.
- **NFR-NO-HOVER-TRANSITION**: `.routine-card` 系セレクタに `:hover` / `transition` / `animation` を追加しない.
- **NFR-A11Y**: `e2e/a11y.spec.ts` の WCAG 2.1 AA スキャンで violations 0 件を維持する.
- **NFR-DOM-COMPATIBLE-LI**: 一覧の各行は引き続き `<li>` 直下に配置する (= `<RoutineCard as="li">`). 既存テストの `<li>` ベース取得が壊れない.
- **NFR-DAY-LABEL-PRESERVE**: 曜日チェックボックスの label テキスト「日」「月」「火」「水」「木」「金」「土」は維持. `e2e/routines.spec.ts` L22 / L23 の `getByLabel("月", { exact: true })` 等が壊れない.
- **NFR-NAME-LABEL-CHANGE**: name input の label テキストを「名前」→「ルーティン名」に変更する (placeholder と一致 / D-008). `e2e/routines.spec.ts` L20 / L33 の `getByLabel("名前")` は「ルーティン名」に追従修正する (R-002).
- **NFR-FORM-ARIA-LABEL-PRESERVE**: 作成 form の `aria-label="ルーティン作成フォーム"` と編集 form の `aria-label="ルーティン名称変更フォーム"` は**維持**する (`e2e/secondary-views-style.spec.ts` L142 互換).
- **NFR-PRESERVE-SHELL**: BL-045 の `.routines-view` / `.routines-view h1` / `.routines-view__list` / `.routines-view__empty` のルール本文は無改修.
- **NFR-COMPAT**: サーバ API / domain / Repository / mutation / query / ConflictDialog / notifyError 経路は無改修.

## 受け入れ基準

> 書き方は [`../../quality/acceptance-criteria.md`](../../quality/acceptance-criteria.md) に従う.
> 検証コマンドはルートからの `npm test` (vitest 単体) と `npx playwright test` (E2E) を基準とする.

```
シナリオ AC-1: .routine-card 基底クラスが visual 4 宣言 + flex 横並び layout を持つ
  Given web/src/ui/routine-card/routine-card.css を開いた
  When  .routine-card セレクタのルール本文を観察する
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
シナリオ AC-2: .routine-card--form が縦並び 2 段構成の override を持つ (V-1)
  Given routine-card.css を開いた
  When  .routine-card--form セレクタのルール本文を観察する
  Then  flex-direction: column の宣言を含む
   かつ align-items: stretch の宣言を含む
```

```
シナリオ AC-3: .routine-card__main が左ブロックの flex 占有と縦並びを持つ (V-4 / V-5)
  Given routine-card.css を開いた
  When  .routine-card__main セレクタのルール本文を観察する
  Then  flex: 1 (または flex-grow: 1) の宣言を含む
   かつ display: flex の宣言を含む
   かつ flex-direction: column の宣言を含む
```

```
シナリオ AC-4: .routine-card__actions がボタン横並びを持つ (V-6)
  Given routine-card.css を開いた
  When  .routine-card__actions セレクタのルール本文を観察する
  Then  display: flex の宣言を含む
   かつ align-items: center の宣言を含む
   かつ gap: var(--space-sm) の宣言を含む
```

```
シナリオ AC-5: .routine-card__input が flex: 1 + placeholder の薄色を持つ (V-2)
  Given routine-card.css を開いた
  When  .routine-card__input / .routine-card__input::placeholder セレクタを観察する
  Then  .routine-card__input に flex: 1 (または flex-grow: 1) の宣言を含む
   かつ .routine-card__input::placeholder に color: var(--color-fg-subtle) の宣言を含む
```

```
シナリオ AC-6: .routine-card__days-label が小さい字 + 薄色を持つ (V-5)
  Given routine-card.css を開いた
  When  .routine-card__days-label セレクタのルール本文を観察する
  Then  font-size: var(--font-size-small) の宣言を含む
   かつ color: var(--color-fg-subtle) の宣言を含む
```

```
シナリオ AC-7: .routine-card__day-checkboxes が wrap 横並びを持つ (V-1)
  Given routine-card.css を開いた
  When  .routine-card__day-checkboxes セレクタのルール本文を観察する
  Then  display: flex の宣言を含む
   かつ flex-wrap: wrap の宣言を含む
   かつ gap: var(--space-sm) の宣言を含む
```

```
シナリオ AC-8: .visually-hidden ユーティリティが routine-card.css に定義されている (D-008)
  Given routine-card.css を開いた
  When  .visually-hidden セレクタのルール本文を観察する
  Then  position: absolute の宣言を含む
   かつ width: 1px / height: 1px の宣言を含む
   かつ overflow: hidden の宣言を含む
   かつ clip: rect(0, 0, 0, 0) の宣言を含む
```

```
シナリオ AC-9: <RoutineCard isEditing=false> が表示モードの DOM を出す
  Given <RoutineCard routine={...} isEditing={false} ... /> を render する
  When  出力 DOM を観察する
  Then  ルート要素は <li class="routine-card"> である
   かつ .routine-card 内に .routine-card__main 要素が存在する
   かつ .routine-card__main 内に .routine-card__name (routine.name 文字列) が存在する
   かつ .routine-card__main 内に .routine-card__days-label (曜日文字列) が存在する
   かつ .routine-card 内に .routine-card__actions 要素が存在する
   かつ .routine-card__actions 内に「変更」 button が存在する
   かつ .routine-card__actions 内に「削除」 button が存在する
   かつ DOM 順は「変更」が「削除」より先
```

```
シナリオ AC-10: <RoutineCard isEditing=true> が編集モードの DOM を出す
  Given <RoutineCard routine={...} isEditing={true} editingName="..." ... /> を render する
  When  出力 DOM を観察する
  Then  ルート要素は <li class="routine-card routine-card--editing"> である
   かつ ルート内に <form aria-label="ルーティン名称変更フォーム"> が存在する
   かつ form 内に visually-hidden な <label class="visually-hidden">ルーティン名</label> + <input> が存在する
   かつ input の id と label の htmlFor が一致する
   かつ form 内に <button type="submit">保存</button> が存在する
   かつ form 内に <button type="button">キャンセル</button> が存在する
```

```
シナリオ AC-11: <RoutineFormCard> が 2 段構成の作成フォームを描画する
  Given <RoutineFormCard name="" daysOfWeek={[1]} defaultPriority="normal" ... /> を render する
  When  出力 DOM を観察する
  Then  ルート要素は <form aria-label="ルーティン作成フォーム" class="routine-card routine-card--form"> である
   かつ form 直下に 2 つの .routine-card__form-row 要素が存在する
   かつ 1 段目 row 内に <label class="visually-hidden" htmlFor="routine-name">ルーティン名</label> が存在する
   かつ 1 段目 row 内に <input id="routine-name" type="text" placeholder="ルーティン名"> が存在する
   かつ 1 段目 row 内に <button type="submit">追加</button> が存在する
   かつ 2 段目 row 内に .routine-card__day-checkboxes が存在し 7 個の checkbox <input> が含まれる
   かつ 2 段目 row 内に <select id="routine-priority"> が存在し option 3 個 (highest / normal / later) を含む
   かつ getByLabelText("ルーティン名") で name input が取得可能
```

```
シナリオ AC-12: <RoutineFormCard> の input に placeholder が表示される (V-2)
  Given <RoutineFormCard name="" ... /> を render する
  When  出力 DOM の <input id="routine-name"> を観察する
  Then  input の placeholder 属性は「ルーティン名」である
```

```
シナリオ AC-13: 「変更」 button が「変更」ラベルで表示される (G-8 / REQ-6)
  Given <RoutineCard routine={...} isEditing={false} ... /> を render する
  When  ボタンを観察する
  Then  「変更」 button が存在する
   かつ 「名称変更」 button は存在しない
```

```
シナリオ AC-14: 曜日 checkbox label が「日」〜「土」のテキストを維持する (NFR-DAY-LABEL-PRESERVE)
  Given <RoutineFormCard daysOfWeek={[]} ... /> を render する
  When  曜日チェックボックス群の各 label テキストを観察する
  Then  「日」「月」「火」「水」「木」「金」「土」がそれぞれ少なくとも 1 つの label に含まれる
   かつ getByLabelText("月", { exact: true }) で月曜の checkbox が取得可能
```

```
シナリオ AC-15: routines-view.tsx が <RoutineCard> / <RoutineFormCard> を使う (REQ-4)
  Given web/src/ui/routines-view/routines-view.tsx を開いた
  When  ファイル本文を観察する
  Then  import { RoutineCard } from "../routine-card/routine-card.js" 文を含む
   かつ import { RoutineFormCard } from "../routine-card/routine-form-card.js" 文を含む
   かつ <RoutineCard ... /> の使用が少なくとも 1 か所存在する
   かつ <RoutineFormCard ... /> の使用が少なくとも 1 か所存在する
   かつ className="routines-view__form" の使用が存在しない
   かつ className="routines-view__item" の使用が存在しない
   かつ className="routines-view__actions" の使用が存在しない
   かつ className="routines-view__days" の使用が存在しない
```

```
シナリオ AC-16: 旧 .routines-view__form / __item / __days / __days-label / __actions セレクタが routines-view.css から撤去されている (REQ-5)
  Given web/src/ui/routines-view/routines-view.css を開いた
  When  ファイル本文を観察する
  Then  .routines-view__form セレクタが定義されていない
   かつ .routines-view__item セレクタが定義されていない
   かつ .routines-view__days セレクタが定義されていない
   かつ .routines-view__days-label セレクタが定義されていない
   かつ .routines-view__actions セレクタが定義されていない
```

```
シナリオ AC-17: routines-view.css の維持セレクタが引き続き存在する (NFR-PRESERVE-SHELL)
  Given routines-view.css を開いた
  When  ファイル本文を観察する
  Then  .routines-view セレクタが定義されている
   かつ .routines-view h1 セレクタが定義されている
   かつ .routines-view__list セレクタが定義されている
   かつ .routines-view__empty セレクタが定義されている
```

```
シナリオ AC-18: tokens.css を変更していない (NFR-NO-NEW-TOKENS)
  Given 本 BL の実装がマージされた
  When  tokens.css を BL-060 完了時点と比較する
  Then  差分が無い
   かつ 本 BL で参照する --color-bg / --color-border / --radius-lg / --space-md / --space-sm / --space-xs / --color-fg-subtle / --font-size-small が引き続き定義されている
```

```
シナリオ AC-19: RoutineRepository / mutation 経路が無改修である (NFR-COMPAT)
  Given web/src/repositories/routine-repository.ts を開いた
   かつ routines-view.tsx 内の createMutation / updateMutation / deleteMutation を観察する
  When  本 BL の前後で diff を取る
  Then  RoutineRepository の API / Mutation 構成に差分が無い
   かつ ConflictDialog / useConflictDialog の呼び出しに差分が無い
```

```
シナリオ AC-20: label/input 関連付けが保持されている (NFR-NAME-LABEL-CHANGE / NFR-DAY-LABEL-PRESERVE)
  Given /routines を render する
  When  作成フォームの label と input を観察する
  Then  <label class="visually-hidden" htmlFor="routine-name">ルーティン名</label> と <input id="routine-name"> が共存する
   かつ getByLabelText("ルーティン名") で name input が取得可能
   かつ 7 個の曜日 label (日〜土) と checkbox の関連付けが維持されている
   かつ <label htmlFor="routine-priority">優先度</label> と <select id="routine-priority"> が共存する
```

```
シナリオ AC-21: form の aria-label が保持されている (NFR-FORM-ARIA-LABEL-PRESERVE)
  Given /routines を render する
  When  form を観察する
  Then  作成 form の aria-label は「ルーティン作成フォーム」である
   かつ 編集モード form の aria-label は「ルーティン名称変更フォーム」である
```

```
シナリオ AC-22: .routine-card 系セレクタに box-shadow / transition / animation / :hover が無い
  Given routine-card.css を開いた
  When  ファイル全体を観察する
  Then  box-shadow キーワードを含む宣言が存在しない
   かつ transition 宣言が存在しない
   かつ animation 宣言が存在しない
   かつ .routine-card:hover / .routine-card--form:hover 等の :hover セレクタが存在しない
```

```
シナリオ AC-23: 既存単体テスト全件 green (追従修正後)
  Given /routines が引き続きレンダリング可能
  When  ルートから npm test (vitest 全件) を実行する
  Then  すべて green である
   かつ 追従修正された既存テスト (もしあれば) が green になる
```

```
シナリオ AC-24: 既存 E2E 全件 green (追従修正後)
  Given Playwright が起動可能
  When  npx playwright test を実行する
  Then  すべて green である
   かつ e2e/routines.spec.ts の「名前」label が「ルーティン名」に追従して green である
   かつ e2e/secondary-views-style.spec.ts の routines 関連 assertion が --radius-lg = 16px に追従して green である
   かつ e2e/a11y.spec.ts の /routines スキャンが violations 0 件である
```

```
シナリオ AC-25: アクセシビリティ違反 0 件を維持する (NFR-A11Y)
  Given /routines をはじめとする全 view がレンダリング可能
  When  @axe-core/playwright で WCAG 2.1 AA をスキャンする (e2e/a11y.spec.ts)
  Then  すべてのスキャンで violations.length === 0
```

## 重要な決定 (D 章)

- **D-001 (新規ディレクトリ `web/src/ui/routine-card/` に同居)**:
  - `<RoutineCard>` / `<RoutineFormCard>` / `routine-card.css` を同じディレクトリに置く. BL-059 (`task-card/`) / BL-060 (`project-card/`) と同じパターン.
  - 系統間共通の `<Card>` 基底や `web/src/ui/card/` のような汎用ディレクトリは**作らない**. user の方針「ペア専用 CSS / 系統間は独立」に従う.

- **D-002 (ラッパ要素のタグ選択 `as` prop)**:
  - RoutineCard はデフォルト `<li>` (一覧用途). 将来 RoutineCard を `<li>` 以外で使うケースに備え `as: "li" | "div"` で切り替え可能にする. default は `"li"`.
  - RoutineFormCard は常に `<form>`. `as` prop は持たない.

- **D-003 (編集モードの統合方針 / 案 i 採用)**:
  - 候補:
    - (i) `<RoutineCard isEditing={true}>` で同じ RoutineCard が編集モード DOM を出す.
    - (ii) `<RoutineFormCard>` を編集モードでも流用する (= 名前を `<RoutineInputCard>` に改名).
    - (iii) 別コンポーネント `<RoutineEditCard>` を新設.
    - (iv) 既存の inline edit ロジックを `routines-view.tsx` に残し RoutineCard は表示のみ.
  - 採用: (i) `<RoutineCard isEditing>` で内部分岐. ProjectCard (BL-060 D-003) と整合.
  - 編集モードの DOM は `<li class="routine-card routine-card--editing">` 内に `<form aria-label="ルーティン名称変更フォーム">` を入れる構造. `.routine-card--editing` modifier は将来差異用の空ルール.
  - 編集用 input の id は `routine-edit-{routine.id}` (動的). 既存テストで参照されていない id のため衝突しない.
  - 編集モードで daysOfWeek / defaultPriority を変更する UI は持たない (= 現行仕様維持).

- **D-004 (RoutineFormCard の input / select id / 既存テスト互換)**:
  - 作成 form の name input id は default `"routine-name"` (既存 `routines-view.tsx` L271 で使われていた id を保持).
  - 優先度 select id は default `"routine-priority"` (既存 L293-294 互換).
  - prop 化することで, 将来別 view で再利用するときに id 衝突回避ができる.

- **D-005 (「名称変更」 → 「変更」短縮の影響と aria-label 維持方針)**:
  - 表示モード button のラベルは `"名称変更"` から `"変更"` に短縮 (G-8 / REQ-6 / ProjectCard 整合).
  - 編集モード form の `aria-label` は `"ルーティン名称変更フォーム"` のまま維持する.
  - 現状コードベースで「名称変更」 button accessibleName を直接見ている E2E は `e2e/routines.spec.ts` には**無い** (L39 は role=button name=「削除」のみ). 追従修正は必要ないと想定. ただし将来 e2e に「名称変更」 button を見るシナリオが追加された場合は「変更」に追従修正する.

- **D-006 (button の className 命名)**:
  - `.routine-card__actions__edit` / `.routine-card__actions__delete` の 2 段 BEM 風命名を採用. ProjectCard (BL-060 D-006) / TaskCard (BL-063) と同じパターン.
  - CSS ルール本文は本 BL 時点では空 (P-004).

- **D-007 (テスト方針)**:
  - 新規テストファイル `web/__tests__/routine-card-component.test.tsx` を作る.
    - (a) CSS 直読み (`routine-card.css` の各セレクタの宣言を assert): AC-1 〜 AC-8 / AC-22.
    - (b) jsdom DOM レンダ assert (`<RoutineCard>` / `<RoutineFormCard>` 単体): AC-9 〜 AC-14.
    - (c) view 適用 assert (`routines-view.tsx` の import + 使用): AC-15.
    - (d) 旧セレクタ撤去 assert (`routines-view.css` の差分): AC-16 / AC-17.
    - (e) 不変性 assert (tokens.css / Repository / mutation 構成): AC-18 / AC-19.
    - (f) ラベル / aria 保持 assert: AC-20 / AC-21.
  - 既存テストの追従:
    - `web/__tests__/design-tokens.test.ts` L81 で `ui/routines-view/routines-view.css` を参照する箇所が, 旧セレクタ撤去後も green を維持することを確認.
    - `e2e/routines.spec.ts` の `getByLabel("名前")` を `getByLabel("ルーティン名")` に追従修正 (R-002).
    - `e2e/secondary-views-style.spec.ts` の AC-4 / AC-5 から routines を**外す**追従修正が必要 (= routines は `--radius-lg = 16px` に変わったため `--radius-md = 12px` の比較対象から除外). 詳細は plan.md / P-008.

- **D-008 (visually-hidden ユーティリティの配置と name label テキスト変更)**:
  - 候補:
    - (i) `routine-card.css` 内に再定義 (BL-060 と同じ方式).
    - (ii) 共通 utility CSS を新設.
    - (iii) `project-card.css` の同クラスを流用 (= routines-view.tsx 側で `import "../project-card/project-card.css"` を追加).
  - 採用: (i) `routine-card.css` 内に再定義. 系統間 (Task / Project / Routine) で CSS を独立させる方針に従う.
  - name input の label テキストは `"名前"` から `"ルーティン名"` に変更する. placeholder と一致させ, label を visually-hidden 化したときも文脈が明確になる (= ProjectCard 系の「プロジェクト名」と整合).

- **D-008-2 (優先度 label を visually-hidden にしない)**:
  - 優先度 select の label「優先度」は visually-hidden にせず, ユーザに見える形で残す. 理由: 曜日チェックボックス群と優先度 select が同じ row に並ぶため, 視覚的に「これが何の選択か」を示すラベルが必要. ProjectFormCard では入力欄が 1 つだったため visually-hidden で済んだが, RoutineFormCard は複数選択肢があるため可視ラベルを維持する.
  - **BL-068 (routine-card-edit-fields) で逆転**: 本決定は BL-068 で逆転し, `<PriorityStars />` 化と同時に「優先度」label 自体を撤去した. a11y は `<PriorityStars groupLabel="優先度">` の radiogroup aria-label (「優先度: ○○」) で担保する. 詳細は [`../routine-card-edit-fields/spec.md`](../routine-card-edit-fields/spec.md) REQ-6 / D-003 を参照.

- **D-009 (RoutineCard 左ブロックの構造 / 名前 + 曜日の縦並び)**:
  - 候補:
    - (i) `[名前 (上) → 曜日 (下)] の 2 行縦並び` (= `.routine-card__main { flex-direction: column }`)
    - (ii) `[名前] [曜日] [変更] [削除] の 1 段横並び`
  - 採用: (i). 理由: 曜日が増えると横幅を圧迫しやすく, TaskCard (BL-059) で採用された「主情報 + 補助情報を縦に重ねる」パターンと整合. user 要求の「ルーティンは曜日表示など属性が多いので段組み調整可」とも合致.
  - **BL-071 (routine-card-header-layout) で変更**: `.routine-card__main` ラッパを撤去し, `.routine-card` 直下に `.routine-card__header` (name input + PriorityStars 左右配置) / `.routine-card__day-checkboxes` / `.routine-card__actions` の 3 段構造に再編した. TaskCard と同じ視覚イディオムに揃えるため. 詳細は [`../routine-card-header-layout/spec.md`](../routine-card-header-layout/spec.md).

- **D-009-2 (旧 CSS セレクタ撤去の範囲)**:
  - `routines-view.css` から撤去: `.routines-view__form` / `.routines-view__item` / `.routines-view__days` / `.routines-view__days-label` / `.routines-view__actions` の 5 セレクタ.
  - `routines-view.css` で維持: `.routines-view` / `.routines-view h1` / `.routines-view__list` / `.routines-view__empty` の 4 セレクタ.

- **D-010 (edit ボタンと delete ボタンの DOM 順序)**:
  - DOM 順は `<button class="routine-card__actions__edit">変更</button>` → `<button class="routine-card__actions__delete">削除</button>` の順 (= 視覚順「左 → 右」). ProjectCard (BL-060 D-010) と整合.

- **D-011 (focus 順序 / キーボード操作)**:
  - 表示モードの一覧 `<li class="routine-card">` 内では DOM 順に従い Tab が「変更 → 削除」と進む.
  - 編集モードでは form 内で Tab が「input → 保存 → キャンセル」と進む.
  - 作成 form では「name input → 追加 button → 曜日 7 個 → 優先度 select」の順に Tab が進む (D-009-2 の DOM 順序のとおり). 既存 routines-view.tsx の Tab 順 ("name → 曜日 → 優先度 → 追加") とは順序が変わる. e2e で操作順を直接 assert している箇所は無いため壊れない見込み.

- **D-012 (RoutineCard の DOM タグ選択の type 安全 cast)**:
  - BL-059 P-002 / BL-060 D-012 と同じパターン. `as` prop は `"li" | "div"` の 2 値. JSX 上で `const Tag = as as "li"` cast.

- **D-013 (secondary-views-style.spec.ts の追従方針)**:
  - 現行 `e2e/secondary-views-style.spec.ts` AC-4 / AC-5 は「routines のフォーム / li が `--radius-md = 12px` で揃う」ことを assert している (= BL-060 で projects を `--radius-lg` 系へ外したのと同じ追従).
  - 本 BL では routines も `--radius-lg = 16px` 系に変わるため, AC-4 / AC-5 から routines を**除外**する. 残る対象は AC-4 で `/settings`, AC-5 で `/trash` のみとなる.
  - 詳細な diff は plan.md / P-008.

## 未決事項 / 確認待ち

- なし (D-001 〜 D-013 で本 BL の判断軸はすべて確定. 詳細な追従マッピングと PR 提出単位は plan.md / tasks.md で確定).
