# 設計・実装計画: 起票フォームのレイアウト 2D グリッド化 (task-form-grid-layout)

> [`spec.md`](spec.md) の要件を, どう実現するかに落とす.

## 方針概要

`.day-view__form` の **layout 宣言のみ** を `display: flex` から `display: grid` に切り替える. BL-054 で確定済みの visual 4 宣言 (`background` / `border` / `border-radius` / `padding`) は完全に保持する.

CSS 側で `grid-template-areas` (3 行 2 列) を定義し, 子要素には新規クラス (`.day-view__form__project` / `.day-view__form__priority` / `.day-view__form__name` / `.day-view__form__submit`) で `grid-area` を割り当てる. PriorityStars 直下に新規ヘルプラベル `<span className="day-view__form__priority-hint">↑タップで選択</span>` を起票フォーム JSX 内 (= PriorityStars 外側) に追加する.

today-view.tsx と tomorrow-view.tsx の起票フォーム JSX を **個別に書き換え** (共通 component 化はしない). PriorityStars / ProjectToggle / project-chip / `.day-view__card` 系には触れない. tokens.css / focus-view も無改修.

## 影響範囲

| 領域 | 変更内容 |
| --- | --- |
| API | 変更なし (NFR-COMPAT) |
| DB | 変更なし |
| domain | 変更なし |
| サーバ (`server/`) | 変更なし |
| Repository (`web/src/repositories/`) | 変更なし |
| mutation / query | 変更なし |
| ConflictDialog / notifyError | 変更なし |
| トークン (`web/src/styles/tokens.css`) | 変更なし (NFR-NO-NEW-TOKENS / G-5) |
| CSS (`web/src/ui/day-view/day-view.css`) | `.day-view__form` の layout 宣言を flex → grid に変更. `flex-direction: column` 撤去. `gap` を `--space-sm` → `--space-md` に引き上げ. 新規クラス 5 つ (`.day-view__form__project` / `.day-view__form__priority` / `.day-view__form__priority-hint` / `.day-view__form__name` / `.day-view__form__submit`) を追加 |
| CSS (`web/src/ui/focus-view/focus-view.css`) | 無改修 (G-6) |
| CSS (`web/src/ui/today-view/today-view.css` 等の view 個別 CSS) | 無改修 |
| JSX (`web/src/ui/today-view/today-view.tsx`) | 起票フォーム部分の `<div>` ラッパーに新規クラス付与 + 「追加」ボタンに `.day-view__form__submit` 付与 + PriorityStars 直下にヘルプ `<span>` 追加 |
| JSX (`web/src/ui/tomorrow-view/tomorrow-view.tsx`) | today-view と同等の変更 |
| JSX (`web/src/ui/focus-view/focus-view.tsx`) | 無改修 (G-6) |
| Component (`web/src/ui/priority-stars/priority-stars.tsx`) | 無改修 (G-4 / REQ-10 / NFR-COMPONENT-API-FROZEN) |
| Component (`web/src/ui/project-toggle/project-toggle.tsx`) | 無改修 (同上) |
| 共通 component 新設 (`<DayViewCreateForm />` 等) | 行わない (D-007) |
| 単体テスト | 新規 `web/__tests__/task-form-grid-layout.test.tsx` (CSS 直読み + jsdom DOM レンダ) を追加 |
| 既存単体テスト追従 | `today-view.test.tsx` / `tomorrow-view.test.tsx` / `unified-day-view.test.tsx` / `form-card-design.test.ts` などで CSS 宣言や DOM 構造を `display: flex` 前提に assert している箇所があれば追従修正 |
| E2E (`e2e/today-view-create-form.spec.ts` 等) | 原則無改修. label 紐付け・role + accessibleName ベースの取得は保たれる想定. 壊れた場合のみ最小限の追従修正 |
| a11y E2E (`e2e/a11y.spec.ts`) | 無改修. 既存スキャンが violations 0 件のまま通る想定 |

## 設計詳細

### データモデル

変更なし. 本 BL は presentation 層のみ.

### 処理フロー (DOM 構造)

#### today-view 側の起票フォーム JSX (REQ-5 後)

