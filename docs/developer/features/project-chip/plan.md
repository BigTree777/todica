# 設計・実装計画: project-chip

> [`spec.md`](spec.md) の要件 (REQ-1〜REQ-9) を, どう実現するかに落とす.

## 方針概要

`web/src/ui/day-view/day-view.css` の末尾に `.project-chip` 共通ルールを 1 つ追加する (border / radius / padding / font-size / color の 5 宣言, 既存トークンのみ参照). タスクカード側 (today / tomorrow) には `<span className="project-chip">{project.name}</span>` をタスク名の直前に挿入し, `project` 解決が `null` の場合は span 自体を出さない (D-002). ProjectToggle 側は `<button>` の className に `"project-chip"` を追加するだけで, 専用 CSS (`project-toggle.css`) は触らない. tokens.css と他 view (focus-view / projects-view 等) は無改修. 検証は CSS 直読み (AC-1 / AC-6 / AC-7 / AC-8 / AC-9 / AC-10 / AC-11) と jsdom DOM レンダ assert (AC-2 / AC-3 / AC-4 / AC-5) の併用.

## 影響範囲

| 領域 | 変更内容 |
| --- | --- |
| API | 変更なし |
| DB | 変更なし |
| domain / Repository | 変更なし |
| サーバ | 変更なし |
| UI (CSS 改修) | `web/src/ui/day-view/day-view.css` に `.project-chip` ルールを 1 つ追加 (REQ-1) |
| UI (JSX 改修) | `web/src/ui/today-view/today-view.tsx` のタスクカード 2 か所 (focusedTask 用 section と otherTasks 用 li) に chip span 挿入 (REQ-2) / `web/src/ui/tomorrow-view/tomorrow-view.tsx` の既存 plain span を `.project-chip` 付き span に置換 (REQ-3) / `web/src/ui/project-toggle/project-toggle.tsx` の button className に `"project-chip"` を追加 (REQ-4) |
| UI (新規) | なし (新規 CSS ファイル / 新規コンポーネントは作らない / D-001) |
| UI (削除) | なし |
| tokens.css | 変更なし (REQ-7 / D-003) |
| project-toggle.css | 変更なし (REQ-9 / D-004) |
| focus-view CSS | 変更なし (REQ-8) |
| projects-view / trash-view CSS | 変更なし (REQ-8) |
| テスト (新規) | `web/__tests__/project-chip.test.ts` を新規追加. AC-1 / AC-6 / AC-7 / AC-8 / AC-9 / AC-10 / AC-11 を CSS 直読みで機械検証 |
| テスト (新規, jsdom) | `web/__tests__/project-chip-dom.test.tsx` を新規追加. AC-2 / AC-3 / AC-4 / AC-5 を jsdom + querySelector で検証. ※ 既存 `today-view.test.tsx` / `tomorrow-view.test.tsx` / `project-toggle.test.tsx` への追記でも代替可能. plan §「テスト方針」で確定する |
| テスト (追従) | 原則不要. 既存 query (タスク名 / aria-label / button 名) は無変更で通る前提. 万一 DOM 構造変更で既存テストが壊れた場合のみ追従修正する |
| E2E | 既存 spec は無改修. 新規 E2E も追加しない |
| ドキュメント | backlog の BL-056 行は実装完了後 (PR マージ後) に管理者が Todo → Done に更新する. 仕様策定の本ステップでは更新不要 (= user 指示) |

## 設計詳細

### day-view.css への追記内容

ファイル末尾に以下のルールを追加する:

```css
/*
 * BL-056 (project-chip): プロジェクト名表示用の角丸カプセル.
 *
 * - タスクカード (.day-view__card) 内の <span className="project-chip"> と,
 *   ProjectToggle (.project-toggle__button) の両方で共有する視覚言語.
 * - 値は BL-046 の既存トークンのみで構成 (NFR-NO-NEW-TOKENS).
 * - background は親カードの白を透過する (D-007).
 * - display は指定しない. <span> (inline) / <button> (inline-flex) の既定に任せる (D-008).
 */
.project-chip {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--space-xs) var(--space-sm);
  font-size: var(--font-size-small);
  color: var(--color-fg);
}
```

### today-view.tsx の改修内容

L443 周辺 (focusedTask section) と L510 周辺 (otherTasks li) の 2 か所で, 同じ chip 挿入パターンを使う.

**focusedTask section (L443 周辺):**

