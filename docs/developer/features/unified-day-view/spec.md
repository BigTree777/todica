# 仕様: 今日/明日ビューの共通レイアウト化 (unified-day-view)

- 状態: 確定
- 関連:
  - [`../../planning/backlog.md`](../../planning/backlog.md) BL-051
  - 依存 BL: BL-036 (ui-sidebar-nav) / BL-038 (tomorrow-view) / BL-049 (hamburger-nav) / BL-050 (remove-inline-project-create)
  - 後続 BL: BL-052 (task-card-design) — カードの visual な詳細はそちらで扱う
  - 関連 feature:
    - [`../secondary-views-shell/spec.md`](../secondary-views-shell/spec.md) — 同種の「構造整理 + BEM クラス命名 + 暫定値マーカー」の前例 (BL-045)
    - [`../today-view/`](../today-view/) (BL-005) / [`../tomorrow-view/`](../tomorrow-view/) (BL-038) / [`../focus-view/`](../focus-view/) (BL-037)
    - [`../completion-counter-placement/spec.md`](../completion-counter-placement/spec.md) — `.today-view__completion-count` の出自 (BL-047)
    - [`../design-tokens/`](../design-tokens/) (BL-046) — 本 BL が参照するトークン (`--space-*` / `--font-size-*` / `--color-*`)
  - 上位要件: NFR-010 (最小手数 / 一貫した UI)

## 背景 / 課題

`/today` と `/tomorrow` の 2 ビューは「同じ縦並び (タスク起票 + タスク一覧)」という同型の機能を持つが, 実装上は HTML 構造もスタイル体系もバラバラに分かれており, ユーザーに同じレイアウトとして提示できていない. user 要望「今日と明日は同じレイアウト・同じスタイルにしたい. 違いは『現在のタスク』だけ」に対応するため, 両ビューの HTML 構造と CSS 体系を共通化する.

### 現状の不整合 (2026-06 時点の実コード)

| 観点 | today-view.tsx | tomorrow-view.tsx |
| --- | --- | --- |
| ルート要素 | `<main>` (className 無) | `<section className="tomorrow-view">` |
| 見出し | `<header className="today-view__header">` 内に `<h1>今日</h1>` + `<span className="today-view__completion-count">` | `<h1>明日のタスク</h1>` 直書き (header 無し) |
| 起票フォーム | `<form aria-label="タスク起票フォーム">` (className 無) | `<form aria-label="明日のタスク起票フォーム" className="tomorrow-view__form">` |
| タスク一覧 | `<ul aria-label="タスク一覧">` (className 無), `<li>` (className 無) | `<ul aria-label="明日のタスク一覧" className="tomorrow-view__list">`, `<li className="tomorrow-view__item">` |
| 「現在のタスク」セクション | `<section aria-label="現在のタスク">` (className 無, 起票フォームより**後** / focusedTask が無いとき非描画) | 該当なし (機能としても無い) |
| 専用 CSS | `today-view.css`: `.today-view__header` + `.today-view__completion-count` のみ (BL-047 由来) | `tomorrow-view.css`: `.tomorrow-view*` 10 クラス (border / radius / padding / 色 etc) |

### 副次的な不整合

- BL-038 では「『現在のタスク』が起票フォームより**後**」だが, user 要望と本 BL の合意では今日ビューの「現在のタスク」は**起票フォームより前 = 2 段目**に置く. 既存 today-view では現在のタスクが起票フォームの後ろにあり, 本 BL で前へ移動させる必要がある.
- tomorrow-view は「ルート `<section>` + 直書き `<h1>`」で `<header>` ランドマークを持たない. today-view は `<header>` を持つ. 本 BL で両ビューとも `<header>` 化する.

### 用語

本 spec で「day-view」と書いた場合は, today-view と tomorrow-view の**共通**部分 (新規 `web/src/ui/day-view/day-view.css` 配下の構造とクラス体系) を指す. 既存 view を統廃合してまったく新規の `DayView` コンポーネントに置き換える, という意味ではない. today-view.tsx / tomorrow-view.tsx の 2 ファイルは引き続き個別に存在し, 共通 CSS とクラス名を共有する.

## ゴール / 非ゴール

### ゴール