```jsx
<form onSubmit={handleCreate} aria-label="タスク起票フォーム" className="day-view__form">
  <div className="day-view__form__project">
    <ProjectToggle
      value={projectId === "" ? null : projectId}
      onChange={(next) => setProjectId(next ?? "")}
      projects={projects}
      idPrefix="create"
      groupLabel="プロジェクト"
    />
  </div>

  <div className="day-view__form__priority">
    <span id="task-priority-label">優先度</span>
    <PriorityStars
      value={priority}
      onChange={setPriority}
      groupLabel="優先度"
      idPrefix="create"
    />
    {/* BL-058 REQ-4: PriorityStars 直下のヘルプラベル */}
    <span className="day-view__form__priority-hint">↑タップで選択</span>
  </div>

  <div className="day-view__form__name">
    <label htmlFor="task-name">タスク名</label>
    <input
      id="task-name"
      type="text"
      value={name}
      onChange={(e) => setName(e.target.value)}
      required
    />
  </div>

  <button type="submit" className="day-view__form__submit">追加</button>
</form>
```

#### tomorrow-view 側の起票フォーム JSX (REQ-6 後)

today-view と同等. ただし id prefix は `tomorrow-create`, label の htmlFor / id は `tomorrow-task-name` / `tomorrow-task-priority-label`, aria-label は `"明日のタスク起票フォーム"`.

#### CSS 側 (`web/src/ui/day-view/day-view.css` の `.day-view__form` 更新後)

```css
.day-view__form {
  /* BL-058: 2D グリッド配置 (REQ-1 / D-001). */
  display: grid;
  grid-template-areas:
    "project priority"
    "name name"
    ". submit";
  grid-template-columns: 1fr auto;
  gap: var(--space-md);
  /* BL-054 visual 4 宣言を保持 (REQ-2 / NFR-BL054-PRESERVE). */
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-md);
}

.day-view__form__project {
  grid-area: project;
}

.day-view__form__priority {
  grid-area: priority;
  /* PriorityStars と hint を縦並びで配置するための minimal layout. */
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.day-view__form__priority-hint {
  /* 視覚的補助テキスト. font-size / color は将来 BL で調整可能. */
}

.day-view__form__name {
  grid-area: name;
}

.day-view__form__submit {
  grid-area: submit;
  justify-self: end;
}
```

### 例外 / エラー処理

本 BL は presentation 層の layout 変更のため, 新規例外経路は無い. 既存の createMutation / updateMutation 等のエラーフローは無改修.

### 重要な決定

spec.md の D 章を参照. ここでは plan 固有の決定を追記する.

- **P-001 (CSS の宣言順序)**: `.day-view__form` 内の宣言順序は「layout (display / grid-template-* / gap) → visual (background / border / border-radius / padding)」の順で揃える. BL-052 / BL-054 / BL-057 で踏襲されている順序方針と整合.
- **P-002 (新規クラス命名)**: `.day-view__form__<role>` の BEM Element 命名で揃える. 既存 `.day-view__card__header` / `.day-view__card__title` / `.day-view__card__actions` (BL-057) と同じスタイル.
- **P-003 (ヘルプラベル位置の DOM 順)**: JSX 上は PriorityStars の**直下** (= 次の sibling) に置く. spec REQ-4 通り. 親 `.day-view__form__priority` は `display: flex; flex-direction: column` で縦並び (PriorityStars + hint の 2 要素).
- **P-004 (id="task-priority-label" の保持)**: 旧 JSX で `<span id="task-priority-label">優先度</span>` がある. 既存テストが id を参照していないか確認しつつ, 影響が無ければ保持して新規ラップ要素 `.day-view__form__priority` 内に同居させる (= 余計な DOM 削除を避け既存テストへの影響を最小化).
- **P-005 (test ファイル拡張子 .tsx)**: jsdom DOM レンダを使うため `.tsx`. CSS 直読み部分も同ファイル内に同居させる (BL-057 と同じスタイル).
- **P-006 (BL-054 form-card-design.test.ts への追従)**: BL-054 test の AC-2 は `.day-view__form` 内に `display: flex` / `flex-direction: column` / `gap: var(--space-sm)` を assert している. 本 BL でこの 3 宣言は撤去されるため, BL-054 test の AC-2 は **本 BL のスコープで「expectation を新値に追従修正する」必要がある**. 具体的には:
  - `display: flex` → `display: grid`
  - `flex-direction: column` → 撤去 (assert を削除 or `grid-template-areas` 確認に置換)
  - `gap: var(--space-sm)` → `gap: var(--space-md)`
  追従修正は本 BL のスコープ内で行う (= form-card-design.test.ts は BL-054 の visual 保持 assert としては引き続き有効, ただし layout 系 assert は本 BL の値に追随させる).

## リスク / 代替案

### リスク

