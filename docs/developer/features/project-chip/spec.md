# 仕様: プロジェクト名 chip スタイル新設 + タスクカードへの表示追加 (project-chip)

- 状態: 確定
- 関連:
  - [`../../planning/backlog.md`](../../planning/backlog.md) BL-056
  - 依存 BL: BL-035 (UI 再設計の土台) / BL-041 (project-toggle-ui) / BL-046 (design-tokens) / BL-051 (unified-day-view) / BL-052 (task-card-design) / BL-054 (form-card-design)
  - 関連 feature:
    - [`../unified-day-view/spec.md`](../unified-day-view/spec.md) — `day-view__` 名前空間と `.day-view__card` の DOM 構造 (本 BL の前提)
    - [`../task-card-design/spec.md`](../task-card-design/spec.md) — `.day-view__card` の縁・余白・角丸の visual 基盤
    - [`../form-card-design/spec.md`](../form-card-design/spec.md) — `.day-view__form` の縁・余白・角丸の visual 基盤
    - [`../project-toggle-ui/spec.md`](../project-toggle-ui/spec.md) (BL-041) — `<ProjectToggle />` の button UI (本 BL で chip 化する対象)
    - [`../design-tokens/`](../design-tokens/) (BL-046) — 本 BL が参照する `--color-border` / `--radius-lg` / `--space-xs` / `--space-sm` / `--font-size-small` / `--color-fg`
  - 後続 BL (依存される側): BL-057 (タスクカード 3 段ゾーン化) / BL-058 (起票フォーム 2D グリッド化) — 両 BL の chip 表示前提として本 BL の `.project-chip` が使われる
  - 上位要件: NFR-010 (最小手数 / 一貫した UI)

## 背景 / 課題

モックアップ `local/image.png` では起票フォームとタスクカードの両方で「プロジェクト名」が**角丸カプセル (chip / pill) 形状**で表示されているが, 現状は次の 2 つの問題で「視覚的に同じ要素」として扱われていない:

- **(a) タスクカード側**: `web/src/ui/today-view/today-view.tsx` の `<li className="day-view__card">` (L510 周辺) には **プロジェクト名そのものが表示されていない** (タスク名 `<span>` + `<PriorityStars />` + 「現在のタスクにする」 button + 「削除 / 明日にする / 完了」3 ボタンのみ). `tomorrow-view.tsx` 側は `{project && <span>{project.name}</span>}` でプレーンな文字としては表示されているが, chip 形状ではない. すなわち today / tomorrow で**表示有無も見た目も非対称**.
- **(b) 起票フォーム側**: BL-041 で導入された `<ProjectToggle />` (`web/src/ui/project-toggle/`) は `.project-toggle__button` (`border: 1px solid var(--color-fg-subtle)` / `border-radius: 0.5rem`) のプレーンなボタン UI で表示されており, **chip 見た目ではない**.

本 BL の役割は, タスクカードと起票フォームの両方で再利用できる**プロジェクト名表示用の chip スタイル共通基盤 (`.project-chip`)** を新設し, それを (1) タスクカード DOM への新規挿入と (2) `<ProjectToggle />` の button への適用に同時に当てることで, **両者の視覚言語を統一**することである. これにより, モックアップで意図された「プロジェクト名は常に角丸カプセル」というルールが UI 全体で守られる.

本 BL は BL-057 (タスクカードの 3 段ゾーン化) / BL-058 (起票フォームの 2D グリッド化) の**先行 BL** である. 後続両 BL はレイアウト変更を主体とするが, 「プロジェクト名 = `.project-chip`」という視覚言語そのものは本 BL で確定済みであることを前提として進む.

### user 指摘 (要約)

- 「タスクカードと起票フォーム両方でプロジェクト名は角丸カプセル形状にしてほしい (モックアップ準拠)」
- 「タスクカードにはプロジェクト名そのものを表示してほしい (today 側に欠落している)」

### 方針の核

