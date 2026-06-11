# 仕様: 起票フォームのカード化 (.day-view__form 縁・余白・角丸) (form-card-design)

- 状態: 確定
- 関連:
  - [`../../planning/backlog.md`](../../planning/backlog.md) BL-054
  - 依存 BL: BL-051 (unified-day-view) / BL-052 (task-card-design)
  - 関連 feature:
    - [`../unified-day-view/spec.md`](../unified-day-view/spec.md) — `day-view__` 名前空間の構造整理 (本 BL の前提)
    - [`../task-card-design/spec.md`](../task-card-design/spec.md) — `.day-view__card` に同じ visual を与えた直近 BL. 本 BL はその「フォーム版」である
    - [`../design-tokens/`](../design-tokens/) (BL-046) — 本 BL が参照する `--color-bg` / `--color-border` / `--radius-md` / `--space-md`
    - [`../focus-view/`](../focus-view/) (BL-037) — `/focus` は起票フォームを持たないため本 BL の対象外
  - 上位要件: NFR-010 (最小手数 / 一貫した UI)

## 背景 / 課題

BL-051 (unified-day-view) で today / tomorrow ビューの HTML 構造とクラス体系が `day-view__` 名前空間に統一された. このうち `.day-view__form` (= 起票フォーム) は構造系プロパティ (`display: flex` / `flex-direction: column` / `gap: var(--space-sm)`) のみが定義されている.

その後 BL-052 (task-card-design) で `.day-view__card` (= 各タスク) に縁・背景・角丸・余白を追加し, 明確に「カード」として識別できる visual を確立した. しかし起票フォーム (`.day-view__form`) には同じ visual が適用されていないため, タスクカード列の直上にある「タスクを追加する」UI だけが縁を持たず, タスクカードと視覚的に切断された状態になっている.

### user 指摘 (要約)

- 「追加するカードもちゃんとカードにしてほしい」

= 「タスクを追加する」UI (起票フォーム) は, タスクカードと同じ視覚言語を持つカードであるべき, という主張.

### 方針の核

本 BL は **BL-052 と同じ 4 宣言** (`background: var(--color-bg)` / `border: 1px solid var(--color-border)` / `border-radius: var(--radius-md)` / `padding: var(--space-md)`) を `.day-view__form` に追加する. 起票フォームを `.day-view__card` と同じ視覚言語 (縁・背景・角丸・余白) を持つカードとして扱う.

`.day-view__form` と `.day-view__card` は意味が異なる (form / card) ためクラスは分けたままにする. CSS の値としては同じものを 2 か所に書く形になるが, 本 BL ではこの重複を許容する (将来 BL で共通スタイルへ抽象化する余地は残す). DRY を理由に JSX 側で `.day-view__form` に `.day-view__card` を追加併記する変更は本 BL のスコープに**含めない** (= CSS 1 ファイル変更で完結させる).

shadow / hover / transition / animation は BL-052 と同方針で**一切追加しない**. 縁が「カードの本体」である.

## ゴール / 非ゴール

### ゴール

- **G-1 (起票フォームのカード化)**: `/today` と `/tomorrow` の起票フォーム (= `.day-view__form`) が border / radius / padding / background を備えたカードとして視覚的に識別できる.
- **G-2 (タスクカードとの視覚言語統一)**: 起票フォームとタスクカード (`.day-view__card`) が同じ `--color-bg` / `--color-border` / `--radius-md` / `--space-md` を共有し, 視覚的に「同じ種類のカード」として連続する.
- **G-3 (トークン参照のみで完結)**: 本 BL では `web/src/styles/tokens.css` を**変更しない**. 既存トークン (`--color-bg` / `--color-border` / `--radius-md` / `--space-md`) のみで構成する.
- **G-4 (差分の局所化)**: 変更は `web/src/ui/day-view/day-view.css` の 1 ファイルへの追記のみに閉じる. JSX (today-view.tsx / tomorrow-view.tsx) は無改修. クラスの追加・削除も発生しない.
- **G-5 (既存テスト全件 green)**: BL-051 / BL-052 で確定した DOM 構造 / aria-label / role / accessibleName は無変更. 既存単体テスト・E2E は無修正で通る.