- **R-001 (BL-054 visual 4 宣言の意図せぬ削除)**: layout 変更時に visual 4 宣言を誤って削除してしまうリスク. 緩和策: AC-5 で「visual 4 宣言が含まれる」ことを CSS 直読みで assert (D-009).
- **R-002 (PriorityStars / ProjectToggle 本体への意図せぬ変更)**: ヘルプラベル追加の文脈で PriorityStars 本体を改修してしまうリスク. 緩和策: AC-11 で priority-stars.tsx / project-toggle.tsx の prop API 維持を assert (D-010).
- **R-003 (既存テストの label 紐付けが壊れる)**: タスク名 label/input の htmlFor + id を誤って撤去すると `getByLabelText("タスク名")` が落ちる. 緩和策: AC-10 で label/input 関連付け維持を assert (D-004).
- **R-004 (focus-view への visual 漏洩)**: focus-view.css に `.day-view__form` 系セレクタが混入するリスク. 緩和策: AC-13 で focus-view.css 不変を assert.
- **R-005 (既存 form-card-design.test.ts の retreat)**: BL-054 test の AC-2 は本 BL で値が変わるため追従修正が必要. P-006 で対応方針を確定.
- **R-006 (a11y violations の発生)**: ヘルプラベル `<span>` 追加で WCAG 違反が出るリスクは低いが, 念のため AC-17 で 0 件維持を担保.
- **R-007 (E2E `today-view-create-form.spec.ts` の retreat)**: 既存 E2E が DOM 構造の特定 path (sibling 順序など) に依存していると本 BL の JSX 再構成で壊れる. 緩和策: E2E は role + accessibleName ベースで取得する想定だが, 実際に retreat が出たら最小限の追従修正で対応.

### 代替案

- **代替案 A (CSS Subgrid の利用)**: PriorityStars + ヘルプラベルの縦並びを subgrid で表現する案. ブラウザサポートと将来の柔軟性のメリットはあるが, シンプルな縦並び (flex column) で十分なため不採用.
- **代替案 B (共通 component 化)**: today / tomorrow の起票フォーム JSX を `<DayViewCreateForm dueDate="today" | "tomorrow" />` 等に抽象化. DRY は改善するが props 設計と state 境界の判断が増えるため本 BL のスコープを超える. D-007 で不採用.
- **代替案 C (PriorityStars コンポーネントを改修してヘルプを内蔵)**: `<PriorityStars hint="↑タップで選択" />` のような新 prop を追加. PriorityStars の prop API が変わり, BL-040 の test や他の使用箇所 (`.day-view__card__title` 内の星) にも影響が及ぶ. NFR-COMPONENT-API-FROZEN に反するため不採用 (D-002).
- **代替案 D (`grid-template-areas` を `submit submit` で submit 行全幅)**: AC-1 別案. `. submit` で十分なため不採用 (D-001).
- **代替案 E (タスク名 label を `.visually-hidden` で視覚的に隠す)**: モック画像の見た目に近づくが, accessible name は保たれる. 本 BL のスコープを「2D 配置のみ」に絞るため見送り. 将来 BL の余地.

## テスト方針

> 全体方針は [`../../quality/test-catalog.md`](../../quality/test-catalog.md).

### 新規テスト (`web/__tests__/task-form-grid-layout.test.tsx`)

CSS 直読み + jsdom DOM レンダの 2 系統で AC-1 〜 AC-18 を網羅する. BL-054 (`form-card-design.test.ts`) / BL-057 (`task-card-zone-layout.test.tsx`) と同じ実装スタイル (`extractRuleBody` ヘルパを再定義).

#### (a) CSS 直読み系 assert

- AC-1: `.day-view__form` ルール本文に `display: grid` 宣言が存在し `flex-direction` 宣言が存在しない.
- AC-2: `.day-view__form` ルール本文に `grid-template-areas` が定義され, `"project priority"` / `"name name"` / `". submit"` の 3 行を含む.
- AC-3: `.day-view__form` ルール本文に `grid-template-columns: 1fr auto` 宣言が存在.
- AC-4: `.day-view__form` ルール本文に `gap: var(--space-md)` が存在し `gap: var(--space-sm)` が存在しない.
- AC-5: `.day-view__form` ルール本文に BL-054 visual 4 宣言が依然として含まれる (`background: var(--color-bg)` / `border: 1px solid var(--color-border)` / `border-radius: var(--radius-md)` / `padding: var(--space-md)`).
- AC-6: `.day-view__form__project` / `.day-view__form__priority` / `.day-view__form__name` / `.day-view__form__submit` ルール本文に対応する `grid-area: <role>` 宣言が存在.
- AC-7: `.day-view__form__submit` ルール本文に `justify-self: end` が存在.
- AC-12: tokens.css に本 BL で参照する `--space-md` / `--space-sm` トークンが定義されている (= 既存トークンを誤って撤去していない).
- AC-13: focus-view.css に `.day-view__form` 系セレクタが含まれない.
- AC-14: `.day-view__card` / `.day-view__card__header` / `.day-view__card__title` / `.day-view__card__actions` / `.day-view__card--focus` / `.project-chip` のルール本文が BL-057 完了時点の宣言を保持している (本 BL での書き換えが無い).
- AC-18: `.day-view__form` 系セレクタ全般で `box-shadow` / `transition` / `animation` / `:hover` / `:focus-within` が無い.

