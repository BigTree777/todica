# 仕様: 起票フォーム (.day-view__form) のレイアウトを 2D グリッド配置へ刷新 (task-form-grid-layout)

- 状態: 確定
- 関連:
  - [`../../planning/backlog.md`](../../planning/backlog.md) BL-058
  - 依存 BL: BL-035 (ui-redesign-foundation) / BL-039 (inline-create-form) / BL-040 (priority-star-ui) / BL-041 (project-toggle-ui) / BL-054 (form-card-design) / BL-056 (project-chip)
  - 関連 feature:
    - [`../form-card-design/spec.md`](../form-card-design/spec.md) — `.day-view__form` の visual 4 宣言. 本 BL は **layout のみ変更し visual 4 宣言は完全に保持** する.
    - [`../priority-star-ui/spec.md`](../priority-star-ui/spec.md) — `<PriorityStars />` コンポーネント. 本 BL は **コンポーネント本体を一切変更せず**, 直下にヘルプラベル「↑タップで選択」を新規追加するだけ.
    - [`../project-toggle-ui/spec.md`](../project-toggle-ui/spec.md) — `<ProjectToggle />` コンポーネント. 本 BL では無改修.
    - [`../inline-create-form/spec.md`](../inline-create-form/spec.md) — 起票フォームの構成要素 (タスク名 + プロジェクト + 優先度 + 追加) を確定した BL.
    - [`../project-chip/spec.md`](../project-chip/spec.md) — `.project-chip` クラス (本 BL では無改修).
    - [`../task-card-zone-layout/spec.md`](../task-card-zone-layout/spec.md) — タスクカード側の 3 段ゾーン化を行った直近 BL. 本 BL は同じ user 指摘に対する「フォーム側」の対応である.
    - [`../focus-view/`](../focus-view/) (BL-037) — `/focus` は起票フォームを持たないため本 BL の対象外.
  - 上位要件: NFR-010 (最小手数 / 一貫した UI), FR-001 (タスク起票)
  - モックアップ: `local/image.png`

## 背景 / 課題

BL-054 (form-card-design) で `.day-view__form` が縁・角丸・余白を備えたカードとして視覚的に成立した. しかしフォームの **内部レイアウト** は依然として `display: flex; flex-direction: column; gap: var(--space-sm)` のままで, ProjectToggle / タスク名 input / PriorityStars / 「追加」ボタンの 4 要素が**縦方向に 1 列で並ぶ**状態である.

モックアップ `local/image.png` の起票フォームは以下のような **2D 配置** で描かれている:

```
┌─────────────────────────────────────────────┐
│ ⌜プロジェクト名(トグル)⌟  │ ☆☆☆            │  ← 左上: ProjectToggle / 右上: PriorityStars
│                            │ ↑タップで選択   │
│                                             │
│             タスク名 (input 下線)           │  ← 中央 1 行: タスク名 input (全幅)
│                                             │
│                                    [追加]   │  ← 右下: 「追加」ボタン
└─────────────────────────────────────────────┘
```

### user 指摘 (要約)

- 起票フォームの中の各要素を **モックアップ通りの 2D 配置** にしてほしい.
- 特に「ProjectToggle と PriorityStars を同じ行 (上段) に並べる」「タスク名 input を独立した中段に置く」「『追加』ボタンは右下に置く」.
- PriorityStars の直下に「↑タップで選択」というユーザー誘導用のヘルプラベルを置く (モック上に明示されている).

= 起票フォームの内部レイアウトをモックアップに揃え, **2 列 × 3 段** の CSS Grid 配置にする, という主張.

### 方針の核

本 BL は **`.day-view__form` の layout プロパティのみを `display: flex` → `display: grid` に置き換える**. visual 4 宣言 (BL-054 で確定した `background` / `border` / `border-radius` / `padding`) は**完全に保持**する.

具体的には:

