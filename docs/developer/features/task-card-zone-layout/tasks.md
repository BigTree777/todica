# タスク: task-card-zone-layout

> [`plan.md`](plan.md) を実行可能な単位に分解する. 完了したらチェックを入れる.
> 関連 spec: [`spec.md`](spec.md) (AC-1〜AC-18).

## 設計 / 事前確認

- [x] T-000: BL-056 完了時点の以下の状態を確認する (= 本 BL の差分起点となる baseline 確認).
  - `web/src/ui/day-view/day-view.css` の `.day-view__card` ルール本文に
    `display: flex` / `align-items: center` / `gap: var(--space-md)` /
    `background: var(--color-bg)` / `border: 1px solid var(--color-border)` /
    `border-radius: var(--radius-md)` / `padding: var(--space-md)` の 7 宣言があること.
  - `.day-view__card__header` / `.day-view__card__title` / `.day-view__card__actions` の各セレクタが**まだ無い**こと.
  - `.project-chip` ルール本文が BL-056 で確定済みの状態 (border / border-radius / padding / font-size / color の 5 宣言) であること.
  - today-view.tsx / tomorrow-view.tsx の各タスクカード DOM (= `<li className="day-view__card">` および focused `<section>`) が, BL-056 までで決まった現状 (chip + タスク名 span + 星 + button 群が `<li>` 直下に水平並び) になっていること.

## 実装 (test-designer → implementer の順で進める)

### CSS

- [x] T-001: `web/src/ui/day-view/day-view.css` の `.day-view__card` ルール本文を以下のように改修する (REQ-1 / P-001 / P-002 / plan §「day-view.css の改修内容」参照):
  - `flex-direction: column` を追加する (構造系の宣言群の中, `display: flex` の直後を推奨).
  - `align-items: center` を `align-items: stretch` に変更する.
  - `border-radius: var(--radius-md)` を `border-radius: var(--radius-lg)` に変更する (D-001).
  - `display: flex` / `gap: var(--space-md)` / `background: var(--color-bg)` / `border: 1px solid var(--color-border)` / `padding: var(--space-md)` は維持する.
  - 宣言順は「構造系 → visual」(`display` / `flex-direction` / `align-items` / `gap` / `background` / `border` / `border-radius` / `padding`).
  - `.day-view__card--focus` ルール本文は touch しない (REQ-10).
  - `box-shadow` / `transition` / `animation` / `:hover` / `:focus-within` の宣言・派生セレクタを追加しない (NFR-NO-SHADOW / NFR-NO-HOVER-TRANSITION).

- [x] T-002: 同 CSS に `.day-view__card__header` ルールを新規追加する (REQ-2):
  - `display: flex`
  - `align-items: center`
  - `gap: var(--space-sm)`
  - `.day-view__card__header:hover` 等の派生セレクタは追加しない.

- [x] T-003: 同 CSS に `.day-view__card__title` ルールを新規追加する (REQ-3):
  - `display: flex`
  - `align-items: center`
  - `justify-content: space-between`
  - `gap: var(--space-md)`
  - `text-align: center` 等のタスク名の中央寄せ宣言は**追加しない** (D-005).

- [x] T-004: 同 CSS に `.day-view__card__actions` ルールを新規追加する (REQ-4 / D-004):
  - `display: flex`
  - `align-items: center`
  - `justify-content: flex-end`
  - `gap: var(--space-sm)`
  - `flex-wrap: wrap`

### JSX

- [x] T-005: `web/src/ui/today-view/today-view.tsx` の `focusedTask` セクション (現在の L447 付近 / `<section aria-label="現在のタスク" className="day-view__card day-view__card--focus">`) を 3 段構造に書き換える (REQ-5-1 / P-003 / plan §「focusedTask セクション」参照):
  - `<h2>現在のタスク</h2>` は `<section>` の最初の子として現状維持 (= 3 段の前).
  - 既存の `<div>` ラッパを削除し, 直下に以下 3 つの `<div>` を順に置く.
  - `<div className="day-view__card__header">` の中に `{focusedProject && <span className="project-chip">{focusedProject.name}</span>}` を置く.
  - `<div className="day-view__card__title">` の中に `<span>{focusedTask.name}</span>` と `<PriorityStars ... />` を置く (DOM 順は タスク名 → 星).
  - `<div className="day-view__card__actions">` の中に「削除」/ `focusedTask.origin !== "routine"` の場合「明日にする / 今日にする」/「完了」の各 button を置く (focused タスクには「現在のタスクにする」 button は無い / BL-043 既存仕様).
  - 各 button の onClick / aria 属性 / type / 表示文字列は無改修 (NFR-DOM-ADDITIVE).
  - `<PriorityStars />` の props (value / onChange / groupLabel / idPrefix) は無改修.