- **共通 CSS クラス `.project-chip` を新設**する. 値は `border: 1px solid var(--color-border)` (= BL-052 / BL-054 と同じ縁) + `border-radius: var(--radius-lg)` (= 16px, pill 形に十分大きい既存トークン) + `padding: var(--space-xs) var(--space-sm)` (= 4px 8px, chip サイズの小余白) + `font-size: var(--font-size-small)` (= 14px) + `color: var(--color-fg)` の組み合わせ.
- **タスクカード DOM への新規挿入**: today-view.tsx / tomorrow-view.tsx の `<li className="day-view__card">` 内に `<span className="project-chip">{project.name}</span>` を新規追加する. `project` が `null` (= プロジェクト未設定 / 削除済 id 参照) の場合は **chip 自体を非表示** にする (= span を出さない).
- **ProjectToggle への適用**: `<button className="project-toggle__button">` の className に `.project-chip` を**追加**する (置換しない / 既存 className も維持). 既存 `.project-toggle__button` の固有プロパティ (cursor / min-height 44px / focus-visible outline 等) は残し, 視覚 (border / radius / padding / font-size) を `.project-chip` で上書き・統一する.

## ゴール / 非ゴール

### ゴール

- **G-1 (`.project-chip` 共通スタイルの新設)**: `web/src/ui/day-view/day-view.css` に `.project-chip` セレクタを追加し, 「角丸カプセル / 縁 / 小余白 / 小フォント」の chip 視覚言語を確立する.
- **G-2 (today タスクカードへの chip 表示追加)**: `/today` の `<li className="day-view__card">` 内に, プロジェクト割り当て済みのタスクで `<span className="project-chip">{project.name}</span>` が表示される.
- **G-3 (tomorrow タスクカードへの chip 表示統一)**: `/tomorrow` の既存プロジェクト名表示 (`{project && <span>{project.name}</span>}`) を `<span className="project-chip">{project.name}</span>` に置き換え, today と同じ chip 見た目に統一する.
- **G-4 (ProjectToggle の chip 化)**: `<ProjectToggle />` の `<button>` 要素が `.project-chip` className を含み, タスクカード上の chip と視覚的に同じ要素として表示される.
- **G-5 (トークン参照のみで完結)**: `web/src/styles/tokens.css` を**変更しない**. 既存トークン (`--color-border` / `--radius-lg` / `--space-xs` / `--space-sm` / `--font-size-small` / `--color-fg`) のみで構成する.
- **G-6 (差分の局所化)**: 変更は (i) `web/src/ui/day-view/day-view.css` への `.project-chip` 追加, (ii) `today-view.tsx` / `tomorrow-view.tsx` への chip span 挿入 / 置換, (iii) `project-toggle.tsx` の button className 追加, の 3 領域に限定する. 他 view (focus-view / projects-view / trash-view 等) は無改修.
- **G-7 (既存テスト全件 green)**: BL-051 / BL-052 / BL-054 で確定した DOM 構造 / aria-label / role / accessibleName は無変更. 既存単体テスト・E2E は無修正で通る (DOM 追加はあるが既存テストの query は維持される).

### 非ゴール

- **タスクカードの 3 段ゾーン構造化**: BL-057 の対象. 本 BL では `.day-view__card` の現状 1 行水平レイアウト (`display: flex` / `align-items: center` / `gap: var(--space-md)`) を維持したまま, span を 1 つ挿入するのみ.
- **起票フォームの 2D グリッド配置**: BL-058 の対象. 本 BL では `.day-view__form` のレイアウトには touch しない. ProjectToggle の見た目 (`.project-chip` 適用) のみ統一する.
- **tokens.css への新規トークン追加**: `--radius-pill: 9999px` のような新規 token を追加しない (D-003). 既存 `--radius-lg` (= 16px) で「角丸カプセル」として十分認識可能であることを確認済み (chip の中身が 14px 1 行で高さおよそ 22-24px / radius 16px は半径の方が高さの大半をカバーする = pill 形となる).
- **focus-view (`/focus`) / projects-view (`/projects`) / trash-view 等の他 view への chip 適用**: 本 BL の対象は today / tomorrow + 起票フォーム (ProjectToggle 経由) のみ. 他 view への展開は将来 BL で検討.
- **chip の hover / transition / animation / box-shadow**: 本 BL では一切追加しない. 静的な border / radius / padding / font-size のみ (BL-052 / BL-054 と同方針).
- **ProjectToggle 専用 CSS (`.project-toggle__button` の border / border-radius) の撤去**: D-004 で「既存 className に `.project-chip` を**追加**」を採用. `.project-toggle__button` 側の `border: 1px solid var(--color-fg-subtle)` / `border-radius: 0.5rem` 等は本 BL では撤去しない (= CSS カスケードで `.project-chip` の宣言が上書きする形を許容する). 専用 CSS の整理は将来 BL の余地.
- **chip 自体に `<button>` セマンティクスを与える**: タスクカード側の `<span className="project-chip">` は純粋な表示要素であり, クリックや role 付与等は不要. ProjectToggle 側はもともと `<button>` のため影響なし.
- **「未分類」chip の表示**: D-002 で「プロジェクト未設定時は chip 自体を非表示」を採用. タスクカード側で `<span className="project-chip">（未分類）</span>` のようなプレースホルダ chip は出さない. (ProjectToggle 側は既存仕様通り「（未分類）」を表示するが, これは BL-041 で確定済みの ProjectToggle 内部仕様であり, 本 BL の chip の表示有無ルールとは別概念.)
- **「未分類」リテラルの定義変更**: ProjectToggle の `UNCATEGORIZED_LABEL = "（未分類）"` (BL-041 確定) には触れない.
- **サーバ API / domain / Repository / mutation / query / ConflictDialog / notifyError 経路**: 一切無改修.
- **E2E テスト追加**: 本 BL では Playwright スイートを追加・改修しない. visual は CSS 直読みの単体テスト, DOM 表示は既存 jsdom 単体テストの追従で担保する.