- `.day-view__form` を `display: grid; grid-template-areas: "project priority" "name name" ". submit"; grid-template-columns: 1fr auto; gap: var(--space-md)` に変更する (= layout 4 宣言).
- 旧 `display: flex; flex-direction: column; gap: var(--space-sm)` のうち, `display` と `flex-direction` は撤去する. `gap` は `var(--space-sm)` → `var(--space-md)` に引き上げ (画像の余白量に合わせる D-006).
- 各子要素に `grid-area` を割り当てる (`project` / `priority` / `name` / `submit`).
- BL-040 の `<PriorityStars />` 直下に新規ラベル「↑タップで選択」を **PriorityStars コンポーネント外** (= 起票フォーム JSX 内) に追加する. PriorityStars コンポーネントの prop API は無変更とする.
- today-view (`/today`) と tomorrow-view (`/tomorrow`) の起票フォーム JSX を, **両方それぞれ個別に書き換える** (= 共通 component 化はしない). 重複は許容する.

shadow / hover / transition / animation は BL-052 / BL-054 / BL-057 と同方針で**一切追加しない**.

## ゴール / 非ゴール

### ゴール

- **G-1 (起票フォームの 2D 配置化)**: `/today` と `/tomorrow` の起票フォーム (= `.day-view__form`) が CSS Grid による 2 列 × 3 段の 2D 配置で描画される. 上段に ProjectToggle (左) と PriorityStars + ヘルプラベル (右), 中段に全幅のタスク名 input, 下段右に「追加」ボタンが配置される.
- **G-2 (ヘルプラベルの新規追加)**: BL-040 の `<PriorityStars />` 直下に「↑タップで選択」のヘルプラベルが表示される. ラベルは PriorityStars と視覚的に一体として認識でき, かつ既存テストの label 紐付け (label-control association) を壊さない.
- **G-3 (BL-054 visual 4 宣言の保持)**: `.day-view__form` の `background: var(--color-bg)` / `border: 1px solid var(--color-border)` / `border-radius: var(--radius-md)` / `padding: var(--space-md)` は**完全に保持**される.
- **G-4 (PriorityStars / ProjectToggle 本体無改修)**: BL-040 の `<PriorityStars />` と BL-041 の `<ProjectToggle />` の **コンポーネント本体 (prop API / 内部 logic / class 名)** は一切変更しない. ヘルプラベルは PriorityStars の **外側** (= 起票フォーム JSX 内) に置く.
- **G-5 (tokens.css 無改修)**: 本 BL では `web/src/styles/tokens.css` を変更しない. 既存トークン (`--space-md` / `--space-sm` 等) のみで構成する.
- **G-6 (focus-view 無改修)**: `/focus` (focus-view) は起票フォームを持たないため対象外. focus-view.css / focus-view.tsx には触れない.
- **G-7 (タスクカード側無改修)**: BL-052 / BL-057 で確定した `.day-view__card` / `.day-view__card__header` / `.day-view__card__title` / `.day-view__card__actions` および `.project-chip` (BL-056) の visual / layout は無改修.
- **G-8 (DOM 構造の追加的変更のみ)**: 既存の DOM 要素 (input / select / button) は削除しない. ヘルプラベル `<span>` を 1 つ追加するだけにとどめる. 既存テストの accessibleName / role / id ベースの取得は無修正で通る.
- **G-9 (a11y 違反 0 件維持)**: `e2e/a11y.spec.ts` の WCAG 2.1 AA スキャンで violations 0 件を維持する.

### 非ゴール