- **HTML 構造の統一**: today / tomorrow の両ビューが以下の同型の DOM ツリーで描画される:
  1. ルート `<main className="day-view">`
  2. 1 段目: `<header className="day-view__header">` (内部に `<h1>` と任意の補助情報)
  3. 2 段目 (today のみ): `<section className="day-view__card day-view__card--focus" aria-label="現在のタスク">` — focusedTask が無いときは描画しない (= 既存挙動踏襲)
  4. 3 段目: `<form className="day-view__form" aria-label="...起票フォーム">`
  5. 4 段目: `<ul className="day-view__list" aria-label="...タスク一覧">` 配下に `<li className="day-view__card">`
- **CSS 体系の統一**: 新規 `web/src/ui/day-view/day-view.css` を作り, 両ビューが同じファイルを import する. クラス名は `day-view__` BEM プレフィックスに統一する. 旧 `tomorrow-view.css` は全削除. `today-view.css` は `.today-view__completion-count` のみ残す (BL-047 由来の補助テキストスタイル).
- **「現在のタスク」セクションの位置を起票フォームより前 (= 2 段目) に移す**: today-view 既存の JSX を再配置する.
- **構造系プロパティのみ定義**: 本 BL で新規 `day-view.css` に書くのは, 共通レイアウトに最小限必要な構造系プロパティ (display / flex-direction / gap / list-style / margin) と, h1 の font-size と margin (現状 tomorrow-view.css にある暫定値の踏襲) に限る. **border / border-radius / background / padding / box-shadow など「カードらしさ」に関する visual な詳細は本 BL の対象外**で, BL-052 (task-card-design) で扱う.
- **トークン参照**: 既に BL-046 (design-tokens) でトークンが定義済みのため, 暫定値ではなくトークン (`--space-*` / `--font-size-*` 等) を最初から参照する. `TODO(BL-046)` マーカーは付けない.
- **既存テスト全件 green**: aria-label / role / アクセシブルネーム / button のラベル文字列は変えない. 単体テスト・E2E のうち aria セレクタに依存しているものは無修正で通る. DOM 構造アサーション (`querySelector` / `closest` 等) で旧クラス名や旧構造に依存している箇所のみ追従修正する.

### 非ゴール

- **focus-view (`/focus`) の変更**: focus-view は単独大表示の独自レイアウト (`focus-view.css` の `.focus-view__card` 系). 構造もスタイルも本 BL の対象外.
- **タスクカードの visual な詳細 (border / radius / background / padding / shadow 等)**: BL-052 で扱う. 本 BL では `.day-view__card` クラスは付与するが, その中の border / radius / padding などは「構造に最小限必要なもの (= 子要素を flex で並べる程度)」だけ書く. カードらしい縁取り・余白・背景色は BL-052 でまとめて与える.
- **`.day-view__card--focus` の強調 visual**: 同じく BL-052. 本 BL では variant クラスを付与するだけで, 強調用の border-width / box-shadow 等は持たない.
- **`<header>` 内に置く補助情報の中身の見直し**: today の `<header>` 内には既存通り `<h1>今日</h1>` + `<span className="today-view__completion-count">` の 2 要素. tomorrow の `<header>` 内には `<h1>明日のタスク</h1>` の 1 要素のみ (補助情報は無し). 補助情報の追加 / 変更は本 BL の範囲外.
- **起票フォームの入力要素 (タスク名 / プロジェクトトグル / 星 UI / 追加 button)**: BL-039 (期限 UI 撤去) / BL-040 (星) / BL-041 (トグル) で確定済みのため変更しない.
- **「現在のタスク」セクションの動作**: focusedId 計算 (`currentTaskId ?? nextTaskId`) / 削除・完了・「明日にする」 button の挙動 / 二重表示防止 (`otherTasks` から `focusedTask` を除外) は無改修.
- **タスクカード上のアクション 3 ボタン**: BL-042 (task-card-actions) で確定済み.
- **サーバ API / Repository / domain**: 一切無改修.
- **ProjectCreateDialog / projects-view / settings-view / routines-view / trash-view**: 本 BL の対象外.
- **tokens.css の変更**: トークン追加は BL-046 で完了済み (`--space-*` / `--font-size-*` / `--color-border` / `--color-fg-subtle` 等). 本 BL で新規トークンを足す必要が出た場合は plan の決定として明示する (現時点では不要と判断).
- **E2E の hamburger ナビ未対応リグレッション修復**: 既存の `e2e/tomorrow-view.spec.ts` などは BL-049 由来で「ナビ操作前にハンバーガーメニューを開く」ステップを持たず main HEAD でも失敗している (BL-050 完了報告参照). この修復は別 BL のスコープであり, 本 BL では行わない. 本 BL は単体テストの DOM 構造アサーション追従修正のみに集中する.
- **ランドマーク構造の全 view 統一 (D-001 / U-2 of secondary-views-shell の派生)**: 本 BL では day-view 2 つを `<main>` に揃えるが, focus / projects / trash / routines / settings との整合は別議論のままとする.

