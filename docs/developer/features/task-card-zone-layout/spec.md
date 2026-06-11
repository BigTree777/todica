# 仕様: タスクカードの 3 段ゾーンレイアウト (task-card-zone-layout)

- 状態: 確定
- 関連:
  - [`../../planning/backlog.md`](../../planning/backlog.md) BL-057
  - 依存 BL: BL-035 (UI 再設計の土台) / BL-040 (priority-star-ui) / BL-042 (task-card-actions) / BL-043 (set-focus-gesture) / BL-046 (design-tokens) / BL-051 (unified-day-view) / BL-052 (task-card-design) / BL-054 (form-card-design) / BL-056 (project-chip)
  - 関連 feature:
    - [`../unified-day-view/spec.md`](../unified-day-view/spec.md) — `day-view__` 名前空間の DOM 共通化 (本 BL の前提)
    - [`../task-card-design/spec.md`](../task-card-design/spec.md) (BL-052) — `.day-view__card` / `.day-view__card--focus` の visual 基盤. 本 BL は同セレクタの**レイアウト方向と内部構造**を再構成する.
    - [`../project-chip/spec.md`](../project-chip/spec.md) (BL-056) — `.project-chip` 共通スタイル. 本 BL では「上段 header」 に配置する前提.
    - [`../task-card-actions/spec.md`](../task-card-actions/spec.md) (BL-042) — 「削除 / 明日にする (今日にする) / 完了」の 3 ボタン構成 (本 BL の「下段 actions」を構成).
    - [`../set-focus-gesture/spec.md`](../set-focus-gesture/spec.md) (BL-043) — 「現在のタスクにする」 button (本 BL では下段に同居させる / D-002).
    - [`../priority-star-ui/spec.md`](../priority-star-ui/spec.md) (BL-040) — `<PriorityStars />` (本 BL では中段に配置 / D-003).
    - [`../design-tokens/`](../design-tokens/) (BL-046) — 本 BL が参照する `--space-md` / `--radius-lg`.
    - [`../focus-view/`](../focus-view/) (BL-037) — `/focus` 単独ページは本 BL の対象外.
  - 後続 BL (依存される側): BL-058 (起票フォーム 2D グリッド化) — 起票フォーム側の構造再構成は本 BL とは独立に進める.
  - 上位要件: NFR-010 (最小手数 / 一貫した UI)

## 背景 / 課題

モックアップ `local/image.png` ではタスクカードが次の **3 段ゾーン構造** で描かれている:

```
┌─────────────────────────────┐
│ ⌜プロジェクト名⌟            │  ← 上段 (header): chip (BL-056 で実装済)
│                             │
│       タスク名              │  ← 中段 (title): タスク名 (大きめ・中央寄せ)
│                             │
│ [削除] [明日にする] [完了]  │  ← 下段 (actions): 3 ボタン row (横並び)
└─────────────────────────────┘
```

一方, 現状の `.day-view__card` (`web/src/ui/day-view/day-view.css:47-56`) は `display: flex` + `align-items: center` + `gap: var(--space-md)` で **全要素が 1 行水平に並ぶ** 構成である. `today-view.tsx` の各 `<li className="day-view__card">` の中身は順に `<span className="project-chip">` (BL-056) → `<span>{task.name}</span>` → `<PriorityStars />` → 「現在のタスクにする」 button → 「削除」 button → 「明日にする / 今日にする」 button → 「完了」 button の 7 要素で, これらが横一列に並んでいる. tomorrow-view も同様 (`<button>現在のタスクにする</button>` は無いが他は同じ並び).

その結果, モックアップが意図した「プロジェクト → タスク名 → アクション」という上→下の視線誘導と, タスク名を主役にした視覚的階層が成立していない. アクションボタン群もタスク名と同列に並ぶため, タップ対象としての面積感も得にくい.

### user 指摘 (要約)

- 「モックアップ通りに 3 段ゾーン構造にしてほしい」
- 「タスク名を中央, アクションを下段に分けて, プロジェクト chip を上段に置きたい」

### 方針の核

`.day-view__card` を `flex-direction: column` に切り替え, 内部を 3 段の子コンテナで明示的に分割する.

- **上段** `.day-view__card__header`: `<span className="project-chip">` を配置する (BL-056 で実装済の chip がそのまま入る). プロジェクト未設定タスクでは chip 自体が無く header 段は空になるが, 段自体は DOM 上に常に存在させる (= 高さは chip の有無で変わる).
- **中段** `.day-view__card__title`: タスク名 (大きめ・中央寄せ) と `<PriorityStars />` を配置する. タスク名と星は左右に分かれて並ぶ.
- **下段** `.day-view__card__actions`: 「削除」「明日にする (or 今日にする)」「完了」「現在のタスクにする」の各アクション button を横並びで配置する. ボタンの並びと justify は D-002 / D-004 で確定.