- **focus-view (`/focus`) の visual / layout 変更**: focus-view は起票フォーム自体を持たないため対象外.
- **PriorityStars コンポーネント本体の変更**: prop API (groupLabel / idPrefix / value / onChange) や内部 DOM 構造に触れない. ヘルプラベルは PriorityStars の外側に置く (D-002).
- **ProjectToggle コンポーネント本体の変更**: 同上.
- **`.project-chip` クラスの変更**: BL-056 で確定済み. 本 BL では無改修.
- **`.day-view__card` 系の変更**: BL-057 で確定済み. 本 BL では無改修.
- **tokens.css への新規トークン追加**: 既存 `--space-md` / `--space-sm` 等で十分. 新規トークンは追加しない (D-007 と整合).
- **共通 component 化** (`<DayViewCreateForm />` の新設等): today-view / tomorrow-view 両方の起票フォーム JSX を共通化するとスコープが拡大する. 本 BL では個別書き換えにとどめる (D-007).
- **タスク名 input の visual 装飾** (下線スタイル / placeholder 文言の変更等): モック画像では下線付きの input が描かれているが, 本 BL では layout のみを対象とし, input 自体の visual (border / underline) はブラウザ既定または既存スタイルのまま維持する (= 過剰スコープ拡大の回避).
- **「追加」ボタンの visual 装飾**: ボタン自体の background / border / text color はブラウザ既定または既存スタイルのまま. 配置位置 (右下) のみ調整する.
- **hover 効果 / transition / animation / box-shadow**: 本 BL では追加しない.
- **サーバ API / domain / Repository / mutation / query / ConflictDialog / notifyError 経路**: 一切無改修.
- **既存 E2E (today-view-create-form.spec.ts 等) の積極的な追加**: 本 BL の差分は layout のみで, accessibleName / role / id ベースの input 取得は壊さない想定. 既存 E2E が壊れる場合のみ最小限の追従修正にとどめる.

## 要件

### 機能要件

- **REQ-1 (`.day-view__form` の layout 宣言変更)**

  `web/src/ui/day-view/day-view.css` の `.day-view__form` セレクタを以下の layout 宣言に変更する:

  - `display: grid` (旧 `display: flex` を置き換え)
  - `grid-template-areas: "project priority" "name name" ". submit"` (3 行 2 列)
  - `grid-template-columns: 1fr auto`
  - `gap: var(--space-md)` (旧 `gap: var(--space-sm)` を引き上げ. D-006)

  旧 `flex-direction: column` 宣言は撤去する (grid layout には不要).

- **REQ-2 (visual 4 宣言の保持)**

  `.day-view__form` の BL-054 由来の visual 4 宣言を**完全に保持**する:

  - `background: var(--color-bg)`
  - `border: 1px solid var(--color-border)`
  - `border-radius: var(--radius-md)`
  - `padding: var(--space-md)`

  これらは本 BL で削除・改変しない.

- **REQ-3 (各子要素への grid-area 割り当て)**

  起票フォーム内の 4 要素 + ヘルプラベルに以下の `grid-area` を割り当てる. 実装方式は CSS クラス (新規) で行う (D-005 と整合):

  - `<ProjectToggle />` をラップする要素 (= 既存 `<div>` または新規クラス付与): `grid-area: project`
  - `<PriorityStars />` + ヘルプラベルをラップする要素: `grid-area: priority`
  - タスク名 input をラップする要素 (= 既存 `<div>` または新規クラス付与): `grid-area: name`
  - 「追加」 button: `grid-area: submit` + `justify-self: end` (右寄せ. D-005)

- **REQ-4 (ヘルプラベル「↑タップで選択」の新規追加)**

  BL-040 の `<PriorityStars />` の**直下** (= JSX 上で隣接する次の要素) に, テキスト「↑タップで選択」を含む `<span>` 要素を追加する.

  - 要素タグ: `<span>` (D-002)
  - クラス: 専用クラス `.day-view__form__priority-hint` (または同等の限定的なクラス名) を付与する (D-002).
  - 配置位置: PriorityStars と同じ `grid-area: priority` 領域内. ラップ要素を作って中に PriorityStars と span を縦並びで入れる構造とする (D-002).
  - PriorityStars コンポーネント本体は無改修 (D-002).
  - a11y: 視覚的説明として表示し, `aria-describedby` での明示的紐付けは**行わない** (D-003). PriorityStars の既存 `groupLabel` で role group / accessibleName が成立しているため, ラベル → 入力の関連付けは既存仕様で十分.

- **REQ-5 (today-view JSX の更新)**

  `web/src/ui/today-view/today-view.tsx` の起票フォーム (`<form className="day-view__form">`) の JSX を REQ-3 / REQ-4 に従って更新する:

  - 各子要素のラップ `<div>` に grid-area 用のクラス (`.day-view__form__project` / `.day-view__form__priority` / `.day-view__form__name`) を付与する.
  - 「追加」 button に `.day-view__form__submit` を付与する.
  - PriorityStars の直下に「↑タップで選択」ヘルプラベル `<span className="day-view__form__priority-hint">↑タップで選択</span>` を追加する.

