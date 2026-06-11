# 仕様: TaskCard / TaskFormCard 実機遺漏の一括 hotfix (task-card-hotfix)

- 状態: 確定
- 関連:
  - [`../../planning/backlog.md`](../../planning/backlog.md) BL-063
  - 直接の親 BL: BL-059 (`task-card-component`) — 本 BL は BL-059 の hotfix.
  - 依存 BL: BL-040 (priority-star-ui) / BL-041 (project-toggle-ui) / BL-042 (task-card-actions) / BL-043 (set-focus-gesture) / BL-046 (design-tokens) / BL-051 (unified-day-view) / BL-052 (task-card-design) / BL-054 (form-card-design) / BL-056 (project-chip) / BL-057 (task-card-zone-layout) / BL-058 (task-form-grid-layout) / BL-059 (task-card-component)
  - 関連 feature:
    - [`../task-card-component/spec.md`](../task-card-component/spec.md) (BL-059) — 本 BL の親. 同 spec の V-1 / V-3 / V-4 / V-5 / V-7 は維持し, V-2 (actions 中央揃え) のみ本 BL で **置き換える**.
    - [`../project-chip/spec.md`](../project-chip/spec.md) (BL-056) — `.project-chip` クラス本体は無改修. 起票カード内での font-size 適用問題 (CSS specificity 競合) を本 BL で解消する.
    - [`../project-toggle-ui/spec.md`](../project-toggle-ui/spec.md) (BL-041) — `.project-toggle__button` クラスの font-size: 1rem が `.project-chip` の `--font-size-small` に勝っている状況を解消する. ProjectToggle コンポーネント本体は無改修.
    - [`../priority-star-ui/spec.md`](../priority-star-ui/spec.md) (BL-040) — PriorityStars 本体は無改修.
  - 上位要件: NFR-010 (一貫した UI) / FR-001 (タスク起票) / FR-012 (現在のタスク強調)
  - モックアップ: `local/image.png`

## 背景 / 課題

BL-059 (`task-card-component`) で `<TaskCard>` / `<TaskFormCard>` を新設し, モックアップ通りの visual (V-1 〜 V-7) を反映した. しかし実機 (`npm run dev`) で確認したところ, 以下 5 件の遺漏が顕在化した. 本 BL は BL-059 の hotfix としてこれら 5 件を**一括解消**する.

### 修正対象 5 件

#### 修正 1: PriorityStars の右固定 (project 未設定タスクで星が左に寄る)

現状の `.task-card__header` は `justify-content: space-between` で「chip 左 + PriorityStars 右」を成立させている. しかし project 未設定 (= chip 要素が DOM に存在しない) のタスクカードでは, header 段の子要素が PriorityStars 単独となり, space-between が機能せず**星が左に寄る**.

user 要求: 「project の有無に関わらず, PriorityStars は header 段の常に右」.

#### 修正 2: TaskCard actions のボタン配置 (両端 + 中間中央)

現状の `.task-card__actions` は BL-059 V-2 で `justify-content: center` (= 全ボタン中央寄せ). しかしモックアップとの実機照合の結果, user の真の要求は以下に確定:

- 「削除」 button: 左端
- 「完了」 button: 右端
- 中間ボタン (= 「現在のタスクにする」「明日にする」/「今日にする」): 中央寄り
- focus-view (`actionSet="minimal"`): 削除 (左) + 完了 (右) の 2 ボタンが両端 (= space-between 相当)

つまり BL-059 V-2 (actions 中央揃え) は本 BL で**置き換える**.

#### 修正 3: 起票カードのプロジェクト名 chip の font が大きすぎる

`.project-chip` (BL-056) は `font-size: var(--font-size-small)` (= 14px) を持つ. 起票カードの ProjectToggle (BL-041) は同一 button 要素に `.project-toggle__button` と `.project-chip` の 2 クラスを併記している (BL-056 の D-004 で確定).

しかし `.project-toggle__button` は `font-size: 1rem` (= 16px) を持ち, 両セレクタはセレクタ specificity が等しい (= クラス 1 個ずつ). CSS のカスケード規則では specificity が等しい場合は**読み込み順で後勝ち**となる. `main.tsx` の CSS import 順は不明だが, 結果として **`.project-toggle__button` の 16px が `.project-chip` の 14px に勝っている**状態.

user 要求: 起票カード内の chip テキストは BL-056 が確定した `--font-size-small` (14px) で表示されること (= タスクカードの chip と font-size が一致すること).

#### 修正 4: 起票カードのタスク名 label のプレースホルダ化

現状 `<TaskFormCard>` の title 段は `<label htmlFor={inputId}>タスク名</label><input id={inputId} ... />` の構造. label 「タスク名」と input が縦並び (or 横並び) で **2 つの要素**として描画されている.

user 要求: 「『タスク名』表記は input の **placeholder で薄く** 表示し, 専用の label 要素は視覚的に出さない」. ただし a11y の `<label htmlFor>` ↔ `<input id>` 関連付け (NFR-LABEL-PRESERVE) は維持する.

#### 修正 5: 起票カードの「追加」ボタンを右端

現状 `.task-card__actions` は `justify-content: center` で「追加」 button が中央. user 要求: 起票カードの「追加」 button は**右端**.

これは修正 2 の TaskCard actions 配置とは別ルール. 「タスク操作 = 両端 (削除左 / 完了右), 起票 = 右端 (= 主要 CTA としてのコンベンション)」というモックアップ意図に基づく.

### 採用方針 (user と合意済み)