カードの角丸は **`--radius-lg`** (16px) に引き上げる (BL-052 で `.day-view__card` に与えた `--radius-md` (12px) からの拡大). これは BL-056 で chip が使う `--radius-lg` と揃え, 「カード本体と chip の角丸の同調」を狙う (D-001).

shadow / hover / transition / animation は BL-052 / BL-054 / BL-056 と同方針で**一切追加しない**. 縁が「カードの本体」である.

## ゴール / 非ゴール

### ゴール

- **G-1 (3 段ゾーン構造の実現)**: `.day-view__card` が `flex-direction: column` の縦並びとなり, 内部に `.day-view__card__header` / `.day-view__card__title` / `.day-view__card__actions` の 3 子要素が DOM 上に常に存在する.
- **G-2 (今日ビュー反映)**: today-view (`/today`) の `focusedTask` セクション (`<section className="day-view__card day-view__card--focus">`) および `otherTasks` 一覧 (`<li className="day-view__card">`) が 3 段構造で描画される.
- **G-3 (明日ビュー反映)**: tomorrow-view (`/tomorrow`) の `<li className="day-view__card">` も 3 段構造で描画される.
- **G-4 (chip の上段配置)**: BL-056 で導入した `<span className="project-chip">` がカード上段 (`.day-view__card__header`) に配置される. プロジェクト割り当て済みタスクで chip が表示されることは BL-056 から維持される.
- **G-5 (タスク名と星の中段配置)**: タスク名 (`<span>`) と `<PriorityStars />` が中段 (`.day-view__card__title`) に配置される.
- **G-6 (3 ボタンの下段配置)**: 「削除」「明日にする (or 今日にする)」「完了」の 3 ボタンが下段 (`.day-view__card__actions`) に配置される. 「現在のタスクにする」も同じ下段に同居する (D-002).
- **G-7 (角丸スケールアップ)**: `.day-view__card` の `border-radius` が `--radius-md` から `--radius-lg` に引き上げられ, BL-056 の chip と同じ角丸スケールに揃う.
- **G-8 (トークン参照のみで完結)**: 本 BL では `web/src/styles/tokens.css` を**変更しない**. 既存トークン (`--radius-lg` / `--space-md` 等) のみで構成する (D-001).
- **G-9 (focus-view 不変更)**: `/focus` 単独ページ (`focus-view.css` / `focus-view.tsx`) は無改修.
- **G-10 (既存テスト全件 green)**: 既存単体テスト・E2E は本 BL の追従修正後に全件 green になる.

### 非ゴール

- **focus-view (`/focus`) のレイアウト変更**: focus-view は単独大表示で `.focus-view__card` を使う別構造. 本 BL では一切触らない (D-006).
- **起票フォーム (`.day-view__form`) のレイアウト変更**: BL-058 (起票フォーム 2D グリッド化) の対象であり, 本 BL のスコープ外.
- **`.project-chip` クラス自体の見直し**: BL-056 で確定済み. 本 BL では chip スタイルそのものには touch しない (= 配置 = 「どの段に置くか」だけが本 BL の関心).
- **`<PriorityStars />` 内部仕様の変更**: BL-040 で確定済み. 本 BL では JSX 上の配置箇所だけを変える.
- **「現在のタスクにする」button のラベル / 動作変更**: BL-043 で確定済み. 配置先 (下段 / D-002) のみ変える.
- **tokens.css への新規トークン追加**: 既存トークンで十分であることを D-001 で確定. 本 BL では新規トークンを追加しない.
- **hover 効果 / transition / animation / box-shadow**: 本 BL では一切追加しない (BL-052 / BL-054 / BL-056 と同方針).
- **タスク card 内のフォント / カラーの調整**: 本 BL の関心は **段構造 (= レイアウト)** のみ. タスク名のフォントサイズの絶対値変更等の visual 微調整は将来 BL の余地.
- **サーバ API / domain / Repository / mutation / query / ConflictDialog / notifyError 経路**: 一切無改修.
- **`projects-view` / `trash-view` / `settings-view` 等の他 view への展開**: 本 BL の対象は today / tomorrow のタスクカードに限る.

## 要件

### 機能要件

