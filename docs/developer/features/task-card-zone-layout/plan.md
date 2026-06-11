# 設計・実装計画: task-card-zone-layout

> [`spec.md`](spec.md) の要件 (REQ-1〜REQ-13) を, どう実現するかに落とす.

## 方針概要

`web/src/ui/day-view/day-view.css` の `.day-view__card` を縦並び (`flex-direction: column`) に切り替え, 角丸を `--radius-lg` に引き上げる. 同 CSS に新規 3 子クラス `.day-view__card__header` / `.day-view__card__title` / `.day-view__card__actions` を追加する.

`web/src/ui/today-view/today-view.tsx` と `web/src/ui/tomorrow-view/tomorrow-view.tsx` の各タスクカード JSX を, 既存子要素 (chip / タスク名 span / `<PriorityStars />` / 各 button) を**削除・改名せず** 3 つの新規 `<div>` で囲うだけの差分にする (NFR-DOM-ADDITIVE). aria-label / role / accessibleName / event handler は無変更.

tokens.css / focus-view.css / focus-view.tsx / `.day-view__form` / `.project-chip` は無改修. 既存テスト (task-card-design.test.ts の `align-items: center` assert および各 view test の DOM 構造仮定) のうち本 BL の差分で red になるものを追従修正する. 検証は CSS 直読み (BL-052 / BL-054 / BL-056 方式) と DOM レンダ (jsdom) を組み合わせる.

## 影響範囲

| 領域 | 変更内容 |
| --- | --- |
| API | 変更なし |
| DB | 変更なし |
| domain / Repository | 変更なし |
| サーバ | 変更なし |
| UI (CSS 改修) | `web/src/ui/day-view/day-view.css` の `.day-view__card` の `align-items` を `center` → `stretch` に変更, `flex-direction: column` を追加, `border-radius` を `var(--radius-md)` → `var(--radius-lg)` に変更. 新規 3 子クラス `.day-view__card__header` / `.day-view__card__title` / `.day-view__card__actions` を追加. |
| UI (CSS 不変) | `.day-view` / `.day-view__header` / `.day-view__header h1` / `.day-view__form` / `.day-view__list` / `.day-view__card--focus` / `.day-view__empty` / `.project-chip` のルール本文は無改修 (REQ-13). |
| UI (JSX 改修) | `web/src/ui/today-view/today-view.tsx` の `<section className="day-view__card day-view__card--focus">` と `<li className="day-view__card">` 内を 3 段構造に再構成. `web/src/ui/tomorrow-view/tomorrow-view.tsx` の `<li className="day-view__card">` 内も同様に再構成. |
| UI (JSX 不変) | `focus-view.tsx` / `projects-view.tsx` / `trash-view.tsx` / `settings-view.tsx` / `app.tsx` 等は無改修. |
| tokens.css | 変更なし (REQ-12 / D-001) |
| focus-view | 変更なし (REQ-11 / D-006) |
| テスト (新規) | `web/__tests__/task-card-zone-layout.test.ts` を 1 ファイル新設. CSS 直読み (AC-1 / AC-2 / AC-3 / AC-11 / AC-13 / AC-14 / AC-15) と DOM レンダ (AC-4 / AC-5 / AC-6 / AC-7 / AC-8 / AC-9 / AC-10 / AC-12) の両方を含む. |
| テスト (追従) | `web/__tests__/task-card-design.test.ts` (BL-052) の AC-1 の `align-items: center` assert / `border-radius: var(--radius-md)` assert を本 BL の値 (`align-items: stretch` / `border-radius: var(--radius-lg)`) に追従修正. その他 view test (today / tomorrow / unified-day-view / project-chip) は NFR-DOM-ADDITIVE 方針により多くは無修正で通る想定だが, 落ちたら最小修正する. |
| E2E | 既存 spec は role + accessibleName ロケータが多く, NFR-DOM-ADDITIVE で多くは無修正で通る想定 (D-007). 落ちる E2E があれば最小修正する. 新規 E2E は追加しない. |
| ドキュメント | backlog.md BL-057 の状態更新は本 BL 起票時には行わない (user 指示). 実装マージ後に別途. |