- 修正は **CSS の追加 / 上書き** と **`TaskFormCard` の JSX 微修正** (= label のプレースホルダ化) のみ.
- `<TaskCard>` / `<TaskFormCard>` の**コンポーネント API (props) は無改修**. 既存 view (today / tomorrow / focus) の呼び出し側変更も無し.
- `tokens.css` は**無改修**. 例外として `.visually-hidden` 1 クラスのみ追加位置を spec で確定する (= 後述 D-004).
- BL-059 で確定した V-1 / V-3 / V-4 / V-5 / V-7 は**維持**. V-2 (actions 中央揃え) のみ本 BL で**置き換える**.
- 過去 BL の不変性 (`.day-view__card` / `.day-view__form` 撤去確認 / `.project-chip` ルール本文 / PriorityStars / ProjectToggle prop API 等) は維持.

## ゴール / 非ゴール

### ゴール

- **G-1 (PriorityStars 右固定)**: project 未設定タスクでも PriorityStars が header 段の右に配置される (修正 1 / D-001).
- **G-2 (TaskCard actions の両端 + 中間中央)**: `actionSet="full"` で削除が左端, 完了が右端, 中間ボタンが中央寄り. `actionSet="minimal"` で削除が左端, 完了が右端 (= 2 ボタン両端) (修正 2 / D-002).
- **G-3 (起票カード chip font 解消)**: 起票カード内の `.project-chip` テキストが `--font-size-small` (14px) で表示される (修正 3 / D-003).
- **G-4 (起票カード タスク名のプレースホルダ化)**: `<label>` を視覚的に非表示 (= a11y は維持) し, `<input>` に `placeholder="タスク名"` を表示. placeholder 色は `--color-fg-subtle` (= 薄く) (修正 4 / D-004).
- **G-5 (起票カード 追加 button 右端)**: `<form className="task-card task-card--form">` 内の `.task-card__actions` で「追加」 button が右端に配置される (修正 5 / D-005).
- **G-6 (BL-059 の不変項を維持)**: BL-059 確定の V-1 (border-width 3px) / V-3 (PriorityStars 右) / V-4 (タスク名中央 + h2) / V-5 (today から `<h2>` 撤去) / V-7 (input フォント拡大) は本 BL でも引き続き満たされる. 起票カードの 3 段ゾーン構造 (header / title / actions) と各 BL-059 セレクタの存在も維持.
- **G-7 (コンポーネント API 無改修)**: `<TaskCard>` / `<TaskFormCard>` の prop 型および各 view の呼び出し側は本 BL で**変更しない**.
- **G-8 (PriorityStars / ProjectToggle / project-chip 本体無改修)**: BL-040 / BL-041 / BL-056 の本体ルール (priority-stars.tsx / project-toggle.tsx / project-toggle.css の `.project-toggle__button` ルール / day-view.css の `.project-chip` ルール) は**改修しない**.
- **G-9 (tokens.css 無改修)**: `web/src/styles/tokens.css` を**変更しない**. `.visually-hidden` 用の `position` / `width` / `clip` 等は既存 token 不要のため新規 token 追加は発生しない.
- **G-10 (a11y 違反 0 件維持)**: `e2e/a11y.spec.ts` の WCAG 2.1 AA スキャンで violations 0 件を維持する.

### 非ゴール

- **ProjectCard / RoutineCard 系の改修**: BL-060 / BL-061 のスコープ.
- **PriorityStars / ProjectToggle 本体の prop API 改修**: G-8 で本体無改修を確定.
- **`.project-chip` ルール本文の改修**: BL-056 で確定済み. 本 BL は specificity の上書き宣言を**追加する**だけ (= ルール本文書き換えではない).
- **tokens.css への新規トークン追加**: G-9.
- **3 段ゾーン構造そのものの再設計**: BL-059 の 3 段ゾーン (header / title / actions) は維持. レイアウトの調整 (auto-margin / placeholder / right-align) のみ追加.
- **focus-view の機能変更**: actions の 2 ボタン制約 (BL-037 D-008 / NFR-FOCUS-VIEW-ACTIONS-2BTN) は引き続き維持.
- **server / domain / API / Repository / mutation / query**: 一切無改修.

## 要件

### 機能要件

- **REQ-1 (PriorityStars 右固定)** [修正 1 / G-1 / D-001]

  `<TaskCard>` の header 段で, project 有無に関わらず PriorityStars が常に右に配置されるようにする.

  - 1-1. `web/src/ui/task-card/task-card.tsx` の TaskCard において, `<PriorityStars />` を `<div className="task-card__header__priority">` で**ラップ**する.
  - 1-2. `web/src/ui/task-card/task-card.css` の `.task-card__header__priority` セレクタに `margin-left: auto` を当てて, header 段の余剰空間を吸収して右固定する.
  - 1-3. `.task-card__header` の `justify-content: space-between` は **維持**する (= chip 有り時の左右配置は引き続き機能する). chip 無し時は `margin-left: auto` により PriorityStars が右に押し出される.