## 要件

### 機能要件

- **REQ-1 (`.project-chip` 共通スタイルの新設)**

  `web/src/ui/day-view/day-view.css` に以下のルールを追加する:

  ```css
  .project-chip {
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    padding: var(--space-xs) var(--space-sm);
    font-size: var(--font-size-small);
    color: var(--color-fg);
  }
  ```

  - 値の根拠: 既存トークン (BL-046) のみで構成する (G-5 / D-003).
  - `display` プロパティは指定しない. 既定 (inline) のまま, `<span>` / `<button>` のいずれの要素に当てても周囲のフローに馴染むようにする.
  - `background` は指定しない. 親カード (`.day-view__card` / `.day-view__form` = `var(--color-bg)` / 白) の地色を抜けて使う (chip 自体に塗りを与えると過度に目立つため. user 想定 = モックアップでも塗りは無い).

- **REQ-2 (today タスクカードへの chip 表示追加)**

  `web/src/ui/today-view/today-view.tsx` の `<li key={task.id} className="day-view__card">` 内 (L510 周辺) で, `<span>{task.name}</span>` (タスク名表示) の**直前**に以下を追加する:

  ```tsx
  {(() => {
    const project = task.projectId
      ? (projects.find((p) => p.id === task.projectId) ?? null)
      : null;
    return project ? <span className="project-chip">{project.name}</span> : null;
  })()}
  ```

  - `task.projectId` が `null` または `projects` 配列に該当 id が無い場合は **`<span>` を出力しない** (D-002).
  - 既存の `<span>{task.name}</span>` / `<PriorityStars />` / 「現在のタスクにする」 button / 3 ボタンの位置・並びは変更しない (= chip 挿入のみ / D-005).
  - 「現在のタスク」セクション (`<section className="day-view__card day-view__card--focus">` / `focusedTask`) 側でも同じ要領で chip を追加する (= タスクカード扱いに統一).

- **REQ-3 (tomorrow タスクカードの chip 化)**

  `web/src/ui/tomorrow-view/tomorrow-view.tsx` の `<li key={task.id} className="day-view__card">` 内 (L434 周辺) で, 既存の `{project && <span>{project.name}</span>}` を以下に置き換える:

  ```tsx
  {project && <span className="project-chip">{project.name}</span>}
  ```

  - `project` の解決ロジック (`task.projectId ? (projects.find((p) => p.id === task.projectId) ?? null) : null`) は無変更 (= 既存実装を維持).
  - 既存 span の位置 (`<span>{task.name}</span>` の直前) は変更しない (D-005).

- **REQ-4 (ProjectToggle button への `.project-chip` 追加)**

  `web/src/ui/project-toggle/project-toggle.tsx` の `<button>` 要素の `className` を以下に変更する:

  - 変更前: `className="project-toggle__button"`
  - 変更後: `className="project-toggle__button project-chip"`

  - 既存 `.project-toggle__button` className は**残す** (D-004 / 置換ではなく追加).
  - JSX の他属性 (`type` / `aria-label` / `aria-describedby` / `data-current-id` / `onClick`) は無変更.

