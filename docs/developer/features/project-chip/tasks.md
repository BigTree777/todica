# タスク: project-chip

> [`plan.md`](plan.md) を実行可能な単位に分解する. 完了したらチェックを入れる.
> 関連 spec: [`spec.md`](spec.md) (AC-1〜AC-13).

## 設計 / 事前確認

- [x] T-000: BL-054 (form-card-design) 完了時点の以下のファイル状態を確認し, 本 BL の追記の起点となる baseline として記録する:
  - `web/src/ui/day-view/day-view.css` に `.project-chip` セレクタがまだ存在しない.
  - `web/src/ui/today-view/today-view.tsx` の `<li className="day-view__card">` 内および `<section className="day-view__card day-view__card--focus">` 内に `project-chip` キーワードがまだ存在しない.
  - `web/src/ui/tomorrow-view/tomorrow-view.tsx` 内の `{project && <span>{project.name}</span>}` がプレーン span のままで `project-chip` キーワードを含まない.
  - `web/src/ui/project-toggle/project-toggle.tsx` の `<button>` の className が `"project-toggle__button"` のみで `"project-chip"` を含まない.
  - `web/src/styles/tokens.css` に `--radius-pill` / `--shadow-*` が存在しない.

## 実装 (test-designer → implementer の順で進める)

### CSS

- [x] T-001: `web/src/ui/day-view/day-view.css` の末尾に `.project-chip` ルールを追加する (REQ-1 / plan §「day-view.css への追記内容」参照):
  - `border: 1px solid var(--color-border)`
  - `border-radius: var(--radius-lg)`
  - `padding: var(--space-xs) var(--space-sm)`
  - `font-size: var(--font-size-small)`
  - `color: var(--color-fg)`
  - `display` / `background` / `background-color` / `box-shadow` / `transition` / `animation` は宣言しない (D-007 / D-008 / NFR-NO-SHADOW / NFR-NO-HOVER-TRANSITION).
  - `.project-chip:hover` / `.project-chip:focus-visible` 等の派生セレクタも追加しない.

### JSX (today-view)

- [x] T-002: `web/src/ui/today-view/today-view.tsx` の `<section aria-label="現在のタスク" className="day-view__card day-view__card--focus">` (focusedTask, L443 周辺) 内の `<div>...タスク名...</div>` の `<span>{focusedTask.name}</span>` の直前に, 以下のロジックで chip を挿入する (REQ-2 / D-005 / plan §「today-view.tsx の改修内容」参照):
  - `focusedTask.projectId` から `projects.find((p) => p.id === focusedTask.projectId) ?? null` で project を解決.
  - `project` が truthy のときのみ `<span className="project-chip">{project.name}</span>` を出力.
  - `project === null` のときは何も出力しない (D-002 / REQ-5).
  - プレースホルダ chip (`<span className="project-chip">（未分類）</span>` 等) は出さない (リスク R-5).

- [x] T-003: `web/src/ui/today-view/today-view.tsx` の `<ul aria-label="タスク一覧" className="day-view__list">` 内 `otherTasks.map(...)` (L508-L543 周辺) で, 各 `<li key={task.id} className="day-view__card">` の `<span>{task.name}</span>` の直前に T-002 と同パターンの chip 挿入を行う (REQ-2 / D-005):
  - map のコールバック内で project を解決 (`task.projectId ? (projects.find((p) => p.id === task.projectId) ?? null) : null`).
  - 既存の他要素 (`<span>{task.name}</span>` / `<PriorityStars />` / 「現在のタスクにする」 button / 3 ボタン) の順序・内容は無変更.

### JSX (tomorrow-view)

- [x] T-004: `web/src/ui/tomorrow-view/tomorrow-view.tsx` (L434 周辺) の既存 `{project && <span>{project.name}</span>}` を以下に置き換える (REQ-3 / D-005):
  - `{project && <span className="project-chip">{project.name}</span>}`
  - `project` 解決ロジック (L426-428) は無変更.
  - 周囲 JSX (`<span>{task.name}</span>` / 3 ボタン) も無変更.

### JSX (project-toggle)

- [x] T-005: `web/src/ui/project-toggle/project-toggle.tsx` (L110 周辺) の `<button>` の className を以下に変更する (REQ-4 / D-004 / P-002):
  - 変更前: `className="project-toggle__button"`
  - 変更後: `className="project-toggle__button project-chip"`
  - 既存 `.project-toggle__button` は残す (置換ではなく追加 / D-004).
  - 他属性 (`type` / `aria-label` / `aria-describedby` / `data-current-id` / `onClick`) は無変更.
  - 子要素 (`<span data-project-toggle-name className="project-toggle__name">{currentName}</span>`) も無変更.

### 触らない確認

- [x] T-006: `web/src/styles/tokens.css` を変更していないことを確認する (REQ-7 / D-003). `--radius-pill` / `--shadow-*` を追加していないこと, 既存トークン値も変えていないこと.

- [x] T-007: `web/src/ui/project-toggle/project-toggle.css` を変更していないことを確認する (REQ-9 / D-004). `.project-toggle__button` の宣言は維持されている.

- [x] T-008: `web/src/ui/focus-view/focus-view.css` を変更していないことを確認する (REQ-8 / リスク R-4). `.project-chip` や `.day-view__card` 系セレクタが混入していない.

- [x] T-009: `web/src/ui/day-view/day-view.css` の既存セレクタ (`.day-view` / `.day-view__header` / `.day-view__header h1` / `.day-view__form` / `.day-view__list` / `.day-view__card` / `.day-view__card--focus` / `.day-view__empty`) のルール本文を変更していないことを確認する (REQ-6 / AC-7).