- **REQ-1 (`.day-view__card` のレイアウト方向変更)**

  `web/src/ui/day-view/day-view.css` の `.day-view__card` セレクタの宣言を以下のように変更する:

  - `flex-direction: column` を追加する.
  - `align-items: center` を `align-items: stretch` に変更する (= 各段の子要素が card 幅いっぱいに広がる).
  - `gap: var(--space-md)` (= 段と段の間隔) は維持する.
  - `border-radius` を `var(--radius-md)` から `var(--radius-lg)` に変更する (G-7 / D-001).
  - 既存の `background: var(--color-bg)` / `border: 1px solid var(--color-border)` / `padding: var(--space-md)` (BL-052) は維持する.
  - 既存の `display: flex` は維持する.

- **REQ-2 (`.day-view__card__header` クラスの新設 = 上段)**

  同 CSS に以下のルールを追加する:

  ```css
  .day-view__card__header {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }
  ```

  - `<span className="project-chip">` を子に持つ前提の段. chip 以外を置く要件は本 BL では無い.
  - chip が存在しないタスク (プロジェクト未設定) では子要素を一切持たない空の `<div>` となる. 空でも DOM 上には存在させる (= AC-4 で「3 段子要素が DOM 上に常に存在する」ことを assert する).

- **REQ-3 (`.day-view__card__title` クラスの新設 = 中段)**

  同 CSS に以下のルールを追加する:

  ```css
  .day-view__card__title {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-md);
  }
  ```

  - 子要素はタスク名 (`<span>`) と `<PriorityStars />` の 2 つを想定 (D-003 で星は中段に決定).
  - 「現在のタスク」セクションでは `<h2>現在のタスク</h2>` の見出しが先に来るが, それは中段 (`.day-view__card__title`) の外 (= header の外 / title の外) に置く方針とし, BL-051 で確定した DOM 構造を可能な限り維持する (詳細は plan §「DOM 再構成」で確定).
  - タスク名の中央寄せ表示 (画像の中段に書かれた「タスク名」の見え) は `justify-content: space-between` で左右に分けつつ, タスク名側を左寄せのままにする (= 完全中央寄せの `text-align: center` は採用しない / D-005).

- **REQ-4 (`.day-view__card__actions` クラスの新設 = 下段)**

  同 CSS に以下のルールを追加する:

  ```css
  .day-view__card__actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: var(--space-sm);
    flex-wrap: wrap;
  }
  ```

  - 子要素は「現在のタスクにする」 button + 「削除」「明日にする (今日にする)」「完了」の 3 ボタン. tomorrow-view 側では「現在のタスクにする」が無いため 3 ボタンのみ.
  - 並び順は **DOM 順 = 表示順** とし, 既存実装の順序 (今日ビュー: 現在のタスクにする → 削除 → 明日にする → 完了 / 明日ビュー: 削除 → 今日にする → 完了) を維持する (D-002 / D-004).
  - `justify-content: flex-end` でカード右側に寄せる (D-004 で確定).
  - `flex-wrap: wrap` でカード幅が狭い場合に折り返す (アクション数が 4 になる today-view ケースでの安全弁).

- **REQ-5 (today-view JSX の 3 段構造化)**

  `web/src/ui/today-view/today-view.tsx` を以下のように再構成する:

  - 5-1. `<section aria-label="現在のタスク" className="day-view__card day-view__card--focus">` 内 (L447 付近) を 3 段構造に書き換える.
    - `<h2>現在のタスク</h2>` は `<section>` の最初の子として現状維持 (= header 段の前) とする. もしくは header 段の前段として `<header>` を追加するかは plan で確定する.
    - `<div className="day-view__card__header">` を追加し, その中に `{focusedProject && <span className="project-chip">{focusedProject.name}</span>}` を置く.
    - `<div className="day-view__card__title">` を追加し, その中にタスク名 `<span>` と `<PriorityStars />` を置く.
    - `<div className="day-view__card__actions">` を追加し, その中に「現在のタスクにする」/「削除」/「明日にする (今日にする)」/「完了」の各 button を置く. 「現在のタスクにする」は focused 表示中のカード自身では `null` を表示する仕様 (BL-043 由来) 想定. 本 BL ではボタン構造そのものは変更しない (= 既存 JSX の condition `task !== focusedTask` のような分岐があれば維持する).
  - 5-2. `otherTasks.map((task) => ...)` の `<li key={task.id} className="day-view__card">` 内 (L521 付近) を 3 段構造に書き換える.
    - `<div className="day-view__card__header">{project && <span className="project-chip">{project.name}</span>}</div>` を最初の子として置く.
    - `<div className="day-view__card__title">{<span>{task.name}</span>}{<PriorityStars />}</div>` を次に置く.
    - `<div className="day-view__card__actions">` で「現在のタスクにする」/「削除」/「明日にする (今日にする)」/「完了」の各 button を囲む. `task.origin !== "routine"` の条件分岐 (BL-017) は維持する.