## 設計詳細

### day-view.css の改修内容

#### `.day-view__card` (改修)

BL-052 / BL-056 完了時点の宣言:

```css
.day-view__card {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-md);
}
```

本 BL の変更後:

```css
.day-view__card {
  /* BL-057: 3 段ゾーン構造のため縦並び + 子段は card 幅いっぱい. */
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: var(--space-md);
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  /* BL-057 D-001: chip と同じ角丸スケール (--radius-lg = 16px) に揃える. */
  border-radius: var(--radius-lg);
  padding: var(--space-md);
}
```

変更点:

- `flex-direction: column` を追加.
- `align-items: center` を `align-items: stretch` に変更.
- `border-radius: var(--radius-md)` を `border-radius: var(--radius-lg)` に変更.
- それ以外 (`display: flex` / `gap` / `background` / `border` / `padding`) は維持.

#### `.day-view__card--focus` (不変)

BL-052 で確定済みの宣言をそのまま維持:

```css
.day-view__card--focus {
  border-width: 2px;
  border-radius: var(--radius-lg);
  padding: var(--space-lg);
}
```

`.day-view__card` 側の `border-radius` を `--radius-lg` に上げたことで `.day-view__card--focus` の `border-radius: var(--radius-lg)` は「同値での上書き」になるが, セマンティクス維持のため撤去しない (REQ-10).

#### `.day-view__card__header` (新規 / REQ-2)

```css
.day-view__card__header {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}
```

- 上段 (chip 段).
- chip 未配置タスクでは空の `<div>` になるが, 段としては DOM 上に常に存在 (AC-10).
- 子要素 (chip) の縦中央揃え + 横並び.

#### `.day-view__card__title` (新規 / REQ-3)

```css
.day-view__card__title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-md);
}
```

- 中段 (タスク名 + 星の段).
- `justify-content: space-between` で「タスク名 (左) / 星 (右)」のレイアウト (D-005).
- tomorrow-view では星が無いため, タスク名のみが左寄せで配置される (= space-between でも子要素 1 つなら左に詰まる).

#### `.day-view__card__actions` (新規 / REQ-4)

```css
.day-view__card__actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-sm);
  flex-wrap: wrap;
}
```

- 下段 (アクションボタン段).
- `justify-content: flex-end` でカード右側に寄せる (D-004).
- `gap: var(--space-sm)` でボタン間隔を確保 (8px).
- `flex-wrap: wrap` で狭幅時の崩れを防ぐ (今日カードはアクション 4 ボタンで折り返す可能性あり).

### today-view.tsx の DOM 再構成

#### `focusedTask` セクション (REQ-5-1)

BL-056 完了時点 (今のファイル L447-475):

```tsx
<section aria-label="現在のタスク" className="day-view__card day-view__card--focus">
  <h2>現在のタスク</h2>
  <div>
    {focusedProject && <span className="project-chip">{focusedProject.name}</span>}
    <span>{focusedTask.name}</span>
    <PriorityStars .../>
    <button>削除</button>
    {focusedTask.origin !== "routine" && <button>明日にする / 今日にする</button>}
    <button>完了</button>
  </div>
</section>
```

本 BL 変更後:

```tsx
<section aria-label="現在のタスク" className="day-view__card day-view__card--focus">
  <h2>現在のタスク</h2>
  <div className="day-view__card__header">
    {focusedProject && <span className="project-chip">{focusedProject.name}</span>}
  </div>
  <div className="day-view__card__title">
    <span>{focusedTask.name}</span>
    <PriorityStars
      value={focusedTask.priority}
      onChange={(next) => handleSetPriority(focusedTask, next)}
      groupLabel={`${focusedTask.name} の優先度`}
      idPrefix={`task-${focusedTask.id}`}
    />
  </div>
  <div className="day-view__card__actions">
    <button type="button" onClick={() => handleDelete(focusedTask)}>削除</button>
    {focusedTask.origin !== "routine" && (
      <button type="button" onClick={() => handleToggleDueDate(focusedTask)}>
        {focusedTask.dueDate === "today" ? "明日にする" : "今日にする"}
      </button>
    )}
    <button type="button" onClick={() => handleComplete(focusedTask)}>完了</button>
  </div>
</section>
```

