# 仕様: 起票カードのプロジェクト `<select>` の box サイズを縮小 (task-form-select-compact)

- 状態: 確定
- 関連:
  - [`../../planning/backlog.md`](../../planning/backlog.md) BL-066
  - 直接の依存 BL: BL-065 (`project-toggle-removal`) — 本 BL は BL-065 で復元した `<select>` の見た目を整える後続改善.
  - 関連 feature:
    - [`../project-toggle-removal/spec.md`](../project-toggle-removal/spec.md) (BL-065) — 起票カードのプロジェクト入力を `<ProjectToggle />` から `<select>` に戻した親 BL. 本 BL は同 select の box を縮小する.
    - [`../project-chip/spec.md`](../project-chip/spec.md) (BL-056) — `.project-chip` (TaskCard 表示側) 本体は無改修. `--font-size-small` の値を共有する視覚言語の参照元.
    - [`../task-card-hotfix/spec.md`](../task-card-hotfix/spec.md) (BL-063) D-003 — `.task-card__header .project-chip { font-size: var(--font-size-small) }` の specificity 強化ルール. **本 BL でも維持**. 本 BL で追加する `.task-card__header select` セレクタとは competing しない (`<select>` には `.project-chip` クラスは付与されない).
    - [`../task-card-component/spec.md`](../task-card-component/spec.md) (BL-059) — `<TaskFormCard>` の 3 段ゾーン (header / title / actions). 本 BL の差分は header 段に閉じる.
    - [`../design-tokens/`](../design-tokens/) (BL-046) — `--font-size-small` / `--space-xs` / `--space-sm` / `--color-border` / `--radius-lg` を参照. tokens.css は無改修.
  - 上位要件: NFR-010 (一貫した UI)
  - モックアップ: `local/image.png` (BL-063 と同) — header 段でプロジェクト入力が chip と同等の高さ・font-size で並ぶ姿.

## 背景 / 課題

BL-065 (`project-toggle-removal`) で, 起票カードのプロジェクト選択を `<ProjectToggle />` (button) から `<select>` に戻した. BL-065 自体の NFR-NO-NEW-STYLE により, `<select>` は**ブラウザ既定スタイル**のまま導入されている.

しかし実機での結果, ブラウザ既定の `<select>` は以下のように box が大きく見える:

- font-size: 16px (= `--font-size-base` 相当, Mobile Safari の zoom 抑止しきい値とも一致するため通常 16px が当たる)
- min-height: 概ね 30〜44px (UA とプラットフォームに依存)
- padding: 6〜10px 程度
- border / border-radius: UA 既定 (= 角丸が浅く, グレーの inset 風)

その結果, 同 header 段の `<PriorityStars />` (= 星 1 個あたりおおむね 24px) や TaskCard 表示側の `.project-chip` (= font-size 14px / 角丸 + 縁取り) と並んだ際, **起票カードの `<select>` だけ box が突出して見える**. user 評価では「もっと小さく, chip 風に揃えてほしい」が確定要求.

### user 指摘 (要約)

- 「BL-065 で `<select>` に戻したのは正しいが, 既定スタイルだと box が大きすぎる. モックアップの chip と同じくらいの見た目に揃えてほしい」.

### 方針の核

本 BL は `web/src/ui/task-card/task-card.css` に **`.task-card__header select` セレクタ** を 1 つ新設し, 起票カード内の `<select>` の box を縮小する. 値は次のとおり:

- `min-height: 24px` (WCAG 2.5.8 AA タッチターゲットの**目標**水準を下回るが, `<select>` は本 BL では tap 領域の特例と扱う. D-001 で確定).
- `padding: var(--space-xs) var(--space-sm)` (= 4px 8px) で chip と揃う高さに収める.
- `border: 1px solid var(--color-border)` + `border-radius: var(--radius-lg)` で TaskCard 本体 / chip と同じ視覚言語を採用.
- `font-size: var(--font-size-small)` (= 14px) で chip と揃える.
- `appearance: none` で OS デフォルトの dropdown 矢印スタイルを統一. **矢印代替の描画は本 BL のスコープ外** (= 矢印が消えても UI 上 `<select>` であることはキーボード / screen reader で識別可能, D-002 で確定).
- `background` / `color` は明示宣言しない (`<form>` 親の `.task-card` の `background: var(--color-bg)` / `color: var(--color-fg)` を継承させる, P-006 で確定).