## 要件

### 機能要件

- **REQ-1 (ルート要素と共通クラス)**
  - today-view.tsx / tomorrow-view.tsx の各ルート要素を `<main className="day-view">` にする.
  - tomorrow-view.tsx は現状 `<section className="tomorrow-view">` のため, `<main className="day-view">` へ書き換える (`<section>` → `<main>` のランドマーク変更を伴う).
  - aria-label は付けない (h1 が見出しとして十分なため). 既存 tomorrow-view の `aria-label="明日のタスク"` は撤去する.

- **REQ-2 (ヘッダ構造の統一)**
  - 各ビューのルート直下 1 段目は `<header className="day-view__header">`.
  - today-view: `<header>` 内に `<h1>今日</h1>` + `<span className="today-view__completion-count">` (既存維持. `<span>` の className は `today-view__` 名前空間のまま残す).
  - tomorrow-view: `<header>` 内に `<h1>明日のタスク</h1>` のみ (補助情報は無し). 現状の直書き `<h1>` を `<header>` でラップする.

- **REQ-3 (「現在のタスク」セクションの位置と構造)**
  - today-view のみ: `<header>` の直後 (= 起票フォームの**前**) に `<section className="day-view__card day-view__card--focus" aria-label="現在のタスク">` を配置する.
  - `focusedTask` が null のときは描画しない (既存挙動踏襲. `{focusedTask && ...}` のガードを維持).
  - tomorrow-view: 「現在のタスク」セクションは持たない.
  - セクション内部の `<h2>現在のタスク</h2>` 直書き / `<span>{focusedTask.name}</span>` / `<PriorityStars />` / 3 ボタン (削除 / 明日にする / 完了) の構造は既存維持.

- **REQ-4 (起票フォームのクラス)**
  - 各ビューの `<form>` に `className="day-view__form"` を付与する.
  - today-view の `<form>` は現状 className 無, tomorrow-view は `className="tomorrow-view__form"` から `day-view__form` へ置換.
  - フォーム内部の `<div>` / `<label>` / `<input>` / `<ProjectToggle>` / `<PriorityStars>` / `<button type="submit">` の構造は無改修.
  - aria-label は現状維持: today-view = `"タスク起票フォーム"` / tomorrow-view = `"明日のタスク起票フォーム"`.

- **REQ-5 (タスク一覧 ul / li のクラス)**
  - 各ビューの `<ul>` に `className="day-view__list"` を付与する.
  - 各 `<li>` に `className="day-view__card"` を付与する.
  - aria-label は現状維持: today-view = `"タスク一覧"` / tomorrow-view = `"明日のタスク一覧"`.
  - tomorrow-view の `<li>` 内部にある `.tomorrow-view__item-body` / `.tomorrow-view__project` / `.tomorrow-view__name` / `.tomorrow-view__actions` 系の入れ子 `<div>` / `<span>` は撤去し, 子要素は `<li>` 直下に並べる (= today-view と同じ素直な構造に揃える). 表示順は「project 名 (任意) / タスク名 / PriorityStars / 「現在のタスクにする」 button / 削除 / 明日にする・今日にする / 完了」の順とする. project 名表示は tomorrow-view 既存挙動の維持として残す.
    - ただし内部の入れ子撤去は構造の単純化が目的であり, 副作用としてユニットテストの querySelector 系アサーションは変化する. テスト追従の方針は plan で扱う.

- **REQ-6 (空状態の扱い)**
  - tomorrow-view: 既存の `<p className="tomorrow-view__empty">明日のタスクはありません</p>` は `<p className="day-view__empty">明日のタスクはありません</p>` に置換する. 表示位置は `<ul>` の前 (現状維持).
  - today-view: 既存実装に空状態テキストは存在しない. 本 BL でも追加しない.