### 非ゴール

- **focus-view (`/focus`) の visual 変更**: focus-view は起票フォーム自体を持たないため**対象外**. 本 BL では一切触らない.
- **tokens.css への新規トークン追加**: 既存トークンで十分であることが確認済み. 本 BL では新規トークンを追加しない.
- **`.day-view__card` / `.day-view__card--focus` / `.day-view__list` / `.day-view__header` / `.day-view__empty` の visual 変更**: 本 BL の対象は `.day-view__form` セレクタのみ. それ以外には**触れない**.
- **hover 効果 / transition / animation**: 本 BL では追加しない. 静的な border / radius / padding / background のみ.
- **box-shadow (影)**: BL-052 と同方針で一切追加しない.
- **入力要素 (input / button) の再装飾**: 本 BL の対象は親要素 `.day-view__form` のみ. 内部の `<input>` / `<button>` / 入力エラー表示等は無改修.
- **共通カードスタイルへの抽象化** (`@apply` 的なもの, mixin, 共通クラス `.card-surface` 等): 本 BL のスコープに含めない. 将来 BL の余地として残すのみ.
- **JSX 上での DRY 化** (`.day-view__form` に `.day-view__card` クラスも併記する案): JSX 変更を伴うため本 BL のスコープに反する. CSS 1 ファイル変更で完結させる方針を維持.
- **タスクカードや空状態の visual 変更**: BL-052 で `.day-view__card` / `.day-view__card--focus` は確定済み. 本 BL でこれらに追加で touch しない.
- **サーバ API / domain / Repository / mutation / query / ConflictDialog / notifyError 経路**: 一切無改修.
- **新規 DOM 構造テストの追加**: DOM 構造は BL-051 で確定済み. 本 BL では DOM 構造のアサーションは追加しない. CSS 宣言の存在を検証する単体テストのみ追加する (詳細は plan).
- **E2E テストの追加**: visual は単体テストで CSS 宣言の存在を assert する形で担保する. 本 BL では E2E (Playwright) のテストを追加・改修しない.

## 要件

### 機能要件

- **REQ-1 (`.day-view__form` の visual 定義)**

  `web/src/ui/day-view/day-view.css` の `.day-view__form` セレクタに以下の宣言を追加する:

  - `background: var(--color-bg)` (= `#fff`)
  - `border: 1px solid var(--color-border)` (= `#ccc`, 1px 縁が「カードの本体」)
  - `border-radius: var(--radius-md)` (= `12px`)
  - `padding: var(--space-md)` (= `16px`)

  既存の構造系宣言 (`display: flex` / `flex-direction: column` / `gap: var(--space-sm)`) は順序を変えず維持する.

- **REQ-2 (対象クラスの限定)**

  本 BL で `web/src/ui/day-view/day-view.css` に追加する宣言は REQ-1 の `.day-view__form` セレクタ分のみとする. 他のセレクタ (`.day-view` / `.day-view__header` / `.day-view__header h1` / `.day-view__list` / `.day-view__card` / `.day-view__card--focus` / `.day-view__empty`) には**触れない**.

- **REQ-3 (JSX 無改修)**

  `web/src/ui/today-view/today-view.tsx` および `web/src/ui/tomorrow-view/tomorrow-view.tsx` の JSX は無改修. BL-051 ですでに `.day-view__form` クラスが付与済みであるため, CSS 追記のみで両ビューに反映される.

- **REQ-4 (tokens.css 無改修)**

  `web/src/styles/tokens.css` には何も追加・変更しない. 既存トークンのみで完結する.

- **REQ-5 (focus-view 無改修)**

  `web/src/ui/focus-view/focus-view.css` には触れない. focus-view (`/focus`) は起票フォームを持たず本 BL の対象外.

### 非機能要件