- **REQ-2 (TaskCard actions の両端 + 中間中央)** [修正 2 / G-2 / D-002]

  `.task-card__actions` の `justify-content: center` (BL-059 V-2) を本 BL で**置き換える**.

  - 2-1. `web/src/ui/task-card/task-card.tsx` の TaskCard において, 「削除」 button に `className="task-card__actions__delete"` を, 「完了」 button に `className="task-card__actions__complete"` を付与する.
  - 2-2. `web/src/ui/task-card/task-card.css` の `.task-card__actions` のルール本文を以下に**書き換える**:
    - `justify-content: center` を**撤去**する (回帰防止 / AC-7 で assert).
    - 代わりに `justify-content: flex-start` または `justify-content: center` のいずれでもよいが, ボタン両端配置は子要素の auto-margin で実現する (D-002 採用案).
  - 2-3. `.task-card__actions .task-card__actions__delete` に `margin-right: auto` を当てる.
  - 2-4. `.task-card__actions .task-card__actions__complete` に `margin-left: auto` を当てる.
  - 2-5. 結果として `actionSet="full"` の 4 ボタン (削除 / 現在のタスクにする / 明日にする(今日にする) / 完了) では「削除 左端 / 中間 2 ボタン 中央寄り / 完了 右端」が成立する.
  - 2-6. `actionSet="minimal"` の 2 ボタン (削除 / 完了) では「削除 左端 / 完了 右端」(= space-between 相当) が成立する.
  - 2-7. `.task-card--form .task-card__actions` (= 起票カード) では REQ-5 が上書きで `justify-content: flex-end` を当てるため, この auto-margin パターンは**影響しない** (= 子に「追加」 button 1 つしか居ないため margin-right: auto / margin-left: auto を持つ button が無い).

- **REQ-3 (起票カード chip font 解消)** [修正 3 / G-3 / D-003]

  起票カードの `.project-chip` テキストが `--font-size-small` で表示されるよう, CSS specificity の競合を解消する.

  - 3-1. `web/src/ui/task-card/task-card.css` 内の `.task-card__header .project-chip` セレクタ (= specificity を 1 段引き上げた合成セレクタ) に `font-size: var(--font-size-small)` を明示的に当てる.
    - これにより `.project-toggle__button { font-size: 1rem }` (specificity = 1 class) より specificity が高く (= 2 class) なるため確実に勝つ.
  - 3-2. `day-view.css` の `.project-chip` 本体ルールは**変更しない** (NFR-CHIP-PRESERVE / G-8).
  - 3-3. `project-toggle.css` の `.project-toggle__button` 本体ルールも**変更しない** (G-8).
  - 3-4. タスクカード (TaskCard) 側の `<span className="project-chip">` (= 単独 chip 要素) は元々 `--font-size-small` で正しく描画されている. REQ-3 の上書きは specificity 強化のため**両方の用途に効く** (= タスクカード側でも `.task-card__header .project-chip` の specificity が当たり, font-size は引き続き 14px).

- **REQ-4 (起票カード タスク名のプレースホルダ化)** [修正 4 / G-4 / D-004]

  起票カードの `<label>タスク名</label>` を視覚的に隠し, `<input>` に placeholder を表示する.

  - 4-1. `web/src/ui/task-card/task-form-card.tsx` の `<label htmlFor={inputId}>タスク名</label>` に `className="visually-hidden"` を**追加**する.
  - 4-2. 同 `<input>` 要素に `placeholder="タスク名"` を**追加**する.
  - 4-3. `<label htmlFor>` ↔ `<input id>` の関連付け (= `inputId` prop) は**保持**する (NFR-LABEL-PRESERVE).
  - 4-4. `.visually-hidden` クラスは `web/src/ui/task-card/task-card.css` の末尾に**新規追加**する (D-004 採用案). project-toggle.css の既存 `[data-visually-hidden]` 属性セレクタとは別系統に保つ (= project-toggle.css は無改修).
    - 宣言は WCAG / `:not(:focus):not(:active)` 等の活性化条件を入れない簡易版で十分 (= label は常時非表示):
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
  - 4-5. placeholder 色は `.task-card__title input[type="text"]::placeholder` セレクタで `color: var(--color-fg-subtle)` を当てる (= 「薄く」表示).
  - 4-6. placeholder のフォントサイズは `.task-card__title` の `font-size: var(--font-size-h2)` (BL-059 V-7) を継承する. つまり placeholder も h2 サイズで表示される (= 入力後の文字と同サイズ).

- **REQ-5 (起票カード 追加 button 右端)** [修正 5 / G-5 / D-005]

  起票カード (`<form className="task-card task-card--form">`) の actions 段で「追加」 button を右端に配置する.

  - 5-1. `web/src/ui/task-card/task-card.css` に `.task-card--form .task-card__actions` セレクタを**新規追加**し, `justify-content: flex-end` を当てる.
  - 5-2. これは `.task-card__actions` の REQ-2 の本文 (= 削除 / 完了の auto-margin 両端配置) を起票カード用に**上書き**する.
  - 5-3. `.task-card--form .task-card__actions` 内の子は「追加」 button 1 つだけのため, `flex-end` で右端に配置される.
  - 5-4. 採用案は `justify-content: flex-end` (D-005). `space-between` 案は将来「キャンセル」 button 追加に備える代替案だが, 現時点で子が 1 つしか無いため `flex-end` が最小変更で要件を満たす.

- **REQ-6 (TaskCard / TaskFormCard コンポーネント API 無改修)** [G-7]

  本 BL では `<TaskCard>` / `<TaskFormCard>` の prop 型 (`TaskCardProps` / `TaskFormCardProps`) を**変更しない**. 各 view (today-view / tomorrow-view / focus-view) の呼び出し側コードも変更しない. 変更は内部 JSX (= className 追加, wrap div 追加, label class 追加, input placeholder 追加) のみ.