- **REQ-6 (tomorrow-view JSX の 3 段構造化)**

  `web/src/ui/tomorrow-view/tomorrow-view.tsx` の `<li key={task.id} className="day-view__card">` 内 (L434 付近) を 3 段構造に書き換える:

  - `<div className="day-view__card__header">{project && <span className="project-chip">{project.name}</span>}</div>` を置く.
  - `<div className="day-view__card__title">{<span>{task.name}</span>}</div>` を置く (tomorrow-view は `<PriorityStars />` を持たない既存仕様なのでタスク名のみ).
  - `<div className="day-view__card__actions">` で「削除」/「今日にする」(`task.origin !== "routine"` 条件)/「完了」の 3 button を囲む.

- **REQ-7 (chip の上段配置)**

  `<span className="project-chip">` は必ず `.day-view__card__header` の子として配置する. 上段以外 (中段 / 下段) に chip を置かない. これにより BL-056 で確立した「chip = 上段」というモックアップ準拠の視覚言語を守る.

- **REQ-8 (PriorityStars の中段配置 / D-003)**

  `<PriorityStars />` は `.day-view__card__title` の子として, タスク名 `<span>` の右側 (= JSX 上の後) に配置する. 中段以外 (header / actions) に星を置かない. これは tomorrow-view では存在しないため today-view (`focusedTask` セクション + `otherTasks` 一覧) のみが対象.

- **REQ-9 (「現在のタスクにする」button の下段配置 / D-002)**

  `<button>現在のタスクにする</button>` (BL-043 由来) は `.day-view__card__actions` の子として配置する. 並びは「現在のタスクにする → 削除 → 明日にする (今日にする) → 完了」の DOM 順 (既存実装の順序を維持).

- **REQ-10 (`.day-view__card--focus` のレイアウト追従)**

  `.day-view__card--focus` (today の現在タスク強調 variant) は `.day-view__card` のレイアウト (= 3 段構造) を継承する. 本 BL では `.day-view__card--focus` ルール本文に新たな宣言を追加しない (= BL-052 で確定した `border-width: 2px` / `border-radius: var(--radius-lg)` / `padding: var(--space-lg)` をそのまま維持). `.day-view__card` の `border-radius` を `--radius-lg` に上げたことで, `.day-view__card--focus` 側の `--radius-lg` 上書きは結果として「同値での上書き」となるが, セマンティクスを保つため `.day-view__card--focus` 側の宣言は撤去しない.

- **REQ-11 (focus-view 無改修)**

  `web/src/ui/focus-view/focus-view.css` および `web/src/ui/focus-view/focus-view.tsx` には触れない. `/focus` 単独ページは本 BL の対象外 (D-006).

- **REQ-12 (tokens.css 無改修)**

  `web/src/styles/tokens.css` には何も追加・変更しない. 既存トークンのみで完結する (D-001 で `--radius-lg` 流用を確定).

- **REQ-13 (空状態 / 起票フォーム / ヘッダ / リスト枠は無改修)**

  本 BL の対象は `.day-view__card` / `.day-view__card--focus` および新規 3 子クラスのみ. `.day-view` / `.day-view__header` / `.day-view__header h1` / `.day-view__form` / `.day-view__list` / `.day-view__empty` / `.project-chip` のルール本文には触れない.

### 非機能要件

- **NFR-NO-NEW-TOKENS**: 本 BL では tokens.css を変更しない. 新規トークン (例: `--radius-xl`) を追加しない (D-001).
- **NFR-NO-SHADOW**: 本 BL では `box-shadow` 宣言を追加しない (BL-052 / BL-054 / BL-056 と同方針).
- **NFR-NO-HOVER-TRANSITION**: 本 BL では `:hover` / `transition` / `animation` を新たに追加しない. 静的なレイアウトのみ.
- **NFR-A11Y**: `e2e/a11y.spec.ts` の WCAG 2.1 AA スキャンで violations 0 件を維持する. 本 BL の差分は `<div>` 入れ子の追加と CSS の追記のみで, ランドマーク / 見出し / aria 属性 / role / accessibleName は変えない.
- **NFR-DOM-ADDITIVE**: 既存の `<button>` / `<span>` / `<PriorityStars />` の各要素は **削除・改名しない**. 既存 DOM ノードを 3 つの新規 `<div>` で**囲うだけ**にする (= 既存の getByRole / getByText クエリは引き続き機能する). 追加ノードによる aria-label / role 変更は行わない.
- **NFR-COMPAT**: サーバ API / domain / Repository / mutation / query / ConflictDialog / notifyError 経路は無改修.
- **NFR-CONTRAST**: 色組み合わせの変更は無いため BL-046 で確認済みの WCAG AA は維持される.