CSS の specificity は 2 class (= `.task-card__header` + `select`). この specificity は `<select>` 既定スタイルや一般的な reset.css に対しては勝てる. かつ scope は `.task-card__header` 配下に限定されるため, TaskCard 表示側の `<span className="project-chip">` には影響しない (= span は `<select>` ではない).

JSX / tokens / 他 CSS は**無改修**. `task-card.css` 1 ファイル追記で完結する.

shadow / hover / transition / animation は BL-052 / BL-054 / BL-063 と同方針で**一切追加しない**.

## ゴール / 非ゴール

### ゴール

- **G-1 (起票カード `<select>` の box 縮小)**: `<TaskFormCard>` の header 段の `<select>` の min-height / padding / font-size / border / border-radius が, ブラウザ既定スタイルではなく本 BL で確定する値で描画される.
- **G-2 (chip と同じ視覚言語)**: 起票カードの `<select>` と TaskCard 表示側の `.project-chip` が, font-size (= `--font-size-small`) / border / border-radius を共有する視覚言語に揃う.
- **G-3 (差分の局所化)**: 変更は `web/src/ui/task-card/task-card.css` 1 ファイルへの追記のみ. JSX (task-card.tsx / task-form-card.tsx / today-view.tsx / tomorrow-view.tsx) / tokens.css / 他 CSS は無改修. クラスの追加・削除も発生しない.
- **G-4 (scope を起票カード内に限定)**: 本 BL の `.task-card__header select` セレクタは `<TaskFormCard>` の header 段にのみ作用する. TaskCard 表示側 (`<TaskCard>`) の `<span className="project-chip">` には影響しない (= chip は `<select>` ではないため CSS マッチ自体しない).
- **G-5 (a11y 維持)**: `<select>` のキーボード操作 (Tab で focus, 矢印キーで option 選択, Enter / Space で開閉) / screen reader 読み上げ (label「プロジェクト」 + 現在選択中 option) は本 BL の差分で変えない. axe による WCAG 2.1 AA violations 0 件を維持する.
- **G-6 (BL-063 D-003 ルールの不変性)**: `.task-card__header .project-chip { font-size: var(--font-size-small) }` ルール (BL-063) は本 BL で**改修しない**. `<select>` と `.project-chip` はセレクタ的にも DOM 的にも別物 (= competing しない).
- **G-7 (既存テスト全件 green)**: BL-059 / BL-063 / BL-065 で確定した DOM 構造 / aria-label / role / accessibleName / props 型は無変更. 既存単体テスト・E2E は無修正で通る.

### 非ゴール