- **REQ-6 (tomorrow-view JSX の更新)**

  `web/src/ui/tomorrow-view/tomorrow-view.tsx` の起票フォームに REQ-5 と同等の変更を加える. クラス名・DOM 構造は today-view と揃える (= 同じ CSS が両 view に適用される).

- **REQ-7 (タスク名 label の保持)**

  既存の `<label htmlFor="task-name">タスク名</label>` + `<input id="task-name">` (today) および `<label htmlFor="tomorrow-task-name">タスク名</label>` + `<input id="tomorrow-task-name">` (tomorrow) の label/input 関連付けは**完全に保持**する. label を撤去しない (D-004. accessible name 維持のため必須).

- **REQ-8 (tokens.css 無改修)**

  `web/src/styles/tokens.css` には何も追加・変更しない. 既存トークン (`--space-md` / `--space-sm`) のみで完結する.

- **REQ-9 (focus-view 無改修)**

  `web/src/ui/focus-view/focus-view.css` および `focus-view.tsx` には触れない.

- **REQ-10 (PriorityStars / ProjectToggle コンポーネント本体無改修)**

  `web/src/ui/priority-stars/priority-stars.tsx` および `web/src/ui/project-toggle/project-toggle.tsx` の **prop API / 内部 DOM / class 名** には一切触れない. ヘルプラベルは外側 (起票フォーム JSX 内) で追加する.

### 非機能要件

- **NFR-NO-NEW-TOKENS**: tokens.css を変更しない. 既存トークンのみで構成する.
- **NFR-NO-SHADOW**: `box-shadow` 宣言を追加しない (BL-052 / BL-054 / BL-057 と同方針).
- **NFR-NO-HOVER-TRANSITION**: `:hover` / `transition` / `animation` を追加しない.
- **NFR-DOM-ADDITIVE**: 既存 DOM 要素 (input / select / button / label) を削除・改名しない. ヘルプラベル `<span>` を 1 つ追加するのみ. クラスの新規付与は許容する (= visual / layout 用).
- **NFR-A11Y**: `e2e/a11y.spec.ts` の WCAG 2.1 AA スキャンで violations 0 件を維持する. ヘルプラベル追加で見出し階層・ランドマーク・コントラストに影響しないことを確認.
- **NFR-COMPAT**: サーバ API / domain / Repository / mutation / query / ConflictDialog / notifyError 経路は無改修.
- **NFR-LABEL-PRESERVE**: タスク名 label/input 紐付け (htmlFor + id) は無改修. accessible name "タスク名" による既存テストの input 取得が壊れない.
- **NFR-BL054-PRESERVE**: BL-054 で確定した `.day-view__form` の visual 4 宣言は完全に保持し, 本 BL では削除・改変しない.
- **NFR-COMPONENT-API-FROZEN**: PriorityStars / ProjectToggle の prop API は無改修.

## 受け入れ基準

> 書き方は [`../../quality/acceptance-criteria.md`](../../quality/acceptance-criteria.md) に従う.

```
シナリオ AC-1: .day-view__form が CSS Grid layout に変更されている
  Given web/src/ui/day-view/day-view.css を開いた
  When  .day-view__form セレクタのルール本文を観察する
  Then  display: grid の宣言を含む
   かつ flex-direction の宣言を含まない
```

```
シナリオ AC-2: .day-view__form に grid-template-areas が定義されている
  Given web/src/ui/day-view/day-view.css を開いた
  When  .day-view__form セレクタのルール本文を観察する
  Then  grid-template-areas プロパティを宣言している
   かつ その値に "project priority" / "name name" / ". submit" の 3 行を含む
```

```
シナリオ AC-3: .day-view__form に grid-template-columns: 1fr auto が定義されている
  Given web/src/ui/day-view/day-view.css を開いた
  When  .day-view__form セレクタのルール本文を観察する
  Then  grid-template-columns プロパティに 1fr auto を含む宣言を持つ
```