## 受け入れ基準

> 書き方は [`../../quality/acceptance-criteria.md`](../../quality/acceptance-criteria.md) に従う.
> 検証コマンドはルートからの `npm test` を基準とする.

```
シナリオ AC-1: .day-view__card が 3 段ゾーン構造を成立させるレイアウト宣言を持つ
  Given web/src/ui/day-view/day-view.css を開いた
  When  .day-view__card セレクタのルール本文を観察する
  Then  display: flex の宣言を含む
   かつ flex-direction: column の宣言を含む
   かつ align-items: stretch の宣言を含む (align-items: center は含まない)
   かつ gap: var(--space-md) の宣言を含む (回帰防止)
   かつ background: var(--color-bg) / border: 1px solid var(--color-border) / padding: var(--space-md) の宣言を含む (BL-052 維持)
```

```
シナリオ AC-2: .day-view__card の border-radius が --radius-lg に引き上げられている
  Given web/src/ui/day-view/day-view.css を開いた
  When  .day-view__card セレクタのルール本文を観察する
  Then  border-radius プロパティに var(--radius-lg) を参照する宣言を含む (BL-052 の var(--radius-md) からの引き上げ)
```

```
シナリオ AC-3: 3 子クラス (.day-view__card__header / .day-view__card__title / .day-view__card__actions) が定義されている
  Given web/src/ui/day-view/day-view.css を開いた
  When  ファイル全体を観察する
  Then  .day-view__card__header セレクタのルールが定義されている
   かつ .day-view__card__title セレクタのルールが定義されている
   かつ .day-view__card__actions セレクタのルールが定義されている
   かつ 各ルール本文に display: flex の宣言を含む
   かつ .day-view__card__actions ルール本文に justify-content: flex-end の宣言を含む
```

```
シナリオ AC-4: today-view の各タスクカードに 3 子要素 (header / title / actions) が DOM 上に存在する
  Given /today を jsdom 環境でレンダリングした
   かつ tasks に少なくとも 1 件のタスクが存在する
  When  document 内の <li class="day-view__card"> 要素を 1 つ取得する
  Then  その内部に直下子要素として querySelector(".day-view__card__header") が要素を返す
   かつ querySelector(".day-view__card__title") が要素を返す
   かつ querySelector(".day-view__card__actions") が要素を返す
```

```
シナリオ AC-5: tomorrow-view の各タスクカードに 3 子要素が DOM 上に存在する
  Given /tomorrow を jsdom 環境でレンダリングした
   かつ tasks に少なくとも 1 件のタスクが存在する
  When  document 内の <li class="day-view__card"> 要素を 1 つ取得する
  Then  その内部に直下子要素として querySelector(".day-view__card__header") が要素を返す
   かつ querySelector(".day-view__card__title") が要素を返す
   かつ querySelector(".day-view__card__actions") が要素を返す
```

```
シナリオ AC-6: .day-view__card__actions の中に「削除」「明日にする (or 今日にする)」「完了」が含まれる
  Given /today を jsdom 環境でレンダリングした
   かつ otherTasks リストに少なくとも 1 件のタスクが存在する
  When  そのタスクのカード (= <li>) 内の .day-view__card__actions 要素の子 button を取得する
  Then  「削除」 button を含む
   かつ task.origin !== "routine" の場合「明日にする」 button を含む
   かつ 「完了」 button を含む
```

```
シナリオ AC-7: 「現在のタスクにする」 button が .day-view__card__actions 内に存在する (D-002)
  Given /today を jsdom 環境でレンダリングした
   かつ otherTasks リストに少なくとも 1 件のタスクが存在する
  When  そのタスクのカード (= <li>) 内の .day-view__card__actions 要素の子 button を取得する
  Then  「現在のタスクにする」 button を含む
   かつ アクション段以外 (header / title) の中には「現在のタスクにする」 button が存在しない
```

```
シナリオ AC-8: <PriorityStars /> (radiogroup) が .day-view__card__title 内に存在する (D-003)
  Given /today を jsdom 環境でレンダリングした
   かつ otherTasks リストに少なくとも 1 件のタスクが存在する
  When  そのタスクのカード (= <li>) 内の .day-view__card__title 要素の中を観察する
  Then  優先度を表す role="radiogroup" 要素が存在する (= <PriorityStars /> が中段にある)
   かつ アクション段 (.day-view__card__actions) や header 段 (.day-view__card__header) の中には radiogroup が存在しない
```