- **`<select>` 以外の入力要素の再装飾**: タスク名 `<input>` / PriorityStars / submit button (「追加」) は本 BL の対象外. 既存スタイルを維持.
- **TaskCard 表示側 (`<span className="project-chip">`) の改修**: BL-056 / BL-063 で確定済み. 本 BL でこれらに追加で touch しない. `.project-chip` ルール本文 (BL-056) も `.task-card__header .project-chip` ルール (BL-063 D-003) もそのまま.
- **`<option>` 群の装飾**: `<option>` 要素は OS / UA の native dropdown 内で描画されるため CSS の効きが UA 依存. 本 BL では `<option>` への style を**一切追加しない**.
- **dropdown 矢印 (▼) の代替描画**: `appearance: none` で OS デフォルト矢印は消えるが, SVG / 擬似要素での代替矢印の追加は本 BL の**スコープ外** (D-002).
- **tokens.css への新規トークン追加**: 既存トークン (`--font-size-small` / `--space-xs` / `--space-sm` / `--color-border` / `--radius-lg`) のみで visual を構成する. 本 BL では tokens.css を**変更しない**.
- **JSX (task-card.tsx / task-form-card.tsx / today-view.tsx / tomorrow-view.tsx) の改修**: 本 BL は CSS 1 ファイル追記のみ.
- **focus-view (`/focus`) の影響**: focus-view は起票フォーム自体を持たない. 本 BL の `.task-card__header select` セレクタは focus-view 内でマッチする DOM が無いため副作用 0.
- **hover 効果 / transition / animation / box-shadow**: 本 BL でも追加しない. BL-052 / BL-054 / BL-063 と同方針.
- **server API / domain / Repository / mutation / query / ConflictDialog / notifyError 経路**: 一切無改修.
- **新規 DOM 構造テストの追加**: DOM 構造は BL-059 / BL-065 で確定済み. 本 BL では DOM 構造のアサーションは追加しない. CSS 宣言の存在を検証する単体テスト + jsdom レンダの computed style 確認のみ追加する (詳細は plan).
- **E2E テストの追加**: visual は単体テストで CSS 宣言の存在と computed style を assert する形で担保する. 本 BL では E2E (Playwright) のテストを追加・改修しない.

## 要件

### 機能要件

- **REQ-1 (`.task-card__header select` ルールの新設)**

  `web/src/ui/task-card/task-card.css` に新規セレクタ `.task-card__header select` のルールを追加する. ルール本文に以下の宣言を含める:

  - `min-height: 24px`
  - `padding: var(--space-xs) var(--space-sm)` (= 4px 8px)
  - `font-size: var(--font-size-small)` (= 14px)
  - `border: 1px solid var(--color-border)`
  - `border-radius: var(--radius-lg)`
  - `appearance: none`
  - `-webkit-appearance: none` (Safari / iOS 用の prefix 互換. WebKit ベンダでは無印 `appearance` も認識されるが, 安全側で両方記述)

  これら以外の宣言 (`background` / `color` / `outline` / `box-shadow` / `transition` 等) を追加しない. background / color は `.task-card` 親から継承させる (P-006).

- **REQ-2 (起票カード scope への限定)**

  REQ-1 のセレクタは `.task-card__header select` (= 2 class, 1 type) とする.

  - `.task-card--form .task-card__header select` のように `--form` modifier で限定する**必要は無い**: TaskCard 表示側 (`<TaskCard>`) の `.task-card__header` 配下に `<select>` 要素は DOM 構造上存在しない (= TaskCard 表示側はプロジェクト表示を `<span className="project-chip">` で行う). したがって `.task-card__header select` のセレクタだけで起票カード scope に実質限定される (D-001).
  - 副作用範囲確認: リポジトリ内で `.task-card__header` の子孫として `<select>` を持つ DOM は `<TaskFormCard>` のみ. 検証は `web/src/ui/task-card/task-card.tsx` を grep して `select` 要素が含まれないことを単体テストで assert する (AC-7).

- **REQ-3 (BL-063 D-003 ルールとの非競合)**

  `.task-card__header .project-chip` ルール (BL-063 D-003) は本 BL で改修しない. 本 BL で追加する `.task-card__header select` は型セレクタ (`select`) のためクラスセレクタ (`.project-chip`) とは別の DOM 要素にマッチする. CSS specificity も別物 (2 class + 1 type vs 2 class) で competing しない.

- **REQ-4 (JSX 無改修)**

  以下の JSX ファイルは無改修:

  - `web/src/ui/task-card/task-card.tsx`
  - `web/src/ui/task-card/task-form-card.tsx`
  - `web/src/ui/today-view/today-view.tsx`
  - `web/src/ui/tomorrow-view/tomorrow-view.tsx`

  BL-065 で `<TaskFormCard>` の header 段に `<select id={`${idPrefix}-project`}>` がすでに置かれている. CSS 追記のみで反映される.

- **REQ-5 (tokens.css 無改修)**

  `web/src/styles/tokens.css` には何も追加・変更しない. 既存トークン (`--font-size-small` / `--space-xs` / `--space-sm` / `--color-border` / `--radius-lg`) のみで構成する.