ポイント:

- 既存の `<div>` ラッパは廃止し, 直下に 3 つの `<div>` (header / title / actions) を並べる.
- `<h2>現在のタスク</h2>` は `<section>` の最初の子として現状維持 (= header 段の前).
- focused タスクには「現在のタスクにする」 button は無い (BL-043 / 既存実装通り).

#### `otherTasks` 一覧 (REQ-5-2)

BL-056 完了時点 (今のファイル L520-555):

```tsx
<li key={task.id} className="day-view__card">
  {project && <span className="project-chip">{project.name}</span>}
  <span>{task.name}</span>
  <PriorityStars .../>
  <button>現在のタスクにする</button>
  <button>削除</button>
  {task.origin !== "routine" && <button>明日にする / 今日にする</button>}
  <button>完了</button>
</li>
```

本 BL 変更後:

```tsx
<li key={task.id} className="day-view__card">
  <div className="day-view__card__header">
    {project && <span className="project-chip">{project.name}</span>}
  </div>
  <div className="day-view__card__title">
    <span>{task.name}</span>
    <PriorityStars
      value={task.priority}
      onChange={(next) => handleSetPriority(task, next)}
      groupLabel={`${task.name} の優先度`}
      idPrefix={`task-${task.id}`}
    />
  </div>
  <div className="day-view__card__actions">
    <button type="button" onClick={() => handleSetFocus(task.id)}>現在のタスクにする</button>
    <button type="button" onClick={() => handleDelete(task)}>削除</button>
    {task.origin !== "routine" && (
      <button type="button" onClick={() => handleToggleDueDate(task)}>
        {task.dueDate === "today" ? "明日にする" : "今日にする"}
      </button>
    )}
    <button type="button" onClick={() => handleComplete(task)}>完了</button>
  </div>
</li>
```

ポイント:

- 既存子要素は順序を変えず, 3 つの `<div>` で囲うだけ.
- 「現在のタスクにする」は actions 段の先頭 (= DOM 順では削除より前) に置く (D-004 / 既存順序維持).
- `task.origin !== "routine"` 条件付きの「明日にする/今日にする」 button は actions 段の中で条件分岐させる.

### tomorrow-view.tsx の DOM 再構成 (REQ-6)

BL-056 完了時点 (今のファイル L434-451):

```tsx
<li key={task.id} className="day-view__card">
  {project && <span className="project-chip">{project.name}</span>}
  <span>{task.name}</span>
  <button>削除</button>
  {task.origin !== "routine" && <button>今日にする</button>}
  <button>完了</button>
</li>
```

本 BL 変更後:

```tsx
<li key={task.id} className="day-view__card">
  <div className="day-view__card__header">
    {project && <span className="project-chip">{project.name}</span>}
  </div>
  <div className="day-view__card__title">
    <span>{task.name}</span>
  </div>
  <div className="day-view__card__actions">
    <button type="button" onClick={() => handleDelete(task)}>削除</button>
    {task.origin !== "routine" && (
      <button type="button" onClick={() => handleMoveToToday(task)}>今日にする</button>
    )}
    <button type="button" onClick={() => handleComplete(task)}>完了</button>
  </div>
</li>
```

ポイント:

- tomorrow-view は `<PriorityStars />` を持たない既存仕様なので, 中段はタスク名 `<span>` のみ.
- 「現在のタスクにする」も無い (= tomorrow ビューには BL-043 の操作対象が無い).
- actions 段は 3 ボタン (またはルーチン由来なら 2 ボタン).

### 期待される視覚的結果