- **REQ-7 (PriorityStars / ProjectToggle / project-chip 本体無改修)** [G-8]

  以下のファイルは本 BL で**改修しない**:
  - `web/src/ui/priority-stars/priority-stars.tsx`
  - `web/src/ui/project-toggle/project-toggle.tsx`
  - `web/src/ui/project-toggle/project-toggle.css` (= `.project-toggle__button` ルールも `[data-visually-hidden]` ルールも無改修)
  - `web/src/ui/day-view/day-view.css` の `.project-chip` ルール本文

- **REQ-8 (tokens.css 無改修)** [G-9]

  `web/src/styles/tokens.css` を**変更しない**. 本 BL で参照する `--font-size-small` / `--font-size-h2` / `--space-md` / `--space-sm` / `--color-fg-subtle` 等は既に存在する.

- **REQ-9 (BL-059 不変項の維持)** [G-6]

  - `.task-card` 基底ルール (visual 4 宣言 + 3 段 layout) は変更しない.
  - `.task-card--focus` の `border-width: 3px` は変更しない.
  - `.task-card__header` の `justify-content: space-between` は変更しない (REQ-1 の `margin-left: auto` で chip 無し時の右固定を追加するのみ).
  - `.task-card__title` の `font-size: var(--font-size-h2)` / `justify-content: center` は変更しない.
  - `.task-card__title input[type="text"]` の `font: inherit` は変更しない.
  - `<TaskCard>` の 3 段ゾーン DOM 構造 (header / title / actions の 3 つの直下 div) は変更しない.
  - `<TaskFormCard>` の 3 段ゾーン DOM 構造は変更しない.
  - today-view から `<h2>現在のタスク</h2>` は引き続き存在しない (V-5).
  - 起票カードに「↑タップで選択」と「優先度」label span は引き続き存在しない (V-6).

### 非機能要件

- **NFR-API-FROZEN**: `<TaskCard>` / `<TaskFormCard>` の prop 型は無改修 (REQ-6 / G-7).
- **NFR-COMPONENT-API-FROZEN**: PriorityStars / ProjectToggle / project-chip 本体は無改修 (REQ-7 / G-8).
- **NFR-NO-NEW-TOKENS**: tokens.css は無改修 (REQ-8 / G-9).
- **NFR-CHIP-PRESERVE**: `.project-chip` のルール本文は無改修. BL-056 の不変性 assert (= AC-21 系) が引き続き green を維持.
- **NFR-LABEL-PRESERVE**: タスク名 `<label htmlFor>` ↔ `<input id>` の関連付けは保持. `getByLabelText("タスク名")` で input が取得可能.
- **NFR-NO-SHADOW**: `.task-card` 系 / 新規 `.visually-hidden` に `box-shadow` を追加しない.
- **NFR-NO-HOVER-TRANSITION**: `.task-card` 系に `:hover` / `transition` / `animation` を追加しない.
- **NFR-A11Y**: `e2e/a11y.spec.ts` の WCAG 2.1 AA で violations 0 件を維持 (G-10). label を visually-hidden にしても `htmlFor` 関連付けは保たれているため違反は出ない想定.
- **NFR-FOCUS-VIEW-ACTIONS-2BTN**: focus-view の actions は「削除 / 完了」の 2 ボタンのみ (BL-037 D-008 / BL-059 NFR 維持).
- **NFR-COMPAT**: サーバ API / domain / Repository / mutation / query / ConflictDialog / notifyError 経路は無改修.

## 受け入れ基準

> 書き方は [`../../quality/acceptance-criteria.md`](../../quality/acceptance-criteria.md) に従う.
> 検証コマンドはルートからの `npm test` を基準とする.

```
シナリオ AC-1: .task-card__header__priority が PriorityStars を右固定するための margin-left: auto を持つ (REQ-1 / D-001)
  Given web/src/ui/task-card/task-card.css を開いた
  When  .task-card__header__priority セレクタのルール本文を観察する
  Then  margin-left: auto の宣言を含む
```

```
シナリオ AC-2: <TaskCard> が PriorityStars を .task-card__header__priority でラップする (REQ-1)
  Given <TaskCard showPriority={true} project={null} ... /> を render する (= chip 無し)
  When  出力 DOM を観察する
  Then  .task-card__header 内に .task-card__header__priority 要素が存在する
   かつ .task-card__header__priority 内に role="radiogroup" (= PriorityStars) が存在する
   かつ chip 要素 (.project-chip) は存在しない
```

```
シナリオ AC-3: project 未設定タスクで PriorityStars が右に配置される (REQ-1 / G-1)
  Given <TaskCard showPriority={true} project={null} ... /> を render し DOM を観察する
  When  .task-card__header__priority の computed style (jsdom では margin-left のみ) を確認する
  Then  margin-left が "auto" に解決される
   (補足: jsdom の getComputedStyle は CSS 変数解決が限定的だが, "auto" は文字列で観測可能)
```

```
シナリオ AC-4: .task-card__actions の justify-content: center が撤去されている (REQ-2 / 回帰防止 / V-2 置換)
  Given web/src/ui/task-card/task-card.css を開いた
  When  .task-card__actions セレクタのルール本文を観察する
  Then  justify-content: center の宣言を含まない
   かつ justify-content: flex-end の宣言を含まない
```

```
シナリオ AC-5: .task-card__actions__delete に margin-right: auto が当たる (REQ-2 / D-002)
  Given web/src/ui/task-card/task-card.css を開いた
  When  .task-card__actions__delete (または .task-card__actions .task-card__actions__delete) セレクタのルール本文を観察する
  Then  margin-right: auto の宣言を含む
```