- **REQ-6 (他 CSS 無改修)**

  以下の CSS ファイルは無改修:

  - `web/src/ui/day-view/day-view.css` (BL-051 / BL-054 で確定)
  - `web/src/ui/focus-view/focus-view.css` (focus-view は起票フォーム無し / 本 BL 対象外)
  - その他 UI モジュール CSS

### 非機能要件

- **NFR-NO-NEW-TOKENS**: 本 BL では tokens.css を変更しない. 既存トークンのみで構成する.
- **NFR-NO-SHADOW**: 本 BL では `box-shadow` 宣言を追加しない (BL-052 / BL-054 / BL-063 と同方針 / user 明言「border が主役」).
- **NFR-NO-HOVER-TRANSITION**: 本 BL では `:hover` / `:focus-within` / `transition` / `animation` を追加しない. 静的な visual のみ. `<select>` の focus visible (= キーボードフォーカス時の outline) は UA 既定を維持する.
- **NFR-NO-DOM-CHANGE**: BL-059 / BL-063 / BL-065 で確定した DOM 構造 / aria-label / role / accessibleName / props 型は無変更. 既存単体テスト・E2E は無修正で通る.
- **NFR-A11Y**: `e2e/a11y.spec.ts` の WCAG 2.1 AA スキャンで violations 0 件を維持する. 本 BL の差分は CSS のみで, ランドマーク / 見出し / aria 属性に影響しない. `<label htmlFor={`${idPrefix}-project`} className="visually-hidden">プロジェクト</label>` ↔ `<select id={`${idPrefix}-project`}>` の関連付け (BL-065 REQ-4) は維持.
- **NFR-CHIP-PRESERVE**: TaskCard 表示側の `<span className="project-chip">` および `.project-chip` ルール本体は無改修. BL-063 D-003 ルールも維持.
- **NFR-FORM-CARD-PRESERVE**: BL-054 で確定した `.day-view__form` の visual (background / border / border-radius / padding) と BL-058 撤去確認は無改修.
- **NFR-COMPAT**: サーバ API / domain / Repository / mutation / query / ConflictDialog / notifyError 経路は無改修.
- **NFR-CONTRAST**: `var(--color-bg)` (= `#fff`) / `var(--color-fg)` (= `#1a1a1a`) / `var(--color-border)` (= `#ccc`) の組み合わせはすでに BL-046 で WCAG AA を確認済みのトークン. 本 BL で新規にコントラスト破綻を引き起こさない. `<select>` の文字色は親 (`.task-card`) から継承される `var(--color-fg)` のまま.
- **NFR-TOUCH-TARGET (例外)**: WCAG 2.5.8 (Target Size Minimum, AA 2.2) の**目標** 24×24 CSS px を `min-height: 24px` で満たす. 横幅は `<select>` の固有幅 + padding + option の最大文字数で決まり 24px は超える. tap で開く `<select>` の場合, hit area は実際の box より UA が拡張する実装が一般的だが, 本 BL では仕様としては「min-height: 24px」を AC とする. これより大きいタッチターゲット要件 (WCAG 2.5.5 AAA = 44×44) は本 BL のスコープ外 (D-001).

## 受け入れ基準

> 書き方は [`../../quality/acceptance-criteria.md`](../../quality/acceptance-criteria.md) に従う.

```
シナリオ AC-1: .task-card__header select ルールが task-card.css に存在する
  Given web/src/ui/task-card/task-card.css を開いた
  When  .task-card__header select セレクタのルール本文を観察する
  Then  ルール本文が null ではない (= セレクタが定義されている)
   かつ min-height: 24px の宣言を含む
   かつ padding: var(--space-xs) var(--space-sm) の宣言を含む
   かつ font-size: var(--font-size-small) の宣言を含む
   かつ border: 1px solid var(--color-border) の宣言を含む
   かつ border-radius: var(--radius-lg) の宣言を含む
   かつ appearance: none の宣言を含む
   かつ -webkit-appearance: none の宣言を含む
```