```
シナリオ AC-9: .project-chip が .day-view__card__header 内に配置されている (D-003 補完)
  Given /today を jsdom 環境でレンダリングした
   かつ projects に少なくとも 1 件のプロジェクトが存在する
   かつ tasks に projectId がそのプロジェクトを指すタスクが少なくとも 1 件存在する
  When  そのタスクのカード (= <li>) 内の .day-view__card__header 要素の中を観察する
  Then  そこに <span class="project-chip"> が存在する (= chip が上段にある)
   かつ アクション段 / 中段の中には .project-chip が存在しない
```

```
シナリオ AC-10: プロジェクト未設定タスクでも 3 段子要素は DOM 上に存在する (header は空でも段は存在)
  Given /today を jsdom 環境でレンダリングした
   かつ tasks に projectId === null のタスクが少なくとも 1 件存在する
   かつ そのタスクのカード (= <li>) を取得した
  When  そのカード内の querySelector(".day-view__card__header") を観察する
  Then  要素は存在する (null ではない)
   かつ その内部に .project-chip 要素は無い (= header 段は空)
```

```
シナリオ AC-11: tokens.css が変更されていない (NFR-NO-NEW-TOKENS)
  Given 本 BL の実装がマージされた
  When  web/src/styles/tokens.css を BL-056 完了時点の状態と比較する
  Then  差分が無い
   かつ 本 BL で参照する --radius-lg / --space-md / --space-sm が引き続き定義されている
   かつ --radius-xl のような本 BL では追加すべきでない token が存在しない
```

```
シナリオ AC-12: focus-view (/focus) の CSS / TSX を変更していない (REQ-11)
  Given 本 BL の実装がマージされた
  When  web/src/ui/focus-view/focus-view.css と web/src/ui/focus-view/focus-view.tsx を BL-056 完了時点の状態と比較する
  Then  差分が無い
```

```
シナリオ AC-13: day-view.css の対象外セレクタには本 BL の追記が無い (REQ-13)
  Given 本 BL の実装がマージされた
  When  web/src/ui/day-view/day-view.css の対象外セレクタ (.day-view / .day-view__header /
        .day-view__header h1 / .day-view__form / .day-view__list / .day-view__empty / .project-chip)
        のルール本文を観察する
  Then  BL-056 完了時点と同じ宣言のままで, 本 BL での追記が無い
```

```
シナリオ AC-14: day-view.css 全体で box-shadow を追加していない (NFR-NO-SHADOW)
  Given web/src/ui/day-view/day-view.css を開いた
  When  ファイル全体を観察する
  Then  box-shadow キーワードを含む宣言が存在しない
```

```
シナリオ AC-15: 新規 3 子クラスに hover / transition / animation / box-shadow が含まれない
  Given web/src/ui/day-view/day-view.css を開いた
  When  .day-view__card__header / .day-view__card__title / .day-view__card__actions の各ルール本文を観察する
  Then  box-shadow / transition / animation 宣言を含まない
   かつ .day-view__card__header:hover 等の派生セレクタを CSS 内に持たない
```

```
シナリオ AC-16: 既存テスト全件 green 維持
  Given /today /tomorrow /focus 等が引き続きレンダリング可能
  When  ルートから npm test (vitest 単体テスト全件) を実行する
  Then  すべて green である
   かつ 既存テスト (today-view.test.tsx / tomorrow-view.test.tsx / unified-day-view.test.tsx /
        task-card-design.test.ts / form-card-design.test.ts / project-chip.test.tsx /
        design-tokens.test.ts) は本 BL の追従修正後に green になる
```

```
シナリオ AC-17: 既存 E2E 全件 green 維持
  Given /today /tomorrow をはじめとする全 view がレンダリング可能
  When  npx playwright test を実行する
  Then  すべて green である
   かつ タスクカード上のボタン操作 (削除 / 明日にする / 完了 / 現在のタスクにする)
        を含む既存 E2E (tasks.spec.ts / today-view-create-form.spec.ts /
        state-restoration.spec.ts 等) は本 BL の追従修正後に green になる
```

```
シナリオ AC-18: アクセシビリティ違反 0 件を維持する
  Given /today /tomorrow をはじめとする全 view がレンダリング可能
  When  @axe-core/playwright で WCAG 2.1 AA をスキャンする (e2e/a11y.spec.ts の既存スキャン)
  Then  すべてのスキャンで violations.length === 0
```

## 重要な決定 (D 章)