- `/today` `/tomorrow` の各タスクカードがモックアップ通りの 3 段構造で表示される.
  - 上段: プロジェクト chip (なければ空段).
  - 中段: タスク名 (今日のみ星も並ぶ).
  - 下段: アクションボタン群 (今日: 4 ボタン or 3 ボタン / 明日: 3 ボタン or 2 ボタン).
- カードの角丸が `--radius-lg` (16px) となり, chip の角丸 (BL-056) と視覚的に同調する.
- 今日の現在タスク強調セクション (`.day-view__card--focus`) も同じ 3 段構造になり, border の太さ + padding の広さで通常カードと差別化される (BL-052 維持).
- `/focus` 単独ページの見た目は変わらない.

### 例外 / エラー処理

CSS と JSX の構造変更のみで, 例外発生経路は変わらない. 起票フォームの入力エラー表示 / ConflictDialog / notifyError / OptimisticLockError 経路は無改修.

### 処理フロー

データフロー (TanStack Query / useMutation / offline-queue / setFocus / ConflictDialog) は無改修. 本 BL の差分は DOM ツリーの**入れ子構造**と CSS の**レイアウト宣言**のみに限られる. event handler / state は変わらない.

## 重要な決定

spec の D 章 (D-001〜D-008) で確定済み. plan では追加の決定として以下を確定する:

- **P-001 (CSS 宣言順 = 構造系 → visual)**: `.day-view__card` ルール本文では「構造系 (display / flex-direction / align-items / gap) を上に, visual (background / border / border-radius / padding) を下に」並べる. これは BL-052 / BL-054 で確立した順序と一致させ, day-view.css 全体での記述スタイルを揃える.

- **P-002 (`align-items: center` → `align-items: stretch` の意図的変更)**: BL-052 / BL-051 で `.day-view__card` に与えていた `align-items: center` は「1 行水平配置時に子要素を上下中央に揃える」目的だった. 本 BL では縦並びになるため `align-items` は「各段 (子要素) の **横方向** の伸び幅」を制御するプロパティに変わる. `stretch` を採用することで各段が card 幅いっぱいに広がり, `.day-view__card__actions` の `justify-content: flex-end` (右寄せ) が card 右端まで届くようになる. `center` のままだと各段が中身の幅にしか広がらず, `justify-content: flex-end` が中身の幅内に閉じてしまい右寄せが card 右端に届かない.

- **P-003 (`<h2>現在のタスク</h2>` は header 段の前段として section 直下に維持)**: focused セクションの `<h2>` をどこに置くかの選択肢:
  - (i) `<section>` の最初の子として現状維持 (= 3 段の前).
  - (ii) `<div className="day-view__card__header">` の中に置く (= header 段の中身に).
  - (iii) 別の独立段 (新規クラス `.day-view__card__heading` 等) を作る.

  採用: (i). `<h2>` は section の見出しであり, 3 段ゾーンとは意味の階層が違う (= 段は「カードの中身の役割分担」, `<h2>` は「セクションの題名」). アクセシビリティ上も `<section aria-label="現在のタスク">` の中の `<h2>現在のタスク</h2>` は冗長気味だが既存仕様なので維持する. (ii) や (iii) は意味階層の混乱を招く. CSS 上は section 直下に `<h2>` + `<div>` × 3 が並ぶことになり, section の flex (= `.day-view__card` の column) で `<h2>` が最上段に, 続いて header / title / actions の 3 段が並ぶ.