- **REQ-7 (共通 CSS ファイル)**
  - 新規 `web/src/ui/day-view/day-view.css` を作成し, today-view.tsx と tomorrow-view.tsx の両方から import する.
  - 定義するクラスは `.day-view` / `.day-view__header` / `.day-view__form` / `.day-view__list` / `.day-view__card` / `.day-view__card--focus` / `.day-view__empty` の 7 個.
  - 各クラスに含めるプロパティは「最小限の構造系のみ」: display / flex-direction / gap / list-style / margin / padding (= レイアウトに最小限必要なものだけ. カードらしさ系の border / radius / background / shadow は含めない).
  - h1 の font-size と margin の暫定値踏襲は `.day-view__header h1` セレクタで定義する.
  - `.day-view__empty` は tomorrow-view.css の `.tomorrow-view__empty` 既存挙動 (色 / 中央寄せ / padding) を踏襲する.
  - 詳細値は plan §「day-view.css の最小定義」で確定する.

- **REQ-8 (旧 CSS の片付け)**
  - `web/src/ui/tomorrow-view/tomorrow-view.css` を**ファイルごと削除**する.
  - tomorrow-view.tsx の `import "./tomorrow-view.css";` を `import "../day-view/day-view.css";` に置換する.
  - `web/src/ui/today-view/today-view.css` は残すが, 内部からは `.today-view__header` (= `.day-view__header` で吸収される) のレイアウト定義を削除し, `.today-view__completion-count` のみ残す.
  - today-view.tsx は `import "./today-view.css";` に加えて `import "../day-view/day-view.css";` を追加する (両方 import).

- **REQ-9 (既存単体テストの構造アサーション追従)**
  - `web/__tests__/today-view.test.tsx` と `web/__tests__/tomorrow-view.test.tsx` の DOM 構造アサーション (`querySelector(".tomorrow-view__form")` や `closest(".tomorrow-view__item")` のような旧クラス依存箇所) を新しいクラス名/構造に追従修正する.
  - 動作テスト (起票・削除・完了等の repository mock 呼出回数・引数アサーション) は変更不要.
  - aria-label / role / accessibleName ベースのクエリ (`getByRole("button", { name: /削除/ })` 等) は変えない.

### 非機能要件

- **NFR-VISUAL-PARITY**: `/today` と `/tomorrow` の見た目が次の観点で一致する: ルート要素のレイアウト (flex column / gap), `<h1>` の font-size と margin, `<form>` と `<li>` の構造 (= 同じ親子関係でレンダリングされる). カードの border / radius / background など visual な詳細は BL-052 で揃えるため, 本 BL 完了時点では「カードらしさ」自体は欠けたままで OK.
- **NFR-A11Y**: `e2e/a11y.spec.ts` の WCAG 2.1 AA スキャン (今日 / 明日含む) で violations 0 件を維持する. ルート要素の `<section>` → `<main>` 変更は `<main>` ランドマークがページ内に 1 個になることを意味する (AppShell 側にも `<main>` があると衝突する可能性は plan で確認する).
- **NFR-COMPAT**: サーバ API / domain / Repository / mutation・query の挙動・ConflictDialog / notifyError 経路は無改修. aria-label / role / button のアクセシブルネームを変えない.
- **NFR-NO-NEW-TOKENS**: 本 BL では tokens.css を変更しない. 既存トークン (`--space-md` / `--space-sm` / `--font-size-h1` / `--color-fg-subtle` 等) のみで構成する.

## 受け入れ基準

> 書き方は [`../../quality/acceptance-criteria.md`](../../quality/acceptance-criteria.md) に従う.

```
シナリオ AC-1: /today と /tomorrow のルート要素が同じ構造になっている
  Given /today を開いた
  When  ページのルート要素を観察する
  Then  ルートは <main> 要素で, class に "day-view" を含む
   かつ /tomorrow を開いたときも同じく <main class="day-view"> である
   かつ tomorrow-view クラスは DOM から消えている
```

```
シナリオ AC-2: 各ビューの 1 段目に day-view__header が存在し h1 を内包する
  Given /today と /tomorrow をそれぞれ開いた
  When  ルート直下を観察する
  Then  /today では 1 段目に <header class="day-view__header"> があり, 内部に <h1>今日</h1> と <span class="today-view__completion-count"> が存在する
   かつ /tomorrow では 1 段目に <header class="day-view__header"> があり, 内部に <h1>明日のタスク</h1> のみ存在する
```