```
シナリオ AC-2: .task-card__header select ルールに不要な宣言が含まれていない
  Given web/src/ui/task-card/task-card.css を開いた
  When  .task-card__header select セレクタのルール本文を観察する
  Then  background プロパティの宣言を含まない
   かつ color プロパティの宣言を含まない
   かつ box-shadow プロパティの宣言を含まない
   かつ transition プロパティの宣言を含まない
   かつ animation プロパティの宣言を含まない
   かつ :hover / :focus-within の派生セレクタを task-card.css 内に持たない
```

```
シナリオ AC-3: <TaskFormCard> の <select> の computed style が想定値である (today)
  Given TaskFormCard を idPrefix="create" / inputId="task-name" / projects=[{ id: "p1", name: "プロジェクトα" }] / projectId="" / priority="normal" で jsdom 上にレンダリングする
  When  document.getElementById("create-project") の getComputedStyle を取得する
  Then  fontSize が "14px" である
   かつ borderTopStyle が "solid" / borderTopWidth が "1px" である
   かつ borderRadius が "16px" (= --radius-lg) である
   かつ minHeight が "24px" である
   かつ appearance または webkitAppearance が "none" である
```

```
シナリオ AC-4: <TaskFormCard> の <select> の computed style が想定値である (tomorrow)
  Given TaskFormCard を idPrefix="tomorrow-create" / inputId="tomorrow-task-name" / projects=[] / projectId="" / priority="normal" で jsdom 上にレンダリングする
  When  document.getElementById("tomorrow-create-project") の getComputedStyle を取得する
  Then  AC-3 と同じ判定をすべて満たす (idPrefix 違いによる差は無い)
```

```
シナリオ AC-5: TaskCard 表示側の <span class="project-chip"> は .task-card__header select ルールの影響を受けない
  Given TaskCard をプロジェクト有り (projectName="プロジェクトα") で jsdom 上にレンダリングする
  When  画面上の <span class="project-chip"> の computed style を取得する
  Then  fontSize が "14px" であり, これは BL-056 / BL-063 D-003 由来であって本 BL の .task-card__header select ルールに由来しない
   かつ getElementsByTagName("select") の length が 0 である (= TaskCard 表示側に <select> は無い)
```

```
シナリオ AC-6: BL-063 D-003 の .task-card__header .project-chip ルールが本 BL でも維持されている
  Given web/src/ui/task-card/task-card.css を開いた
  When  .task-card__header .project-chip セレクタのルール本文を観察する
  Then  ルール本文が null ではない
   かつ font-size: var(--font-size-small) の宣言を含む (BL-063 D-003 の不変性)
```

```
シナリオ AC-7: 本 BL の差分は CSS 1 ファイル (task-card.css) のみで, JSX 4 ファイルは無改修
  Given 本 BL の実装がマージされた
  When  以下 4 ファイルを BL-065 完了時点 (= main の HEAD) と比較する:
        - web/src/ui/task-card/task-card.tsx
        - web/src/ui/task-card/task-form-card.tsx
        - web/src/ui/today-view/today-view.tsx
        - web/src/ui/tomorrow-view/tomorrow-view.tsx
  Then  4 ファイルすべてで差分が無い
   かつ task-form-card.tsx の header 段に <select id={`${idPrefix}-project`}> が引き続き存在する (BL-065 由来)
```

```
シナリオ AC-8: tokens.css を変更していない
  Given 本 BL の実装がマージされた
  When  web/src/styles/tokens.css を BL-065 完了時点と比較する
  Then  差分が無い (新規トークンの追加・既存トークンの変更が無い)
   かつ 本 BL で参照する 5 トークン (--font-size-small / --space-xs / --space-sm / --color-border / --radius-lg) が引き続き定義されている
```

```
シナリオ AC-9: 他 CSS ファイル (day-view.css / focus-view.css) を変更していない
  Given 本 BL の実装がマージされた
  When  web/src/ui/day-view/day-view.css と web/src/ui/focus-view/focus-view.css を BL-065 完了時点と比較する
  Then  両ファイルで差分が無い
   かつ day-view.css に .task-card__header select セレクタが混入していない
```