- **P-004 (test ファイル分割 = 1 ファイルに集約)**: spec D-008 で 2 候補を挙げたが, `web/__tests__/task-card-zone-layout.test.ts` 1 ファイルに集約する.
  - CSS 直読み AC (1 / 2 / 3 / 11 / 13 / 14 / 15) と DOM レンダ AC (4 / 5 / 6 / 7 / 8 / 9 / 10) を同ファイルに `describe` ブロック単位で並べる.
  - DOM レンダ部分は `@vitest-environment jsdom` のディレクティブを使い, CSS 直読み部分は `@vitest-environment node` を局所的に指定するのが理想だが, vitest はファイル単位の environment しか持たないため, **本ファイル全体を jsdom 環境で実行**する (= CSS 直読みは jsdom 環境下でも問題なく動く).
  - 拡張子は `.test.tsx` ではなく `.test.ts` のまま. React コンポーネントを描画する箇所で JSX を使うため `.test.tsx` に変える選択肢もあるが, BL-052 (`task-card-design.test.ts`) / BL-054 (`form-card-design.test.ts`) と同じ `.test.ts` で揃える方が拡張子の意味が一貫する (= 「テスト設計者が用意する受け入れ基準テスト」). JSX を含めるなら拡張子は `.tsx` に変更する (= test-designer の判断に委ねる. 本 plan では `.ts` 推奨).

- **P-005 (extractRuleBody ヘルパは新規 test ファイル内に再定義)**: BL-052 / BL-054 と同じ方針. 共通モジュール化 (`web/__tests__/_helpers/extract-rule-body.ts` 等) は test ヘルパが 3 件以上揃ったタイミングで別 BL で検討する (YAGNI). 本 BL では task-card-zone-layout.test.ts 内に同等の実装を再定義する.

- **P-006 (task-card-design.test.ts 追従修正の最小化)**:
  - BL-052 の AC-1 で `.day-view__card` ルール本文に `align-items: center` を assert している箇所 (`web/__tests__/task-card-design.test.ts` L127 付近) を `align-items: stretch` に変更する.
  - BL-052 の AC-1 で `.day-view__card` ルール本文に `border-radius: var(--radius-md)` を assert している箇所 (L110 付近) を `border-radius: var(--radius-lg)` に変更する.
  - BL-052 の AC-1 では `flex-direction` の assert は無いが, 本 BL で追加した `flex-direction: column` を **task-card-design.test.ts 側にも追記する** か否か:
    - 採用: 追記しない. flex-direction は本 BL (zone-layout) の関心事項であり, task-card-design.test.ts は「BL-052 が確立した visual の不変性」を見るテストである. flex-direction の assert は task-card-zone-layout.test.ts 側に置く (= テストの責務分離).
  - その他 AC-2 / AC-3 / AC-4 / AC-5 / AC-6 / AC-7 / AC-8 / AC-9 / AC-10 は本 BL の差分の影響を受けない.

- **P-007 (今のリポジトリの test file の `.test.tsx` / `.test.ts` 混在の許容)**: today-view.test.tsx / tomorrow-view.test.tsx / project-chip.test.tsx は React Testing Library を使うため `.tsx`. task-card-design.test.ts / form-card-design.test.ts / design-tokens.test.ts は CSS 直読みのみで JSX 無しのため `.ts`. 本 BL の新規ファイルは DOM レンダを含むため**実装時に `.test.tsx` に変えるのが現実的**だが, 命名の意図 (= 「BL の受け入れ基準テスト」は `.test.ts` で揃える) を優先するか, 実装の現実 (= JSX 描画ありなら `.tsx`) を優先するかは test-designer の判断に委ねる. plan としては「JSX 描画ありなので **`.test.tsx` を推奨**する」に修正する.

- **P-008 (DOM レンダ assert の作り方 = render + container.querySelector)**: 既存の `web/__tests__/today-view.test.tsx` / `tomorrow-view.test.tsx` / `project-chip.test.tsx` で確立した
  - `QueryClientProvider` + `MemoryRouter` でラップして `<TodayView />` / `<TomorrowView />` を `render(...)` する,
  - `repository` / `projectRepository` のモックを inline で渡す (fake repository),
  - `container.querySelector(".day-view__card")` で <li> を取得し, さらに `.querySelector(".day-view__card__header")` 等で各段の存在を assert する.

  というスタイルを踏襲する. テスト用 fake repository の作成方法は project-chip.test.tsx の実装を参考に test-designer が用意する.

## リスク / 代替案