```
シナリオ AC-4: .day-view__form の gap が var(--space-md) に引き上げられている
  Given web/src/ui/day-view/day-view.css を開いた
  When  .day-view__form セレクタのルール本文を観察する
  Then  gap: var(--space-md) の宣言を含む
   かつ gap: var(--space-sm) の宣言を含まない
```

```
シナリオ AC-5: BL-054 で確定した visual 4 宣言が保持されている
  Given web/src/ui/day-view/day-view.css を開いた
  When  .day-view__form セレクタのルール本文を観察する
  Then  background: var(--color-bg) を含む
   かつ border: 1px solid var(--color-border) を含む
   かつ border-radius: var(--radius-md) を含む
   かつ padding: var(--space-md) を含む
```

```
シナリオ AC-6: 各子要素に grid-area が割り当てられている (CSS クラス経由)
  Given web/src/ui/day-view/day-view.css を開いた
  When  .day-view__form__project / .day-view__form__priority / .day-view__form__name / .day-view__form__submit の各セレクタのルール本文を観察する
  Then  それぞれ grid-area: project / grid-area: priority / grid-area: name / grid-area: submit の宣言を含む
```

```
シナリオ AC-7: 「追加」ボタンが右寄せ配置されている
  Given web/src/ui/day-view/day-view.css を開いた
  When  .day-view__form__submit セレクタのルール本文を観察する
  Then  justify-self: end の宣言を含む
```

```
シナリオ AC-8: today-view JSX にヘルプラベル「↑タップで選択」が存在する
  Given /today を render する
  When  起票フォーム内を観察する
  Then  テキスト「↑タップで選択」を含む要素が存在する
   かつ 該当要素は <PriorityStars /> と同じ grid-area: priority の親領域内に配置されている
```

```
シナリオ AC-9: tomorrow-view JSX にヘルプラベル「↑タップで選択」が存在する
  Given /tomorrow を render する
  When  起票フォーム内を観察する
  Then  テキスト「↑タップで選択」を含む要素が存在する
   かつ 該当要素は <PriorityStars /> と同じ grid-area: priority の親領域内に配置されている
```

```
シナリオ AC-10: タスク名 label/input の関連付けが保持されている
  Given /today と /tomorrow を render する
  When  起票フォームを観察する
  Then  /today に <label htmlFor="task-name">タスク名</label> と <input id="task-name"> が共存する
   かつ /tomorrow に <label htmlFor="tomorrow-task-name">タスク名</label> と <input id="tomorrow-task-name"> が共存する
   かつ getByLabelText("タスク名") で input が取得可能 (テスト互換性)
```

```
シナリオ AC-11: PriorityStars / ProjectToggle コンポーネントの prop API が無改修である
  Given priority-stars.tsx と project-toggle.tsx を開いた
  When  PriorityStarsProps と ProjectToggleProps の型定義を観察する
  Then  本 BL の前後で prop 名・型・必須性に差分が無い
```

```
シナリオ AC-12: tokens.css を変更していない
  Given 本 BL の実装がマージされた
  When  web/src/styles/tokens.css を BL-057 完了時点の状態と比較する
  Then  差分が無い
   かつ 本 BL で参照する 2 トークン (--space-md / --space-sm) が引き続き定義されている
```

```
シナリオ AC-13: focus-view を変更していない
  Given 本 BL の実装がマージされた
  When  web/src/ui/focus-view/focus-view.css と focus-view.tsx を BL-057 完了時点の状態と比較する
  Then  差分が無い
   かつ focus-view.css に .day-view__form 系セレクタが混入していない
```

```
シナリオ AC-14: .day-view__card / .project-chip 系を変更していない (BL-052 / BL-056 / BL-057 の保持)
  Given web/src/ui/day-view/day-view.css を開いた
  When  .day-view__card / .day-view__card__header / .day-view__card__title / .day-view__card__actions / .day-view__card--focus / .project-chip の各セレクタのルール本文を観察する
  Then  BL-057 完了時点と同じ宣言のままで, 本 BL での追記・改変が無い
```