- [x] T-006: `web/src/ui/today-view/today-view.tsx` の `otherTasks.map(...)` の `<li key={task.id} className="day-view__card">` (現在の L520 付近) を 3 段構造に書き換える (REQ-5-2 / D-004 / plan §「otherTasks 一覧」参照):
  - `<div className="day-view__card__header">{project && <span className="project-chip">{project.name}</span>}</div>` を最初の子に置く.
  - `<div className="day-view__card__title"><span>{task.name}</span><PriorityStars ... /></div>` を次に置く.
  - `<div className="day-view__card__actions">` の中に「現在のタスクにする」/「削除」/`task.origin !== "routine"` の場合「明日にする / 今日にする」/「完了」の 4 (or 3) button を DOM 順で並べる.
  - 既存の onClick / type / 表示文字列 / 条件分岐 (`task.origin !== "routine"`) は無改修.
  - `<PriorityStars />` の props は無改修.

- [x] T-007: `web/src/ui/tomorrow-view/tomorrow-view.tsx` の `<li key={task.id} className="day-view__card">` (現在の L434 付近) を 3 段構造に書き換える (REQ-6 / plan §「tomorrow-view.tsx の DOM 再構成」参照):
  - `<div className="day-view__card__header">{project && <span className="project-chip">{project.name}</span>}</div>` を最初の子に置く.
  - `<div className="day-view__card__title"><span>{task.name}</span></div>` を次に置く (tomorrow-view は `<PriorityStars />` を持たない既存仕様なのでタスク名のみ).
  - `<div className="day-view__card__actions">` の中に「削除」/`task.origin !== "routine"` の場合「今日にする」/「完了」の 3 (or 2) button を DOM 順で並べる.
  - 既存の onClick / type / 表示文字列 / 条件分岐は無改修.

### 触らない確認

- [x] T-008: `web/src/styles/tokens.css` を変更していないことを確認する (REQ-12 / D-001). 新規トークン (`--radius-xl` 等) を追加せず, 既存トークンの値も変えない.

- [x] T-009: `web/src/ui/focus-view/focus-view.css` および `web/src/ui/focus-view/focus-view.tsx` を変更していないことを確認する (REQ-11 / D-006).

- [x] T-010: `web/src/ui/day-view/day-view.css` の以下のセレクタのルール本文を変更していないことを確認する (REQ-13 / AC-13):
  - `.day-view`
  - `.day-view__header`
  - `.day-view__header h1`
  - `.day-view__form` (BL-054 で確定した宣言が維持されている)
  - `.day-view__list`
  - `.day-view__card--focus` (BL-052 で確定した 3 宣言 `border-width: 2px` / `border-radius: var(--radius-lg)` / `padding: var(--space-lg)` が維持されている)
  - `.day-view__empty`
  - `.project-chip` (BL-056 で確定した 5 宣言が維持されている)

- [x] T-011: `web/src/ui/project-toggle/project-toggle.tsx` および `web/src/ui/project-toggle/project-toggle.css` を変更していないことを確認する (= ProjectToggle は本 BL の対象外).

- [x] T-012: `web/src/ui/priority-stars/` 配下を変更していないことを確認する (= `<PriorityStars />` は配置先の変更のみで内部仕様は無改修 / BL-040 既存).

## テスト

### 単体テスト (新規)