```
シナリオ AC-6: .task-card__actions__complete に margin-left: auto が当たる (REQ-2 / D-002)
  Given web/src/ui/task-card/task-card.css を開いた
  When  .task-card__actions__complete (または .task-card__actions .task-card__actions__complete) セレクタのルール本文を観察する
  Then  margin-left: auto の宣言を含む
```

```
シナリオ AC-7: <TaskCard> の actionSet="full" で 削除 button と 完了 button に hotfix className が付与される
  Given <TaskCard actionSet="full" showSetFocus={true} ... /> を render する
  When  出力 DOM を観察する
  Then  「削除」 button に className "task-card__actions__delete" が含まれる
   かつ 「完了」 button に className "task-card__actions__complete" が含まれる
   かつ 「現在のタスクにする」「明日にする」 button にはこれらの className が含まれない
```

```
シナリオ AC-8: <TaskCard> の actionSet="minimal" でも 削除 / 完了 に hotfix className が付与される (focus-view 経路)
  Given <TaskCard actionSet="minimal" showSetFocus={false} ... /> を render する
  When  出力 DOM を観察する
  Then  「削除」 button に className "task-card__actions__delete" が含まれる
   かつ 「完了」 button に className "task-card__actions__complete" が含まれる
   かつ 「明日にする」「今日にする」「現在のタスクにする」 button が存在しない
```

```
シナリオ AC-9: .task-card__header .project-chip に font-size: var(--font-size-small) が specificity 強化で当たる (REQ-3 / 修正 3)
  Given web/src/ui/task-card/task-card.css を開いた
  When  .task-card__header .project-chip セレクタのルール本文を観察する
  Then  font-size: var(--font-size-small) の宣言を含む
```

```
シナリオ AC-10: 起票カード内の ProjectToggle button の font-size が --font-size-small で計算される (REQ-3 / 修正 3)
  Given <TaskFormCard projects=[{id:"p1",name:"仕事"}] projectId="p1" ... /> を render する
  When  ProjectToggle の <button class="project-toggle__button project-chip"> の computed style を観察する
  Then  font-size が 14px (= var(--font-size-small)) に解決される
   (補足: 検証手段は jsdom 計算 or テスト用 stylesheet 注入. test-designer で実装可能性を確定)
```

```
シナリオ AC-11: .visually-hidden クラスが task-card.css に定義されている (REQ-4 / D-004)
  Given web/src/ui/task-card/task-card.css を開いた
  When  .visually-hidden セレクタのルール本文を観察する
  Then  position: absolute の宣言を含む
   かつ width: 1px の宣言を含む
   かつ height: 1px の宣言を含む
   かつ clip: rect(0, 0, 0, 0) (または等価) の宣言を含む
   かつ overflow: hidden の宣言を含む
```

```
シナリオ AC-12: <TaskFormCard> の label に visually-hidden クラスが付与され input に placeholder="タスク名" が付与される (REQ-4)
  Given <TaskFormCard inputId="task-name" ... /> を render する
  When  出力 DOM を観察する
  Then  <label for="task-name"> 要素に className "visually-hidden" が含まれる
   かつ <label> のテキストは「タスク名」である (= a11y accessibleName 維持)
   かつ <input id="task-name"> に placeholder="タスク名" が含まれる
   かつ getByLabelText("タスク名") で input が取得可能 (NFR-LABEL-PRESERVE)
```

```
シナリオ AC-13: .task-card__title input[type="text"]::placeholder に color: var(--color-fg-subtle) が当たる (REQ-4 / 4-5)
  Given web/src/ui/task-card/task-card.css を開いた
  When  .task-card__title input[type="text"]::placeholder セレクタのルール本文を観察する
  Then  color: var(--color-fg-subtle) の宣言を含む
```

```
シナリオ AC-14: .task-card--form .task-card__actions に justify-content: flex-end が当たる (REQ-5 / D-005)
  Given web/src/ui/task-card/task-card.css を開いた
  When  .task-card--form .task-card__actions セレクタのルール本文を観察する
  Then  justify-content: flex-end の宣言を含む
```

```
シナリオ AC-15: 起票カードの「追加」 button が <form class="task-card task-card--form"> 内に 1 つだけ存在する (REQ-5)
  Given <TaskFormCard ... /> を render する
  When  ルート <form> の .task-card__actions 内の button を観察する
  Then  type="submit" かつテキスト「追加」の button が 1 つ存在する
   かつ それ以外の button は .task-card__actions 内に存在しない
```

```
シナリオ AC-16: <TaskCard> / <TaskFormCard> の prop 型に変更が無い (NFR-API-FROZEN / G-7)
  Given web/src/ui/task-card/task-card.tsx と web/src/ui/task-card/task-form-card.tsx を開いた
  When  TaskCardProps と TaskFormCardProps の export 型を観察する
  Then  本 BL の前後で TaskCardProps の 14 フィールド (task / project / variant / showPriority /
        showSetFocus / actionSet / dueDateMode / onSetPriority / onSetFocus / onDelete /
        onToggleDueDate / onComplete / as / aria-label) に差分が無い
   かつ TaskFormCardProps の 11 フィールド (projects / projectId / onProjectIdChange / priority /
        onPriorityChange / name / onNameChange / onSubmit / idPrefix / inputId / formAriaLabel) に差分が無い
```