```tsx
{focusedTask && (() => {
  const project = focusedTask.projectId
    ? (projects.find((p) => p.id === focusedTask.projectId) ?? null)
    : null;
  return (
    <section aria-label="現在のタスク" className="day-view__card day-view__card--focus">
      <h2>現在のタスク</h2>
      <div>
        {project && <span className="project-chip">{project.name}</span>}
        <span>{focusedTask.name}</span>
        {/* ...既存の PriorityStars / 3 ボタン... */}
      </div>
    </section>
  );
})()}
```

**otherTasks li (L510 周辺):**

```tsx
{otherTasks.map((task) => {
  const project = task.projectId
    ? (projects.find((p) => p.id === task.projectId) ?? null)
    : null;
  return (
    <li key={task.id} className="day-view__card">
      {project && <span className="project-chip">{project.name}</span>}
      <span>{task.name}</span>
      {/* ...既存の PriorityStars / 「現在のタスクにする」 / 3 ボタン... */}
    </li>
  );
})}
```

ポイント:

- `project` の解決は tomorrow-view の既存パターン (`task.projectId ? (projects.find((p) => p.id === task.projectId) ?? null) : null`) をそのまま today にも持ち込む.
- `project === null` のときは `{project && ...}` で span 自体を出さない (D-002 / REQ-5).
- 既存の他要素 (`<span>{task.name}</span>` / `<PriorityStars />` / 「現在のタスクにする」 button / 3 ボタン) の順序・内容は無変更.

### tomorrow-view.tsx の改修内容

L435 周辺の既存 `{project && <span>{project.name}</span>}` を以下に置き換える:

```tsx
{project && <span className="project-chip">{project.name}</span>}
```

- `project` の解決ロジック (L426-428) は無変更.
- 周囲の JSX (`<span>{task.name}</span>` / 3 ボタン) も無変更.

### project-toggle.tsx の改修内容

L110 の `className="project-toggle__button"` を以下に変更する:

```tsx
className="project-toggle__button project-chip"
```

- 他属性 (`type` / `aria-label` / `aria-describedby` / `data-current-id` / `onClick`) は無変更.
- 子要素 (`<span data-project-toggle-name className="project-toggle__name">{currentName}</span>`) も無変更.

### CSS カスケードと読み込み順 (詳細設計)

`<button className="project-toggle__button project-chip">` の場合, ブラウザ CSS は以下のように適用される:

- `.project-toggle__button` と `.project-chip` は詳細度同じ (= 単一クラス).
- 同じ詳細度の場合, **後に宣言されたルール** が後勝ちで効く.
- アプリの CSS 読み込み順: `main.tsx` で `tokens.css` → `App.css` → 各 view CSS (ルーターで lazy 読み込みの場合あり) → `project-toggle.css` (component 単位の import / project-toggle.tsx から).

実際のところ:

- `day-view.css` は `web/src/ui/day-view/day-view.css` で, `today-view.tsx` の上部で import される.
- `project-toggle.css` は `project-toggle.tsx` の上部で import される.
- どちらが先に評価されるかは, レンダリングツリーで先に mount された方の component の CSS 読み込み順による.
- `<TodayView />` をレンダリングする時点で `<ProjectToggle />` も子としてマウントされるため, 一般には `today-view.tsx` の import が先で `day-view.css` が先に DOM に挿入される. つまり後から `project-toggle.css` が挿入され, `.project-toggle__button` の宣言が後勝ちで効くリスクがある.

緩和策:

- 本 BL では `.project-chip` の border / border-radius / padding / font-size と `.project-toggle__button` の border / border-radius / padding / font-size が**衝突する**. 両者が同じ詳細度のため, 読み込み順次第で見た目が変わる.
- 実装者は、テスト (AC-4 は className の存在のみを assert する) では検出できないため, **手動の視覚確認 (T-013 / 任意)** で `<ProjectToggle />` の見た目が chip 化していることを確認すること.
- もし読み込み順の問題で `.project-toggle__button` 側が勝ってしまった場合の二次対応は別 BL (= project-toggle.css を整理) で扱う. 本 BL のスコープに含めない (D-004).

※ なお Vite の CSS 処理では `@import` を使わない素の `import "./xxx.css"` であれば, 同じ import グラフ内で「import 文の評価順 = 出現順」がそのまま CSS 順序になる. `today-view.tsx` で `import "./day-view/day-view.css"` 系 (実際は `import` パスは `unified-day-view` 経由) と `project-toggle.tsx` の `import "./project-toggle.css"` の評価順は, `TodayView` 関数本体より上の import が先に解決される. 厳密な確証は実機で T-013 にて取る.

### 期待される視覚的結果