- **D-001 (角丸スケールアップは `--radius-lg` 流用 / 新規 token 不採用)**: 「`--radius-md` (12px) → `--radius-xl` (新規 / 20px 等)」と「`--radius-md` → `--radius-lg` (16px / 既存)」の 2 案を検討した結果, **`--radius-lg` を流用**する.
  - (i) BL-056 で `.project-chip` が `--radius-lg` を使っている. カード本体と chip の角丸を同じ値に揃えることで「chip = カードの一部」という連続感が出る (= モックアップの「chip 角丸とカード角丸が同調する見え」と一致).
  - (ii) tokens.css に新規トークンを追加すると BL-046 (design-tokens) の安定性を破ることになる. 既存トークンで満たせる要件であれば既存を流用する原則 (NFR-NO-NEW-TOKENS).
  - (iii) `.day-view__card--focus` (BL-052) は既に `--radius-lg` を持つため, 通常カードも `--radius-lg` に上げると「強調 variant との radius 差が消える」懸念があるが, 強調 variant の主な差別化軸は `border-width: 2px` と `padding: var(--space-lg)` であり, radius は補助的な強調手段にすぎない (BL-052 D-002). radius の差が消えても強調は border + padding で十分に成立する.
  - 以上から本 BL では `.day-view__card` の `border-radius` を `var(--radius-md)` → `var(--radius-lg)` に変更し, `.day-view__card--focus` の `border-radius: var(--radius-lg)` 宣言はそのまま残す (= 結果として「同値での上書き」になるがセマンティクス維持のため撤去しない / REQ-10).

- **D-002 (「現在のタスクにする」button は下段 actions に同居 / 案 ii 採用)**: モックアップの 3 ボタン (削除 / 明日にする / 完了) に加えて, BL-043 の「現在のタスクにする」 button をどこに置くかの選択肢:
  - (i) 中段 `.day-view__card__title` の右側 (= 星の隣) — 中段が状態操作系で混雑し, タスク名の主役感が損なわれる.
  - (ii) **下段 `.day-view__card__actions` 内に「削除 / 明日にする / 完了」と並べる (= 画像の 3 ボタンが 4 ボタンになる)** — 採用.
  - (iii) 別段として `.day-view__card__set-focus` を新設 — 4 段構造になり画像の 3 段構造から離れる.
  - (iv) 既存配置 (中段にタスク名と並列) を許容 — 画像通りの 3 ボタンに見える条件を満たさない.

  採用理由: モックアップの画像は「省略された抽象」と解釈する. 機能上「現在のタスクにする」も「削除」「明日にする」「完了」と同じく**カード単位の操作**であり, 同じ下段に並べることが意味的にも自然. ボタン数が 4 になる点は `flex-wrap: wrap` (REQ-4) で吸収する.

- **D-003 (`<PriorityStars />` は中段 title 内に配置 / 案 i 採用)**: 画像にはタスクカード側の星表示が明示されていない (= 完了タスクのアクションに焦点を当てた抽象表現と解釈) ため, 3 案から決定する:
  - (i) **中段 `.day-view__card__title` の右側 (= タスク名と並列)** — 採用.
  - (ii) 上段 `.day-view__card__header` (= chip と並列で右端) — 上段の意味が「メタ情報 = プロジェクト」から「メタ情報 + 優先度操作」に拡張され, 上段の単純さが崩れる.
  - (iii) 別段 (header と title の間) — 段数が増え画像の 3 段構造から離れる.

  採用理由: 星は「タスクの状態 (優先度)」を表しタスク名と意味的に結びつきが強い (= タスク名の隣にあるのが自然). 中段の `justify-content: space-between` でタスク名 (左) と星 (右) に分かれて並ぶレイアウトと相性が良い.

- **D-004 (下段 actions の並び = DOM 順 / justify-content: flex-end)**: 画像では `[削除 / 明日にする / 完了]` の 3 ボタンが左から右に並んで見える. 並びの方針:
  - DOM 順 = 既存実装の順序 (今日: 現在のタスクにする → 削除 → 明日にする → 完了 / 明日: 削除 → 今日にする → 完了) を**維持する**. 並び順の変更は a11y (Tab フォーカス順) と既存 E2E のロケータに影響するため避ける.
  - `justify-content` は `flex-end` を採用する (= カード右側に寄せる).
    - `space-between` は 4 ボタンになった時の間隔が広がりすぎる.
    - `flex-start` (左寄せ) はタスク名と垂直に揃わず, モックアップの「[削除] [明日にする] [完了] が右側に寄って並ぶ」見えと合わない.
    - `flex-end` (右寄せ) は今日 / 明日双方のボタン数差 (4 vs 3) を吸収でき, 右下端に「操作のかたまり」が来る一般的な UI パターンとも一致する.
  - `gap: var(--space-sm)` でボタン間隔を確保する. `var(--space-md)` (= 16px) はボタン同士で広すぎる.
  - `flex-wrap: wrap` を入れ, 狭幅端末でも崩れないようにする.