- **NFR-NO-NEW-TOKENS**: 本 BL では tokens.css を変更しない. 既存トークンのみで構成する.
- **NFR-NO-SHADOW**: 本 BL では `box-shadow` 宣言を追加しない (BL-052 と同方針 / user 明言「shadow は脇役, border が主役」).
- **NFR-NO-HOVER-TRANSITION**: 本 BL では `:hover` / `transition` / `animation` を追加しない. 静的な visual のみ.
- **NFR-NO-DOM-CHANGE**: BL-051 / BL-052 で確定した DOM 構造 / aria-label / role / accessibleName は無変更. 既存単体テスト・E2E は無修正で通る.
- **NFR-A11Y**: `e2e/a11y.spec.ts` の WCAG 2.1 AA スキャンで violations 0 件を維持する. 本 BL の差分は CSS のみで, ランドマーク / 見出し / aria 属性に影響しない.
- **NFR-COMPAT**: サーバ API / domain / Repository / mutation / query / ConflictDialog / notifyError 経路は無改修.
- **NFR-CONTRAST**: `var(--color-bg)` (= `#fff`) / `var(--color-fg)` (= `#1a1a1a`) / `var(--color-border)` (= `#ccc`) の組み合わせはすでに BL-046 で WCAG AA を確認済みのトークン. 本 BL で新規にコントラスト破綻を引き起こさない.

## 受け入れ基準

> 書き方は [`../../quality/acceptance-criteria.md`](../../quality/acceptance-criteria.md) に従う.

```
シナリオ AC-1: 起票フォーム (.day-view__form) に縁・背景・角丸・余白が定義されている
  Given web/src/ui/day-view/day-view.css を開いた
  When  .day-view__form セレクタのルール本文を観察する
  Then  background プロパティに var(--color-bg) を参照する宣言を含む
   かつ border プロパティに 1px solid var(--color-border) を参照する宣言を含む
   かつ border-radius プロパティに var(--radius-md) を参照する宣言を含む
   かつ padding プロパティに var(--space-md) を参照する宣言を含む
```

```
シナリオ AC-2: 既存の構造系宣言 (display / flex-direction / gap) が維持されている
  Given web/src/ui/day-view/day-view.css を開いた
  When  .day-view__form セレクタのルール本文を観察する
  Then  display: flex の宣言を含む
   かつ flex-direction: column の宣言を含む
   かつ gap: var(--space-sm) の宣言を含む
```

```
シナリオ AC-3: 起票フォームに hover / transition / animation / box-shadow が追加されていない
  Given web/src/ui/day-view/day-view.css を開いた
  When  .day-view__form セレクタおよびその :hover / :focus-within 派生セレクタを観察する
  Then  box-shadow プロパティを宣言していない
   かつ transition プロパティを宣言していない
   かつ animation プロパティを宣言していない
   かつ .day-view__form:hover / .day-view__form:focus-within のセレクタを CSS 内に持たない
```

```
シナリオ AC-4: day-view.css 全体で box-shadow を追加していない (NFR-NO-SHADOW)
  Given web/src/ui/day-view/day-view.css を開いた
  When  ファイル全体を観察する
  Then  box-shadow キーワードを含む宣言が存在しない
```

```
シナリオ AC-5: tokens.css を変更していない
  Given 本 BL の実装がマージされた
  When  web/src/styles/tokens.css を BL-052 完了時点の状態と比較する
  Then  差分が無い (新規トークンの追加・既存トークンの変更が無い)
   かつ 本 BL で参照する 4 トークン (--color-bg / --color-border / --radius-md / --space-md) が引き続き定義されている
```

```
シナリオ AC-6: JSX (today-view.tsx / tomorrow-view.tsx) を変更していない
  Given 本 BL の実装がマージされた
  When  web/src/ui/today-view/today-view.tsx と web/src/ui/tomorrow-view/tomorrow-view.tsx を BL-052 完了時点の状態と比較する
  Then  差分が無い
   かつ 両ファイルで .day-view__form クラスが引き続き付与されている (BL-051 由来)
```

```
シナリオ AC-7: 本 BL の対象セレクタは .day-view__form に限定されている
  Given 本 BL の実装がマージされた
  When  web/src/ui/day-view/day-view.css の他セレクタ (.day-view / .day-view__header / .day-view__header h1 / .day-view__list / .day-view__card / .day-view__card--focus / .day-view__empty) のルール本文を観察する
  Then  BL-052 完了時点と同じ宣言のままで, 本 BL での追記が無い
```