- **REQ-5 (プロジェクト未設定時の表示挙動 / D-002)**

  タスクカード側 (REQ-2 / REQ-3) で `project === null` の場合, `<span className="project-chip">` を一切 DOM に出力しない. プレースホルダ chip (例: `<span className="project-chip">（未分類）</span>`) は出さない.

  - 結果として, プロジェクト未設定のタスクのカードは「タスク名 + 星 + ボタン群」の現状とほぼ同じ見た目になる (= chip 分の余白が無いだけ違う).
  - ProjectToggle 側 (REQ-4) は既存仕様通り `value === null` で「（未分類）」を表示する. これは本 REQ-5 の対象外 (= ProjectToggle 内部仕様 / BL-041 確定).

- **REQ-6 (対象セレクタの限定)**

  本 BL で `web/src/ui/day-view/day-view.css` に追加する宣言は REQ-1 の `.project-chip` セレクタ分のみとする. 既存セレクタ (`.day-view` / `.day-view__header` / `.day-view__header h1` / `.day-view__form` / `.day-view__list` / `.day-view__card` / `.day-view__card--focus` / `.day-view__empty`) には**触れない**.

- **REQ-7 (tokens.css 無改修)**

  `web/src/styles/tokens.css` には何も追加・変更しない. 既存トークンのみで完結する (G-5 / D-003).

- **REQ-8 (focus-view / 他 view 無改修)**

  `web/src/ui/focus-view/focus-view.css` / projects-view / trash-view 等の CSS には触れない. chip スタイルは day-view.css に置くが, 適用範囲は今回 today / tomorrow + ProjectToggle に限る (G-6).

- **REQ-9 (ProjectToggle 専用 CSS の保持)**

  `web/src/ui/project-toggle/project-toggle.css` は本 BL では**変更しない** (D-004). 既存の `.project-toggle__button` の border / border-radius / padding 等の宣言は残し, CSS カスケードで `.project-chip` の宣言が後勝ちで効くことを利用する.

  - 注: day-view.css は今回 `.project-chip` を追加するため, アプリ全体での読み込み順 (main.tsx 経由) で project-toggle.css より後に読まれる前提. 万一順序が逆だと `.project-chip` の border / border-radius が `.project-toggle__button` の宣言で上書きされる. plan §「リスク R-X」で扱う.

### 非機能要件

- **NFR-NO-NEW-TOKENS**: 本 BL では tokens.css を変更しない. 新規 `--radius-pill` 等を追加しない (BL-046 安定性保護).
- **NFR-NO-SHADOW**: 本 BL では `box-shadow` 宣言を追加しない (BL-052 / BL-054 と同方針 / user 明言「shadow は脇役, border が主役」).
- **NFR-NO-HOVER-TRANSITION**: 本 BL では `:hover` / `transition` / `animation` を `.project-chip` に追加しない.
- **NFR-DOM-MINIMAL-CHANGE**: タスクカードへの span 追加は新規 DOM ノードを増やすが, 既存テストの query (タスク名 / aria-label / button 名で取得) は維持される. 既存テストの追従はゼロまたは最小.
- **NFR-A11Y**: `e2e/a11y.spec.ts` の WCAG 2.1 AA スキャンで violations 0 件を維持する. chip は純粋な表示 `<span>` (タスクカード側) または既存 `<button>` (ProjectToggle 側) のため, ランドマーク / 見出し / aria 属性に影響しない.
- **NFR-COMPAT**: サーバ API / domain / Repository / mutation / query / ConflictDialog / notifyError 経路は無改修.
- **NFR-CONTRAST**: `--color-fg` (= `#1a1a1a`) / `--color-border` (= `#ccc`) / 親 `--color-bg` (= `#fff`) の組み合わせは BL-046 で WCAG AA を確認済み. chip 用に新しい色組み合わせを導入しない.

## 受け入れ基準

> 書き方は [`../../quality/acceptance-criteria.md`](../../quality/acceptance-criteria.md) に従う.
> 検証コマンドはルートからの `npm test` を基準とする (BL-055 vitest 集約未着手 / 過去 BL 慣行).

```
シナリオ AC-1: .project-chip 共通スタイルが定義されている
  Given web/src/ui/day-view/day-view.css を開いた
  When  .project-chip セレクタのルール本文を観察する
  Then  border プロパティに 1px solid var(--color-border) を参照する宣言を含む
   かつ border-radius プロパティに var(--radius-lg) を参照する宣言を含む
   かつ padding プロパティに var(--space-xs) と var(--space-sm) を参照する宣言を含む
   かつ font-size プロパティに var(--font-size-small) を参照する宣言を含む
```