```
シナリオ AC-3: today ビューでは「現在のタスク」セクションが起票フォームより前に置かれる
  Given 今日タスクが 1 件以上存在し, focusedTask が null でない状態で /today を開いた
  When  ルート直下の子要素を上から順に列挙する
  Then  順序は [header] → [section aria-label="現在のタスク"] → [form aria-label="タスク起票フォーム"] → [ul aria-label="タスク一覧"]
   かつ section の class に "day-view__card" と "day-view__card--focus" を両方含む
```

```
シナリオ AC-4: 今日タスクが 0 件のとき「現在のタスク」セクションは描画されない
  Given 今日タスクが 0 件の状態で /today を開いた
  When  ルート直下の子要素を観察する
  Then  aria-label="現在のタスク" の要素は存在しない
   かつ 順序は [header] → [form] → [ul] (focusedTask が null のときは既存挙動踏襲で section が無い)
```

```
シナリオ AC-5: 各ビューの起票フォームに day-view__form が付与されている
  Given /today と /tomorrow をそれぞれ開いた
  When  <form> 要素を観察する
  Then  /today の <form aria-label="タスク起票フォーム"> の class に "day-view__form" を含む
   かつ /tomorrow の <form aria-label="明日のタスク起票フォーム"> の class に "day-view__form" を含む
   かつ どちらも "tomorrow-view__form" クラスは持たない
```

```
シナリオ AC-6: 各ビューのタスク一覧 (ul / li) が共通クラスを持つ
  Given /today と /tomorrow にタスクが 1 件以上存在する
  When  <ul> と <li> を観察する
  Then  /today / /tomorrow の <ul> の class に "day-view__list" を含む
   かつ 各 <li> の class に "day-view__card" を含む
   かつ どちらも "tomorrow-view__list" / "tomorrow-view__item" クラスは持たない
```

```
シナリオ AC-7: 共通 CSS ファイルが両ビューから参照されている
  Given 本 BL の実装がマージされた
  When  web/src/ui/day-view/day-view.css の存在と, today-view.tsx / tomorrow-view.tsx の import を確認する
  Then  day-view.css が存在する
   かつ today-view.tsx に `import "../day-view/day-view.css";` がある
   かつ tomorrow-view.tsx に `import "../day-view/day-view.css";` がある
   かつ tomorrow-view.css は削除されている (ファイルが存在しない)
```

```
シナリオ AC-8: 機能差分なし — 起票 / 削除 / 完了 / 期限切替 / 「現在のタスクにする」が引き続き動く
  Given /today と /tomorrow がレンダリング可能
  When  既存単体テスト (web/__tests__/today-view.test.tsx, tomorrow-view.test.tsx) を実行する
  Then  動作系の全シナリオ (起票・削除・完了・期限切替・priority 変更・「現在のタスクにする」・ConflictDialog・notifyError) が green である
   かつ aria-label / role / button のアクセシブルネーム依存セレクタは無修正で通る
```

```
シナリオ AC-9: アクセシビリティ違反 0 件を維持する
  Given /today /tomorrow をはじめとする全 view がレンダリング可能
  When  @axe-core/playwright で WCAG 2.1 AA をスキャンする (e2e/a11y.spec.ts の既存スキャン)
  Then  すべてのスキャンで violations.length === 0
   かつ ページ内に <main> ランドマークが 1 個だけ存在する (AppShell 側との二重定義が起きていない)
```

```
シナリオ AC-10: tomorrow-view 専用の CSS / クラスが完全に消えている (grep スモーク)
  Given 本 BL の実装がマージされた
  When  `grep -rn "tomorrow-view__" web/src/` を実行する
  Then  ヒットしない (= tomorrow-view__form / tomorrow-view__list / tomorrow-view__item / tomorrow-view__empty 等が DOM・CSS の両方から消えている)
   かつ `ls web/src/ui/tomorrow-view/tomorrow-view.css` はファイル未存在で exit code 非 0
```

## 重要な決定 (D 章)