- `/today` の各タスクカード:
  - プロジェクト割り当て済みタスク → タスク名の左に「角丸カプセルのプロジェクト名」が並ぶ.
  - プロジェクト未設定タスク → chip 無し, 現状と同じ見た目.
  - 「現在のタスク」セクション → 通常カードと同じ位置 (タスク名の直前) に chip.
- `/tomorrow` の各タスクカード: today と同じ見た目.
- 起票フォーム (today / tomorrow) の `<ProjectToggle />`: button が角丸カプセル (= タスクカード上の chip と同じ視覚言語) に見える.

### 例外 / エラー処理

CSS の追記と JSX の span 追加のみ. 例外発生経路は変わらない. ConflictDialog / notifyError / OptimisticLockError 経路は無改修.

### 処理フロー

データフロー (TanStack Query / useMutation / offline-queue / ConflictDialog) は無改修. 本 BL の差分はレンダリング後の DOM ツリーの**見た目と 1 ノード追加**のみ.

## 重要な決定

spec の D 章 (D-001〜D-008) で確定済み. plan では追加の決定として以下を確定する:

- **P-001 (chip 解決ロジックの DRY 化を見送る)**: today-view.tsx には focusedTask 用と otherTasks 用の 2 箇所で同じ `project` 解決ロジックが書かれることになる. これを `getProjectByTask(task, projects)` のような util に切り出す案もあるが,
  - (i) 行数は 2-3 行 × 2 箇所 = 計 6 行程度で, 抽出コストに見合わない.
  - (ii) tomorrow-view の既存実装と並びを揃えるほうがレビュー時の対称性が良い.
  - (iii) BL-057 (3 段ゾーン化) でこの部分は再構成される前提で, 暫定的な inline 実装で十分.

  以上から util 化は見送り, inline で 2 箇所書く.

- **P-002 (className 並び順は "project-toggle__button project-chip")**: ProjectToggle の button className 順序は固定する.
  - (i) HTML の class 属性内の順序は CSS カスケードに影響しない (= 詳細度・宣言順で決まる) ため, 機能上はどちらでも同じ.
  - (ii) レビュー時の可読性として「既存 (component 専用) → 追加 (共通)」の順が自然.
  - (iii) AC-4 のテスト assertion でも両方の含有を確認するだけで, 順序は問わない.

- **P-003 (CSS 直読みテスト = `extractRuleBody` ヘルパは BL-052 / BL-054 と同じパターンを再実装)**: 既存 `web/__tests__/task-card-design.test.ts` の `extractRuleBody` 関数を `project-chip.test.ts` でも同じ実装で使う. 共通モジュール化は本 BL のスコープに含めない (BL-054 plan D-008 と同じ判断).

- **P-004 (jsdom DOM レンダ assert は projects + tasks の最小フィクスチャで行う)**: `web/__tests__/project-chip-dom.test.tsx` 内で TodayView / TomorrowView をレンダリングするには TanStack Query / Repository / Router のセットアップが必要. 既存 `today-view.test.tsx` のセットアップ手順 (= QueryClientProvider / MemoryRouter / fake Repository) をそのまま踏襲する.

- **P-005 (chip テキスト内容の検証)**: AC-2 / AC-3 で chip のテキストが project name と一致することを assert する. これは `document.querySelectorAll('.project-chip')` を取得した上で, それぞれの `textContent` が projects 配列のいずれかの name と一致することを確認する. ProjectToggle 側 (起票フォーム内) の button も `.project-chip` を持つようになるため, querySelectorAll では起票フォーム内 button もヒットする. テストではタスクカード内 (`<li className="day-view__card">` 配下) に scope を絞って取得する (`document.querySelector('[aria-label="タスク一覧"] .project-chip')` 等).

- **P-006 (AC-5 「プロジェクト未設定タスクでは chip を出さない」の検証手順)**: テストでは projectId === null のタスクを含む tasks 配列を fixture として与え, レンダリング後にそのタスクの `<li>` を `getByText(task.name).closest('li')` 等で取得し, その内部に `.project-chip` が存在しないことを assert する. すなわち「カード単位の絶対パスで chip 不在を確認」する.

## リスク / 代替案