#### (b) jsdom DOM レンダ系 assert

- AC-8: today-view を render し, 起票フォーム (`<form aria-label="タスク起票フォーム">`) 内に「↑タップで選択」テキストが存在.
- AC-9: tomorrow-view を render し, 起票フォーム (`<form aria-label="明日のタスク起票フォーム">`) 内に「↑タップで選択」テキストが存在.
- AC-10: today / tomorrow 双方で `getByLabelText("タスク名")` が input を返し, 対応する htmlFor / id 関係が維持されている.

#### (c) PriorityStars / ProjectToggle 無改修 assert (CSS と同じ readFileSync 方式)

- AC-11: priority-stars.tsx / project-toggle.tsx が存在し, `export interface PriorityStarsProps` / `export interface ProjectToggleProps` の export が含まれる (= 型定義が消えていない).

### 既存テストへの追従

- **`web/__tests__/form-card-design.test.ts` (BL-054)**: AC-2 の「`display: flex` / `flex-direction: column` / `gap: var(--space-sm)` の維持」assert は本 BL で値が変わるため追従修正が必要 (P-006). 具体的には:
  - `display: flex` 期待 → `display: grid`
  - `flex-direction: column` 期待 → 撤去
  - `gap: var(--space-sm)` 期待 → `gap: var(--space-md)`
  - visual 4 宣言の AC-1 / AC-4 (box-shadow 無し全体) / AC-7 (他セレクタ不変) は引き続き有効.
- **`web/__tests__/today-view.test.tsx` / `tomorrow-view.test.tsx`**: DOM 取得方法は accessibleName / role / id ベースが主で, layout (`display: flex` 等) を直接 assert する箇所は無い想定. ただし `<div>` のラップ構造が変わるため `closest` / `parentElement` で位置関係を確認している箇所がある場合は追従修正が必要.
- **`web/__tests__/unified-day-view.test.tsx`**: 同上. label / role / accessibleName ベースで取得していれば無修正.
- **`web/__tests__/task-card-design.test.ts` (BL-052) / `project-chip.test.tsx` (BL-056) / `task-card-zone-layout.test.tsx` (BL-057)**: 本 BL の差分はフォーム側のみ. タスクカード側 assert は無修正で通る想定.
- **`web/__tests__/priority-stars.test.tsx` (BL-040) / `project-toggle.test.tsx` (BL-041)**: コンポーネント本体は無改修. 無修正で通る想定.

### E2E への追従

- **`e2e/today-view-create-form.spec.ts` (BL-039 関連)**: input 取得が `getByLabel("タスク名")` 等 accessibleName ベースなら無修正で通る想定. 壊れた場合のみ最小限の追従修正.
- **`e2e/tasks.spec.ts` / `state-restoration.spec.ts` 等**: 起票フォームの input 取得を含むテストは accessibleName ベースなら無修正. 起票後のタスク一覧側は本 BL の影響外.
- **`e2e/a11y.spec.ts`**: WCAG 2.1 AA スキャンで violations 0 件維持を確認 (AC-17).

### 重点的に確認すること

- BL-054 visual 4 宣言が依然として `.day-view__form` ルール本文に存在することを assert (R-001 緩和).
- PriorityStars / ProjectToggle の prop API が変わっていないことを assert (R-002 緩和).
- タスク名 label/input 紐付けが保たれていることを `getByLabelText` で確認 (R-003 緩和).
- focus-view.css に `.day-view__form` 系の混入が無いことを assert (R-004 緩和).
- BL-054 form-card-design.test.ts の retreat 修正が AC-1 (visual 4 宣言) を壊していないことを確認 (R-005 緩和).
- a11y E2E が引き続き violations 0 件であることを確認 (R-006 緩和).