```
シナリオ AC-15: 既存単体テスト全件 green
  Given /today と /tomorrow が引き続きレンダリング可能
  When  既存単体テスト (today-view.test.tsx / tomorrow-view.test.tsx / unified-day-view.test.tsx / task-card-design.test.ts / form-card-design.test.ts / project-chip.test.tsx / task-card-zone-layout.test.tsx / priority-stars.test.tsx / project-toggle.test.tsx 等) を実行する
  Then  すべて green である
```

```
シナリオ AC-16: 既存 E2E 全件 green
  Given Playwright が起動可能
  When  既存 E2E (today-view-create-form.spec.ts / tasks.spec.ts / state-restoration.spec.ts 等) を実行する
  Then  すべて green である (label 紐付け・role + accessibleName ベースの取得が壊れていない)
```

```
シナリオ AC-17: アクセシビリティ違反 0 件を維持する
  Given /today /tomorrow をはじめとする全 view がレンダリング可能
  When  @axe-core/playwright で WCAG 2.1 AA をスキャンする (e2e/a11y.spec.ts の既存スキャン)
  Then  すべてのスキャンで violations.length === 0
```

```
シナリオ AC-18: hover / transition / animation / box-shadow が追加されていない
  Given web/src/ui/day-view/day-view.css を開いた
  When  .day-view__form 系セレクタ全般を観察する
  Then  box-shadow 宣言を含まない
   かつ transition 宣言を含まない
   かつ animation 宣言を含まない
   かつ .day-view__form:hover / .day-view__form:focus-within セレクタを定義していない
```

## 重要な決定 (D 章)

- **D-001 (grid-template-areas の具体形)**: `"project priority" "name name" ". submit"` を採用する (= 3 行 2 列). 上段は ProjectToggle (左) と PriorityStars + ヘルプ (右) の 2 セル, 中段はタスク名 input が全幅, 下段は左セルが空・右セルに「追加」ボタン.
  - 別案 `"project priority" "name name" "submit submit"` (submit 全幅 + `justify-self: end` で右寄せ) も検討したが, **左下が空セル `.` で済むほうが意図が明確** であり, submit 行の全幅化は不要 (= 右下に小さなボタンを置くだけで良い). 採用案は `. submit` で十分.
  - grid-template-columns は `1fr auto`. 左カラムは伸びるが右カラムは内容幅 (PriorityStars の星 3 つ + ヘルプラベル / 「追加」ボタンの幅) に追随する.

- **D-002 (ヘルプラベルの HTML / 配置)**:
  - タグ: `<span>` を採用する (`<small>` は意味論が文字サイズ示唆と混ざるため避ける. `<p>` はブロック要素で星 UI と離れすぎる).
  - 配置: **PriorityStars コンポーネントの外側** (= 起票フォーム JSX 内) に置く. PriorityStars 本体の prop API / 内部 DOM を無改修にするため (NFR-COMPONENT-API-FROZEN / G-4).
  - 構造: `<div className="day-view__form__priority">` の中に `<PriorityStars />` と `<span className="day-view__form__priority-hint">↑タップで選択</span>` を縦並びで入れる. div 自身に `grid-area: priority` を割り当てる.
  - クラス: `.day-view__form__priority-hint` (font-size / color は将来 BL で調整する余地を残す. 本 BL では既定スタイルで十分).

- **D-003 (a11y 連携: aria-describedby を使わない)**:
  - PriorityStars はすでに `groupLabel` で role group + accessibleName が成立している. ヘルプラベル「↑タップで選択」は**視覚的な誘導文** であり, スクリーンリーダーには既存 group label と各星の `<label>` テキストで十分に伝わる.
  - `<span aria-describedby>` で明示紐付けすると, PriorityStars コンポーネントの本体改修 (= props 追加) が必要になり NFR-COMPONENT-API-FROZEN に反する.
  - 結論: aria-describedby は使わず, 単なる視覚的補助テキストとして配置する. WCAG 違反は a11y E2E (axe) で確認する.