```
シナリオ AC-10: task-card.css 全体で box-shadow / hover / transition / animation を追加していない (NFR-NO-SHADOW / NFR-NO-HOVER-TRANSITION)
  Given web/src/ui/task-card/task-card.css を開いた
  When  ファイル全体を観察する
  Then  box-shadow キーワードを含む宣言が存在しない
   かつ transition キーワードを含む宣言が存在しない
   かつ animation キーワードを含む宣言が存在しない
   かつ ":hover" を含むセレクタが存在しない
   かつ ":focus-within" を含むセレクタが存在しない
```

```
シナリオ AC-11: 既存テスト全件 green 維持
  Given /today と /tomorrow と /focus が引き続きレンダリング可能
  When  既存単体テスト (web/__tests__/ 配下全件, 特に task-card-component / task-card-hotfix / task-form-card-select / project-chip / form-card-design / task-card-design / design-tokens) と既存 E2E (e2e/ 配下全件) を実行する
  Then  すべて green である (本 BL の差分は CSS のみで DOM / aria / role / props を変えていない)
```

```
シナリオ AC-12: アクセシビリティ違反 0 件を維持する
  Given /today /tomorrow をはじめとする全 view がレンダリング可能
  When  @axe-core/playwright で WCAG 2.1 AA をスキャンする (e2e/a11y.spec.ts の既存スキャン)
  Then  すべてのスキャンで violations.length === 0
```

## 重要な決定 (D 章)

- **D-001 (selector specificity の選定 = `.task-card__header select`)**: `.task-card__header select` (2 class + 1 type) を採用する. 起票カード scope に限定する必要は**ある**が, 限定の手段としては:
  - 案 A: `.task-card--form .task-card__header select` (3 class + 1 type) — modifier で明示的に起票カードに限定. specificity も最強.
  - 案 B: `.task-card__header select` (2 class + 1 type) — TaskCard 表示側の `.task-card__header` 配下に `<select>` が DOM 構造上存在しないことを利用して実質限定する.

  TaskCard 表示側 (`<TaskCard>`) の header 段は `<span className="project-chip">` または「chip 無し」しか持たず, `<select>` を含むことが将来も無いという**構造的な不変性**が BL-059 task-card-component の plan で確定している. したがって案 B の specificity で十分かつ簡潔. 案 B を採用する (= REQ-2). 副作用範囲のテストは AC-5 / AC-7 で担保.

- **D-002 (`appearance: none` 採用 + 矢印代替は描画しない)**: OS デフォルトの dropdown 矢印 (▼) はプラットフォーム差が大きく, 視覚的に統一しづらい. 本 BL では `appearance: none` (+ `-webkit-appearance: none`) でデフォルト矢印を消し, **矢印代替の SVG / 擬似要素 (::after) は描画しない**. 矢印が消えても:
  - キーボード操作: Tab で focus, 矢印キー / Space / Enter で開閉 — UA 標準挙動で識別可能.
  - screen reader 読み上げ: `<select>` role および label「プロジェクト」 + 現在選択中 option を読み上げる — 識別可能.
  - 視覚的識別: 同 header 段の `<PriorityStars />` (= button 群) と異なる boxed UI として並ぶこと, label 「プロジェクト」が visually-hidden ながら DOM 上は存在すること, `border-radius: var(--radius-lg)` が chip に揃うこと, でドロップダウンと認識できる前提.

  矢印代替は将来 BL の余地として残す.