```
シナリオ AC-2: today-view にプロジェクト割り当て済みタスクで chip が表示される
  Given /today を jsdom 環境でレンダリングした
   かつ projects に少なくとも 1 件のプロジェクトが存在する
   かつ tasks に projectId がそのプロジェクトを指すタスクが少なくとも 1 件存在する
  When  document 内の `.project-chip` クラス要素を querySelectorAll で列挙する
  Then  少なくとも 1 つ取得できる
   かつ そのうち少なくとも 1 つのテキストが該当プロジェクトの name と一致する
```

```
シナリオ AC-3: tomorrow-view にプロジェクト割り当て済みタスクで chip が表示される
  Given /tomorrow を jsdom 環境でレンダリングした
   かつ projects に少なくとも 1 件のプロジェクトが存在する
   かつ tasks に projectId がそのプロジェクトを指すタスクが少なくとも 1 件存在する
  When  document 内の `.project-chip` クラス要素を querySelectorAll で列挙する
  Then  少なくとも 1 つ取得できる
   かつ そのうち少なくとも 1 つのテキストが該当プロジェクトの name と一致する
```

```
シナリオ AC-4: ProjectToggle の button が .project-chip className を含む
  Given web/src/ui/project-toggle/project-toggle.tsx を開いた
  When  ProjectToggle component が描画する <button> 要素の className を観察する
  Then  className に "project-chip" を含む
   かつ 既存の "project-toggle__button" も含む (= 追加であって置換ではない / D-004)
```

```
シナリオ AC-5: プロジェクト未設定タスクでは chip 自体を描画しない (D-002)
  Given /today (または /tomorrow) を jsdom 環境でレンダリングした
   かつ tasks に projectId === null のタスクが少なくとも 1 件存在する
   かつ そのタスクのカード (= 当該 <li className="day-view__card">) を取得した
  When  そのカードの内部から querySelector(".project-chip") を呼ぶ
  Then  null を返す (= chip span が DOM に存在しない)
```

```
シナリオ AC-6: tokens.css を変更していない (NFR-NO-NEW-TOKENS)
  Given 本 BL の実装がマージされた
  When  web/src/styles/tokens.css を BL-054 完了時点の状態と比較する
  Then  差分が無い (新規トークンの追加・既存トークンの変更が無い)
   かつ 本 BL で参照する 6 トークン (--color-border / --radius-lg / --space-xs / --space-sm / --font-size-small / --color-fg) が引き続き定義されている
   かつ --radius-pill / --shadow-* のような本 BL では追加すべきでない token が存在しない
```

```
シナリオ AC-7: day-view.css の他セレクタには本 BL の追記が無い (REQ-6)
  Given 本 BL の実装がマージされた
  When  web/src/ui/day-view/day-view.css の既存セレクタ (.day-view / .day-view__header /
        .day-view__header h1 / .day-view__form / .day-view__list / .day-view__card /
        .day-view__card--focus / .day-view__empty) のルール本文を観察する
  Then  BL-054 完了時点と同じ宣言のままで, 本 BL での追記が無い
```

```
シナリオ AC-8: focus-view (/focus) の CSS を変更していない (REQ-8)
  Given 本 BL の実装がマージされた
  When  web/src/ui/focus-view/focus-view.css を BL-054 完了時点の状態と比較する
  Then  差分が無い
   かつ focus-view.css に .project-chip / .day-view__card セレクタが混入していない
```

```
シナリオ AC-9: ProjectToggle 専用 CSS (project-toggle.css) を変更していない (REQ-9)
  Given 本 BL の実装がマージされた
  When  web/src/ui/project-toggle/project-toggle.css を BL-054 完了時点の状態と比較する
  Then  差分が無い (.project-toggle__button の宣言は維持される)
```

```
シナリオ AC-10: day-view.css 全体で box-shadow を追加していない (NFR-NO-SHADOW)
  Given web/src/ui/day-view/day-view.css を開いた
  When  ファイル全体を観察する
  Then  box-shadow キーワードを含む宣言が存在しない
```