- **D-004 (タスク名 label の保持)**:
  - 既存の `<label htmlFor="task-name">タスク名</label>` + `<input id="task-name">` (today) / `<label htmlFor="tomorrow-task-name">` + `<input id="tomorrow-task-name">` (tomorrow) の構造を**完全に保持**する.
  - モック画像では label テキストが描かれていないが, accessible name 維持のために label は必須 (撤去すると WCAG 違反 + 既存テストの getByLabelText が壊れる).
  - 視覚的に label を隠したい場合は将来 BL で `.visually-hidden` 等の clip 技法を検討する余地を残す. 本 BL では label は表示したまま (= 既存挙動踏襲).

- **D-005 (「追加」ボタンの右下配置)**:
  - 採用: `grid-area: submit` + `justify-self: end` の組み合わせ. 親 grid の右セルに割り当て, さらに `justify-self: end` で明示的に右寄せ.
  - 別案 `grid-area: submit` のみ + 親 `grid-template-columns: 1fr auto` の右セルで自動右寄せ も成立するが, `justify-self: end` のほうが**意図が明確** で, 将来 columns 比率を変えても挙動が維持される.

- **D-006 (gap を `--space-sm` → `--space-md` に引き上げる)**:
  - 旧 `gap: var(--space-sm)` (= 8px) は flex 縦並び向けの間隔. grid 2D 配置に変わると行 / 列の余白が同時に効くため, モック画像の余裕ある間隔に合わせて `var(--space-md)` (= 16px) に引き上げる.
  - 既存トークンの範囲内 (= tokens.css 無改修) で対応する.

- **D-007 (today / tomorrow を共通 component 化しない)**:
  - 既存実装は今回も today-view.tsx と tomorrow-view.tsx で起票フォーム JSX が類似している (= ある程度の重複は存在する). 共通化すれば DRY だが, 本 BL のスコープは「2D 配置への変更」であり, 設計判断の追加 (props 設計 / state 管理の境界線 / dueDate を component 内で固定するか親で渡すか等) が必要になりスコープが拡大する.
  - 結論: **個別書き換え**にとどめる. 共通 component 化 (= `<DayViewCreateForm dueDate="today" />` のような抽象) は将来 BL の余地として残す.

- **D-008 (テスト方針)**:
  - BL-054 (`form-card-design.test.ts`) / BL-057 (`task-card-zone-layout.test.tsx`) と同じスタイルで, **CSS 直読みによる宣言の存在 assert** + **jsdom DOM レンダによる構造 assert** の 2 系統を組む.
    - (a) CSS 直読み: `.day-view__form` ルール本文に `display: grid` / `grid-template-areas` / `grid-template-columns` / `gap` / visual 4 宣言が含まれることを正規表現で assert (AC-1〜AC-7 / AC-14 / AC-18).
    - (b) DOM レンダ: today-view / tomorrow-view を render し, 「↑タップで選択」テキストの存在 (AC-8 / AC-9), タスク名 label/input 関連付け (AC-10) を assert.
  - 既存 E2E (today-view-create-form.spec.ts 等) は無修正で通る想定. 壊れた場合のみ最小限の追従修正.
  - 新規 test ファイル: `web/__tests__/task-form-grid-layout.test.tsx` (= jsdom + CSS 直読みの両方を含むため `.tsx`).

- **D-009 (visual 4 宣言の保持を test で固定する)**:
  - 本 BL は layout のみ変更だが, CSS の書き換え中に誤って visual 4 宣言を消してしまうリスクがある (R-001).
  - 対策: 新規 test に「.day-view__form の visual 4 宣言が引き続き含まれる」assert を AC-5 として独立に追加する.

- **D-010 (PriorityStars / ProjectToggle 本体無改修を test で固定する)**:
  - 本 BL のスコープ外であることを担保するため, `priority-stars.tsx` と `project-toggle.tsx` の **存在** および `PriorityStarsProps` / `ProjectToggleProps` の export 維持を CSS 直読みと同じ方式 (= `readFileSync` + 正規表現) で軽く assert する (AC-11).

## 未決事項 / 確認待ち

- なし (user との合意は背景・方針セクションで確定済み. grid-template-areas / ヘルプラベルの HTML / a11y 連携・label 保持・submit 配置・gap 引き上げ・component 化しない方針・テスト方針はすべて確定).