- [x] T-013: `web/__tests__/task-card-zone-layout.test.tsx` を新規作成し, spec AC-1〜AC-12 / AC-14 / AC-15 のうち本ファイルで担保できるものをアサーションとして記述する (plan §「テスト方針」参照).
  - 検証スタイル前半 (CSS 直読み): BL-052 の `web/__tests__/task-card-design.test.ts` に倣う (`readFileSync` + `extractRuleBody` + `expect(body).toMatch(...)` / `expect(content).toContain(...)`).
  - 検証スタイル後半 (DOM レンダ): BL-056 の `web/__tests__/project-chip.test.tsx` に倣う (`QueryClientProvider` + `MemoryRouter` でラップして `render(<TodayView ... />)` / `render(<TomorrowView ... />)` + `container.querySelector(...)`).
  - `extractRuleBody` ヘルパは本ファイル内に再定義する (P-005).
  - 拡張子は `.tsx` (P-007).
  - 環境は `// @vitest-environment jsdom` (P-004).
  - 含む AC:
    - AC-1: `.day-view__card` に `display: flex` / `flex-direction: column` / `align-items: stretch` / `gap: var(--space-md)` / `background: var(--color-bg)` / `border: 1px solid var(--color-border)` / `padding: var(--space-md)` が含まれる. `align-items: center` は含まれない.
    - AC-2: `.day-view__card` の `border-radius` が `var(--radius-lg)`. `var(--radius-md)` は含まれない.
    - AC-3: `.day-view__card__header` / `.day-view__card__title` / `.day-view__card__actions` の各ルールが存在し各々 `display: flex` を含む. `.day-view__card__actions` には `justify-content: flex-end` が含まれる.
    - AC-4: TodayView を render し, 任意の `.day-view__card` の中に 3 子要素が DOM 上に存在する.
    - AC-5: TomorrowView を render し, 同様に 3 子要素が存在する.
    - AC-6: TodayView で `.day-view__card__actions` 内に「削除」「明日にする」「完了」 button が存在する.
    - AC-7: TodayView で `.day-view__card__actions` 内に「現在のタスクにする」 button が存在する. header / title には存在しない.
    - AC-8: TodayView で `.day-view__card__title` 内に `role="radiogroup"` 要素が存在する. header / actions には存在しない.
    - AC-9: TodayView で project 割り当て済みカードの `.day-view__card__header` 内に `.project-chip` が存在する. title / actions には存在しない.
    - AC-10: TodayView で `projectId === null` のカードの `.day-view__card__header` は存在するが, その中に `.project-chip` は無い.
    - AC-11: tokens.css に `--radius-lg` / `--space-md` / `--space-sm` が定義されている. `--radius-xl` は無い.
    - AC-12: focus-view.css に `.day-view__card__header` / `.day-view__card__title` / `.day-view__card__actions` セレクタが含まれない. focus-view.tsx に `day-view__card__` 文字列が含まれない.
    - AC-14: day-view.css 全体に `box-shadow` キーワードが含まれない.
    - AC-15: 新規 3 子クラスのルール本文に `box-shadow:` / `transition:` / `animation:` が含まれない. `.day-view__card__header:hover` 等の派生セレクタが CSS 内に存在しない.

- [x] T-014: `web/__tests__/task-card-zone-layout.test.tsx` の AC-13 (他セレクタ不変) のアサーションを記述する:
  - 他セレクタ (`.day-view` / `.day-view__header` / `.day-view__header h1` / `.day-view__list` / `.day-view__empty`) のルール本文に新規 visual 宣言 (background / border / border-radius) が含まれない.
  - `.day-view__form` ルール本文には BL-054 で確定した宣言が含まれる (= 本 BL で再装飾されていない).
  - `.project-chip` ルール本文には BL-056 で確定した宣言が含まれる (= 本 BL で再装飾されていない).
  - `.day-view__card--focus` ルール本文には BL-052 で確定した宣言が含まれる (= 本 BL で `border-width: 2px` / `border-radius: var(--radius-lg)` / `padding: var(--space-lg)` が維持されている).

### 単体テスト (追従修正)

- [x] T-015: `web/__tests__/task-card-design.test.ts` (BL-052) の以下の箇所を本 BL の値に追従修正する (P-006):
  - AC-1 の `.day-view__card` ルール本文に `align-items: center` を assert している箇所 (現在の L127 付近の `expect(bodyText).toMatch(/align-items\s*:\s*center/);`) を `align-items: stretch` に変更する.
  - AC-1 の `.day-view__card` ルール本文に `border-radius: var(--radius-md)` を assert している箇所 (現在の L110 付近の `expect(body ?? "").toMatch(/border-radius\s*:\s*var\(--radius-md\)/);`) を `border-radius: var(--radius-lg)` に変更する.
  - その他の AC は無修正.