```
シナリオ AC-11: .project-chip ルールに hover / transition / animation / box-shadow / background が含まれない
  Given web/src/ui/day-view/day-view.css を開いた
  When  .project-chip セレクタのルール本文を観察する
  Then  background / background-color の宣言を含まない
   かつ box-shadow の宣言を含まない
   かつ transition の宣言を含まない
   かつ animation の宣言を含まない
   かつ .project-chip:hover / .project-chip:focus-visible 等の派生セレクタを CSS 内に持たない
```

```
シナリオ AC-12: 既存テスト全件 green 維持
  Given /today /tomorrow /projects 等が引き続きレンダリング可能
  When  ルートから npm test (vitest 単体テスト全件) を実行する
  Then  すべて green である
   かつ 既存テスト (today-view.test.tsx / tomorrow-view.test.tsx / unified-day-view.test.tsx /
        task-card-design.test.ts / form-card-design.test.ts / design-tokens.test.ts /
        project-toggle.test.tsx) は無修正で通る
```

```
シナリオ AC-13: アクセシビリティ違反 0 件を維持する
  Given /today /tomorrow をはじめとする全 view がレンダリング可能
  When  @axe-core/playwright で WCAG 2.1 AA をスキャンする (e2e/a11y.spec.ts の既存スキャン)
  Then  すべてのスキャンで violations.length === 0
```

## 重要な決定 (D 章)

- **D-001 (.project-chip の置き場所 = day-view.css に追加)**: 新規共通 CSS ファイル (`web/src/styles/components.css` 等) を作る案もあったが,
  - (i) 本 BL の適用範囲は今回 today / tomorrow + ProjectToggle のみで, 全 view に展開しているわけではない.
  - (ii) BL-052 / BL-054 と同じ「visual は day-view.css に集約する」流れに乗せるほうがレビュー粒度を最小化できる.
  - (iii) 新規ファイル追加は import 経路 (main.tsx) の調整が伴うコストがある.

  以上から本 BL では `web/src/ui/day-view/day-view.css` に `.project-chip` を追加する. 将来, focus-view 等の他 view でも `.project-chip` を使うことになったタイミングで, 共通 CSS への切り出しを別 BL で検討する余地は残す.

- **D-002 (プロジェクト未設定時は chip 自体を非表示)**: タスクカード側で `task.projectId === null` または `projects` 配列に該当 id が無い場合は `<span className="project-chip">` を一切出力しない方針を採用する.

  - (i) シンプルさ: 「（未分類）」chip を出すと, 全タスクに常に chip が出ることになり, 「プロジェクトを持つタスクの強調」という chip 本来の意図が薄まる.
  - (ii) BL-057 (3 段ゾーン化) で chip 段が空欄になるケースが出るが, 3 段ゾーン化はレイアウト自体の課題であり, 本 BL の表示有無ルールとは独立に解ける.
  - (iii) モックアップ (`local/image.png`) でも全カードに chip が描かれているわけではない (= プロジェクト割り当て済みカードのみに chip がある).
  - (iv) ProjectToggle 側は別概念 (= 「現在の選択値」を常に何かしら表示する必要があるため「（未分類）」を出す). 本 D-002 は**タスクカード側のみ**に適用される.

- **D-003 (`--radius-pill` を追加せず, 既存 `--radius-lg` を流用)**: 新規 token `--radius-pill: 9999px` を tokens.css に追加する案もあったが,
  - (i) chip の中身は 1 行テキスト (font-size 14px) + 上下 padding 4px で高さ約 22-24px. radius 16px (= `--radius-lg`) は高さの 2 倍に近く, 視覚的には「角丸カプセル / pill 形」として十分認識される (左右の弧が半円に近い).
  - (ii) BL-046 (design-tokens) の安定性を守る原則を維持する.
  - (iii) 真の pill 形 (radius 9999px) と `--radius-lg` (16px) の見た目の差はわずかで, 本 BL のスコープでは過剰な精度.

  以上から `--radius-lg` を流用する. 将来, chip 以外でも真の pill 形が必要になったタイミングで `--radius-pill` 追加を別 BL で検討する.