```
シナリオ AC-17: PriorityStars / ProjectToggle / project-chip 本体が無改修 (NFR-COMPONENT-API-FROZEN / G-8)
  Given web/src/ui/priority-stars/priority-stars.tsx,
        web/src/ui/project-toggle/project-toggle.tsx,
        web/src/ui/project-toggle/project-toggle.css,
        web/src/ui/day-view/day-view.css の .project-chip ルールを観察する
  When  ファイル本文を観察する
  Then  PriorityStarsProps / ProjectToggleProps の export 型に差分が無い
   かつ .project-toggle__button ルール本文に差分が無い
   かつ .project-chip ルール本文 (border / border-radius / padding / font-size / color の 5 宣言) に差分が無い
```

```
シナリオ AC-18: tokens.css が無改修 (NFR-NO-NEW-TOKENS / G-9)
  Given 本 BL の実装がマージされた
  When  web/src/styles/tokens.css を BL-059 完了時点と比較する
  Then  差分が無い
```

```
シナリオ AC-19: focus-view の actions が「削除」「完了」の 2 ボタンのみで両端に配置される (NFR-FOCUS-VIEW-ACTIONS-2BTN / G-2)
  Given /focus を render する (focusedTask あり)
  When  .task-card__actions 内の button を観察する
  Then  「削除」 button が存在し className "task-card__actions__delete" を持つ
   かつ 「完了」 button が存在し className "task-card__actions__complete" を持つ
   かつ 「明日にする」 / 「今日にする」 / 「現在のタスクにする」 button が存在しない
```

```
シナリオ AC-20: BL-059 の V-1 / V-3 / V-4 / V-5 / V-7 不変項が維持される (G-6 / REQ-9)
  Given web/src/ui/task-card/task-card.css と各 view の tsx を開いた
  When  各セレクタ / 各 view のソースを観察する
  Then  .task-card--focus { border-width: 3px } が引き続き存在する (V-1)
   かつ .task-card__header { justify-content: space-between } が引き続き存在する (V-3)
   かつ .task-card__title { justify-content: center; font-size: var(--font-size-h2) } が引き続き存在する (V-4)
   かつ today-view.tsx に <h2>現在のタスク</h2> 文字列が引き続き存在しない (V-5)
   かつ .task-card__title input[type="text"] { font: inherit } が引き続き存在する (V-7)
   かつ task-form-card.tsx に「↑タップで選択」テキストと id="task-priority-label" / "tomorrow-task-priority-label" が引き続き存在しない (V-6)
```

```
シナリオ AC-21: タスク名 label/input 関連付けが保持される (NFR-LABEL-PRESERVE / REQ-4-3)
  Given /today と /tomorrow を render する
  When  起票フォームを観察する
  Then  /today に <label htmlFor="task-name"> と <input id="task-name"> が共存する
   かつ /tomorrow に <label htmlFor="tomorrow-task-name"> と <input id="tomorrow-task-name"> が共存する
   かつ getByLabelText("タスク名") で input が取得可能
```

```
シナリオ AC-22: .task-card 系セレクタに :hover / transition / animation / box-shadow が引き続き無い (NFR-NO-HOVER-TRANSITION / NFR-NO-SHADOW)
  Given web/src/ui/task-card/task-card.css を開いた
  When  ファイル全体を観察する
  Then  box-shadow キーワードを含む宣言が存在しない
   かつ transition 宣言が存在しない
   かつ animation 宣言が存在しない
   かつ .task-card:hover / .task-card__header:hover / .task-card__title:hover / .task-card__actions:hover 等の :hover セレクタが存在しない
```

```
シナリオ AC-23: 既存単体テスト全件 green (BL-059 のテスト追従後)
  Given /today /tomorrow /focus が引き続きレンダリング可能
  When  ルートから npm test (vitest 単体テスト全件) を実行する
  Then  すべて green である
   かつ task-card-component.test.tsx の既存 AC-5 (= 旧 V-2 / actions center assert) は本 BL の新ルール (削除左 / 完了右) に追従修正されて green
   かつ task-card-component.test.tsx の AC-7 (= 3 段ゾーンの DOM 構造) は引き続き green
```

```
シナリオ AC-24: 既存 E2E 全件 green
  Given Playwright が起動可能
  When  npx playwright test を実行する
  Then  すべて green である
   かつ role + accessibleName ベースの取得 (getByRole("button", { name: "削除" }) 等) が引き続き機能する
   かつ getByLabelText("タスク名") で起票フォーム input が取得可能
```

```
シナリオ AC-25: アクセシビリティ違反 0 件を維持する (NFR-A11Y / G-10)
  Given /today /tomorrow /focus をはじめとする全 view がレンダリング可能
  When  @axe-core/playwright で WCAG 2.1 AA をスキャンする (e2e/a11y.spec.ts の既存スキャン)
  Then  すべてのスキャンで violations.length === 0
   かつ label を visually-hidden にしても htmlFor 関連付けは保たれているため違反は出ない
```

## 重要な決定 (D 章)

- **D-001 (PriorityStars 右固定: wrap div + margin-left: auto 採用)**:
  - 候補:
    - (i) `<PriorityStars />` を `<div className="task-card__header__priority">` でラップし, ラップ div に `margin-left: auto` を当てる.
    - (ii) `.task-card__header` 全体を `justify-content: flex-end` に変更し, chip 専用に `margin-right: auto` を当てる.
    - (iii) CSS grid (`grid-template-columns: auto 1fr auto` 等) で配置を制御する.
  - 採用: (i) wrap div + `margin-left: auto`.
    - 理由: 既存の `justify-content: space-between` (BL-059 V-3) を**そのまま維持できる**. (= chip 有り時の挙動は保証されたまま, chip 無し時のみ auto-margin が効く).
    - (ii) は header の base 配置を反転する必要があり, chip 有り時の見た目を維持するために追加の調整が必要になる. 影響範囲が大きく不採用.
    - (iii) は grid 化により他の依存テスト (CSS 直読みで `display: flex` を assert している) との衝突リスクがある. 不採用.
  - 副作用: PriorityStars コンポーネント本体は無改修 (G-8 / NFR-COMPONENT-API-FROZEN). ラッパ div の追加のみ.
  - `aria-label` / role 等は wrap div に付与しない (= PriorityStars 内部の `role="radiogroup"` がそのまま accessibleName を保つ).