- [x] T-016: 既存単体テスト (`today-view.test.tsx` / `tomorrow-view.test.tsx` / `unified-day-view.test.tsx` / `project-chip.test.tsx`) を `npm test -w web` で実行し, red になったものを最小修正する (= `<li>` 直下子要素として button / chip を取得しているテストがあれば, 子孫クエリに書き換える). NFR-DOM-ADDITIVE 方針により多くは無修正で通る想定. 事前に網羅的な調査は不要 (TDD で個別対応).

### E2E / a11y / lint

- [x] T-017: `npm test -w web` (vitest 単体テスト全件) が green になることを確認する. 新規 task-card-zone-layout テスト + BL-052 追従修正 + 既存テスト追従修正のすべてを含む.

- [x] T-018: `npx playwright test` (E2E 全件) が green になることを確認する. red になった spec があれば最小修正する (= role + accessibleName ロケータは NFR-DOM-ADDITIVE で動作する想定. `<li>` 直下子要素クエリのみ追従).

- [x] T-019: `npx playwright test e2e/a11y.spec.ts` が green であることを確認する (AC-18). axe スキャンで violations 0 件.

- [x] T-020: `npm run lint -w web` と `npm run typecheck` (project 全体) が exit 0 であることを確認する.

### 視覚的確認 (任意 / 手動)

- [x] T-021: `npm run dev -w web` で開発サーバを起動し, `/today` と `/tomorrow` にアクセスして以下を目視確認する (受け入れ基準の補助確認):
  - 各タスクカードがモックアップ (`local/image.png`) と同じ 3 段ゾーン構造で描画される.
  - 上段にプロジェクト chip (BL-056 の角丸カプセル) が表示される.
  - 中段にタスク名 (左) と星 (右) が並ぶ (today). tomorrow はタスク名のみ.
  - 下段にアクション button 群がカード右側に寄せて並ぶ. today は 4 ボタン (現在のタスクにする / 削除 / 明日にする / 完了), tomorrow は 3 ボタン (削除 / 今日にする / 完了).
  - 「現在のタスク」セクション (focused タスク) も同じ 3 段構造で表示され, 太い border (BL-052 維持) で強調される. 「現在のタスクにする」 button は出ない.
  - プロジェクト未設定タスクの上段は空段 (= chip 無し) になり, card 全体の高さが chip 有りカードよりやや低くなる.
  - カードの角丸が chip の角丸と視覚的に同調する (D-001).
  - hover してもカードの見た目が変わらない (NFR-NO-HOVER-TRANSITION).
  - shadow が描画されていない (NFR-NO-SHADOW).
  - `/focus` 単独ページの見た目が変わっていない (D-006).
  - 起票フォーム (`.day-view__form`) の見た目が変わっていない (= BL-054 維持).

## ドキュメント

- [x] T-022: 本 BL の起票時点では `docs/developer/planning/backlog.md` の BL-057 行は更新しない (user 指示). 実装マージ後に管理者が Todo → Done に更新する (PR 番号と実装値の差分を備考欄に追記).

## 仕上げ

- [x] T-023: spec.md AC-1〜AC-18 を 1 項目ずつチェックし, すべて満たされていることを確認する.
- [x] T-024: PR 本文に以下を明示する:
  - 「BL-052 で `.day-view__card` に与えた visual を維持しつつ, レイアウト方向を 1 行水平 → 縦並び 3 段ゾーンに切り替えた」
  - 「上段 chip / 中段 タスク名 + 星 / 下段 アクションボタンの 3 段構造で today / tomorrow のタスクカードを再構成」
  - 「角丸は chip と同じ `--radius-lg` (16px) に揃えた」
  - 「tokens.css / focus-view / `.day-view__form` / `.project-chip` は無改修」
  - 「shadow / hover / transition は不採用 (BL-052 / BL-054 / BL-056 と同方針)」
  - 「task-card-design.test.ts の AC-1 (align-items / border-radius) を本 BL の値に追従修正」
- [x] T-025: auditor にレビュー依頼.