- **リスク R-1 (`align-items: center` を残したまま `flex-direction: column` を追加してしまう)**: 設計の意図 (= 各段が card 幅いっぱいに広がる) が成立せず, `justify-content: flex-end` (D-004) が機能しない. 緩和策: spec AC-1 で「`align-items: stretch` を含む / `align-items: center` を含まない」と明示し, 機械的に assert する.

- **リスク R-2 (新規 `<div>` 追加で既存 DOM クエリが壊れる)**: 既存テスト (今日/明日 view の test や E2E) が `<li className="day-view__card">` の直下子要素として button や chip を取得していると, 本 BL の `<div>` 入れ子で壊れる. 緩和策: NFR-DOM-ADDITIVE 方針 (既存子要素を削除/改名せず, `<div>` で囲うだけ) を守る. role + accessibleName クエリ (例: `getByRole("button", { name: "削除" })`) は引き続き機能する. 落ちるテストは個別に追従修正する (P-006).

- **リスク R-3 (`<h2>現在のタスク</h2>` の配置で aria 違反)**: focused セクションは `aria-label="現在のタスク"` を持つ section 内に `<h2>現在のタスク</h2>` がある. これは既存仕様だが a11y 観点では label と heading の重複. 本 BL では既存仕様維持 (P-003) するため新規違反は発生しないが, `<h2>` を 3 段の中に移動すると aria の流れが変わる可能性. 緩和策: P-003 で section 直下維持を確定.

- **リスク R-4 (`.day-view__card--focus` で `align-items: center` を期待している箇所がある)**: BL-052 の `.day-view__card--focus` ルール本文には `align-items` 関連の宣言は無い. `.day-view__card` の `align-items: stretch` をそのまま継承するため, focused カードでも 3 段が card 幅いっぱいに広がる. これは意図通り. 緩和策: 不要 (既存ルールに align-items 宣言が無いことを CSS 直読みで確認済み).

- **リスク R-5 (`.day-view__card__title` の `justify-content: space-between` が tomorrow-view で意図しない見えになる)**: tomorrow-view は中段にタスク名のみ (= 1 子要素) のため, space-between は左寄せに見える (1 子要素の場合 flex container は flex-start と同じ動き). 意図と一致. 緩和策: 不要.

- **リスク R-6 (`.day-view__card__header` の空段の高さ)**: chip 未配置タスクで header 段は空の `<div>` になる. `display: flex` + 子要素ゼロ = 高さ 0px. card の `gap: var(--space-md)` (= 16px) は隣接する段間 (= title 段との間) に効くため, 空段が DOM 上にあっても見た目への影響は最小 (= 上端の 16px gap 分の余白のみ).
  - 影響評価: 空 header 段の上に 16px の gap が残るが, これは card の上 padding (= 16px) と隣接する見え (= 計 32px 程度の上余白) になる. プロジェクト割り当て済みカードでは chip 段の高さ (~24px) + gap が同じく見える. 「chip 有無で card 全体の高さが ~24px 変わるが上余白が縮まないため違和感は少ない」見え.
  - 代替案: 空 header 段は条件付きでレンダリングしない (= `{project && <div className="day-view__card__header">...</div>}`). しかし AC-4 / AC-10 で「常に 3 段が DOM 上に存在する」と要求しており, 本 BL では空段でも常にレンダリングする方針.

- **代替案 A-1 (`flex-direction: column` を `.day-view__card` ではなく新規ラッパ `.day-view__card__body` に与える)**: 不採用. `.day-view__card` 自体を column にした方が JSX の入れ子が浅くなり, 既存 `<section>` / `<li>` のクラス維持と整合する.

- **代替案 A-2 (新規 3 子クラスを共通スタイルに抽出 `<Card />` コンポーネント化)**: 不採用. 抽出は将来 BL の余地. 本 BL は最小差分で 3 段化を実現する.