- **D-005 (タスク名は完全中央寄せ `text-align: center` を採用せず, `justify-content: space-between` で左右配置 / 画像読み違いを採用)**: 画像中段の「タスク名」は中央に書かれているように見えるが, タスク名と星 (= 状態操作系) の 2 要素を中段に配置する仕様 (D-003) を採れば, 完全中央寄せにすると星との並列が崩れる (= タスク名が中央に来た上で星はそのさらに右に追いやられ, タスク名の重心がカード中央からズレる). 案:
  - **`justify-content: space-between` で「タスク名 (左寄せ) / 星 (右寄せ)」の 2 要素レイアウト**を採用する (= 本 BL).
  - 画像の「中央寄せ」見えは抽象化と解釈する (= 星が省略された画像で, タスク名のみが描かれているため中央に見える).
  - 将来, 「タスクカードに星を出さない」「星は header に移す (D-003 ii)」等の方針転換があった場合は `text-align: center` 採用も検討余地あり (本 BL のスコープ外).

- **D-006 (focus-view は完全不変更)**: focus-view (`/focus`) の画像上半分は「中央に input ぽい下線 + 下に削除/完了の 2 ボタン両端寄せ」という別構造であり, focus-view 専用 CSS (`focus-view.css`) で実装される. 本 BL のスコープは day-view 名前空間 (`.day-view__card` / `--focus`) のみ.
  - today-view 内の `.day-view__card--focus` (= focused タスクの強調表示) は 3 段ゾーン構造に追従する必要がある (BL-052 / today の `<section className="day-view__card day-view__card--focus">`). 「現在のタスクにする」/「現在解除」は仕様上ない (= focused タスクの自カードに「現在のタスクにする」ボタンは出ない / BL-043) ため, focused カードの actions 段には削除 / 明日にする / 完了 の 3 ボタンのみが入る想定.
  - `/focus` ルート (= `focus-view.tsx` で描画される単独ページ) の CSS は無改修.

- **D-007 (既存 E2E への影響 = 最小)**: 既存 E2E (tasks.spec.ts / today-view-create-form.spec.ts / state-restoration.spec.ts 等) は `page.getByRole("button", { name: "削除" })` のように role + accessibleName でロケートしている. 本 BL では新規 `<div>` で既存要素を**囲うだけ**で role / accessibleName は変えないため (NFR-DOM-ADDITIVE), 既存 E2E はロケータ書き換えが不要な見込み.
  - 例外: 「タスクカード内のボタン」を `<li>` 子要素として取得しているテストがあれば, それは `<li>` 内の任意の子孫 button として書き直す必要がある (`<li>` 直下から `<div className="day-view__card__actions">` の子孫に変わる).
  - plan で具体テストファイルの追従要否を一覧化する.

- **D-008 (テスト方針 = CSS 直読み + DOM レンダの両方)**: BL-052 / BL-054 / BL-056 で確立した検証スタイルを踏襲する.
  - (i) **CSS 直読み**: AC-1 / AC-2 / AC-3 / AC-13 / AC-14 / AC-15 (= `.day-view__card` レイアウト宣言 / `border-radius` 値 / 新規 3 子クラスの存在 / 他セレクタ不変 / box-shadow 不在 / hover-transition 不在).
  - (ii) **DOM レンダ assert (jsdom)**: AC-4 / AC-5 / AC-6 / AC-7 / AC-8 / AC-9 / AC-10 (= 3 子要素 DOM 存在 / 各段の中身配置 / プロジェクト未設定時の空 header).
  - (iii) **既存テスト追従**: today-view.test.tsx / tomorrow-view.test.tsx / unified-day-view.test.tsx / project-chip.test.tsx で DOM 構造を見ているテストが新規 `<div>` 入れ子で壊れるなら追従修正する. ただし NFR-DOM-ADDITIVE 方針により多くは無修正で通る想定.
  - (iv) **task-card-design.test.ts (BL-052)** の AC-1 の `align-items: center` を assert している箇所 (L127) は本 BL で `align-items: stretch` に変えるため追従修正が必要 (plan で詳細を確定).
  - (v) 新規テストは `web/__tests__/task-card-zone-layout.test.ts` (CSS) と `web/__tests__/task-card-zone-layout.test.tsx` (DOM) の 2 ファイル, または DOM レンダを既存 today/tomorrow-view.test.tsx に追記する形のどちらかとする. 本 BL では「`task-card-zone-layout.test.ts` 1 ファイルに CSS + DOM レンダの両方を集約する」方針を採用 (plan で確定).

## 未決事項 / 確認待ち

- なし (user との合意は方針セクションで合意済み. D-001〜D-008 で本 BL の判断軸はすべて確定. 詳細な test ファイル分割 / extractRuleBody ヘルパの取扱は plan で確定する).