- **リスク R-1 (CSS 読み込み順による .project-toggle__button 後勝ち問題)**: 設計詳細 §「CSS カスケードと読み込み順」参照. テスト (className assert) では検出できないため, 手動視覚確認 T-013 で担保する. 二次対応は別 BL.
- **リスク R-2 (chip の高さが flex 行を膨らませる)**: `.project-chip` の `padding: var(--space-xs) var(--space-sm)` (= 4px 8px) + font-size 14px は, 高さ約 22-24px 程度. 既存 `.day-view__card` は `align-items: center` で flex 子を中央揃えにしているため, chip の高さが他要素 (タスク名 / 星 / button) と異なっても行高さは最大子の高さに揃う形で破綻しない. button (`min-height: 44px`) のほうが背が高いため, chip 追加で行高さが伸びることはない. リスク低.
- **リスク R-3 (既存 today-view.test.tsx / tomorrow-view.test.tsx の query 破壊)**: chip span が `<span>{task.name}</span>` の直前に追加される. 既存テストが `getByText(task.name)` / `findByText` 等で取得しているなら影響なし. ただし `firstChild` / `children[0]` 等のインデックスベース取得をしている箇所があると破壊される. plan T-008 で既存テストの query パターンを確認する.
- **リスク R-4 (focus-view への波及誤実装)**: `<span className="project-chip">` を focus-view (`/focus`) にも追加してしまう誤解釈の可能性. spec で「本 BL の対象は today / tomorrow + ProjectToggle のみ」と明示しているが, tasks 側にも「focus-view は触らない」を明記する (T-006).
- **リスク R-5 (UNCATEGORIZED_LABEL「（未分類）」をタスクカード側でも chip 化したくなる)**: ProjectToggle 側は「（未分類）」表示が既存仕様だが, タスクカード側で同じ表示を出すと chip の意味が薄まる. spec D-002 で「タスクカード側は非表示」を明示済み. 実装者が誤って `<span className="project-chip">（未分類）</span>` を出さないように tasks (T-002 / T-003) で明示する.
- **代替案 A-1 (.project-chip を新規共通 CSS ファイルに置く)**: 適用範囲が今回 day-view + ProjectToggle のみで, 全 view 共通化していないため不採用 (D-001). 将来余地は残す.
- **代替案 A-2 (`--radius-pill: 9999px` を tokens.css に追加して真の pill にする)**: `--radius-lg` で実用上 pill 形に見えるため不採用 (D-003). tokens.css の安定性を守る.
- **代替案 A-3 (ProjectToggle 専用 CSS を撤去して `.project-chip` 単独にする)**: cursor / min-height / focus-visible 等の振る舞いを失う. 不採用 (D-004). 将来余地は残す.
- **代替案 A-4 (タスクカード側を 3 段ゾーン構造化してから chip を入れる)**: BL-057 の対象. 本 BL は先行 BL として「視覚言語確立」のみ担当する境界線が user 合意済み. 不採用.
- **代替案 A-5 (chip のクリックでプロジェクトフィルタを開く)**: クリックインタラクション追加は本 BL の非ゴール. 純粋表示要素として実装する. 将来 BL の余地.

## テスト方針

> 全体方針は [`../../quality/test-catalog.md`](../../quality/test-catalog.md). 実行コマンドはルートからの `npm test` を基準とする (BL-055 vitest 集約未着手 / 過去 BL 慣行).

### 単体テスト (新規 / CSS 直読み)

新規ファイル `web/__tests__/project-chip.test.ts` を 1 つ作り, BL-052 / BL-054 と同じ「`readFileSync` で CSS を直接読んで宣言の存在を `expect(content).toMatch / toContain` で assert する」スタイルで spec AC-1 / AC-6 / AC-7 / AC-8 / AC-9 / AC-10 / AC-11 を機械検証する.

- **AC-1**: `web/src/ui/day-view/day-view.css` 内で `extractRuleBody(css, ".project-chip")` を取得し, 以下の宣言が含まれることを assert する:
  - `border: 1px solid var(--color-border)` (shorthand) または分解形.
  - `border-radius: var(--radius-lg)`.
  - `padding: var(--space-xs) var(--space-sm)` (= 2 つの token を同一宣言で参照する形).
  - `font-size: var(--font-size-small)`.
  - `color: var(--color-fg)`.

- **AC-6**: `web/src/styles/tokens.css` 内で本 BL 参照 6 トークン (`--color-border` / `--radius-lg` / `--space-xs` / `--space-sm` / `--font-size-small` / `--color-fg`) の宣言が残っていることを assert. 加えて `--radius-pill` や `--shadow-*` が混入していないことを assert.

- **AC-7**: `web/src/ui/day-view/day-view.css` 内の既存セレクタ (`.day-view` / `.day-view__header` / `.day-view__list` / `.day-view__empty` 等) のルール本文に本 BL での追記キーワード (`project-chip`) が含まれていないことを軽くスモーク. 厳密な不変性は git diff レビューで担保.