- **D-001 (ルート要素は `<main>` に揃える)**: 既存 today-view が `<main>`, tomorrow-view が `<section>` という非対称を, `<main>` に揃える. AppShell 側の `app-shell.tsx` がさらに `<main>` を持っていないことを plan で確認する (もし持っているなら片方の semantic を見直す). secondary-views-shell の D-001 (各 view の `<main>` 維持) と方向は一致する.
- **D-002 (「現在のタスク」セクションを起票フォームより前に移動)**: user 要望「違いは『現在のタスク』だけ」の position と整合させるため. 既存 today-view は起票フォームの後ろにあり, JSX 並び順を変更する. 機能的な挙動 (focusedId 計算 / 二重表示防止) は無改修.
- **D-003 (BEM プレフィックスを `day-view__` に決定)**: today-view, tomorrow-view どちらにも所属しない第 3 のプレフィックスにすることで, 「共通」の意図を明示する. 物理ディレクトリ `web/src/ui/day-view/` を新設し css をそこに置く (tsx は置かない. ビューコンポーネント自体は今までどおり today-view / tomorrow-view ディレクトリに残る).
- **D-004 (visual 詳細は BL-052 に切り出し)**: 本 BL では構造系プロパティ (display / flex / gap / list-style / margin / padding 最小限) と h1 の font-size のみ書く. カードの border / radius / background / shadow / 強調 variant の visual は次の BL-052 で扱う. これにより本 BL の差分は「構造の付け替え」に閉じ, レビュー粒度が小さくなる.
- **D-005 (今日 view の `today-view.css` は完全削除しない)**: BL-047 由来の `.today-view__completion-count` は header 内の `<span>` 専用スタイルで, 共通化対象ではない (tomorrow には対応概念が無い). この 1 クラスのみ today-view.css に残す. `.today-view__header` は `.day-view__header` に統合し削除する.
- **D-006 (tomorrow の `<section>` ランドマーク削除 / aria-label 削除)**: 既存 tomorrow-view の `aria-label="明日のタスク"` は `<section>` をランドマーク化するために付いていた. `<main>` に変えれば h1 がランドマーク見出しになるため不要. 既存テストで `getByRole("section", { name: "明日のタスク" })` のような依存箇所があれば追従修正する.
- **D-007 (tomorrow `<li>` 内部の入れ子 `<div>` 撤去)**: tomorrow-view の `.tomorrow-view__item-body` / `.tomorrow-view__actions` の入れ子は visual な整列 (左右並び) のためだけに存在する. 本 BL は visual 詳細を BL-052 に出すため, 入れ子を撤去して today-view と同じ素直な構造に揃える. visual の左右整列は BL-052 で `.day-view__card` の flex 規則として戻す.
- **D-008 (E2E hamburger リグレッションは別 BL)**: BL-050 完了報告で挙がっている `e2e/tomorrow-view.spec.ts` 等の hamburger 未対応リグレッションは main HEAD でも失敗中で, 本 BL の構造変更とは無関係. 本 BL では単体テストの DOM 構造アサーション追従修正のみに集中する. hamburger E2E 修復は backlog に別 BL として切り出す (本 spec では命名しない).

## 未決事項 / 確認待ち

- **U-1 (AppShell 側の `<main>` ランドマーク重複)** — **確定済み**: `app-shell.tsx` 確認の結果, `.app-shell__main` は `<div className="app-shell__main">` であり `<main>` ランドマークを持たない (= 各 view 側が `<main>` を持つ前提で設計されている). よって today/tomorrow を `<main className="day-view">` にしてもページ内に `<main>` は 1 個に保たれる. REQ-1 / D-001 を変更しない.
- **U-2 (`<section className="day-view__card day-view__card--focus">` の section ランドマーク扱い)**: 「現在のタスク」セクションは `<section aria-label="現在のタスク">` で実装されているが, aria-label を付けると暗黙の `role="region"` が生まれる. 本 BL では既存テスト (`getByRole("region", { name: /現在のタスク/ })`) との互換のため `aria-label` を維持するが, `<section>` を `<div>` に変えるべきかは plan で再確認する. 現時点は維持で確定.
- **U-3 (tomorrow-view の起票フォーム submit 周りの空状態描画位置)**: 既存 tomorrow-view では「空状態 `<p>`」が `<ul>` の前にあり, `<ul>` も空配列で同時に存在する (REQ-6 / plan tomorrow-view 由来). 本 BL でも構造は維持. 空状態の見た目 (色・中央寄せ・padding) は `.day-view__empty` に踏襲するが, BL-052 で再調整される可能性あり (visual の話なので本 BL では結論しない).