```
シナリオ AC-8: focus-view (/focus) の CSS を変更していない
  Given 本 BL の実装がマージされた
  When  web/src/ui/focus-view/focus-view.css を BL-052 完了時点の状態と比較する
  Then  差分が無い (focus-view は本 BL の対象外)
   かつ focus-view.css に .day-view__form セレクタが混入していない
```

```
シナリオ AC-9: 既存テスト全件 green 維持
  Given /today と /tomorrow が引き続きレンダリング可能
  When  既存単体テスト (web/__tests__/today-view.test.tsx, tomorrow-view.test.tsx, unified-day-view.test.tsx, task-card-design.test.ts, design-tokens.test.ts 等) と既存 E2E を実行する
  Then  すべて green である (本 BL の差分は CSS のみで DOM / aria / role を変えていない)
```

```
シナリオ AC-10: アクセシビリティ違反 0 件を維持する
  Given /today /tomorrow をはじめとする全 view がレンダリング可能
  When  @axe-core/playwright で WCAG 2.1 AA をスキャンする (e2e/a11y.spec.ts の既存スキャン)
  Then  すべてのスキャンで violations.length === 0
```

## 重要な決定 (D 章)

- **D-001 (border 主役 / shadow 不採用)**: BL-052 で確定した「カードは縁で表現する. 影は使わない」原則を踏襲. 本 BL の `.day-view__form` でも `box-shadow` を一切追加しない.
- **D-002 (BL-052 と同値を採用)**: `.day-view__form` に追加する 4 宣言の**値**は `.day-view__card` と完全に同じ (`background: var(--color-bg)` / `border: 1px solid var(--color-border)` / `border-radius: var(--radius-md)` / `padding: var(--space-md)`) とする. 起票フォームとタスクカードを「同じ種類のカード」として視覚的に統一する.
- **D-003 (CSS 値の二重記述を許容)**: 同じ 4 宣言が `.day-view__card` と `.day-view__form` の両方に書かれる形になるが, 本 BL ではこれを許容する. `.day-view__form` と `.day-view__card` は意味が異なる (form / card) のでクラスを分けるのは妥当. 共通スタイルへの抽象化 (mixin, `@apply`, 共通クラス) は将来 BL の余地として残す.
- **D-004 (JSX で DRY 化しない)**: 「`.day-view__form` に `.day-view__card` クラスも併記すれば CSS を 1 か所にできる」という選択肢は **採用しない**. JSX 変更を伴うため本 BL の境界線 (= CSS 1 ファイル変更で完結) を超える. また `.day-view__form` と `.day-view__card` のセマンティクスが異なるため, クラス名としても分離したままにする.
- **D-005 (focus-view 不変更)**: focus-view (`/focus`) は起票フォーム自体を持たない. 本 BL では focus-view CSS には触れない.
- **D-006 (hover / transition / animation を追加しない)**: BL-052 と同方針. 静的な visual のみで「カード」を成立させ, インタラクション effect は本 BL のスコープ外.
- **D-007 (新規トークンを追加しない)**: 既存トークンのみで visual 要件が満たされることを確認済み. tokens.css に touch しないことで, デザイントークン定義 (BL-046) の安定性を守る.
- **D-008 (テストは CSS 宣言の存在 assert で担保)**: BL-052 (`web/__tests__/task-card-design.test.ts`) で確立した「CSS ファイルを `readFileSync` で読み込み, 指定セレクタブロック内の宣言を正規表現で assert する」スタイルを踏襲する. `extractRuleBody` ヘルパは task-card-design.test.ts に既存実装があるため, 新規 test ファイルで等価な実装を再定義 (or 共通化が容易なら共通モジュール化) する. 本 BL では再定義で良い (= 2 ファイル間で同じ小関数を持つことを許容).

## 未決事項 / 確認待ち

- なし (user との合意は背景・方針セクションで確定済み. 実装値・対象セレクタ・対象外の境界線・shadow / hover 取扱・トークン追加可否・JSX 変更可否はすべて確定).