- **AC-8**: `web/src/ui/focus-view/focus-view.css` の全文に `project-chip` / `.day-view__card` キーワードが含まれないことを assert.

- **AC-9**: `web/src/ui/project-toggle/project-toggle.css` の全文に `.project-chip` セレクタが含まれない (= 専用 CSS を変更していない) ことを assert.

- **AC-10**: `web/src/ui/day-view/day-view.css` の全文に `box-shadow` キーワードが含まれないことを assert.

- **AC-11**: `.project-chip` ルール本文に `background` / `background-color` / `box-shadow` / `transition` / `animation` が含まれないこと, および day-view.css 全文に `.project-chip:hover` / `.project-chip:focus-visible` セレクタが含まれないことを assert.

### 単体テスト (新規 / jsdom DOM レンダ)

新規ファイル `web/__tests__/project-chip-dom.test.tsx` を 1 つ作り, jsdom + React Testing Library で AC-2 / AC-3 / AC-4 / AC-5 を検証する.

- **AC-2 (today)**:
  - `<TodayView />` をレンダリング. projects = `[{id: "p1", name: "Project Alpha"}]`. tasks = `[{id: "t1", name: "task1", projectId: "p1"}, {id: "t2", name: "task2", projectId: null}]`.
  - `document.querySelectorAll('.project-chip')` で要素を取得する. ProjectToggle 側 (起票フォーム内) の button も `.project-chip` を持つため, scope を `<ul aria-label="タスク一覧">` 配下に絞る (`document.querySelector('[aria-label="タスク一覧"]').querySelectorAll('.project-chip')`).
  - tasks 一覧内に 1 件 chip が存在し, その textContent が `"Project Alpha"` を含むことを assert.

- **AC-3 (tomorrow)**: AC-2 と同じパターンを `<TomorrowView />` で行う. scope は `<ul aria-label="明日のタスク一覧">`.

- **AC-4 (ProjectToggle)**:
  - `<ProjectToggle value={null} onChange={() => {}} projects={[]} />` を単独レンダリング.
  - `screen.getByRole('button')` で button 要素を取得.
  - `button.className` が `"project-chip"` を含み, かつ `"project-toggle__button"` も含むことを assert.

- **AC-5 (未設定タスクで chip 不在)**:
  - `<TodayView />` をレンダリング. tasks = `[{id: "t2", name: "task2", projectId: null}]`.
  - `screen.getByText('task2').closest('li')` を取得 (= 該当カード).
  - その内部から `querySelector('.project-chip')` を呼び, `null` であることを assert.

### 既存テスト追従

原則不要. 以下を念のため事前確認する (T-008):

- `web/__tests__/today-view.test.tsx`: タスクカードを `getByText(task.name)` / `findByText` で取得しているなら影響なし.
- `web/__tests__/tomorrow-view.test.tsx`: 同上.
- `web/__tests__/project-toggle.test.tsx`: button を `getByRole('button')` / `getByLabelText` で取得しているなら影響なし.

万一 `firstChild` / `children[N]` のインデックスベース取得があり, chip 追加で破壊される場合は plan で追従修正項目を追加する.

### E2E

不要. 既存 `e2e/*.spec.ts` は無改修. visual 差分は CSS 直読みテスト, DOM 表示は jsdom テストで担保する.

AC-13 (a11y violations 0 件維持) は既存 `e2e/a11y.spec.ts` が引き続き green で通れば満たされる. `.project-chip` は純粋表示 `<span>` または既存 `<button>` のため, ランドマーク / 見出し / aria 属性に影響しない.

### 回帰 (既存 green の維持)

- `web/__tests__/today-view.test.tsx` 全 describe ブロックが green.
- `web/__tests__/tomorrow-view.test.tsx` 全 describe ブロックが green.
- `web/__tests__/unified-day-view.test.tsx` (BL-051) 全 describe ブロックが green.
- `web/__tests__/task-card-design.test.ts` (BL-052) 全 describe ブロックが green.
- `web/__tests__/form-card-design.test.ts` (BL-054) 全 describe ブロックが green.
- `web/__tests__/design-tokens.test.ts` (BL-046) 全 describe ブロックが green.
- `web/__tests__/project-toggle.test.tsx` (BL-041) 全 describe ブロックが green.
- `e2e/a11y.spec.ts` の全スキャンで violations 0 件.
- `npm run lint -w web` / `npm run typecheck` が exit 0.