- **D-004 (ProjectToggle は className に `.project-chip` を「追加」)**: 「置換」「ProjectToggle 専用 CSS の撤去」「両方適用」の選択肢のうち, **両方適用 (追加)** を採用する.

  - (i) 既存 `.project-toggle__button` には `cursor: pointer` / `min-height: 44px` / `:focus-visible` リング / `width: 100%` 等, chip 視覚以外の重要な振る舞いが定義されている. これらは本 BL のスコープ外であり残すべき.
  - (ii) `.project-chip` の宣言は border / border-radius / padding / font-size で, `.project-toggle__button` の同名宣言と重複する. CSS のカスケードで `.project-chip` 側 (= 後勝ち or 詳細度同等) が効くため, 視覚は chip に揃う.
  - (iii) 「置換」は project-toggle.css の編集を伴い差分範囲が広がる. 本 BL は project-toggle 専用 CSS には touch しない (REQ-9) ことで, 差分を `.project-chip` 追加と JSX 1 行変更に局所化する.
  - (iv) 「ProjectToggle 専用 CSS 撤去」は将来 BL の余地として残す (= `.project-toggle__button` を本当に chip 単独で良いかは BL-058 で 2D グリッド化する際に再評価する).

- **D-005 (chip 挿入位置 = タスク名 span の直前)**: 現状のタスクカード JSX (タスク名 span / 星 / 「現在のタスクにする」/ 3 ボタン) の中で, chip の挿入位置として最も自然なのは「タスク名 span の直前」.

  - (i) tomorrow-view では既存実装が `{project && <span>{project.name}</span>}` をタスク名 span の直前に置いており, 既に確立された並び.
  - (ii) BL-057 で 3 段ゾーン化される際は, この挿入位置が「header (chip) | title (タスク名 + 星) | actions (3 ボタン)」の header 段にそのまま昇格する想定で, 暫定位置との連続性が良い.
  - (iii) `display: flex; align-items: center; gap: var(--space-md)` の現状フローでは, chip が左端に近い側に並ぶことで「これは誰のタスクか」が読みやすくなる.

  以上から「タスク名 span の直前」に挿入する. 「現在のタスク」セクション (`focusedTask`) では `<h2>現在のタスク</h2>` と `<div>...タスク名...</div>` の構造があるため, `<div>` 内のタスク名 span の直前に挿入する (= 通常カードと同じ位置).

- **D-006 (テストは CSS 直読み + DOM レンダ assert の両方)**: BL-052 / BL-054 で確立した CSS 直読みスタイル (`web/__tests__/task-card-design.test.ts` / `form-card-design.test.ts` の `readFileSync` + 正規表現) に加え, 本 BL では DOM レンダ assert (jsdom + querySelector) も追加する.

  - (i) CSS 直読み: AC-1 / AC-6 / AC-7 / AC-8 / AC-9 / AC-10 / AC-11 (= スタイル定義の存在 / 既存ファイルの不変性).
  - (ii) DOM レンダ assert: AC-2 / AC-3 / AC-4 / AC-5 (= タスクカード上の chip 表示有無 / ProjectToggle の className 確認).
  - (iii) 本 BL は chip の表示有無条件 (D-002) が user 観点で最も効く部分のため, CSS だけでなく DOM 側でも明示的にカバーする.

- **D-007 (chip に背景色を入れない)**: モックアップでは chip は親カードと同じ白背景で, 縁と pill 形のみで存在を主張している. `.project-chip` に `background` を入れない (G-1 の REQ-1 で `background` 宣言を出さない方針を確定).
  - (i) `<button>` (ProjectToggle 経由) でも `<span>` (タスクカード経由) でも親要素の背景を透過することで, カード上で視覚的に浮きすぎないようにする.
  - (ii) BL-052 / BL-054 のカード本体は `var(--color-bg)` (= `#fff`) を持つため, chip 側は透過で問題ない.

- **D-008 (chip に display プロパティを指定しない)**: `<span>` の inline 既定が `<li className="day-view__card">` の flex 子として動く (= flex container 内では `display: inline` の子も flex item になる). `<button>` の inline-flex 既定はそのまま使う.
  - (i) flex 子としての chip は `gap: var(--space-md)` で他の要素と均等な間隔で並ぶ.
  - (ii) `display: inline-block` 等を明示すると ProjectToggle 側の `display: inline-flex` を上書きしてしまうリスクがある.
  - (iii) 明示しないことで両用途 (タスクカード / ProjectToggle) で副作用なく動く.

## 未決事項 / 確認待ち

- なし (user との合意は方針セクション + D 章で確定済み. 実装値・挿入位置・対象 view・トークン追加可否・テスト方針はすべて確定).