- **代替案 A-3 (`<header>` / `<footer>` セマンティック要素を使う)**: card 単位の `<header>` / `<footer>` は WHATWG HTML 仕様上は許容されるが, `<li>` 内に `<header>` / `<footer>` を入れる構造は今プロジェクトで前例がない. 既存方針 (`<div>` でレイアウト用ラッパを作る) に倣う方が一貫する. 不採用.

- **代替案 A-4 (`grid` レイアウト)**: `display: grid` + `grid-template-rows` で 3 段を表現する案. 採用しない理由:
  - flex の方が今プロジェクトの既存方針 (`.day-view` / `.day-view__list` 等) と一致.
  - 行数が固定 3 段で動的に増減しないため grid の利点が薄い.
  - flex-wrap (= actions の折り返し) は grid だと別途設定が必要.

- **代替案 A-5 (`text-align: center` でタスク名を中央寄せ)**: 不採用 (D-005 で確定済). 星との並列が崩れる.

- **代替案 A-6 (`justify-content: space-between` を actions に与えてボタンを両端寄せ)**: 不採用 (D-004 で確定済). 4 ボタンになる today で間隔が広がりすぎる.

## テスト方針

> 全体方針は [`../../quality/test-catalog.md`](../../quality/test-catalog.md).

### 単体テスト (新規)

新規ファイル `web/__tests__/task-card-zone-layout.test.tsx` (P-007 で `.tsx` 推奨に確定) を 1 つ作り, 以下を含む:

#### CSS 直読み (BL-052 / BL-054 / BL-056 と同方式)

- **AC-1**: `.day-view__card` ルール本文に `display: flex` / `flex-direction: column` / `align-items: stretch` / `gap: var(--space-md)` / `background: var(--color-bg)` / `border: 1px solid var(--color-border)` / `padding: var(--space-md)` の各宣言が含まれる. かつ `align-items: center` は含まれない.
- **AC-2**: `.day-view__card` ルール本文に `border-radius: var(--radius-lg)` が含まれる. かつ `border-radius: var(--radius-md)` は含まれない.
- **AC-3**: `.day-view__card__header` / `.day-view__card__title` / `.day-view__card__actions` の各セレクタが day-view.css に定義されている. 各ルール本文に `display: flex` が含まれる. `.day-view__card__actions` ルール本文に `justify-content: flex-end` が含まれる.
- **AC-11**: tokens.css に `--radius-lg` / `--space-md` / `--space-sm` が引き続き定義されている. かつ `--radius-xl` のような本 BL では追加すべきでない token が存在しない.
- **AC-13**: 他セレクタ (`.day-view` / `.day-view__header` / `.day-view__header h1` / `.day-view__form` / `.day-view__list` / `.day-view__empty` / `.project-chip`) のルール本文が BL-056 完了時点と同じ (= 本 BL での追加宣言が無い).
  - 注: `.day-view__form` は BL-054 で visual を持つため「BL-054 完了時点の宣言が変わっていない」ことを assert する (= 本 BL で再装飾しない).
- **AC-14**: day-view.css 全体に `box-shadow` キーワードが含まれない.
- **AC-15**: 新規 3 子クラスのルール本文に `box-shadow` / `transition` / `animation` の宣言が含まれない. かつ `.day-view__card__header:hover` 等の派生セレクタが CSS 内に存在しない.

#### DOM レンダ (jsdom + render + container.querySelector)

事前準備として `TodayView` / `TomorrowView` を render するための fake repository / fake projectRepository / `QueryClientProvider` / `MemoryRouter` のラップを今日 / 明日 view の既存 test (today-view.test.tsx / tomorrow-view.test.tsx / project-chip.test.tsx) から組み立てる.