- **D-002 (TaskCard actions の両端配置: 個別 auto-margin 採用)**:
  - 候補:
    - (i) `.task-card__actions__delete { margin-right: auto }` + `.task-card__actions__complete { margin-left: auto }` の個別 auto-margin パターン. `.task-card__actions` 側は `justify-content` の値を不問にして子要素の margin で配置を決定.
    - (ii) `.task-card__actions { justify-content: space-between }` + 中間ボタンを `<div className="task-card__actions__center">` で wrap して中央寄せ.
    - (iii) CSS grid `grid-template-columns: auto 1fr auto` + 各ボタンに `grid-area` を割り当て.
  - 採用: (i) 個別 auto-margin パターン.
    - 理由: focus-view (`actionSet="minimal"` = 2 ボタン) と today-view (`actionSet="full"` + setFocus = 4 ボタン) で**同じ CSS ルール**を流用できる. 2 ボタン時は「削除 (margin-right: auto)」と「完了 (margin-left: auto)」の auto-margin が拮抗して両端配置, 4 ボタン時は中間 2 ボタンが間で中央寄りに浮く形になる.
    - (ii) は wrap div 追加が必要で TaskCard の JSX 構造をやや複雑化する. かつ「削除 / 完了 / 中間ボタン」の数が動的 (showSetFocus / actionSet / dueDateMode で変動) なため wrap 内の要素数も変動し, 中央寄せが視覚的に揺れる可能性がある. 不採用.
    - (iii) は grid 化により回帰リスクが大きい. 不採用.
  - 起票カードへの影響: `.task-card--form .task-card__actions` 内には「追加」 button 1 つのみで, `task-card__actions__delete` / `task-card__actions__complete` のいずれの className も含まれない. よって (i) の auto-margin パターンは作動せず, REQ-5 の `justify-content: flex-end` が単純に効く.

- **D-003 (起票カード chip font 解消: specificity 強化採用)**:
  - 原因の確定: `.project-chip` (specificity = 1 class = 0,1,0) と `.project-toggle__button` (specificity = 1 class = 0,1,0) は specificity が等しい. CSS のカスケード規則では specificity が等しい場合は**source order で後勝ち**となる. `main.tsx` で `project-toggle.css` が `day-view.css` (= `.project-chip` の定義元) の後にロードされている (or 同等の解決順序になっている) ため, `.project-toggle__button { font-size: 1rem }` が `.project-chip { font-size: var(--font-size-small) }` に勝つ状況.
  - 候補:
    - (i) `task-card.css` 内に `.task-card__header .project-chip { font-size: var(--font-size-small); }` を追加. specificity = 2 class = 0,2,0 で確実に勝つ.
    - (ii) `task-card.css` 内に `.project-toggle__button.project-chip { font-size: var(--font-size-small); }` を追加 (= 同一要素の 2 クラス併記による specificity 強化). 同じく 2 class.
    - (iii) `day-view.css` の `.project-chip` 本体ルールに `!important` を追加.
    - (iv) `main.tsx` の CSS import 順を変更し `day-view.css` を後ろに移動.
  - 採用: (i) `.task-card__header .project-chip` (= descendant combinator による specificity 強化).
    - 理由: 「起票カード内 (= `.task-card__header` の descendant) の chip 配置に対する font 強制」という**文脈に紐づいた**上書きとして意図が明確.
    - タスクカード側の `<span className="project-chip">` も `.task-card__header` 内に居るので同じ specificity 強化が当たる. これは「タスクカード側でも 14px が正」なので問題なし (= REQ-3-4 で確認).
    - (ii) は `.project-toggle__button` を含む合成セレクタになるため, ProjectToggle が他の文脈で使われた場合に副作用が出にくい一方, 「task-card 文脈」を明示する (i) よりカップリングが強い. 不採用.
    - (iii) は `!important` を新規導入する判断であり, 将来のメンテナンス時に「なぜここに important があるか」が分かりにくい. 影響範囲も拡散しすぎる. 不採用.
    - (iv) は `main.tsx` の import 順依存となり, 将来 import 順がリファクタで変わると問題が再発する. 構造的に脆い. 不採用.
  - 副作用: `.project-toggle__button` の `font-size: 1rem` ルールは day-view ヘッダ等の他箇所での ProjectToggle 使用時 (= 現状無し / 将来追加された場合) には引き続き有効. 本 BL の hotfix は起票カード文脈に限定される.