- **D-003 (具体値の確定 = min-height 24px / padding 4px 8px / font-size 14px / border 1px solid #ccc / border-radius 16px)**:
  - `min-height: 24px` — `<select>` の box 高さの下限. line-height 14px + padding-top/bottom 4px = 22px が固有高で, min-height 24px で実描画は 24px 強. 横幅は `<option>` テキスト + native arrow なしで自然幅.
  - `padding: var(--space-xs) var(--space-sm)` (= `4px 8px`) — vertical 4px は `<input>` 系の慣行. horizontal 8px は chip 風の余白.
  - `font-size: var(--font-size-small)` (= 14px) — TaskCard 表示側の `.project-chip` と同値. BL-063 D-003 と視覚的に揃う.
  - `border: 1px solid var(--color-border)` (= `1px solid #ccc`) — `.task-card` 本体 (BL-052) / `.day-view__form` (BL-054) と同じ border 1 宣言. `.project-chip` (BL-056) は元来 border 無しだが, `<select>` は box であることを示すため border は必要 (D-002 で矢印を消した分の補完).
  - `border-radius: var(--radius-lg)` (= 16px) — `.task-card` 本体 / `.day-view__form` と同値 (= 16px). 角丸を強めにして「chip 風」を強調.

  iOS Safari で `<select>` の font-size が 16px 未満だと tap 時に zoom-in する挙動があるが, 起票カードはランディング時点で既に十分大きく表示されており zoom-in の実害は小さい (P-007 で受け入れる). 14px 維持を優先.

- **D-004 (テスト方針 = CSS 直読み + jsdom レンダ)**:
  - **CSS 直読み**: `web/__tests__/task-form-select-compact.test.tsx` (新規) で `readFileSync(task-card.css)` + `extractRuleBody(".task-card__header select")` を行い, REQ-1 の 7 宣言の存在を文字列マッチで assert する. ヘルパは BL-052 / BL-054 / BL-056 / BL-057 / BL-058 / BL-059 / BL-063 と同形を**再定義**する (= 共通モジュール化は本 BL の対象外, 再定義許容).
  - **jsdom レンダ + getComputedStyle**: `vitest.config.ts` で `css: true` がすでに有効 (BL-063 で確定). `<TaskFormCard>` を render し, `document.getElementById("create-project")` の `getComputedStyle` から `fontSize` / `minHeight` / `borderRadius` / `borderTopWidth` / `borderTopStyle` / `appearance` を確認する. jsdom の `getComputedStyle` は `var()` を解決し具体値 (`"14px"`, `"16px"`) を返すことが BL-063 で確認済み.
  - **副作用範囲**: TaskCard 表示側を render し, `<select>` が DOM 上 0 件であること (= 本 BL のセレクタが TaskCard 表示側にマッチしようがないこと) を AC-5 で assert.

- **D-005 (BL-063 D-003 ルールとの非衝突確認)**: `.task-card__header select` (本 BL) と `.task-card__header .project-chip` (BL-063) は:
  - 異なる DOM 要素にマッチする (`<select>` vs `<span class="project-chip">`).
  - セレクタ specificity も別物 (2 class + 1 type vs 2 class). 同じ DOM 要素にぶつかる可能性が無いため衝突 0.
  - したがって本 BL で BL-063 D-003 ルールを改修する必要は無い. AC-6 で BL-063 D-003 ルールの不変性を assert.

- **D-006 (focus / hover / transition なし)**: BL-052 / BL-054 / BL-063 と同方針. `<select>` の focus visible (キーボードフォーカス時の outline) は UA 既定を維持する. 明示的な `:focus-visible` の outline override は本 BL でも追加しない.

- **D-007 (tokens.css 不変更)**: 既存トークン 5 種で visual 要件を満たすことが確認済み. tokens.css に touch しないことで, デザイントークン定義 (BL-046) の安定性を守る.

- **D-008 (テストヘルパ再定義許容)**: BL-052 (`task-card-design.test.ts`) で確立した `extractRuleBody` ヘルパは, BL-054 / BL-056 / BL-057 / BL-058 / BL-059 / BL-063 で各 test ファイルに**再定義**されてきた. 本 BL でも同形を新規 test ファイル内に再定義する. 共通モジュール化は本 BL のスコープ外.

## 未決事項 / 確認待ち

- なし (user との合意は本 spec のオーケストレーション節と D 章で確定済み. 実装値・対象セレクタ・appearance: none の採否・矢印代替の不採用・BL-063 ルールの不変性・テスト方針・tokens 不変更はすべて確定).