- **AC-4**: `<TodayView />` を render し, タスク 1 件以上で `<li class="day-view__card">` 内に `.day-view__card__header` / `.day-view__card__title` / `.day-view__card__actions` の 3 子要素が DOM 上に存在する.
- **AC-5**: `<TomorrowView />` を render し, タスク 1 件以上で同様に 3 子要素が存在する.
- **AC-6**: `<TodayView />` で `.day-view__card__actions` 内に「削除」「明日にする」「完了」の 3 button が存在する.
- **AC-7**: `<TodayView />` で `.day-view__card__actions` 内に「現在のタスクにする」 button が存在する. かつ `.day-view__card__header` / `.day-view__card__title` には「現在のタスクにする」 button が存在しない.
- **AC-8**: `<TodayView />` で `.day-view__card__title` 内に `role="radiogroup"` 要素 (= `<PriorityStars />`) が存在する. かつ header / actions 段には radiogroup が存在しない.
- **AC-9**: `<TodayView />` で project 割り当て済みタスクのカード内 `.day-view__card__header` の中に `.project-chip` が存在する. かつ title / actions 段には `.project-chip` が存在しない.
- **AC-10**: `<TodayView />` で `projectId === null` のタスクのカード内 `.day-view__card__header` 要素は存在する (= null ではない) が, その中に `.project-chip` は無い.
- **AC-12**: `web/src/ui/focus-view/focus-view.css` と `web/src/ui/focus-view/focus-view.tsx` が BL-056 完了時点と同じ (= 本 BL で差分が無い). 検証は文字列比較ではなく「focus-view.css に `.day-view__card__header` / `.day-view__card__title` / `.day-view__card__actions` セレクタが含まれない」「focus-view.tsx に `day-view__card__` 文字列が含まれない」のスモークで代替する.

### 単体テスト (追従修正)

- **`web/__tests__/task-card-design.test.ts` (BL-052)**:
  - AC-1 ブロックで `align-items: center` を assert している箇所 (現在の L127 付近) を `align-items: stretch` に変更する.
  - AC-1 ブロックで `border-radius: var(--radius-md)` を assert している箇所 (現在の L110 付近) を `border-radius: var(--radius-lg)` に変更する.
  - AC-7 の `OTHER_SELECTORS` 配列には新規 3 子クラスは含まないため変更不要.
  - 他 AC は影響なし.

- **`web/__tests__/today-view.test.tsx` / `tomorrow-view.test.tsx` / `unified-day-view.test.tsx` / `project-chip.test.tsx`**:
  - role + accessibleName クエリ (例: `getByRole("button", { name: "削除" })`) は NFR-DOM-ADDITIVE 方針により無修正で動作する想定.
  - `container.querySelector("li.day-view__card > button")` のように `<li>` 直下子要素を見ているテストがあれば, `<li> .day-view__card__actions > button` または `<li> button` (子孫) に書き換える.
  - 実装時に red になった test のみ最小修正する (= 事前に網羅的な調査は不要 / TDD で個別対応).

### E2E

既存 spec は無改修方針. `page.getByRole("button", { name: "削除" })` 等の role + accessibleName ロケータは NFR-DOM-ADDITIVE で引き続き動作する. 落ちる E2E があれば最小修正する (= 事前に網羅的な調査は不要).

`e2e/a11y.spec.ts` (AC-18) は引き続き green で通れば満たされる. 本 BL の差分は新規 `<div>` 追加 + CSS 追記のみで, ランドマーク / 見出し / aria 属性に影響しない.

### 回帰 (既存 green の維持)

- `web/__tests__/today-view.test.tsx` 全 describe ブロックが green.
- `web/__tests__/tomorrow-view.test.tsx` 全 describe ブロックが green.
- `web/__tests__/unified-day-view.test.tsx` (BL-051) 全 describe ブロックが green.
- `web/__tests__/task-card-design.test.ts` (BL-052) 追従修正後に全 describe ブロックが green.
- `web/__tests__/form-card-design.test.ts` (BL-054) 全 describe ブロックが green.
- `web/__tests__/project-chip.test.tsx` (BL-056) 全 describe ブロックが green.
- `web/__tests__/design-tokens.test.ts` (BL-046) 全 describe ブロックが green.
- `e2e/a11y.spec.ts` の全スキャンで violations 0 件.
- `npm run lint -w web` / `npm run typecheck` が exit 0.