- [x] T-010: projects-view / trash-view / settings-view / focus-view 等の他 view の JSX / CSS を変更していないことを確認する (G-6 / REQ-8).

## テスト

### 単体テスト (新規 / CSS 直読み)

- [x] T-011: `web/__tests__/project-chip.test.ts` を新規作成し, spec AC-1 / AC-6 / AC-7 / AC-8 / AC-9 / AC-10 / AC-11 に対応するアサーションを記述する (plan §「テスト方針」参照).
  - 検証スタイルは BL-052 (`web/__tests__/task-card-design.test.ts`) / BL-054 (`web/__tests__/form-card-design.test.ts`) の `extractRuleBody` パターンを踏襲 (P-003).
  - AC-1: `.project-chip` ルール本文に border / border-radius / padding / font-size / color の 5 宣言が含まれる.
  - AC-6: tokens.css に `--color-border` / `--radius-lg` / `--space-xs` / `--space-sm` / `--font-size-small` / `--color-fg` が定義され, `--radius-pill` / `--shadow-*` が存在しない.
  - AC-7: day-view.css の他セレクタ (`.day-view` / `.day-view__header` / `.day-view__list` / `.day-view__empty` 等) のルール本文に `project-chip` キーワードが追記されていない (軽スモーク).
  - AC-8: focus-view.css に `project-chip` / `.day-view__card` キーワードが含まれない.
  - AC-9: project-toggle.css に `.project-chip` セレクタが含まれない.
  - AC-10: day-view.css 全文に `box-shadow` キーワードが含まれない.
  - AC-11: `.project-chip` ルール本文に `background` / `box-shadow` / `transition` / `animation` を含まず, day-view.css 全文に `.project-chip:hover` / `.project-chip:focus-visible` セレクタを含まない.

### 単体テスト (新規 / jsdom DOM レンダ)

- [x] T-012: `web/__tests__/project-chip-dom.test.tsx` を新規作成し, spec AC-2 / AC-3 / AC-4 / AC-5 に対応するアサーションを記述する (plan §「テスト方針」参照 / P-004 / P-005 / P-006).
  - AC-2 (today): `<TodayView />` を fake repository + QueryClientProvider + MemoryRouter で render. projects に 1 件, tasks にプロジェクト割り当て済みタスクを 1 件以上. `<ul aria-label="タスク一覧">` 配下の `.project-chip` を querySelectorAll で取得し, textContent が project name と一致する要素が 1 つ以上存在することを確認.
  - AC-3 (tomorrow): `<TomorrowView />` で AC-2 と同じパターン. scope は `<ul aria-label="明日のタスク一覧">`.
  - AC-4 (ProjectToggle): `<ProjectToggle value={null} onChange={() => {}} projects={[]} />` を単独レンダリング. `screen.getByRole('button')` で取得した button の className が `"project-chip"` と `"project-toggle__button"` の両方を含む.
  - AC-5 (未設定タスク): projectId === null のタスク 1 件のみを与えてレンダリング. `screen.getByText(task.name).closest('li')` で該当カードを取得し, その内部から `querySelector('.project-chip')` が `null` を返すことを確認.

### 単体テスト (既存追従の確認)

- [x] T-013: 既存単体テスト (`today-view.test.tsx` / `tomorrow-view.test.tsx` / `unified-day-view.test.tsx` / `task-card-design.test.ts` / `form-card-design.test.ts` / `design-tokens.test.ts` / `project-toggle.test.tsx`) を無修正で実行し, 全件 green であることを確認する (リスク R-3).
  - 万一 chip span 挿入で `firstChild` / `children[N]` インデックスベース取得が破壊された場合は plan に追従修正項目を追加する.

### E2E / a11y / lint

- [x] T-014: ルートから `npm test` (vitest) を実行し, 全件 green であることを確認する (AC-12). 新規 `project-chip.test.ts` / `project-chip-dom.test.tsx` を含む.

- [x] T-015: `npx playwright test e2e/a11y.spec.ts` が green であることを確認する (AC-13). axe スキャンで violations 0 件.

- [x] T-016: `npm run lint -w web` と `npm run typecheck` (or 等価) が exit 0 であることを確認する.

### 視覚的確認 (任意 / 手動)

- [x] T-017: `npm run dev -w web` で開発サーバを起動し, `/today` と `/tomorrow` にアクセスして以下を目視確認する (受け入れ基準の補助確認 / リスク R-1 の検出):
  - プロジェクト割り当て済みタスクのカードで, タスク名の左に角丸カプセル形状の chip が表示される (G-2 / G-3).
  - プロジェクト未設定タスクのカードでは chip が表示されない (D-002 / AC-5).
  - 起票フォームの `<ProjectToggle />` の button が角丸カプセル (= タスクカード上の chip と同じ視覚言語) として表示される (G-4 / リスク R-1).
  - `/focus` (focus-view) の見た目が変わっていない (REQ-8).
  - shadow / hover effect が描画されていない (NFR-NO-SHADOW / NFR-NO-HOVER-TRANSITION).

## ドキュメント

- [x] T-018: 仕様策定の本ステップでは `docs/developer/planning/backlog.md` は更新しない (= user 指示). 実装マージ後 (PR merged) に管理者が BL-056 行を Todo → Done に更新する.

## 仕上げ

- [x] T-019: spec.md AC-1〜AC-13 を 1 項目ずつチェックし, すべて満たされていることを確認する.
- [x] T-020: PR 本文に「`.project-chip` 共通スタイルを day-view.css に新設. today タスクカードへの chip 表示追加, tomorrow タスクカードの chip 化, ProjectToggle button の chip 化を一括で行う. tokens.css / project-toggle.css / focus-view.css は無改修.」と明示する.
- [x] T-021: auditor にレビュー依頼.