- **D-004 (`.visually-hidden` クラスの配置先: task-card.css 末尾採用)**:
  - 既存パターンの確認: `web/src/ui/project-toggle/project-toggle.css` に `[data-visually-hidden]` 属性セレクタが既に存在 (L55). しかし**クラスセレクタ `.visually-hidden`** は存在しない. project-toggle の live region 用に属性で実装されたもので, グローバルに「label を視覚的に隠すユーティリティ」として再利用できる形ではない.
  - 候補:
    - (i) `web/src/ui/task-card/task-card.css` の末尾に `.visually-hidden` クラスを新規追加.
    - (ii) `web/src/styles/utilities.css` を新規作成し, グローバル utility class として配置. `main.tsx` で import.
    - (iii) `web/src/styles/tokens.css` に追記.
    - (iv) `project-toggle.css` の `[data-visually-hidden]` を `[data-visually-hidden], .visually-hidden` に拡張.
  - 採用: (i) `task-card.css` 末尾に新規追加.
    - 理由: 本 BL のスコープ内で利用箇所は `<TaskFormCard>` の label 1 件のみ. **使う場所と定義する場所を近接させる**のが現状の todica の CSS 配置方針 (= ペア専用 CSS の原則).
    - (ii) は新規ファイル + 新規 import で影響が広い. user の「propose before creating」要望にも反する.
    - (iii) は tokens.css の責務 (= CSS variables) と異なる ruleset を混ぜることになり, 不適切.
    - (iv) は project-toggle.css に手を入れることになり, REQ-7 / G-8 (本体無改修) に違反する.
  - 副作用: `.visually-hidden` クラスは task-card.css 内の定義となるが, CSS のセレクタはグローバルスコープのため, 将来他コンポーネントから `<span className="visually-hidden">` で再利用できる. ただし**本 BL のスコープ外**として明示し, 必要になった BL 時点で utilities.css への移設を再検討する.

- **D-005 (起票カード「追加」 button 右端: justify-content: flex-end 採用)**:
  - 候補:
    - (i) `.task-card--form .task-card__actions { justify-content: flex-end }`.
    - (ii) `.task-card--form .task-card__actions { justify-content: space-between }`. 将来「キャンセル」 button が追加された時に「キャンセル左 / 追加右」が自動で成立.
  - 採用: (i) `flex-end`.
    - 理由: 現時点で子は「追加」 button 1 つのみ. (ii) を採用しても結果は同じ (= 右端) だが, 仕様意図 (= 「追加 button を右に置きたい」) が明確になるのは (i).
    - 将来「キャンセル」 button が追加される時は, その BL で `.task-card--form .task-card__actions` のルールを `space-between` に再変更すれば良い. 「未来のために今書いておく」より「明示的に書いて, 必要になったら変える」方が CSS の意図が読みやすい.

- **D-006 (テスト方針: 新規ファイル切り出し採用)**:
  - 候補:
    - (i) 既存 `web/__tests__/task-card-component.test.tsx` (BL-059 / 108 件) に hotfix 用 it を追加する.
    - (ii) 新規 `web/__tests__/task-card-hotfix.test.tsx` を切り出す.
  - 採用: (ii) 新規ファイル切り出し.
    - 理由: 本 BL の修正は BL-059 の AC-5 (V-2 / actions center) を**置き換える**ものであり, 旧 AC と新 AC が同じファイル内に同居すると意図の歴史が読みにくくなる.
    - 新規ファイルとして hotfix のスコープ (5 修正分) を明示できる方が後で参照しやすい.
    - ただし BL-059 の既存テストのうち AC-5 (= V-2 center assert) **だけは置き換え修正が必要** (D-007 参照). 他の AC は維持.
  - 既存 BL-059 テストのスタイル踏襲: `extractRuleBody` ヘルパ + CSS 直読み + jsdom DOM レンダの 2 系統 (BL-059 / D-011 を踏襲).

- **D-007 (BL-059 既存テストの追従修正)**:
  - 修正必須:
    - `web/__tests__/task-card-component.test.tsx` 内の AC-5 (= `.task-card__actions { justify-content: center }` を assert している箇所) を **削除** (or 新ルールに追従).
      - 新ルール: `.task-card__actions` 本体ルールに `justify-content: center` が含まれない. かわりに `.task-card__actions__delete { margin-right: auto }` / `.task-card__actions__complete { margin-left: auto }` が当たる.
      - 修正方法: 既存 it の「`justify-content: center` を含む」期待を「`justify-content: center` を含まない」期待に**逆転**させる. かつ「`justify-content: flex-end` を含まない」期待も維持 (= 回帰防止).
    - `web/__tests__/task-card-component.test.tsx` の AC-13 (= TaskFormCard の DOM 構造 assert) で `<label htmlFor={inputId}>タスク名</label>` が存在するという期待は維持. ただし label に `className="visually-hidden"` が追加されることで, 仮に「label のテキストが直接見える」前提の assert があれば追従が必要.
    - その他, BL-059 のテストで「actions ボタン中央配置」を assert している箇所があれば置き換え.
  - 修正不要 (= 引き続き green を維持):
    - `.task-card` 基底 / `.task-card--focus` / `.task-card__header` / `.task-card__title` / `.task-card__title input[type="text"]` の各 assert は本 BL で変更しない.
    - `.day-view__card` / `.day-view__form` / `.focus-view__card` 撤去確認 assert.
    - PriorityStars / ProjectToggle / project-chip 無改修 assert (NFR-COMPONENT-API-FROZEN / NFR-CHIP-PRESERVE).
    - tokens.css 無改修 assert (NFR-NO-NEW-TOKENS).
    - today-view から `<h2>現在のタスク</h2>` 撤去 assert (V-5).
    - 起票カードから「↑タップで選択」「優先度」label 撤去 assert (V-6).

## 未決事項 / 確認待ち

- なし (5 修正の意図, 採用方針, D-001 〜 D-007 の確定で本 BL のスコープ・実装方針は全て確定済み. 詳細な実装手順とテストの粒度は plan.md / tasks.md で確定する).
